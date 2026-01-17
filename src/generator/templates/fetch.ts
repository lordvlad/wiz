/**
 * Fetch client template
 *
 * Generates TypeScript client code using native fetch API.
 * Accepts OpenAPI spec in IR format and returns file content mappings.
 */
import { Project } from "ts-morph";

import { generateApiClient } from "../openapi-client";
import { generateModelsFromOpenApi } from "../openapi-ir";
import type { WizGeneratorOutput, WizTemplateContext } from "./types";

/**
 * Generate model.ts content from OpenAPI spec
 */
export function templateModel(ctx: WizTemplateContext): string {
    const modelsMap = generateModelsFromOpenApi(ctx.spec, ctx.options);
    return Array.from(modelsMap.values()).join("\n\n");
}

/**
 * Generate api.ts content from OpenAPI spec
 */
export function templateAPI(ctx: WizTemplateContext): string {
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
export default function template(ctx: WizTemplateContext): WizGeneratorOutput {
    return {
        "model.ts": templateModel(ctx),
        "api.ts": templateAPI(ctx),
    };
}
