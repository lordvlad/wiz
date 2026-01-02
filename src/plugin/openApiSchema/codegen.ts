import { TypeFlags, Node, Symbol, SymbolFlags, Type, TypeNode, EnumDeclaration } from "ts-morph";

import type { BigIntFormatType, NumFormatType, StrFormatType } from "../../tags";

type SchemaSettings = {
    coerceSymbolsToStrings?: boolean;
    transformDate?: (type: Type) => unknown;
    unionStyle?: "oneOf" | "anyOf";
    openApiVersion?: "3.0" | "3.1";
};

type SchemaContext = {
    nodeText?: string;
    settings?: SchemaSettings;
    declaration?: Node;
    typeNode?: Node;
    availableTypes?: Set<string>;
    processingStack?: Set<string>;
    typeAliasDeclaration?: Node;
};

type JSDocMetadata = {
    description?: string;
    default?: any;
    example?: string;
    deprecated?: boolean;
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: number;
    exclusiveMaximum?: number;
    multipleOf?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    format?: string;
};

export function createOpenApiSchema(type: Type, context: SchemaContext = {}): unknown {
    const settings = context.settings ?? {};
    const availableTypes = context.availableTypes ?? new Set<string>();
    const processingStack = context.processingStack ?? new Set<string>();

    // Check if this type should use a $ref
    // We use $ref if the type is in availableTypes (to reference another schema)
    // We ALSO use $ref if the type is already in processingStack (to avoid infinite recursion for circular refs)
    const refName = shouldUseRef(type, availableTypes, processingStack);
    if (refName) {
        return { $ref: `#/components/schemas/${refName}` };
    }

    if (type.isUnion()) {
        const unionTypes = type.getUnionTypes();
        const hasExplicitNull = unionTypes.some((t) => isExplicitlyNull(t));
        const narrowed = unionTypes.filter((t) => !isNullable(t));

        if (narrowed.length === 1) {
            const schema = createOpenApiSchema(narrowed[0]!, { ...context, availableTypes, processingStack });
            if (hasExplicitNull && typeof schema === "object" && schema !== null && !Array.isArray(schema)) {
                return makeNullable(schema, settings.openApiVersion);
            }
            return schema;
        }
        if (narrowed.length > 1 && narrowed.every((t) => t.isBooleanLiteral())) {
            const baseSchema: any = { type: "boolean" };
            if (hasExplicitNull) {
                return makeNullable(baseSchema, settings.openApiVersion);
            }
            return baseSchema;
        }

        // Check for string literal unions
        if (narrowed.length > 1 && narrowed.every((t) => t.isStringLiteral())) {
            const enumValues = narrowed
                .map((t) => t.getLiteralValue())
                .filter((v): v is string => typeof v === "string");
            // Ensure all literal values were extracted successfully
            if (enumValues.length === narrowed.length) {
                const baseSchema: any = { type: "string", enum: enumValues };
                if (hasExplicitNull) {
                    return makeNullable(baseSchema, settings.openApiVersion);
                }
                return baseSchema;
            }
        }

        // Check for number literal unions
        if (narrowed.length > 1 && narrowed.every((t) => t.isNumberLiteral())) {
            const enumValues = narrowed
                .map((t) => t.getLiteralValue())
                .filter((v): v is number => typeof v === "number");
            // Ensure all literal values were extracted successfully
            if (enumValues.length === narrowed.length) {
                const baseSchema: any = { type: "number", enum: enumValues };
                if (hasExplicitNull) {
                    return makeNullable(baseSchema, settings.openApiVersion);
                }
                return baseSchema;
            }
        }

        // Handle complex type unions (oneOf or anyOf)
        if (narrowed.length > 1) {
            // Collapse boolean literals (true | false) into a single boolean type
            const booleanLiterals = narrowed.filter((t) => t.isBooleanLiteral());
            const hasBothBooleans = booleanLiterals.length === 2;

            let typesToProcess = narrowed;
            if (hasBothBooleans) {
                // Both true and false are present, replace them with a single boolean type
                typesToProcess = narrowed.filter((t) => !t.isBooleanLiteral());
                // We'll add the boolean schema manually below
            }

            const schemas = typesToProcess.map((t) =>
                createOpenApiSchema(t, {
                    ...context,
                    availableTypes,
                    processingStack,
                }),
            );

            // If we had both boolean literals, add a single boolean schema
            if (hasBothBooleans) {
                schemas.push({ type: "boolean" });
            }

            // Detect discriminator for oneOf/anyOf schemas
            // Use narrowed (not typesToProcess) to include all original types for detection
            const discriminator = detectDiscriminator(narrowed, availableTypes);

            // Use unionStyle from settings, defaulting to "oneOf"
            const unionKeyword = settings.unionStyle ?? "oneOf";

            const result: any = { [unionKeyword]: schemas };
            if (discriminator) {
                result.discriminator = discriminator;
            }
            if (hasExplicitNull) {
                return makeNullable(result, settings.openApiVersion);
            }

            return result;
        }
    }

    // Handle intersection types (allOf)
    if (type.isIntersection()) {
        const intersectionTypes = type.getIntersectionTypes();
        const schemas = intersectionTypes.map((t) =>
            createOpenApiSchema(t, {
                ...context,
                availableTypes,
                processingStack,
            }),
        );
        return { allOf: schemas };
    }

    // Check for enum types
    const symbol = type.getSymbol();
    if (symbol) {
        const declarations = symbol.getDeclarations();
        if (declarations && declarations.length > 0) {
            for (const declaration of declarations) {
                if (Node.isEnumDeclaration(declaration)) {
                    return createEnumSchema(declaration, type);
                }
            }
        }
    }

    if (isBigIntFormat(type, context.nodeText)) return createSchemaForBigInt(type, context.nodeText);

    if (isNumFormat(type, context.nodeText)) return createSchemaForNumberFormat(type, context.nodeText);

    if (isStrFormat(type, context.nodeText)) return createSchemaForStrFormat(type, context.nodeText);

    if (isSymbolType(type)) {
        if (settings.coerceSymbolsToStrings) return { type: "string" };
        throw new Error("Symbol types require 'coerceSymbolsToStrings' to be enabled.");
    }

    if (isDateType(type)) {
        const customSchema = settings.transformDate?.(type);
        if (customSchema !== undefined) return customSchema;
        return { type: "string", format: "date-time" };
    }

    // Handle string literal types (e.g., "circle", "square")
    if (type.isStringLiteral()) {
        return { type: "string", enum: [type.getLiteralValue()] };
    }

    // Handle number literal types
    if (type.isNumberLiteral()) {
        return { type: "number", enum: [type.getLiteralValue()] };
    }

    // Handle boolean literal types (true, false)
    // Note: type.getLiteralValue() returns undefined for boolean literals,
    // so we use getText() to determine the value
    if (type.isBooleanLiteral()) {
        const value = type.getText() === "true";
        return { type: "boolean", enum: [value] };
    }

    if (type.isString()) return { type: "string" };

    if (type.isNumber()) return { type: "number" };

    if (type.isBoolean()) return { type: "boolean" };

    if (type.isArray())
        return {
            type: "array",
            // Array items are anonymous, don't pass typeName
            items: createOpenApiSchema(type.getArrayElementTypeOrThrow(), {
                ...context,
                settings: context.settings,
                availableTypes,
                processingStack,
            }),
        };

    if (type.isObject() && !type.isArray() && !type.isInterface() && !type.isClass()) {
        // Get the type name to add to processing stack
        const aliasSymbol = type.getAliasSymbol();
        let currentTypeName: string | undefined = aliasSymbol?.getName();
        if (!currentTypeName) {
            const symbol = type.getSymbol();
            currentTypeName = symbol?.getName();
        }

        // Create a new processing stack that includes the current type
        // This prevents infinite recursion for circular references
        const newProcessingStack = new Set(processingStack);
        if (currentTypeName && currentTypeName !== "__type" && availableTypes.has(currentTypeName)) {
            newProcessingStack.add(currentTypeName);
        }

        const properties: Record<string, any> = {};
        const required: string[] = [];

        type.getProperties().forEach((prop) => {
            const declaration = prop.getDeclarations()[0];
            if (!declaration) return;

            // Skip properties marked with @private, @ignore, or @package
            if (shouldExcludeFromSchema(declaration)) {
                return;
            }

            const propType = declaration.getType();
            const typeNode =
                Node.isPropertySignature(declaration) || Node.isPropertyDeclaration(declaration)
                    ? declaration.getTypeNode()
                    : undefined;

            // Create base schema
            // Note: We don't pass typeNode to nested objects - they are anonymous inline types
            let propSchema = createOpenApiSchema(propType, {
                settings: context.settings,
                nodeText: typeNode?.getText(),
                declaration,
                availableTypes,
                processingStack: newProcessingStack,
            });

            // Extract and merge JSDoc metadata
            const jsDocMetadata = extractJSDocMetadata(declaration);
            if (typeof propSchema === "object" && propSchema !== null) {
                propSchema = mergeJSDocIntoSchema(propSchema as Record<string, any>, jsDocMetadata);
            }

            properties[prop.getName()] = propSchema;

            if (!isOptionalProperty(prop, declaration)) {
                required.push(prop.getName());
            }
        });

        const baseSchema: Record<string, any> = {
            type: "object",
            ...(Object.keys(properties).length > 0 ? { properties } : {}),
            ...(context.typeNode ? { title: context.typeNode.getText() } : {}),
        };

        if (required.length > 0) baseSchema.required = required;

        // Extract and merge JSDoc metadata from type alias declaration
        const schema = context.typeAliasDeclaration
            ? mergeJSDocIntoSchema(baseSchema, extractJSDocMetadata(context.typeAliasDeclaration))
            : baseSchema;

        // Handle index signatures (additionalProperties)
        const stringIndexType = type.getStringIndexType();
        if (stringIndexType) {
            // Check if this is `any` type using TypeFlags for robust detection
            const flags = stringIndexType.getFlags();
            if ((flags & TypeFlags.Any) !== 0) {
                schema.additionalProperties = true;
            } else {
                // Generate schema for the index signature value type
                schema.additionalProperties = createOpenApiSchema(stringIndexType, {
                    settings: context.settings,
                    availableTypes,
                    processingStack: newProcessingStack,
                });
            }
        }

        return schema;
    }
    throw new Error(`Unsupported type: ${type.getText()}`);
}

