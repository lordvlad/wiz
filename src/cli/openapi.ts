#!/usr/bin/env bun
import { mkdir, writeFile } from "fs/promises";
import { dirname, relative, resolve } from "path";
import { Project, SyntaxKind } from "ts-morph";

import { namedTypeToIrDefinition } from "../ir/converters/ts-to-ir";
import { irToOpenApiSchemas } from "../ir/generators/ir-to-openapi";
import type { IRSchema } from "../ir/types";
import wizPlugin from "../plugin/index";
import { extractOpenApiFromJSDoc } from "../plugin/openApiSchema/codegen";
import { scanFiles, getExportedTypes, getFilesWithFunctionCall, getTypesByNames } from "./file-scanner";
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

    // Single pass: Scan all files once and collect all information
    debug.group("Scanning files (unified pass)");
    const scanResult = await scanFiles(files, {
        functionNames: ["createOpenApi"],
        extractJSDoc: true,
        debug,
    });

    debug.log(`Scan complete: ${scanResult.types.length} types, ${scanResult.jsdocEndpoints.length} JSDoc endpoints`);

    // Strategy 1: Look for createOpenApi calls
    const createOpenApiFiles = getFilesWithFunctionCall(scanResult, "createOpenApi");
    if (createOpenApiFiles.length > 0) {
        debug.group("Found createOpenApi calls, compiling and executing");
        const file = createOpenApiFiles[0];
        if (!file) {
            console.error("Error: Could not find file with createOpenApi call");
            process.exit(1);
        }
        debug.log(`Using file: ${file}`);

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
            return;
        }
    }

    // Strategy 2: Try to generate from JSDoc tags
    if (scanResult.jsdocEndpoints.length > 0) {
        debug.group("Generating from JSDoc tags");
        const jsdocSpec = await generateFromJSDocTags(scanResult, files, debug);
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
    }

    // Strategy 3: Generate from exported types (schema-only)
    const exportedTypes = getExportedTypes(scanResult);
    if (exportedTypes.length > 0) {
        debug.group("Generating from exported types");
        const spec = await generateFromTypes(scanResult, files, debug);
        if (spec) {
            debug.group("OpenAPI Spec Generated from Types");
            debug.log("Spec version:", spec.openapi);
            debug.log("Spec info:", spec.info);
            if (spec.components?.schemas) {
                debug.log("Number of schemas:", Object.keys(spec.components.schemas).length);
            }
            outputSpec(spec, format);
            return;
        }
    }

    console.error("Error: No createOpenApi calls found, no JSDoc tags, and no exported types to generate from");
    process.exit(1);
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
 * Generate OpenAPI spec from JSDoc tags using pre-scanned data.
 * This approach uses data already collected during the unified scan.
 */
