/**
 * OpenAPI to TypeScript client generator
 */
import { Project, VariableDeclarationKind, Scope, SourceFile } from "ts-morph";

import { generateModelsFromOpenApi, type OpenApiSpec } from "./openapi";

export interface ClientGeneratorOptions {
    includeTags?: boolean;
    tags?: Record<string, any>;
    disableWizTags?: boolean;
}

export interface GeneratedClient {
    models: string;
    api: string;
}

interface OperationInfo {
    operationId?: string;
    method: string;
    path: string;
    parameters?: any[];
    requestBody?: any;
    responses?: Record<string, any>;
    tags?: string[];
    summary?: string;
    description?: string;
}

/**
 * Generate TypeScript client from OpenAPI specification
 */
export function generateClientFromOpenApi(spec: OpenApiSpec, options: ClientGeneratorOptions = {}): GeneratedClient {
    // Generate models
    const modelsMap = generateModelsFromOpenApi(spec, options);
    const models = Array.from(modelsMap.values()).join("\n\n");

    // Generate API client using ts-morph
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile("api.ts", "");

    generateApiClient(sourceFile, spec, options);

    const api = sourceFile.getFullText();

    return { models, api };
}

/**
 * Generate API client code
 */
function generateApiClient(sourceFile: SourceFile, spec: OpenApiSpec, options: ClientGeneratorOptions): void {
    const operations = extractOperations(spec);

    // Check for duplicate method names
    const methodNames = new Set<string>();
    const duplicates: string[] = [];

    for (const op of operations) {
        const methodName = getMethodName(op);
        if (methodNames.has(methodName)) {
            duplicates.push(methodName);
        }
        methodNames.add(methodName);
    }

    if (duplicates.length > 0) {
        throw new Error(
            `Duplicate method names detected: ${duplicates.join(", ")}. Please specify unique operationIds in your OpenAPI spec.`,
        );
    }

    // Get default base URL
    const defaultBaseUrl = getDefaultBaseUrl(spec);

    // Generate configuration interface
    generateConfigInterface(sourceFile);

    // Generate client class
    generateClientClass(sourceFile, operations, defaultBaseUrl);
}

/**
 * Extract operations from OpenAPI spec
 */
function extractOperations(spec: OpenApiSpec): OperationInfo[] {
    const operations: OperationInfo[] = [];

    if (!spec.paths) {
        return operations;
    }

    for (const [path, pathItem] of Object.entries(spec.paths)) {
        const methods = ["get", "post", "put", "patch", "delete", "options", "head", "trace"];

        for (const method of methods) {
            const operation = (pathItem as any)[method];
            if (operation) {
                operations.push({
                    operationId: operation.operationId,
                    method: method.toUpperCase(),
                    path,
                    parameters: operation.parameters,
                    requestBody: operation.requestBody,
                    responses: operation.responses,
                    tags: operation.tags,
                    summary: operation.summary,
                    description: operation.description,
                });
            }
        }
    }

    return operations;
}

/**
 * Get method name from operation
 */
function getMethodName(op: OperationInfo): string {
    if (op.operationId) {
        return op.operationId;
    }

    // Fallback to methodPath pattern
    const pathParts = op.path
        .split("/")
        .filter(Boolean)
        .map((part) => {
            // Remove path parameters
            if (part.startsWith("{") && part.endsWith("}")) {
                return "";
            }
            // Remove special characters and capitalize
            return part.replace(/[^a-zA-Z0-9]/g, "");
        })
        .filter(Boolean);

    const pathName = pathParts
        .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
        .join("");

    return op.method.toLowerCase() + pathName.charAt(0).toUpperCase() + pathName.slice(1);
}

/**
 * Get default base URL from servers entry
 */
function getDefaultBaseUrl(spec: OpenApiSpec): string {
    if (spec.servers && spec.servers.length > 0) {
        return spec.servers[0].url || "";
    }
    return "";
}

/**
 * Generate configuration interface
 */