function isBigIntFormat(type: Type, nodeText?: string) {
    return hasFormatAlias(type, "BigIntFormat") || nodeText?.includes("BigIntFormat");
}

function isNumFormat(type: Type, nodeText?: string) {
    return hasFormatAlias(type, "NumFormat") || nodeText?.includes("NumFormat");
}

function isStrFormat(type: Type, nodeText?: string) {
    return hasFormatAlias(type, "StrFormat") || nodeText?.includes("StrFormat");
}

function hasFormatAlias(type: Type, name: string) {
    const alias = type.getAliasSymbol();
    if (alias && alias.getName() === name) return true;

    const symbol = type.getSymbol();
    if (symbol && symbol.getName() === name) return true;

    return type.getText().includes(name);
}

function createSchemaForBigInt(type: Type, nodeText?: string) {
    const formatValue =
        getFormatLiteral<BigIntFormatType>(type) ?? extractFormatFromText<BigIntFormatType>(nodeText, "BigIntFormat");

    if (formatValue === "int64") return { type: "integer", format: "int64" };

    if (formatValue === "string") return { type: "string" };

    throw new Error(`BigIntFormat requires a format. Received: ${type.getText()}`);
}

function createSchemaForNumberFormat(type: Type, nodeText?: string) {
    const formatValue =
        getFormatLiteral<NumFormatType>(type) ?? extractFormatFromText<NumFormatType>(nodeText, "NumFormat");

    if (!formatValue) return { type: "number" };

    if (formatValue === "string") return { type: "string" };

    if (formatValue === "int32" || formatValue === "int64") return { type: "integer", format: formatValue };

    if (formatValue === "float" || formatValue === "double") return { type: "number", format: formatValue };

    return { type: "number" };
}

