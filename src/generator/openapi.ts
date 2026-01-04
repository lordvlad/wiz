/**
 * OpenAPI to TypeScript model generator
 */

export interface OpenApiSchema {
    type?: string;
    properties?: Record<string, any>;
    required?: string[];
    items?: any;
    $ref?: string;
    allOf?: any[];
    oneOf?: any[];
    anyOf?: any[];
    enum?: any[];
    description?: string;
    format?: string;
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    minimum?: number;
    maximum?: number;
    default?: any;
    example?: any;
    deprecated?: boolean;
    nullable?: boolean;
    [key: string]: any;
}

export interface OpenApiSpec {
    openapi?: string;
    components?: {
        schemas?: Record<string, OpenApiSchema>;
    };
    [key: string]: any;
}

export interface GeneratorOptions {
    includeTags?: boolean;
    tags?: Record<string, any>;
    disableWizTags?: boolean;
}

/**
 * Parse x-wiz-format extension and return the appropriate TypeScript type
 */
function parseWizFormat(wizFormat: string, schema: OpenApiSchema): string | null {
    // Match patterns like BigIntFormat<"int64">, StrFormat<"email">, etc.
    const match = wizFormat.match(/^(\w+)<"([^"]+)">$/);
    if (!match) return null;

    const [, formatType, formatValue] = match;

    switch (formatType) {
        case "BigIntFormat":
            return `bigint & { __bigint_format: "${formatValue}" }`;
        case "NumFormat":
            return `number & { __num_format: "${formatValue}" }`;
        case "StrFormat":
            return `string & { __str_format: "${formatValue}" }`;
        case "DateFormat":
            return `Date & { __date_format: "${formatValue}" }`;
        default:
            return null;
    }
}

/**
 * Generate TypeScript models from OpenAPI specification
 */
export function generateModelsFromOpenApi(spec: OpenApiSpec, options: GeneratorOptions = {}): Map<string, string> {
    const models = new Map<string, string>();

    if (!spec.components?.schemas) {
        return models;
    }

    for (const [name, schema] of Object.entries(spec.components.schemas)) {
        const model = generateTypeFromSchema(name, schema, spec, options);
        models.set(name, model);
    }

    return models;
}

/**
 * Generate a TypeScript type from an OpenAPI schema
 */
function generateTypeFromSchema(
    name: string,
    schema: OpenApiSchema,
    spec: OpenApiSpec,
    options: GeneratorOptions,
): string {
    let output = "";

    // Generate JSDoc comment
    const jsdoc = generateJsDoc(schema, options);
    if (jsdoc) {
        output += jsdoc + "\n";
    }

    // Generate the type
    output += `export type ${name} = `;
    output += generateTypeDefinition(schema, spec, options, 0);
    output += ";\n";

    return output;
}

/**
 * Helper to format JSDoc lines into a comment block
 */
function formatJsDoc(lines: string[]): string {
    if (lines.length === 0) {
        return "";
    }

    if (lines.length === 1) {
        return `/** ${lines[0]} */`;
    }

    return "/**\n * " + lines.join("\n * ") + "\n */";
}

/**
 * Collect JSDoc lines from schema metadata
 */
