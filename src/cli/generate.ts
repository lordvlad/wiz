#!/usr/bin/env bun
import { mkdir, writeFile } from "fs/promises";
import { resolve, basename } from "path";

import { generateModelsFromOpenApi } from "../generator/openapi";
import { generateModelsFromProtobuf, parseProtoFile } from "../generator/protobuf";
import type * as TagTypes from "../tags/index";

interface GenerateOptions {
    outdir?: string;
    tags?: boolean;
}

/**
 * Generate TypeScript models from OpenAPI specification
 */
export async function generateFromOpenApi(specPath: string, options: GenerateOptions = {}): Promise<void> {
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

    // Load tags if requested
    let tags: Record<string, any> | undefined;
    if (options.tags) {
        try {
            const tagsModule = await import("../tags/index");
            // Only use exported values that are serializable
            tags = Object.fromEntries(Object.entries(tagsModule).filter(([_, value]) => typeof value !== "function"));
        } catch {
            console.warn("Warning: Could not load tags from src/tags/index.ts");
        }
    }

    // Generate models
    const models = generateModelsFromOpenApi(spec, {
        includeTags: options.tags,
        tags,
    });

    // Output models
    if (options.outdir) {
        await writeModelsToFiles(models, options.outdir);
    } else {
        outputModelsToStdout(models);
    }
}

/**
 * Generate TypeScript models from Protobuf specification
 */
export async function generateFromProtobuf(protoPath: string, options: GenerateOptions = {}): Promise<void> {
    // Read the proto file
    const file = Bun.file(protoPath);
    const content = await file.text();

    // Parse proto file
    const protoFile = parseProtoFile(content);

    // Load tags if requested
    let tags: Record<string, any> | undefined;
    if (options.tags) {
        try {
            const tagsModule = await import("../tags/index");
            // Only use exported values that are serializable
            tags = Object.fromEntries(Object.entries(tagsModule).filter(([_, value]) => typeof value !== "function"));
        } catch {
            console.warn("Warning: Could not load tags from src/tags/index.ts");
        }
    }

    // Generate models
    const models = generateModelsFromProtobuf(protoFile, {
        includeTags: options.tags,
        tags,
    });

    // Output models
    if (options.outdir) {
        await writeModelsToFiles(models, options.outdir);
    } else {
        outputModelsToStdout(models);
    }
}

/**
 * Write models to separate files in output directory
 */
async function writeModelsToFiles(models: Map<string, string>, outdir: string): Promise<void> {
    // Create output directory
    await mkdir(outdir, { recursive: true });

    let count = 0;
    for (const [name, content] of models) {
        const filename = resolve(outdir, `${name}.ts`);
        await writeFile(filename, content);
        console.log(`✓ Generated ${filename}`);
        count++;
    }

    console.log(`\nGenerated ${count} type(s)`);
}

/**
 * Output all models to stdout
 */
function outputModelsToStdout(models: Map<string, string>): void {
    for (const [name, content] of models) {
        console.log(content);
        console.log(); // Empty line between types
    }
}
