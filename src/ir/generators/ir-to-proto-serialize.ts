/**
 * IR to Protobuf Serialize/Parse generator
 *
 * Generates optimized Protobuf serialization and parsing functions from IR types.
 */
import type { IRType, IRObject, IRArray, IRUnion } from "../types";
import { isArray, isObject, isPrimitive, isUnion, removeNullAndUndefinedFromUnion } from "../utils";

/**
 * Wire format types for protobuf
 */
enum WireType {
    Varint = 0, // int32, int64, uint32, uint64, sint32, sint64, bool, enum
    Fixed64 = 1, // fixed64, sfixed64, double
    LengthDelimited = 2, // string, bytes, embedded messages, packed repeated fields
    StartGroup = 3, // groups (deprecated)
    EndGroup = 4, // groups (deprecated)
    Fixed32 = 5, // fixed32, sfixed32, float
}

/**
 * Counter for generating unique variable names
 */
let uniqueIdCounter = 0;
function getUniqueVarName(base: string): string {
    return `${base}_${uniqueIdCounter++}`;
}

/**
 * Get protobuf wire type for an IR type
 */
function getWireType(type: IRType): WireType {
    if (isPrimitive(type)) {
        switch (type.primitiveType) {
            case "string":
                return WireType.LengthDelimited;
            case "number":
            case "integer":
            case "boolean":
                return WireType.Varint;
            default:
                return WireType.LengthDelimited;
        }
    }
    if (isArray(type) || isObject(type)) {
        return WireType.LengthDelimited;
    }
    return WireType.LengthDelimited;
}

/**
 * Generate code to write a varint
 */
function writeVarintCode(valueVar: string, writerVar: string): string {
    return `
        {
            let val = ${valueVar} >>> 0; // Convert to unsigned 32-bit integer
            while (val > 0x7F) {
                if (${writerVar}.buf) {
                    ${writerVar}.buf[${writerVar}.pos++] = (val & 0x7F) | 0x80;
                } else {
                    ${writerVar}.chunks.push(new Uint8Array([(val & 0x7F) | 0x80]));
                    ${writerVar}.size += 1;
                }
                val >>>= 7;
            }
            if (${writerVar}.buf) {
                ${writerVar}.buf[${writerVar}.pos++] = val & 0x7F;
            } else {
                ${writerVar}.chunks.push(new Uint8Array([val & 0x7F]));
                ${writerVar}.size += 1;
            }
        }
    `;
}

/**
 * Generate code to write a string
 */
function writeStringCode(valueVar: string, writerVar: string): string {
    return `
        {
            const bytes = new TextEncoder().encode(${valueVar});
            ${writeVarintCode("bytes.length", writerVar)}
            if (${writerVar}.buf) {
                ${writerVar}.buf.set(bytes, ${writerVar}.pos);
                ${writerVar}.pos += bytes.length;
            } else {
                ${writerVar}.chunks.push(bytes);
                ${writerVar}.size += bytes.length;
            }
        }
    `;
}

/**
 * Generate code to read a varint
 */
function readVarintCode(bytesVar: string, posVar: string): string {
    return `
        (function() {
            let val = 0;
            let shift = 0;
            while (true) {
                if (${posVar} >= ${bytesVar}.length) {
                    throw new TypeError("Unexpected end of protobuf data while reading varint");
                }
                const byte = ${bytesVar}[${posVar}++];
                val |= (byte & 0x7F) << shift;
                if ((byte & 0x80) === 0) break;
                shift += 7;
                if (shift > 63) {
                    throw new TypeError("Varint too long");
                }
            }
            return val;
        })()
    `;
}

/**
 * Generate code to read a string
 */
function readStringCode(bytesVar: string, posVar: string): string {
    return `
        (function() {
            const len = ${readVarintCode(bytesVar, posVar)};
            if (${posVar} + len > ${bytesVar}.length) {
                throw new TypeError("Unexpected end of protobuf data while reading string");
            }
            const str = new TextDecoder().decode(${bytesVar}.slice(${posVar}, ${posVar} + len));
            ${posVar} += len;
            return str;
        })()
    `;
}

/**
 * Generate optimized protobuf serialization code for an IR type
 */
