#!/usr/bin/env bun
import { mkdir, writeFile } from "fs/promises";
import { dirname, relative, resolve } from "path";
import { Project } from "ts-morph";

import { namedTypeToIrDefinition } from "../ir/converters/ts-to-ir";
import { irToProtobuf } from "../ir/generators/ir-to-proto";
import type { IRSchema } from "../ir/types";
import wizPlugin from "../plugin/index";
import { protobufModelToString } from "../plugin/protobuf/codegen";
import { expandFilePaths, findNearestPackageJson, readPackageJson, DebugLogger, scanFilesWithContent } from "./utils";

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

    // First pass: Look for createProtobufSpec calls using concurrent file scanning
    debug.group("Searching for createProtobufSpec/createProtobufModel calls");
    for await (const { path: file, content } of scanFilesWithContent(paths)) {
        const fileContent = await content;
        const hasCreateProtobuf =
            fileContent.includes("createProtobufSpec") || fileContent.includes("createProtobufModel");
        debug.log(`File: ${file}`, { hasCreateProtobuf });

        if (hasCreateProtobuf) {
            // Found createProtobufSpec, compile and execute
            debug.log("Found createProtobuf call, compiling and executing...");
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
                return; // Exit after first match
            }
        }
    }

    // Second pass: Generate from exported types
    debug.group("Generating from exported types");
    const spec = await generateFromTypes(files, debug);
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
    } else {
        console.error("Error: No createProtobufSpec calls found and no exported types to generate from");
        process.exit(1);
    }
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
 * Generate Protobuf spec from exported types using direct IR conversion.
 * This approach avoids the temporary file + build step, preventing import issues.
 */
async function generateFromTypes(files: string[], debug: DebugLogger): Promise<any> {
    const project = new Project({
        skipAddingFilesFromTsConfig: true,
    });

    // Add all files to the project
    const sourceFiles = files.map((f) => project.addSourceFileAtPath(f));

    // Collect all exported type aliases and interfaces with their ts-morph types
    const exportedTypes: { name: string; type: any; file: string }[] = [];

    for (const sourceFile of sourceFiles) {
        const filePath = sourceFile.getFilePath();

        // Get exported type aliases
        sourceFile.getTypeAliases().forEach((typeAlias: any) => {
            if (typeAlias.isExported()) {
                exportedTypes.push({
                    name: typeAlias.getName(),
                    type: typeAlias.getType(),
                    file: filePath,
                });
                debug.log(`Found exported type: ${typeAlias.getName()}`, { file: filePath });
            }
        });

        // Get exported interfaces
        sourceFile.getInterfaces().forEach((iface: any) => {
            if (iface.isExported()) {
                exportedTypes.push({
                    name: iface.getName(),
                    type: iface.getType(),
                    file: filePath,
                });
                debug.log(`Found exported interface: ${iface.getName()}`, { file: filePath });
            }
        });
    }

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
    const availableTypes = new Set(exportedTypes.map((t) => t.name));
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
