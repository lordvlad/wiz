import { Node, Symbol as MorphSymbol, Type, Project, type JSDocableNode } from "ts-morph";

type JsDocCapableNode = Node & Pick<JSDocableNode, "getJsDocs">;

function hasJsDocs(node: Node): node is JsDocCapableNode {
    return typeof (node as Partial<JsDocCapableNode>).getJsDocs === "function";
}

function getFirstDeclaration(symbol: MorphSymbol): Node | undefined {
    return symbol.getValueDeclaration?.() ?? symbol.getDeclarations()[0];
}

/**
 * Helper to generate unique variable names
 */
let uniqueIdCounter = 0;
function getUniqueVarName(base: string): string {
    return `${base}_${uniqueIdCounter++}`;
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
 * Get protobuf wire type for a TypeScript type
 */
function getWireType(type: Type): WireType {
    if (type.isString() || type.isStringLiteral()) {
        return WireType.LengthDelimited;
    } else if (type.isNumber() || type.isNumberLiteral()) {
        return WireType.Varint; // Default to varint for numbers
    } else if (type.isBoolean() || type.isBooleanLiteral()) {
        return WireType.Varint;
    } else if (type.isArray() || type.isObject()) {
        return WireType.LengthDelimited;
    }
    return WireType.LengthDelimited;
}

/**
 * Generates optimized protobuf serialization code for a type
 * This performs validation and serialization field-by-field for performance
 */
export function generateSerializerCode(type: Type): string {
    const builder = new CodeBuilder();
    // Reset counter for each serializer
    uniqueIdCounter = 0;

    // Generate the serializer function with both overloads
    builder.addStatement(`
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
    `);

    return builder.getCode();
}

/**
 * Generates the body of serialization logic
 */
function generateSerializeBody(type: Type, varName: string, writerVar: string, errorsArray: string): string {
    const builder = new CodeBuilder();

    if (type.isObject() && !type.isArray()) {
        builder.addStatement(generateObjectSerialize(type, varName, writerVar, errorsArray, ""));
    } else {
        // For non-object types at the top level, just validate
        builder.addStatement(`
            ${errorsArray}.push({
                path: "",
                error: "protobuf serialization requires an object type at the top level",
                expected: { type: "object" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        `);
    }

    return builder.getCode();
}

/**
 * Write protobuf varint
 */
function writeVarintCode(valueVar: string, writerVar: string): string {
    return `
        {
            let val = ${valueVar};
            while (val > 0x7F) {
                const chunk = new Uint8Array([val & 0x7F | 0x80]);
                if (${writerVar}.buf) {
                    ${writerVar}.buf[${writerVar}.pos++] = chunk[0];
                } else {
                    ${writerVar}.chunks.push(chunk);
                    ${writerVar}.size += 1;
                }
                val >>>= 7;
            }
            const chunk = new Uint8Array([val & 0x7F]);
            if (${writerVar}.buf) {
                ${writerVar}.buf[${writerVar}.pos++] = chunk[0];
            } else {
                ${writerVar}.chunks.push(chunk);
                ${writerVar}.size += 1;
            }
        }
    `;
}

/**
 * Write protobuf string
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
 * Generates serialization code for objects
 */
function generateObjectSerialize(
    type: Type,
    varName: string,
    writerVar: string,
    errorsArray: string,
    pathPrefix: string,
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
    `);

    const properties = type.getProperties();
    let fieldNumber = 1;

    for (const prop of properties) {
        const propName = prop.getName();
        const declaration = getFirstDeclaration(prop);
        if (!declaration) continue;

        const propType = prop.getTypeAtLocation(declaration);
        const isOptional = prop.isOptional();
        const propVarName = `${varName}.${propName}`;
        const propPath = pathPrefix ? `${pathPrefix}.${propName}` : propName;

        const wireType = getWireType(propType);
        const tag = (fieldNumber << 3) | wireType;

        builder.addStatement(`
            // Field ${fieldNumber}: ${propName}
            if (${isOptional ? `${propVarName} !== undefined` : "true"}) {
                ${generatePropertySerialize(propType, propVarName, writerVar, errorsArray, propPath, isOptional, tag, fieldNumber)}
            } ${!isOptional ? `else {
                ${errorsArray}.push({
                    path: "${propPath}",
                    error: "required field is missing",
                    expected: { type: "defined" },
                    actual: { type: "undefined", value: undefined }
                });
            }` : ""}
        `);

        fieldNumber++;
    }

    builder.addStatement(`}`);

    return builder.getCode();
}

/**
 * Generates serialization for object properties
 */
function generatePropertySerialize(
    type: Type,
    varName: string,
    writerVar: string,
    errorsArray: string,
    path: string,
    isOptional: boolean,
    tag: number,
    fieldNumber: number,
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
                // Write tag
                ${writeVarintCode(tag.toString(), writerVar)}
                // Write string value
                ${writeStringCode(varName, writerVar)}
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
                // Write tag
                ${writeVarintCode(tag.toString(), writerVar)}
                // Write number value as varint (for simplicity, treating all numbers as int32)
                ${writeVarintCode(varName, writerVar)}
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
                // Write tag
                ${writeVarintCode(tag.toString(), writerVar)}
                // Write boolean as varint (0 or 1)
                ${writeVarintCode(`${varName} ? 1 : 0`, writerVar)}
            }
        `);
    } else if (type.isArray()) {
        builder.addStatement(generateArraySerialize(type, varName, writerVar, errorsArray, path, tag, fieldNumber));
    } else if (type.isObject()) {
        builder.addStatement(generateNestedObjectSerialize(type, varName, writerVar, errorsArray, path, tag));
    } else {
        // Fallback - just validate it exists
        builder.addStatement(`
            // Unsupported type for field ${path}, skipping serialization
        `);
    }

    return builder.getCode();
}