function createSchemaForStrFormat(type: Type, nodeText?: string) {
    const formatValue =
        getFormatLiteral<StrFormatType>(type) ?? extractFormatFromText<StrFormatType>(nodeText, "StrFormat");

    if (!formatValue) return { type: "string" };

    // All StrFormat types map to string with format field
    return { type: "string", format: formatValue };
}

function isOptionalProperty(symbol: Symbol, declaration: Node) {
    if (symbol.hasFlags(SymbolFlags.Optional)) return true;

    if (Node.isPropertySignature(declaration) || Node.isPropertyDeclaration(declaration))
        if (declaration.hasQuestionToken()) return true;

    return false;
}

function isNullable(type: Type) {
    if (type.isUndefined() || type.isNull()) return true;

    return ["undefined", "null"].includes(type.getText());
}

function isExplicitlyNull(type: Type) {
    if (type.isNull()) return true;

    return type.getText() === "null";
}

/**
 * Adds nullable handling to a schema based on OpenAPI version.
 * - OpenAPI 3.0: adds `nullable: true` property
 * - OpenAPI 3.1:
 *   - For simple types: wraps type in an array with "null" (e.g., type: ["string", "null"])
 *   - For oneOf/anyOf: adds { type: "null" } to the array
 */
function makeNullable(schema: any, openApiVersion: "3.0" | "3.1" = "3.0"): any {
    if (openApiVersion === "3.1") {
        // OpenAPI 3.1: use type arrays or add null schema
        if (typeof schema === "object" && schema !== null && !Array.isArray(schema)) {
            // For oneOf/anyOf schemas, add { type: "null" } to the array
            if (schema.oneOf) {
                return { ...schema, oneOf: [...schema.oneOf, { type: "null" }] };
            }
            if (schema.anyOf) {
                return { ...schema, anyOf: [...schema.anyOf, { type: "null" }] };
            }

            // For regular schemas with a type field
            const currentType = schema.type;
            if (currentType) {
                // If type is already an array, add "null" to it
                if (Array.isArray(currentType)) {
                    return { ...schema, type: [...currentType, "null"] };
                }
                // Otherwise, create an array with the current type and "null"
                return { ...schema, type: [currentType, "null"] };
            }
        }
        return schema;
    } else {
        // OpenAPI 3.0: use nullable property
        if (typeof schema === "object" && schema !== null && !Array.isArray(schema)) {
            return { ...schema, nullable: true };
        }
        return schema;
    }
}

