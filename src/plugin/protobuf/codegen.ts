import { Node, Type, TypeFormatFlags } from "ts-morph";

import type { WizPluginOptions } from "..";
import type { BigIntFormatType, DateFormatType, NumFormatType, StrFormatType } from "../../tags";

// JSDoc metadata for protobuf
interface JSDocComment {
    description?: string;
    tags: Array<{ name: string; value?: string }>;
}

// Counter for field numbers
let fieldNumberCounter = 1;

// Reset field counter for each new message
function resetFieldCounter() {
    fieldNumberCounter = 1;
}

// Get next field number
function getNextFieldNumber(): number {
    return fieldNumberCounter++;
}

// Extract JSDoc comments from a TypeScript node
function extractJSDocComment(node?: Node): JSDocComment | undefined {
    if (!node) return undefined;

    const jsDocableNode = node as any;
    if (typeof jsDocableNode.getJsDocs !== "function") {
        return undefined;
    }

    const jsDocs = jsDocableNode.getJsDocs();
    if (!jsDocs || jsDocs.length === 0) return undefined;

    let description: string | undefined;
    const tags: Array<{ name: string; value?: string }> = [];

    for (const jsDoc of jsDocs) {
        // Get description from comment text (before any tags)
        const desc = jsDoc.getDescription?.();
        if (desc && !description) {
            description = desc.trim();
        }

        // Process tags
        const jsTags = jsDoc.getTags?.() || [];
        for (const tag of jsTags) {
            const tagName = tag.getTagName();
            const comment = tag.getComment?.();

            let commentText = "";

            // Handle different comment types
            if (typeof comment === "string") {
                commentText = comment.trim();
            } else if (Array.isArray(comment)) {
                // Comment is an array of JSDocText/JSDocLink nodes
                commentText = comment
                    .map((part) => {
                        if (typeof part === "string") {
                            return part;
                        }
                        if (
                            part &&
                            typeof part === "object" &&
                            "getText" in part &&
                            typeof part.getText === "function"
                        ) {
                            return part.getText();
                        }
                        return "";
                    })
                    .join("")
                    .trim()
                    // Remove trailing JSDoc comment characters like " * " at the end
                    .replace(/\s*\*\s*$/g, "")
                    .trim();
            }

            // Keep all JSDoc tags as-is (verbatim)
            tags.push({
                name: tagName,
                value: commentText || undefined,
            });
        }
    }

    if (!description && tags.length === 0) {
        return undefined;
    }

    return { description, tags };
}

// Helper functions to detect wiz tagging interfaces
function hasFormatAlias(type: Type, name: string): boolean {
    const alias = type.getAliasSymbol();
    if (alias && alias.getName() === name) return true;

    const symbol = type.getSymbol();
    if (symbol && symbol.getName() === name) return true;

    return type.getText().includes(name);
}

function isStrFormat(type: Type, nodeText?: string): boolean {
    return hasFormatAlias(type, "StrFormat") || (nodeText?.includes("StrFormat") ?? false);
}

function isNumFormat(type: Type, nodeText?: string): boolean {
    return hasFormatAlias(type, "NumFormat") || (nodeText?.includes("NumFormat") ?? false);
}

function isBigIntFormat(type: Type, nodeText?: string): boolean {
    return hasFormatAlias(type, "BigIntFormat") || (nodeText?.includes("BigIntFormat") ?? false);
}

