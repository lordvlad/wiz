/**
 * Templates for fetch-based OpenAPI client generation
 * All templates use ${var} syntax for variable interpolation
 */

// Import declarations
export const validatorImports = `import { createValidator } from "wiz/validator";
`;

// TypedResponse interface for validator mode
export const typedResponseInterface = `export interface TypedResponse<T> extends Response {
  json(): Promise<T>;
}
`;

// Validator declaration
export const validatorDeclaration = `const validate\${typeName} = createValidator<\${typeReference}>();
`;

// createTypedResponse helper function
export const createTypedResponseHelper = `function createTypedResponse<T>(response: Response, validator: (value: unknown) => any[]): TypedResponse<T> {
  const originalJson = response.json.bind(response);

  return new Proxy(response, {
    get(target, prop) {
      if (prop === 'json') {
        return async () => {
          const data = await originalJson();
          const errors = validator(data);
          if (errors.length > 0) {
            throw new TypeError("Invalid response body: " + JSON.stringify(errors));
          }
          return data as T;
        };
      }
      return Reflect.get(target, prop);
    }
  }) as TypedResponse<T>;
}
`;

// ApiConfig interface
export const apiConfigInterface = `export interface ApiConfig {
  baseUrl?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
  bearerTokenProvider?: () => Promise<string>;
}
`;

// Global config declaration
export const globalConfigDeclaration = `let globalConfig: ApiConfig = {};
`;

// setApiConfig and getApiConfig
export const setApiConfig = `export function setApiConfig(config: ApiConfig): void {
  globalConfig = config;
}
`;

export const getApiConfig = `export function getApiConfig(): ApiConfig {
  return globalConfig;
}
`;

// Type alias template
export const typeAlias = `export type \${typeName} = {
\${properties}
};
`;

// Property in type alias
export const typeProperty = `  \${name}\${optional}: \${type};
`;

// API client object
export const apiClient = `export const api = {
\${methods}
};
`;

// API method template
export const apiMethod =
    `\${jsDoc}async \${methodName}(\${params}): \${returnType} {
    const config = getApiConfig();
    const baseUrl = config.baseUrl ?? "\${defaultBaseUrl}";
    const fetchImpl = config.fetch ?? fetch;
\${pathParamsValidation}\${queryParamsValidation}\${requestBodyValidation}
    \${urlConstruction}
\${queryParamsConstruction}
    // Add bearer token if configured
    if (config.bearerTokenProvider) {
      const token = await config.bearerTokenProvider();
      if (!init?.headers) {
        init = { ...init, headers: {} };
      }
      (init.headers as Record<string, string>)["Authorization"] = ` +
    "`Bearer ${token}`;" +
    `
    }

    const options: RequestInit = {
      method: "\${method}",
      headers: {
        "Content-Type": "application/json",
        ...config.headers,
        ...init?.headers,
      },\${requestBodySerialization}
      ...init,
    };

    const response = await fetchImpl(fullUrl, options);
\${responseWrapping}
  }`;

// Path params validation
export const pathParamsValidationBlock = `
    // Validate path parameters
    const pathParamsErrors = validate\${typeName}(pathParams);
    if (pathParamsErrors.length > 0) {
      throw new TypeError("Invalid path parameters: " + JSON.stringify(pathParamsErrors));
    }`;

// Query params validation
export const queryParamsValidationBlock = `
    // Validate query parameters
    if (queryParams) {
      const queryParamsErrors = validate\${typeName}(queryParams);
      if (queryParamsErrors.length > 0) {
        throw new TypeError("Invalid query parameters: " + JSON.stringify(queryParamsErrors));
      }
    }`;

// Request body validation
export const requestBodyValidationBlock = `
    // Validate request body
    const requestBodyErrors = validate\${typeName}(requestBody);
    if (requestBodyErrors.length > 0) {
      throw new TypeError("Invalid request body: " + JSON.stringify(requestBodyErrors));
    }`;

// URL construction with path params
export const urlConstructionWithPathParams =
    `let url = baseUrl + ` +
    "`${urlTemplate}`" +
    `;
\${pathParamReplacements}`;

// URL construction without path params
export const urlConstructionWithoutPathParams = `const url = baseUrl + "\${urlTemplate}";`;

// Path param replacement
export const pathParamReplacement = `    url = url.replace("{\${paramName}}", String(pathParams.\${paramName}));
`;

// Query params construction
export const queryParamsConstructionBlock =
    `    const searchParams = new URLSearchParams();
    if (queryParams) {
\${queryParamAppends}    }
    const queryString = searchParams.toString();
    const fullUrl = queryString ? ` +
    "`${url}?${queryString}`" +
    ` : url;
`;

// Query param append
export const queryParamAppend = `      if (queryParams.\${paramName} !== undefined) {
        searchParams.append("\${paramName}", String(queryParams.\${paramName}));
      }
`;

// No query params
export const noQueryParams = `    const fullUrl = url;
`;

// Request body serialization
export const requestBodySerializationBlock = `
      body: JSON.stringify(requestBody),`;

// Response wrapping with typed validation
export const responseWrappingWithValidation = `
    return createTypedResponse<Models.\${responseType}>(response, validate\${responseType});`;

// Response wrapping without validation
export const responseWrappingWithoutValidation = `
    return response;`;

// JSDoc comment
export const jsDocComment = `/**
\${lines} */
`;

// JSDoc line
export const jsDocLine = ` * \${text}
`;
