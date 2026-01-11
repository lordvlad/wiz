/**
 * IR-based OpenAPI to TypeScript generator wrapper
 *
 * This module provides a bridge for generating TypeScript from OpenAPI using the IR layer.
 */
import type { OpenAPIV3, OpenAPIV3_1 } from "openapi-types";

import { openApiSchemasToIr } from "../ir/converters/openapi-to-ir";
import { irToTypeScript } from "../ir/generators/ir-to-ts";

type OpenApiSchema =
    | OpenAPIV3.SchemaObject
    | OpenAPIV3.ReferenceObject
    | OpenAPIV3_1.SchemaObject
    | OpenAPIV3_1.ReferenceObject;

// More permissive OpenApiSpec type to match openapi.ts
export type OpenApiSpec = {
    openapi?: string;
    info?: OpenAPIV3.InfoObject | OpenAPIV3_1.InfoObject;
    servers?: OpenAPIV3.ServerObject[] | OpenAPIV3_1.ServerObject[];
    paths?: OpenAPIV3.PathsObject | OpenAPIV3_1.PathsObject;
    components?: {
        schemas?: Record<string, any>;
        securitySchemes?: Record<string, OpenAPIV3.SecuritySchemeObject | OpenAPIV3_1.SecuritySchemeObject>;
        [key: string]: any;
    };
    security?: OpenAPIV3.SecurityRequirementObject[] | OpenAPIV3_1.SecurityRequirementObject[];
    tags?: OpenAPIV3.TagObject[] | OpenAPIV3_1.TagObject[];
    externalDocs?: OpenAPIV3.ExternalDocumentationObject | OpenAPIV3_1.ExternalDocumentationObject;
    [key: string]: any;
};

export interface GeneratorOptions {
    includeTags?: boolean;
    tags?: Record<string, any>;
    disableWizTags?: boolean;
}

/**
 * Generate TypeScript models from OpenAPI schemas using IR layer
 */
export function generateModelsFromOpenApiViaIr(
    schemas: Record<string, OpenApiSchema>,
    options: { version?: "3.0" | "3.1" } = {},
): Map<string, string> {
    // Convert OpenAPI to IR
    const irSchema = openApiSchemasToIr(schemas, {
        version: options.version,
    });

    // Generate TypeScript from IR
    return irToTypeScript(irSchema);
}

/**
 * Generate TypeScript models from OpenAPI specification using IR layer
 * This is a compatibility wrapper matching the signature of generateModelsFromOpenApi
 */
export function generateModelsFromOpenApi(spec: OpenApiSpec, options: GeneratorOptions = {}): Map<string, string> {
    if (!spec.components?.schemas) {
        return new Map<string, string>();
    }

    // Detect OpenAPI version from spec
    const version = spec.openapi?.startsWith("3.1") ? "3.1" : "3.0";

    return generateModelsFromOpenApiViaIr(spec.components.schemas, {
        version,
    });
}
