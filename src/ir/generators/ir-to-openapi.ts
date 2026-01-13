/**
 * IR to OpenAPI Schema generator
 *
 * Converts IR types to OpenAPI 3.0/3.1 schema format.
 */
import type { IRSchema, IRType, IRTypeDefinition } from "../types";
import {
    isArray,
    isDate,
    isEnum,
    isIntersection,
    isLiteral,
    isMap,
    isObject,
    isPrimitive,
    isReference,
    isUnion,
    unionContainsNullOrUndefined,
    removeNullAndUndefinedFromUnion,
} from "../utils";

/**
 * Options for IR to OpenAPI conversion
 */
export interface IrToOpenApiOptions {
    /** OpenAPI version (3.0 or 3.1) */
    version?: "3.0" | "3.1";
    /** Union style (oneOf or anyOf) */
    unionStyle?: "oneOf" | "anyOf";
    /** Custom date transformer */
    transformDate?: () => unknown;
}

/**
 * Convert IR schema to OpenAPI components.schemas
 */
export function irToOpenApiSchemas(schema: IRSchema, options: IrToOpenApiOptions = {}): Record<string, any> {
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
    transformDate?: () => unknown;
}

/**
 * Convert an IR type to OpenAPI schema
 */
export function irTypeToOpenApiSchema(type: IRType, context: Partial<ConversionContext> = {}): any {
    const ctx: ConversionContext = {
        version: context.version || "3.0",
        unionStyle: context.unionStyle || "oneOf",
        availableTypes: context.availableTypes || new Set(),
        title: context.title,
        metadata: context.metadata,
        transformDate: context.transformDate,
    };

    return convertType(type, ctx);
}

/**
 * Internal conversion function
 */