function generateConfigInterface(sourceFile: SourceFile): void {
    // Create ApiConfig interface
    sourceFile.addInterface({
        name: "ApiConfig",
        isExported: true,
        properties: [
            { name: "baseUrl", type: "string", hasQuestionToken: true },
            { name: "headers", type: "Record<string, string>", hasQuestionToken: true },
            { name: "fetch", type: "typeof fetch", hasQuestionToken: true },
        ],
    });

    // Create globalConfig variable
    sourceFile.addVariableStatement({
        declarationKind: VariableDeclarationKind.Let,
        declarations: [
            {
                name: "globalConfig",
                type: "ApiConfig",
                initializer: "{}",
            },
        ],
    });

    // Create setApiConfig function
    sourceFile.addFunction({
        name: "setApiConfig",
        isExported: true,
        parameters: [{ name: "config", type: "ApiConfig" }],
        returnType: "void",
        statements: "globalConfig = config;",
    });

    // Create getApiConfig function
    sourceFile.addFunction({
        name: "getApiConfig",
        isExported: true,
        returnType: "ApiConfig",
        statements: "return globalConfig;",
    });
}

/**
 * Generate client class with all API methods
 */
function generateClientClass(sourceFile: SourceFile, operations: OperationInfo[], defaultBaseUrl: string): void {
    // Build the object literal properties for each method
    const methods: any[] = [];

    for (const op of operations) {
        const method = generateMethod(sourceFile, op, defaultBaseUrl);
        methods.push(method);
    }

    // Create the api constant with object literal
    sourceFile.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        isExported: true,
        declarations: [
            {
                name: "api",
                initializer: (writer: any) => {
                    writer.block(() => {
                        for (let i = 0; i < methods.length; i++) {
                            const method = methods[i];
                            if (method) {
                                writer.write(method);
                                if (i < methods.length - 1) {
                                    writer.write(",");
                                }
                                writer.newLine();
                            }
                        }
                    });
                },
            },
        ],
    });
}

/**
 * Generate a single API method
 */
function generateMethod(sourceFile: SourceFile, op: OperationInfo, defaultBaseUrl: string): string {
    const methodName = getMethodName(op);
    const { pathParams, queryParams, hasRequestBody } = analyzeParameters(op);

    // Generate parameter type definitions first
    generateParameterTypes(sourceFile, op, pathParams, queryParams);

    // Build parameter list
    const params: string[] = [];
    if (pathParams.length > 0) {
        params.push(`pathParams: ${getPathParamsTypeName(op)}`);
    }
    if (queryParams.length > 0) {
        params.push(`queryParams?: ${getQueryParamsTypeName(op)}`);
    }
    if (hasRequestBody) {
        params.push(`requestBody: ${getRequestBodyType(op)}`);
    }
    params.push("init?: RequestInit");

    // Generate method body
    const methodBody = generateMethodBodyStatements(op, pathParams, queryParams, hasRequestBody, defaultBaseUrl);

    // Build JSDoc comment
    let jsDocText = "";
    if (op.summary || op.description) {
        jsDocText = "/**\n";
        if (op.summary) {
            jsDocText += ` * ${op.summary}\n`;
        }
        if (op.description && op.description !== op.summary) {
            jsDocText += ` * ${op.description}\n`;
        }
        jsDocText += " */\n";
    }

    // Return the method as a string to be inserted into the object literal
    return `${jsDocText}async ${methodName}(${params.join(", ")}): Promise<Response> ${methodBody}`;
}

/**
 * Analyze operation parameters
 */
function analyzeParameters(op: OperationInfo): {
    pathParams: any[];
    queryParams: any[];
    hasRequestBody: boolean;
} {
    const pathParams: any[] = [];
    const queryParams: any[] = [];

    if (op.parameters) {
        for (const param of op.parameters) {
            if (param.in === "path") {
                pathParams.push(param);
            } else if (param.in === "query") {
                queryParams.push(param);
            }
        }
    }

    const hasRequestBody = !!op.requestBody;

    return { pathParams, queryParams, hasRequestBody };
}

/**
 * Generate parameter type definitions
 */
function generateParameterTypes(
    sourceFile: SourceFile,
    op: OperationInfo,
    pathParams: any[],
    queryParams: any[],
): void {
    // Generate path params type
    if (pathParams.length > 0) {
        const typeName = getPathParamsTypeName(op);
        const properties = pathParams.map((param) => ({
            name: param.name,
            type: getTypeFromSchema(param.schema),
            hasQuestionToken: !param.required,
        }));

        sourceFile.addTypeAlias({
            name: typeName,
            type: (writer: any) => {
                writer.block(() => {
                    for (const prop of properties) {
                        writer.write(`${prop.name}${prop.hasQuestionToken ? "?" : ""}: ${prop.type};`);
                        writer.newLine();
                    }
                });
            },
        });
    }

    // Generate query params type
    if (queryParams.length > 0) {
        const typeName = getQueryParamsTypeName(op);
        const properties = queryParams.map((param) => ({
            name: param.name,
            type: getTypeFromSchema(param.schema),
            hasQuestionToken: !param.required,
        }));

        sourceFile.addTypeAlias({
            name: typeName,
            type: (writer: any) => {
                writer.block(() => {
                    for (const prop of properties) {
                        writer.write(`${prop.name}${prop.hasQuestionToken ? "?" : ""}: ${prop.type};`);
                        writer.newLine();
                    }
                });
            },
        });
    }
}

