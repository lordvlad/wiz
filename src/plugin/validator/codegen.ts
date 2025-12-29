import { Node, Symbol as MorphSymbol, Type, Project } from "ts-morph";

type JSDocConstraints = {
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: number;
    exclusiveMaximum?: number;
    multipleOf?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    format?: string;
};

function hasJsDocs(node: Node): node is Node & { getJsDocs(): ReturnType<Node["getJsDocs"]> } {
    return typeof (node as { getJsDocs?: unknown }).getJsDocs === "function";
}

function getFirstDeclaration(symbol: MorphSymbol): Node | undefined {
    return symbol.getValueDeclaration?.() ?? symbol.getDeclarations()[0];
}

/**
 * Escapes a string for use in generated code
 */
function escapeString(str: string): string {
    return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}

/**
 * Gets a safe type name for error messages
 */
function getTypeName(type: Type): string {
    const text = type.getText();
    // Simplify complex types for error messages
    if (text.length > 50) {
        if (type.isObject()) return "object";
        if (type.isArray()) return "array";
        if (type.isUnion()) return "union";
        return "complex type";
    }
    return text;
}

function extractJSDocConstraints(node?: Node): JSDocConstraints {
    const constraints: JSDocConstraints = {};

    if (!node) return constraints;
    if (!hasJsDocs(node)) return constraints;

    const jsDocs = node.getJsDocs?.() ?? [];

    for (const jsDoc of jsDocs) {
        const tags = jsDoc.getTags?.() ?? [];
        for (const tag of tags) {
            const name = tag.getTagName();
            const comment = tag.getComment?.();
            const commentText = typeof comment === "string" ? comment.trim() : "";

            switch (name) {
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
                    if (commentText) constraints.pattern = commentText;
                    break;
                }
                case "format": {
                    if (commentText) constraints.format = commentText;
                    break;
                }
            }
        }
    }

    return constraints;
}

/**
 * Helper class to build validator code using ts-morph
 */
class ValidatorBuilder {
    private project: Project;
    private sourceFile: ReturnType<Project["createSourceFile"]>;

    constructor() {
        this.project = new Project({ useInMemoryFileSystem: true });
        this.sourceFile = this.project.createSourceFile("validator.ts", "", { overwrite: true });
    }

    /**
     * Add a statement to the validator
     */
    addStatement(code: string) {
        this.sourceFile.addStatements(code);
    }

    /**
     * Get the generated code
     */
    getCode(): string {
        this.sourceFile.formatText();
        return this.sourceFile.getFullText().trim();
    }

    /**
     * Clear all statements
     */
    clear() {
        this.sourceFile.removeText();
    }
}

