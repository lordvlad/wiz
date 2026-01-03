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
 * Generate JSDoc comment from schema metadata
 */
function generateJsDoc(schema: OpenApiSchema, options: GeneratorOptions): string {
    const lines: string[] = [];
    let hasContent = false;

    // Description
    if (schema.description) {
        lines.push(schema.description);
        hasContent = true;
    }

    // Format
    if (schema.format) {
        lines.push(`@format ${schema.format}`);
        hasContent = true;
    }

    // Deprecated
    if (schema.deprecated) {
        lines.push("@deprecated");
        hasContent = true;
    }

    // Validation constraints
    if (schema.minLength !== undefined) {
        lines.push(`@minLength ${schema.minLength}`);
        hasContent = true;
    }
    if (schema.maxLength !== undefined) {
        lines.push(`@maxLength ${schema.maxLength}`);
        hasContent = true;
    }
    if (schema.minimum !== undefined) {
        lines.push(`@minimum ${schema.minimum}`);
        hasContent = true;
    }
    if (schema.maximum !== undefined) {
        lines.push(`@maximum ${schema.maximum}`);
        hasContent = true;
    }
    if (schema.pattern) {
        lines.push(`@pattern ${schema.pattern}`);
        hasContent = true;
    }
    if (schema.enum) {
        lines.push(`@enum ${schema.enum.join(", ")}`);
        hasContent = true;
    }
    if (schema.default !== undefined) {
        lines.push(`@default ${JSON.stringify(schema.default)}`);
        hasContent = true;
    }
    if (schema.example !== undefined) {
        lines.push(`@example ${JSON.stringify(schema.example)}`);
        hasContent = true;
    }

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
        return `/** ${lines[0]} */`;
    }

    return "/**\n * " + lines.join("\n * ") + "\n */";
}

/**
 * Generate property JSDoc
 */
function generatePropertyJsDoc(propName: string, schema: OpenApiSchema, options: GeneratorOptions): string {
    const lines: string[] = [];
    let hasContent = false;

    // Description
    if (schema.description) {
        lines.push(schema.description);
        hasContent = true;
    }

    // Format
    if (schema.format) {
        lines.push(`@format ${schema.format}`);
        hasContent = true;
    }

    // Deprecated
    if (schema.deprecated) {
        lines.push("@deprecated");
        hasContent = true;
    }

    // Validation constraints
    if (schema.minLength !== undefined) {
        lines.push(`@minLength ${schema.minLength}`);
        hasContent = true;
    }
    if (schema.maxLength !== undefined) {
        lines.push(`@maxLength ${schema.maxLength}`);
        hasContent = true;
    }
    if (schema.minimum !== undefined) {
        lines.push(`@minimum ${schema.minimum}`);
        hasContent = true;
    }
    if (schema.maximum !== undefined) {
        lines.push(`@maximum ${schema.maximum}`);
        hasContent = true;
    }
    if (schema.pattern) {
        lines.push(`@pattern ${schema.pattern}`);
        hasContent = true;
    }
    if (schema.enum) {
        lines.push(`@enum ${schema.enum.join(", ")}`);
        hasContent = true;
    }
    if (schema.default !== undefined) {
        lines.push(`@default ${JSON.stringify(schema.default)}`);
        hasContent = true;
    }
    if (schema.example !== undefined) {
        lines.push(`@example ${JSON.stringify(schema.example)}`);
        hasContent = true;
    }

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
        return `/** ${lines[0]} */`;
    }

    return "/**\n * " + lines.join("\n * ") + "\n */";
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