async function generateFromJSDocTags(scanResult: any, files: string[], debug: DebugLogger): Promise<any> {
    // Use the already collected types and JSDoc endpoints from the scan
    const allTypes = scanResult.types;
    const pathOperations = scanResult.jsdocEndpoints;

    debug.log(`Total types: ${allTypes.length}`);
    debug.log(`Total path operations: ${pathOperations.length}`);

    // If no JSDoc tags found, return null
    if (pathOperations.length === 0) {
        return null;
    }

    // Collect type names referenced in JSDoc tags
    const referencedTypeNames = new Set<string>();
    for (const operation of pathOperations) {
        const metadata = operation.metadata;

        // Collect from request body
        if (metadata.requestBody?.type) {
            referencedTypeNames.add(metadata.requestBody.type);
        }

        // Collect from responses
        if (metadata.responses) {
            for (const response of metadata.responses) {
                if (response.type) {
                    referencedTypeNames.add(response.type);
                }
            }
        }
    }

    debug.log(`Referenced type names from JSDoc: ${Array.from(referencedTypeNames).join(", ")}`);

    // Filter types to include exported types + types referenced in JSDoc
    const relevantTypes = allTypes.filter((t: any) => t.isExported || referencedTypeNames.has(t.name));

    debug.log(`Total relevant types (exported + JSDoc-referenced): ${relevantTypes.length}`);

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
    const availableTypes = new Set<string>(relevantTypes.map((t: any) => t.name));
    const irSchema: IRSchema = {
        types: relevantTypes.map(({ name, type }: any) => namedTypeToIrDefinition(name, type, { availableTypes })),
    };

    // Generate OpenAPI schemas from IR
    const schemas = irToOpenApiSchemas(irSchema, {
        version: "3.0",
        unionStyle: "oneOf",
    });

    // Build paths from operations
    const paths: Record<string, Record<string, unknown>> = {};
    const availableSchemas = new Set(Object.keys(schemas));

    for (const operation of pathOperations) {
        const pathKey = operation.path;
        const method = operation.method.toLowerCase();

        if (!paths[pathKey]) {
            paths[pathKey] = {};
        }

        const operationObj: Record<string, unknown> = {};
        const metadata = operation.metadata;

        // Add summary and description
        if (metadata.summary) {
            operationObj.summary = metadata.summary;
        }
        if (metadata.description) {
            operationObj.description = metadata.description;
        }

        // Add operationId
        if (metadata.operationId) {
            operationObj.operationId = metadata.operationId;
        }

        // Add tags
        if (metadata.tags && metadata.tags.length > 0) {
            operationObj.tags = metadata.tags;
        }

        // Add deprecated flag
        if (metadata.deprecated) {
            operationObj.deprecated = true;
        }

        // Build parameters from JSDoc
        const parameters: unknown[] = [];

        // Add path parameters
        if (metadata.pathParams) {
            for (const [name, param] of Object.entries(metadata.pathParams)) {
                parameters.push({
                    name,
                    in: "path",
                    required: true,
                    schema: buildSchemaFromType((param as any).type),
                    ...((param as any).description ? { description: (param as any).description } : {}),
                });
            }
        }

        // Add query parameters
        if (metadata.queryParams) {
            for (const [name, param] of Object.entries(metadata.queryParams)) {
                parameters.push({
                    name,
                    in: "query",
                    required: (param as any).required !== false,
                    schema: buildSchemaFromType((param as any).type),
                    ...((param as any).description ? { description: (param as any).description } : {}),
                });
            }
        }

        // Add header parameters
        if (metadata.headers) {
            for (const [name, param] of Object.entries(metadata.headers)) {
                parameters.push({
                    name,
                    in: "header",
                    required: (param as any).required !== false,
                    schema: buildSchemaFromType((param as any).type),
                    ...((param as any).description ? { description: (param as any).description } : {}),
                });
            }
        }

        if (parameters.length > 0) {
            operationObj.parameters = parameters;
        }

        // Add request body
        if (metadata.requestBody) {
            const contentType = metadata.requestBody.contentType || "application/json";
            const schema = availableSchemas.has(metadata.requestBody.type)
                ? { $ref: `#/components/schemas/${metadata.requestBody.type}` }
                : buildSchemaFromType(metadata.requestBody.type);

            operationObj.requestBody = {
                required: true,
                content: {
                    [contentType]: {
                        schema,
                    },
                },
                ...(metadata.requestBody.description ? { description: metadata.requestBody.description } : {}),
            };
        }

        // Add responses
        if (metadata.responses && metadata.responses.length > 0) {
            const responses: Record<string, unknown> = {};
            for (const response of metadata.responses) {
                const responseObj: Record<string, unknown> = {
                    description: response.description || "Response",
                };

                if (response.type) {
                    const contentType = response.contentType || "application/json";
                    const schema = availableSchemas.has(response.type)
                        ? { $ref: `#/components/schemas/${response.type}` }
                        : buildSchemaFromType(response.type);

                    responseObj.content = {
                        [contentType]: {
                            schema,
                        },
                    };
                }

                responses[String(response.status)] = responseObj;
            }
            operationObj.responses = responses;
        } else {
            // Default response
            operationObj.responses = {
                "200": {
                    description: "Successful response",
                },
            };
        }

        paths[pathKey][method] = operationObj;
    }

    // Create full OpenAPI spec
    const spec: any = {
        openapi: "3.0.3",
        info: {
            title: packageJson.name || "API",
            version: packageJson.version || "1.0.0",
        },
        paths,
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
 * Build a simple schema object from a type string (for JSDoc-based parameters)
 */
function buildSchemaFromType(typeStr: string): Record<string, unknown> {
    const normalized = typeStr.trim().toLowerCase();

    switch (normalized) {
        case "string":
            return { type: "string" };
        case "number":
            return { type: "number" };
        case "integer":
        case "int":
            return { type: "integer" };
        case "boolean":
        case "bool":
            return { type: "boolean" };
        case "array":
            return { type: "array", items: {} };
        case "object":
            return { type: "object" };
        default:
            // If it's not a primitive, treat it as a custom type
            return { type: "object" };
    }
}

/**
 * Generate OpenAPI spec from exported types using pre-scanned data.
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
        console.log(Bun.YAML.stringify(spec, null, 4));
    }
}