export function irToProtobufSerialize(type: IRType): string {
    // Reset counter for each serializer
    uniqueIdCounter = 0;

    // Generate the serializer function with both overloads
    return `
        (function(value, buf) {
            const writer = buf ? { buf, pos: 0 } : { chunks: [], size: 0 };
            const errors = [];
            ${generateSerializeBody(type, "value", "writer", "errors")}
            
            if (errors.length > 0) {
                const errorMsg = errors.map(e => e.error + " at " + e.path).join("; ");
                throw new TypeError("Protobuf serialization validation failed: " + errorMsg);
            }
            
            if (buf) {
                return; // void return for buffer overload
            } else {
                // Combine chunks into final Uint8Array
                const result = new Uint8Array(writer.size);
                let offset = 0;
                for (const chunk of writer.chunks) {
                    result.set(chunk, offset);
                    offset += chunk.length;
                }
                return result;
            }
        })
    `.trim();
}

/**
 * Generate the body of serialization logic
 */
function generateSerializeBody(type: IRType, varName: string, writerVar: string, errorsArray: string): string {
    if (isObject(type)) {
        return generateObjectSerialize(type, varName, writerVar, errorsArray, "");
    } else {
        // For non-object types at the top level, error
        return `
            ${errorsArray}.push({
                path: "",
                error: "protobuf serialization requires an object type at the top level",
                expected: { type: "object" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        `;
    }
}

/**
 * Generate serialization code for objects
 */
function generateObjectSerialize(
    type: IRObject,
    varName: string,
    writerVar: string,
    errorsArray: string,
    pathPrefix: string,
): string {
    let code = `
        if (typeof ${varName} !== "object" || ${varName} === null) {
            ${errorsArray}.push({
                path: "${pathPrefix}",
                error: "expected object, got " + typeof ${varName},
                expected: { type: "object" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        } else {
    `;

    let fieldNumber = 1;

    for (const prop of type.properties) {
        const propName = prop.name;
        const propType = prop.type;
        const isOptional = !prop.required;
        const propVarName = `${varName}[${JSON.stringify(propName)}]`;
        const propPath = pathPrefix ? `${pathPrefix}.${propName}` : propName;

        const wireType = getWireType(propType);
        const tag = (fieldNumber << 3) | wireType;

        code += `
            // Field ${fieldNumber}: ${propName}
            if (${isOptional ? `${propVarName} !== undefined` : "true"}) {
                ${generatePropertySerialize(propType, propVarName, writerVar, errorsArray, propPath, isOptional, tag, fieldNumber)}
            } ${
                !isOptional
                    ? `else {
                ${errorsArray}.push({
                    path: "${propPath}",
                    error: "required field is missing",
                    expected: { type: "defined" },
                    actual: { type: "undefined", value: undefined }
                });
            }`
                    : ""
            }
        `;

        fieldNumber++;
    }

    code += `}`;
    return code;
}

/**
 * Generate serialization for property values
 */
function generatePropertySerialize(
    type: IRType,
    varName: string,
    writerVar: string,
    errorsArray: string,
    path: string,
    isOptional: boolean,
    tag: number,
    fieldNumber: number,
): string {
    // For optional fields with union containing null/undefined, unwrap
    let actualType = type;
    if (isOptional && isUnion(type)) {
        const nonNullTypes = removeNullAndUndefinedFromUnion(type.types);
        if (nonNullTypes.length === 1) {
            actualType = nonNullTypes[0]!;
        }
    }

    if (isPrimitive(actualType)) {
        switch (actualType.primitiveType) {
            case "string":
                return `
                    if (typeof ${varName} !== "string") {
                        ${errorsArray}.push({
                            path: "${path}",
                            error: "expected string, got " + typeof ${varName},
                            expected: { type: "string" },
                            actual: { type: typeof ${varName}, value: ${varName} }
                        });
                    } else {
                        // Write tag
                        ${writeVarintCode(tag.toString(), writerVar)}
                        // Write string value
                        ${writeStringCode(varName, writerVar)}
                    }
                `;

            case "number":
            case "integer":
                return `
                    if (typeof ${varName} !== "number") {
                        ${errorsArray}.push({
                            path: "${path}",
                            error: "expected number, got " + typeof ${varName},
                            expected: { type: "number" },
                            actual: { type: typeof ${varName}, value: ${varName} }
                        });
                    } else {
                        // Write tag
                        ${writeVarintCode(tag.toString(), writerVar)}
                        // Write number value as varint
                        ${writeVarintCode(varName, writerVar)}
                    }
                `;

            case "boolean":
                return `
                    if (typeof ${varName} !== "boolean") {
                        ${errorsArray}.push({
                            path: "${path}",
                            error: "expected boolean, got " + typeof ${varName},
                            expected: { type: "boolean" },
                            actual: { type: typeof ${varName}, value: ${varName} }
                        });
                    } else {
                        // Write tag
                        ${writeVarintCode(tag.toString(), writerVar)}
                        // Write boolean as varint (0 or 1)
                        ${writeVarintCode(`${varName} ? 1 : 0`, writerVar)}
                    }
                `;

            default:
                return `// Unsupported primitive type: ${actualType.primitiveType}`;
        }
    }

    if (isArray(actualType)) {
        return generateArraySerialize(actualType, varName, writerVar, errorsArray, path, tag, fieldNumber);
    }

    if (isObject(actualType)) {
        return generateNestedObjectSerialize(actualType, varName, writerVar, errorsArray, path, tag);
    }

    // Fallback
    return `// Unsupported type for field ${path}, skipping serialization`;
}

