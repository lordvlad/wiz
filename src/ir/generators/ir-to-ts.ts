/**
 * IR to TypeScript generator
 */
import type { IRSchema, IRType } from "../types";
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

export interface TypeScriptGeneratorOptions {
    /**
     * Whether to include JSDoc comments
     */
    includeJSDoc?: boolean;
    /**
     * Custom tags to include in JSDoc
     */
    customTags?: Record<string, any>;
}

export function irToTypeScript(schema: IRSchema, options: TypeScriptGeneratorOptions = {}): Map<string, string> {
    const result = new Map<string, string>();

    for (const typeDef of schema.types) {
        let code = "";

        // Generate JSDoc if metadata exists
        const jsdoc = generateJSDoc(typeDef, options);
        if (jsdoc) {
            code += jsdoc + "\n";
        }

        code += `export type ${typeDef.name} = ${irTypeToTs(typeDef.type, schema, options)};\n`;
        result.set(typeDef.name, code);
    }

    return result;
}

/**
 * Generate JSDoc comment from type metadata
 */
function generateJSDoc(
    typeDef: { name: string; type: IRType; metadata?: any },
    options: TypeScriptGeneratorOptions,
): string {
    const lines: string[] = [];

    // Add description if available
    if (typeDef.metadata?.description) {
        lines.push(typeDef.metadata.description);
    }

    // Add custom tags if requested
    if (options.includeJSDoc && options.customTags) {
        for (const [key, value] of Object.entries(options.customTags)) {
            lines.push(`@${key} ${value}`);
        }
    }

    // Add metadata tags if available
    if (typeDef.metadata?.tags) {
        for (const tag of typeDef.metadata.tags) {
            const tagValue = tag.value ? ` ${tag.value}` : "";
            lines.push(`@${tag.name}${tagValue}`);
        }
    }

    if (lines.length === 0) {
        return "";
    }

    if (lines.length === 1) {
        return `/** ${lines[0]} */`;
    }

    return "/**\n * " + lines.join("\n * ") + "\n */";
}

function irTypeToTs(type: IRType, schema: IRSchema, options: TypeScriptGeneratorOptions = {}): string {
    if (isPrimitive(type)) {
        switch (type.primitiveType) {
            case "string":
                return "string";
            case "number":
            case "integer":
                return "number";
            case "boolean":
                return "boolean";
            case "null":
                return "null";
            case "any":
                return "any";
            case "unknown":
                return "unknown";
            case "never":
                return "never";
            case "void":
                return "void";
        }
    }
    if (isLiteral(type)) {
        return JSON.stringify(type.value);
    }
    if (isArray(type)) {
        return `${irTypeToTs(type.items, schema, options)}[]`;
    }
    if (isObject(type)) {
        if (type.properties.length === 0) {
            return "{}";
        }
        const props = type.properties.map((prop) => {
            const optional = !prop.required ? "?" : "";
            const propJsdoc = generatePropertyJSDoc(prop.type, options);
            const propLine = `${prop.name}${optional}: ${irTypeToTs(prop.type, schema, options)};`;
            if (propJsdoc) {
                return `  ${propJsdoc}\n  ${propLine}`;
            }
            return `  ${propLine}`;
        });
        return `{\n${props.join("\n")}\n}`;
    }
    if (isReference(type)) {
        return type.name;
    }
    if (isUnion(type)) {
        return type.types.map((t) => irTypeToTs(t, schema, options)).join(" | ");
    }
    if (isIntersection(type)) {
        return type.types.map((t) => irTypeToTs(t, schema, options)).join(" & ");
    }
    if (isMap(type)) {
        return `Record<${irTypeToTs(type.keyType, schema, options)}, ${irTypeToTs(type.valueType, schema, options)}>`;
    }
    if (isEnum(type)) {
        return type.members.map((m) => JSON.stringify(m.value)).join(" | ");
    }
    return "any";
}

/**
 * Generate JSDoc for a property type
 */
function generatePropertyJSDoc(type: IRType, options: TypeScriptGeneratorOptions): string {
    if (!options.includeJSDoc) {
        return "";
    }

    const lines: string[] = [];

    // Extract metadata from the type
    const metadata = (type as any).metadata;
    const constraints = (type as any).constraints;

    // Add description
    if (metadata?.description) {
        lines.push(metadata.description);
    }

    // Add constraint tags
    if (constraints) {
        if (constraints.minimum !== undefined) lines.push(`@minimum ${constraints.minimum}`);
        if (constraints.maximum !== undefined) lines.push(`@maximum ${constraints.maximum}`);
        if (constraints.exclusiveMinimum !== undefined) lines.push(`@exclusiveMinimum ${constraints.exclusiveMinimum}`);
        if (constraints.exclusiveMaximum !== undefined) lines.push(`@exclusiveMaximum ${constraints.exclusiveMaximum}`);
        if (constraints.minLength !== undefined) lines.push(`@minLength ${constraints.minLength}`);
        if (constraints.maxLength !== undefined) lines.push(`@maxLength ${constraints.maxLength}`);
        if (constraints.pattern !== undefined) lines.push(`@pattern ${constraints.pattern}`);
        if (constraints.multipleOf !== undefined) lines.push(`@multipleOf ${constraints.multipleOf}`);
        if (constraints.minItems !== undefined) lines.push(`@minItems ${constraints.minItems}`);
        if (constraints.maxItems !== undefined) lines.push(`@maxItems ${constraints.maxItems}`);
        if (constraints.uniqueItems !== undefined) lines.push(`@uniqueItems ${constraints.uniqueItems}`);
    }

    // Add format
    const format = (type as any).format?.format;
    if (format) {
        lines.push(`@format ${format}`);
    }

    // Add deprecated
    if (metadata?.deprecated) {
        lines.push("@deprecated");
    }

    if (lines.length === 0) {
        return "";
    }

    if (lines.length === 1) {
        return `/** ${lines[0]} */`;
    }

    return "/**\n   * " + lines.join("\n   * ") + "\n   */";
}
