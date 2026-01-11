/**
 * IR to TypeScript generator
 */
import type { IRSchema, IRType } from "../types";
import {
    isArray,
    isEnum,
    isIntersection,
    isLiteral,
    isMap,
    isObject,
    isPrimitive,
    isReference,
    isUnion,
} from "../utils";

export function irToTypeScript(schema: IRSchema): Map<string, string> {
    const result = new Map<string, string>();

    for (const typeDef of schema.types) {
        let code = "";
        if (typeDef.metadata?.description) {
            code += `/**\n * ${typeDef.metadata.description}\n */\n`;
        }
        code += `export type ${typeDef.name} = ${irTypeToTs(typeDef.type, schema)};\n`;
        result.set(typeDef.name, code);
    }

    return result;
}

function irTypeToTs(type: IRType, schema: IRSchema): string {
    if (isPrimitive(type)) {
        switch (type.primitiveType) {
            case "string":
                return "string";
            case "number":
            case "integer":
                return "number";
            case "boolean":
                return "boolean";
            case "null":
                return "null";
            case "any":
                return "any";
            case "unknown":
                return "unknown";
            case "never":
                return "never";
            case "void":
                return "void";
        }
    }
    if (isLiteral(type)) {
        return JSON.stringify(type.value);
    }
    if (isArray(type)) {
        return `${irTypeToTs(type.items, schema)}[]`;
    }
    if (isObject(type)) {
        if (type.properties.length === 0) {
            return "{}";
        }
        const props = type.properties.map((prop) => {
            const optional = !prop.required ? "?" : "";
            return `  ${prop.name}${optional}: ${irTypeToTs(prop.type, schema)};`;
        });
        return `{\n${props.join("\n")}\n}`;
    }
    if (isReference(type)) {
        return type.name;
    }
    if (isUnion(type)) {
        return type.types.map((t) => irTypeToTs(t, schema)).join(" | ");
    }
    if (isIntersection(type)) {
        return type.types.map((t) => irTypeToTs(t, schema)).join(" & ");
    }
    if (isMap(type)) {
        return `Record<${irTypeToTs(type.keyType, schema)}, ${irTypeToTs(type.valueType, schema)}>`;
    }
    if (isEnum(type)) {
        return type.members.map((m) => JSON.stringify(m.value)).join(" | ");
    }
    return "any";
}
