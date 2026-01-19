/**
 * Helper functions for OpenAPI client template generation
 * These functions extract and analyze OpenAPI specifications
 */
import type { OpenApiSpec } from "../openapi-ir";

export interface OperationInfo {
    operationId?: string;
    method: string;
    path: string;
    parameters?: any[];
    requestBody?: any;
    responses?: Record<string, any>;
    tags?: string[];
    summary?: string;
    description?: string;
    deprecated?: boolean;
}

/**
 * Extract operations from OpenAPI spec
 */
export function extractOperations(spec: OpenApiSpec): OperationInfo[] {
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
                    deprecated: operation.deprecated,
                });
            }
        }
    }

    return operations;
}

/**
 * Get method name from operation
 */
export function getMethodName(op: OperationInfo): string {
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
export function getDefaultBaseUrl(spec: OpenApiSpec): string {
    if (spec.servers && spec.servers.length > 0) {
        return spec.servers[0]?.url || "";
    }
    return "";
}

/**
 * Extract path, query parameters, and request body info from operation
 */
export function extractParameters(op: OperationInfo): {
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
 * Get path params type name
 */
export function getPathParamsTypeName(op: OperationInfo): string {
    const methodName = getMethodName(op);
    return `${methodName.charAt(0).toUpperCase()}${methodName.slice(1)}PathParams`;
}

/**
 * Get query params type name
 */
export function getQueryParamsTypeName(op: OperationInfo): string {
    const methodName = getMethodName(op);
    return `${methodName.charAt(0).toUpperCase()}${methodName.slice(1)}QueryParams`;
}

/**
 * Get request body type - returns null if no request body defined
 */
export function getRequestBodyType(op: OperationInfo): string | null {
    if (!op.requestBody?.content) {
        return null;
    }

    const jsonContent = op.requestBody.content["application/json"];

    if (jsonContent?.schema) {
        if (jsonContent.schema.$ref) {
            const refName = jsonContent.schema.$ref.split("/").pop();
            return refName || null;
        }
        return getTypeFromSchema(jsonContent.schema);
    }

    return null;
}

/**
 * Get response body type from the 200/201 response
 */
export function getResponseBodyType(op: OperationInfo): string | null {
    if (!op.responses) {
        return null;
    }

    // Try 200, 201, 202, 204 status codes in that order
    const successCodes = ["200", "201", "202", "204"];
    for (const code of successCodes) {
        const response = op.responses[code];
        if (response?.content?.["application/json"]?.schema) {
            const schema = response.content["application/json"].schema;
            if (schema.$ref) {
                const refName = schema.$ref.split("/").pop();
                return refName || null;
            }
            return getTypeFromSchema(schema);
        }
    }

    return null;
}

/**
 * Get TypeScript type from OpenAPI schema
 */
export function getTypeFromSchema(schema: any): string {
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
 * Check for duplicate method names
 */
export function checkDuplicateMethodNames(operations: OperationInfo[]): void {
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
}