function isDateType(type: Type) {
    const symbol = type.getSymbol();
    if (symbol && symbol.getName() === "Date") return true;

    const apparentSymbol = type.getApparentType().getSymbol();
    if (apparentSymbol && apparentSymbol.getName() === "Date") return true;

    ["Date", "globalThis.Date"].includes(type.getText());
}

function isSymbolType(type: Type) {
    const flags = type.getFlags();
    if ((flags & TypeFlags.ESSymbol) !== 0 || (flags & TypeFlags.UniqueESSymbol) !== 0) return true;

    return ["symbol", "unique symbol"].includes(type.getText());
}

function getFormatLiteral<T extends string>(type: Type): T | undefined {
    const aliasArgs = type.getAliasTypeArguments?.();
    if (aliasArgs && aliasArgs.length > 0) {
        const literal = aliasArgs[0]?.getLiteralValue?.();
        if (typeof literal === "string") return literal as T;
    }

    const typeArgs = type.getTypeArguments?.();
    if (typeArgs && typeArgs.length > 0) {
        const literal = typeArgs[0]?.getLiteralValue?.();
        if (typeof literal === "string") return literal as T;
    }

    return undefined;
}

export function extractJSDocMetadata(node?: Node): JSDocMetadata {
    const metadata: JSDocMetadata = {};

    if (!node) return metadata;

    // Check if node supports JSDoc
    const jsDocableNode = node as any;
    if (typeof jsDocableNode.getJsDocs !== "function") {
        return metadata;
    }

    const jsDocs = jsDocableNode.getJsDocs();
    if (!jsDocs || jsDocs.length === 0) return metadata;

    for (const jsDoc of jsDocs) {
        // Get description from comment text (before any tags)
        const description = jsDoc.getDescription?.();
        if (description && !metadata.description) {
            metadata.description = description.trim();
        }

        // Process tags
        const tags = jsDoc.getTags?.() || [];
        for (const tag of tags) {
            const tagName = tag.getTagName();
            const comment = tag.getComment?.();
            const commentText = typeof comment === "string" ? comment.trim() : "";

            switch (tagName) {
                case "description":
                    if (commentText && !metadata.description) {
                        metadata.description = commentText;
                    }
                    break;
                case "default":
                    if (commentText) {
                        metadata.default = parseJSDocValue(commentText);
                    }
                    break;
                case "example":
                    if (commentText) {
                        metadata.example = parseJSDocValue(commentText);
                    }
                    break;
                case "deprecated":
                    metadata.deprecated = true;
                    break;
                case "minimum":
                case "min":
                    if (commentText) {
                        const num = parseFloat(commentText);
                        if (!isNaN(num)) metadata.minimum = num;
                    }
                    break;
                case "maximum":
                case "max":
                    if (commentText) {
                        const num = parseFloat(commentText);
                        if (!isNaN(num)) metadata.maximum = num;
                    }
                    break;
                case "exclusiveMinimum":
                    if (commentText) {
                        const num = parseFloat(commentText);
                        if (!isNaN(num)) metadata.exclusiveMinimum = num;
                    }
                    break;
                case "exclusiveMaximum":
                    if (commentText) {
                        const num = parseFloat(commentText);
                        if (!isNaN(num)) metadata.exclusiveMaximum = num;
                    }
                    break;
                case "multipleOf":
                    if (commentText) {
                        const num = parseFloat(commentText);
                        if (!isNaN(num) && num > 0) metadata.multipleOf = num;
                    }
                    break;
                case "minLength":
                    if (commentText) {
                        const num = parseInt(commentText, 10);
                        if (!isNaN(num)) metadata.minLength = num;
                    }
                    break;
                case "maxLength":
                    if (commentText) {
                        const num = parseInt(commentText, 10);
                        if (!isNaN(num)) metadata.maxLength = num;
                    }
                    break;
                case "pattern":
                    if (commentText) {
                        metadata.pattern = commentText;
                    }
                    break;
                case "format":
                    if (commentText) {
                        metadata.format = commentText;
                    }
                    break;
            }
        }
    }

    return metadata;
}

