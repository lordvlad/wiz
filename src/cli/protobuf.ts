#!/usr/bin/env bun
import { mkdir, writeFile } from "fs/promises";
import { dirname, relative, resolve } from "path";
import { Project } from "ts-morph";

import wizPlugin from "../plugin/index";
import { protobufModelToString } from "../plugin/protobuf/codegen";
import { expandFilePaths, findNearestPackageJson, readPackageJson } from "./utils";

type Format = "json" | "proto";

interface ProtobufOptions {
    format?: Format;
}

/**
 * Generate Protobuf spec from TypeScript files.
 */
export async function generateProtobuf(paths: string[], options: ProtobufOptions = {}): Promise<void> {
    const format = options.format || "proto";

    if (paths.length === 0) {
        console.error("Error: No files or directories specified");
        process.exit(1);
    }

    const files = await expandFilePaths(paths);

    if (files.length === 0) {
        console.error("Error: No TypeScript files found");
        process.exit(1);
    }

    // First pass: Look for createProtobufSpec calls
    for (const file of files) {
        const hasCreateProtobuf = await checkForCreateProtobuf(file);

        if (hasCreateProtobuf) {
            // Found createProtobufSpec, compile and execute
            const spec = await compileAndExecuteProtobuf(file);
            if (spec) {
                outputSpec(spec, format);
                return; // Exit after first match
            }
        }
    }

    // Second pass: Generate from exported types
    const spec = await generateFromTypes(files);
    if (spec) {
        outputSpec(spec, format);
    } else {
        console.error("Error: No createProtobufSpec calls found and no exported types to generate from");
        process.exit(1);
    }
}

/**
 * Check if a file contains a createProtobufSpec call.
 */
async function checkForCreateProtobuf(filePath: string): Promise<boolean> {
    const content = await Bun.file(filePath).text();
    return content.includes("createProtobufSpec") || content.includes("createProtobufModel");
}

/**
 * Compile and execute a file containing createProtobufSpec.
 */
async function compileAndExecuteProtobuf(filePath: string): Promise<any> {
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
 * Generate Protobuf spec from exported types.
 */
async function generateFromTypes(files: string[]): Promise<any> {
    const project = new Project({
        skipAddingFilesFromTsConfig: true,
    });

    // Add all files to the project
    const sourceFiles = files.map((f) => project.addSourceFileAtPath(f));

    // Collect all exported type aliases and interfaces
    const exportedTypes: { name: string; file: string; content: string }[] = [];

    for (const sourceFile of sourceFiles) {
        const filePath = sourceFile.getFilePath();
        const fileContent = sourceFile.getFullText();

        // Get exported type aliases
        sourceFile.getTypeAliases().forEach((typeAlias: any) => {
            if (typeAlias.isExported()) {
                exportedTypes.push({ name: typeAlias.getName(), file: filePath, content: fileContent });
            }
        });

        // Get exported interfaces
        sourceFile.getInterfaces().forEach((iface: any) => {
            if (iface.isExported()) {
                exportedTypes.push({ name: iface.getName(), file: filePath, content: fileContent });
            }
        });
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

    // Create a temporary file with all types inline
    const tmpDir = resolve(process.cwd(), ".tmp", "cli-protobuf-types-" + Date.now());
    await mkdir(tmpDir, { recursive: true });

    try {
        const tmpFile = resolve(tmpDir, "source.ts");

        // Collect all unique file contents
        const uniqueFiles = new Map<string, string>();
        exportedTypes.forEach((t: any) => {
            if (!uniqueFiles.has(t.file)) {
                uniqueFiles.set(t.file, t.content);
            }
        });

        // Inline all types from all files
        const typeDefinitions = Array.from(uniqueFiles.values()).join("\n\n");
        const typeList = exportedTypes.map((t) => t.name).join(", ");

        // Calculate relative path from tmpFile to protobuf
        const protobufPath = resolve(import.meta.dir, "../protobuf/index.ts");
        const relativeWizPath = relative(dirname(tmpFile), protobufPath).replace(/\\/g, "/");
        const wizImport = relativeWizPath.startsWith(".") ? relativeWizPath : `./${relativeWizPath}`;

        const packageName = packageJson.name || "api";

        const source = `
${typeDefinitions}

import { createProtobufModel } from "${wizImport}";

export const model = createProtobufModel<[${typeList}]>();
        `;

        await writeFile(tmpFile, source);

        // Build with wiz plugin
        const outDir = resolve(tmpDir, "out");
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
            console.error("Build logs:", build.logs);
            return null;
        }

        // Import the generated model
        const outFile = resolve(outDir, "source.js");
        const module = await import(outFile);

        if (!module.model || !module.model.messages) {
            return null;
        }

        // Add package name from package.json if not set
        if (!module.model.package) {
            module.model.package = packageName;
        }

        return module.model;
    } finally {
        // Clean up tmp directory
        await Bun.$`rm -rf ${tmpDir}`.quiet();
    }
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
