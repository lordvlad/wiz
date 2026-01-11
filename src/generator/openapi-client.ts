/**
 * OpenAPI to TypeScript client generator
 */
import { CodeBlockWriter, Project, SourceFile, VariableDeclarationKind } from "ts-morph";

import { generateModelsFromOpenApi, type OpenApiSpec } from "./openapi-ir";

export interface ClientGeneratorOptions {
    includeTags?: boolean;
    tags?: Record<string, any>;
    disableWizTags?: boolean;
    wizValidator?: boolean;
    reactQuery?: boolean;
}

export interface GeneratedClient {
    models: string;
    api: string;
    queries?: string;
    mutations?: string;
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
    deprecated?: boolean;
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

    // Generate separate queries and mutations files if React Query is enabled
    let queries: string | undefined;
    let mutations: string | undefined;

    if (options.reactQuery) {
        const queriesFile = project.createSourceFile("queries.ts", "");
        const mutationsFile = project.createSourceFile("mutations.ts", "");

        generateReactQueryFiles(queriesFile, mutationsFile, spec, options);

        queries = queriesFile.getFullText();
        mutations = mutationsFile.getFullText();
    }

    return { models, api, queries, mutations };
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

    // Add React imports if React Query is enabled
    if (options.reactQuery) {
        sourceFile.addImportDeclaration({
            moduleSpecifier: "react",
            namedImports: ["createContext", "useContext"],
        });
        sourceFile.addImportDeclaration({
            moduleSpecifier: "react",
            namedImports: ["ReactNode", "ReactElement"],
            isTypeOnly: true,
        });
    }

    // Add validator import and TypedResponse interface if wiz validation is enabled
    if (options.wizValidator) {
        sourceFile.addImportDeclaration({
            moduleSpecifier: "wiz/validator",
            namedImports: ["createValidator"],
        });

        // Add TypedResponse interface
        sourceFile.addInterface({
            name: "TypedResponse",
            typeParameters: [{ name: "T" }],
            extends: ["Response"],
            isExported: true,
            methods: [
                {
                    name: "json",
                    returnType: "Promise<T>",
                },
            ],
        });

        // Collect all types that need validators (request bodies and response bodies)
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

        // Generate validators for these types
        for (const typeName of typesToValidate) {
            generateValidator(sourceFile, typeName, `Models.${typeName}`);
        }

        // Generate createTypedResponse helper function
        generateCreateTypedResponseHelper(sourceFile);
    }

    // Generate configuration interface
    generateConfigInterface(sourceFile, options);

    // Generate React Query context if enabled
    if (options.reactQuery) {
        generateReactQueryContext(sourceFile, defaultBaseUrl);
    }

    // Generate client class
    generateClientClass(sourceFile, operations, defaultBaseUrl, options);
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
        return spec.servers[0]?.url || "";
    }
    return "";
}

/**
 * Generate configuration interface
 */
function generateConfigInterface(sourceFile: SourceFile, options: ClientGeneratorOptions): void {
    // Create ApiConfig interface
    sourceFile.addInterface({
        name: "ApiConfig",
        isExported: true,
        properties: [
            { name: "baseUrl", type: "string", hasQuestionToken: true },
            { name: "headers", type: "Record<string, string>", hasQuestionToken: true },
            { name: "fetch", type: "typeof fetch", hasQuestionToken: true },
            {
                name: "bearerTokenProvider",
                type: "() => Promise<string>",
                hasQuestionToken: true,
            },
        ],
    });

    // Always create globalConfig (even in React Query mode, for direct api method calls)
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

    if (!options.reactQuery) {
        // Create setApiConfig and getApiConfig only in non-React Query mode
        sourceFile.addFunction({
            name: "setApiConfig",
            isExported: true,
            parameters: [{ name: "config", type: "ApiConfig" }],
            returnType: "void",
            statements: "globalConfig = config;",
        });

        sourceFile.addFunction({
            name: "getApiConfig",
            isExported: true,
            returnType: "ApiConfig",
            statements: "return globalConfig;",
        });
    } else {
        // In React Query mode, provide a function to set global config for direct API calls
        sourceFile.addFunction({
            name: "setGlobalApiConfig",
            isExported: true,
            parameters: [{ name: "config", type: "ApiConfig" }],
            returnType: "void",
            statements: "globalConfig = config;",
        });
    }
}

