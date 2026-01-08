#!/usr/bin/env bun
import { mkdir, writeFile } from "fs/promises";
import { resolve } from "path";

import { generateClientFromOpenApi } from "../generator/openapi-client";

interface ClientOptions {
    outdir?: string;
    wizValidator?: boolean;
    reactQuery?: boolean;
}

/**
 * Generate TypeScript client from OpenAPI specification
 */
export async function generateClient(specPath: string, options: ClientOptions = {}): Promise<void> {
    // Read the spec file
    const file = Bun.file(specPath);
    let spec: any;

    if (specPath.endsWith(".json")) {
        spec = await file.json();
    } else if (specPath.endsWith(".yaml") || specPath.endsWith(".yml")) {
        const content = await file.text();
        spec = Bun.YAML.parse(content);
    } else {
        throw new Error("Unsupported file format. Use .json or .yaml/.yml files.");
    }

    // Generate client
    const result = generateClientFromOpenApi(spec, {
        wizValidator: options.wizValidator,
        reactQuery: options.reactQuery,
    });

    // Output client
    if (options.outdir) {
        await writeClientToFiles(result, options.outdir, options.reactQuery || false);
    } else {
        outputClientToStdout(result);
    }
}

/**
 * Write client to separate files in output directory
 */
async function writeClientToFiles(result: any, outdir: string, reactQuery: boolean): Promise<void> {
    // Create output directory
    await mkdir(outdir, { recursive: true });

    // Write models
    const modelsFile = resolve(outdir, "model.ts");
    await writeFile(modelsFile, result.models);
    console.log(`✓ Generated ${modelsFile}`);

    // Write API
    const apiFile = resolve(outdir, "api.ts");
    const apiWithImport = `import type * as Models from "./model";\n\n${result.api}`;
    await writeFile(apiFile, apiWithImport);
    console.log(`✓ Generated ${apiFile}`);

    // Write queries and mutations if React Query is enabled
    if (reactQuery && result.queries && result.mutations) {
        const queriesFile = resolve(outdir, "queries.ts");
        await writeFile(queriesFile, result.queries);
        console.log(`✓ Generated ${queriesFile}`);

        const mutationsFile = resolve(outdir, "mutations.ts");
        await writeFile(mutationsFile, result.mutations);
        console.log(`✓ Generated ${mutationsFile}`);
    }

    console.log(`\nGenerated client in ${outdir}`);
}

/**
 * Output client to stdout
 */
function outputClientToStdout(result: any): void {
    console.log("// Models");
    console.log(result.models);
    console.log("\n// API Client");
    console.log(result.api);

    // Append queries and mutations if React Query is enabled
    if (result.queries) {
        console.log("\n// Queries");
        console.log(result.queries);
    }
    if (result.mutations) {
        console.log("\n// Mutations");
        console.log(result.mutations);
    }
}
