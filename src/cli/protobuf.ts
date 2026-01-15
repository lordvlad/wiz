#!/usr/bin/env bun
import { mkdir, writeFile } from "fs/promises";
import { dirname, relative, resolve } from "path";
import { Project } from "ts-morph";

import { namedTypeToIrDefinition } from "../ir/converters/ts-to-ir";
import { irToProtobuf } from "../ir/generators/ir-to-proto";
import type { IRSchema } from "../ir/types";
import wizPlugin from "../plugin/index";
import { protobufModelToString } from "../plugin/protobuf/codegen";
import { scanFiles, getExportedTypes, getFilesWithFunctionCall } from "./file-scanner";
import { expandFilePaths, findNearestPackageJson, readPackageJson, DebugLogger } from "./utils";

type Format = "json" | "proto";

interface ProtobufOptions {
    format?: Format;
    debug?: boolean;
}

/**
 * Generate Protobuf spec from TypeScript files.
 */
export async function generateProtobuf(paths: string[], options: ProtobufOptions = {}): Promise<void> {
    const format = options.format || "proto";
    const debug = new DebugLogger(options.debug || false);

    debug.group("Command Arguments");
    debug.log("Command: protobuf");
    debug.log("Input paths:", paths);
    debug.log("Format:", format);
    debug.log("Debug enabled:", options.debug || false);

    if (paths.length === 0) {
        console.error("Error: No files or directories specified");
        process.exit(1);
    }

    const files = await expandFilePaths(paths);

    debug.group("Found Files");
    debug.log(`Total files found: ${files.length}`);
    if (files.length > 0) {
        debug.log("Files:", files);
    }

    if (files.length === 0) {
        console.error("Error: No TypeScript files found");
        process.exit(1);
    }

    // Single pass: Scan all files once and collect all information
    debug.group("Scanning files (unified pass)");
    const scanResult = await scanFiles(files, {
        functionNames: ["createProtobufSpec", "createProtobufModel"],
        extractJSDoc: false,
        debug,
    });

    debug.log(`Scan complete: ${scanResult.types.length} types`);

    // Strategy 1: Look for createProtobufSpec/createProtobufModel calls
    const createProtobufFiles = [
        ...getFilesWithFunctionCall(scanResult, "createProtobufSpec"),
        ...getFilesWithFunctionCall(scanResult, "createProtobufModel"),
    ];

    if (createProtobufFiles.length > 0) {
        debug.group("Found createProtobuf calls, compiling and executing");
        const file = createProtobufFiles[0];
        if (!file) {
            console.error("Error: Could not find file with createProtobuf call");
            process.exit(1);
        }
        debug.log(`Using file: ${file}`);

        const spec = await compileAndExecuteProtobuf(file, debug);
        if (spec) {
            debug.group("Protobuf Spec Generated");
            debug.log("Syntax:", spec.syntax);
            debug.log("Package:", spec.package);
            if (spec.messages) {
                debug.log("Number of messages:", Object.keys(spec.messages).length);
                debug.log("Message names:", Object.keys(spec.messages));
            }
            if (spec.enums) {
                debug.log("Number of enums:", Object.keys(spec.enums).length);
            }
            outputSpec(spec, format);
            return;
        }
    }

    // Strategy 2: Generate from exported types
    const exportedTypes = getExportedTypes(scanResult);
    if (exportedTypes.length > 0) {
        debug.group("Generating from exported types");
        const spec = await generateFromTypes(scanResult, files, debug);
        if (spec) {
            debug.group("Protobuf Spec Generated from Types");
            debug.log("Syntax:", spec.syntax);
            debug.log("Package:", spec.package);
            if (spec.messages) {
                debug.log("Number of messages:", Object.keys(spec.messages).length);
                debug.log("Message names:", Object.keys(spec.messages));
            }
            if (spec.enums) {
                debug.log("Number of enums:", Object.keys(spec.enums).length);
            }
            outputSpec(spec, format);
            return;
        }
    }

    console.error("Error: No createProtobufSpec calls found and no exported types to generate from");
    process.exit(1);
}

/**
 * Compile and execute a file containing createProtobufSpec.
 */
async function compileAndExecuteProtobuf(filePath: string, debug: DebugLogger): Promise<any> {
    // Create temporary directory
    const tmpDir = resolve(process.cwd(), ".tmp", "cli-protobuf-" + Date.now());
    await mkdir(tmpDir, { recursive: true });

    try {
        const tmpFile = resolve(tmpDir, "source.ts");
        const outDir = resolve(tmpDir, "out");

        // Copy source to tmp
        const source = await Bun.file(filePath).text();
        await writeFile(tmpFile, source);

        // Build with wiz plugin
        const build = await Bun.build({
            entrypoints: [tmpFile],
            outdir: outDir,
            throw: false,
            minify: false,
            format: "esm",
            root: tmpDir,
            packages: "external",
            sourcemap: "none",
            plugins: [wizPlugin({ log: false })],
        });

        if (!build.success) {
            const message =
                build.logs
                    .map((l) => l.message)
                    .filter(Boolean)
                    .join("\n") || "Bundle failed";
            console.error("Build error:", message);
            return null;
        }

        // Import and find the exported spec
        const outFile = resolve(outDir, "source.js");
        const module = await import(outFile);

        // Look for protobuf exports (common names: spec, model, proto, etc.)
        const possibleNames = ["spec", "model", "proto", "protobuf", "default"];
        for (const name of possibleNames) {
            if (module[name] && typeof module[name] === "object" && module[name].syntax === "proto3") {
                return module[name];
            }
        }

        // Check all exports
        for (const key of Object.keys(module)) {
            const value = module[key];
            if (value && typeof value === "object" && value.syntax === "proto3") {
                return value;
            }
        }

        return null;
    } finally {
        // Clean up tmp directory
        await Bun.$`rm -rf ${tmpDir}`.quiet();
    }
}

/**
 * Generate Protobuf spec from exported types using pre-scanned data.
 * This approach uses data already collected during the unified scan.
 */
async function generateFromTypes(scanResult: any, files: string[], debug: DebugLogger): Promise<any> {
    // Use only exported types from the scan result
    const exportedTypes = getExportedTypes(scanResult);

    debug.log(`Total exported types: ${exportedTypes.length}`);
    if (exportedTypes.length > 0) {
        debug.log(
            "Type names:",
            exportedTypes.map((t) => t.name),
        );
    }

    if (exportedTypes.length === 0) {
        return null;
    }

    // Find nearest package.json for metadata
    let packageJson: any = {};
    const firstFile = files[0];
    if (firstFile) {
        const packageJsonPath = await findNearestPackageJson(firstFile);
        if (packageJsonPath) {
            try {
                packageJson = await readPackageJson(packageJsonPath);
            } catch {
                // Ignore errors reading package.json
            }
        }
    }

    // Convert types to IR schema
    const availableTypes = new Set<string>(exportedTypes.map((t) => t.name));
    const irSchema: IRSchema = {
        types: exportedTypes.map(({ name, type }) => namedTypeToIrDefinition(name, type, { availableTypes })),
        package: packageJson.name || "api",
    };

    // Generate Protobuf model from IR
    const model = irToProtobuf(irSchema);

    return model;
}

/**
 * Output the spec in the specified format.
 */
function outputSpec(spec: any, format: Format): void {
    if (format === "json") {
        console.log(JSON.stringify(spec, null, 2));
    } else {
        const protoContent = protobufModelToString(spec);
        console.log(protoContent);
    }
}
