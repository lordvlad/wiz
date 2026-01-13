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

        // Handle discriminator (less common in anyOf but still valid)
        if ("discriminator" in schema && schema.discriminator) {
            union.discriminator = {
                propertyName: schema.discriminator.propertyName,
                mapping: schema.discriminator.mapping,
            };
        }

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

/**
 * Extract OpenAPI paths to IR methods
 */
export function openApiPathsToIr(
    paths: Record<string, any>,
    schemas?: Record<string, OpenApiSchema>,
    options: OpenApiToIrOptions = {},
): IRSchema {
    const methods: import("../types").IRMethod[] = [];
    const availableTypes = schemas ? new Set(Object.keys(schemas)) : new Set<string>();

    for (const [path, pathItem] of Object.entries(paths)) {
        const httpMethods = ["get", "post", "put", "patch", "delete", "head", "options", "trace"];

        for (const method of httpMethods) {
            const operation = pathItem[method];
            if (!operation) continue;

            // Extract metadata
            const metadata: IRMetadata = {};
            if (operation.summary) metadata.description = operation.summary;
            if (operation.description) {
                metadata.description = metadata.description
                    ? `${metadata.description}\n\n${operation.description}`
                    : operation.description;
            }
            if (operation.deprecated) metadata.deprecated = true;

            // Extract parameters
            let pathParams: IRType | undefined;
            let queryParams: IRType | undefined;
            let headerParams: IRType | undefined;
            let cookieParams: IRType | undefined;

            if (operation.parameters) {
                const pathProps: import("../types").IRProperty[] = [];
                const queryProps: import("../types").IRProperty[] = [];
                const headerProps: import("../types").IRProperty[] = [];
                const cookieProps: import("../types").IRProperty[] = [];

                for (const param of operation.parameters) {
                    const paramObj = "$ref" in param ? resolveRef(param.$ref, schemas) : param;
                    if (!paramObj) continue;

                    const paramType = paramObj.schema
                        ? openApiSchemaToIrType(paramObj.schema, { ...options, availableTypes })
                        : createPrimitive("string");

                    const paramMetadata: IRMetadata = {};
                    if (paramObj.description) paramMetadata.description = paramObj.description;

                    const property: import("../types").IRProperty = {
                        name: paramObj.name,
                        type: paramType,
                        required: paramObj.required || paramObj.in === "path",
                        metadata: paramMetadata,
                    };

                    switch (paramObj.in) {
                        case "path":
                            pathProps.push(property);
                            break;
                        case "query":
                            queryProps.push(property);
                            break;
                        case "header":
                            headerProps.push(property);
                            break;
                        case "cookie":
                            cookieProps.push(property);
                            break;
                    }
                }

                if (pathProps.length > 0) pathParams = createObject(pathProps);
                if (queryProps.length > 0) queryParams = createObject(queryProps);
                if (headerProps.length > 0) headerParams = createObject(headerProps);
                if (cookieProps.length > 0) cookieParams = createObject(cookieProps);
            }

            // Extract request body
            let input: IRType = createPrimitive("void");
            let requestContentType: string | undefined;
            if (operation.requestBody) {
                const requestBody =
                    "$ref" in operation.requestBody
                        ? resolveRef(operation.requestBody.$ref, schemas)
                        : operation.requestBody;

                if (requestBody?.content) {
                    const contentTypes = Object.keys(requestBody.content);
                    requestContentType = contentTypes[0];
                    if (requestContentType) {
                        const mediaType = requestBody.content[requestContentType];
                        if (mediaType?.schema) {
                            input = openApiSchemaToIrType(mediaType.schema, { ...options, availableTypes });
                        }
                    }
                }
            }

            // Extract responses
            const responses: import("../types").IRResponse[] = [];
            let output: IRType = createPrimitive("void");

            if (operation.responses) {
                for (const [status, responseObj] of Object.entries(operation.responses)) {
                    const response =
                        responseObj && typeof responseObj === "object" && "$ref" in responseObj
                            ? resolveRef(responseObj.$ref as string, schemas)
                            : responseObj;
                    if (!response) continue;

                    let responseType: IRType | undefined;
                    let responseContentType: string | undefined;

                    if (response.content) {
                        const contentTypes = Object.keys(response.content);
                        responseContentType = contentTypes[0];
                        if (responseContentType) {
                            const mediaType = response.content[responseContentType];
                            if (mediaType?.schema) {
                                responseType = openApiSchemaToIrType(mediaType.schema, { ...options, availableTypes });

                                // Use the first successful response as the default output type
                                if (
                                    status.startsWith("2") &&
                                    output.kind === "primitive" &&
                                    output.primitiveType === "void"
                                ) {
                                    output = responseType;
                                }
                            }
                        }
                    }

                    responses.push({
                        status,
                        type: responseType,
                        contentType: responseContentType,
                        description: response.description,
                    });
                }
            }

            // Create method
            const methodName = operation.operationId || `${method}${path.replace(/[^a-zA-Z0-9]/g, "_")}`;
            methods.push({
                name: methodName,
                input,
                output,
                httpMethod: method.toUpperCase() as any,
                path,
                pathParams,
                queryParams,
                headers: headerParams,
                cookies: cookieParams,
                requestContentType,
                responses,
                tags: operation.tags,
                operationId: operation.operationId,
                metadata,
            });
        }
    }

    return {
        types: [],
        services: methods.length > 0 ? [{ name: "API", methods, metadata: undefined }] : undefined,
        version: options.version,
    };
}

/**
 * Helper to resolve $ref
 */
function resolveRef(ref: string, schemas?: Record<string, OpenApiSchema>): any {
    if (!schemas) return undefined;
    const match = ref.match(/#\/components\/schemas\/(.+)/);
    if (match && schemas[match[1]!]) {
        return schemas[match[1]!];
    }
    return undefined;
}
