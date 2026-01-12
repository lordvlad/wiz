/**
 * TypeScript AST to IR converter
 *
 * Converts ts-morph Type objects to our common IR representation.
 */
import { Node, Symbol as MorphSymbol, Type, TypeFlags } from "ts-morph";

import type { IRConstraints, IREnum, IRFormat, IRMetadata, IRProperty, IRType, IRTypeDefinition } from "../types";
import {
    createArray,
    createEnum,
    createIntersection,
    createLiteral,
    createMap,
    createObject,
    createPrimitive,
    createReference,
    createTuple,
    createUnion,
    removeNullFromUnion,
    simplifyUnion,
    unionContainsNull,
} from "../utils";

/**
 * Options for TypeScript to IR conversion
 */
export interface TsToIrOptions {
    /** Types available for $ref generation */
    availableTypes?: Set<string>;
    /** Stack to track processing for circular reference detection */
    processingStack?: Set<string>;
    /** Coerce symbols to strings */
    coerceSymbolsToStrings?: boolean;
}

/**
 * Context for conversion
 */
interface ConversionContext extends TsToIrOptions {
    availableTypes: Set<string>;
    processingStack: Set<string>;
}

/**
 * Extract JSDoc metadata from a node
 */
function extractMetadata(node?: Node): IRMetadata | undefined {
    if (!node) return undefined;

    const jsDocs = (node as any).getJsDocs?.() ?? [];
    if (jsDocs.length === 0) return undefined;

    const metadata: IRMetadata = {};

    for (const jsDoc of jsDocs) {
        // Extract description from comment
        const comment = jsDoc.getComment?.();
        if (comment) {
            const commentText = typeof comment === "string" ? comment.trim() : "";
            if (commentText) {
                metadata.description = commentText;
            }
        }

        // Extract tags
        const tags = jsDoc.getTags?.() ?? [];
        for (const tag of tags) {
            const tagName = tag.getTagName();
            const tagComment = tag.getComment?.();
            const commentText = typeof tagComment === "string" ? tagComment.trim() : "";

            switch (tagName) {
                case "deprecated":
                    metadata.deprecated = commentText || true;
                    break;
                case "default":
                    try {
                        metadata.default = JSON.parse(commentText);
                    } catch {
                        metadata.default = commentText;
                    }
                    break;
                case "example":
                    if (!metadata.examples) metadata.examples = [];
                    try {
                        metadata.examples.push(JSON.parse(commentText));
                    } catch {
                        metadata.examples.push(commentText);
                    }
                    break;
            }
        }
    }

    return Object.keys(metadata).length > 0 ? metadata : undefined;
}

/**
 * Extract constraints from JSDoc tags
 */
function extractConstraints(node?: Node): IRConstraints | undefined {
    if (!node) return undefined;

    const jsDocs = (node as any).getJsDocs?.() ?? [];
    if (jsDocs.length === 0) return undefined;

    const constraints: IRConstraints = {};

    for (const jsDoc of jsDocs) {
        const tags = jsDoc.getTags?.() ?? [];
        for (const tag of tags) {
            const tagName = tag.getTagName();
            const comment = tag.getComment?.();
            const commentText = typeof comment === "string" ? comment.trim() : "";

            switch (tagName) {
                case "minimum":
                case "min": {
                    const num = parseFloat(commentText);
                    if (!isNaN(num)) constraints.minimum = num;
                    break;
                }
                case "maximum":
                case "max": {
                    const num = parseFloat(commentText);
                    if (!isNaN(num)) constraints.maximum = num;
                    break;
                }
                case "exclusiveMinimum": {
                    const num = parseFloat(commentText);
                    if (!isNaN(num)) constraints.exclusiveMinimum = num;
                    break;
                }
                case "exclusiveMaximum": {
                    const num = parseFloat(commentText);
                    if (!isNaN(num)) constraints.exclusiveMaximum = num;
                    break;
                }
                case "multipleOf": {
                    const num = parseFloat(commentText);
                    if (!isNaN(num) && num > 0) constraints.multipleOf = num;
                    break;
                }
                case "minLength": {
                    const num = parseInt(commentText, 10);
                    if (!isNaN(num)) constraints.minLength = num;
                    break;
                }
                case "maxLength": {
                    const num = parseInt(commentText, 10);
                    if (!isNaN(num)) constraints.maxLength = num;
                    break;
                }
                case "pattern": {
                    constraints.pattern = commentText;
                    break;
                }
                case "minItems": {
                    const num = parseInt(commentText, 10);
                    if (!isNaN(num)) constraints.minItems = num;
                    break;
                }
                case "maxItems": {
                    const num = parseInt(commentText, 10);
                    if (!isNaN(num)) constraints.maxItems = num;
                    break;
                }
                case "uniqueItems": {
                    constraints.uniqueItems = true;
                    break;
                }
            }
        }
    }

    return Object.keys(constraints).length > 0 ? constraints : undefined;
}