function convertType(type: IRType, context: ConversionContext): any {
    const schema: any = {};

    // Add metadata from context (type definition level)
    if (context.metadata) {
        if (context.metadata.description) schema.description = context.metadata.description;
        if (context.metadata.deprecated) schema.deprecated = true;
        if (context.metadata.default !== undefined) schema.default = context.metadata.default;
        if (context.metadata.examples && context.metadata.examples.length > 0) {
            schema.example = context.metadata.examples[0];
        }
        if (context.metadata.extensions) {
            Object.assign(schema, context.metadata.extensions);
        }
    }

    // Add metadata from type (overrides context metadata)
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
        if (type.constraints.exclusiveMinimum !== undefined)
            schema.exclusiveMinimum = type.constraints.exclusiveMinimum;
        if (type.constraints.exclusiveMaximum !== undefined)
            schema.exclusiveMaximum = type.constraints.exclusiveMaximum;
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
                    // In OpenAPI 3.0, null is not a valid type
                    // It should only appear in nullable unions
                    // Standalone null should not happen, but if it does, represent as empty schema
                    schema.nullable = true;
                }
                break;
            case "any":
                // No type constraint for any
                break;
            case "symbol":
                // Symbol types are not supported in OpenAPI
                // The ts-to-ir converter should have already converted to string if coerceSymbolsToStrings is enabled
                throw new Error("Symbol types require 'coerceSymbolsToStrings' to be enabled.");
            case "unknown":
            case "never":
            case "void":
                // These TypeScript-specific types don't have OpenAPI equivalents
                // Convert to any (empty schema)
                break;
            default:
                schema.type = "object";
        }
    } else if (isDate(type)) {
        // Handle Date type - apply custom transformer if provided
        if (context.transformDate) {
            const customSchema = context.transformDate();
            if (customSchema !== undefined) {
                return { ...schema, ...customSchema };
            }
        }
        // Default: string with date-time format
        schema.type = "string";
        schema.format = "date-time";
    } else if (isLiteral(type)) {
        // Literal types become const or enum
        // Special case: null literal should not have enum in OpenAPI 3.0
        if (type.value === null) {
            if (context.version === "3.1") {
                schema.type = "null";
                schema.const = null;
            } else {
                // In OpenAPI 3.0, standalone null should be represented as nullable: true
                schema.nullable = true;
            }
        } else {
            if (context.version === "3.1") {
                schema.const = type.value;
            } else {
                schema.enum = [type.value];
            }
            // Infer type from value
            if (typeof type.value === "string") schema.type = "string";
            else if (typeof type.value === "number") schema.type = "number";
            else if (typeof type.value === "boolean") schema.type = "boolean";
        }
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
        // Check for nullable union (e.g., string | null or string | undefined)
        const hasNullOrUndefined = unionContainsNullOrUndefined(type.types);
        const nonNullTypes = removeNullAndUndefinedFromUnion(type.types);

        // If union is just T | null (or T | undefined), convert to nullable T
        if (hasNullOrUndefined && nonNullTypes.length === 1) {
            const baseType = nonNullTypes[0]!;
            const baseSchema = convertType(baseType, { ...context, title: undefined });

            if (context.version === "3.1") {
                // OpenAPI 3.1: use type array
                if (baseSchema.type) {
                    schema.type = [baseSchema.type, "null"];
                } else {
                    // If base schema doesn't have a simple type, use anyOf
                    schema.anyOf = [baseSchema, { type: "null" }];
                }
                // Copy other properties from base schema
                Object.keys(baseSchema).forEach((key) => {
                    if (key !== "type" && key !== "anyOf") {
                        schema[key] = baseSchema[key];
                    }
                });
            } else {
                // OpenAPI 3.0: use nullable property
                Object.assign(schema, baseSchema);
                schema.nullable = true;
            }
        } else if (hasNullOrUndefined && nonNullTypes.length > 1) {
            // Nullable union with multiple non-null types (e.g., string | number | null)
            if (context.version === "3.1") {
                // OpenAPI 3.1: include null in oneOf
                const unionKey = context.unionStyle;
                schema[unionKey] = [...nonNullTypes, { kind: "primitive", primitiveType: "null" } as IRType].map((t) =>
                    convertType(t, { ...context, title: undefined }),
                );
            } else {
                // OpenAPI 3.0: use nullable: true outside oneOf
                const unionKey = context.unionStyle;
                schema[unionKey] = nonNullTypes.map((t) => convertType(t, { ...context, title: undefined }));
                schema.nullable = true;
            }

            // Handle discriminator
            if (type.discriminator) {
                schema.discriminator = {
                    propertyName: type.discriminator.propertyName,
                };
                if (type.discriminator.mapping) {
                    schema.discriminator.mapping = type.discriminator.mapping;
                }
            }
        } else {
            // Regular union (no null)
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
        }
    } else if (isIntersection(type)) {
        schema.allOf = type.types.map((t) => convertType(t, { ...context, title: undefined }));
    } else if (isMap(type)) {
        schema.type = "object";
        schema.additionalProperties = convertType(type.valueType, context);
    } else if (isEnum(type)) {
        schema.type = typeof type.members[0]?.value === "number" ? "number" : "string";
        schema.enum = type.members.map((m) => m.value);

        // Add x-enumDescriptions if any member has a description
        const descriptions: Record<string, string> = {};
        let hasDescriptions = false;
        for (const member of type.members) {
            if (member.metadata?.description) {
                descriptions[String(member.value)] = member.metadata.description;
                hasDescriptions = true;
            }
        }
        if (hasDescriptions) {
            schema["x-enumDescriptions"] = descriptions;
        }
    }

    return schema;
}

/**
 * Generate OpenAPI paths from IR methods
 */