/**
 * Generate client class with all API methods
 */
function generateClientClass(
    sourceFile: SourceFile,
    operations: OperationInfo[],
    defaultBaseUrl: string,
    options: ClientGeneratorOptions,
): void {
    // Build the object literal properties for each method
    const methods: any[] = [];

    for (const op of operations) {
        const method = generateMethod(sourceFile, op, defaultBaseUrl, options);
        methods.push(method);
    }

    // Create the api constant with object literal
    sourceFile.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        isExported: true,
        declarations: [
            {
                name: "api",
                initializer: (writer: CodeBlockWriter) => {
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
function generateMethod(
    sourceFile: SourceFile,
    op: OperationInfo,
    defaultBaseUrl: string,
    options: ClientGeneratorOptions,
): string {
    const methodName = getMethodName(op);
    const { pathParams, queryParams, hasRequestBody } = analyzeParameters(op);

    // Generate parameter type definitions first
    generateParameterTypes(sourceFile, op, pathParams, queryParams, options);

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
    const methodBody = generateMethodBodyStatements(
        op,
        pathParams,
        queryParams,
        hasRequestBody,
        defaultBaseUrl,
        options,
    );

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

    // Determine return type
    let returnType = "Promise<Response>";
    if (options.wizValidator) {
        const responseBodyType = getResponseBodyType(op);
        if (responseBodyType && responseBodyType !== "any" && !responseBodyType.includes("[]")) {
            returnType = `Promise<TypedResponse<Models.${responseBodyType}>>`;
        }
    }

    // Return the method as a string to be inserted into the object literal
    return `${jsDocText}async ${methodName}(${params.join(", ")}): ${returnType} ${methodBody}`;
}

/**
 * Generate validator for a type
 */
function generateValidator(sourceFile: SourceFile, typeName: string, typeReference: string): void {
    sourceFile.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [
            {
                name: `validate${typeName}`,
                initializer: `createValidator<${typeReference}>()`,
            },
        ],
    });
}

/**
 * Generate createTypedResponse helper function
 */
function generateCreateTypedResponseHelper(sourceFile: SourceFile): void {
    sourceFile.addFunction({
        name: "createTypedResponse",
        typeParameters: [{ name: "T" }],
        parameters: [
            { name: "response", type: "Response" },
            { name: "validator", type: "(value: unknown) => any[]" },
        ],
        returnType: "TypedResponse<T>",
        statements: (writer: CodeBlockWriter) => {
            writer.writeLine("const originalJson = response.json.bind(response);");
            writer.blankLine();
            writer.writeLine("return new Proxy(response, {");
            writer.writeLine("  get(target, prop) {");
            writer.writeLine("    if (prop === 'json') {");
            writer.writeLine("      return async () => {");
            writer.writeLine("        const data = await originalJson();");
            writer.writeLine("        const errors = validator(data);");
            writer.writeLine("        if (errors.length > 0) {");
            writer.writeLine('          throw new TypeError("Invalid response body: " + JSON.stringify(errors));');
            writer.writeLine("        }");
            writer.writeLine("        return data as T;");
            writer.writeLine("      };");
            writer.writeLine("    }");
            writer.writeLine("    return Reflect.get(target, prop);");
            writer.writeLine("  }");
            writer.writeLine("}) as TypedResponse<T>;");
        },
    });
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
    options: ClientGeneratorOptions,
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
            isExported: true,
            type: (writer: CodeBlockWriter) => {
                writer.block(() => {
                    for (const prop of properties) {
                        writer.write(`${prop.name}${prop.hasQuestionToken ? "?" : ""}: ${prop.type};`);
                        writer.newLine();
                    }
                });
            },
        });

        // Generate validator if wizValidator is enabled
        if (options.wizValidator) {
            generateValidator(sourceFile, typeName, typeName);
        }
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
            isExported: true,
            type: (writer: CodeBlockWriter) => {
                writer.block(() => {
                    for (const prop of properties) {
                        writer.write(`${prop.name}${prop.hasQuestionToken ? "?" : ""}: ${prop.type};`);
                        writer.newLine();
                    }
                });
            },
        });

        // Generate validator if wizValidator is enabled
        if (options.wizValidator) {
            generateValidator(sourceFile, typeName, typeName);
        }
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
 * Get response body type from the 200/201 response
 */