/**
 * Extract format from JSDoc tags
 */
function extractFormat(node?: Node): IRFormat | undefined {
    if (!node) return undefined;

    const jsDocs = (node as any).getJsDocs?.() ?? [];
    if (jsDocs.length === 0) return undefined;

    for (const jsDoc of jsDocs) {
        const tags = jsDoc.getTags?.() ?? [];
        for (const tag of tags) {
            const tagName = tag.getTagName();
            if (tagName === "format") {
                const comment = tag.getComment?.();
                const format = typeof comment === "string" ? comment.trim() : "";
                if (format) {
                    return { format };
                }
            }
        }
    }

    return undefined;
}

/**
 * Check if type is a Wiz format type
 */
function isWizFormatType(type: Type): string | null {
    const alias = type.getAliasSymbol();
    if (alias) {
        const name = alias.getName();
        if (name === "NumFormat" || name === "StrFormat" || name === "BigIntFormat" || name === "DateFormat") {
            return name;
        }
    }

    const symbol = type.getSymbol();
    if (symbol) {
        const name = symbol.getName();
        if (name === "NumFormat" || name === "StrFormat" || name === "BigIntFormat" || name === "DateFormat") {
            return name;
        }
    }

    const text = type.getText();
    if (text.includes("NumFormat<")) return "NumFormat";
    if (text.includes("StrFormat<")) return "StrFormat";
    if (text.includes("BigIntFormat<")) return "BigIntFormat";
    if (text.includes("DateFormat<")) return "DateFormat";

    return null;
}

/**
 * Extract format literal from type arguments
 */
function getFormatLiteral(type: Type): string | undefined {
    // Try alias type arguments first
    const aliasArgs = type.getAliasTypeArguments?.();
    if (aliasArgs && aliasArgs.length > 0) {
        const firstArg = aliasArgs[0];
        if (firstArg && firstArg.isStringLiteral()) {
            return firstArg.getLiteralValue() as string;
        }
    }

    // Try regular type arguments
    const typeArgs = type.getTypeArguments?.();
    if (typeArgs && typeArgs.length > 0) {
        const firstArg = typeArgs[0];
        if (firstArg && firstArg.isStringLiteral()) {
            return firstArg.getLiteralValue() as string;
        }
    }

    // Try parsing from type text
    const text = type.getText();
    const match = text.match(/<\s*"([^"]+)"/);
    if (match && match[1]) {
        return match[1];
    }

    return undefined;
}

/**
 * Detect Wiz format from intersection type
 * Handles cases like: string & { __str_format: "email" }
 */
function detectWizFormatIntersection(type: Type): { formatType: string; formatValue: string } | null {
    if (!type.isIntersection()) return null;

    const intersectionTypes = type.getIntersectionTypes();
    if (intersectionTypes.length !== 2) return null;

    let formatType: string | null = null;
    let formatValue: string | null = null;

    for (const t of intersectionTypes) {
        if (t.isObject() && !t.isArray()) {
            const properties = t.getProperties();

            for (const prop of properties) {
                const propName = prop.getName();
                if (propName === "__str_format") {
                    formatType = "StrFormat";
                } else if (propName === "__num_format") {
                    formatType = "NumFormat";
                } else if (propName === "__bigint_format") {
                    formatType = "BigIntFormat";
                } else if (propName === "__date_format") {
                    formatType = "DateFormat";
                }

                if (formatType) {
                    const decl = prop.getValueDeclaration();
                    if (decl) {
                        const propType = prop.getTypeAtLocation(decl);
                        if (propType.isStringLiteral()) {
                            formatValue = propType.getLiteralValue() as string;
                        }
                    }
                }
            }
        }
    }

    if (formatType && formatValue) {
        return { formatType, formatValue };
    }

    return null;
}

/**
 * Convert Wiz format type to IR with appropriate primitive type and format
 */
