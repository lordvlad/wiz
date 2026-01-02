import type { Type, TypeFormatFlags } from "ts-morph";

import type { WizPluginOptions } from "..";

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

// Map TypeScript types to protobuf types
function mapToProtobufType(type: Type): string {
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

    // For object types, return the type name
    const symbol = type.getSymbol() || type.getAliasSymbol();
    if (symbol) {
        return symbol.getName();
    }

    // Check for special types
    const typeText = type.getText();
    if (typeText.includes("Date")) {
        return "int64"; // Unix timestamp
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
        if (nonUndefinedTypes.length === 1) {
            return nonUndefinedTypes[0]!;
        }
        // If multiple non-undefined types, return the union type
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
    const indexSignatures = type.getNumberIndexType() || type.getStringIndexType();
    if (indexSignatures) {
        return {
            isMap: true,
            keyType: "string",
            valueType: indexSignatures.getText(),
        };
    }

    return { isMap: false };
}

// Generate protobuf message from TypeScript type
export function generateProtobufMessage(
    type: Type,
    typeName: string,
    availableTypes: Set<string>,
    opt: WizPluginOptions,
): any {
    resetFieldCounter();

    const properties = type.getProperties();
    const fields: any[] = [];

    for (const prop of properties) {
        const propName = prop.getName();
        const declarations = prop.getDeclarations();
        if (declarations.length === 0) continue;

        const declaration = declarations[0];
        if (!declaration) continue;

        // @ts-ignore - getType exists on property signature
        const propType = declaration.getType ? declaration.getType() : type.getPropertyOrThrow(propName);

        const isOptional = isOptionalType(propType);
        const actualType = getNonUndefinedType(propType);
        const isRepeated = isArrayType(actualType);
        const mapInfo = isMapType(actualType);

        let fieldType: string;
        let field: any = {
            name: propName,
            number: getNextFieldNumber(),
        };

        if (mapInfo.isMap) {
            // Map field
            field.map = {
                keyType: mapToProtobufType(type),
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
    };
}

// Generate protobuf model from multiple types
export function createProtobufModel(
    types: Type[],
    typeNames: string[],
    packageName: string,
    opt: WizPluginOptions,
): any {
    const messages: Record<string, any> = {};
    const availableTypes = new Set(typeNames);

    for (let i = 0; i < types.length; i++) {
        const type = types[i]!;
        const typeName = typeNames[i]!;
        messages[typeName] = generateProtobufMessage(type, typeName, availableTypes, opt);
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
        proto += `message ${messageName} {\n`;
        for (const field of message.fields) {
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
