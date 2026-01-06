import { Node, Symbol as MorphSymbol, Type, Project, type JSDocableNode } from "ts-morph";

type JsDocCapableNode = Node & Pick<JSDocableNode, "getJsDocs">;

function hasJsDocs(node: Node): node is JsDocCapableNode {
    return typeof (node as Partial<JsDocCapableNode>).getJsDocs === "function";
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
 * Helper class to build serializer/parser code
 */
class CodeBuilder {
    private project: Project;
    private sourceFile: ReturnType<Project["createSourceFile"]>;

    constructor() {
        this.project = new Project({ useInMemoryFileSystem: true });
        this.sourceFile = this.project.createSourceFile("generated.ts", "", { overwrite: true });
    }

    /**
     * Add a statement to the code
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

/**
 * Generates optimized JSON serialization code for a type
 * This performs validation and serialization field-by-field for performance
 */
export function generateSerializerCode(type: Type): string {
    const builder = new CodeBuilder();

    // Generate the serializer function with both overloads
    builder.addStatement(`
        (function(value, buf) {
            const errors = [];
            ${generateSerializeBody(type, "value", "parts", "errors")}
            
            if (errors.length > 0) {
                const errorMsg = errors.map(e => e.error + " at " + e.path).join("; ");
                throw new TypeError("Serialization validation failed: " + errorMsg);
            }
            
            if (buf) {
                const str = parts.join("");
                buf.write(str, 0, str.length, "utf-8");
            } else {
                return parts.join("");
            }
        })
    `);

    return builder.getCode();
}

/**
 * Generates the body of serialization logic
 */
function generateSerializeBody(type: Type, varName: string, partsArray: string, errorsArray: string): string {
    const builder = new CodeBuilder();
    builder.addStatement(`const ${partsArray} = [];`);

    if (type.isString() || type.isStringLiteral()) {
        builder.addStatement(`
            if (typeof ${varName} !== "string") {
                ${errorsArray}.push({
                    path: "",
                    error: "expected string, got " + typeof ${varName},
                    expected: { type: "string" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            } else {
                ${partsArray}.push(JSON.stringify(${varName}));
            }
        `);
    } else if (type.isNumber() || type.isNumberLiteral()) {
        builder.addStatement(`
            if (typeof ${varName} !== "number") {
                ${errorsArray}.push({
                    path: "",
                    error: "expected number, got " + typeof ${varName},
                    expected: { type: "number" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            } else {
                ${partsArray}.push(String(${varName}));
            }
        `);
    } else if (type.isBoolean() || type.isBooleanLiteral()) {
        builder.addStatement(`
            if (typeof ${varName} !== "boolean") {
                ${errorsArray}.push({
                    path: "",
                    error: "expected boolean, got " + typeof ${varName},
                    expected: { type: "boolean" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            } else {
                ${partsArray}.push(${varName} ? "true" : "false");
            }
        `);
    } else if (type.isNull()) {
        builder.addStatement(`
            if (${varName} !== null) {
                ${errorsArray}.push({
                    path: "",
                    error: "expected null, got " + typeof ${varName},
                    expected: { type: "null" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            } else {
                ${partsArray}.push("null");
            }
        `);
    } else if (type.isArray()) {
        builder.addStatement(generateArraySerialize(type, varName, partsArray, errorsArray));
    } else if (type.isUnion()) {
        builder.addStatement(generateUnionSerialize(type, varName, partsArray, errorsArray));
    } else if (type.isObject()) {
        builder.addStatement(generateObjectSerialize(type, varName, partsArray, errorsArray));
    } else {
        // Fallback to JSON.stringify for unknown types
        builder.addStatement(`${partsArray}.push(JSON.stringify(${varName}));`);
    }

    return builder.getCode();
}

/**
 * Generates serialization code for arrays
 */
function generateArraySerialize(type: Type, varName: string, partsArray: string, errorsArray: string): string {
    const builder = new CodeBuilder();
    const arrayElementType = type.getArrayElementType();

    if (!arrayElementType) {
        builder.addStatement(`${partsArray}.push(JSON.stringify(${varName}));`);
        return builder.getCode();
    }

    const itemVar = `_item_${varName.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const indexVar = `_i_${varName.replace(/[^a-zA-Z0-9]/g, "_")}`;

    builder.addStatement(`
        if (!Array.isArray(${varName})) {
            ${errorsArray}.push({
                path: "",
                error: "expected array, got " + typeof ${varName},
                expected: { type: "array" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        } else {
            ${partsArray}.push("[");
            for (let ${indexVar} = 0; ${indexVar} < ${varName}.length; ${indexVar}++) {
                if (${indexVar} > 0) ${partsArray}.push(",");
                const ${itemVar} = ${varName}[${indexVar}];
                ${generateElementSerialize(arrayElementType, itemVar, partsArray, errorsArray, indexVar)}
            }
            ${partsArray}.push("]");
        }
    `);

    return builder.getCode();
}

/**
 * Generates serialization for array elements
 */
function generateElementSerialize(
    type: Type,
    varName: string,
    partsArray: string,
    errorsArray: string,
    indexVar: string,
): string {
    const builder = new CodeBuilder();

    if (type.isString() || type.isStringLiteral()) {
        builder.addStatement(`${partsArray}.push(JSON.stringify(${varName}));`);
    } else if (type.isNumber() || type.isNumberLiteral()) {
        builder.addStatement(`${partsArray}.push(String(${varName}));`);
    } else if (type.isBoolean() || type.isBooleanLiteral()) {
        builder.addStatement(`${partsArray}.push(${varName} ? "true" : "false");`);
    } else if (type.isNull()) {
        builder.addStatement(`${partsArray}.push("null");`);
    } else if (type.isObject()) {
        builder.addStatement(generateObjectSerialize(type, varName, partsArray, errorsArray, indexVar));
    } else {
        builder.addStatement(`${partsArray}.push(JSON.stringify(${varName}));`);
    }

    return builder.getCode();
}

/**
 * Generates serialization code for objects
 */
function generateObjectSerialize(
    type: Type,
    varName: string,
    partsArray: string,
    errorsArray: string,
    pathPrefix: string = "",
): string {
    const builder = new CodeBuilder();

    builder.addStatement(`
        if (typeof ${varName} !== "object" || ${varName} === null) {
            ${errorsArray}.push({
                path: "${pathPrefix}",
                error: "expected object, got " + typeof ${varName},
                expected: { type: "object" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        } else {
            ${partsArray}.push("{");
            let _first = true;
    `);

    const properties = type.getProperties();
    for (const prop of properties) {
        const propName = prop.getName();
        const declaration = getFirstDeclaration(prop);
        if (!declaration) continue;

        const propType = prop.getTypeAtLocation(declaration);
        const isOptional = prop.isOptional();
        const propVarName = `${varName}.${propName}`;
        const propPath = pathPrefix ? `${pathPrefix}.${propName}` : propName;

        builder.addStatement(`
            if (${isOptional ? `${propVarName} !== undefined` : "true"}) {
                if (!_first) ${partsArray}.push(",");
                _first = false;
                ${partsArray}.push('"${escapeString(propName)}":');
                ${generatePropertySerialize(propType, propVarName, partsArray, errorsArray, propPath, isOptional)}
            }
        `);
    }

    builder.addStatement(`
            ${partsArray}.push("}");
        }
    `);

    return builder.getCode();
}

/**
 * Generates serialization for object properties
 */
function generatePropertySerialize(
    type: Type,
    varName: string,
    partsArray: string,
    errorsArray: string,
    path: string,
    isOptional: boolean,
): string {
    const builder = new CodeBuilder();

    if (type.isString() || type.isStringLiteral()) {
        builder.addStatement(`
            if (typeof ${varName} !== "string") {
                ${errorsArray}.push({
                    path: "${path}",
                    error: "expected string, got " + typeof ${varName},
                    expected: { type: "string" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            } else {
                ${partsArray}.push(JSON.stringify(${varName}));
            }
        `);
    } else if (type.isNumber() || type.isNumberLiteral()) {
        builder.addStatement(`
            if (typeof ${varName} !== "number") {
                ${errorsArray}.push({
                    path: "${path}",
                    error: "expected number, got " + typeof ${varName},
                    expected: { type: "number" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            } else {
                ${partsArray}.push(String(${varName}));
            }
        `);
    } else if (type.isBoolean() || type.isBooleanLiteral()) {
        builder.addStatement(`
            if (typeof ${varName} !== "boolean") {
                ${errorsArray}.push({
                    path: "${path}",
                    error: "expected boolean, got " + typeof ${varName},
                    expected: { type: "boolean" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            } else {
                ${partsArray}.push(${varName} ? "true" : "false");
            }
        `);
    } else if (type.isNull()) {
        builder.addStatement(`${partsArray}.push("null");`);
    } else if (type.isArray()) {
        builder.addStatement(generateArraySerialize(type, varName, partsArray, errorsArray));
    } else if (type.isUnion()) {
        builder.addStatement(generateUnionSerialize(type, varName, partsArray, errorsArray));
    } else if (type.isObject()) {
        builder.addStatement(generateObjectSerialize(type, varName, partsArray, errorsArray, path));
    } else {
        builder.addStatement(`${partsArray}.push(JSON.stringify(${varName}));`);
    }

    return builder.getCode();
}

/**
 * Generates serialization for union types
 */
function generateUnionSerialize(type: Type, varName: string, partsArray: string, errorsArray: string): string {
    const builder = new CodeBuilder();
    const unionTypes = type.getUnionTypes();

    // Handle null/undefined in unions
    const nullType = unionTypes.find((t) => t.isNull());
    const undefinedType = unionTypes.find((t) => t.isUndefined());
    const otherTypes = unionTypes.filter((t) => !t.isNull() && !t.isUndefined());

    // Note: undefined is not valid in JSON, so we skip it or treat it as null
    // For JSON serialization, undefined values should typically be omitted at the property level

    if (nullType && otherTypes.length > 0) {
        // Has null and other types - check null first
        builder.addStatement(`
            if (${varName} === null) {
                ${partsArray}.push("null");
            } else {
                ${partsArray}.push(JSON.stringify(${varName}));
            }
        `);
    } else if (nullType) {
        // Only null type
        builder.addStatement(`${partsArray}.push("null");`);
    } else if (undefinedType && otherTypes.length > 0) {
        // Has undefined and other types - treat undefined as null for JSON compatibility
        builder.addStatement(`
            if (${varName} === undefined) {
                ${partsArray}.push("null");
            } else {
                ${partsArray}.push(JSON.stringify(${varName}));
            }
        `);
    } else if (undefinedType) {
        // Only undefined type - treat as null for JSON compatibility
        builder.addStatement(`${partsArray}.push("null");`);
    } else {
        // No null/undefined, just other types - use JSON.stringify
        builder.addStatement(`${partsArray}.push(JSON.stringify(${varName}));`);
    }

    return builder.getCode();
}

/**
 * Generates JSON parser code with validation
 */
export function generateParserCode(type: Type): string {
    const builder = new CodeBuilder();

    builder.addStatement(`
        (function(src) {
            const input = typeof src === "string" ? src : src.toString("utf-8");
            let parsed;
            try {
                parsed = JSON.parse(input);
            } catch (e) {
                throw new TypeError("Invalid JSON: " + e.message);
            }
            
            // Now validate the parsed value
            const errors = [];
            ${generateValidationCode(type, "parsed", "errors", "")}
            
            if (errors.length > 0) {
                const errorMsg = errors.map(e => e.error + " at " + e.path).join("; ");
                throw new TypeError("Parse validation failed: " + errorMsg);
            }
            
            return parsed;
        })
    `);

    return builder.getCode();
}

/**
 * Generates validation code for parsed JSON
 */
function generateValidationCode(type: Type, varName: string, errorsArray: string, path: string): string {
    const builder = new CodeBuilder();

    if (type.isString() || type.isStringLiteral()) {
        builder.addStatement(`
            if (typeof ${varName} !== "string") {
                ${errorsArray}.push({
                    path: "${path}",
                    error: "expected string, got " + typeof ${varName},
                    expected: { type: "string" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            }
        `);
    } else if (type.isNumber() || type.isNumberLiteral()) {
        builder.addStatement(`
            if (typeof ${varName} !== "number") {
                ${errorsArray}.push({
                    path: "${path}",
                    error: "expected number, got " + typeof ${varName},
                    expected: { type: "number" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            }
        `);
    } else if (type.isBoolean() || type.isBooleanLiteral()) {
        builder.addStatement(`
            if (typeof ${varName} !== "boolean") {
                ${errorsArray}.push({
                    path: "${path}",
                    error: "expected boolean, got " + typeof ${varName},
                    expected: { type: "boolean" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            }
        `);
    } else if (type.isNull()) {
        builder.addStatement(`
            if (${varName} !== null) {
                ${errorsArray}.push({
                    path: "${path}",
                    error: "expected null, got " + typeof ${varName},
                    expected: { type: "null" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            }
        `);
    } else if (type.isArray()) {
        builder.addStatement(generateArrayValidation(type, varName, errorsArray, path));
    } else if (type.isUnion()) {
        builder.addStatement(generateUnionValidation(type, varName, errorsArray, path));
    } else if (type.isObject()) {
        builder.addStatement(generateObjectValidation(type, varName, errorsArray, path));
    }

    return builder.getCode();
}

/**
 * Generates validation code with dynamic path (for use in loops)
 * The pathVar parameter should be a variable name that will be evaluated at runtime
 */
function generateValidationCodeDynamic(type: Type, varName: string, errorsArray: string, pathVar: string): string {
    const builder = new CodeBuilder();

    if (type.isString() || type.isStringLiteral()) {
        builder.addStatement(`
            if (typeof ${varName} !== "string") {
                ${errorsArray}.push({
                    path: ${pathVar},
                    error: "expected string, got " + typeof ${varName},
                    expected: { type: "string" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            }
        `);
    } else if (type.isNumber() || type.isNumberLiteral()) {
        builder.addStatement(`
            if (typeof ${varName} !== "number") {
                ${errorsArray}.push({
                    path: ${pathVar},
                    error: "expected number, got " + typeof ${varName},
                    expected: { type: "number" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            }
        `);
    } else if (type.isBoolean() || type.isBooleanLiteral()) {
        builder.addStatement(`
            if (typeof ${varName} !== "boolean") {
                ${errorsArray}.push({
                    path: ${pathVar},
                    error: "expected boolean, got " + typeof ${varName},
                    expected: { type: "boolean" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            }
        `);
    } else if (type.isNull()) {
        builder.addStatement(`
            if (${varName} !== null) {
                ${errorsArray}.push({
                    path: ${pathVar},
                    error: "expected null, got " + typeof ${varName},
                    expected: { type: "null" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            }
        `);
    } else if (type.isArray()) {
        builder.addStatement(generateArrayValidationDynamic(type, varName, errorsArray, pathVar));
    } else if (type.isUnion()) {
        builder.addStatement(generateUnionValidationDynamic(type, varName, errorsArray, pathVar));
    } else if (type.isObject()) {
        builder.addStatement(generateObjectValidationDynamic(type, varName, errorsArray, pathVar));
    }

    return builder.getCode();
}

/**
 * Helper for array validation with dynamic paths
 */
function generateArrayValidationDynamic(type: Type, varName: string, errorsArray: string, pathVar: string): string {
    const builder = new CodeBuilder();
    const arrayElementType = type.getArrayElementType();

    if (!arrayElementType) {
        builder.addStatement(`
            if (!Array.isArray(${varName})) {
                ${errorsArray}.push({
                    path: ${pathVar},
                    error: "expected array, got " + typeof ${varName},
                    expected: { type: "array" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            }
        `);
        return builder.getCode();
    }

    const itemVar = `_item_${varName.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const indexVar = `_i_${varName.replace(/[^a-zA-Z0-9]/g, "_")}`;

    builder.addStatement(`
        if (!Array.isArray(${varName})) {
            ${errorsArray}.push({
                path: ${pathVar},
                error: "expected array, got " + typeof ${varName},
                expected: { type: "array" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        } else {
            for (let ${indexVar} = 0; ${indexVar} < ${varName}.length; ${indexVar}++) {
                const ${itemVar} = ${varName}[${indexVar}];
                const nestedPath = ${pathVar} + "[" + ${indexVar} + "]";
                ${generateValidationCodeDynamic(arrayElementType, itemVar, errorsArray, "nestedPath")}
            }
        }
    `);

    return builder.getCode();
}

/**
 * Helper for object validation with dynamic paths
 */
function generateObjectValidationDynamic(type: Type, varName: string, errorsArray: string, pathVar: string): string {
    const builder = new CodeBuilder();

    builder.addStatement(`
        if (typeof ${varName} !== "object" || ${varName} === null) {
            ${errorsArray}.push({
                path: ${pathVar},
                error: "expected object, got " + typeof ${varName},
                expected: { type: "object" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        } else {
    `);

    const properties = type.getProperties();
    for (const prop of properties) {
        const propName = prop.getName();
        const declaration = getFirstDeclaration(prop);
        if (!declaration) continue;

        const propType = prop.getTypeAtLocation(declaration);
        const isOptional = prop.isOptional();
        const propVarName = `${varName}.${propName}`;

        if (isOptional) {
            builder.addStatement(`
                if (${propVarName} !== undefined) {
                    const propPath = ${pathVar} + ".${propName}";
                    ${generateValidationCodeDynamic(propType, propVarName, errorsArray, "propPath")}
                }
            `);
        } else {
            builder.addStatement(`
                if (${propVarName} === undefined) {
                    ${errorsArray}.push({
                        path: ${pathVar} + ".${propName}",
                        error: "required property is missing",
                        expected: { type: "defined" },
                        actual: { type: "undefined", value: undefined }
                    });
                } else {
                    const propPath = ${pathVar} + ".${propName}";
                    ${generateValidationCodeDynamic(propType, propVarName, errorsArray, "propPath")}
                }
            `);
        }
    }

    builder.addStatement(`}`);

    return builder.getCode();
}

/**
 * Helper for union validation with dynamic paths
 */
function generateUnionValidationDynamic(type: Type, varName: string, errorsArray: string, pathVar: string): string {
    const builder = new CodeBuilder();
    const unionTypes = type.getUnionTypes();

    const nullType = unionTypes.find((t) => t.isNull());
    const undefinedType = unionTypes.find((t) => t.isUndefined());
    const otherTypes = unionTypes.filter((t) => !t.isNull() && !t.isUndefined());

    if (otherTypes.length === 0) {
        if (nullType && undefinedType) {
            builder.addStatement(`
                if (${varName} !== null && ${varName} !== undefined) {
                    ${errorsArray}.push({
                        path: ${pathVar},
                        error: "expected null or undefined",
                        expected: { type: "null | undefined" },
                        actual: { type: typeof ${varName}, value: ${varName} }
                    });
                }
            `);
        }
        return builder.getCode();
    }

    // Try each union member
    const tempVar = `_valid_${varName.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const errorCountVar = `_errorCount_${varName.replace(/[^a-zA-Z0-9]/g, "_")}`;

    builder.addStatement(`
        const ${errorCountVar} = ${errorsArray}.length;
        let ${tempVar} = false;
    `);

    for (let i = 0; i < otherTypes.length; i++) {
        const unionType = otherTypes[i]!;
        builder.addStatement(`
            if (!${tempVar}) {
                const _errLen_${i} = ${errorsArray}.length;
                ${generateValidationCodeDynamic(unionType, varName, errorsArray, pathVar)}
                if (${errorsArray}.length === _errLen_${i}) {
                    ${tempVar} = true;
                } else {
                    ${errorsArray}.length = _errLen_${i};
                }
            }
        `);
    }

    if (nullType || undefinedType) {
        const conditions: string[] = [];
        if (nullType) conditions.push(`${varName} === null`);
        if (undefinedType) conditions.push(`${varName} === undefined`);
        builder.addStatement(`
            if (${conditions.join(" || ")}) {
                ${tempVar} = true;
                ${errorsArray}.length = ${errorCountVar};
            }
        `);
    }

    builder.addStatement(`
        if (!${tempVar}) {
            ${errorsArray}.push({
                path: ${pathVar},
                error: "value does not match any union member",
                expected: { type: "union" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        }
    `);

    return builder.getCode();
}

/**
 * Generates validation for arrays
 */
function generateArrayValidation(type: Type, varName: string, errorsArray: string, path: string): string {
    const builder = new CodeBuilder();
    const arrayElementType = type.getArrayElementType();

    if (!arrayElementType) {
        builder.addStatement(`
            if (!Array.isArray(${varName})) {
                ${errorsArray}.push({
                    path: "${path}",
                    error: "expected array, got " + typeof ${varName},
                    expected: { type: "array" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            }
        `);
        return builder.getCode();
    }

    const itemVar = `_item_${varName.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const indexVar = `_i_${varName.replace(/[^a-zA-Z0-9]/g, "_")}`;

    builder.addStatement(`
        if (!Array.isArray(${varName})) {
            ${errorsArray}.push({
                path: "${path}",
                error: "expected array, got " + typeof ${varName},
                expected: { type: "array" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        } else {
            for (let ${indexVar} = 0; ${indexVar} < ${varName}.length; ${indexVar}++) {
                const ${itemVar} = ${varName}[${indexVar}];
                const itemPath = "${path}" + "[" + ${indexVar} + "]";
                ${generateValidationCodeDynamic(arrayElementType, itemVar, errorsArray, "itemPath")}
            }
        }
    `);

    return builder.getCode();
}

/**
 * Generates validation for objects
 */
function generateObjectValidation(type: Type, varName: string, errorsArray: string, path: string): string {
    const builder = new CodeBuilder();

    builder.addStatement(`
        if (typeof ${varName} !== "object" || ${varName} === null) {
            ${errorsArray}.push({
                path: "${path}",
                error: "expected object, got " + typeof ${varName},
                expected: { type: "object" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        } else {
    `);

    const properties = type.getProperties();
    for (const prop of properties) {
        const propName = prop.getName();
        const declaration = getFirstDeclaration(prop);
        if (!declaration) continue;

        const propType = prop.getTypeAtLocation(declaration);
        const isOptional = prop.isOptional();
        const propVarName = `${varName}.${propName}`;
        const propPath = path ? `${path}.${propName}` : propName;

        if (isOptional) {
            builder.addStatement(`
                if (${propVarName} !== undefined) {
                    ${generateValidationCode(propType, propVarName, errorsArray, propPath)}
                }
            `);
        } else {
            builder.addStatement(`
                if (${propVarName} === undefined) {
                    ${errorsArray}.push({
                        path: "${propPath}",
                        error: "required property is missing",
                        expected: { type: "defined" },
                        actual: { type: "undefined", value: undefined }
                    });
                } else {
                    ${generateValidationCode(propType, propVarName, errorsArray, propPath)}
                }
            `);
        }
    }

    builder.addStatement(`}`);

    return builder.getCode();
}

/**
 * Generates validation for union types
 */
function generateUnionValidation(type: Type, varName: string, errorsArray: string, path: string): string {
    const builder = new CodeBuilder();
    const unionTypes = type.getUnionTypes();

    const nullType = unionTypes.find((t) => t.isNull());
    const undefinedType = unionTypes.find((t) => t.isUndefined());
    const otherTypes = unionTypes.filter((t) => !t.isNull() && !t.isUndefined());

    if (otherTypes.length === 0) {
        if (nullType && undefinedType) {
            builder.addStatement(`
                if (${varName} !== null && ${varName} !== undefined) {
                    ${errorsArray}.push({
                        path: "${path}",
                        error: "expected null or undefined",
                        expected: { type: "null | undefined" },
                        actual: { type: typeof ${varName}, value: ${varName} }
                    });
                }
            `);
        }
        return builder.getCode();
    }

    // Try each union member
    const tempVar = `_valid_${varName.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const errorCountVar = `_errorCount_${varName.replace(/[^a-zA-Z0-9]/g, "_")}`;

    builder.addStatement(`
        const ${errorCountVar} = ${errorsArray}.length;
        let ${tempVar} = false;
    `);

    for (let i = 0; i < otherTypes.length; i++) {
        const unionType = otherTypes[i]!;
        builder.addStatement(`
            if (!${tempVar}) {
                const _errLen_${i} = ${errorsArray}.length;
                ${generateValidationCode(unionType, varName, errorsArray, path)}
                if (${errorsArray}.length === _errLen_${i}) {
                    ${tempVar} = true;
                } else {
                    ${errorsArray}.length = _errLen_${i};
                }
            }
        `);
    }

    if (nullType || undefinedType) {
        const conditions: string[] = [];
        if (nullType) conditions.push(`${varName} === null`);
        if (undefinedType) conditions.push(`${varName} === undefined`);
        builder.addStatement(`
            if (${conditions.join(" || ")}) {
                ${tempVar} = true;
                ${errorsArray}.length = ${errorCountVar};
            }
        `);
    }

    builder.addStatement(`
        if (!${tempVar}) {
            ${errorsArray}.push({
                path: "${path}",
                error: "value does not match any union member",
                expected: { type: "union" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        }
    `);

    return builder.getCode();
}