/**
 * Generate serialization code for arrays (repeated fields)
 */
function generateArraySerialize(
    type: IRArray,
    varName: string,
    writerVar: string,
    errorsArray: string,
    path: string,
    baseTag: number,
    fieldNumber: number,
): string {
    const elementType = type.items;
    const itemVar = getUniqueVarName("item");
    const indexVar = getUniqueVarName("i");

    // For primitive types, use packed encoding (proto3 default)
    const isPrimitivePackable =
        isPrimitive(elementType) &&
        (elementType.primitiveType === "number" ||
            elementType.primitiveType === "integer" ||
            elementType.primitiveType === "boolean");

    if (isPrimitivePackable) {
        // Use packed encoding for numbers and booleans
        const tempWriter = getUniqueVarName("tempWriter");
        return `
            if (!Array.isArray(${varName})) {
                ${errorsArray}.push({
                    path: "${path}",
                    error: "expected array, got " + typeof ${varName},
                    expected: { type: "array" },
                    actual: { type: typeof ${varName}, value: ${varName} }
                });
            } else if (${varName}.length > 0) {
                // Use packed encoding: tag + length + values
                const ${tempWriter} = { chunks: [], size: 0 };
                for (let ${indexVar} = 0; ${indexVar} < ${varName}.length; ${indexVar}++) {
                    const ${itemVar} = ${varName}[${indexVar}];
                    ${generatePackedValue(elementType, itemVar, tempWriter, errorsArray, `${path}[\${${indexVar}}]`)}
                }
                // Write tag for length-delimited packed field
                ${writeVarintCode(baseTag.toString(), writerVar)}
                // Write length
                ${writeVarintCode(`${tempWriter}.size`, writerVar)}
                // Write packed values
                for (const chunk of ${tempWriter}.chunks) {
                    if (${writerVar}.buf) {
                        ${writerVar}.buf.set(chunk, ${writerVar}.pos);
                        ${writerVar}.pos += chunk.length;
                    } else {
                        ${writerVar}.chunks.push(chunk);
                        ${writerVar}.size += chunk.length;
                    }
                }
            }
        `;
    } else {
        // Use unpacked encoding for strings and objects (each gets its own tag)
        return `
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
                    ${generatePropertySerialize(elementType, itemVar, writerVar, errorsArray, `${path}[\${${indexVar}}]`, false, baseTag, fieldNumber)}
                }
            }
        `;
    }
}

/**
 * Generate code to write a packed array element value (without tag)
 */
function generatePackedValue(
    type: IRType,
    varName: string,
    writerVar: string,
    errorsArray: string,
    path: string,
): string {
    if (isPrimitive(type)) {
        if (type.primitiveType === "number" || type.primitiveType === "integer") {
            return `
                if (typeof ${varName} !== "number") {
                    ${errorsArray}.push({
                        path: "${path}",
                        error: "expected number, got " + typeof ${varName},
                        expected: { type: "number" },
                        actual: { type: typeof ${varName}, value: ${varName} }
                    });
                } else {
                    ${writeVarintCode(varName, writerVar)}
                }
            `;
        } else if (type.primitiveType === "boolean") {
            return `
                if (typeof ${varName} !== "boolean") {
                    ${errorsArray}.push({
                        path: "${path}",
                        error: "expected boolean, got " + typeof ${varName},
                        expected: { type: "boolean" },
                        actual: { type: typeof ${varName}, value: ${varName} }
                    });
                } else {
                    ${writeVarintCode(`${varName} ? 1 : 0`, writerVar)}
                }
            `;
        }
    }
    return "";
}