function getResponseBodyType(op: OperationInfo): string | null {
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
    options: ClientGeneratorOptions,
): string {
    const lines: string[] = ["{"];

    // Get config - use globalConfig directly in React Query mode
    if (options.reactQuery) {
        lines.push("    const config = globalConfig ?? {};");
        lines.push(`    const baseUrl = config.baseUrl ?? "${defaultBaseUrl}";`);
        lines.push("    const fetchImpl = config.fetch ?? fetch;");
    } else {
        // Standard mode uses getApiConfig
        lines.push("    const config = getApiConfig();");
        lines.push(`    const baseUrl = config.baseUrl ?? "${defaultBaseUrl}";`);
        lines.push("    const fetchImpl = config.fetch ?? fetch;");
    }

    // Add validation for path params
    if (options.wizValidator && pathParams.length > 0) {
        const typeName = getPathParamsTypeName(op);
        lines.push("");
        lines.push(`    // Validate path parameters`);
        lines.push(`    const pathParamsErrors = validate${typeName}(pathParams);`);
        lines.push(`    if (pathParamsErrors.length > 0) {`);
        lines.push(`      throw new TypeError("Invalid path parameters: " + JSON.stringify(pathParamsErrors));`);
        lines.push(`    }`);
    }

    // Add validation for query params
    if (options.wizValidator && queryParams.length > 0) {
        const typeName = getQueryParamsTypeName(op);
        lines.push("");
        lines.push(`    // Validate query parameters`);
        lines.push(`    if (queryParams) {`);
        lines.push(`      const queryParamsErrors = validate${typeName}(queryParams);`);
        lines.push(`      if (queryParamsErrors.length > 0) {`);
        lines.push(`        throw new TypeError("Invalid query parameters: " + JSON.stringify(queryParamsErrors));`);
        lines.push(`      }`);
        lines.push(`    }`);
    }

    // Add validation for request body
    if (options.wizValidator && hasRequestBody) {
        const bodyType = getRequestBodyType(op);
        // Skip validation for array types and 'any' types
        if (bodyType !== "any" && !bodyType.includes("[]")) {
            lines.push("");
            lines.push(`    // Validate request body`);
            lines.push(`    const requestBodyErrors = validate${bodyType}(requestBody);`);
            lines.push(`    if (requestBodyErrors.length > 0) {`);
            lines.push(`      throw new TypeError("Invalid request body: " + JSON.stringify(requestBodyErrors));`);
            lines.push(`    }`);
        }
    }

    // Build URL with path params
    let urlTemplate = op.path;
    if (pathParams.length > 0) {
        lines.push("");
        lines.push(`    let url = baseUrl + \`${urlTemplate}\`;`);
        // Replace path parameters
        for (const param of pathParams) {
            lines.push(`    url = url.replace("{${param.name}}", String(pathParams.${param.name}));`);
        }
    } else {
        lines.push("");
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

    // Add bearer token if provider is configured
    lines.push("");
    lines.push("    // Add bearer token if configured");
    lines.push("    if (config.bearerTokenProvider) {");
    lines.push("      const token = await config.bearerTokenProvider();");
    lines.push("      if (!init?.headers) {");
    lines.push("        init = { ...init, headers: {} };");
    lines.push("      }");
    lines.push('      (init.headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;');
    lines.push("    }");

    // Build fetch options
    lines.push("");
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
    lines.push("");
    lines.push("    const response = await fetchImpl(fullUrl, options);");

    // Wrap response with typed validation if wizValidator is enabled
    if (options.wizValidator) {
        const responseBodyType = getResponseBodyType(op);
        // Skip validation for array types and 'any' types
        if (responseBodyType && responseBodyType !== "any" && !responseBodyType.includes("[]")) {
            lines.push("");
            lines.push(
                `    return createTypedResponse<Models.${responseBodyType}>(response, validate${responseBodyType});`,
            );
        } else {
            lines.push("");
            lines.push("    return response;");
        }
    } else {
        lines.push("");
        lines.push("    return response;");
    }

    lines.push("  }");

    return lines.join("\n");
}

/**
 * Generate React Query context
 */
function generateReactQueryContext(sourceFile: SourceFile, defaultBaseUrl: string): void {
    // Create ApiContext
    sourceFile.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        isExported: true,
        declarations: [
            {
                name: "ApiContext",
                initializer: `createContext<ApiConfig | undefined>(undefined)`,
            },
        ],
    });

    // Create default config constant
    sourceFile.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [
            {
                name: "defaultApiConfig",
                type: "ApiConfig",
                initializer: `{ baseUrl: "${defaultBaseUrl}" }`,
            },
        ],
    });

    // Create useApiConfig hook
    sourceFile.addFunction({
        name: "useApiConfig",
        isExported: true,
        returnType: "ApiConfig",
        statements: (writer: CodeBlockWriter) => {
            writer.writeLine("const config = useContext(ApiContext);");
            writer.writeLine("return config ?? defaultApiConfig;");
        },
    });

    // Create ApiProvider component
    sourceFile.addInterface({
        name: "ApiProviderProps",
        isExported: true,
        properties: [
            { name: "config", type: "Partial<ApiConfig>", hasQuestionToken: true },
            { name: "children", type: "ReactNode" },
        ],
    });

    sourceFile.addFunction({
        name: "ApiProvider",
        isExported: true,
        parameters: [{ name: "{ config, children }", type: "ApiProviderProps" }],
        returnType: "ReactElement",
        statements: (writer: CodeBlockWriter) => {
            writer.writeLine("const mergedConfig: ApiConfig = {");
            writer.writeLine("  ...defaultApiConfig,");
            writer.writeLine("  ...config,");
            writer.writeLine("  headers: {");
            writer.writeLine("    ...(defaultApiConfig.headers ?? {}),");
            writer.writeLine("    ...(config?.headers ?? {}),");
            writer.writeLine("  },");
            writer.writeLine("};");
            writer.writeLine("");
            writer.writeLine("return (");
            writer.writeLine("  <ApiContext.Provider value={mergedConfig}>");
            writer.writeLine("    {children}");
            writer.writeLine("  </ApiContext.Provider>");
            writer.writeLine(");");
        },
    });
}

