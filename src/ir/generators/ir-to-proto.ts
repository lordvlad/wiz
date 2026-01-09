/**
 * IR to Protobuf generator
 */
import type { IRSchema, IRType } from "../types";
import { isArray, isMap, isObject, isPrimitive, isReference } from "../utils";

export function irToProtobuf(schema: IRSchema): any {
    const messages: any = {};

    for (const typeDef of schema.types) {
        if (isObject(typeDef.type)) {
            messages[typeDef.name] = {
                name: typeDef.name,
                fields: typeDef.type.properties.map((prop, idx) => {
                    const fieldNumber = typeDef.fieldNumbers?.get(prop.name) || idx + 1;
                    return {
                        name: prop.name,
                        type: irTypeToProtoType(prop.type),
                        number: fieldNumber,
                        optional: !prop.required,
                        repeated: isArray(prop.type),
                    };
                }),
            };
        }
    }

    return {
        syntax: schema.version || "proto3",
        package: schema.package || "api",
        messages,
    };
}

function irTypeToProtoType(type: IRType): string {
    if (isPrimitive(type)) {
        switch (type.primitiveType) {
            case "string":
                return "string";
            case "number":
            case "integer":
                return "int32";
            case "boolean":
                return "bool";
            default:
                return "string";
        }
    }
    if (isArray(type)) {
        return irTypeToProtoType(type.items);
    }
    if (isReference(type)) {
        return type.name;
    }
    if (isMap(type)) {
        return "string";
    }
    return "string";
}
