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
    const { models, api } = generateClientFromOpenApi(spec, {
        wizValidator: options.wizValidator,
        reactQuery: options.reactQuery,
    });

    // Output client
    if (options.outdir) {
        await writeClientToFiles(models, api, options.outdir);
    } else {
        outputClientToStdout(models, api);
    }
}

/**
 * Write client to separate files in output directory
 */
async function writeClientToFiles(models: string, api: string, outdir: string): Promise<void> {
    // Create output directory
    await mkdir(outdir, { recursive: true });

    // Write models
    const modelsFile = resolve(outdir, "model.ts");
    await writeFile(modelsFile, models);
    console.log(`✓ Generated ${modelsFile}`);

    // Write API
    const apiFile = resolve(outdir, "api.ts");
    const apiWithImport = `import type * as Models from "./model";\n\n${api}`;
    await writeFile(apiFile, apiWithImport);
    console.log(`✓ Generated ${apiFile}`);

    console.log(`\nGenerated client in ${outdir}`);
}

/**
 * Output client to stdout
 */
function outputClientToStdout(models: string, api: string): void {
    console.log("// Models");
    console.log(models);
    console.log("\n// API Client");
    console.log(api);
}