function shouldExcludeFromSchema(node?: Node): boolean {
    if (!node) return false;

    // Check if node supports JSDoc
    const jsDocableNode = node as any;
    if (typeof jsDocableNode.getJsDocs !== "function") {
        return false;
    }

    const jsDocs = jsDocableNode.getJsDocs();
    if (!jsDocs || jsDocs.length === 0) return false;

    for (const jsDoc of jsDocs) {
        const tags = jsDoc.getTags?.() || [];
        for (const tag of tags) {
            const tagName = tag.getTagName();
            // Exclude fields marked with @private, @ignore, or @package
            if (tagName === "private" || tagName === "ignore" || tagName === "package") {
                return true;
            }
        }
    }

    return false;
}

function parseJSDocValue(value: string): any {
    value = value.trim();

    // Try to parse as JSON first (handles objects, arrays, and primitives)
    try {
        return JSON.parse(value);
    } catch {
        // Not valid JSON, continue with other parsing
    }

    // Try to parse as boolean
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "null") return null;

    // Try to parse as number
    const num = Number(value);
    if (!isNaN(num) && value !== "") return num;

    // Remove quotes if it's a quoted string
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1);
    }

    return value;
}

export function mergeJSDocIntoSchema(schema: Record<string, any>, metadata: JSDocMetadata): Record<string, any> {
    const result = { ...schema };

    if (metadata.description !== undefined) {
        result.description = metadata.description;
    }
    if (metadata.default !== undefined) {
        result.default = metadata.default;
    }
    if (metadata.example !== undefined) {
        result.example = metadata.example;
    }
    if (metadata.deprecated === true) {
        result.deprecated = true;
    }
    if (metadata.minimum !== undefined) {
        result.minimum = metadata.minimum;
    }
    if (metadata.maximum !== undefined) {
        result.maximum = metadata.maximum;
    }
    if (metadata.exclusiveMinimum !== undefined) {
        result.exclusiveMinimum = metadata.exclusiveMinimum;
    }
    if (metadata.exclusiveMaximum !== undefined) {
        result.exclusiveMaximum = metadata.exclusiveMaximum;
    }
    if (metadata.multipleOf !== undefined) {
        result.multipleOf = metadata.multipleOf;
    }
    if (metadata.minLength !== undefined) {
        result.minLength = metadata.minLength;
    }
    if (metadata.maxLength !== undefined) {
        result.maxLength = metadata.maxLength;
    }
    if (metadata.pattern !== undefined) {
        result.pattern = metadata.pattern;
    }
    if (metadata.format !== undefined && !result.format) {
        // Only override format if not already set by type analysis
        result.format = metadata.format;
    }

    return result;
}

