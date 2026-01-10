/**
 * IR to JSON Stringify/Parse generator
 *
 * Generates optimized JSON serialization and parsing functions from IR types.
 */
import type { IRType } from "../types";
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

/**
 * Options for JSON generator
 */
export interface JsonGeneratorOptions {
    /** Function name for stringify */
    stringifyName?: string;
    /** Function name for parse */
    parseName?: string;
    /** Whether to validate during serialization */
    validate?: boolean;
}

/**
 * Generate optimized JSON stringify function from IR type
 */
export function irToJsonStringify(type: IRType, options: JsonGeneratorOptions = {}): string {
    const functionName = options.stringifyName || "stringify";
    const validate = options.validate ?? true;

    const serializeCode = generateSerializeCode(type, "value", "parts");

    // Generate as IIFE for easier AST replacement in transforms
    if (validate) {
        return `
(function(value, buf) {
    const parts = [];
    const errors = [];
    ${serializeCode}
    
    if (errors.length > 0) {
        const errorMsg = errors.map(e => e.path + ": " + e.message).join("; ");
        throw new TypeError("Serialization validation failed: " + errorMsg);
    }
    
    if (buf) {
        const str = parts.join("");
        buf.write(str, 0, str.length, "utf-8");
    } else {
        return parts.join("");
    }
})
        `.trim();
    } else {
        return `
(function(value, buf) {
    const parts = [];
    ${serializeCode}
    
    if (buf) {
        const str = parts.join("");
        buf.write(str, 0, str.length, "utf-8");
    } else {
        return parts.join("");
    }
})
        `.trim();
    }
}

/**
 * Generate serialization code for a type
 */
function generateSerializeCode(type: IRType, varName: string, partsArray: string): string {
    if (isPrimitive(type)) {
        return generatePrimitiveSerialize(type.primitiveType, varName, partsArray);
    }

    if (isLiteral(type)) {
        return `${partsArray}.push(${JSON.stringify(JSON.stringify(type.value))});`;
    }

    if (isArray(type)) {
        const itemVar = `${varName}_item`;
        const indexVar = `${varName}_i`;
        const itemSerialize = generateSerializeCode(type.items, itemVar, partsArray);

        return `
    if (!Array.isArray(${varName})) {
        errors.push({ path: "", message: "expected array" });
    } else {
        ${partsArray}.push("[");
        for (let ${indexVar} = 0; ${indexVar} < ${varName}.length; ${indexVar}++) {
            if (${indexVar} > 0) ${partsArray}.push(",");
            const ${itemVar} = ${varName}[${indexVar}];
            ${itemSerialize}
        }
        ${partsArray}.push("]");
    }
        `.trim();
    }

    if (isObject(type)) {
        let code = `
    if (typeof ${varName} !== "object" || ${varName} === null || Array.isArray(${varName})) {
        errors.push({ path: "", message: "expected object" });
    } else {
        ${partsArray}.push("{");
        let first = true;
        `.trim();

        for (const prop of type.properties) {
            const propVar = `${varName}_${prop.name}`;
            const propSerialize = generateSerializeCode(prop.type, propVar, partsArray);

            if (prop.required) {
                code += `
        if (!(${JSON.stringify(prop.name)} in ${varName})) {
            errors.push({ path: ".${prop.name}", message: "missing required property" });
        } else {
            if (!first) ${partsArray}.push(",");
            first = false;
            ${partsArray}.push(${JSON.stringify(JSON.stringify(prop.name) + ":")});
            const ${propVar} = ${varName}[${JSON.stringify(prop.name)}];
            ${propSerialize}
        }`;
            } else {
                code += `
        if (${JSON.stringify(prop.name)} in ${varName}) {
            if (!first) ${partsArray}.push(",");
            first = false;
            ${partsArray}.push(${JSON.stringify(JSON.stringify(prop.name) + ":")});
            const ${propVar} = ${varName}[${JSON.stringify(prop.name)}];
            ${propSerialize}
        }`;
            }
        }

        code += `
        ${partsArray}.push("}");
    }`;
        return code;
    }

    if (isReference(type)) {
        // For references, just use JSON.stringify
        return `${partsArray}.push(JSON.stringify(${varName}));`;
    }

    if (isUnion(type)) {
        // For unions, we try each type until one works
        let code = `
    // Union type serialization
    const unionParts = [];
    const unionErrors = [];
    let unionSuccess = false;
        `.trim();

        for (let i = 0; i < type.types.length; i++) {
            const unionType = type.types[i]!;
            const unionSerialize = generateSerializeCode(unionType, varName, "unionParts");

            code += `
    if (!unionSuccess) {
        unionParts.length = 0;
        const savedErrors = errors.slice();
        errors.length = 0;
        ${unionSerialize}
        if (errors.length === 0) {
            unionSuccess = true;
            ${partsArray}.push(...unionParts);
            errors.push(...savedErrors);
        } else {
            unionErrors.push(...errors);
            errors.length = 0;
            errors.push(...savedErrors);
        }
    }`;
        }

        code += `
    if (!unionSuccess) {
        errors.push({ path: "", message: "value does not match any union member" });
    }`;

        return code;
    }

    if (isMap(type)) {
        const valVar = `${varName}_val`;
        const keyVar = `${varName}_key`;
        const valSerialize = generateSerializeCode(type.valueType, valVar, partsArray);

        return `
    if (typeof ${varName} !== "object" || ${varName} === null || Array.isArray(${varName})) {
        errors.push({ path: "", message: "expected object (map)" });
    } else {
        ${partsArray}.push("{");
        let first = true;
        for (const ${keyVar} in ${varName}) {
            if (!first) ${partsArray}.push(",");
            first = false;
            ${partsArray}.push(JSON.stringify(${keyVar}) + ":");
            const ${valVar} = ${varName}[${keyVar}];
            ${valSerialize}
        }
        ${partsArray}.push("}");
    }
        `.trim();
    }

    if (isEnum(type)) {
        const enumValues = type.members.map((m) => JSON.stringify(m.value)).join(", ");
        return `
    if (![${enumValues}].includes(${varName})) {
        errors.push({ path: "", message: "invalid enum value" });
    } else {
        ${partsArray}.push(JSON.stringify(${varName}));
    }
        `.trim();
    }

    // Default: use JSON.stringify
    return `${partsArray}.push(JSON.stringify(${varName}));`;
}

