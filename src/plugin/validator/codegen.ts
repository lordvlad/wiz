import { Type, ts } from "ts-morph";

/**
 * Escapes a string for use in generated code
 */
function escapeString(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

/**
 * Gets a safe type name for error messages
 */
function getTypeName(type: Type): string {
    const text = type.getText();
    // Simplify complex types for error messages
    if (text.length > 50) {
        if (type.isObject()) return 'object';
        if (type.isArray()) return 'array';
        if (type.isUnion()) return 'union';
        return 'complex type';
    }
    return text;
}

/**
 * Generates runtime validator code for a given TypeScript type
 */
export function generateValidatorCode(type: Type): string {
    const validatorFn = generateTypeCheck(type, "value", "");
    
    return `(function(value) {
        const errors = [];
        ${validatorFn}
        return errors;
    })`;
}

/**
 * Generates type check code for a type at a given path
 */
function generateTypeCheck(type: Type, varName: string, path: string): string {
    const checks: string[] = [];
    
    // Handle primitive types first (before union, since boolean is both)
    if (type.isString()) {
        checks.push(`if (typeof ${varName} !== "string") {
            errors.push({
                path: "${path}",
                error: "expected type 'string', saw " + typeof ${varName} + " " + JSON.stringify(${varName}),
                expected: { type: "string" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        }`);
        return checks.join("\n");
    }
    
    if (type.isNumber()) {
        checks.push(`if (typeof ${varName} !== "number") {
            errors.push({
                path: "${path}",
                error: "expected type 'number', saw " + typeof ${varName} + " " + JSON.stringify(${varName}),
                expected: { type: "number" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        }`);
        return checks.join("\n");
    }
    
    if (type.isBoolean()) {
        checks.push(`if (typeof ${varName} !== "boolean") {
            errors.push({
                path: "${path}",
                error: "expected type 'boolean', saw " + typeof ${varName} + " " + JSON.stringify(${varName}),
                expected: { type: "boolean" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        }`);
        return checks.join("\n");
    }
    
    // Handle undefined/null
    if (type.isUndefined()) {
        checks.push(`if (${varName} !== undefined) {
            errors.push({
                path: "${path}",
                error: "expected type 'undefined', saw " + typeof ${varName} + " " + JSON.stringify(${varName}),
                expected: { type: "undefined" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        }`);
        return checks.join("\n");
    }
    
    if (type.isNull()) {
        checks.push(`if (${varName} !== null) {
            errors.push({
                path: "${path}",
                error: "expected type 'null', saw " + typeof ${varName} + " " + JSON.stringify(${varName}),
                expected: { type: "null" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        }`);
        return checks.join("\n");
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
        const literalDisplay = typeof literalValue === "string" ? literalValue : String(literalValue);
        checks.push(`if (${varName} !== ${literalStr}) {
            errors.push({
                path: "${path}",
                error: "expected literal value " + ${literalStr} + ", saw " + JSON.stringify(${varName}),
                expected: { type: "literal", value: ${literalStr} },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        }`);
        return checks.join("\n");
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
    const unionTypes = type.getUnionTypes();
    
    // Filter out null and undefined for special handling
    const nullType = unionTypes.find(t => t.isNull());
    const undefinedType = unionTypes.find(t => t.isUndefined());
    const otherTypes = unionTypes.filter(t => !t.isNull() && !t.isUndefined());
    
    if (otherTypes.length === 0) {
        // Only null and/or undefined
        const checks: string[] = [];
        if (nullType && undefinedType) {
            checks.push(`if (${varName} !== null && ${varName} !== undefined) {
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
        return checks.join("\n");
    }
    
    // Generate checks for each union member
    const tempVar = `_valid_${varName.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const errorCountVar = `_errorCount_${varName.replace(/[^a-zA-Z0-9]/g, "_")}`;
    
    let code = `const ${errorCountVar} = errors.length;\n`;
    code += `let ${tempVar} = false;\n`;
    
    for (let i = 0; i < otherTypes.length; i++) {
        const unionType = otherTypes[i];
        const checkCode = generateTypeCheck(unionType, varName, path);
        
        code += `if (!${tempVar}) {\n`;
        code += `    const _errLen_${i} = errors.length;\n`;
        code += `    ${checkCode}\n`;
        code += `    if (errors.length === _errLen_${i}) {\n`;
        code += `        ${tempVar} = true;\n`;
        code += `    } else {\n`;
        code += `        errors.length = _errLen_${i};\n`;
        code += `    }\n`;
        code += `}\n`;
    }
    
    // Handle nullable unions
    if (nullType || undefinedType) {
        const conditions: string[] = [];
        if (nullType) conditions.push(`${varName} === null`);
        if (undefinedType) conditions.push(`${varName} === undefined`);
        code += `if (${conditions.join(" || ")}) {\n`;
        code += `    ${tempVar} = true;\n`;
        code += `    errors.length = ${errorCountVar};\n`;
        code += `}\n`;
    }
    
    code += `if (!${tempVar}) {\n`;
    code += `    errors.push({
        path: "${path}",
        error: "value does not match any union member",
        expected: { type: "union" },
        actual: { type: typeof ${varName}, value: ${varName} }
    });\n`;
    code += `}\n`;
    
    return code;
}

/**
 * Generates check for intersection types (A & B)
 */
function generateIntersectionCheck(type: Type, varName: string, path: string): string {
    const intersectionTypes = type.getIntersectionTypes();
    const checks = intersectionTypes.map(t => generateTypeCheck(t, varName, path));
    return checks.join("\n");
}

/**
 * Generates type check for array element with dynamic path
 * This is a specialized version of generateTypeCheck that handles dynamic paths
 */
function generateTypeCheckForArrayElement(type: Type, varName: string, pathPrefix: string, indexVar: string): string {
    const dynamicPath = pathPrefix ? `"${pathPrefix}" + ${indexVar}` : `String(${indexVar})`;
    
    // Primitives
    if (type.isString()) {
        return `if (typeof ${varName} !== "string") {
            errors.push({
                path: ${dynamicPath},
                error: "expected type 'string', saw " + typeof ${varName} + " " + JSON.stringify(${varName}),
                expected: { type: "string" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        }`;
    }
    
    if (type.isNumber()) {
        return `if (typeof ${varName} !== "number") {
            errors.push({
                path: ${dynamicPath},
                error: "expected type 'number', saw " + typeof ${varName} + " " + JSON.stringify(${varName}),
                expected: { type: "number" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        }`;
    }
    
    if (type.isBoolean()) {
        return `if (typeof ${varName} !== "boolean") {
            errors.push({
                path: ${dynamicPath},
                error: "expected type 'boolean', saw " + typeof ${varName} + " " + JSON.stringify(${varName}),
                expected: { type: "boolean" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        }`;
    }
    
    // Objects - handle nested objects in arrays
    if (type.isObject()) {
        const checks: string[] = [];
        checks.push(`if (typeof ${varName} !== "object" || ${varName} === null) {
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
            const propType = prop.getTypeAtLocation(prop.getDeclarations()[0]!);
            const isOptional = prop.isOptional();
            const typeName = escapeString(getTypeName(propType));
            
            const propVarName = `${varName}.${propName}`;
            const propDynamicPath = `${dynamicPath} + ".${propName}"`;
            
            if (isOptional) {
                checks.push(`if (${propVarName} !== undefined) {
                    ${generateTypeCheckForProperty(propType, propVarName, propDynamicPath)}
                }`);
            } else {
                checks.push(`if (${propVarName} === undefined) {
                    errors.push({
                        path: ${propDynamicPath},
                        error: "expected type '${typeName}', saw undefined",
                        expected: { type: "${typeName}" },
                        actual: { type: "undefined", value: undefined }
                    });
                } else {
                    ${generateTypeCheckForProperty(propType, propVarName, propDynamicPath)}
                }`);
            }
        }
        
        checks.push(`}`);
        return checks.join("\n");
    }
    
    return `// Unsupported array element type: ${type.getText()}`;
}

/**
 * Generates type check for object property with dynamic path
 */
function generateTypeCheckForProperty(type: Type, varName: string, dynamicPath: string): string {
    // Handle primitives with dynamic paths
    if (type.isString()) {
        return `if (typeof ${varName} !== "string") {
            errors.push({
                path: ${dynamicPath},
                error: "expected type 'string', saw " + typeof ${varName} + " " + JSON.stringify(${varName}),
                expected: { type: "string" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        }`;
    }
    
    if (type.isNumber()) {
        return `if (typeof ${varName} !== "number") {
            errors.push({
                path: ${dynamicPath},
                error: "expected type 'number', saw " + typeof ${varName} + " " + JSON.stringify(${varName}),
                expected: { type: "number" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        }`;
    }
    
    if (type.isBoolean()) {
        return `if (typeof ${varName} !== "boolean") {
            errors.push({
                path: ${dynamicPath},
                error: "expected type 'boolean', saw " + typeof ${varName} + " " + JSON.stringify(${varName}),
                expected: { type: "boolean" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        }`;
    }
    
    // For complex types, we'd need to recursively handle them
    // For now, return a basic check
    return `// Complex nested property type`;
}

/**
 * Generates check for array types
 */
function generateArrayCheck(type: Type, varName: string, path: string): string {
    const arrayElementType = type.getArrayElementType();
    if (!arrayElementType) {
        return `if (!Array.isArray(${varName})) {
            errors.push({
                path: "${path}",
                error: "expected array, saw " + typeof ${varName},
                expected: { type: "array" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        }`;
    }
    
    const itemVarName = `_item_${varName.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const indexVarName = `_i_${varName.replace(/[^a-zA-Z0-9]/g, "_")}`;
    
    // For array elements, we need to build the path at runtime using string concatenation
    // Pass a placeholder that will be replaced with the actual concatenation expression
    const elementPathBase = path ? `${path}.` : "";
    const elementCheck = generateTypeCheckForArrayElement(arrayElementType, itemVarName, elementPathBase, indexVarName);
    
    return `if (!Array.isArray(${varName})) {
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
    }`;
}

/**
 * Generates check for object types
 */
function generateObjectCheck(type: Type, varName: string, path: string): string {
    const checks: string[] = [];
    
    checks.push(`if (typeof ${varName} !== "object" || ${varName} === null) {
        errors.push({
            path: "${path}",
            error: "expected object, saw " + typeof ${varName},
            expected: { type: "object" },
            actual: { type: typeof ${varName}, value: ${varName} }
        });
    } else {`);
    
    const properties = type.getProperties();
    const requiredProps: string[] = [];
    const propertyChecks: string[] = [];
    
    for (const prop of properties) {
        const propName = prop.getName();
        const propType = prop.getTypeAtLocation(prop.getValueDeclaration()!);
        const isOptional = prop.isOptional();
        
        if (!isOptional) {
            requiredProps.push(propName);
        }
        
        const propPath = path ? `${path}.${propName}` : propName;
        const propVarName = `${varName}.${propName}`;
        
        const typeName = escapeString(getTypeName(propType));
        
        if (isOptional) {
            propertyChecks.push(`if (${propVarName} !== undefined) {
                ${generateTypeCheck(propType, propVarName, propPath)}
            }`);
        } else {
            propertyChecks.push(`if (${propVarName} === undefined) {
                errors.push({
                    path: "${propPath}",
                    error: "expected type '${typeName}', saw undefined",
                    expected: { type: "${typeName}" },
                    actual: { type: "undefined", value: undefined }
                });
            } else {
                ${generateTypeCheck(propType, propVarName, propPath)}
            }`);
        }
    }
    
    checks.push(...propertyChecks);
    checks.push(`}`);
    
    return checks.join("\n");
}

/**
 * Generates a type guard (is) function
 */
export function generateIsCode(type: Type): string {
    const validatorCode = generateValidatorCode(type);
    return `(function(value) {
        const validator = ${validatorCode};
        return validator(value).length === 0;
    })`;
}

/**
 * Generates an assert function
 */
export function generateAssertCode(type: Type, hasErrorFactory: boolean): string {
    const validatorCode = generateValidatorCode(type);
    
    if (hasErrorFactory) {
        return `(function(errorFactory) {
            const validator = ${validatorCode};
            return function(value) {
                const errors = validator(value);
                if (errors.length > 0) {
                    throw errorFactory(errors);
                }
            };
        })`;
    }
    
    return `(function(value) {
        const validator = ${validatorCode};
        const errors = validator(value);
        if (errors.length > 0) {
            const errorMsg = errors.map(e => e.error + " at " + e.path).join("; ");
            throw new TypeError("Validation failed: " + errorMsg);
        }
    })`;
}

/**
 * Generates inline validate code
 */
export function generateValidateCode(type: Type): string {
    const validatorCode = generateValidatorCode(type);
    return `(function(value) {
        const validator = ${validatorCode};
        return validator(value);
    })`;
}
