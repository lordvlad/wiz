import { pluginNotEnabled } from "../errors";
import type { OpenApiSchema } from "./types";

// Overload for single type (backward compatibility)
export function createOpenApiSchema<T>(): OpenApiSchema<T>;
// Overload for array of types
export function createOpenApiSchema<T extends readonly any[]>(): OpenApiSchema<T>;
// Implementation
export function createOpenApiSchema<T>(): OpenApiSchema<T> {
    // intentionally empty, will be replaced at build time
    throw pluginNotEnabled()
}