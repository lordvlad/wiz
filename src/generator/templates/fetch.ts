/**
 * Fetch client template
 *
 * Generates TypeScript client code using native fetch API.
 * Uses template strings instead of ts-morph for code generation.
 */
import { generateModelsFromOpenApi } from "../openapi-ir";
import {
    analyzeParameters,
    checkDuplicateMethodNames,
    extractOperations,
    getDefaultBaseUrl,
    getMethodName,
    getPathParamsTypeName,
    getQueryParamsTypeName,
    getRequestBodyType,
    getResponseBodyType,
    getTypeFromSchema,
    type OperationInfo,
} from "./helpers";
import type { WizGeneratorOutput, WizTemplateContext } from "./types";

/**
 * Generate model.ts content from OpenAPI spec
 */
export function templateModel(ctx: WizTemplateContext): string {
    const modelsMap = generateModelsFromOpenApi(ctx.spec, ctx.options);
    return Array.from(modelsMap.values()).join("\n\n");
}

/**
 * Generate api.ts content from OpenAPI spec using template strings
 */
export function templateAPI(ctx: WizTemplateContext): string {
    const operations = extractOperations(ctx.spec);
    checkDuplicateMethodNames(operations);

    const defaultBaseUrl = getDefaultBaseUrl(ctx.spec);
    const options = ctx.options || {};

    const parts: string[] = [];

    // Add React imports if needed
    if (options.reactQuery) {
        parts.push(`import { createContext, useContext } from "react";`);
        parts.push(`import type { ReactNode, ReactElement } from "react";`);
        parts.push("");
    }

    // Add validator imports if needed
    if (options.wizValidator) {
        parts.push(`import { createValidator } from "wiz/validator";`);
        parts.push("");

        // Add TypedResponse interface
        parts.push(`export interface TypedResponse<T> extends Response {`);
        parts.push(`  json(): Promise<T>;`);
        parts.push(`}`);
        parts.push("");

        // Collect types that need validators
        const typesToValidate = new Set<string>();
        for (const op of operations) {
            const requestBodyType = getRequestBodyType(op);
            if (requestBodyType && requestBodyType !== "any" && !requestBodyType.includes("[]")) {
                typesToValidate.add(requestBodyType);
            }
            const responseBodyType = getResponseBodyType(op);
            if (responseBodyType && responseBodyType !== "any" && !responseBodyType.includes("[]")) {
                typesToValidate.add(responseBodyType);
            }
        }

        // Generate validators
        for (const typeName of typesToValidate) {
            parts.push(`const validate${typeName} = createValidator<Models.${typeName}>();`);
        }
        parts.push("");

        // Generate createTypedResponse helper
        parts.push(
            `function createTypedResponse<T>(response: Response, validator: (value: unknown) => any[]): TypedResponse<T> {`,
        );
        parts.push(`  const originalJson = response.json.bind(response);`);
        parts.push(``);
        parts.push(`  return new Proxy(response, {`);
        parts.push(`    get(target, prop) {`);
        parts.push(`      if (prop === 'json') {`);
        parts.push(`        return async () => {`);
        parts.push(`          const data = await originalJson();`);
        parts.push(`          const errors = validator(data);`);
        parts.push(`          if (errors.length > 0) {`);
        parts.push(`            throw new TypeError("Invalid response body: " + JSON.stringify(errors));`);
        parts.push(`          }`);
        parts.push(`          return data as T;`);
        parts.push(`        };`);
        parts.push(`      }`);
        parts.push(`      return Reflect.get(target, prop);`);
        parts.push(`    }`);
        parts.push(`  }) as TypedResponse<T>;`);
        parts.push(`}`);
        parts.push("");
    }

    // Generate ApiConfig interface
    parts.push(`export interface ApiConfig {`);
    parts.push(`  baseUrl?: string;`);
    parts.push(`  headers?: Record<string, string>;`);
    parts.push(`  fetch?: typeof fetch;`);
    parts.push(`  bearerTokenProvider?: () => Promise<string>;`);
    parts.push(`}`);
    parts.push("");

    // Generate global config
    parts.push(`let globalConfig: ApiConfig = {};`);
    parts.push("");

    if (!options.reactQuery) {
        // Standard mode config functions
        parts.push(`export function setApiConfig(config: ApiConfig): void {`);
        parts.push(`  globalConfig = config;`);
        parts.push(`}`);
        parts.push("");
        parts.push(`export function getApiConfig(): ApiConfig {`);
        parts.push(`  return globalConfig;`);
        parts.push(`}`);
        parts.push("");
    } else {
        // React Query mode
        parts.push(`export function setGlobalApiConfig(config: ApiConfig): void {`);
        parts.push(`  globalConfig = config;`);
        parts.push(`}`);
        parts.push("");

        // Generate React context
        parts.push(`export const ApiContext = createContext<ApiConfig | undefined>(undefined);`);
        parts.push("");
        parts.push(`const defaultApiConfig: ApiConfig = { baseUrl: "${defaultBaseUrl}" };`);
        parts.push("");
        parts.push(`export function useApiConfig(): ApiConfig {`);
        parts.push(`  const config = useContext(ApiContext);`);
        parts.push(`  return config ?? defaultApiConfig;`);
        parts.push(`}`);
        parts.push("");

        // Generate ApiProvider
        parts.push(`export interface ApiProviderProps {`);
        parts.push(`  config?: Partial<ApiConfig>;`);
        parts.push(`  children: ReactNode;`);
        parts.push(`}`);
        parts.push("");
        parts.push(`export function ApiProvider({ config, children }: ApiProviderProps): ReactElement {`);
        parts.push(`  const mergedConfig: ApiConfig = {`);
        parts.push(`    ...defaultApiConfig,`);
        parts.push(`    ...config,`);
        parts.push(`    headers: {`);
        parts.push(`      ...(defaultApiConfig.headers ?? {}),`);
        parts.push(`      ...(config?.headers ?? {}),`);
        parts.push(`    },`);
        parts.push(`  };`);
        parts.push("");
        parts.push(`  return (`);
        parts.push(`    <ApiContext.Provider value={mergedConfig}>`);
        parts.push(`      {children}`);
        parts.push(`    </ApiContext.Provider>`);
        parts.push(`  );`);
        parts.push(`}`);
        parts.push("");
    }

    // Generate parameter types for all operations
    for (const op of operations) {
        const { pathParams, queryParams } = analyzeParameters(op);

        if (pathParams.length > 0) {
            const typeName = getPathParamsTypeName(op);
            parts.push(`export type ${typeName} = {`);
            for (const param of pathParams) {
                const optional = !param.required ? "?" : "";
                const type = getTypeFromSchema(param.schema);
                parts.push(`  ${param.name}${optional}: ${type};`);
            }
            parts.push(`};`);
            parts.push("");

            // Generate validator if needed
            if (options.wizValidator) {
                parts.push(`const validate${typeName} = createValidator<${typeName}>();`);
                parts.push("");
            }
        }

        if (queryParams.length > 0) {
            const typeName = getQueryParamsTypeName(op);
            parts.push(`export type ${typeName} = {`);
            for (const param of queryParams) {
                const optional = !param.required ? "?" : "";
                const type = getTypeFromSchema(param.schema);
                parts.push(`  ${param.name}${optional}: ${type};`);
            }
            parts.push(`};`);
            parts.push("");

            // Generate validator if needed
            if (options.wizValidator) {
                parts.push(`const validate${typeName} = createValidator<${typeName}>();`);
                parts.push("");
            }
        }
    }

    // Generate api object with methods
    parts.push(`export const api = {`);

    for (let i = 0; i < operations.length; i++) {
        const op = operations[i];
        if (op) {
            const methodCode = generateMethodCode(op, defaultBaseUrl, options);
            parts.push(methodCode);
            if (i < operations.length - 1) {
                parts.push(",");
            }
            parts.push("");
        }
    }

    parts.push(`};`);

    return parts.join("\n");
}

