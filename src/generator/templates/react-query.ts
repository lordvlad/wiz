/**
 * React Query client template
 *
 * Generates TypeScript client code with React Query integration.
 * Extends the fetch template with queries and mutations.
 */
import { Project } from "ts-morph";

import { generateReactQueryFiles } from "../openapi-client";
import templateFetch from "./fetch";
import type { WizGeneratorOutput, WizTemplateContext } from "./types";

/**
 * Generate queries.ts content from OpenAPI spec
 */
export function templateQueries(ctx: WizTemplateContext): string {
    const project = new Project({ useInMemoryFileSystem: true });
    const queriesFile = project.createSourceFile("queries.ts", "");
    const mutationsFile = project.createSourceFile("mutations.ts", "");

    // Generate both files but only return queries
    generateReactQueryFiles(queriesFile, mutationsFile, ctx.spec, { ...ctx.options, reactQuery: true });

    return queriesFile.getFullText();
}

/**
 * Generate mutations.ts content from OpenAPI spec
 */
export function templateMutations(ctx: WizTemplateContext): string {
    const project = new Project({ useInMemoryFileSystem: true });
    const queriesFile = project.createSourceFile("queries.ts", "");
    const mutationsFile = project.createSourceFile("mutations.ts", "");

    // Generate both files but only return mutations
    generateReactQueryFiles(queriesFile, mutationsFile, ctx.spec, { ...ctx.options, reactQuery: true });

    return mutationsFile.getFullText();
}

/**
 * Main react-query template function
 * Returns file content mappings for the react-query client
 */
export default function template(ctx: WizTemplateContext): WizGeneratorOutput {
    // Get base files from fetch template with reactQuery flag enabled
    const fetchFiles = templateFetch({
        spec: ctx.spec,
        options: { ...ctx.options, reactQuery: true },
    });

    // Add React Query specific files
    return {
        ...fetchFiles,
        "queries.ts": templateQueries(ctx),
        "mutations.ts": templateMutations(ctx),
    };
}