function generateFormatCheck(format: string, varName: string, pathExpr: string): string | undefined {
    switch (format) {
        case "binary":
            return undefined;
        case "byte":
            return `if (typeof ${varName} === "string" && !/^[A-Za-z0-9+/]+={0,2}$/.test(${varName})) {
                errors.push({
                    path: ${pathExpr},
                    error: "expected value to match byte (base64) format",
                    expected: { type: "string", format: "byte" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            }`;
        case "date":
            return `if (typeof ${varName} === "string") {
                const _m = ${varName}.match(/^\\d{4}-\\d{2}-\\d{2}$/);
                const _d = _m ? new Date(${varName}) : null;
                if (!_m || Number.isNaN(_d!.getTime())) {
                    errors.push({
                        path: ${pathExpr},
                        error: "expected value to match date format (YYYY-MM-DD)",
                        expected: { type: "string", format: "date" },
                        actual: { type: typeof ${varName}, value: ${varName} }
                    });
                }
            }`;
        case "date-time":
            return `if (typeof ${varName} === "string") {
                const _t = Date.parse(${varName});
                if (Number.isNaN(_t)) {
                    errors.push({
                        path: ${pathExpr},
                        error: "expected value to match date-time format",
                        expected: { type: "string", format: "date-time" },
                        actual: { type: typeof ${varName}, value: ${varName} }
                    });
                }
            }`;
        case "email":
            return `if (typeof ${varName} === "string" && !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$/i.test(${varName})) {
                errors.push({
                    path: ${pathExpr},
                    error: "expected value to match email format",
                    expected: { type: "string", format: "email" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            }`;
        case "hostname":
            return `if (typeof ${varName} === "string" && !/^(?=.{1,253}$)(?!-)(?:[a-zA-Z0-9-]{0,62}[a-zA-Z0-9]\\.)*[a-zA-Z0-9-]{1,63}$/.test(${varName})) {
                errors.push({
                    path: ${pathExpr},
                    error: "expected value to match hostname format",
                    expected: { type: "string", format: "hostname" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            }`;
        case "ipv4":
            return `if (typeof ${varName} === "string" && !/^((25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)(\\.|$)){4}$/.test(${varName})) {
                errors.push({
                    path: ${pathExpr},
                    error: "expected value to match ipv4 format",
                    expected: { type: "string", format: "ipv4" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            }`;
        case "ipv6":
            return `if (typeof ${varName} === "string" && !/^(([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|([0-9A-Fa-f]{1,4}:){1,7}:|:([0-9A-Fa-f]{1,4}:){1,7}|([0-9A-Fa-f]{1,4}:){1,6}:[0-9A-Fa-f]{1,4}|([0-9A-Fa-f]{1,4}:){1,5}(:[0-9A-Fa-f]{1,4}){1,2}|([0-9A-Fa-f]{1,4}:){1,4}(:[0-9A-Fa-f]{1,4}){1,3}|([0-9A-Fa-f]{1,4}:){1,3}(:[0-9A-Fa-f]{1,4}){1,4}|([0-9A-Fa-f]{1,4}:){1,2}(:[0-9A-Fa-f]{1,4}){1,5}|[0-9A-Fa-f]{1,4}:((:[0-9A-Fa-f]{1,4}){1,6})|:((:[0-9A-Fa-f]{1,4}){1,7}|:))$/.test(${varName})) {
                errors.push({
                    path: ${pathExpr},
                    error: "expected value to match ipv6 format",
                    expected: { type: "string", format: "ipv6" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            }`;
        case "uuid":
            return `if (typeof ${varName} === "string" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(${varName})) {
                errors.push({
                    path: ${pathExpr},
                    error: "expected value to match uuid format",
                    expected: { type: "string", format: "uuid" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            }`;
        case "regex":
            return `if (typeof ${varName} === "string") {
                try {
                    new RegExp(${varName});
                } catch {
                    errors.push({
                        path: ${pathExpr},
                        error: "expected value to be a valid regex",
                        expected: { type: "string", format: "regex" },
                        actual: { type: typeof ${varName}, value: ${varName} }
                    });
                }
            }`;
        case "json-pointer":
            return `if (typeof ${varName} === "string" && !/^(\\/(?:[^~]|~0|~1)*)*$/.test(${varName})) {
                errors.push({
                    path: ${pathExpr},
                    error: "expected value to match json-pointer format",
                    expected: { type: "string", format: "json-pointer" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            }`;
        case "relative-json-pointer":
            return `if (typeof ${varName} === "string" && !/^([0-9]+)(#|(\\/(?:[^~]|~0|~1)*)*)$/.test(${varName})) {
                errors.push({
                    path: ${pathExpr},
                    error: "expected value to match relative-json-pointer format",
                    expected: { type: "string", format: "relative-json-pointer" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            }`;
        case "uri":
            return `if (typeof ${varName} === "string") {
                try {
                    new URL(${varName});
                } catch {
                    errors.push({
                        path: ${pathExpr},
                        error: "expected value to match uri format",
                        expected: { type: "string", format: "uri" },
                        actual: { type: typeof ${varName}, value: ${varName} }
                    });
                }
            }`;
        case "uri-reference":
            return `if (typeof ${varName} === "string") {
                try {
                    new URL(${varName}, "http://example.com");
                } catch {
                    errors.push({
                        path: ${pathExpr},
                        error: "expected value to match uri-reference format",
                        expected: { type: "string", format: "uri-reference" },
                        actual: { type: typeof ${varName}, value: ${varName} }
                    });
                }
            }`;
        case "uri-template":
            return `if (typeof ${varName} === "string" && /\\s/.test(${varName})) {
                errors.push({
                    path: ${pathExpr},
                    error: "expected value to match uri-template format",
                    expected: { type: "string", format: "uri-template" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            }`;
        default:
            return undefined;
    }
}

