import { pluginNotEnabled } from "../errors";
import type { OpenApiSchema, OpenApiConfig, OpenApiSpec, PathBuilder, OpenApiConfigWithPaths } from "./types";

export type OpenApiVersion = "3.0" | "3.1";

// Accepts a tuple of types and an OpenAPI version as type parameters to generate OpenAPI components.schemas structure
export function createOpenApiSchema<T extends readonly any[], V extends OpenApiVersion = "3.0">(): OpenApiSchema<T> {
    // intentionally empty, will be replaced at build time
    throw pluginNotEnabled()
}

// Overload 1: Accepts a configuration object
export function createOpenApi<T extends readonly any[], V extends OpenApiVersion = "3.0">(
    config?: OpenApiConfig
): OpenApiSpec<T>;

// Overload 2: Accepts a callback function that receives a path builder
export function createOpenApi<T extends readonly any[], V extends OpenApiVersion = "3.0">(
    callback: (path: PathBuilder) => OpenApiConfigWithPaths
): OpenApiSpec<T>;

// Implementation
export function createOpenApi<T extends readonly any[], V extends OpenApiVersion = "3.0">(
    configOrCallback?: OpenApiConfig | ((path: PathBuilder) => OpenApiConfigWithPaths)
): OpenApiSpec<T> {
    // intentionally empty, will be replaced at build time
    throw pluginNotEnabled()
}