/**
 * Determine if operation is a query (GET, HEAD, OPTIONS) or mutation
 */
function isQueryOperation(op: OperationInfo): boolean {
    return ["GET", "HEAD", "OPTIONS"].includes(op.method);
}

/**
 * Parse parameter string into name and type
 */
function parseParameter(param: string): { name: string; type: string } {
    const colonIndex = param.indexOf(":");
    if (colonIndex === -1) return { name: param, type: "any" };
    const name = param.substring(0, colonIndex).trim();
    const type = param.substring(colonIndex + 1).trim();
    return { name, type };
}

/**
 * Generate React Query helpers (query/mutation options and hooks)
 */
function generateReactQueryHelpers(
    sourceFile: SourceFile,
    operations: OperationInfo[],
    options: ClientGeneratorOptions,
): void {
    for (const op of operations) {
        const methodName = getMethodName(op);
        const isQuery = isQueryOperation(op);

        if (isQuery) {
            generateQueryOptions(sourceFile, op, methodName, options);
            generateQueryHook(sourceFile, op, methodName, options);
        } else {
            generateMutationOptions(sourceFile, op, methodName, options);
            generateMutationHook(sourceFile, op, methodName, options);
        }
    }
}

/**
 * Generate React Query files (queries.ts and mutations.ts)
 */