function convertWizFormatType(
    formatType: string,
    formatValue: string,
    metadata?: IRMetadata,
    constraints?: IRConstraints,
): IRType {
    // Merge extensions into metadata
    const mergedMetadata: IRMetadata = {
        ...metadata,
        extensions: {
            ...metadata?.extensions,
            "x-wiz-format": `${formatType}<"${formatValue}">`,
        },
    };

    if (formatType === "NumFormat") {
        // NumFormat maps to different types based on format value
        if (formatValue === "string") {
            return createPrimitive("string", mergedMetadata, constraints);
        }
        if (formatValue === "int32" || formatValue === "int64") {
            return {
                ...createPrimitive("integer", mergedMetadata, constraints),
                format: { format: formatValue },
            };
        }
        if (formatValue === "float" || formatValue === "double") {
            return {
                ...createPrimitive("number", mergedMetadata, constraints),
                format: { format: formatValue },
            };
        }
        return createPrimitive("number", mergedMetadata, constraints);
    }

    if (formatType === "StrFormat") {
        // All StrFormat types map to string with format
        return {
            ...createPrimitive("string", mergedMetadata, constraints),
            format: { format: formatValue },
        };
    }

    if (formatType === "BigIntFormat") {
        // BigIntFormat maps to different types based on format value
        if (formatValue === "int64") {
            return {
                ...createPrimitive("integer", mergedMetadata, constraints),
                format: { format: "int64" },
            };
        }
        if (formatValue === "string") {
            return createPrimitive("string", mergedMetadata, constraints);
        }
        // Default to integer int64
        return {
            ...createPrimitive("integer", mergedMetadata, constraints),
            format: { format: "int64" },
        };
    }

    if (formatType === "DateFormat") {
        // DateFormat maps to different types based on format value
        if (formatValue === "date-time" || formatValue === "date") {
            return {
                ...createPrimitive("string", mergedMetadata, constraints),
                format: { format: formatValue },
            };
        }
        if (formatValue === "unix-s" || formatValue === "unix-ms") {
            return {
                ...createPrimitive("integer", mergedMetadata, constraints),
                format: { format: "int64" },
            };
        }
        // Default to string date-time
        return {
            ...createPrimitive("string", mergedMetadata, constraints),
            format: { format: "date-time" },
        };
    }

    // Fallback to number for unknown format types
    return createPrimitive("number", mergedMetadata, constraints);
}

/**
 * Check if a property should be filtered out
 */
function shouldFilterProperty(node?: Node): boolean {
    if (!node) return false;

    const jsDocs = (node as any).getJsDocs?.() ?? [];

    for (const jsDoc of jsDocs) {
        const tags = jsDoc.getTags?.() ?? [];
        for (const tag of tags) {
            const tagName = tag.getTagName();
            if (tagName === "private" || tagName === "ignore" || tagName === "package") {
                return true;
            }
        }
    }

    return false;
}

/**
 * Convert a ts-morph Type to IR
 */
export function typeToIr(type: Type, options: TsToIrOptions = {}): IRType {
    const context: ConversionContext = {
        availableTypes: options.availableTypes || new Set(),
        processingStack: options.processingStack || new Set(),
        coerceSymbolsToStrings: options.coerceSymbolsToStrings,
    };

    return convertType(type, context);
}

/**
 * Internal conversion function with context
 */