function isDateFormat(type: Type, nodeText?: string): boolean {
    return hasFormatAlias(type, "DateFormat") || (nodeText?.includes("DateFormat") ?? false);
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

function extractFormatFromText<T extends string>(text: string | undefined, alias: string): T | undefined {
    if (!text) return undefined;

    const pattern = new RegExp(`${alias}<\\s*"([^"]+)"`, "i");
    const match = text.match(pattern);
    if (!match) return undefined;

    return match[1] as T;
}

// Extract wiz tag information from a type
function extractWizTag(type: Type, nodeText?: string): { name: string; value: string } | undefined {
    if (isStrFormat(type, nodeText)) {
        const formatValue =
            getFormatLiteral<StrFormatType>(type) ?? extractFormatFromText<StrFormatType>(nodeText, "StrFormat");
        if (formatValue) {
            return { name: "wiz-format", value: formatValue };
        }
    }

    if (isNumFormat(type, nodeText)) {
        const formatValue =
            getFormatLiteral<NumFormatType>(type) ?? extractFormatFromText<NumFormatType>(nodeText, "NumFormat");
        if (formatValue) {
            return { name: "wiz-format", value: formatValue };
        }
    }

    if (isBigIntFormat(type, nodeText)) {
        const formatValue =
            getFormatLiteral<BigIntFormatType>(type) ??
            extractFormatFromText<BigIntFormatType>(nodeText, "BigIntFormat");
        if (formatValue) {
            return { name: "wiz-format", value: formatValue };
        }
    }

    if (isDateFormat(type, nodeText)) {
        const formatValue =
            getFormatLiteral<DateFormatType>(type) ?? extractFormatFromText<DateFormatType>(nodeText, "DateFormat");
        if (formatValue) {
            return { name: "wiz-format", value: formatValue };
        }
    }

    return undefined;
}

// Format JSDoc comment for protobuf
function formatProtobufComment(comment: JSDocComment | undefined, indent: string = ""): string {
    if (!comment) return "";

    const lines: string[] = [];

    // Add description
    if (comment.description) {
        // Split description by newlines and format each line
        const descLines = comment.description.split("\n");
        for (const line of descLines) {
            lines.push(`${indent}// ${line}`);
        }
    }

    // Add tags
    for (const tag of comment.tags) {
        if (tag.value) {
            lines.push(`${indent}// @${tag.name} ${tag.value}`);
        } else {
            lines.push(`${indent}// @${tag.name}`);
        }
    }

    return lines.length > 0 ? lines.join("\n") + "\n" : "";
}

// Map TypeScript types to protobuf types
function mapToProtobufType(type: Type): string {
    // Handle union types - extract non-undefined type
    if (type.isUnion()) {
        const nonUndefinedTypes = type.getUnionTypes().filter((t: Type) => !t.isUndefined() && !t.isNull());
        if (nonUndefinedTypes.length === 1) {
            // Single non-undefined type in the union, use it
            return mapToProtobufType(nonUndefinedTypes[0]!);
        }
        // Multiple non-undefined types or no non-undefined types - fallthrough
    }

    if (type.isString() || type.isStringLiteral()) {
        return "string";
    }

    if (type.isNumber() || type.isNumberLiteral()) {
        return "int32"; // Default to int32, can be enhanced with JSDoc hints
    }

    if (type.isBoolean() || type.isBooleanLiteral()) {
        return "bool";
    }

    if (type.isArray()) {
        const elementType = type.getArrayElementType();
        if (elementType) {
            return mapToProtobufType(elementType);
        }
        return "bytes"; // fallback
    }

    // For object types, try to get the type name
    // Try alias symbol first (for type aliases like 'type Address = {...}')
    const aliasSymbol = type.getAliasSymbol();
    if (aliasSymbol) {
        const name = aliasSymbol.getName();
        if (name && name !== "__type") {
            return name;
        }
    }

    // Try regular symbol
    const symbol = type.getSymbol();
    if (symbol) {
        const name = symbol.getName();
        if (name && name !== "__type") {
            return name;
        }
    }

    // Check for special types
    const typeText = type.getText();
    if (typeText.includes("Date")) {
        return "int64"; // Unix timestamp
    }

    // Last resort: return the type text if it's not too long
    if (typeText && typeText.length < 50 && !typeText.includes("{")) {
        return typeText.replace(/\s+/g, "");
    }

    return "bytes"; // fallback for unknown types
}

// Check if type is optional (has undefined in union)
function isOptionalType(type: Type): boolean {
    if (type.isUndefined()) {
        return true;
    }

    if (type.isUnion()) {
        return type.getUnionTypes().some((t: Type) => t.isUndefined());
    }

    return false;
}

// Get non-undefined type from a potentially optional type
function getNonUndefinedType(type: Type): Type {
    if (type.isUnion()) {
        const nonUndefinedTypes = type.getUnionTypes().filter((t: Type) => !t.isUndefined());

        // If there's only one non-undefined type, return it
        if (nonUndefinedTypes.length === 1) {
            return nonUndefinedTypes[0]!;
        }

        // Check if the union without undefined is a boolean (true | false)
        if (nonUndefinedTypes.length === 2) {
            const allBoolLiterals = nonUndefinedTypes.every((t: Type) => t.isBooleanLiteral());
            if (allBoolLiterals) {
                // This is a boolean type (true | false), return the first type
                // which will be recognized as part of a boolean by isBoolean()
                return nonUndefinedTypes[0]!;
            }
        }

        // If multiple non-undefined types, return the original union type
        return type;
    }
    return type;
}

// Check if type is an array
function isArrayType(type: Type): boolean {
    return type.isArray();
}

// Check if type is a map (Record<string, T> or { [key: string]: T })
function isMapType(type: Type): { isMap: boolean; keyType?: string; valueType?: string } {
    // Don't treat primitive types as maps
    if (
        type.isString() ||
        type.isStringLiteral() ||
        type.isNumber() ||
        type.isNumberLiteral() ||
        type.isBoolean() ||
        type.isBooleanLiteral() ||
        type.isUndefined() ||
        type.isNull()
    ) {
        return { isMap: false };
    }

    // Check for Record<K, V> utility type
    const typeText = type.getText();
    if (typeText.startsWith("Record<")) {
        // Extract key and value types from Record<K, V>
        const match = typeText.match(/Record<\s*([^,]+)\s*,\s*(.+)\s*>$/);
        if (match) {
            return {
                isMap: true,
                keyType: match[1]?.trim(),
                valueType: match[2]?.trim(),
            };
        }
    }

    // Check for index signature { [key: string]: T }
    // Only check for object types with explicit index signatures
    const indexSignatures = type.getNumberIndexType() || type.getStringIndexType();
    if (indexSignatures && type.isObject()) {
        // Make sure this is actually an index signature type, not just an object with properties
        const properties = type.getProperties();
        // If it has both index signatures and regular properties, it's not a pure map
        if (properties.length === 0 || typeText.includes("[key:")) {
            return {
                isMap: true,
                keyType: "string",
                valueType: indexSignatures.getText(),
            };
        }
    }

    return { isMap: false };
}

// Generate protobuf message from TypeScript type
export function generateProtobufMessage(
    type: Type,
    typeName: string,
    availableTypes: Set<string>,
    opt: WizPluginOptions,
    typeDeclaration?: Node,
): any {
    resetFieldCounter();

    const properties = type.getProperties();
    const fields: any[] = [];

    // Extract JSDoc comment from the type declaration (message-level)
    const messageComment = extractJSDocComment(typeDeclaration);

    for (const prop of properties) {
        const propName = prop.getName();
        const declarations = prop.getDeclarations();
        if (declarations.length === 0) continue;

        const declaration = declarations[0];
        if (!declaration) continue;

        // Get the type from the declaration
        let propType: Type;
        if ("getType" in declaration && typeof declaration.getType === "function") {
            propType = (declaration as any).getType();
        } else {
            // Fallback - skip if we can't get the type
            continue;
        }

        const isOptional = isOptionalType(propType);
        const actualType = getNonUndefinedType(propType);
        const isRepeated = isArrayType(actualType);
        const mapInfo = isMapType(actualType);

        let fieldType: string;
        let field: any = {
            name: propName,
            number: getNextFieldNumber(),
        };

        // Extract JSDoc comment from field declaration
        const fieldComment = extractJSDocComment(declaration);

        // Check for wiz tagging interface and add it to comments
        const typeNode =
            Node.isPropertySignature(declaration) || Node.isPropertyDeclaration(declaration)
                ? declaration.getTypeNode()
                : undefined;
        const nodeText = typeNode?.getText();
        const wizTag = extractWizTag(actualType, nodeText);

        if (fieldComment || wizTag) {
            const comment = fieldComment || { description: undefined, tags: [] };
            if (wizTag) {
                // Add wiz tag to the tags array
                comment.tags.push(wizTag);
            }
            field.comment = comment;
        }

        if (mapInfo.isMap) {
            // Map field
            field.map = {
                keyType: "string", // Protobuf maps only support string or int keys
                valueType: mapInfo.valueType || "string",
            };
            fieldType = `map<${field.map.keyType}, ${field.map.valueType}>`;
        } else if (isRepeated) {
            // Repeated field
            const elementType = actualType.getArrayElementType();
            if (elementType) {
                fieldType = mapToProtobufType(elementType);
                field.repeated = true;
            } else {
                fieldType = "bytes";
            }
        } else {
            // Regular field
            fieldType = mapToProtobufType(actualType);
        }

        if (isOptional && !isRepeated && !mapInfo.isMap) {
            field.optional = true;
        }

        field.type = fieldType;
        fields.push(field);
    }

    return {
        name: typeName,
        fields,
        comment: messageComment,
    };
}

// Generate protobuf model from multiple types
export function createProtobufModel(
    types: Type[],
    typeNames: string[],
    packageName: string,
    opt: WizPluginOptions,
    typeDeclarations?: (Node | undefined)[],
): any {
    const messages: Record<string, any> = {};
    const availableTypes = new Set(typeNames);

    for (let i = 0; i < types.length; i++) {
        const type = types[i]!;
        const typeName = typeNames[i]!;
        const typeDeclaration = typeDeclarations?.[i];
        messages[typeName] = generateProtobufMessage(type, typeName, availableTypes, opt, typeDeclaration);
    }

    return {
        syntax: "proto3",
        package: packageName,
        messages,
    };
}

// Convert protobuf model to .proto file string
export function protobufModelToString(model: any): string {
    let proto = `syntax = "${model.syntax}";\n\n`;

    if (model.package) {
        proto += `package ${model.package};\n\n`;
    }

    // Generate enums
    if (model.enums) {
        for (const [enumName, enumDef] of Object.entries(model.enums) as any) {
            proto += `enum ${enumName} {\n`;
            for (const value of enumDef.values) {
                proto += `  ${value.name} = ${value.number};\n`;
            }
            proto += `}\n\n`;
        }
    }

    // Generate messages
    for (const [messageName, message] of Object.entries(model.messages) as any) {
        // Add message-level comment if present
        if (message.comment) {
            proto += formatProtobufComment(message.comment, "");
        }

        proto += `message ${messageName} {\n`;
        for (const field of message.fields) {
            // Add field-level comment if present
            if (field.comment) {
                proto += formatProtobufComment(field.comment, "  ");
            }

            let fieldLine = "  ";

            if (field.repeated) {
                fieldLine += "repeated ";
            } else if (field.optional) {
                fieldLine += "optional ";
            }

            if (field.map) {
                fieldLine += `map<${field.map.keyType}, ${field.map.valueType}> ${field.name} = ${field.number};\n`;
            } else {
                fieldLine += `${field.type} ${field.name} = ${field.number};\n`;
            }

            proto += fieldLine;
        }
        proto += `}\n\n`;
    }

    // Generate services
    if (model.services) {
        for (const [serviceName, service] of Object.entries(model.services) as any) {
            proto += `service ${serviceName} {\n`;
            for (const method of service.methods) {
                const reqStream = method.requestStreaming ? "stream " : "";
                const resStream = method.responseStreaming ? "stream " : "";
                proto += `  rpc ${method.name}(${reqStream}${method.requestType}) returns (${resStream}${method.responseType});\n`;
            }
            proto += `}\n\n`;
        }
    }

    return proto;
}
