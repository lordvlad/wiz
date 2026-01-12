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
 * Counter for generating unique variable names in parse validation code
 */
let parseVarCounter = 0;

function getUniqueVar(base: string): string {
    return `${base}_${parseVarCounter++}`;
}

/**
 * Generate optimized JSON parse function from IR type
 */
export function irToJsonParse(type: IRType, options: JsonGeneratorOptions = {}): string {
    // Reset counter for each new function
    parseVarCounter = 0;

    const validationCode = generateValidationCode(type, "parsed", "errors", "");

    // Generate as IIFE for easier AST replacement in transforms
    return `
(function(src) {
    const input = typeof src === "string" ? src : src.toString("utf-8");
    let parsed;
    try {
        parsed = JSON.parse(input);
    } catch (e) {
        throw new TypeError("Invalid JSON: " + e.message);
    }
    
    const errors = [];
    ${validationCode}
    
    if (errors.length > 0) {
        const errorMsg = errors.map(e => e.error + " at " + e.path).join("; ");
        throw new TypeError("Parse validation failed: " + errorMsg);
    }
    
    return parsed;
})
    `.trim();
}

/**
 * Generate validation code for parsed JSON
 */
function generateValidationCode(type: IRType, varName: string, errorsArray: string, path: string): string {
    if (isPrimitive(type)) {
        return generatePrimitiveValidation(type.primitiveType, varName, errorsArray, path);
    }

    if (isLiteral(type)) {
        const literalValue = JSON.stringify(type.value);
        return `
    if (${varName} !== ${literalValue}) {
        ${errorsArray}.push({
            path: "${path}",
            error: "expected literal ${literalValue}, got " + JSON.stringify(${varName})
        });
    }
        `.trim();
    }

    if (isArray(type)) {
        return generateArrayValidation(type, varName, errorsArray, path);
    }

    if (isObject(type)) {
        return generateObjectValidation(type, varName, errorsArray, path);
    }

    if (isUnion(type)) {
        return generateUnionValidation(type, varName, errorsArray, path);
    }

    if (isMap(type)) {
        return generateMapValidation(type, varName, errorsArray, path);
    }

    if (isEnum(type)) {
        return generateEnumValidation(type, varName, errorsArray, path);
    }

    if (isReference(type)) {
        // For references, we can't validate structure - trust it
        return "";
    }

    // Default: no validation
    return "";
}

/**
 * Generate validation code with dynamic path (for use in loops)
 */
function generateValidationCodeDynamic(type: IRType, varName: string, errorsArray: string, pathVar: string): string {
    if (isPrimitive(type)) {
        return generatePrimitiveValidationDynamic(type.primitiveType, varName, errorsArray, pathVar);
    }

    if (isLiteral(type)) {
        const literalValue = JSON.stringify(type.value);
        return `
    if (${varName} !== ${literalValue}) {
        ${errorsArray}.push({
            path: ${pathVar},
            error: "expected literal ${literalValue}, got " + JSON.stringify(${varName})
        });
    }
        `.trim();
    }

    if (isArray(type)) {
        return generateArrayValidationDynamic(type, varName, errorsArray, pathVar);
    }

    if (isObject(type)) {
        return generateObjectValidationDynamic(type, varName, errorsArray, pathVar);
    }

    if (isUnion(type)) {
        return generateUnionValidationDynamic(type, varName, errorsArray, pathVar);
    }

    if (isMap(type)) {
        return generateMapValidationDynamic(type, varName, errorsArray, pathVar);
    }

    if (isEnum(type)) {
        return generateEnumValidationDynamic(type, varName, errorsArray, pathVar);
    }

    // Default: no validation
    return "";
}

/**
 * Generate validation for primitive types
 */
