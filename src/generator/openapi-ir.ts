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