function convertType(type: Type, context: ConversionContext, node?: Node): IRType {
    const metadata = extractMetadata(node);
    const constraints = extractConstraints(node);
    const format = extractFormat(node);

    // Handle null
    if (type.isNull()) {
        return createPrimitive("null", metadata, constraints);
    }

    // Handle undefined
    if (type.isUndefined()) {
        return createPrimitive("void", metadata, constraints);
    }

    // Check for Wiz format types (NumFormat, StrFormat, BigIntFormat, DateFormat)
    const wizFormatType = isWizFormatType(type);
    if (wizFormatType) {
        const formatValue = getFormatLiteral(type);
        if (formatValue) {
            return convertWizFormatType(wizFormatType, formatValue, metadata, constraints);
        }
    }

    // Check for intersection-based format types (e.g., string & { __str_format: "email" })
    const intersectionFormat = detectWizFormatIntersection(type);
    if (intersectionFormat) {
        return convertWizFormatType(intersectionFormat.formatType, intersectionFormat.formatValue, metadata, constraints);
    }

    // Handle boolean
    if (type.isBoolean()) {
        return createPrimitive("boolean", metadata, constraints);
    }

    // Handle string
    if (type.isString()) {
        const result = createPrimitive("string", metadata, constraints);
        if (format) result.format = format;
        return result;
    }

    // Handle number
    if (type.isNumber()) {
        const result = createPrimitive("number", metadata, constraints);
        if (format) result.format = format;
        return result;
    }

    // Handle bigint
    if (type.getFlags() & TypeFlags.BigInt) {
        const result = createPrimitive("number", metadata, constraints);
        if (format) result.format = format;
        return result;
    }

    // Handle literal types
    if (type.isLiteral()) {
        const value = type.getLiteralValue();
        return createLiteral(value as any, metadata);
    }

    // Handle array
    if (type.isArray()) {
        const arrayType = type.getArrayElementType();
        if (arrayType) {
            // Create a context that indicates we're inside an array
            // This ensures named types in arrays get converted to references
            const arrayContext = {
                ...context,
                processingStack: context.processingStack.size === 0 
                    ? new Set(['__array__']) 
                    : context.processingStack,
            };
            const items = convertType(arrayType, arrayContext);
            const result = createArray(items, metadata, constraints);
            return result;
        }
    }

    // Handle tuple
    if (type.isTuple()) {
        const elements = type.getTupleElements();
        // Create a context that indicates we're inside a tuple
        const tupleContext = {
            ...context,
            processingStack: context.processingStack.size === 0 
                ? new Set(['__tuple__']) 
                : context.processingStack,
        };
        const items = elements.map((el) => convertType(el, tupleContext));
        return createTuple(items, metadata);
    }

    // Handle union
    if (type.isUnion()) {
        const types = type.getUnionTypes();
        
        // Check if this union contains boolean literals
        const booleanLiterals = types.filter((t) => {
            if (!t.isLiteral()) return false;
            const value = t.getLiteralValue();
            return typeof value === "boolean";
        });
        
        const nullTypes = types.filter((t) => t.isNull());
        const otherTypes = types.filter((t) => {
            if (t.isNull()) return false;
            if (t.isLiteral() && typeof t.getLiteralValue() === "boolean") return false;
            return true;
        });
        
        // If we have both true and false literals, consolidate to boolean
        if (booleanLiterals.length === 2) {
            const booleanPrimitive = createPrimitive("boolean", undefined, undefined);
            
            if (nullTypes.length > 0 && otherTypes.length === 0) {
                // boolean | null -> create union of [boolean, null]
                const nullPrimitive = createPrimitive("null", undefined, undefined);
                const union = createUnion([booleanPrimitive, nullPrimitive], metadata);
                return union;
            } else if (otherTypes.length === 0 && nullTypes.length === 0) {
                // Just true | false -> boolean
                return booleanPrimitive;
            } else {
                // true | false | other types -> boolean | other types
                // Continue with normal union processing but replace boolean literals with boolean primitive
                const consolidatedTypes = [booleanPrimitive, ...nullTypes, ...otherTypes];
                const unionContext = {
                    ...context,
                    processingStack: context.processingStack.size === 0 
                        ? new Set(['__union__']) 
                        : context.processingStack,
                };
                const irTypes = consolidatedTypes.map((t) => {
                    if (t === booleanPrimitive) return booleanPrimitive;
                    return convertType(t, unionContext);
                });
                const simplified = simplifyUnion(irTypes);
                
                if (simplified.length === 1) {
                    return simplified[0]!;
                }
                
                const discriminator = detectDiscriminator(types, context.availableTypes);
                const union = createUnion(simplified, metadata);
                if (discriminator) {
                    union.discriminator = discriminator;
                }
                return union;
            }
        }
        
        // Create a context that indicates we're inside a union
        // This ensures named types in the union get converted to references
        const unionContext = {
            ...context,
            processingStack: context.processingStack.size === 0 
                ? new Set(['__union__']) 
                : context.processingStack,
        };
        
        const irTypes = types.map((t) => convertType(t, unionContext));
        const simplified = simplifyUnion(irTypes);

        if (simplified.length === 1) {
            return simplified[0]!;
        }

        // Detect discriminator for unions
        const discriminator = detectDiscriminator(types, context.availableTypes);

        // Keep full union information including null
        // OpenAPI generator will handle nullable unions specially
        const union = createUnion(simplified, metadata);
        if (discriminator) {
            union.discriminator = discriminator;
        }
        return union;
    }

    // Handle intersection
    if (type.isIntersection()) {
        const types = type.getIntersectionTypes();
        // Create a context that indicates we're inside an intersection
        const intersectionContext = {
            ...context,
            processingStack: context.processingStack.size === 0 
                ? new Set(['__intersection__']) 
                : context.processingStack,
        };
        const irTypes = types.map((t) => convertType(t, intersectionContext));
        return createIntersection(irTypes, metadata);
    }

    // Handle enum
    if (type.isEnum()) {
        const symbol = type.getSymbol();
        if (symbol) {
            const enumDecl = symbol.getDeclarations()[0];
            if (enumDecl && Node.isEnumDeclaration(enumDecl)) {
                const members = enumDecl.getMembers().map((member) => ({
                    name: member.getName(),
                    value: member.getValue() as string | number,
                    metadata: extractMetadata(member),
                }));
                return createEnum(members, metadata);
            }
        }
    }

    // Handle object types
    if (type.isObject()) {
        // Check for reference to named type
        // Prioritize alias symbol over regular symbol to properly detect type aliases like Dog, Cat, etc.
        const symbol = type.getAliasSymbol() || type.getSymbol();
        if (symbol) {
            const typeName = symbol.getName();
            if (typeName && typeName !== "__type" && context.availableTypes.has(typeName)) {
                // Check for circular reference - always use $ref
                if (context.processingStack.has(typeName)) {
                    return createReference(typeName, undefined, metadata);
                }
                // Use $ref for nested types (not at root level)
                // Root level is indicated by an empty processingStack
                if (context.processingStack.size > 0) {
                    return createReference(typeName, undefined, metadata);
                }
                // At root level, continue to inline the type definition
            }
        }

        // Check for Record<K, V> or index signature
        const indexInfos = type.getStringIndexType();
        if (indexInfos) {
            const valueType = convertType(indexInfos, context);
            return createMap(createPrimitive("string"), valueType, metadata);
        }

        // Regular object with properties
        // Add current type to processing stack to prevent infinite recursion for circular references
        const currentTypeName = symbol?.getName();
        const newProcessingStack = new Set(context.processingStack);
        if (currentTypeName && currentTypeName !== "__type" && context.availableTypes.has(currentTypeName)) {
            newProcessingStack.add(currentTypeName);
        }
        const newContext = { ...context, processingStack: newProcessingStack };

        const properties = type.getProperties();
        const irProperties: IRProperty[] = [];

        for (const prop of properties) {
            const propDecl = prop.getValueDeclaration();
            if (shouldFilterProperty(propDecl)) {
                continue;
            }

            const propType = prop.getTypeAtLocation(propDecl || prop.getDeclarations()[0]!);
            const propName = prop.getName();
            const isOptional = prop.isOptional();

            // Convert the property type using the new context with updated processing stack
            let irType = convertType(propType, newContext, propDecl);

            // Important: Optional properties (prop?: T) should not include undefined in their type
            // The optionality is captured by required: false
            // This is different from (prop: T | undefined) which is a required property with undefined as a valid value
            if (isOptional && irType.kind === "union") {
                const union = irType as any;
                if (unionContainsNull(union.types)) {
                    // This is (prop?: T | null) - keep the union but remove undefined if present
                    const filtered = union.types.filter((t: any) => {
                        if (t.kind === "primitive") {
                            return t.primitiveType !== "void";
                        }
                        return true;
                    });
                    if (filtered.length === 1) {
                        irType = filtered[0];
                    } else if (filtered.length > 0) {
                        irType = createUnion(filtered, union.metadata);
                    }
                } else {
                    // Check if union contains undefined (void in IR)
                    const filtered = union.types.filter((t: any) => {
                        if (t.kind === "primitive") {
                            return t.primitiveType !== "void";
                        }
                        return true;
                    });
                    if (filtered.length === 1) {
                        // Union was (T | undefined) - reduce to just T since optionality is captured by required: false
                        irType = filtered[0];
                    } else if (filtered.length > 0 && filtered.length < union.types.length) {
                        // Had undefined plus other types - keep the others
                        irType = createUnion(filtered, union.metadata);
                    }
                }
            }

            irProperties.push({
                name: propName,
                type: irType,
                required: !isOptional,
                metadata: extractMetadata(propDecl),
                constraints: extractConstraints(propDecl),
            });
        }

        return createObject(irProperties, undefined, metadata);
    }

    // Handle any
    if (type.isAny()) {
        return createPrimitive("any", metadata, constraints);
    }

    // Handle unknown
    if (type.isUnknown()) {
        return createPrimitive("unknown", metadata, constraints);
    }

    // Handle never
    if (type.isNever()) {
        return createPrimitive("never", metadata, constraints);
    }

    // Default fallback
    return createPrimitive("any", metadata, constraints);
}

/**
 * Convert a named type to an IR type definition
 */
export function namedTypeToIrDefinition(name: string, type: Type, options: TsToIrOptions = {}): IRTypeDefinition {
    const context: ConversionContext = {
        availableTypes: options.availableTypes || new Set(),
        processingStack: new Set([name]),
        coerceSymbolsToStrings: options.coerceSymbolsToStrings,
    };

    // Get the declaration node for metadata
    const symbol = type.getSymbol() || type.getAliasSymbol();
    const node = symbol?.getDeclarations()[0];

    const irType = convertType(type, context, node);
    const metadata = extractMetadata(node);

    return {
        name,
        type: irType,
        metadata,
    };
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