function generateConstraintChecks(
    type: Type,
    varName: string,
    path: string,
    constraints: JSDocConstraints,
    pathIsExpression = false,
): string {
    const builder = new ValidatorBuilder();
    const pathExpr = pathIsExpression ? path : `"${path}"`;

    const isNumberType = type.isNumber() || type.isNumberLiteral();
    const isStringType = type.isString() || type.isStringLiteral();

    if (isNumberType) {
        if (constraints.minimum !== undefined) {
            builder.addStatement(`if (typeof ${varName} === "number" && ${varName} < ${constraints.minimum}) {
                errors.push({
                    path: ${pathExpr},
                    error: "value is below minimum " + ${constraints.minimum},
                    expected: { type: "number", minimum: ${constraints.minimum} },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            }`);
        }
        if (constraints.maximum !== undefined) {
            builder.addStatement(`if (typeof ${varName} === "number" && ${varName} > ${constraints.maximum}) {
                errors.push({
                    path: ${pathExpr},
                    error: "value exceeds maximum " + ${constraints.maximum},
                    expected: { type: "number", maximum: ${constraints.maximum} },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            }`);
        }
        if (constraints.exclusiveMinimum !== undefined) {
            builder.addStatement(`if (typeof ${varName} === "number" && ${varName} <= ${constraints.exclusiveMinimum}) {
                errors.push({
                    path: ${pathExpr},
                    error: "value must be greater than " + ${constraints.exclusiveMinimum},
                    expected: { type: "number", exclusiveMinimum: ${constraints.exclusiveMinimum} },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            }`);
        }
        if (constraints.exclusiveMaximum !== undefined) {
            builder.addStatement(`if (typeof ${varName} === "number" && ${varName} >= ${constraints.exclusiveMaximum}) {
                errors.push({
                    path: ${pathExpr},
                    error: "value must be less than " + ${constraints.exclusiveMaximum},
                    expected: { type: "number", exclusiveMaximum: ${constraints.exclusiveMaximum} },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            }`);
        }
        if (constraints.multipleOf !== undefined) {
            builder.addStatement(`if (typeof ${varName} === "number" && ${varName} % ${constraints.multipleOf} !== 0) {
                errors.push({
                    path: ${pathExpr},
                    error: "value must be a multiple of " + ${constraints.multipleOf},
                    expected: { type: "number", multipleOf: ${constraints.multipleOf} },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            }`);
        }
    }

    if (isStringType) {
        if (constraints.minLength !== undefined) {
            builder.addStatement(`if (typeof ${varName} === "string" && ${varName}.length < ${constraints.minLength}) {
                errors.push({
                    path: ${pathExpr},
                    error: "string is shorter than minimum length " + ${constraints.minLength},
                    expected: { type: "string", minLength: ${constraints.minLength} },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            }`);
        }
        if (constraints.maxLength !== undefined) {
            builder.addStatement(`if (typeof ${varName} === "string" && ${varName}.length > ${constraints.maxLength}) {
                errors.push({
                    path: ${pathExpr},
                    error: "string exceeds maximum length " + ${constraints.maxLength},
                    expected: { type: "string", maxLength: ${constraints.maxLength} },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            }`);
        }
        if (constraints.pattern !== undefined) {
            const pattern = escapeString(constraints.pattern);
            builder.addStatement(`if (typeof ${varName} === "string" && !new RegExp("${pattern}").test(${varName})) {
                errors.push({
                    path: ${pathExpr},
                    error: "string does not match required pattern",
                    expected: { type: "string", pattern: "${pattern}" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            }`);
        }
        if (constraints.format) {
            const formatCheck = generateFormatCheck(constraints.format, varName, pathExpr);
            if (formatCheck) {
                builder.addStatement(formatCheck);
            }
        }
    }

    return builder.getCode();
}