/**
 * Generate serialization for nested objects
 */
function generateNestedObjectSerialize(
    type: IRObject,
    varName: string,
    writerVar: string,
    errorsArray: string,
    path: string,
    tag: number,
): string {
    const tempWriter = getUniqueVarName("tempWriter");

    return `
        {
            // Serialize nested object to temporary buffer
            const ${tempWriter} = { chunks: [], size: 0 };
            ${generateObjectSerialize(type, varName, tempWriter, errorsArray, path)}
            
            // Write tag
            ${writeVarintCode(tag.toString(), writerVar)}
            // Write length
            ${writeVarintCode(`${tempWriter}.size`, writerVar)}
            // Write nested object bytes
            for (const chunk of ${tempWriter}.chunks) {
                if (${writerVar}.buf) {
                    ${writerVar}.buf.set(chunk, ${writerVar}.pos);
                    ${writerVar}.pos += chunk.length;
                } else {
                    ${writerVar}.chunks.push(chunk);
                    ${writerVar}.size += chunk.length;
                }
            }
        }
    `;
}

/**
 * Generate optimized protobuf parser code from IR type
 */
export function irToProtobufParse(type: IRType): string {
    // Reset counter for each parser
    uniqueIdCounter = 0;

    return `
        (function(src) {
            const bytes = src instanceof Uint8Array ? src : new Uint8Array(src.buffer, src.byteOffset, src.byteLength);
            let pos = 0;
            
            const errors = [];
            const result = {};
            
            ${generateParseBody(type, "result", "bytes", "pos", "errors")}
            
            if (errors.length > 0) {
                const errorMsg = errors.map(e => e.error + " at " + e.path).join("; ");
                throw new TypeError("Protobuf parse validation failed: " + errorMsg);
            }
            
            return result;
        })
    `.trim();
}

/**
 * Generate the body of parsing logic
 */
function generateParseBody(
    type: IRType,
    resultVar: string,
    bytesVar: string,
    posVar: string,
    errorsArray: string,
): string {
    if (!isObject(type)) {
        return "";
    }

    // Build field map from properties
    const fieldMap: Record<number, { name: string; type: IRType; required: boolean }> = {};
    let fieldNumber = 1;

    for (const prop of type.properties) {
        fieldMap[fieldNumber] = {
            name: prop.name,
            type: prop.type,
            required: prop.required,
        };

        fieldNumber++;
    }

    // Initialize arrays
    let initCode = "";
    for (const [_, fieldInfo] of Object.entries(fieldMap)) {
        // Unwrap optional union types
        let actualType = fieldInfo.type;
        if (!fieldInfo.required && isUnion(fieldInfo.type)) {
            const nonNullTypes = removeNullAndUndefinedFromUnion(fieldInfo.type.types);
            if (nonNullTypes.length === 1) {
                actualType = nonNullTypes[0]!;
            }
        }
        if (isArray(actualType)) {
            initCode += `${resultVar}[${JSON.stringify(fieldInfo.name)}] = [];\n`;
        }
    }

    // Generate field parsing cases
    const cases = Object.entries(fieldMap)
        .map(([fieldNum, fieldInfo]) => {
            return `
                case ${fieldNum}: {
                    ${generateFieldParse(fieldInfo.type, `${resultVar}[${JSON.stringify(fieldInfo.name)}]`, bytesVar, posVar, errorsArray, fieldInfo.name, !fieldInfo.required)}
                    break;
                }
            `;
        })
        .join("");

    // Generate required field validation
    const requiredValidation = Object.entries(fieldMap)
        .filter(([_, fieldInfo]) => fieldInfo.required)
        .map(([_, fieldInfo]) => {
            return `
                if (${resultVar}[${JSON.stringify(fieldInfo.name)}] === undefined) {
                    ${errorsArray}.push({
                        path: "${fieldInfo.name}",
                        error: "required field is missing",
                        expected: { type: "defined" },
                        actual: { type: "undefined", value: undefined }
                    });
                }
            `;
        })
        .join("");

    return `
        ${initCode}
        // Parse fields
        while (${posVar} < ${bytesVar}.length) {
            // Read tag
            const tag = ${readVarintCode(bytesVar, posVar)};
            const fieldNum = tag >>> 3;
            const wireType = tag & 0x7;
            
            switch (fieldNum) {
                ${cases}
                default:
                    // Skip unknown field
                    switch (wireType) {
                        case 0: // Varint
                            ${readVarintCode(bytesVar, posVar)};
                            break;
                        case 1: // Fixed64
                            ${posVar} += 8;
                            break;
                        case 2: // Length-delimited
                            const len = ${readVarintCode(bytesVar, posVar)};
                            ${posVar} += len;
                            break;
                        case 5: // Fixed32
                            ${posVar} += 4;
                            break;
                        default:
                            throw new TypeError("Unknown wire type: " + wireType);
                    }
            }
        }
        
        // Validate required fields
        ${requiredValidation}
    `;
}

