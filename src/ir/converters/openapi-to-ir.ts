/**
 * OpenAPI Schema to IR converter
 *
 * Converts OpenAPI 3.0/3.1 schemas to our common IR representation.
 */
import type { OpenAPIV3, OpenAPIV3_1 } from "openapi-types";

import type { IRMetadata, IRProperty, IRSchema, IRType, IRTypeDefinition } from "../types";
import {
    createArray,
    createIntersection,
    createLiteral,
    createMap,
    createObject,
    createPrimitive,
    createReference,
    createUnion,
} from "../utils";

type OpenApiSchema =
    | OpenAPIV3.SchemaObject
    | OpenAPIV3_1.SchemaObject
    | OpenAPIV3.ReferenceObject
    | OpenAPIV3_1.ReferenceObject;

/**
 * Options for OpenAPI to IR conversion
 */
export interface OpenApiToIrOptions {
    /** OpenAPI version being parsed */
    version?: "3.0" | "3.1";
}

/**
 * Convert OpenAPI components.schemas to IR schema
 */
export function openApiSchemasToIr(schemas: Record<string, OpenApiSchema>, options: OpenApiToIrOptions = {}): IRSchema {
    const types: IRTypeDefinition[] = [];
    const availableTypes = new Set(Object.keys(schemas));

    for (const [name, schema] of Object.entries(schemas)) {
        const irType = openApiSchemaToIrType(schema, { ...options, availableTypes });
        types.push({
            name,
            type: irType,
        });
    }

    return {
        types,
        version: options.version,
    };
}

/**
 * Context for conversion
 */
interface ConversionContext extends OpenApiToIrOptions {
    availableTypes?: Set<string>;
}

/**
 * Convert a single OpenAPI schema to IR type
 */
