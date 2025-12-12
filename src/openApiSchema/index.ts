import { pluginNotEnabled } from "../errors";
import type { OpenApiSchema, OpenApiConfig, OpenApiSpec } from "./types";

export type OpenApiVersion = "3.0" | "3.1";

// Accepts a tuple of types and an OpenAPI version as type parameters to generate OpenAPI components.schemas structure
export function createOpenApiSchema<T extends readonly any[], V extends OpenApiVersion = "3.0">(): OpenApiSchema<T> {
    // intentionally empty, will be replaced at build time
    throw pluginNotEnabled()
}

// Accepts a tuple of types, OpenAPI version, and configuration options to generate a full OpenAPI specification
export function createOpenApi<T extends readonly any[], V extends OpenApiVersion = "3.0">(
    config?: OpenApiConfig
): OpenApiSpec<T> {
    // intentionally empty, will be replaced at build time
    throw pluginNotEnabled()
}