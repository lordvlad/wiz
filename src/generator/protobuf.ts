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

        // Skip comments and empty lines
        if (line.startsWith("//") || line.startsWith("/*") || !line) {
            continue;
        }

        // Parse syntax
        if (line.startsWith("syntax")) {
            const match = line.match(/syntax\s*=\s*"([^"]+)"/);
            if (match) {
                result.syntax = match[1];
            }
            continue;
        }

        // Parse package
        if (line.startsWith("package")) {
            const match = line.match(/package\s+([^;]+);/);
            if (match) {
                result.package = match[1];
            }
            continue;
        }

        // Parse message start
        if (line.startsWith("message")) {
            const match = line.match(/message\s+(\w+)\s*\{/);
            if (match) {
                currentMessage = {
                    name: match[1]!,
                    fields: [],
                };
                braceDepth = 1;
            }
            continue;
        }

        // Track braces
        if (line.includes("{")) braceDepth++;
        if (line.includes("}")) braceDepth--;

        // End of message
        if (braceDepth === 0 && currentMessage) {
            result.messages.push(currentMessage);
            currentMessage = null;
            continue;
        }

        // Parse field inside message
        if (currentMessage && braceDepth === 1) {
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
        return {
            name: repeatedMatch[2]!,
            type: repeatedMatch[1]!,
            number: parseInt(repeatedMatch[3]!, 10),
            repeated: true,
        };
    }

    // Handle optional fields
    const optionalMatch = line.match(/optional\s+(\w+)\s+(\w+)\s*=\s*(\d+);/);
    if (optionalMatch) {
        return {
            name: optionalMatch[2]!,
            type: optionalMatch[1]!,
            number: parseInt(optionalMatch[3]!, 10),
            optional: true,
        };
    }

    // Handle map fields
    const mapMatch = line.match(/map<(\w+),\s*(\w+)>\s+(\w+)\s*=\s*(\d+);/);
    if (mapMatch) {
        return {
            name: mapMatch[3]!,
            type: "map",
            number: parseInt(mapMatch[4]!, 10),
            map: {
                keyType: mapMatch[1]!,
                valueType: mapMatch[2]!,
            },
        };
    }

    // Handle regular fields
    const regularMatch = line.match(/(\w+)\s+(\w+)\s*=\s*(\d+);/);
    if (regularMatch) {
        return {
            name: regularMatch[2]!,
            type: regularMatch[1]!,
            number: parseInt(regularMatch[3]!, 10),
        };
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
