/**
 * OpenAPI to TypeScript client generator
 */
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

    // Generate API client
    const api = generateApiClient(spec, options);

    return { models, api };
}

/**
 * Generate API client code
 */
function generateApiClient(spec: OpenApiSpec, options: ClientGeneratorOptions): string {
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

    let output = "";

    // Generate configuration interface
    output += generateConfigInterface();
    output += "\n\n";

    // Generate client class
    output += generateClientClass(operations, defaultBaseUrl);

    return output;
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
function generateConfigInterface(): string {
    return `export interface ApiConfig {
  baseUrl?: string;
  headers?: Record<string, string>;
}

let globalConfig: ApiConfig = {};

export function setApiConfig(config: ApiConfig): void {
  globalConfig = { ...globalConfig, ...config };
}

export function getApiConfig(): ApiConfig {
  return globalConfig;
}`;
}

/**
 * Generate client class with all API methods
 */
function generateClientClass(operations: OperationInfo[], defaultBaseUrl: string): string {
    let output = "export const api = {\n";

    for (const op of operations) {
        output += generateMethod(op, defaultBaseUrl);
        output += ",\n";
    }

    output += "};\n";
    return output;
}

/**
 * Generate a single API method
 */
function generateMethod(op: OperationInfo, defaultBaseUrl: string): string {
    const methodName = getMethodName(op);
    const { pathParams, queryParams, hasRequestBody } = analyzeParameters(op);

    // Generate parameter types
    const paramTypes = generateParameterTypes(op, pathParams, queryParams);

    // Generate method signature
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

    const signature = `${methodName}(${params.join(", ")})`;

    // Generate JSDoc
    let jsdoc = "";
    if (op.summary || op.description) {
        jsdoc = "  /**\n";
        if (op.summary) {
            jsdoc += `   * ${op.summary}\n`;
        }
        if (op.description && op.description !== op.summary) {
            jsdoc += `   * ${op.description}\n`;
        }
        jsdoc += "   */\n";
    }

    // Generate method body
    const body = generateMethodBody(op, pathParams, queryParams, hasRequestBody, defaultBaseUrl);

    return `${paramTypes}${jsdoc}  async ${signature}: Promise<Response> ${body}`;
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
function generateParameterTypes(op: OperationInfo, pathParams: any[], queryParams: any[]): string {
    let output = "";

    // Generate path params type
    if (pathParams.length > 0) {
        const typeName = getPathParamsTypeName(op);
        const xTypeName = getXTypeName(pathParams, "path");

        output += `  type ${typeName} = {\n`;
        for (const param of pathParams) {
            const required = param.required ? "" : "?";
            const type = getTypeFromSchema(param.schema);
            output += `    ${param.name}${required}: ${type};\n`;
        }
        output += "  };\n\n";
    }

    // Generate query params type
    if (queryParams.length > 0) {
        const typeName = getQueryParamsTypeName(op);
        const xTypeName = getXTypeName(queryParams, "query");

        output += `  type ${typeName} = {\n`;
        for (const param of queryParams) {
            const required = param.required ? "" : "?";
            const type = getTypeFromSchema(param.schema);
            output += `    ${param.name}${required}: ${type};\n`;
        }
        output += "  };\n\n";
    }

    return output;
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
 * Get x-type-name from parameters if available
 */
function getXTypeName(params: any[], paramType: string): string | undefined {
    for (const param of params) {
        if (param["x-type-name"]) {
            return param["x-type-name"];
        }
    }
    return undefined;
}

/**
 * Get request body type
 */
function getRequestBodyType(op: OperationInfo): string {
    if (!op.requestBody?.content) {
        return "any";
    }

    const contentTypes = Object.keys(op.requestBody.content);
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
 * Generate method body
 */
function generateMethodBody(
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
    lines.push("    return fetch(fullUrl, options);");
    lines.push("  }");

    return lines.join("\n");
}
