#!/usr/bin/env bun
import { mkdir, writeFile } from "fs/promises";
import { dirname, relative, resolve } from "path";
import { Project } from "ts-morph";

import wizPlugin from "../plugin/index";
import { expandFilePaths, findNearestPackageJson, readPackageJson } from "./utils";

type Format = "json" | "yaml";

interface OpenApiOptions {
    format?: Format;
}

/**
 * Generate OpenAPI spec from TypeScript files.
 */
export async function generateOpenApi(paths: string[], options: OpenApiOptions = {}): Promise<void> {
    const format = options.format || "yaml";

    if (paths.length === 0) {
        console.error("Error: No files or directories specified");
        process.exit(1);
    }

    const files = await expandFilePaths(paths);

    if (files.length === 0) {
        console.error("Error: No TypeScript files found");
        process.exit(1);
    }

    // First pass: Look for createOpenApi calls
    for (const file of files) {
        const hasCreateOpenApi = await checkForCreateOpenApi(file);

        if (hasCreateOpenApi) {
            // Found createOpenApi, compile and execute
            const spec = await compileAndExecuteOpenApi(file);
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
        console.error("Error: No createOpenApi calls found and no exported types to generate from");
        process.exit(1);
    }
}

/**
 * Check if a file contains a createOpenApi call.
 */
async function checkForCreateOpenApi(filePath: string): Promise<boolean> {
    const content = await Bun.file(filePath).text();
    return content.includes("createOpenApi");
}

/**
 * Compile and execute a file containing createOpenApi.
 */
async function compileAndExecuteOpenApi(filePath: string): Promise<any> {
    // Create temporary directory
    const tmpDir = resolve(process.cwd(), ".tmp", "cli-openapi-" + Date.now());
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
                    .map((l: any) => l.message)
                    .filter(Boolean)
                    .join("\n") || "Bundle failed";
            console.error("Build error:", message);
            return null;
        }

        // Import and find the exported spec
        const outFile = resolve(outDir, "source.js");
        const module = await import(outFile);

        // Look for createOpenApi exports (common names: spec, api, openapi, etc.)
        const possibleNames = ["spec", "api", "openapi", "openApi", "default"];
        for (const name of possibleNames) {
            if (module[name] && typeof module[name] === "object" && module[name].openapi) {
                return module[name];
            }
        }

        // Check all exports
        for (const key of Object.keys(module)) {
            const value = module[key];
            if (value && typeof value === "object" && value.openapi) {
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
 * Generate OpenAPI spec from exported types.
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
    const tmpDir = resolve(process.cwd(), ".tmp", "cli-openapi-types-" + Date.now());
    await mkdir(tmpDir, { recursive: true });

    try {
        const tmpFile = resolve(tmpDir, "source.ts");

        // Collect all unique file contents
        const uniqueFiles = new Map<string, string>();
        exportedTypes.forEach((t) => {
            if (!uniqueFiles.has(t.file)) {
                uniqueFiles.set(t.file, t.content);
            }
        });

        // Inline all types from all files
        const typeDefinitions = Array.from(uniqueFiles.values()).join("\n\n");
        const typeList = exportedTypes.map((t) => t.name).join(", ");

        // Calculate relative path from tmpFile to openApiSchema
        const openApiSchemaPath = resolve(import.meta.dir, "../openApiSchema/index.ts");
        const relativeWizPath = relative(dirname(tmpFile), openApiSchemaPath).replace(/\\/g, "/");
        const wizImport = relativeWizPath.startsWith(".") ? relativeWizPath : `./${relativeWizPath}`;

        const source = `
${typeDefinitions}

import { createOpenApiSchema } from "${wizImport}";

export const schema = createOpenApiSchema<[${typeList}], "3.0">();
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

        // Import the generated schema
        const outFile = resolve(outDir, "source.js");
        const module = await import(outFile);

        if (!module.schema || !module.schema.components) {
            return null;
        }

        // Create full OpenAPI spec
        const spec: any = {
            openapi: "3.0.3",
            info: {
                title: packageJson.name || "API",
                version: packageJson.version || "1.0.0",
            },
            paths: {},
            ...module.schema,
        };

        if (packageJson.description) {
            spec.info.description = packageJson.description;
        }

        return spec;
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
        console.log(Bun.YAML.stringify(spec));
    }
}