/**
 * Generates runtime validator code for a given TypeScript type
 */
export function generateValidatorCode(type: Type): string {
    const builder = new ValidatorBuilder();

    // Build the validator function body
    const validatorBody = generateTypeCheck(type, "value", "");

    // Create the function using ts-morph
    builder.addStatement(`(function(value) {
        const errors = [];
        ${validatorBody}
        return errors;
    })`);

    return builder.getCode();
}

/**
 * Generates type check code for a type at a given path
 */
function generateTypeCheck(type: Type, varName: string, path: string): string {
    const builder = new ValidatorBuilder();

    // Handle primitive types first (before union, since boolean is both)
    if (type.isString()) {
        builder.addStatement(`if (typeof ${varName} !== "string") {
            errors.push({
                path: "${path}",
                error: "expected type 'string', saw " + typeof ${varName} + " " + JSON.stringify(${varName}),
                expected: { type: "string" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        }`);
        return builder.getCode();
    }

    if (type.isNumber()) {
        builder.addStatement(`if (typeof ${varName} !== "number") {
            errors.push({
                path: "${path}",
                error: "expected type 'number', saw " + typeof ${varName} + " " + JSON.stringify(${varName}),
                expected: { type: "number" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        }`);
        return builder.getCode();
    }

    if (type.isBoolean()) {
        builder.addStatement(`if (typeof ${varName} !== "boolean") {
            errors.push({
                path: "${path}",
                error: "expected type 'boolean', saw " + typeof ${varName} + " " + JSON.stringify(${varName}),
                expected: { type: "boolean" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        }`);
        return builder.getCode();
    }

    // Handle undefined/null
    if (type.isUndefined()) {
        builder.addStatement(`if (${varName} !== undefined) {
            errors.push({
                path: "${path}",
                error: "expected type 'undefined', saw " + typeof ${varName} + " " + JSON.stringify(${varName}),
                expected: { type: "undefined" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        }`);
        return builder.getCode();
    }

    if (type.isNull()) {
        builder.addStatement(`if (${varName} !== null) {
            errors.push({
                path: "${path}",
                error: "expected type 'null', saw " + typeof ${varName} + " " + JSON.stringify(${varName}),
                expected: { type: "null" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        }`);
        return builder.getCode();
    }

    // Handle union types
    if (type.isUnion()) {
        return generateUnionCheck(type, varName, path);
    }

    // Handle intersection types
    if (type.isIntersection()) {
        return generateIntersectionCheck(type, varName, path);
    }

    // Handle array types
    if (type.isArray()) {
        return generateArrayCheck(type, varName, path);
    }

    // Handle literal types
    if (type.isLiteral()) {
        const literalValue = type.getLiteralValue();
        const literalStr = typeof literalValue === "string" ? `"${escapeString(literalValue)}"` : String(literalValue);
        builder.addStatement(`if (${varName} !== ${literalStr}) {
            errors.push({
                path: "${path}",
                error: "expected literal value " + ${literalStr} + ", saw " + JSON.stringify(${varName}),
                expected: { type: "literal", value: ${literalStr} },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        }`);
        return builder.getCode();
    }

    // Handle object types
    if (type.isObject()) {
        return generateObjectCheck(type, varName, path);
    }

    // Fallback for unknown types
    return `// Type check not implemented for: ${type.getText()}`;
}

/**
 * Generates check for union types (A | B)
 */