/**
 * Generate code for a single API method
 */
function generateMethodCode(op: OperationInfo, defaultBaseUrl: string, options: any): string {
    const methodName = getMethodName(op);
    const { pathParams, queryParams, hasRequestBody } = analyzeParameters(op);

    const lines: string[] = [];

    // JSDoc comment
    if (op.summary || op.description) {
        lines.push(`  /**`);
        if (op.summary) {
            lines.push(`   * ${op.summary}`);
        }
        if (op.description && op.description !== op.summary) {
            lines.push(`   * ${op.description}`);
        }
        lines.push(`   */`);
    }

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

    // Determine return type
    let returnType = "Promise<Response>";
    if (options.wizValidator) {
        const responseBodyType = getResponseBodyType(op);
        if (responseBodyType && responseBodyType !== "any" && !responseBodyType.includes("[]")) {
            returnType = `Promise<TypedResponse<Models.${responseBodyType}>>`;
        }
    }

    // Method signature
    lines.push(`  async ${methodName}(${params.join(", ")}): ${returnType} {`);

    // Method body
    const configAccess = options.reactQuery ? "globalConfig ?? {}" : "getApiConfig()";
    lines.push(`    const config = ${configAccess};`);
    lines.push(`    const baseUrl = config.baseUrl ?? "${defaultBaseUrl}";`);
    lines.push(`    const fetchImpl = config.fetch ?? fetch;`);

    // Validation for path params
    if (options.wizValidator && pathParams.length > 0) {
        const typeName = getPathParamsTypeName(op);
        lines.push(``);
        lines.push(`    // Validate path parameters`);
        lines.push(`    const pathParamsErrors = validate${typeName}(pathParams);`);
        lines.push(`    if (pathParamsErrors.length > 0) {`);
        lines.push(`      throw new TypeError("Invalid path parameters: " + JSON.stringify(pathParamsErrors));`);
        lines.push(`    }`);
    }

    // Validation for query params
    if (options.wizValidator && queryParams.length > 0) {
        const typeName = getQueryParamsTypeName(op);
        lines.push(``);
        lines.push(`    // Validate query parameters`);
        lines.push(`    if (queryParams) {`);
        lines.push(`      const queryParamsErrors = validate${typeName}(queryParams);`);
        lines.push(`      if (queryParamsErrors.length > 0) {`);
        lines.push(`        throw new TypeError("Invalid query parameters: " + JSON.stringify(queryParamsErrors));`);
        lines.push(`      }`);
        lines.push(`    }`);
    }

    // Validation for request body
    if (options.wizValidator && hasRequestBody) {
        const bodyType = getRequestBodyType(op);
        if (bodyType !== "any" && !bodyType.includes("[]")) {
            lines.push(``);
            lines.push(`    // Validate request body`);
            lines.push(`    const requestBodyErrors = validate${bodyType}(requestBody);`);
            lines.push(`    if (requestBodyErrors.length > 0) {`);
            lines.push(`      throw new TypeError("Invalid request body: " + JSON.stringify(requestBodyErrors));`);
            lines.push(`    }`);
        }
    }

    // Build URL
    lines.push(``);
    if (pathParams.length > 0) {
        lines.push(`    let url = baseUrl + \`${op.path}\`;`);
        for (const param of pathParams) {
            lines.push(`    url = url.replace("{${param.name}}", String(pathParams.${param.name}));`);
        }
    } else {
        lines.push(`    const url = baseUrl + "${op.path}";`);
    }

    // Add query params
    if (queryParams.length > 0) {
        lines.push(`    const searchParams = new URLSearchParams();`);
        lines.push(`    if (queryParams) {`);
        for (const param of queryParams) {
            lines.push(`      if (queryParams.${param.name} !== undefined) {`);
            lines.push(`        searchParams.append("${param.name}", String(queryParams.${param.name}));`);
            lines.push(`      }`);
        }
        lines.push(`    }`);
        lines.push(`    const queryString = searchParams.toString();`);
        lines.push(`    const fullUrl = queryString ? \`\${url}?\${queryString}\` : url;`);
    } else {
        lines.push(`    const fullUrl = url;`);
    }

    // Add bearer token if configured
    lines.push(``);
    lines.push(`    // Add bearer token if configured`);
    lines.push(`    if (config.bearerTokenProvider) {`);
    lines.push(`      const token = await config.bearerTokenProvider();`);
    lines.push(`      if (!init?.headers) {`);
    lines.push(`        init = { ...init, headers: {} };`);
    lines.push(`      }`);
    lines.push(`      (init.headers as Record<string, string>)["Authorization"] = \`Bearer \${token}\`;`);
    lines.push(`    }`);

    // Build fetch options
    lines.push(``);
    lines.push(`    const options: RequestInit = {`);
    lines.push(`      method: "${op.method}",`);
    lines.push(`      headers: {`);
    lines.push(`        "Content-Type": "application/json",`);
    lines.push(`        ...config.headers,`);
    lines.push(`        ...init?.headers,`);
    lines.push(`      },`);
    if (hasRequestBody) {
        lines.push(`      body: JSON.stringify(requestBody),`);
    }
    lines.push(`      ...init,`);
    lines.push(`    };`);

    // Make fetch call
    lines.push(``);
    lines.push(`    const response = await fetchImpl(fullUrl, options);`);

    // Wrap response with typed validation if needed
    if (options.wizValidator) {
        const responseBodyType = getResponseBodyType(op);
        if (responseBodyType && responseBodyType !== "any" && !responseBodyType.includes("[]")) {
            lines.push(``);
            lines.push(
                `    return createTypedResponse<Models.${responseBodyType}>(response, validate${responseBodyType});`,
            );
        } else {
            lines.push(``);
            lines.push(`    return response;`);
        }
    } else {
        lines.push(``);
        lines.push(`    return response;`);
    }

    lines.push(`  }`);

    return lines.join("\n");
}

/**
 * Main fetch template function
 * Returns file content mappings for the fetch client
 */
export default function template(ctx: WizTemplateContext): WizGeneratorOutput {
    return {
        "model.ts": templateModel(ctx),
        "api.ts": templateAPI(ctx),
    };
}
