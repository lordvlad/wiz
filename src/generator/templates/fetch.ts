/**
 * Fetch client template
 *
 * Generates TypeScript client code using native fetch API.
 * Accepts OpenAPI spec in IR format and returns file content mappings.
 */
import { Project } from "ts-morph";

import { generateApiClient } from "../openapi-client";
import type { OpenApiSpec } from "../openapi-ir";
import { generateModelsFromOpenApi } from "../openapi-ir";

export interface FetchTemplateContext {
    spec: OpenApiSpec;
    options?: FetchTemplateOptions;
}

export interface FetchTemplateOptions {
    includeTags?: boolean;
    tags?: Record<string, any>;
    disableWizTags?: boolean;
    wizValidator?: boolean;
    reactQuery?: boolean;
}

export interface FetchTemplateOutput {
    [key: string]: string;
}

/**
 * Generate model.ts content from OpenAPI spec
 */
export function templateModel(ctx: FetchTemplateContext): string {
    const modelsMap = generateModelsFromOpenApi(ctx.spec, ctx.options);
    return Array.from(modelsMap.values()).join("\n\n");
}

/**
 * Generate api.ts content from OpenAPI spec
 */
export function templateAPI(ctx: FetchTemplateContext): string {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile("api.ts", "");

    // Use the exported generateApiClient function
    generateApiClient(sourceFile, ctx.spec, ctx.options || {});

    return sourceFile.getFullText();
}

/**
 * Main fetch template function
 * Returns file content mappings for the fetch client
 */
export default function template(ctx: FetchTemplateContext): FetchTemplateOutput {
    return {
        "model.ts": templateModel(ctx),
        "api.ts": templateAPI(ctx),
    };
}