function generateUnionCheck(type: Type, varName: string, path: string): string {
    const builder = new ValidatorBuilder();
    const unionTypes = type.getUnionTypes();

    // Filter out null and undefined for special handling
    const nullType = unionTypes.find((t) => t.isNull());
    const undefinedType = unionTypes.find((t) => t.isUndefined());
    const otherTypes = unionTypes.filter((t) => !t.isNull() && !t.isUndefined());

    if (otherTypes.length === 0) {
        // Only null and/or undefined
        if (nullType && undefinedType) {
            builder.addStatement(`if (${varName} !== null && ${varName} !== undefined) {
                errors.push({
                    path: "${path}",
                    error: "expected null or undefined, saw " + typeof ${varName} + " " + JSON.stringify(${varName}),
                    expected: { type: "null | undefined" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            }`);
        } else if (nullType) {
            return generateTypeCheck(nullType, varName, path);
        } else if (undefinedType) {
            return generateTypeCheck(undefinedType, varName, path);
        }
        return builder.getCode();
    }

    // Generate checks for each union member
    const tempVar = `_valid_${varName.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const errorCountVar = `_errorCount_${varName.replace(/[^a-zA-Z0-9]/g, "_")}`;

    builder.addStatement(`const ${errorCountVar} = errors.length;`);
    builder.addStatement(`let ${tempVar} = false;`);

    for (let i = 0; i < otherTypes.length; i++) {
        const unionType = otherTypes[i]!;
        const checkCode = generateTypeCheck(unionType, varName, path);

        builder.addStatement(`if (!${tempVar}) {
            const _errLen_${i} = errors.length;
            ${checkCode}
            if (errors.length === _errLen_${i}) {
                ${tempVar} = true;
            } else {
                errors.length = _errLen_${i};
            }
        }`);
    }

    // Handle nullable unions
    if (nullType || undefinedType) {
        const conditions: string[] = [];
        if (nullType) conditions.push(`${varName} === null`);
        if (undefinedType) conditions.push(`${varName} === undefined`);
        builder.addStatement(`if (${conditions.join(" || ")}) {
            ${tempVar} = true;
            errors.length = ${errorCountVar};
        }`);
    }

    builder.addStatement(`if (!${tempVar}) {
        errors.push({
            path: "${path}",
            error: "value does not match any union member",
            expected: { type: "union" },
            actual: { type: typeof ${varName}, value: ${varName} }
        });
    }`);

    return builder.getCode();
}

/**
 * Generates check for intersection types (A & B)
 */
function generateIntersectionCheck(type: Type, varName: string, path: string): string {
    const builder = new ValidatorBuilder();
    const intersectionTypes = type.getIntersectionTypes();

    for (const t of intersectionTypes) {
        builder.addStatement(generateTypeCheck(t, varName, path));
    }

    return builder.getCode();
}

/**
 * Generates type check for array element with dynamic path
 * This is a specialized version of generateTypeCheck that handles dynamic paths
 */
function generateTypeCheckForArrayElement(type: Type, varName: string, pathPrefix: string, indexVar: string): string {
    const builder = new ValidatorBuilder();
    const dynamicPath = pathPrefix ? `"${pathPrefix}" + ${indexVar}` : `String(${indexVar})`;

    // Primitives
    if (type.isString()) {
        builder.addStatement(`if (typeof ${varName} !== "string") {
            errors.push({
                path: ${dynamicPath},
                error: "expected type 'string', saw " + typeof ${varName} + " " + JSON.stringify(${varName}),
                expected: { type: "string" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        }`);
        return builder.getCode();
    }

    if (type.isNumber()) {
        builder.addStatement(`if (typeof ${varName} !== "number") {
            errors.push({
                path: ${dynamicPath},
                error: "expected type 'number', saw " + typeof ${varName} + " " + JSON.stringify(${varName}),
                expected: { type: "number" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        }`);
        return builder.getCode();
    }

    if (type.isBoolean()) {
        builder.addStatement(`if (typeof ${varName} !== "boolean") {
            errors.push({
                path: ${dynamicPath},
                error: "expected type 'boolean', saw " + typeof ${varName} + " " + JSON.stringify(${varName}),
                expected: { type: "boolean" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        }`);
        return builder.getCode();
    }

    // Objects - handle nested objects in arrays
    if (type.isObject()) {
        builder.addStatement(`if (typeof ${varName} !== "object" || ${varName} === null) {
            errors.push({
                path: ${dynamicPath},
                error: "expected object, saw " + typeof ${varName},
                expected: { type: "object" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        } else {`);

        const properties = type.getProperties();
        for (const prop of properties) {
            const propName = prop.getName();
            const declaration = getFirstDeclaration(prop);
            if (!declaration) continue;
            const propType = prop.getTypeAtLocation(declaration);
            const isOptional = prop.isOptional();
            const typeName = escapeString(getTypeName(propType));
            const constraints = extractJSDocConstraints(declaration);

            const propVarName = `${varName}.${propName}`;
            const propDynamicPath = `${dynamicPath} + ".${propName}"`;

            if (isOptional) {
                builder.addStatement(`if (${propVarName} !== undefined) {
                    ${generateTypeCheckForProperty(propType, propVarName, propDynamicPath, constraints)}
                }`);
            } else {
                builder.addStatement(`if (${propVarName} === undefined) {
                    errors.push({
                        path: ${propDynamicPath},
                        error: "expected type '${typeName}', saw undefined",
                        expected: { type: "${typeName}" },
                        actual: { type: "undefined", value: undefined }
                    });
                } else {
                    ${generateTypeCheckForProperty(propType, propVarName, propDynamicPath, constraints)}
                }`);
            }
        }

        builder.addStatement(`}`);
        return builder.getCode();
    }

    return `// Unsupported array element type: ${type.getText()}`;
}

/**
 * Generates type check for object property with dynamic path
 */
function generateTypeCheckForProperty(
    type: Type,
    varName: string,
    dynamicPath: string,
    constraints: JSDocConstraints = {},
): string {
    const builder = new ValidatorBuilder();

    // Handle primitives with dynamic paths
    if (type.isString()) {
        builder.addStatement(`if (typeof ${varName} !== "string") {
            errors.push({
                path: ${dynamicPath},
                error: "expected type 'string', saw " + typeof ${varName} + " " + JSON.stringify(${varName}),
                expected: { type: "string" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        } ${generateConstraintChecks(type, varName, dynamicPath, constraints, true)}`);
        return builder.getCode();
    }

    if (type.isNumber()) {
        builder.addStatement(`if (typeof ${varName} !== "number") {
            errors.push({
                path: ${dynamicPath},
                error: "expected type 'number', saw " + typeof ${varName} + " " + JSON.stringify(${varName}),
                expected: { type: "number" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        } ${generateConstraintChecks(type, varName, dynamicPath, constraints, true)}`);
        return builder.getCode();
    }

    if (type.isBoolean()) {
        builder.addStatement(`if (typeof ${varName} !== "boolean") {
            errors.push({
                path: ${dynamicPath},
                error: "expected type 'boolean', saw " + typeof ${varName} + " " + JSON.stringify(${varName}),
                expected: { type: "boolean" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        }`);
        return builder.getCode();
    }

    // For complex types, we'd need to recursively handle them
    // For now, return a basic check
    return `// Complex nested property type`;
}

/**
 * Generates check for array types
 */
function generateArrayCheck(type: Type, varName: string, path: string): string {
    const builder = new ValidatorBuilder();
    const arrayElementType = type.getArrayElementType();

    if (!arrayElementType) {
        builder.addStatement(`if (!Array.isArray(${varName})) {
            errors.push({
                path: "${path}",
                error: "expected array, saw " + typeof ${varName},
                expected: { type: "array" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        }`);
        return builder.getCode();
    }

    const itemVarName = `_item_${varName.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const indexVarName = `_i_${varName.replace(/[^a-zA-Z0-9]/g, "_")}`;

    const elementPathBase = path ? `${path}.` : "";
    const elementCheck = generateTypeCheckForArrayElement(arrayElementType, itemVarName, elementPathBase, indexVarName);

    builder.addStatement(`if (!Array.isArray(${varName})) {
        errors.push({
            path: "${path}",
            error: "expected array, saw " + typeof ${varName},
            expected: { type: "array" },
            actual: { type: typeof ${varName}, value: ${varName} }
        });
    } else {
        for (let ${indexVarName} = 0; ${indexVarName} < ${varName}.length; ${indexVarName}++) {
            const ${itemVarName} = ${varName}[${indexVarName}];
            ${elementCheck}
        }
    }`);

    return builder.getCode();
}

/**
 * Generates check for object types
 */
function generateObjectCheck(type: Type, varName: string, path: string): string {
    const builder = new ValidatorBuilder();

    builder.addStatement(`if (typeof ${varName} !== "object" || ${varName} === null) {
        errors.push({
            path: "${path}",
            error: "expected object, saw " + typeof ${varName},
            expected: { type: "object" },
            actual: { type: typeof ${varName}, value: ${varName} }
        });
    } else {`);

    const properties = type.getProperties();

    for (const prop of properties) {
        const propName = prop.getName();
        const declaration = getFirstDeclaration(prop);
        if (!declaration) {
            continue;
        }
        const propType = prop.getTypeAtLocation(declaration);
        const isOptional = prop.isOptional();
        const constraints = extractJSDocConstraints(declaration);

        const propPath = path ? `${path}.${propName}` : propName;
        const propVarName = `${varName}.${propName}`;
        const constraintChecks = generateConstraintChecks(propType, propVarName, propPath, constraints);

        const typeName = escapeString(getTypeName(propType));

        if (isOptional) {
            builder.addStatement(`if (${propVarName} !== undefined) {
                ${generateTypeCheck(propType, propVarName, propPath)}
                ${constraintChecks}
            }`);
        } else {
            builder.addStatement(`if (${propVarName} === undefined) {
                errors.push({
                    path: "${propPath}",
                    error: "expected type '${typeName}', saw undefined",
                    expected: { type: "${typeName}" },
                    actual: { type: "undefined", value: undefined }
                });
            } else {
                ${generateTypeCheck(propType, propVarName, propPath)}
                ${constraintChecks}
            }`);
        }
    }

    builder.addStatement(`}`);

    return builder.getCode();
}

/**
 * Generates a type guard (is) function
 */
export function generateIsCode(type: Type): string {
    const builder = new ValidatorBuilder();
    const validatorCode = generateValidatorCode(type);
    builder.addStatement(`(function(value) {
        const validator = ${validatorCode};
        return validator(value).length === 0;
    })`);
    return builder.getCode();
}

/**
 * Generates an assert function
 */
export function generateAssertCode(type: Type, hasErrorFactory: boolean): string {
    const builder = new ValidatorBuilder();
    const validatorCode = generateValidatorCode(type);

    if (hasErrorFactory) {
        builder.addStatement(`(function(errorFactory) {
            const validator = ${validatorCode};
            return function(value) {
                const errors = validator(value);
                if (errors.length > 0) {
                    throw errorFactory(errors);
                }
            };
        })`);
    } else {
        builder.addStatement(`(function(value) {
            const validator = ${validatorCode};
            const errors = validator(value);
            if (errors.length > 0) {
                const errorMsg = errors.map(e => e.error + " at " + e.path).join("; ");
                throw new TypeError("Validation failed: " + errorMsg);
            }
        })`);
    }

    return builder.getCode();
}

/**
 * Generates inline validate code
 */
export function generateValidateCode(type: Type): string {
    const builder = new ValidatorBuilder();
    const validatorCode = generateValidatorCode(type);
    builder.addStatement(`(function(value) {
        const validator = ${validatorCode};
        return validator(value);
    })`);
    return builder.getCode();
}