function generatePrimitiveValidation(
    primitiveType: string,
    varName: string,
    errorsArray: string,
    path: string,
): string {
    switch (primitiveType) {
        case "string":
            return `
    if (typeof ${varName} !== "string") {
        ${errorsArray}.push({
            path: "${path}",
            error: "expected string, got " + typeof ${varName}
        });
    }
            `.trim();

        case "number":
        case "integer":
            return `
    if (typeof ${varName} !== "number") {
        ${errorsArray}.push({
            path: "${path}",
            error: "expected number, got " + typeof ${varName}
        });
    }
            `.trim();

        case "boolean":
            return `
    if (typeof ${varName} !== "boolean") {
        ${errorsArray}.push({
            path: "${path}",
            error: "expected boolean, got " + typeof ${varName}
        });
    }
            `.trim();

        case "null":
            return `
    if (${varName} !== null) {
        ${errorsArray}.push({
            path: "${path}",
            error: "expected null, got " + typeof ${varName}
        });
    }
            `.trim();

        case "any":
        case "unknown":
            return ""; // No validation for any/unknown

        default:
            return "";
    }
}

/**
 * Generate validation for primitive types with dynamic path
 */
function generatePrimitiveValidationDynamic(
    primitiveType: string,
    varName: string,
    errorsArray: string,
    pathVar: string,
): string {
    switch (primitiveType) {
        case "string":
            return `
    if (typeof ${varName} !== "string") {
        ${errorsArray}.push({
            path: ${pathVar},
            error: "expected string, got " + typeof ${varName}
        });
    }
            `.trim();

        case "number":
        case "integer":
            return `
    if (typeof ${varName} !== "number") {
        ${errorsArray}.push({
            path: ${pathVar},
            error: "expected number, got " + typeof ${varName}
        });
    }
            `.trim();

        case "boolean":
            return `
    if (typeof ${varName} !== "boolean") {
        ${errorsArray}.push({
            path: ${pathVar},
            error: "expected boolean, got " + typeof ${varName}
        });
    }
            `.trim();

        case "null":
            return `
    if (${varName} !== null) {
        ${errorsArray}.push({
            path: ${pathVar},
            error: "expected null, got " + typeof ${varName}
        });
    }
            `.trim();

        case "any":
        case "unknown":
            return "";

        default:
            return "";
    }
}

/**
 * Generate validation for array types
 */
function generateArrayValidation(
    type: { kind: "array"; items: IRType },
    varName: string,
    errorsArray: string,
    path: string,
): string {
    const itemVar = getUniqueVar("item");
    const indexVar = getUniqueVar("i");
    const pathVar = getUniqueVar("itemPath");
    const itemValidation = generateValidationCodeDynamic(type.items, itemVar, errorsArray, pathVar);

    return `
    if (!Array.isArray(${varName})) {
        ${errorsArray}.push({
            path: "${path}",
            error: "expected array, got " + typeof ${varName}
        });
    } else {
        for (let ${indexVar} = 0; ${indexVar} < ${varName}.length; ${indexVar}++) {
            const ${itemVar} = ${varName}[${indexVar}];
            const ${pathVar} = "${path}" + "[" + ${indexVar} + "]";
            ${itemValidation}
        }
    }
    `.trim();
}

/**
 * Generate validation for array types with dynamic path
 */
function generateArrayValidationDynamic(
    type: { kind: "array"; items: IRType },
    varName: string,
    errorsArray: string,
    pathVar: string,
): string {
    const itemVar = getUniqueVar("item");
    const indexVar = getUniqueVar("i");
    const nestedPathVar = getUniqueVar("nestedPath");
    const itemValidation = generateValidationCodeDynamic(type.items, itemVar, errorsArray, nestedPathVar);

    return `
    if (!Array.isArray(${varName})) {
        ${errorsArray}.push({
            path: ${pathVar},
            error: "expected array, got " + typeof ${varName}
        });
    } else {
        for (let ${indexVar} = 0; ${indexVar} < ${varName}.length; ${indexVar}++) {
            const ${itemVar} = ${varName}[${indexVar}];
            const ${nestedPathVar} = ${pathVar} + "[" + ${indexVar} + "]";
            ${itemValidation}
        }
    }
    `.trim();
}

/**
 * Generate validation for object types
 */
