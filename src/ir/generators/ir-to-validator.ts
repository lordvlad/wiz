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
        errors.push({
            path: ${pathExpr},
            error: "expected ${escapeForString(String(type.value))}, got " + ${varName},
            expected: { type: "literal", value: ${literalValue} },
            actual: { type: typeof ${varName}, value: ${varName} }
        });
    }
        `.trim();
    }

    if (isArray(type)) {
        const itemValidation = generateValidationCode(type.items, "item", path ? `${path}[i]` : "[i]");
        let code = `
    if (!Array.isArray(${varName})) {
        errors.push({
            path: ${pathExpr},
            error: "expected array, got " + typeof ${varName},
            expected: { type: "array" },
            actual: { type: typeof ${varName}, value: ${varName} }
        });
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
        errors.push({
            path: ${pathExpr},
            error: "expected object, got " + typeof ${varName},
            expected: { type: "object" },
            actual: { type: typeof ${varName}, value: ${varName} }
        });
    } else {
        `.trim();

        for (const prop of type.properties) {
            const propPath = path ? `${path}.${prop.name}` : prop.name;
            const propVarName = `${varName}["${prop.name}"]`;

            if (prop.required) {
                code += `
        if (!(${JSON.stringify(prop.name)} in ${varName})) {
            errors.push({
                path: ${pathExpr},
                error: "missing required property '${prop.name}'",
                expected: { type: "object", requiredProperty: "${prop.name}" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
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
        errors.push({
            path: ${pathExpr},
            error: "expected type 'string', saw " + typeof ${varName} + " " + JSON.stringify(${varName}),
            expected: { type: "string" },
            actual: { type: typeof ${varName}, value: ${varName} }
        });
    }`;
            if (constraints?.minLength !== undefined) {
                code += ` else if (${varName}.length < ${constraints.minLength}) {
        errors.push({
            path: ${pathExpr},
            error: "string length must be >= ${constraints.minLength}",
            expected: { type: "string", minLength: ${constraints.minLength} },
            actual: { type: typeof ${varName}, value: ${varName} }
        });
    }`;
            }
            if (constraints?.maxLength !== undefined) {
                code += ` else if (${varName}.length > ${constraints.maxLength}) {
        errors.push({
            path: ${pathExpr},
            error: "string length must be <= ${constraints.maxLength}",
            expected: { type: "string", maxLength: ${constraints.maxLength} },
            actual: { type: typeof ${varName}, value: ${varName} }
        });
    }`;
            }
            if (constraints?.pattern) {
                code += ` else if (!/${constraints.pattern}/.test(${varName})) {
        errors.push({
            path: ${pathExpr},
            error: "string does not match pattern ${constraints.pattern}",
            expected: { type: "string", pattern: "${constraints.pattern}" },
            actual: { type: typeof ${varName}, value: ${varName} }
        });
    }`;
            }
            // Add format validation
            if (constraints?.format) {
                code += ` else { ${generateFormatValidation(constraints.format, varName, pathExpr)} }`;
            }
            break;

        case "number":
        case "integer":
            code = `
    if (typeof ${varName} !== "number") {
        errors.push({
            path: ${pathExpr},
            error: "expected type 'number', saw " + typeof ${varName} + " " + JSON.stringify(${varName}),
            expected: { type: "number" },
            actual: { type: typeof ${varName}, value: ${varName} }
        });
    }`;
            if (primitiveType === "integer") {
                code += ` else if (!Number.isInteger(${varName})) {
        errors.push({
            path: ${pathExpr},
            error: "expected integer, got " + ${varName},
            expected: { type: "integer" },
            actual: { type: typeof ${varName}, value: ${varName} }
        });
    }`;
            }
            if (constraints?.minimum !== undefined) {
                code += ` else if (${varName} < ${constraints.minimum}) {
        errors.push({
            path: ${pathExpr},
            error: "number must be >= ${constraints.minimum}",
            expected: { type: "number", minimum: ${constraints.minimum} },
            actual: { type: typeof ${varName}, value: ${varName} }
        });
    }`;
            }
            if (constraints?.maximum !== undefined) {
                code += ` else if (${varName} > ${constraints.maximum}) {
        errors.push({
            path: ${pathExpr},
            error: "number must be <= ${constraints.maximum}",
            expected: { type: "number", maximum: ${constraints.maximum} },
            actual: { type: typeof ${varName}, value: ${varName} }
        });
    }`;
            }
            if (constraints?.multipleOf !== undefined) {
                code += ` else if (${varName} % ${constraints.multipleOf} !== 0) {
        errors.push({
            path: ${pathExpr},
            error: "number must be multiple of ${constraints.multipleOf}",
            expected: { type: "number", multipleOf: ${constraints.multipleOf} },
            actual: { type: typeof ${varName}, value: ${varName} }
        });
    }`;
            }
            break;

        case "boolean":
            code = `
    if (typeof ${varName} !== "boolean") {
        errors.push({
            path: ${pathExpr},
            error: "expected type 'boolean', saw " + typeof ${varName} + " " + JSON.stringify(${varName}),
            expected: { type: "boolean" },
            actual: { type: typeof ${varName}, value: ${varName} }
        });
    }`;
            break;

        case "null":
            code = `
    if (${varName} !== null) {
        errors.push({
            path: ${pathExpr},
            error: "expected type 'null', saw " + typeof ${varName} + " " + JSON.stringify(${varName}),
            expected: { type: "null" },
            actual: { type: typeof ${varName}, value: ${varName} }
        });
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
 * Generate format validation code
 */
function generateFormatValidation(format: string, varName: string, pathExpr: string): string {
    switch (format) {
        case "email":
            return `
if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$/i.test(${varName})) {
    errors.push({
        path: ${pathExpr},
        error: "expected value to match email format",
        expected: { type: "string", format: "email" },
        actual: { type: typeof ${varName}, value: ${varName} }
    });
}`.trim();

        case "ipv4":
        case "ip":
            return `
if (!/^((25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)(\\.|$)){4}$/.test(${varName})) {
    errors.push({
        path: ${pathExpr},
        error: "expected value to match ipv4 format",
        expected: { type: "string", format: "ipv4" },
        actual: { type: typeof ${varName}, value: ${varName} }
    });
}`.trim();

        case "ipv6":
            return `
if (!/^(([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|([0-9A-Fa-f]{1,4}:){1,7}:|:([0-9A-Fa-f]{1,4}:){1,7}|([0-9A-Fa-f]{1,4}:){1,6}:[0-9A-Fa-f]{1,4}|([0-9A-Fa-f]{1,4}:){1,5}(:[0-9A-Fa-f]{1,4}){1,2}|([0-9A-Fa-f]{1,4}:){1,4}(:[0-9A-Fa-f]{1,4}){1,3}|([0-9A-Fa-f]{1,4}:){1,3}(:[0-9A-Fa-f]{1,4}){1,4}|([0-9A-Fa-f]{1,4}:){1,2}(:[0-9A-Fa-f]{1,4}){1,5}|[0-9A-Fa-f]{1,4}:((:[0-9A-Fa-f]{1,4}){1,6})|:((:[0-9A-Fa-f]{1,4}){1,7}|:))$/.test(${varName})) {
    errors.push({
        path: ${pathExpr},
        error: "expected value to match ipv6 format",
        expected: { type: "string", format: "ipv6" },
        actual: { type: typeof ${varName}, value: ${varName} }
    });
}`.trim();

        case "uuid":
            return `
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(${varName})) {
    errors.push({
        path: ${pathExpr},
        error: "expected value to match uuid format",
        expected: { type: "string", format: "uuid" },
        actual: { type: typeof ${varName}, value: ${varName} }
    });
}`.trim();

        case "uri":
        case "url":
            return `
try {
    new URL(${varName});
} catch {
    errors.push({
        path: ${pathExpr},
        error: "expected value to match uri format",
        expected: { type: "string", format: "uri" },
        actual: { type: typeof ${varName}, value: ${varName} }
    });
}`.trim();

        case "date-time":
            return `
const _t = Date.parse(${varName});
if (isNaN(_t)) {
    errors.push({
        path: ${pathExpr},
        error: "expected value to match date-time format",
        expected: { type: "string", format: "date-time" },
        actual: { type: typeof ${varName}, value: ${varName} }
    });
}`.trim();

        case "date":
            return `
const _m = ${varName}.match(/^\\d{4}-\\d{2}-\\d{2}$/);
const _d = _m ? new Date(${varName}) : null;
if (!_d || isNaN(_d.getTime())) {
    errors.push({
        path: ${pathExpr},
        error: "expected value to match date format (YYYY-MM-DD)",
        expected: { type: "string", format: "date" },
        actual: { type: typeof ${varName}, value: ${varName} }
    });
}`.trim();

        case "hostname":
            return `
if (!/^(?=.{1,253}$)(?!-)(?:[a-zA-Z0-9-]{0,62}[a-zA-Z0-9]\\.)*[a-zA-Z0-9-]{1,63}$/.test(${varName})) {
    errors.push({
        path: ${pathExpr},
        error: "expected value to match hostname format",
        expected: { type: "string", format: "hostname" },
        actual: { type: typeof ${varName}, value: ${varName} }
    });
}`.trim();

        case "json-pointer":
            return `
if (!/^(\\/(?:[^~]|~0|~1)*)*$/.test(${varName})) {
    errors.push({
        path: ${pathExpr},
        error: "expected value to match json-pointer format",
        expected: { type: "string", format: "json-pointer" },
        actual: { type: typeof ${varName}, value: ${varName} }
    });
}`.trim();

        case "relative-json-pointer":
            return `
if (!/^([0-9]+)(#|(\\/(?:[^~]|~0|~1)*)*)$/.test(${varName})) {
    errors.push({
        path: ${pathExpr},
        error: "expected value to match relative-json-pointer format",
        expected: { type: "string", format: "relative-json-pointer" },
        actual: { type: typeof ${varName}, value: ${varName} }
    });
}`.trim();

        case "uri-template":
            return `
if (!/^([^\\x00-\\x20\\x7f"'%<>\\\\^\\\`{|}]|(\\{[+#.\\/;?&=,!@|]?((\\w|%[0-9A-Fa-f]{2})[.|\\[\\]]?)*(:[1-9]\\d{0,3}|\\*)?([,](\\w|%[0-9A-Fa-f]{2})[.|\\[\\]]?(:[1-9]\\d{0,3}|\\*)?)*\\}))*$/.test(${varName})) {
    errors.push({
        path: ${pathExpr},
        error: "expected value to match uri-template format",
        expected: { type: "string", format: "uri-template" },
        actual: { type: typeof ${varName}, value: ${varName} }
    });
}`.trim();

        default:
            // Unknown format - no validation
            return "";
    }
}

/**
 * Escape string for use in error messages
 */
function escapeForString(str: string): string {
    return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