/**
 * Generates serialization code for arrays (repeated fields)
 */
function generateArraySerialize(
    type: Type,
    varName: string,
    writerVar: string,
    errorsArray: string,
    path: string,
    baseTag: number,
    fieldNumber: number,
): string {
    const builder = new CodeBuilder();
    const arrayElementType = type.getArrayElementType();

    if (!arrayElementType) {
        builder.addStatement(`
            ${errorsArray}.push({
                path: "${path}",
                error: "cannot determine array element type",
                expected: { type: "array" },
                actual: { type: typeof ${varName}, value: ${varName} }
            });
        `);
        return builder.getCode();
    }

    const itemVar = getUniqueVarName("item");
    const indexVar = getUniqueVarName("i");

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
                ${generatePropertySerialize(arrayElementType, itemVar, writerVar, errorsArray, `${path}[${indexVar}]`, false, baseTag, fieldNumber)}
            }
        }
    `);

    return builder.getCode();
}

/**
 * Generates serialization for nested objects
 */
function generateNestedObjectSerialize(
    type: Type,
    varName: string,
    writerVar: string,
    errorsArray: string,
    path: string,
    tag: number,
): string {
    const builder = new CodeBuilder();
    const tempWriter = getUniqueVarName("tempWriter");

    builder.addStatement(`
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
    `);

    return builder.getCode();
}

/**
 * Generates protobuf parser code with validation
 */
export function generateParserCode(type: Type): string {
    const builder = new CodeBuilder();
    // Reset counter for each parser
    uniqueIdCounter = 0;

    builder.addStatement(`
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
    `);

    return builder.getCode();
}

/**
 * Read protobuf varint
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
 * Read protobuf string
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
 * Generates the body of parsing logic
 */
function generateParseBody(type: Type, resultVar: string, bytesVar: string, posVar: string, errorsArray: string): string {
    const builder = new CodeBuilder();

    if (type.isObject() && !type.isArray()) {
        // Initialize field tracking
        const properties = type.getProperties();
        const fieldMap: Record<number, { name: string; type: Type; optional: boolean }> = {};
        let fieldNumber = 1;

        for (const prop of properties) {
            const propName = prop.getName();
            const declaration = getFirstDeclaration(prop);
            if (!declaration) continue;

            const propType = prop.getTypeAtLocation(declaration);
            const isOptional = prop.isOptional();

            fieldMap[fieldNumber] = { name: propName, type: propType, optional: isOptional };

            // Initialize arrays
            if (propType.isArray()) {
                builder.addStatement(`${resultVar}.${propName} = [];`);
            }

            fieldNumber++;
        }

        builder.addStatement(`
            // Parse fields
            while (${posVar} < ${bytesVar}.length) {
                // Read tag
                const tag = ${readVarintCode(bytesVar, posVar)};
                const fieldNum = tag >>> 3;
                const wireType = tag & 0x7;
                
                switch (fieldNum) {
                    ${Object.entries(fieldMap)
                        .map(([fieldNum, fieldInfo]) => {
                            return `
                        case ${fieldNum}: {
                            ${generateFieldParse(fieldInfo.type, `${resultVar}.${fieldInfo.name}`, bytesVar, posVar, errorsArray, fieldInfo.name)}
                            break;
                        }
                    `;
                        })
                        .join("")}
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
            ${Object.entries(fieldMap)
                .filter(([_, fieldInfo]) => !fieldInfo.optional)
                .map(([_, fieldInfo]) => {
                    return `
                if (${resultVar}.${fieldInfo.name} === undefined) {
                    ${errorsArray}.push({
                        path: "${fieldInfo.name}",
                        error: "required field is missing",
                        expected: { type: "defined" },
                        actual: { type: "undefined", value: undefined }
                    });
                }
            `;
                })
                .join("")}
        `);
    }

    return builder.getCode();
}

/**
 * Generate code to parse a specific field
 */
function generateFieldParse(
    type: Type,
    targetVar: string,
    bytesVar: string,
    posVar: string,
    errorsArray: string,
    fieldName: string,
): string {
    const builder = new CodeBuilder();

    if (type.isString() || type.isStringLiteral()) {
        builder.addStatement(`${targetVar} = ${readStringCode(bytesVar, posVar)};`);
    } else if (type.isNumber() || type.isNumberLiteral()) {
        builder.addStatement(`${targetVar} = ${readVarintCode(bytesVar, posVar)};`);
    } else if (type.isBoolean() || type.isBooleanLiteral()) {
        builder.addStatement(`${targetVar} = ${readVarintCode(bytesVar, posVar)} !== 0;`);
    } else if (type.isArray()) {
        const arrayElementType = type.getArrayElementType();
        if (arrayElementType) {
            const tempVar = getUniqueVarName("temp");
            builder.addStatement(`
                {
                    const ${tempVar} = {};
                    ${generateFieldParse(arrayElementType, tempVar, bytesVar, posVar, errorsArray, fieldName)}
                    if (Array.isArray(${targetVar})) {
                        ${targetVar}.push(${tempVar});
                    } else {
                        ${targetVar} = [${tempVar}];
                    }
                }
            `);
        }
    } else if (type.isObject()) {
        builder.addStatement(`
            {
                const len = ${readVarintCode(bytesVar, posVar)};
                const endPos = ${posVar} + len;
                const nested = {};
                const savedPos = ${posVar};
                ${posVar} = endPos - len; // Reset to start of nested message
                ${generateParseBody(type, "nested", bytesVar, posVar, errorsArray)}
                ${posVar} = endPos;
                ${targetVar} = nested;
            }
        `);
    } else {
        builder.addStatement(`
            // Unsupported type for field ${fieldName}, skipping
            const len = ${readVarintCode(bytesVar, posVar)};
            ${posVar} += len;
        `);
    }

    return builder.getCode();
}
