/**
 * Protobuf to TypeScript model generator
 */

export interface ProtoField {
    name: string;
    type: string;
    number: number;
    repeated?: boolean;
    optional?: boolean;
    map?: { keyType: string; valueType: string };
}

export interface ProtoMessage {
    name: string;
    fields: ProtoField[];
    nested?: ProtoMessage[];
}

export interface ProtoFile {
    syntax?: string;
    package?: string;
    messages: ProtoMessage[];
}

export interface GeneratorOptions {
    includeTags?: boolean;
    tags?: Record<string, any>;
}

/**
 * Parse .proto file content to ProtoFile structure
 */
export function parseProtoFile(content: string): ProtoFile {
    const result: ProtoFile = {
        messages: [],
    };

    const lines = content.split("\n");
    let currentMessage: ProtoMessage | null = null;
    let braceDepth = 0;

    for (let line of lines) {
        line = line.trim();

        // Remove inline comments
        const commentIndex = line.indexOf("//");
        if (commentIndex !== -1) {
            line = line.substring(0, commentIndex).trim();
        }

        // Skip comments and empty lines
        if (line.startsWith("/*") || !line) {
            continue;
        }

        // Parse syntax
        if (line.startsWith("syntax")) {
            const match = line.match(/syntax\s*=\s*"([^"]+)"/);
            if (match && match[1]) {
                result.syntax = match[1];
            }
            continue;
        }

        // Parse package
        if (line.startsWith("package")) {
            const match = line.match(/package\s+([^;]+);/);
            if (match && match[1]) {
                result.package = match[1];
            }
            continue;
        }

        // Parse message start
        if (line.startsWith("message")) {
            const match = line.match(/message\s+(\w+)\s*\{/);
            if (match && match[1]) {
                currentMessage = {
                    name: match[1],
                    fields: [],
                };
                braceDepth = 1;
            }
            continue;
        }

        // Track braces (handle multiple braces on same line)
        const openCount = (line.match(/\{/g) || []).length;
        const closeCount = (line.match(/\}/g) || []).length;
        braceDepth += openCount - closeCount;

        // End of message
        if (braceDepth === 0 && currentMessage) {
            result.messages.push(currentMessage);
            currentMessage = null;
            continue;
        }

        // Parse field inside message (only at top level, depth 1)
        // This ignores nested messages which we don't support yet
        if (currentMessage && braceDepth === 1 && !line.startsWith("message")) {
            const field = parseProtoField(line);
            if (field) {
                currentMessage.fields.push(field);
            }
        }
    }

    return result;
}

/**
 * Parse a protobuf field line
 */
function parseProtoField(line: string): ProtoField | null {
    // Handle repeated fields
    const repeatedMatch = line.match(/repeated\s+(\w+)\s+(\w+)\s*=\s*(\d+);/);
    if (repeatedMatch) {
        const type = repeatedMatch[1];
        const name = repeatedMatch[2];
        const number = repeatedMatch[3];
        if (type && name && number) {
            return {
                name,
                type,
                number: parseInt(number, 10),
                repeated: true,
            };
        }
    }

    // Handle optional fields
    const optionalMatch = line.match(/optional\s+(\w+)\s+(\w+)\s*=\s*(\d+);/);
    if (optionalMatch) {
        const type = optionalMatch[1];
        const name = optionalMatch[2];
        const number = optionalMatch[3];
        if (type && name && number) {
            return {
                name,
                type,
                number: parseInt(number, 10),
                optional: true,
            };
        }
    }

    // Handle map fields
    const mapMatch = line.match(/map<(\w+),\s*(\w+)>\s+(\w+)\s*=\s*(\d+);/);
    if (mapMatch) {
        const keyType = mapMatch[1];
        const valueType = mapMatch[2];
        const name = mapMatch[3];
        const number = mapMatch[4];
        if (keyType && valueType && name && number) {
            return {
                name,
                type: "map",
                number: parseInt(number, 10),
                map: {
                    keyType,
                    valueType,
                },
            };
        }
    }

    // Handle regular fields
    const regularMatch = line.match(/(\w+)\s+(\w+)\s*=\s*(\d+);/);
    if (regularMatch) {
        const type = regularMatch[1];
        const name = regularMatch[2];
        const number = regularMatch[3];
        if (type && name && number) {
            return {
                name,
                type,
                number: parseInt(number, 10),
            };
        }
    }

    return null;
}