function generateObjectValidation(
    type: { kind: "object"; properties: Array<{ name: string; type: IRType; required: boolean }> },
    varName: string,
    errorsArray: string,
    path: string,
): string {
    let code = `
    if (typeof ${varName} !== "object" || ${varName} === null) {
        ${errorsArray}.push({
            path: "${path}",
            error: "expected object, got " + typeof ${varName}
        });
    } else {
    `.trim();

    for (const prop of type.properties) {
        const propVarName = `${varName}[${JSON.stringify(prop.name)}]`;
        const propPath = path ? `${path}.${prop.name}` : prop.name;

        if (prop.required) {
            code += `
        if (${propVarName} === undefined) {
            ${errorsArray}.push({
                path: "${propPath}",
                error: "required property is missing"
            });
        } else {
            ${generateValidationCode(prop.type, propVarName, errorsArray, propPath)}
        }`;
        } else {
            code += `
        if (${propVarName} !== undefined) {
            ${generateValidationCode(prop.type, propVarName, errorsArray, propPath)}
        }`;
        }
    }

    code += `
    }`;
    return code;
}

/**
 * Generate validation for object types with dynamic path
 */
function generateObjectValidationDynamic(
    type: { kind: "object"; properties: Array<{ name: string; type: IRType; required: boolean }> },
    varName: string,
    errorsArray: string,
    pathVar: string,
): string {
    let code = `
    if (typeof ${varName} !== "object" || ${varName} === null) {
        ${errorsArray}.push({
            path: ${pathVar},
            error: "expected object, got " + typeof ${varName}
        });
    } else {
    `.trim();

    for (const prop of type.properties) {
        const propVarName = `${varName}[${JSON.stringify(prop.name)}]`;
        const propPathVar = getUniqueVar("propPath");

        if (prop.required) {
            code += `
        if (${propVarName} === undefined) {
            ${errorsArray}.push({
                path: ${pathVar} + ".${prop.name}",
                error: "required property is missing"
            });
        } else {
            const ${propPathVar} = ${pathVar} + ".${prop.name}";
            ${generateValidationCodeDynamic(prop.type, propVarName, errorsArray, propPathVar)}
        }`;
        } else {
            code += `
        if (${propVarName} !== undefined) {
            const ${propPathVar} = ${pathVar} + ".${prop.name}";
            ${generateValidationCodeDynamic(prop.type, propVarName, errorsArray, propPathVar)}
        }`;
        }
    }

    code += `
    }`;
    return code;
}

/**
 * Generate validation for union types
 */
function generateUnionValidation(
    type: { kind: "union"; types: IRType[] },
    varName: string,
    errorsArray: string,
    path: string,
): string {
    // Check for null/undefined in union
    const hasNull = type.types.some((t) => isPrimitive(t) && t.primitiveType === "null");
    const otherTypes = type.types.filter((t) => !(isPrimitive(t) && t.primitiveType === "null"));

    if (otherTypes.length === 0 && hasNull) {
        // Only null type
        return generatePrimitiveValidation("null", varName, errorsArray, path);
    }

    let code = `
    {
        const errorCount = ${errorsArray}.length;
        let valid = false;
    `.trim();

    for (let i = 0; i < otherTypes.length; i++) {
        const unionType = otherTypes[i]!;
        code += `
        if (!valid) {
            const errLen_${i} = ${errorsArray}.length;
            ${generateValidationCode(unionType, varName, errorsArray, path)}
            if (${errorsArray}.length === errLen_${i}) {
                valid = true;
            } else {
                ${errorsArray}.length = errLen_${i};
            }
        }`;
    }

    if (hasNull) {
        code += `
        if (${varName} === null) {
            valid = true;
            ${errorsArray}.length = errorCount;
        }`;
    }

    code += `
        if (!valid) {
            ${errorsArray}.push({
                path: "${path}",
                error: "value does not match any union member"
            });
        }
    }`;

    return code;
}

/**
 * Generate validation for union types with dynamic path
 */