export function openApiSchemaToIrType(schema: OpenApiSchema, context: ConversionContext = {}): IRType {
    // Handle $ref
    if ("$ref" in schema) {
        const ref = schema.$ref;
        const match = ref.match(/#\/components\/schemas\/(.+)/);
        if (match) {
            return createReference(match[1]!);
        }
        throw new Error(`Unsupported $ref format: ${ref}`);
    }

    // Extract metadata
    const metadata: IRMetadata = {};
    if (schema.description) metadata.description = schema.description;
    if (schema.deprecated) metadata.deprecated = true;
    if ("default" in schema && schema.default !== undefined) metadata.default = schema.default;
    if ("example" in schema && schema.example !== undefined) {
        metadata.examples = [schema.example];
    }

    // Extract constraints
    const constraints: any = {};
    if ("minimum" in schema && schema.minimum !== undefined) constraints.minimum = schema.minimum;
    if ("maximum" in schema && schema.maximum !== undefined) constraints.maximum = schema.maximum;
    if ("exclusiveMinimum" in schema && schema.exclusiveMinimum !== undefined) {
        constraints.exclusiveMinimum = schema.exclusiveMinimum;
    }
    if ("exclusiveMaximum" in schema && schema.exclusiveMaximum !== undefined) {
        constraints.exclusiveMaximum = schema.exclusiveMaximum;
    }
    if ("multipleOf" in schema && schema.multipleOf !== undefined) constraints.multipleOf = schema.multipleOf;
    if ("minLength" in schema && schema.minLength !== undefined) constraints.minLength = schema.minLength;
    if ("maxLength" in schema && schema.maxLength !== undefined) constraints.maxLength = schema.maxLength;
    if ("pattern" in schema && schema.pattern !== undefined) constraints.pattern = schema.pattern;
    if ("minItems" in schema && schema.minItems !== undefined) constraints.minItems = schema.minItems;
    if ("maxItems" in schema && schema.maxItems !== undefined) constraints.maxItems = schema.maxItems;
    if ("uniqueItems" in schema && schema.uniqueItems !== undefined) constraints.uniqueItems = schema.uniqueItems;
    if ("minProperties" in schema && schema.minProperties !== undefined) {
        constraints.minProperties = schema.minProperties;
    }
    if ("maxProperties" in schema && schema.maxProperties !== undefined) {
        constraints.maxProperties = schema.maxProperties;
    }
    if ("enum" in schema && schema.enum !== undefined) constraints.enum = schema.enum;

    const format = "format" in schema && schema.format ? { format: schema.format } : undefined;

    // Handle const (OpenAPI 3.1)
    if ("const" in schema && schema.const !== undefined) {
        const literal = createLiteral(schema.const as any, metadata);
        if (constraints && Object.keys(constraints).length > 0) literal.constraints = constraints;
        return literal;
    }

    // Handle enum
    if (constraints.enum) {
        const enumValues = constraints.enum;
        if (enumValues.length > 0) {
            // If all values are literals, create a union of literals
            const literals = enumValues.map((val: any) => createLiteral(val));
            if (literals.length === 1) return literals[0]!;
            const union = createUnion(literals, metadata);
            if (Object.keys(constraints).length > 1) {
                delete constraints.enum;
                union.constraints = constraints;
            }
            return union;
        }
    }

    // Handle oneOf
    if ("oneOf" in schema && schema.oneOf) {
        const types = schema.oneOf.map((s) => openApiSchemaToIrType(s, context));
        const union = createUnion(types, metadata);

        // Handle discriminator
        if ("discriminator" in schema && schema.discriminator) {
            union.discriminator = {
                propertyName: schema.discriminator.propertyName,
                mapping: schema.discriminator.mapping,
            };
        }

        if (constraints && Object.keys(constraints).length > 0) union.constraints = constraints;
        return union;
    }

    // Handle anyOf
    if ("anyOf" in schema && schema.anyOf) {
        const types = schema.anyOf.map((s) => openApiSchemaToIrType(s, context));
        const union = createUnion(types, metadata);
        if (constraints && Object.keys(constraints).length > 0) union.constraints = constraints;
        return union;
    }

    // Handle allOf
    if ("allOf" in schema && schema.allOf) {
        const types = schema.allOf.map((s) => openApiSchemaToIrType(s, context));
        const intersection = createIntersection(types, metadata);
        if (constraints && Object.keys(constraints).length > 0) intersection.constraints = constraints;
        return intersection;
    }

    // Handle type-based schemas
    if ("type" in schema && schema.type) {
        const type = schema.type;

        // Handle nullable (OpenAPI 3.0)
        if ("nullable" in schema && schema.nullable) {
            const baseType = convertSimpleType(schema, metadata, constraints, format, context);
            return createUnion([baseType, createPrimitive("null")], metadata);
        }

        // Handle type arrays (OpenAPI 3.1)
        if (Array.isArray(type)) {
            const types = type.map((t) => {
                if (t === "null") return createPrimitive("null");
                return convertTypeString(t, schema, metadata, constraints, format, context);
            });
            if (types.length === 1) return types[0]!;
            return createUnion(types, metadata);
        }

        // Single type
        return convertTypeString(type, schema, metadata, constraints, format, context);
    }

    // No type specified - default to any
    const anyType = createPrimitive("any", metadata);
    if (constraints && Object.keys(constraints).length > 0) anyType.constraints = constraints;
    return anyType;
}

/**
 * Convert based on type and schema
 */
function convertSimpleType(
    schema: any,
    metadata: IRMetadata | undefined,
    constraints: any,
    format: any,
    context: ConversionContext,
): IRType {
    const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
    return convertTypeString(type, schema, metadata, constraints, format, context);
}

/**
 * Convert a type string to IR
 */
function convertTypeString(
    type: string,
    schema: any,
    metadata: IRMetadata | undefined,
    constraints: any,
    format: any,
    context: ConversionContext,
): IRType {
    switch (type) {
        case "string": {
            const result = createPrimitive("string", metadata, constraints);
            if (format) result.format = format;
            return result;
        }
        case "number": {
            const result = createPrimitive("number", metadata, constraints);
            if (format) result.format = format;
            return result;
        }
        case "integer": {
            const result = createPrimitive("integer", metadata, constraints);
            if (format) result.format = format;
            return result;
        }
        case "boolean": {
            return createPrimitive("boolean", metadata, constraints);
        }
        case "null": {
            return createPrimitive("null", metadata);
        }
        case "array": {
            if ("items" in schema && schema.items) {
                const items = openApiSchemaToIrType(schema.items, context);
                return createArray(items, metadata, constraints);
            }
            // Array without items
            return createArray(createPrimitive("any"), metadata, constraints);
        }
        case "object": {
            const properties: IRProperty[] = [];

            if ("properties" in schema && schema.properties) {
                const required = new Set(schema.required || []);

                for (const [propName, propSchema] of Object.entries(schema.properties)) {
                    const propType = openApiSchemaToIrType(propSchema as any, context);
                    properties.push({
                        name: propName,
                        type: propType,
                        required: required.has(propName),
                    });
                }
            }

            let additionalProps: IRType | boolean | undefined = undefined;
            if ("additionalProperties" in schema) {
                if (typeof schema.additionalProperties === "boolean") {
                    additionalProps = schema.additionalProperties;
                } else if (schema.additionalProperties) {
                    additionalProps = openApiSchemaToIrType(schema.additionalProperties, context);
                }
            }

            // If no properties but has additionalProperties, it's a map
            if (properties.length === 0 && additionalProps && typeof additionalProps !== "boolean") {
                return createMap(createPrimitive("string"), additionalProps, metadata);
            }

            return createObject(properties, additionalProps, metadata);
        }
        default: {
            return createPrimitive("any", metadata, constraints);
        }
    }
}
