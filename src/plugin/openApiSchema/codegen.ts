
import { TypeFlags, Node, Symbol, SymbolFlags, Type, TypeNode, EnumDeclaration } from "ts-morph";
import type { BigIntFormatType, NumFormatType } from "../../tags";

type SchemaSettings = {
    coerceSymbolsToStrings?: boolean;
    transformDate?: (type: Type) => unknown;
}

type SchemaContext = {
    nodeText?: string;
    settings?: SchemaSettings;
    declaration?: Node;
    typeNode?: Node;
};

type JSDocMetadata = {
    description?: string;
    default?: any;
    example?: string;
    deprecated?: boolean;
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    format?: string;
};

export function createOpenApiSchema(type: Type, context: SchemaContext = {}): unknown {
    const settings = context.settings ?? {};

    if (type.isUnion()) {
        const narrowed = type.getUnionTypes().filter(t => !isNullable(t));
        if (narrowed.length === 1)
            return createOpenApiSchema(narrowed[0]!, context);
        if (narrowed.length > 1 && narrowed.every(t => t.isBooleanLiteral()))
            return { type: "boolean" };
        
        // Check for string literal unions
        if (narrowed.length > 1 && narrowed.every(t => t.isStringLiteral())) {
            const enumValues = narrowed
                .map(t => t.getLiteralValue())
                .filter((v): v is string => typeof v === 'string');
            // Ensure all literal values were extracted successfully
            if (enumValues.length === narrowed.length) {
                return { type: "string", enum: enumValues };
            }
        }
        
        // Check for number literal unions
        if (narrowed.length > 1 && narrowed.every(t => t.isNumberLiteral())) {
            const enumValues = narrowed
                .map(t => t.getLiteralValue())
                .filter((v): v is number => typeof v === 'number');
            // Ensure all literal values were extracted successfully
            if (enumValues.length === narrowed.length) {
                return { type: "number", enum: enumValues };
            }
        }
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
    
    if (isBigIntFormat(type, context.nodeText))
        return createSchemaForBigInt(type, context.nodeText);

    if (isNumFormat(type, context.nodeText))
        return createSchemaForNumberFormat(type, context.nodeText);

    if (isSymbolType(type)) {
        if (settings.coerceSymbolsToStrings)
            return { type: "string" };
        throw new Error("Symbol types require 'coerceSymbolsToStrings' to be enabled.");
    }

    if (isDateType(type)) {
        const customSchema = settings.transformDate?.(type);
        if (customSchema !== undefined)
            return customSchema;
        return { type: "string", format: "date-time" };
    }

    if (type.isString())
        return { type: "string" };

    if (type.isNumber())
        return { type: "number" };

    if (type.isBoolean())
        return { type: "boolean" };

    if (type.isArray())
        return {
            type: "array",
            // Array items are anonymous, don't pass typeName
            items: createOpenApiSchema(type.getArrayElementTypeOrThrow(), { settings: context.settings }),
        };

    if (type.isObject() && !type.isArray() && !type.isInterface() && !type.isClass()) {
        const properties: Record<string, any> = {};
        const required: string[] = [];

        type.getProperties().forEach(prop => {
            const declaration = prop.getDeclarations()[0];
            if (!declaration) return;
            
            // Skip properties marked with @private, @ignore, or @package
            if (shouldExcludeFromSchema(declaration)) {
                return;
            }

            const propType = declaration.getType();
            const typeNode = (Node.isPropertySignature(declaration) || Node.isPropertyDeclaration(declaration))
                ? declaration.getTypeNode()
                : undefined;
            
            // Create base schema
            // Note: We don't pass typeNode to nested objects - they are anonymous inline types
            let propSchema = createOpenApiSchema(propType, {
                settings: context.settings,
                nodeText: typeNode?.getText(),
                declaration
            });
            
            // Extract and merge JSDoc metadata
            const jsDocMetadata = extractJSDocMetadata(declaration);
            if (typeof propSchema === 'object' && propSchema !== null) {
                propSchema = mergeJSDocIntoSchema(propSchema as Record<string, any>, jsDocMetadata);
            }
            
            properties[prop.getName()] = propSchema;

            if (!isOptionalProperty(prop, declaration)) {
                required.push(prop.getName());
            }
        });

        const schema: Record<string, any> = { 
            type: "object", 
            properties,
            ...(context.typeNode ? { title: context.typeNode.getText() } : {})
        };

        if (required.length > 0) schema.required = required;

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

function hasFormatAlias(type: Type, name: string) {
    const alias = type.getAliasSymbol();
    if (alias && alias.getName() === name)
        return true;

    const symbol = type.getSymbol();
    if (symbol && symbol.getName() === name)
        return true;

    return type.getText().includes(name);
}

function createSchemaForBigInt(type: Type, nodeText?: string) {
    const formatValue = getFormatLiteral<BigIntFormatType>(type) ?? extractFormatFromText<BigIntFormatType>(nodeText, "BigIntFormat");

    if (formatValue === "int64")
        return { type: "integer", format: "int64" };

    if (formatValue === "string")
        return { type: "string" };

    throw new Error(`BigIntFormat requires a format. Received: ${type.getText()}`);
}

function createSchemaForNumberFormat(type: Type, nodeText?: string) {
    const formatValue = getFormatLiteral<NumFormatType>(type) ?? extractFormatFromText<NumFormatType>(nodeText, "NumFormat");

    if (!formatValue)
        return { type: "number" };

    if (formatValue === "string")
        return { type: "string" };

    if (formatValue === "int32" || formatValue === "int64")
        return { type: "integer", format: formatValue };

    if (formatValue === "float" || formatValue === "double")
        return { type: "number", format: formatValue };

    return { type: "number" };
}

function isOptionalProperty(symbol: Symbol, declaration: Node) {
    if (symbol.hasFlags(SymbolFlags.Optional))
        return true;

    if (Node.isPropertySignature(declaration) || Node.isPropertyDeclaration(declaration))
        if (declaration.hasQuestionToken())
            return true;

    return false;
}

function isNullable(type: Type) {
    if (type.isUndefined() || type.isNull())
        return true;

    return ["undefined", "null"].includes(type.getText())
}

function isDateType(type: Type) {
    const symbol = type.getSymbol();
    if (symbol && symbol.getName() === "Date")
        return true;

    const apparentSymbol = type.getApparentType().getSymbol();
    if (apparentSymbol && apparentSymbol.getName() === "Date")
        return true;

    ["Date", "globalThis.Date"].includes(type.getText())
}

function isSymbolType(type: Type) {
    const flags = type.getFlags();
    if ((flags & TypeFlags.ESSymbol) !== 0 || (flags & TypeFlags.UniqueESSymbol) !== 0)
        return true;

    return ["symbol", "unique symbol"].includes(type.getText());
}

function getFormatLiteral<T extends string>(type: Type): T | undefined {
    const aliasArgs = type.getAliasTypeArguments?.();
    if (aliasArgs && aliasArgs.length > 0) {
        const literal = aliasArgs[0]?.getLiteralValue?.();
        if (typeof literal === "string")
            return literal as T;
    }

    const typeArgs = type.getTypeArguments?.();
    if (typeArgs && typeArgs.length > 0) {
        const literal = typeArgs[0]?.getLiteralValue?.();
        if (typeof literal === "string")
            return literal as T;
    }

    return undefined;
}

function extractJSDocMetadata(node?: Node): JSDocMetadata {
    const metadata: JSDocMetadata = {};
    
    if (!node) return metadata;
    
    // Check if node supports JSDoc
    const jsDocableNode = node as any;
    if (typeof jsDocableNode.getJsDocs !== 'function') {
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
            const commentText = typeof comment === 'string' ? comment.trim() : '';
            
            switch (tagName) {
                case 'description':
                    if (commentText && !metadata.description) {
                        metadata.description = commentText;
                    }
                    break;
                case 'default':
                    if (commentText) {
                        metadata.default = parseJSDocValue(commentText);
                    }
                    break;
                case 'example':
                    if (commentText) {
                        metadata.example = parseJSDocValue(commentText);
                    }
                    break;
                case 'deprecated':
                    metadata.deprecated = true;
                    break;
                case 'minimum':
                case 'min':
                    if (commentText) {
                        const num = parseFloat(commentText);
                        if (!isNaN(num)) metadata.minimum = num;
                    }
                    break;
                case 'maximum':
                case 'max':
                    if (commentText) {
                        const num = parseFloat(commentText);
                        if (!isNaN(num)) metadata.maximum = num;
                    }
                    break;
                case 'minLength':
                    if (commentText) {
                        const num = parseInt(commentText, 10);
                        if (!isNaN(num)) metadata.minLength = num;
                    }
                    break;
                case 'maxLength':
                    if (commentText) {
                        const num = parseInt(commentText, 10);
                        if (!isNaN(num)) metadata.maxLength = num;
                    }
                    break;
                case 'pattern':
                    if (commentText) {
                        metadata.pattern = commentText;
                    }
                    break;
                case 'format':
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
    if (typeof jsDocableNode.getJsDocs !== 'function') {
        return false;
    }
    
    const jsDocs = jsDocableNode.getJsDocs();
    if (!jsDocs || jsDocs.length === 0) return false;
    
    for (const jsDoc of jsDocs) {
        const tags = jsDoc.getTags?.() || [];
        for (const tag of tags) {
            const tagName = tag.getTagName();
            // Exclude fields marked with @private, @ignore, or @package
            if (tagName === 'private' || tagName === 'ignore' || tagName === 'package') {
                return true;
            }
        }
    }
    
    return false;
}

function parseJSDocValue(value: string): any {
    value = value.trim();
    
    // Try to parse as JSON
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    
    // Try to parse as number
    const num = Number(value);
    if (!isNaN(num) && value !== '') return num;
    
    // Remove quotes if it's a quoted string
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1);
    }
    
    return value;
}

function mergeJSDocIntoSchema(schema: Record<string, any>, metadata: JSDocMetadata): Record<string, any> {
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

function createEnumSchema(declaration: EnumDeclaration, type: Type): { type: "string" | "number"; enum: (string | number)[] } {
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
            if (typeof value === 'number') {
                enumValues.push(value);
                if (enumType === null) {
                    enumType = "number";
                } else if (enumType !== "number") {
                    throw new Error(`Mixed enum types are not supported: ${type.getText()}`);
                }
            } else {
                throw new Error(`Enum member ${member.getName()} has unexpected non-numeric value (${JSON.stringify(value)}): ${type.getText()}`);
            }
        }
    }
    
    // enumType is guaranteed to be non-null since we have at least one member
    return { type: enumType as "string" | "number", enum: enumValues };
}

function extractFormatFromText<T extends string>(text: string | undefined, alias: string): T | undefined {
    if (!text)
        return undefined;

    const pattern = new RegExp(`${alias}<\s*"([^"]+)"`, "i");
    const match = text.match(pattern);
    if (!match)
        return undefined;

    return match[1] as T;
}