/**
 * Generate TypeScript models from Protobuf file
 */
export function generateModelsFromProtobuf(protoFile: ProtoFile, options: GeneratorOptions = {}): Map<string, string> {
    const models = new Map<string, string>();

    for (const message of protoFile.messages) {
        const model = generateTypeFromMessage(message, options);
        models.set(message.name, model);
    }

    return models;
}

/**
 * Generate a TypeScript type from a Protobuf message
 */
function generateTypeFromMessage(message: ProtoMessage, options: GeneratorOptions): string {
    let output = "";

    // Generate JSDoc if tags are enabled
    if (options.includeTags && options.tags) {
        const jsdoc = generateJsDoc(options);
        if (jsdoc) {
            output += jsdoc + "\n";
        }
    }

    // Generate the type
    output += `export type ${message.name} = {\n`;

    for (const field of message.fields) {
        // Generate field JSDoc
        const fieldJsdoc = generateFieldJsDoc(field, options);
        if (fieldJsdoc) {
            output += fieldJsdoc;
        }

        // Generate field
        const optional = field.optional ? "?" : "";
        const tsType = mapProtoTypeToTs(field);
        output += `  ${field.name}${optional}: ${tsType};\n`;
    }

    output += "};\n";

    return output;
}

/**
 * Generate JSDoc comment
 */
function generateJsDoc(options: GeneratorOptions): string {
    if (!options.includeTags || !options.tags) {
        return "";
    }

    const lines: string[] = [];
    for (const [key, value] of Object.entries(options.tags)) {
        lines.push(`@${key} ${value}`);
    }

    if (lines.length === 0) {
        return "";
    }

    if (lines.length === 1) {
        return `/** ${lines[0]} */`;
    }

    return "/**\n * " + lines.join("\n * ") + "\n */";
}

/**
 * Generate field JSDoc
 */
function generateFieldJsDoc(field: ProtoField, options: GeneratorOptions): string {
    const lines: string[] = [];
    let hasContent = false;

    // Add field number as documentation
    lines.push(`Field number: ${field.number}`);
    hasContent = true;

    // Add tags if enabled
    if (options.includeTags && options.tags) {
        for (const [key, value] of Object.entries(options.tags)) {
            lines.push(`@${key} ${value}`);
            hasContent = true;
        }
    }

    if (!hasContent) {
        return "";
    }

    if (lines.length === 1) {
        return `  /** ${lines[0]} */\n`;
    }

    return "  /**\n   * " + lines.join("\n   * ") + "\n   */\n";
}

/**
 * Map protobuf type to TypeScript type
 */
function mapProtoTypeToTs(field: ProtoField): string {
    // Handle map types
    if (field.map) {
        const keyType = mapProtoScalarToTs(field.map.keyType);
        const valueType = mapProtoScalarToTs(field.map.valueType);
        return `Record<${keyType}, ${valueType}>`;
    }

    // Handle repeated fields
    if (field.repeated) {
        const itemType = mapProtoScalarToTs(field.type);
        return `${itemType}[]`;
    }

    // Handle regular fields
    return mapProtoScalarToTs(field.type);
}

/**
 * Map protobuf scalar types to TypeScript types
 */
function mapProtoScalarToTs(protoType: string): string {
    const typeMap: Record<string, string> = {
        string: "string",
        bytes: "Uint8Array",
        bool: "boolean",
        int32: "number",
        int64: "number",
        uint32: "number",
        uint64: "number",
        sint32: "number",
        sint64: "number",
        fixed32: "number",
        fixed64: "number",
        sfixed32: "number",
        sfixed64: "number",
        float: "number",
        double: "number",
    };

    return typeMap[protoType] || protoType;
}
