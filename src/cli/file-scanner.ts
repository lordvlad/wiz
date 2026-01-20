/**
 * Unified file scanner for CLI commands
 *
 * This module provides a single-pass file scanning utility that collects all necessary
 * information from TypeScript files, including:
 * - Type aliases and interfaces (with export status)
 * - Special function calls (createOpenApi, createProtobuf, etc.)
 * - JSDoc tags for API endpoints
 *
 * This eliminates the need for multiple passes over the same files.
 */
import { Project, SyntaxKind, type SourceFile, type Type } from "ts-morph";

import { extractOpenApiFromJSDoc } from "../plugin/openApiSchema/codegen";
import type { DebugLogger } from "./utils";

/**
 * Information about a type or interface found during scanning
 */
export interface ScannedType {
    name: string;
    type: Type; // ts-morph Type object
    file: string;
    isExported: boolean;
}

/**
 * Information about a special function call found during scanning
 */
export interface ScannedFunctionCall {
    functionName: string;
    file: string;
    hasCall: boolean;
}

/**
 * Information about a JSDoc-based API endpoint
 */
export interface ScannedJSDocEndpoint {
    method: string;
    path: string;
    metadata: any;
    file: string;
}

/**
 * Results from scanning a set of files
 */
export interface ScanResult {
    /** All types and interfaces found (exported and non-exported) */
    types: ScannedType[];
    /** Map of function names to files that contain calls to them */
    functionCalls: Map<string, string[]>;
    /** JSDoc-based API endpoints found */
    jsdocEndpoints: ScannedJSDocEndpoint[];
    /** The ts-morph Project used for scanning */
    project: Project;
    /** The source files in the project */
    sourceFiles: SourceFile[];
}

/**
 * Options for file scanning
 */
export interface ScanOptions {
    /** List of function names to look for (e.g., ["createOpenApi", "createProtobuf"]) */
    functionNames?: string[];
    /** Whether to extract JSDoc API endpoints */
    extractJSDoc?: boolean;
    /** Debug logger for detailed output */
    debug?: DebugLogger;
}

/**
 * Scan files once and collect all necessary information
 */
export async function scanFiles(files: string[], options: ScanOptions = {}): Promise<ScanResult> {
    const { functionNames = [], extractJSDoc = false, debug } = options;

    const project = new Project({
        skipAddingFilesFromTsConfig: true,
    });

    debug?.group("Unified File Scanning");
    debug?.log(`Scanning ${files.length} file(s)`);
    debug?.log(`Looking for function calls: ${functionNames.join(", ") || "none"}`);
    debug?.log(`Extract JSDoc endpoints: ${extractJSDoc}`);

    // Add all files to the project
    const sourceFiles = files.map((f) => project.addSourceFileAtPath(f));

    const types: ScannedType[] = [];
    const functionCalls = new Map<string, string[]>();
    const jsdocEndpoints: ScannedJSDocEndpoint[] = [];

    const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "trace"]);

    for (const sourceFile of sourceFiles) {
        const filePath = sourceFile.getFilePath();

        // Collect type aliases
        sourceFile.getTypeAliases().forEach((typeAlias) => {
            const name = typeAlias.getName();
            const isExported = typeAlias.isExported();
            types.push({
                name,
                type: typeAlias.getType(),
                file: filePath,
                isExported,
            });
            debug?.log(`Found type: ${name}`, { file: filePath, exported: isExported });
        });

        // Collect interfaces
        sourceFile.getInterfaces().forEach((iface) => {
            const name = iface.getName();
            const isExported = iface.isExported();
            types.push({
                name,
                type: iface.getType(),
                file: filePath,
                isExported,
            });
            debug?.log(`Found interface: ${name}`, { file: filePath, exported: isExported });
        });

        // Check for function calls (simple string-based check for performance)
        if (functionNames.length > 0) {
            const content = sourceFile.getFullText();
            for (const funcName of functionNames) {
                if (content.includes(funcName)) {
                    if (!functionCalls.has(funcName)) {
                        functionCalls.set(funcName, []);
                    }
                    functionCalls.get(funcName)!.push(filePath);
                    debug?.log(`Found ${funcName} call in ${filePath}`);
                }
            }
        }

        // Extract JSDoc endpoints if requested
        if (extractJSDoc) {
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
                    debug?.log(
                        `Warning: Function with @openApi tag at ${filePath}:${func.getStartLineNumber()} is missing @path tag`,
                    );
                    continue;
                }

                // Default method to GET if not specified
                const method = metadata.method || "get";

                // Validate method
                if (!HTTP_METHODS.has(method)) {
                    debug?.log(
                        `Warning: Invalid HTTP method '${method}' at ${filePath}:${func.getStartLineNumber()}. Using GET instead.`,
                    );
                }

                jsdocEndpoints.push({
                    method: HTTP_METHODS.has(method) ? method : "get",
                    path: metadata.path,
                    metadata,
                    file: filePath,
                });

                debug?.log(`Found @openApi endpoint: ${method.toUpperCase()} ${metadata.path}`, { file: filePath });
            }
        }
    }

    debug?.log(`Scan complete: ${types.length} types, ${jsdocEndpoints.length} JSDoc endpoints`);

    return {
        types,
        functionCalls,
        jsdocEndpoints,
        project,
        sourceFiles,
    };
}

/**
 * Get only exported types from scan results
 */
export function getExportedTypes(scanResult: ScanResult): ScannedType[] {
    return scanResult.types.filter((t) => t.isExported);
}

/**
 * Get types by names (useful for finding types referenced in JSDoc)
 */
export function getTypesByNames(scanResult: ScanResult, names: Set<string>): ScannedType[] {
    return scanResult.types.filter((t) => names.has(t.name));
}

/**
 * Check if a specific function call was found
 */
export function hasFunctionCall(scanResult: ScanResult, functionName: string): boolean {
    return scanResult.functionCalls.has(functionName);
}

/**
 * Get files that contain a specific function call
 */
export function getFilesWithFunctionCall(scanResult: ScanResult, functionName: string): string[] {
    return scanResult.functionCalls.get(functionName) || [];
}
