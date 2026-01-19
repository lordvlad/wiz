/**
 * Common types for template functions
 */
import type { OpenApiSpec } from "../openapi-ir";

/**
 * Common output format for all templates
 * Maps filenames to file contents
 */
export interface WizGeneratorOutput {
    [filename: string]: string;
}

/**
 * Common options for all OpenAPI templates
 */
export interface WizTemplateOptions {
    includeTags?: boolean;
    tags?: Record<string, any>;
    disableWizTags?: boolean;
    wizValidator?: boolean;
    /** Additional custom options for template extensions */
    [key: string]: unknown;
}

/**
 * Common context for all OpenAPI templates
 */
export interface WizTemplateContext {
    spec: OpenApiSpec;
    options?: WizTemplateOptions;
}

/**
 * Template function signature
 * All templates must follow this signature
 */
export type WizTemplate = (ctx: WizTemplateContext) => WizGeneratorOutput;