function createEnumSchema(
    declaration: EnumDeclaration,
    type: Type,
): { type: "string" | "number"; enum: (string | number)[] } {
    const members = declaration.getMembers();

    // Handle empty enums
    if (members.length === 0) {
        throw new Error(`Enum ${declaration.getName()} has no members`);
    }

    const enumValues: (string | number)[] = [];
    let enumType: "string" | "number" | null = null;

    for (const member of members) {
        const initializer = member.getInitializer();
        if (initializer) {
            // Has explicit value
            if (Node.isStringLiteral(initializer)) {
                const value = initializer.getLiteralValue();
                enumValues.push(value);
                if (enumType === null) {
                    enumType = "string";
                } else if (enumType !== "string") {
                    throw new Error(`Mixed enum types are not supported: ${type.getText()}`);
                }
            } else if (Node.isNumericLiteral(initializer)) {
                const value = initializer.getLiteralValue();
                enumValues.push(value);
                if (enumType === null) {
                    enumType = "number";
                } else if (enumType !== "number") {
                    throw new Error(`Mixed enum types are not supported: ${type.getText()}`);
                }
            } else {
                throw new Error(`Complex enum initializers are not supported: ${type.getText()}`);
            }
        } else {
            // Auto-incremented numeric enum member
            // TypeScript enums without explicit initializers are auto-incremented starting at 0
            // member.getValue() returns the computed constant value for the enum member.
            // If getValue() returns undefined or non-numeric, the enum cannot be statically analyzed
            const value = member.getValue();
            if (typeof value === "number") {
                enumValues.push(value);
                if (enumType === null) {
                    enumType = "number";
                } else if (enumType !== "number") {
                    throw new Error(`Mixed enum types are not supported: ${type.getText()}`);
                }
            } else {
                throw new Error(
                    `Enum member ${member.getName()} has unexpected non-numeric value (${JSON.stringify(value)}): ${type.getText()}`,
                );
            }
        }
    }

    // enumType is guaranteed to be non-null since we have at least one member
    return { type: enumType!, enum: enumValues };
}

function extractFormatFromText<T extends string>(text: string | undefined, alias: string): T | undefined {
    if (!text) return undefined;

    const pattern = new RegExp(`${alias}<\s*"([^"]+)"`, "i");
    const match = text.match(pattern);
    if (!match) return undefined;

    return match[1] as T;
}

/**
 * Determines if a type should be represented as a $ref to a schema in components.schemas
 * Returns the type name if it should use a $ref, or undefined if it should be inlined
 */
function shouldUseRef(type: Type, availableTypes: Set<string>, processingStack: Set<string>): string | undefined {
    // Don't use $ref for primitive types or arrays
    // Arrays are handled separately - their element types may use $ref
    if (type.isString() || type.isNumber() || type.isBoolean() || type.isArray()) {
        return undefined;
    }

    // Get the type name from the alias symbol
    const aliasSymbol = type.getAliasSymbol();
    let typeName: string | undefined = aliasSymbol?.getName();

    // Fallback to regular symbol if no alias
    if (!typeName) {
        const symbol = type.getSymbol();
        typeName = symbol?.getName();
    }

    if (!typeName || typeName === "__type") {
        return undefined;
    }

    // Use $ref if this type is in availableTypes, with special handling for root level vs nested
    if (availableTypes.has(typeName)) {
        // If already in processing stack, we're in a circular reference - emit $ref to avoid infinite recursion
        if (processingStack.has(typeName)) {
            return typeName;
        }
        // If in availableTypes but not in processingStack, only emit $ref if we're nested (not at root level)
        // Root level is indicated by an empty processingStack
        if (processingStack.size > 0) {
            return typeName;
        }
    }

    return undefined;
}

/**
 * Detects if a union has a discriminator property and returns discriminator metadata
 * A discriminator is detected when all union members:
 * 1. Are object types
 * 2. Share a common property with the same name
 * 3. That property has different literal string/number values in each member
 */