/**
 * Generate code to parse a specific field
 */
function generateFieldParse(
    type: IRType,
    targetVar: string,
    bytesVar: string,
    posVar: string,
    errorsArray: string,
    fieldName: string,
    isOptional: boolean,
): string {
    // Unwrap optional union types
    let actualType = type;
    if (isOptional && isUnion(type)) {
        const nonNullTypes = removeNullAndUndefinedFromUnion(type.types);
        if (nonNullTypes.length === 1) {
            actualType = nonNullTypes[0]!;
        }
    }

    if (isPrimitive(actualType)) {
        switch (actualType.primitiveType) {
            case "string":
                return `${targetVar} = ${readStringCode(bytesVar, posVar)};`;
            case "number":
            case "integer":
                return `${targetVar} = ${readVarintCode(bytesVar, posVar)};`;
            case "boolean":
                return `${targetVar} = ${readVarintCode(bytesVar, posVar)} !== 0;`;
            default:
                return `// Unsupported primitive type: ${actualType.primitiveType}`;
        }
    }

    if (isArray(actualType)) {
        const elementType = actualType.items;

        // Check if this is a primitive type that uses packed encoding
        const isPrimitivePackable =
            isPrimitive(elementType) &&
            (elementType.primitiveType === "number" ||
                elementType.primitiveType === "integer" ||
                elementType.primitiveType === "boolean");

        if (isPrimitivePackable) {
            // Handle packed encoding for primitive arrays
            const readValue =
                isPrimitive(elementType) && elementType.primitiveType === "boolean"
                    ? `${readVarintCode(bytesVar, posVar)} !== 0`
                    : readVarintCode(bytesVar, posVar);

            return `
                {
                    // Read length
                    const len = ${readVarintCode(bytesVar, posVar)};
                    const endPos = ${posVar} + len;
                    
                    // Initialize array if needed
                    if (!Array.isArray(${targetVar})) {
                        ${targetVar} = [];
                    }
                    
                    // Read packed values
                    while (${posVar} < endPos) {
                        ${targetVar}.push(${readValue});
                    }
                }
            `;
        } else {
            // Handle unpacked encoding for strings and objects
            const tempVar = getUniqueVarName("temp");
            return `
                {
                    let ${tempVar};
                    ${generateFieldParse(elementType, tempVar, bytesVar, posVar, errorsArray, fieldName, false)}
                    if (Array.isArray(${targetVar})) {
                        ${targetVar}.push(${tempVar});
                    } else {
                        ${targetVar} = [${tempVar}];
                    }
                }
            `;
        }
    }

    if (isObject(actualType)) {
        return `
            {
                const len = ${readVarintCode(bytesVar, posVar)};
                const endPos = ${posVar} + len;
                const nested = {};
                // Parse nested message from current position to endPos
                const savedEndPos = ${posVar} + len;
                ${generateParseBody(actualType, "nested", bytesVar, posVar, errorsArray)}
                ${posVar} = savedEndPos;
                ${targetVar} = nested;
            }
        `;
    }

    // Fallback
    return `
        // Unsupported type for field ${fieldName}
        const len = ${readVarintCode(bytesVar, posVar)};
        ${posVar} += len;
    `;
}
