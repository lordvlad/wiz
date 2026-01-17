/**
 * React Query client template
 *
 * Generates TypeScript client code with React Query integration.
 * Extends the fetch template with queries and mutations.
 */
import { Project } from "ts-morph";

import { generateReactQueryFiles } from "../openapi-client";
import type { OpenApiSpec } from "../openapi-ir";
import templateFetch, { type FetchTemplateContext, type FetchTemplateOptions } from "./fetch";

export interface ReactQueryTemplateContext {
    spec: OpenApiSpec;
    options?: ReactQueryTemplateOptions;
}

export interface ReactQueryTemplateOptions extends FetchTemplateOptions {
    reactQuery?: boolean;
}

export interface ReactQueryTemplateOutput {
    [key: string]: string;
}

/**
 * Generate queries.ts content from OpenAPI spec
 */
export function templateQueries(ctx: ReactQueryTemplateContext): string {
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
export function templateMutations(ctx: ReactQueryTemplateContext): string {
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
export default function template(ctx: ReactQueryTemplateContext): ReactQueryTemplateOutput {
    // Get base files from fetch template
    const fetchContext: FetchTemplateContext = {
        spec: ctx.spec,
        options: { ...ctx.options, reactQuery: true },
    };
    const fetchFiles = templateFetch(fetchContext);

    // Add React Query specific files
    return {
        ...fetchFiles,
        "queries.ts": templateQueries(ctx),
        "mutations.ts": templateMutations(ctx),
    };
}
