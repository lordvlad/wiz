#!/usr/bin/env bun
import { mkdir, writeFile } from "fs/promises";
import { resolve, basename } from "path";

import { generateModelsFromOpenApi } from "../generator/openapi-ir";
import { generateModelsFromProtobuf, parseProtoFile } from "../generator/protobuf-ir";
import type * as TagTypes from "../tags/index";
import { DebugLogger } from "./utils";

interface GenerateOptions {
    outdir?: string;
    tags?: boolean;
    disableWizTags?: boolean;
    debug?: boolean;
}

/**
 * Generate TypeScript models from OpenAPI or Protobuf specification
 * Auto-detects the file type based on extension
 */
export async function generateModels(specPath: string, options: GenerateOptions = {}): Promise<void> {
    const debug = new DebugLogger(options.debug || false);

    debug.group("Command Arguments");
    debug.log("Command: model");
    debug.log("Spec file:", specPath);
    debug.log("Output directory:", options.outdir || "stdout");
    debug.log("Include tags:", options.tags || false);
    debug.log("Disable wiz tags:", options.disableWizTags || false);
    debug.log("Debug enabled:", options.debug || false);

    // Detect file type from extension
    if (specPath.endsWith(".proto")) {
        debug.log("Detected file type: Protobuf");
        await generateFromProtobuf(specPath, options, debug);
    } else if (specPath.endsWith(".json") || specPath.endsWith(".yaml") || specPath.endsWith(".yml")) {
        debug.log("Detected file type: OpenAPI");
        await generateFromOpenApi(specPath, options, debug);
    } else {
        throw new Error("Unsupported file format. Use .json, .yaml, .yml for OpenAPI or .proto for Protobuf files.");
    }
}

/**
 * Generate TypeScript models from OpenAPI specification
 */
async function generateFromOpenApi(specPath: string, options: GenerateOptions = {}, debug: DebugLogger): Promise<void> {
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

    debug.group("OpenAPI Spec Info");
    debug.log("OpenAPI version:", spec.openapi);
    debug.log("Title:", spec.info?.title);
    debug.log("Version:", spec.info?.version);
    if (spec.components?.schemas) {
        debug.log("Number of schemas:", Object.keys(spec.components.schemas).length);
        debug.log("Schema names:", Object.keys(spec.components.schemas));
    }

    // Load tags if requested
    let tags: Record<string, any> | undefined;
    if (options.tags) {
        try {
            const tagsModule = await import("../tags/index");
            // Only use exported values that are serializable
            tags = Object.fromEntries(Object.entries(tagsModule).filter(([_, value]) => typeof value !== "function"));
            debug.log("Loaded tags from src/tags/index.ts");
        } catch {
            console.warn("Warning: Could not load tags from src/tags/index.ts");
        }
    }

    // Generate models
    debug.group("Generating Models");
    const models = generateModelsFromOpenApi(spec, {
        includeTags: options.tags,
        tags,
        disableWizTags: options.disableWizTags,
    });

    debug.log(`Generated ${models.size} model(s)`);
    if (models.size > 0) {
        debug.log("Model names:", Array.from(models.keys()));
    }

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
async function generateFromProtobuf(
    protoPath: string,
    options: GenerateOptions = {},
    debug: DebugLogger,
): Promise<void> {
    // Read the proto file
    const file = Bun.file(protoPath);
    const content = await file.text();

    // Parse proto file
    debug.group("Parsing Protobuf File");
    const protoFile = parseProtoFile(content);

    debug.log("Syntax:", protoFile.syntax);
    debug.log("Package:", protoFile.package);
    if (protoFile.messages) {
        debug.log("Number of messages:", protoFile.messages.length);
        debug.log(
            "Message names:",
            protoFile.messages.map((m) => m.name),
        );
    }

    // Load tags if requested
    let tags: Record<string, any> | undefined;
    if (options.tags) {
        try {
            const tagsModule = await import("../tags/index");
            // Only use exported values that are serializable
            tags = Object.fromEntries(Object.entries(tagsModule).filter(([_, value]) => typeof value !== "function"));
            debug.log("Loaded tags from src/tags/index.ts");
        } catch {
            console.warn("Warning: Could not load tags from src/tags/index.ts");
        }
    }

    // Generate models
    debug.group("Generating Models");
    const models = generateModelsFromProtobuf(protoFile, {
        includeTags: options.tags,
        tags,
        disableWizTags: options.disableWizTags,
    });

    debug.log(`Generated ${models.size} model(s)`);
    if (models.size > 0) {
        debug.log("Model names:", Array.from(models.keys()));
    }

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
