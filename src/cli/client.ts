#!/usr/bin/env bun
import { mkdir, writeFile } from "fs/promises";
import { resolve } from "path";

import { generateClientFromOpenApi } from "../generator/openapi-client";
import { DebugLogger, isUrl, loadSpecContent } from "./utils";

interface ClientOptions {
    outdir?: string;
    wizValidator?: boolean;
    reactQuery?: boolean;
    debug?: boolean;
}

/**
 * Generate TypeScript client from OpenAPI specification
 */
export async function generateClient(specPath: string, options: ClientOptions = {}): Promise<void> {
    const debug = new DebugLogger(options.debug || false);

    debug.group("Command Arguments");
    debug.log("Command: client");
    debug.log("Spec file:", specPath);
    debug.log("Is URL:", isUrl(specPath));
    debug.log("Output directory:", options.outdir || "stdout");
    debug.log("Wiz validator:", options.wizValidator || false);
    debug.log("React Query:", options.reactQuery || false);
    debug.log("Debug enabled:", options.debug || false);

    // Load spec content from URL or file
    const content = await loadSpecContent(specPath);
    let spec: any;

    if (specPath.endsWith(".json")) {
        spec = JSON.parse(content);
    } else if (specPath.endsWith(".yaml") || specPath.endsWith(".yml")) {
        spec = Bun.YAML.parse(content);
    } else {
        throw new Error("Unsupported file format. Use .json or .yaml/.yml files.");
    }

    debug.group("OpenAPI Spec Info");
    debug.log("OpenAPI version:", spec.openapi);
    debug.log("Title:", spec.info?.title);
    debug.log("Version:", spec.info?.version);
    if (spec.paths) {
        debug.log("Number of paths:", Object.keys(spec.paths).length);
        debug.log("Paths:", Object.keys(spec.paths));
    }
    if (spec.components?.schemas) {
        debug.log("Number of schemas:", Object.keys(spec.components.schemas).length);
    }

    // Generate client
    debug.group("Generating Client");
    const result = generateClientFromOpenApi(spec, {
        wizValidator: options.wizValidator,
        reactQuery: options.reactQuery,
    });

    debug.log("Generated models:", result.models ? "yes" : "no");
    debug.log("Generated API:", result.api ? "yes" : "no");
    if (options.reactQuery) {
        debug.log("Generated queries:", result.queries ? "yes" : "no");
        debug.log("Generated mutations:", result.mutations ? "yes" : "no");
    }

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
