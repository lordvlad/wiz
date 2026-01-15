#!/usr/bin/env bun
import { mkdir, writeFile } from "fs/promises";
import { dirname, relative, resolve } from "path";
import { Project, SyntaxKind } from "ts-morph";

import { namedTypeToIrDefinition } from "../ir/converters/ts-to-ir";
import { irToOpenApiSchemas } from "../ir/generators/ir-to-openapi";
import type { IRSchema } from "../ir/types";
import wizPlugin from "../plugin/index";
import { extractOpenApiFromJSDoc } from "../plugin/openApiSchema/codegen";
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
 * Generate OpenAPI spec from JSDoc tags on functions using direct extraction.
 * This approach extracts path operations directly from source files without requiring a build step.
 */
async function generateFromJSDocTags(files: string[], debug: DebugLogger): Promise<any> {
    const project = new Project({
        skipAddingFilesFromTsConfig: true,
    });

    // Add all files to the project
    const sourceFiles = files.map((f) => project.addSourceFileAtPath(f));

    // Collect all exported types with their ts-morph types
    const exportedTypes: { name: string; type: any; file: string }[] = [];
    const pathOperations: Array<{
        method: string;
        path: string;
        metadata: any;
    }> = [];

    const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "trace"]);

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

        // Extract path operations from functions with @openApi JSDoc tags
        const functionDeclarations = sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration);
        const functionExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.FunctionExpression);
        const variableStatements = sourceFile.getDescendantsOfKind(SyntaxKind.VariableStatement);

        const allFunctions = [...functionDeclarations, ...functionExpressions, ...variableStatements];

        for (const func of allFunctions) {
            const metadata = extractOpenApiFromJSDoc(func);

            if (!metadata.hasOpenApiTag) {
                continue;
            }

            // @path is required
            if (!metadata.path) {
                debug.log(
                    `Warning: Function with @openApi tag at ${filePath}:${func.getStartLineNumber()} is missing @path tag`,
                );
                continue;
            }

            // Default method to GET if not specified
            const method = metadata.method || "get";

            // Validate method
            if (!HTTP_METHODS.has(method)) {
                debug.log(
                    `Warning: Invalid HTTP method '${method}' at ${filePath}:${func.getStartLineNumber()}. Using GET instead.`,
                );
            }

            pathOperations.push({
                method: HTTP_METHODS.has(method) ? method : "get",
                path: metadata.path,
                metadata,
            });

            debug.log(`Found @openApi path operation: ${method.toUpperCase()} ${metadata.path}`, { file: filePath });
        }
    }

    debug.log(`Total exported types: ${exportedTypes.length}`);
    debug.log(`Total path operations: ${pathOperations.length}`);

    // If no JSDoc tags found, return null
    if (pathOperations.length === 0) {
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