function detectDiscriminator(
    unionTypes: Type[],
    availableTypes: Set<string>,
): { propertyName: string; mapping?: Record<string, string> } | undefined {
    // Need at least 2 types for a discriminator
    if (unionTypes.length < 2) {
        return undefined;
    }

    // All types must be objects (not primitives, arrays, etc.)
    if (!unionTypes.every((t) => t.isObject() && !t.isArray())) {
        return undefined;
    }

    // Get properties for each type
    const typeProperties = unionTypes.map((t) => {
        const props = t.getProperties();
        return new Map(props.map((p) => [p.getName(), p]));
    });

    // Find common property names across all union members
    const firstProps = typeProperties[0];
    if (!firstProps) return undefined;

    const commonProps: string[] = [];
    for (const [propName] of firstProps) {
        if (typeProperties.every((props) => props.has(propName))) {
            commonProps.push(propName);
        }
    }

    // Check each common property to see if it's a valid discriminator
    for (const propName of commonProps) {
        const literalValues = new Map<Type, string | number>();
        let isValidDiscriminator = true;

        for (let i = 0; i < unionTypes.length; i++) {
            const unionType = unionTypes[i];
            const typeProps = typeProperties[i];

            // Skip if we don't have props for this type
            if (!unionType || !typeProps) {
                isValidDiscriminator = false;
                break;
            }

            const prop = typeProps.get(propName);
            if (!prop) {
                isValidDiscriminator = false;
                break;
            }

            const declaration = prop.getDeclarations()[0];
            if (!declaration) {
                isValidDiscriminator = false;
                break;
            }

            const propType = declaration.getType();

            // Property must be a string or number literal type
            if (propType.isStringLiteral()) {
                const value = propType.getLiteralValue();
                literalValues.set(unionType, value as string);
            } else if (propType.isNumberLiteral()) {
                const value = propType.getLiteralValue();
                literalValues.set(unionType, value as number);
            } else {
                // Property is not a literal type
                isValidDiscriminator = false;
                break;
            }
        }

        // If we found a valid discriminator property
        if (isValidDiscriminator && literalValues.size === unionTypes.length) {
            // Check if all literal values are unique
            const values = Array.from(literalValues.values());
            const uniqueValues = new Set(values);
            if (uniqueValues.size !== values.length) {
                // Duplicate literal values, not a valid discriminator
                continue;
            }

            // Build discriminator object
            const discriminator: { propertyName: string; mapping?: Record<string, string> } = {
                propertyName: propName,
            };

            // Try to build mapping if all types have names and are in availableTypes
            const mapping: Record<string, string> = {};
            let canBuildMapping = true;

            for (const [unionType, literalValue] of literalValues) {
                const aliasSymbol = unionType.getAliasSymbol();
                let typeName = aliasSymbol?.getName();

                if (!typeName) {
                    const symbol = unionType.getSymbol();
                    typeName = symbol?.getName();
                }

                if (typeName && typeName !== "__type" && availableTypes.has(typeName)) {
                    mapping[String(literalValue)] = `#/components/schemas/${typeName}`;
                } else {
                    canBuildMapping = false;
                    break;
                }
            }

            // Only include mapping if we could map all types to $ref
            if (canBuildMapping && Object.keys(mapping).length > 0) {
                discriminator.mapping = mapping;
            }

            return discriminator;
        }
    }

    return undefined;
}

// Types for JSDoc-based OpenAPI path declarations
export type JSDocOpenApiPathMetadata = {
    hasOpenApiTag: boolean;
    method?: string;
    path?: string;
    operationId?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    pathParams?: Record<string, { type: string; required?: boolean; description?: string }>;
    queryParams?: Record<string, { type: string; required?: boolean; description?: string }>;
    headers?: Record<string, { type: string; required?: boolean; description?: string }>;
    requestBody?: { type: string; contentType?: string; description?: string };
    responses?: Array<{
        status: number;
        contentType?: string;
        type?: string;
        description?: string;
    }>;
    deprecated?: boolean;
};

/**
 * Extracts OpenAPI path metadata from JSDoc comments on functions
 * Looks for @openApi tag and related tags like @method, @path, @response, etc.
 */
