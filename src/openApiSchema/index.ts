import { pluginNotEnabled } from "../errors";
import type { OpenApiSchema } from "./types";

export function createOpenApiSchema<T>(): OpenApiSchema<T> {
    // intentionally empty, will be replaced at build time
    throw pluginNotEnabled()
}