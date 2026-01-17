/**
 * Template functions for client generation
 *
 * This module exports template functions that accept OpenAPI specs
 * and return file content mappings for different client types.
 */

export { default as fetchTemplate, templateModel, templateAPI } from "./fetch";
export type { FetchTemplateContext, FetchTemplateOptions, FetchTemplateOutput } from "./fetch";

export { default as reactQueryTemplate, templateQueries, templateMutations } from "./react-query";
export type { ReactQueryTemplateContext, ReactQueryTemplateOptions, ReactQueryTemplateOutput } from "./react-query";