export function irToOpenApiPaths(
    schema: import("../types").IRSchema,
    options: IrToOpenApiOptions = {},
): Record<string, Record<string, any>> {
    const paths: Record<string, Record<string, any>> = {};

    if (!schema.services) return paths;

    for (const service of schema.services) {
        for (const method of service.methods) {
            if (!method.path || !method.httpMethod) continue;

            const pathKey = method.path;
            const httpMethod = method.httpMethod.toLowerCase();

            if (!paths[pathKey]) {
                paths[pathKey] = {};
            }

            const operation: Record<string, any> = {};

            // Add metadata
            if (method.metadata?.description) {
                const lines = method.metadata.description.split("\n\n");
                if (lines.length > 1) {
                    operation.summary = lines[0];
                    operation.description = lines.slice(1).join("\n\n");
                } else {
                    operation.summary = method.metadata.description;
                }
            }
            if (method.operationId) {
                operation.operationId = method.operationId;
            }
            if (method.tags && method.tags.length > 0) {
                operation.tags = method.tags;
            }
            if (method.metadata?.deprecated) {
                operation.deprecated = true;
            }

            // Build parameters
            const parameters: any[] = [];

            // Add path parameters
            if (method.pathParams && isObject(method.pathParams)) {
                for (const prop of method.pathParams.properties) {
                    parameters.push({
                        name: prop.name,
                        in: "path",
                        required: true,
                        schema: irTypeToOpenApiSchema(prop.type, options),
                        ...(prop.metadata?.description ? { description: prop.metadata.description } : {}),
                    });
                }
            }

            // Add query parameters
            if (method.queryParams && isObject(method.queryParams)) {
                for (const prop of method.queryParams.properties) {
                    parameters.push({
                        name: prop.name,
                        in: "query",
                        required: prop.required,
                        schema: irTypeToOpenApiSchema(prop.type, options),
                        ...(prop.metadata?.description ? { description: prop.metadata.description } : {}),
                    });
                }
            }

            // Add header parameters
            if (method.headers && isObject(method.headers)) {
                for (const prop of method.headers.properties) {
                    parameters.push({
                        name: prop.name,
                        in: "header",
                        required: prop.required,
                        schema: irTypeToOpenApiSchema(prop.type, options),
                        ...(prop.metadata?.description ? { description: prop.metadata.description } : {}),
                    });
                }
            }

            // Add cookie parameters
            if (method.cookies && isObject(method.cookies)) {
                for (const prop of method.cookies.properties) {
                    parameters.push({
                        name: prop.name,
                        in: "cookie",
                        required: prop.required,
                        schema: irTypeToOpenApiSchema(prop.type, options),
                        ...(prop.metadata?.description ? { description: prop.metadata.description } : {}),
                    });
                }
            }

            if (parameters.length > 0) {
                operation.parameters = parameters;
            }

            // Add request body
            if (method.input.kind !== "primitive" || method.input.primitiveType !== "void") {
                const contentType = method.requestContentType || "application/json";
                operation.requestBody = {
                    required: true,
                    content: {
                        [contentType]: {
                            schema: irTypeToOpenApiSchema(method.input, options),
                        },
                    },
                };
            }

            // Add responses
            const responses: Record<string, any> = {};
            if (method.responses && method.responses.length > 0) {
                for (const response of method.responses) {
                    const responseObj: Record<string, any> = {
                        description: response.description || "Response",
                    };

                    if (response.type) {
                        const contentType = response.contentType || "application/json";
                        responseObj.content = {
                            [contentType]: {
                                schema: irTypeToOpenApiSchema(response.type, options),
                            },
                        };
                    }

                    responses[String(response.status)] = responseObj;
                }
            } else if (method.output.kind !== "primitive" || method.output.primitiveType !== "void") {
                // Default response from output type
                responses["200"] = {
                    description: "Successful response",
                    content: {
                        "application/json": {
                            schema: irTypeToOpenApiSchema(method.output, options),
                        },
                    },
                };
            } else {
                // Default empty response
                responses["200"] = {
                    description: "Successful response",
                };
            }

            operation.responses = responses;

            paths[pathKey][httpMethod] = operation;
        }
    }

    return paths;
}