function generateUnionValidationDynamic(
    type: { kind: "union"; types: IRType[] },
    varName: string,
    errorsArray: string,
    pathVar: string,
): string {
    const hasNull = type.types.some((t) => isPrimitive(t) && t.primitiveType === "null");
    const otherTypes = type.types.filter((t) => !(isPrimitive(t) && t.primitiveType === "null"));

    if (otherTypes.length === 0 && hasNull) {
        return generatePrimitiveValidationDynamic("null", varName, errorsArray, pathVar);
    }

    let code = `
    {
        const errorCount = ${errorsArray}.length;
        let valid = false;
    `.trim();

    for (let i = 0; i < otherTypes.length; i++) {
        const unionType = otherTypes[i]!;
        code += `
        if (!valid) {
            const errLen_${i} = ${errorsArray}.length;
            ${generateValidationCodeDynamic(unionType, varName, errorsArray, pathVar)}
            if (${errorsArray}.length === errLen_${i}) {
                valid = true;
            } else {
                ${errorsArray}.length = errLen_${i};
            }
        }`;
    }

    if (hasNull) {
        code += `
        if (${varName} === null) {
            valid = true;
            ${errorsArray}.length = errorCount;
        }`;
    }

    code += `
        if (!valid) {
            ${errorsArray}.push({
                path: ${pathVar},
                error: "value does not match any union member"
            });
        }
    }`;

    return code;
}

/**
 * Generate validation for map types
 */
function generateMapValidation(
    type: { kind: "map"; keyType: IRType; valueType: IRType },
    varName: string,
    errorsArray: string,
    path: string,
): string {
    const keyVar = getUniqueVar("key");
    const valVar = getUniqueVar("val");
    const valPathVar = getUniqueVar("valPath");
    const valValidation = generateValidationCodeDynamic(type.valueType, valVar, errorsArray, valPathVar);

    return `
    if (typeof ${varName} !== "object" || ${varName} === null || Array.isArray(${varName})) {
        ${errorsArray}.push({
            path: "${path}",
            error: "expected object (map), got " + typeof ${varName}
        });
    } else {
        for (const ${keyVar} in ${varName}) {
            const ${valVar} = ${varName}[${keyVar}];
            const ${valPathVar} = "${path}" + "[" + ${keyVar} + "]";
            ${valValidation}
        }
    }
    `.trim();
}

/**
 * Generate validation for map types with dynamic path
 */
function generateMapValidationDynamic(
    type: { kind: "map"; keyType: IRType; valueType: IRType },
    varName: string,
    errorsArray: string,
    pathVar: string,
): string {
    const keyVar = getUniqueVar("key");
    const valVar = getUniqueVar("val");
    const nestedValPathVar = getUniqueVar("nestedValPath");
    const valValidation = generateValidationCodeDynamic(type.valueType, valVar, errorsArray, nestedValPathVar);

    return `
    if (typeof ${varName} !== "object" || ${varName} === null || Array.isArray(${varName})) {
        ${errorsArray}.push({
            path: ${pathVar},
            error: "expected object (map), got " + typeof ${varName}
        });
    } else {
        for (const ${keyVar} in ${varName}) {
            const ${valVar} = ${varName}[${keyVar}];
            const ${nestedValPathVar} = ${pathVar} + "[" + ${keyVar} + "]";
            ${valValidation}
        }
    }
    `.trim();
}

/**
 * Generate validation for enum types
 */
function generateEnumValidation(
    type: { kind: "enum"; members: Array<{ name: string; value: string | number }> },
    varName: string,
    errorsArray: string,
    path: string,
): string {
    const enumValues = type.members.map((m) => JSON.stringify(m.value)).join(", ");
    return `
    if (![${enumValues}].includes(${varName})) {
        ${errorsArray}.push({
            path: "${path}",
            error: "invalid enum value, expected one of: ${enumValues}"
        });
    }
    `.trim();
}

/**
 * Generate validation for enum types with dynamic path
 */
function generateEnumValidationDynamic(
    type: { kind: "enum"; members: Array<{ name: string; value: string | number }> },
    varName: string,
    errorsArray: string,
    pathVar: string,
): string {
    const enumValues = type.members.map((m) => JSON.stringify(m.value)).join(", ");
    return `
    if (![${enumValues}].includes(${varName})) {
        ${errorsArray}.push({
            path: ${pathVar},
            error: "invalid enum value, expected one of: ${enumValues}"
        });
    }
    `.trim();
}
