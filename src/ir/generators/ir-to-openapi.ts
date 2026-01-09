/**
 * IR to OpenAPI Schema generator
 *
 * Converts IR types to OpenAPI 3.0/3.1 schema format.
 */

import type { IRSchema, IRType, IRTypeDefinition } from "../types";
import { isArray, isEnum, isIntersection, isLiteral, isMap, isObject, isPrimitive, isReference, isUnion } from "../utils";

/**
 * Options for IR to OpenAPI conversion
 */
export interface IrToOpenApiOptions {
    /** OpenAPI version (3.0 or 3.1) */
    version?: "3.0" | "3.1";
    /** Union style (oneOf or anyOf) */
    unionStyle?: "oneOf" | "anyOf";
}

/**
 * Convert IR schema to OpenAPI components.schemas
 */
export function irToOpenApiSchemas(
    schema: IRSchema,
    options: IrToOpenApiOptions = {},
): Record<string, any> {
    const version = options.version || "3.0";
    const unionStyle = options.unionStyle || "oneOf";
    const schemas: Record<string, any> = {};

    for (const typeDef of schema.types) {
        schemas[typeDef.name] = irTypeToOpenApiSchema(typeDef.type, {
            version,
            unionStyle,
            availableTypes: new Set(schema.types.map((t) => t.name)),
            title: typeDef.name,
            metadata: typeDef.metadata,
        });
    }

    return schemas;
}

/**
 * Context for conversion
 */
interface ConversionContext {
    version: "3.0" | "3.1";
    unionStyle: "oneOf" | "anyOf";
    availableTypes: Set<string>;
    title?: string;
    metadata?: any;
}

/**
 * Convert an IR type to OpenAPI schema
 */
export function irTypeToOpenApiSchema(
    type: IRType,
    context: Partial<ConversionContext> = {},
): any {
    const ctx: ConversionContext = {
        version: context.version || "3.0",
        unionStyle: context.unionStyle || "oneOf",
        availableTypes: context.availableTypes || new Set(),
        title: context.title,
        metadata: context.metadata,
    };

    return convertType(type, ctx);
}

/**
 * Internal conversion function
 */
function convertType(type: IRType, context: ConversionContext): any {
    const schema: any = {};

    // Add metadata
    if (type.metadata) {
        if (type.metadata.description) schema.description = type.metadata.description;
        if (type.metadata.deprecated) schema.deprecated = true;
        if (type.metadata.default !== undefined) schema.default = type.metadata.default;
        if (type.metadata.examples && type.metadata.examples.length > 0) {
            schema.example = type.metadata.examples[0];
        }
        if (type.metadata.extensions) {
            Object.assign(schema, type.metadata.extensions);
        }
    }

    // Add constraints
    if (type.constraints) {
        if (type.constraints.minimum !== undefined) schema.minimum = type.constraints.minimum;
        if (type.constraints.maximum !== undefined) schema.maximum = type.constraints.maximum;
        if (type.constraints.exclusiveMinimum !== undefined) schema.exclusiveMinimum = type.constraints.exclusiveMinimum;
        if (type.constraints.exclusiveMaximum !== undefined) schema.exclusiveMaximum = type.constraints.exclusiveMaximum;
        if (type.constraints.multipleOf !== undefined) schema.multipleOf = type.constraints.multipleOf;
        if (type.constraints.minLength !== undefined) schema.minLength = type.constraints.minLength;
        if (type.constraints.maxLength !== undefined) schema.maxLength = type.constraints.maxLength;
        if (type.constraints.pattern !== undefined) schema.pattern = type.constraints.pattern;
        if (type.constraints.minItems !== undefined) schema.minItems = type.constraints.minItems;
        if (type.constraints.maxItems !== undefined) schema.maxItems = type.constraints.maxItems;
        if (type.constraints.uniqueItems !== undefined) schema.uniqueItems = type.constraints.uniqueItems;
        if (type.constraints.minProperties !== undefined) schema.minProperties = type.constraints.minProperties;
        if (type.constraints.maxProperties !== undefined) schema.maxProperties = type.constraints.maxProperties;
        if (type.constraints.enum !== undefined) schema.enum = type.constraints.enum;
    }

    // Add format
    if (type.format) {
        schema.format = type.format.format;
    }

    // Add title if at top level
    if (context.title) {
        schema.title = context.title;
    }

    // Convert based on type kind
    if (isPrimitive(type)) {
        switch (type.primitiveType) {
            case "string":
                schema.type = "string";
                break;
            case "number":
                schema.type = "number";
                break;
            case "integer":
                schema.type = "integer";
                break;
            case "boolean":
                schema.type = "boolean";
                break;
            case "null":
                if (context.version === "3.1") {
                    schema.type = "null";
                } else {
                    schema.type = "string";
                    schema.nullable = true;
                }
                break;
            case "any":
                // No type constraint for any
                break;
            default:
                schema.type = "object";
        }
    } else if (isLiteral(type)) {
        // Literal types become const or enum
        if (context.version === "3.1") {
            schema.const = type.value;
        } else {
            schema.enum = [type.value];
        }
        // Infer type from value
        if (typeof type.value === "string") schema.type = "string";
        else if (typeof type.value === "number") schema.type = "number";
        else if (typeof type.value === "boolean") schema.type = "boolean";
        else if (type.value === null) schema.type = "null";
    } else if (isArray(type)) {
        schema.type = "array";
        schema.items = convertType(type.items, context);
    } else if (isObject(type)) {
        schema.type = "object";
        schema.properties = {};
        schema.required = [];

        for (const prop of type.properties) {
            schema.properties[prop.name] = convertType(prop.type, {
                ...context,
                title: undefined,
                metadata: prop.metadata,
            });

            // Add property-level constraints
            if (prop.constraints) {
                Object.assign(schema.properties[prop.name], prop.constraints);
            }

            if (prop.required) {
                schema.required.push(prop.name);
            }
        }

        // Clean up empty required array
        if (schema.required.length === 0) {
            delete schema.required;
        }

        // Handle additionalProperties
        if (type.additionalProperties !== undefined) {
            if (typeof type.additionalProperties === "boolean") {
                schema.additionalProperties = type.additionalProperties;
            } else {
                schema.additionalProperties = convertType(type.additionalProperties, context);
            }
        }

        // Handle index signature (map to additionalProperties)
        if (type.indexSignature) {
            schema.additionalProperties = convertType(type.indexSignature.valueType, context);
        }
    } else if (isReference(type)) {
        return {
            $ref: `#/components/schemas/${type.name}`,
            ...schema,
        };
    } else if (isUnion(type)) {
        const unionKey = context.unionStyle;
        schema[unionKey] = type.types.map((t) => convertType(t, { ...context, title: undefined }));

        // Handle discriminator
        if (type.discriminator) {
            schema.discriminator = {
                propertyName: type.discriminator.propertyName,
            };
            if (type.discriminator.mapping) {
                schema.discriminator.mapping = type.discriminator.mapping;
            }
        }
    } else if (isIntersection(type)) {
        schema.allOf = type.types.map((t) => convertType(t, { ...context, title: undefined }));
    } else if (isMap(type)) {
        schema.type = "object";
        schema.additionalProperties = convertType(type.valueType, context);
    } else if (isEnum(type)) {
        schema.type = typeof type.members[0]?.value === "number" ? "number" : "string";
        schema.enum = type.members.map((m) => m.value);
    }

    return schema;
}