function generateReactQueryFiles(
    queriesFile: SourceFile,
    mutationsFile: SourceFile,
    spec: OpenApiSpec,
    options: ClientGeneratorOptions,
): void {
    const operations = extractOperations(spec);

    // Collect parameter type names that need to be imported
    const queryTypeImports = new Set<string>();
    const mutationTypeImports = new Set<string>();

    for (const op of operations) {
        const { pathParams, queryParams } = analyzeParameters(op);
        const isQuery = isQueryOperation(op);

        if (isQuery) {
            if (pathParams.length > 0) {
                queryTypeImports.add(getPathParamsTypeName(op));
            }
            if (queryParams.length > 0) {
                queryTypeImports.add(getQueryParamsTypeName(op));
            }
        } else {
            if (pathParams.length > 0) {
                mutationTypeImports.add(getPathParamsTypeName(op));
            }
            if (queryParams.length > 0) {
                mutationTypeImports.add(getQueryParamsTypeName(op));
            }
        }
    }

    // Add React Query import to queries file
    queriesFile.addImportDeclaration({
        moduleSpecifier: "@tanstack/react-query",
        namedImports: ["useQuery"],
    });

    // Add stable key helper function to queries file
    // This function serializes objects to JSON strings with sorted keys
    // so that {page: 0, limit: 1} and {limit: 1, page: 0} produce the same string
    queriesFile.addFunction({
        name: "stableKey",
        statements: (writer: CodeBlockWriter) => {
            writer.writeLine("if (obj === null || obj === undefined) return obj;");
            writer.writeLine("if (typeof obj !== 'object') return obj;");
            writer.writeLine("if (Array.isArray(obj)) {");
            writer.writeLine("  return JSON.stringify(obj.map(stableKey));");
            writer.writeLine("}");
            writer.writeLine("const sorted: Record<string, any> = {};");
            writer.writeLine("Object.keys(obj).sort().forEach(key => {");
            writer.writeLine("  sorted[key] = obj[key];");
            writer.writeLine("});");
            writer.writeLine("return JSON.stringify(sorted);");
        },
        parameters: [{ name: "obj", type: "any" }],
        returnType: "string | null | undefined",
    });

    // Add imports to queries file
    const queryApiImports = ["api"];
    if (queryTypeImports.size > 0) {
        queryApiImports.push(...Array.from(queryTypeImports));
    }
    queriesFile.addImportDeclaration({
        moduleSpecifier: "./api",
        namedImports: queryApiImports,
    });
    queriesFile.addImportDeclaration({
        moduleSpecifier: "./model",
        defaultImport: "* as Models",
        isTypeOnly: true,
    });

    // Add React Query import to mutations file
    mutationsFile.addImportDeclaration({
        moduleSpecifier: "@tanstack/react-query",
        namedImports: ["useMutation"],
    });

    // Add imports to mutations file
    const mutationApiImports = ["api"];
    if (mutationTypeImports.size > 0) {
        mutationApiImports.push(...Array.from(mutationTypeImports));
    }
    mutationsFile.addImportDeclaration({
        moduleSpecifier: "./api",
        namedImports: mutationApiImports,
    });
    mutationsFile.addImportDeclaration({
        moduleSpecifier: "./model",
        defaultImport: "* as Models",
        isTypeOnly: true,
    });

    // Generate query and mutation options/hooks in separate files
    for (const op of operations) {
        const methodName = getMethodName(op);
        const isQuery = isQueryOperation(op);

        if (isQuery) {
            generateQueryOptions(queriesFile, op, methodName, options);
            generateQueryHook(queriesFile, op, methodName, options);
        } else {
            generateMutationOptions(mutationsFile, op, methodName, options);
            generateMutationHook(mutationsFile, op, methodName, options);
        }
    }
}

/**
 * Generate query options method for GET/HEAD/OPTIONS operations
 */