/**
 * Generate serialization for primitive types
 */
function generatePrimitiveSerialize(primitiveType: string, varName: string, partsArray: string): string {
    switch (primitiveType) {
        case "string":
            return `
    if (typeof ${varName} !== "string") {
        errors.push({ path: "", message: "expected string" });
    } else {
        ${partsArray}.push(JSON.stringify(${varName}));
    }
            `.trim();

        case "number":
        case "integer":
            return `
    if (typeof ${varName} !== "number") {
        errors.push({ path: "", message: "expected number" });
    } else {
        ${partsArray}.push(String(${varName}));
    }
            `.trim();

        case "boolean":
            return `
    if (typeof ${varName} !== "boolean") {
        errors.push({ path: "", message: "expected boolean" });
    } else {
        ${partsArray}.push(${varName} ? "true" : "false");
    }
            `.trim();

        case "null":
            return `
    if (${varName} !== null) {
        errors.push({ path: "", message: "expected null" });
    } else {
        ${partsArray}.push("null");
    }
            `.trim();

        case "any":
        case "unknown":
            return `${partsArray}.push(JSON.stringify(${varName}));`;

        default:
            return `${partsArray}.push(JSON.stringify(${varName}));`;
    }
}

/**
 * Generate optimized JSON parse function from IR type
 */
export function irToJsonParse(type: IRType, options: JsonGeneratorOptions = {}): string {
    const functionName = options.parseName || "parse";

    return `
function ${functionName}(json) {
    const value = JSON.parse(json);
    const errors = [];
    // Validation would go here
    if (errors.length > 0) {
        throw new TypeError("Parse validation failed: " + errors.map(e => e.path + ": " + e.message).join(", "));
    }
    return value;
}
    `.trim();
}
