/**
 * IR to TypeScript Validator generator
 *
 * Generates optimized validator functions from IR types.
 */
import type { IRConstraints, IRType } from "../types";
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
 * Options for validator generation
 */
export interface ValidatorOptions {
    /** Function name for the validator */
    functionName?: string;
    /** Whether to throw on validation failure or return errors */
    throwOnError?: boolean;
    /** Output style: 'function' for named function, 'iife' for IIFE, 'errors' for error array only */
    outputStyle?: "function" | "iife" | "errors";
}

/**
 * Generate a validator function from an IR type
 */
export function irToValidator(type: IRType, options: ValidatorOptions = {}): string {
    const functionName = options.functionName || "validate";
    const throwOnError = options.throwOnError ?? true;
    const outputStyle = options.outputStyle || "function";

    const validationCode = generateValidationCode(type, "value", "");

    // Base validator that returns errors array
    if (outputStyle === "errors") {
        return `
(function(value) {
    const errors = [];
    ${validationCode}
    return errors;
})
        `.trim();
    }

    // IIFE style
    if (outputStyle === "iife") {
        if (throwOnError) {
            return `
(function(value) {
    const errors = [];
    ${validationCode}
    if (errors.length > 0) {
        throw new TypeError("Validation failed: " + errors.map(e => e.path + ": " + e.message).join(", "));
    }
    return value;
})
            `.trim();
        } else {
            return `
(function(value) {
    const errors = [];
    ${validationCode}
    return { valid: errors.length === 0, errors, value };
})
            `.trim();
        }
    }

    // Named function style
    if (throwOnError) {
        return `
function ${functionName}(value) {
    const errors = [];
    ${validationCode}
    if (errors.length > 0) {
        throw new TypeError("Validation failed: " + errors.map(e => e.path + ": " + e.message).join(", "));
    }
    return value;
}
        `.trim();
    } else {
        return `
function ${functionName}(value) {
    const errors = [];
    ${validationCode}
    return { valid: errors.length === 0, errors, value };
}
        `.trim();
    }
}

/**
 * Generate validation code for a type
 */
function generateValidationCode(type: IRType, varName: string, path: string): string {
    const pathExpr = path ? `"${path}"` : '""';

    if (isPrimitive(type)) {
        return generatePrimitiveValidation(type.primitiveType, varName, pathExpr, type.constraints);
    }

    if (isLiteral(type)) {
        const literalValue = JSON.stringify(type.value);
        return `
    if (${varName} !== ${literalValue}) {
        errors.push({ path: ${pathExpr}, message: "expected ${escapeForString(String(type.value))}, got " + ${varName} });
    }
        `.trim();
    }

    if (isArray(type)) {
        const itemValidation = generateValidationCode(type.items, "item", path ? `${path}[i]` : "[i]");
        let code = `
    if (!Array.isArray(${varName})) {
        errors.push({ path: ${pathExpr}, message: "expected array, got " + typeof ${varName} });
    } else {
        `.trim();

        if (type.constraints?.minItems !== undefined) {
            code += `
        if (${varName}.length < ${type.constraints.minItems}) {
            errors.push({ path: ${pathExpr}, message: "array length must be >= ${type.constraints.minItems}" });
        }`;
        }

        if (type.constraints?.maxItems !== undefined) {
            code += `
        if (${varName}.length > ${type.constraints.maxItems}) {
            errors.push({ path: ${pathExpr}, message: "array length must be <= ${type.constraints.maxItems}" });
        }`;
        }

        code += `
        for (let i = 0; i < ${varName}.length; i++) {
            const item = ${varName}[i];
            ${itemValidation}
        }
    }`;
        return code;
    }

    if (isObject(type)) {
        let code = `
    if (typeof ${varName} !== "object" || ${varName} === null || Array.isArray(${varName})) {
        errors.push({ path: ${pathExpr}, message: "expected object, got " + typeof ${varName} });
    } else {
        `.trim();

        for (const prop of type.properties) {
            const propPath = path ? `${path}.${prop.name}` : prop.name;
            const propVarName = `${varName}["${prop.name}"]`;

            if (prop.required) {
                code += `
        if (!(${JSON.stringify(prop.name)} in ${varName})) {
            errors.push({ path: ${pathExpr}, message: "missing required property '${prop.name}'" });
        } else {
            ${generateValidationCode(prop.type, propVarName, propPath)}
        }`;
            } else {
                code += `
        if (${JSON.stringify(prop.name)} in ${varName}) {
            ${generateValidationCode(prop.type, propVarName, propPath)}
        }`;
            }
        }

        code += `
    }`;
        return code;
    }

    if (isReference(type)) {
        // For references, we'd need to look up the actual type
        // For now, just do a basic check
        return `
    // Reference to ${type.name} - validation delegated
        `.trim();
    }

    if (isUnion(type)) {
        return `
    // Union type validation
    let unionValid = false;
    const unionErrors = [];
    ${type.types
        .map(
            (t, i) => `
    {
        const tempErrors = [];
        const savedErrors = errors.slice();
        errors.length = 0;
        ${generateValidationCode(t, varName, path)}
        if (errors.length === 0) {
            unionValid = true;
            errors.push(...savedErrors);
        } else {
            unionErrors.push(...errors);
            errors.length = 0;
            errors.push(...savedErrors);
        }
    }`,
        )
        .join("\n")}
    if (!unionValid) {
        errors.push({ path: ${pathExpr}, message: "value does not match any union member" });
    }
        `.trim();
    }

    if (isMap(type)) {
        const valueValidation = generateValidationCode(type.valueType, "val", path ? `${path}[key]` : "[key]");
        return `
    if (typeof ${varName} !== "object" || ${varName} === null || Array.isArray(${varName})) {
        errors.push({ path: ${pathExpr}, message: "expected object (map), got " + typeof ${varName} });
    } else {
        for (const key in ${varName}) {
            const val = ${varName}[key];
            ${valueValidation}
        }
    }
        `.trim();
    }

    if (isEnum(type)) {
        const enumValues = type.members.map((m) => JSON.stringify(m.value)).join(", ");
        return `
    if (![${enumValues}].includes(${varName})) {
        errors.push({ path: ${pathExpr}, message: "expected one of [${enumValues}], got " + ${varName} });
    }
        `.trim();
    }

    // Default: no validation
    return "// No validation for this type";
}