function generateQueryOptions(
    sourceFile: SourceFile,
    op: OperationInfo,
    methodName: string,
    options: ClientGeneratorOptions,
): void {
    const { pathParams, queryParams } = analyzeParameters(op);
    const capitalizedMethodName = methodName.charAt(0).toUpperCase() + methodName.slice(1);

    // Build parameter list
    const params: string[] = [];
    const callParams: string[] = [];

    if (pathParams.length > 0) {
        params.push(`pathParams: ${getPathParamsTypeName(op)}`);
        callParams.push("pathParams");
    }
    if (queryParams.length > 0) {
        params.push(`queryParams?: ${getQueryParamsTypeName(op)}`);
        callParams.push("queryParams");
    }

    // Generate the query key with stable keys
    const keyParts: string[] = [`"${methodName}"`];
    if (pathParams.length > 0) {
        keyParts.push("stableKey(pathParams)");
    }
    if (queryParams.length > 0) {
        keyParts.push("stableKey(queryParams)");
    }

    // Determine return type
    const responseBodyType = getResponseBodyType(op);
    let dataType = "unknown";
    let shouldParseJson = true;

    // Note: We check for '[]' because getTypeFromSchema only generates Type[] format for arrays,
    // never Array<Type> or readonly Type[]. This is safe for the generated code.
    if (responseBodyType && responseBodyType !== "any" && !responseBodyType.includes("[]")) {
        dataType = `Models.${responseBodyType}`;
    } else if (!responseBodyType) {
        // No JSON response body type known, return Response directly
        dataType = "Response";
        shouldParseJson = false;
    }

    // Generate function
    sourceFile.addFunction({
        name: `get${capitalizedMethodName}QueryOptions`,
        isExported: true,
        parameters: params.map(parseParameter),
        returnType: `{ queryKey: unknown[]; queryFn: () => Promise<${dataType}> }`,
        statements: (writer: CodeBlockWriter) => {
            writer.writeLine(`return {`);
            writer.writeLine(`  queryKey: [${keyParts.join(", ")}],`);
            writer.writeLine(`  queryFn: async () => {`);
            writer.writeLine(`    const response = await api.${methodName}(${callParams.join(", ")});`);
            if (shouldParseJson) {
                if (dataType !== "unknown") {
                    writer.writeLine(`    return response.json() as Promise<${dataType}>;`);
                } else {
                    writer.writeLine(`    return response.json();`);
                }
            } else {
                writer.writeLine(`    return response;`);
            }
            writer.writeLine(`  },`);
            writer.writeLine(`};`);
        },
    });
}

/**
 * Generate custom query hook for GET/HEAD/OPTIONS operations
 */
function generateQueryHook(
    sourceFile: SourceFile,
    op: OperationInfo,
    methodName: string,
    options: ClientGeneratorOptions,
): void {
    const { pathParams, queryParams } = analyzeParameters(op);
    const capitalizedMethodName = methodName.charAt(0).toUpperCase() + methodName.slice(1);

    // Build parameter list
    const params: string[] = [];
    const callParams: string[] = [];

    if (pathParams.length > 0) {
        params.push(`pathParams: ${getPathParamsTypeName(op)}`);
        callParams.push("pathParams");
    }
    if (queryParams.length > 0) {
        params.push(`queryParams?: ${getQueryParamsTypeName(op)}`);
        callParams.push("queryParams");
    }
    params.push("options?: Omit<Parameters<typeof useQuery>[0], 'queryKey' | 'queryFn'> = {}");

    // Determine return type
    let dataType = "unknown";
    const responseBodyType = getResponseBodyType(op);
    if (responseBodyType && responseBodyType !== "any" && !responseBodyType.includes("[]")) {
        dataType = `Models.${responseBodyType}`;
    }

    // Add JSDoc
    const jsDocLines: string[] = [];
    if (op.summary) {
        jsDocLines.push(op.summary);
    }
    if (op.description && op.description !== op.summary) {
        jsDocLines.push(op.description);
    }
    if (op.deprecated) {
        jsDocLines.push("@deprecated");
    }

    const functionDef: any = {
        name: `use${capitalizedMethodName}`,
        isExported: true,
        parameters: params.map(parseParameter),
        statements: (writer: CodeBlockWriter) => {
            writer.writeLine(`const queryOptions = get${capitalizedMethodName}QueryOptions(${callParams.join(", ")});`);
            writer.writeLine(`return useQuery({ ...queryOptions, ...options });`);
        },
    };

    if (jsDocLines.length > 0) {
        functionDef.docs = [jsDocLines.join("\n")];
    }

    sourceFile.addFunction(functionDef);
}

/**
 * Generate mutation options method for POST/PUT/PATCH/DELETE operations
 */
