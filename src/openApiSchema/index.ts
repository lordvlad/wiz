import { pluginNotEnabled } from "../errors";
import type { OpenApiSchema } from "./types";

// Accepts a tuple of types to generate OpenAPI components.schemas structure
export function createOpenApiSchema<T extends readonly any[]>(): OpenApiSchema<T> {
    // intentionally empty, will be replaced at build time
    throw pluginNotEnabled()
}