/**
 * Get path params type name
 */
function getPathParamsTypeName(op: OperationInfo): string {
    const methodName = getMethodName(op);
    return `${methodName.charAt(0).toUpperCase()}${methodName.slice(1)}PathParams`;
}

/**
 * Get query params type name
 */
function getQueryParamsTypeName(op: OperationInfo): string {
    const methodName = getMethodName(op);
    return `${methodName.charAt(0).toUpperCase()}${methodName.slice(1)}QueryParams`;
}

/**
 * Get request body type
 */
function getRequestBodyType(op: OperationInfo): string {
    if (!op.requestBody?.content) {
        return "any";
    }

    const jsonContent = op.requestBody.content["application/json"];

    if (jsonContent?.schema) {
        if (jsonContent.schema.$ref) {
            const refName = jsonContent.schema.$ref.split("/").pop();
            return refName || "any";
        }
        return getTypeFromSchema(jsonContent.schema);
    }

    return "any";
}

/**
 * Get TypeScript type from OpenAPI schema
 */
function getTypeFromSchema(schema: any): string {
    if (!schema) {
        return "any";
    }

    if (schema.$ref) {
        const refName = schema.$ref.split("/").pop();
        return refName || "any";
    }

    if (schema.type === "string") {
        return "string";
    }
    if (schema.type === "number" || schema.type === "integer") {
        return "number";
    }
    if (schema.type === "boolean") {
        return "boolean";
    }
    if (schema.type === "array") {
        const itemType = schema.items ? getTypeFromSchema(schema.items) : "any";
        return `${itemType}[]`;
    }
    if (schema.type === "object") {
        return "Record<string, any>";
    }

    return "any";
}

/**
 * Generate method body statements
 */
function generateMethodBodyStatements(
    op: OperationInfo,
    pathParams: any[],
    queryParams: any[],
    hasRequestBody: boolean,
    defaultBaseUrl: string,
): string {
    const lines: string[] = ["{"];

    // Get config
    lines.push("    const config = getApiConfig();");
    lines.push(`    const baseUrl = config.baseUrl || "${defaultBaseUrl}" || "";`);
    lines.push("    const fetchImpl = config.fetch || fetch;");

    // Build URL with path params
    let urlTemplate = op.path;
    if (pathParams.length > 0) {
        lines.push(`    let url = baseUrl + \`${urlTemplate}\`;`);
        // Replace path parameters
        for (const param of pathParams) {
            lines.push(`    url = url.replace("{${param.name}}", String(pathParams.${param.name}));`);
        }
    } else {
        lines.push(`    const url = baseUrl + "${urlTemplate}";`);
    }

    // Add query params
    if (queryParams.length > 0) {
        lines.push("    const searchParams = new URLSearchParams();");
        lines.push("    if (queryParams) {");
        for (const param of queryParams) {
            lines.push(`      if (queryParams.${param.name} !== undefined) {`);
            lines.push(`        searchParams.append("${param.name}", String(queryParams.${param.name}));`);
            lines.push("      }");
        }
        lines.push("    }");
        lines.push("    const queryString = searchParams.toString();");
        lines.push("    const fullUrl = queryString ? `${url}?${queryString}` : url;");
    } else {
        lines.push("    const fullUrl = url;");
    }

    // Build fetch options
    lines.push("    const options: RequestInit = {");
    lines.push(`      method: "${op.method}",`);
    lines.push("      headers: {");
    lines.push('        "Content-Type": "application/json",');
    lines.push("        ...config.headers,");
    lines.push("        ...init?.headers,");
    lines.push("      },");
    if (hasRequestBody) {
        lines.push("      body: JSON.stringify(requestBody),");
    }
    lines.push("      ...init,");
    lines.push("    };");

    // Make fetch call
    lines.push("    return fetchImpl(fullUrl, options);");
    lines.push("  }");

    return lines.join("\n");
}
