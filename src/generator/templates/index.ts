/**
 * Template functions for client generation
 *
 * This module exports template functions that accept OpenAPI specs
 * and return file content mappings for different client types.
 *
 * @example Basic usage
 * ```typescript
 * import { fetchTemplate } from "wiz/generator/templates";
 *
 * const spec = { ... }; // Your OpenAPI spec
 * const files = fetchTemplate({ spec });
 * console.log(files["model.ts"]); // Generated model code
 * console.log(files["api.ts"]);   // Generated API code
 * ```
 *
 * @example Loading templates dynamically
 * ```typescript
 * import { loadTemplate } from "wiz/generator/templates";
 *
 * // Load built-in template
 * const template = await loadTemplate("fetch");
 * const files = template({ spec });
 *
 * // Load custom template from relative path
 * const customTemplate = await loadTemplate("./my-template.ts");
 * const customFiles = customTemplate({ spec });
 * ```
 */

// Export common types
export type { WizGeneratorOutput, WizTemplateContext, WizTemplateOptions, WizTemplate } from "./types";

// Export template functions
export { default as fetchTemplate, templateModel, templateAPI } from "./fetch";
export { default as reactQueryTemplate, templateQueries, templateMutations } from "./react-query";

// Export template loader
export { loadTemplate, listBuiltinTemplates } from "./loader";