export function extractOpenApiFromJSDoc(node?: Node): JSDocOpenApiPathMetadata {
    const metadata: JSDocOpenApiPathMetadata = {
        hasOpenApiTag: false,
    };

    if (!node) return metadata;

    // Check if node supports JSDoc
    const jsDocableNode = node as any;
    if (typeof jsDocableNode.getJsDocs !== "function") {
        return metadata;
    }

    const jsDocs = jsDocableNode.getJsDocs();
    if (!jsDocs || jsDocs.length === 0) return metadata;

    for (const jsDoc of jsDocs) {
        // Get summary from first line of description
        const fullDescription = jsDoc.getDescription?.();
        if (fullDescription) {
            const lines = fullDescription.trim().split("\n");
            if (lines.length > 0) {
                metadata.summary = lines[0]?.trim();
                if (lines.length > 1) {
                    // Rest of the lines form the longer description
                    metadata.description = lines.slice(1).join("\n").trim();
                }
            }
        }

        // Process tags
        const tags = jsDoc.getTags?.() || [];
        for (const tag of tags) {
            const tagName = tag.getTagName();
            const comment = tag.getComment?.();
            const commentText = typeof comment === "string" ? comment.trim() : "";

            switch (tagName) {
                case "openApi":
                    metadata.hasOpenApiTag = true;
                    break;

                case "method":
                    if (commentText) {
                        metadata.method = commentText.toLowerCase();
                    }
                    break;

                case "path":
                    if (commentText) {
                        // Extract path string and optional path parameters
                        // Format: @path /users/:id or @path /users/:id {id: number}
                        const pathMatch = commentText.match(/^(\S+)(?:\s+\{([^}]+)\})?/);
                        if (pathMatch) {
                            metadata.path = pathMatch[1];
                            if (pathMatch[2]) {
                                // Parse path parameters like {id: number, name: string}
                                metadata.pathParams = parseParamBlock(pathMatch[2]);
                            }
                        }
                    }
                    break;

                case "operationId":
                    if (commentText) {
                        metadata.operationId = commentText;
                    }
                    break;

                case "tag":
                    if (commentText) {
                        if (!metadata.tags) metadata.tags = [];
                        metadata.tags.push(commentText);
                    }
                    break;

                case "query":
                    if (commentText) {
                        // Format: @query {search: string, limit?: number}
                        metadata.queryParams = parseParamBlock(commentText);
                    }
                    break;

                case "headers":
                    if (commentText) {
                        // Format: @headers {Authorization: string, X-API-Key?: string}
                        metadata.headers = parseParamBlock(commentText);
                    }
                    break;

                case "body":
                    if (commentText) {
                        // Format: @body User or @body application/json User
                        const bodyMatch = commentText.match(/^(?:(\S+\/\S+)\s+)?(\S+)(?:\s+-\s+(.+))?/);
                        if (bodyMatch) {
                            metadata.requestBody = {
                                contentType: bodyMatch[1] || "application/json",
                                type: bodyMatch[2]!,
                                description: bodyMatch[3],
                            };
                        }
                    }
                    break;

                case "response":
                    if (commentText) {
                        // Format: @response 200 application/json User - description
                        // Or: @response 404 - description (no type)
                        // Or: @response 404
                        // Or: @response 200 User - description

                        // First, try to match: status - description (no type, no content-type)
                        let responseMatch = commentText.match(/^(\d{3})\s+-\s+(.+)$/);
                        if (responseMatch) {
                            if (!metadata.responses) metadata.responses = [];
                            const status = parseInt(responseMatch[1]!, 10);
                            metadata.responses.push({
                                status,
                                description: responseMatch[2],
                            });
                        } else {
                            // Try full pattern with optional content-type and type
                            responseMatch = commentText.match(
                                /^(\d{3})(?:\s+(?:(\S+\/\S+)\s+)?(\S+)(?:\s+-\s+(.+))?)?$/,
                            );
                            if (responseMatch) {
                                if (!metadata.responses) metadata.responses = [];
                                const status = parseInt(responseMatch[1]!, 10);
                                const contentType = responseMatch[2];
                                const type = responseMatch[3];
                                const description = responseMatch[4];

                                metadata.responses.push({
                                    status,
                                    contentType: contentType || (type ? "application/json" : undefined),
                                    type,
                                    description,
                                });
                            }
                        }
                    }
                    break;

                case "deprecated":
                    metadata.deprecated = true;
                    break;
            }
        }
    }

    return metadata;
}

/**
 * Parses a parameter block like "{id: number, name?: string}" into a structured format
 */
function parseParamBlock(text: string): Record<string, { type: string; required?: boolean; description?: string }> {
    const params: Record<string, { type: string; required?: boolean; description?: string }> = {};

    // Remove surrounding braces if present
    const cleaned = text.replace(/^\{|\}$/g, "").trim();
    if (!cleaned) return params;

    // Split by comma, but be careful with nested types
    const paramParts = splitByComma(cleaned);

    for (const part of paramParts) {
        // Format: "name: type" or "name?: type" or "name: type - description"
        // Allow hyphens in parameter names for headers like X-API-Key
        const match = part.trim().match(/^([a-zA-Z_$][a-zA-Z0-9_$-]*)\??\s*:\s*([^-]+)(?:\s+-\s+(.+))?/);
        if (match) {
            const paramName = match[1]!;
            const isOptional = part.includes("?:");
            const paramType = match[2]!.trim();
            const description = match[3]?.trim();

            params[paramName] = {
                type: paramType,
                required: !isOptional,
                description,
            };
        }
    }

    return params;
}

/**
 * Splits a string by comma, but respects nested structures
 */
function splitByComma(text: string): string[] {
    const parts: string[] = [];
    let current = "";
    let depth = 0;

    for (let i = 0; i < text.length; i++) {
        const char = text[i]!;
        if (char === "{" || char === "<" || char === "[") {
            depth++;
            current += char;
        } else if (char === "}" || char === ">" || char === "]") {
            depth--;
            current += char;
        } else if (char === "," && depth === 0) {
            parts.push(current);
            current = "";
        } else {
            current += char;
        }
    }

    if (current.trim()) {
        parts.push(current);
    }

    return parts;
}