function generateMutationOptions(
    sourceFile: SourceFile,
    op: OperationInfo,
    methodName: string,
    options: ClientGeneratorOptions,
): void {
    const { pathParams, queryParams, hasRequestBody } = analyzeParameters(op);
    const capitalizedMethodName = methodName.charAt(0).toUpperCase() + methodName.slice(1);

    // Build parameter types
    const variableTypes: string[] = [];
    if (pathParams.length > 0) {
        variableTypes.push(`pathParams: ${getPathParamsTypeName(op)}`);
    }
    if (queryParams.length > 0) {
        variableTypes.push(`queryParams?: ${getQueryParamsTypeName(op)}`);
    }
    if (hasRequestBody) {
        const bodyType = getRequestBodyType(op);
        // Request body types come from Models, so prefix them
        const prefixedBodyType = bodyType !== "any" && !bodyType.includes("[]") ? `Models.${bodyType}` : bodyType;
        variableTypes.push(`requestBody: ${prefixedBodyType}`);
    }

    // Determine return type
    let dataType = "unknown";
    const responseBodyType = getResponseBodyType(op);
    // Note: We check for '[]' because getTypeFromSchema only generates Type[] format for arrays,
    // never Array<Type> or readonly Type[]. This is safe for the generated code.
    if (responseBodyType && responseBodyType !== "any" && !responseBodyType.includes("[]")) {
        dataType = `Models.${responseBodyType}`;
    }

    const variablesType = variableTypes.length > 0 ? `{ ${variableTypes.join("; ")} }` : "void";

    // Generate function
    sourceFile.addFunction({
        name: `get${capitalizedMethodName}MutationOptions`,
        isExported: true,
        returnType: `{ mutationFn: (variables: ${variablesType}) => Promise<${dataType}> }`,
        statements: (writer: CodeBlockWriter) => {
            writer.writeLine(`return {`);
            writer.writeLine(`  mutationFn: async (variables: ${variablesType}) => {`);

            // Build call parameters
            const callParams: string[] = [];
            if (pathParams.length > 0) {
                callParams.push("variables.pathParams");
            }
            if (queryParams.length > 0) {
                callParams.push("variables.queryParams");
            }
            if (hasRequestBody) {
                callParams.push("variables.requestBody");
            }

            writer.writeLine(`    const response = await api.${methodName}(${callParams.join(", ")});`);
            if (dataType !== "unknown") {
                writer.writeLine(`    return response.json() as Promise<${dataType}>;`);
            } else {
                writer.writeLine(`    return response.json();`);
            }
            writer.writeLine(`  },`);
            writer.writeLine(`};`);
        },
    });
}

/**
 * Generate custom mutation hook for POST/PUT/PATCH/DELETE operations
 */
function generateMutationHook(
    sourceFile: SourceFile,
    op: OperationInfo,
    methodName: string,
    options: ClientGeneratorOptions,
): void {
    const { pathParams, queryParams, hasRequestBody } = analyzeParameters(op);
    const capitalizedMethodName = methodName.charAt(0).toUpperCase() + methodName.slice(1);

    // Build parameter types
    const variableTypes: string[] = [];
    if (pathParams.length > 0) {
        variableTypes.push(`pathParams: ${getPathParamsTypeName(op)}`);
    }
    if (queryParams.length > 0) {
        variableTypes.push(`queryParams?: ${getQueryParamsTypeName(op)}`);
    }
    if (hasRequestBody) {
        const bodyType = getRequestBodyType(op);
        // Request body types come from Models, so prefix them
        const prefixedBodyType = bodyType !== "any" && !bodyType.includes("[]") ? `Models.${bodyType}` : bodyType;
        variableTypes.push(`requestBody: ${prefixedBodyType}`);
    }

    // Determine return type
    let dataType = "unknown";
    const responseBodyType = getResponseBodyType(op);
    if (responseBodyType && responseBodyType !== "any" && !responseBodyType.includes("[]")) {
        dataType = `Models.${responseBodyType}`;
    }

    const variablesType = variableTypes.length > 0 ? `{ ${variableTypes.join("; ")} }` : "void";

    // Add JSDoc
    const jsDocLines: string[] = [];
    if (op.summary) {
        jsDocLines.push(op.summary);
    }
    if (op.description && op.description !== op.summary) {
        jsDocLines.push(op.description);
    }
    if (op.deprecated) {
        jsDocLines.push("@deprecated");
    }

    const functionDef: any = {
        name: `use${capitalizedMethodName}`,
        isExported: true,
        parameters: [{ name: "options = {}", type: `Omit<Parameters<typeof useMutation>[0], 'mutationFn'>` }],
        statements: (writer: CodeBlockWriter) => {
            writer.writeLine(`const mutationOptions = get${capitalizedMethodName}MutationOptions();`);
            writer.writeLine(`return useMutation({ ...mutationOptions, ...options });`);
        },
    };

    if (jsDocLines.length > 0) {
        functionDef.docs = [jsDocLines.join("\n")];
    }

    sourceFile.addFunction(functionDef);
}