/**
 * Generate validation for primitive types
 */
function generatePrimitiveValidation(
    primitiveType: string,
    varName: string,
    pathExpr: string,
    constraints?: IRConstraints,
): string {
    let code = "";

    switch (primitiveType) {
        case "string":
            code = `
    if (typeof ${varName} !== "string") {
        errors.push({ path: ${pathExpr}, message: "expected string, got " + typeof ${varName} });
    }`;
            if (constraints?.minLength !== undefined) {
                code += ` else if (${varName}.length < ${constraints.minLength}) {
        errors.push({ path: ${pathExpr}, message: "string length must be >= ${constraints.minLength}" });
    }`;
            }
            if (constraints?.maxLength !== undefined) {
                code += ` else if (${varName}.length > ${constraints.maxLength}) {
        errors.push({ path: ${pathExpr}, message: "string length must be <= ${constraints.maxLength}" });
    }`;
            }
            if (constraints?.pattern) {
                code += ` else if (!/${constraints.pattern}/.test(${varName})) {
        errors.push({ path: ${pathExpr}, message: "string does not match pattern ${constraints.pattern}" });
    }`;
            }
            break;

        case "number":
        case "integer":
            code = `
    if (typeof ${varName} !== "number") {
        errors.push({ path: ${pathExpr}, message: "expected number, got " + typeof ${varName} });
    }`;
            if (primitiveType === "integer") {
                code += ` else if (!Number.isInteger(${varName})) {
        errors.push({ path: ${pathExpr}, message: "expected integer, got " + ${varName} });
    }`;
            }
            if (constraints?.minimum !== undefined) {
                code += ` else if (${varName} < ${constraints.minimum}) {
        errors.push({ path: ${pathExpr}, message: "number must be >= ${constraints.minimum}" });
    }`;
            }
            if (constraints?.maximum !== undefined) {
                code += ` else if (${varName} > ${constraints.maximum}) {
        errors.push({ path: ${pathExpr}, message: "number must be <= ${constraints.maximum}" });
    }`;
            }
            if (constraints?.multipleOf !== undefined) {
                code += ` else if (${varName} % ${constraints.multipleOf} !== 0) {
        errors.push({ path: ${pathExpr}, message: "number must be multiple of ${constraints.multipleOf}" });
    }`;
            }
            break;

        case "boolean":
            code = `
    if (typeof ${varName} !== "boolean") {
        errors.push({ path: ${pathExpr}, message: "expected boolean, got " + typeof ${varName} });
    }`;
            break;

        case "null":
            code = `
    if (${varName} !== null) {
        errors.push({ path: ${pathExpr}, message: "expected null, got " + typeof ${varName} });
    }`;
            break;

        case "any":
            code = "// Any type - no validation";
            break;

        default:
            code = "// Unknown primitive type";
    }

    return code.trim();
}

/**
 * Escape string for use in error messages
 */
function escapeForString(str: string): string {
    return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
