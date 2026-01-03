import { pluginNotEnabled } from "../errors";
import type { OpenApiSchema, OpenApiConfig, OpenApiSpec, PathBuilder, OpenApiConfigWithPaths } from "./types";

export type OpenApiVersion = "3.0" | "3.1";

// Accepts a tuple of types and an OpenAPI version as type parameters to generate OpenAPI components.schemas structure
export function createOpenApiModel<T extends readonly any[], V extends OpenApiVersion = "3.0">(): OpenApiSchema<T> {
    // intentionally empty, will be replaced at build time
    throw pluginNotEnabled();
}

// Legacy alias for backward compatibility
export function createOpenApiSchema<T extends readonly any[], V extends OpenApiVersion = "3.0">(): OpenApiSchema<T> {
    // intentionally empty, will be replaced at build time
    throw pluginNotEnabled();
}

// Overload 1: Accepts a configuration object
export function createOpenApiSpec<T extends readonly any[], V extends OpenApiVersion = "3.0">(
    config?: OpenApiConfig,
): OpenApiSpec<T>;

// Overload 2: Accepts a callback function that receives a path builder
export function createOpenApiSpec<T extends readonly any[], V extends OpenApiVersion = "3.0">(
    callback: (path: PathBuilder) => OpenApiConfigWithPaths,
): OpenApiSpec<T>;

// Implementation
export function createOpenApiSpec<T extends readonly any[], V extends OpenApiVersion = "3.0">(
    configOrCallback?: OpenApiConfig | ((path: PathBuilder) => OpenApiConfigWithPaths),
): OpenApiSpec<T> {
    // intentionally empty, will be replaced at build time
    throw pluginNotEnabled();
}

// Legacy alias for backward compatibility
export function createOpenApi<T extends readonly any[], V extends OpenApiVersion = "3.0">(
    configOrCallback?: OpenApiConfig | ((path: PathBuilder) => OpenApiConfigWithPaths),
): OpenApiSpec<T> {
    // intentionally empty, will be replaced at build time
    throw pluginNotEnabled();
}

export function openApiPath<
    PathParams = never,
    QueryParams = never,
    RequestBody = never,
    ResponseBody = any,
    Handler extends (...args: any[]) => any = (...args: any[]) => any,
>(handler: Handler): Handler {
    return handler;
}

// Legacy alias for backward compatibility
export function typedPath<
    PathParams = never,
    QueryParams = never,
    RequestBody = never,
    ResponseBody = any,
    Handler extends (...args: any[]) => any = (...args: any[]) => any,
>(handler: Handler): Handler {
    return openApiPath<PathParams, QueryParams, RequestBody, ResponseBody, Handler>(handler);
}
