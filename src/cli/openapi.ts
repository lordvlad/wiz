#!/usr/bin/env bun
import { mkdir, writeFile } from "fs/promises";
import { dirname, relative, resolve } from "path";
import { Project } from "ts-morph";

import { namedTypeToIrDefinition } from "../ir/converters/ts-to-ir";
import { irToOpenApiSchemas } from "../ir/generators/ir-to-openapi";
import type { IRSchema } from "../ir/types";
import wizPlugin from "../plugin/index";
import { expandFilePaths, findNearestPackageJson, readPackageJson, DebugLogger } from "./utils";

type Format = "json" | "yaml";

interface OpenApiOptions {
    format?: Format;
    debug?: boolean;
}

/**
 * Generate OpenAPI spec from TypeScript files.
 */
export async function generateOpenApi(paths: string[], options: OpenApiOptions = {}): Promise<void> {
    const format = options.format || "yaml";
    const debug = new DebugLogger(options.debug || false);

    debug.group("Command Arguments");
    debug.log("Command: openapi");
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

    // First pass: Look for createOpenApi calls
    debug.group("Searching for createOpenApi calls");
    for (const file of files) {
        const hasCreateOpenApi = await checkForCreateOpenApi(file);
        debug.log(`File: ${file}`, { hasCreateOpenApi });

        if (hasCreateOpenApi) {
            // Found createOpenApi, compile and execute
            debug.log("Found createOpenApi call, compiling and executing...");
            const spec = await compileAndExecuteOpenApi(file, debug);
            if (spec) {
                debug.group("OpenAPI Spec Generated");
                debug.log("Spec version:", spec.openapi);
                debug.log("Spec info:", spec.info);
                if (spec.paths) {
                    debug.log("Number of paths:", Object.keys(spec.paths).length);
                }
                if (spec.components?.schemas) {
                    debug.log("Number of schemas:", Object.keys(spec.components.schemas).length);
                }
                outputSpec(spec, format);
                return; // Exit after first match
            }
        }
    }

    // Second pass: Try to generate from JSDoc tags
    debug.group("Searching for JSDoc tags");
    const jsdocSpec = await generateFromJSDocTags(files, debug);
    if (jsdocSpec) {
        debug.group("OpenAPI Spec Generated from JSDoc");
        debug.log("Spec version:", jsdocSpec.openapi);
        debug.log("Spec info:", jsdocSpec.info);
        if (jsdocSpec.paths) {
            debug.log("Number of paths:", Object.keys(jsdocSpec.paths).length);
        }
        if (jsdocSpec.components?.schemas) {
            debug.log("Number of schemas:", Object.keys(jsdocSpec.components.schemas).length);
        }
        outputSpec(jsdocSpec, format);
        return;
    }

    // Third pass: Generate from exported types (schema-only)
    debug.group("Generating from exported types");
    const spec = await generateFromTypes(files, debug);
    if (spec) {
        debug.group("OpenAPI Spec Generated from Types");
        debug.log("Spec version:", spec.openapi);
        debug.log("Spec info:", spec.info);
        if (spec.components?.schemas) {
            debug.log("Number of schemas:", Object.keys(spec.components.schemas).length);
        }
        outputSpec(spec, format);
    } else {
        console.error("Error: No createOpenApi calls found, no JSDoc tags, and no exported types to generate from");
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
 * This function builds the file directly without copying to preserve import context.
 */
async function compileAndExecuteOpenApi(filePath: string, debug: DebugLogger): Promise<any> {
    // Create temporary directory for output only
    const tmpDir = resolve(process.cwd(), ".tmp", "cli-openapi-" + Date.now());
    await mkdir(tmpDir, { recursive: true });

    try {
        const outDir = resolve(tmpDir, "out");

        // Build with wiz plugin directly from the source file location
        // This preserves import resolution context
        const build = await Bun.build({
            entrypoints: [filePath],
            outdir: outDir,
            throw: false,
            minify: false,
            format: "esm",
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
        const outFileName = filePath.split("/").pop()?.replace(/\.ts$/, ".js") || "source.js";
        const outFile = resolve(outDir, outFileName);
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
 * Generate OpenAPI spec from JSDoc tags on functions using direct IR conversion.
 * This approach avoids the temporary file + build step, preventing import issues.
 */
async function generateFromJSDocTags(files: string[], debug: DebugLogger): Promise<any> {
    const project = new Project({
        skipAddingFilesFromTsConfig: true,
    });

    // Add all files to the project
    const sourceFiles = files.map((f) => project.addSourceFileAtPath(f));

    // Collect all exported types with their ts-morph types
    const exportedTypes: { name: string; type: any; file: string }[] = [];
    let hasJSDocTags = false;

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

        // Look for functions with @openApi JSDoc tag
        const functions = [
            ...sourceFile.getFunctions(),
            ...sourceFile.getVariableDeclarations().filter((v: any) => {
                const init = v.getInitializer();
                return init && (init.getKind() === 218 || init.getKind() === 217); // ArrowFunction or FunctionExpression
            }),
        ];

        for (const func of functions) {
            const jsDocs = (func as any).getJsDocs?.() || [];
            for (const jsDoc of jsDocs) {
                const tags = jsDoc.getTags?.() || [];
                const hasOpenApiTag = tags.some((tag: any) => tag.getTagName() === "openApi");
                if (hasOpenApiTag) {
                    debug.log(`Found @openApi JSDoc tag in file`, { file: filePath });
                    hasJSDocTags = true;
                    break;
                }
            }
        }
    }

    debug.log(`Total exported types: ${exportedTypes.length}`);
    debug.log(`Has @openApi tags: ${hasJSDocTags}`);

    // If no JSDoc tags found, return null
    if (!hasJSDocTags) {
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

    // For JSDoc-based generation, we still need to use the build approach
    // because the path operations need to be extracted by the transform
    // This is acceptable because we have validated JSDoc tags exist
    // TODO: Extract path operation logic from transform to make this fully build-free

    // Create a temporary file with all types inline
    const tmpDir = resolve(process.cwd(), ".tmp", "cli-openapi-jsdoc-" + Date.now());
    await mkdir(tmpDir, { recursive: true });

    try {
        const tmpFile = resolve(tmpDir, "source.ts");

        // Get source file contents
        const sourceContents = sourceFiles.map((sf) => sf.getFullText());
        const allContent = sourceContents.join("\n\n");
        const typeList = exportedTypes.map((t) => t.name).join(", ");

        // Calculate relative path from tmpFile to openApiSchema
        const openApiSchemaPath = resolve(import.meta.dir, "../openApiSchema/index.ts");
        const relativeWizPath = relative(dirname(tmpFile), openApiSchemaPath).replace(/\\/g, "/");
        const wizImport = relativeWizPath.startsWith(".") ? relativeWizPath : `./${relativeWizPath}`;

        const source = `
${allContent}

import { createOpenApi } from "${wizImport}";

export const spec = createOpenApi<[${typeList || "never"}], "3.0">({
    info: {
        title: "${packageJson.name || "API"}",
        version: "${packageJson.version || "1.0.0"}",
        ${packageJson.description ? `description: "${packageJson.description}",` : ""}
    }
});
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

        // Import the generated spec
        const outFile = resolve(outDir, "source.js");
        const module = await import(outFile);

        if (!module.spec || !module.spec.openapi) {
            return null;
        }

        return module.spec;
    } finally {
        // Clean up tmp directory
        await Bun.$`rm -rf ${tmpDir}`.quiet();
    }
}

/**
 * Generate OpenAPI spec from exported types using direct IR conversion.
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
    };

    // Generate OpenAPI schemas from IR
    const schemas = irToOpenApiSchemas(irSchema, {
        version: "3.0",
        unionStyle: "oneOf",
    });

    // Create full OpenAPI spec
    const spec: any = {
        openapi: "3.0.3",
        info: {
            title: packageJson.name || "API",
            version: packageJson.version || "1.0.0",
        },
        paths: {},
        components: {
            schemas,
        },
    };

    if (packageJson.description) {
        spec.info.description = packageJson.description;
    }

    return spec;
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