function collectJsDocLines(schema: OpenApiSchema, options: GeneratorOptions): string[] {
    const lines: string[] = [];

    // Description
    if (schema.description) {
        lines.push(schema.description);
    }

    // Format
    if (schema.format) {
        lines.push(`@format ${schema.format}`);
    }

    // Deprecated
    if (schema.deprecated) {
        lines.push("@deprecated");
    }

    // Validation constraints
    if (schema.minLength !== undefined) {
        lines.push(`@minLength ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined) {
        lines.push(`@maxLength ${schema.maxLength}`);
    }
    if (schema.minimum !== undefined) {
        lines.push(`@minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined) {
        lines.push(`@maximum ${schema.maximum}`);
    }
    if (schema.pattern) {
        lines.push(`@pattern ${schema.pattern}`);
    }
    if (schema.enum) {
        lines.push(`@enum ${schema.enum.join(", ")}`);
    }
    if (schema.default !== undefined) {
        lines.push(`@default ${JSON.stringify(schema.default)}`);
    }
    if (schema.example !== undefined) {
        lines.push(`@example ${JSON.stringify(schema.example)}`);
    }

    // Add tags if enabled
    if (options.includeTags && options.tags) {
        for (const [key, value] of Object.entries(options.tags)) {
            lines.push(`@${key} ${value}`);
        }
    }

    return lines;
}

/**
 * Generate JSDoc comment from schema metadata
 */
function generateJsDoc(schema: OpenApiSchema, options: GeneratorOptions): string {
    const lines = collectJsDocLines(schema, options);
    return formatJsDoc(lines);
}

/**
 * Generate property JSDoc
 */
function generatePropertyJsDoc(propName: string, schema: OpenApiSchema, options: GeneratorOptions): string {
    const lines = collectJsDocLines(schema, options);
    return formatJsDoc(lines);
}

/**
 * Generate TypeScript type definition from schema
 */
function generateTypeDefinition(
    schema: OpenApiSchema,
    spec: OpenApiSpec,
    options: GeneratorOptions,
    depth: number,
): string {
    // Handle $ref
    if (schema.$ref) {
        const refName = schema.$ref.split("/").pop();
        return refName || "any";
    }

    // Handle allOf (intersection)
    if (schema.allOf) {
        const types = schema.allOf.map((s) => generateTypeDefinition(s, spec, options, depth));
        return types.join(" & ");
    }

    // Handle oneOf/anyOf (union)
    if (schema.oneOf || schema.anyOf) {
        const unionSchemas = schema.oneOf || schema.anyOf;
        const types = unionSchemas!.map((s: any) => generateTypeDefinition(s, spec, options, depth));
        return types.join(" | ");
    }

    // Handle enum
    if (schema.enum) {
        return schema.enum.map((v) => JSON.stringify(v)).join(" | ");
    }

    // Handle array
    if (schema.type === "array") {
        const itemType = schema.items ? generateTypeDefinition(schema.items, spec, options, depth) : "any";
        return `${itemType}[]`;
    }

    // Handle object
    if (schema.type === "object" || schema.properties) {
        return generateObjectType(schema, spec, options, depth);
    }

    // Check for x-wiz-format extension
    const wizFormat = schema["x-wiz-format"];
    if (wizFormat && !options.disableWizTags) {
        const wizType = parseWizFormat(wizFormat, schema);
        if (wizType) {
            return schema.nullable ? `${wizType} | null` : wizType;
        }
    }

    // Handle primitive types
    if (schema.type === "string") {
        return schema.nullable ? "string | null" : "string";
    }
    if (schema.type === "number" || schema.type === "integer") {
        return schema.nullable ? "number | null" : "number";
    }
    if (schema.type === "boolean") {
        return schema.nullable ? "boolean | null" : "boolean";
    }
    if (schema.type === "null") {
        return "null";
    }

    // Handle nullable array types in OpenAPI 3.1
    if (Array.isArray(schema.type)) {
        const types = schema.type.map((t: string) => {
            if (t === "null") return "null";
            if (t === "string") return "string";
            if (t === "number" || t === "integer") return "number";
            if (t === "boolean") return "boolean";
            return "any";
        });
        return types.join(" | ");
    }

    return "any";
}

/**
 * Generate object type definition
 */
function generateObjectType(
    schema: OpenApiSchema,
    spec: OpenApiSpec,
    options: GeneratorOptions,
    depth: number,
): string {
    const indent = "  ".repeat(depth + 1);
    const lines: string[] = ["{"];

    if (schema.properties) {
        for (const [propName, propSchema] of Object.entries(schema.properties)) {
            const isRequired = schema.required?.includes(propName);
            const optional = isRequired ? "" : "?";

            // Add property JSDoc
            const jsdoc = generatePropertyJsDoc(propName, propSchema, options);
            if (jsdoc) {
                // Split JSDoc and indent each line properly
                const jsdocLines = jsdoc.trim().split("\n");
                for (const line of jsdocLines) {
                    lines.push(indent + line);
                }
            }

            const propType = generateTypeDefinition(propSchema, spec, options, depth + 1);
            lines.push(`${indent}${propName}${optional}: ${propType};`);
        }
    }

    // Handle additionalProperties
    if (schema.additionalProperties) {
        if (schema.additionalProperties === true) {
            lines.push(`${indent}[key: string]: any;`);
        } else {
            const addPropType = generateTypeDefinition(schema.additionalProperties, spec, options, depth + 1);
            lines.push(`${indent}[key: string]: ${addPropType};`);
        }
    }

    lines.push("}");
    return lines.join("\n");
}
