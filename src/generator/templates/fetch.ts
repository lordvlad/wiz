/**
 * Fetch client template
 *
 * Generates TypeScript client code using native fetch API.
 * Uses template literals for clean code generation.
 */
import { generateModelsFromOpenApi } from "../openapi-ir";
import { dedent } from "./dedent";
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
 * Generate api.ts content from OpenAPI spec using template literals
 */
export function templateAPI(ctx: WizTemplateContext): string {
    const operations = extractOperations(ctx.spec);
    checkDuplicateMethodNames(operations);

    const defaultBaseUrl = getDefaultBaseUrl(ctx.spec);
    const options = ctx.options || {};

    // Collect types that need validators
    const typesToValidate = options.wizValidator
        ? operations.reduce((acc: Set<string>, op) => {
              const requestBodyType = getRequestBodyType(op);
              if (requestBodyType && requestBodyType !== "any" && !requestBodyType.includes("[]")) {
                  acc.add(requestBodyType);
              }
              const responseBodyType = getResponseBodyType(op);
              if (responseBodyType && responseBodyType !== "any" && !responseBodyType.includes("[]")) {
                  acc.add(responseBodyType);
              }
              return acc;
          }, new Set<string>())
        : new Set<string>();

    // Build validator section
    const validatorSection = options.wizValidator
        ? dedent`
            import { createValidator } from "wiz/validator";

            export interface TypedResponse<T> extends Response {
              json(): Promise<T>;
            }

            ${Array.from(typesToValidate)
                .map((typeName) => `const validate${typeName} = createValidator<Models.${typeName}>();`)
                .join("\n")}

            function createTypedResponse<T>(response: Response, validator: (value: unknown) => any[]): TypedResponse<T> {
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
          `
        : "";

    // Build parameter types section
    const parameterTypesSection = operations
        .map((op) => {
            const { pathParams, queryParams } = analyzeParameters(op);
            const parts: string[] = [];

            if (pathParams.length > 0) {
                const typeName = getPathParamsTypeName(op);
                const properties = pathParams
                    .map((param) => {
                        const optional = !param.required ? "?" : "";
                        const type = getTypeFromSchema(param.schema);
                        return `  ${param.name}${optional}: ${type};`;
                    })
                    .join("\n");

                parts[parts.length] = dedent`
                    export type ${typeName} = {
                    ${properties}
                    };${options.wizValidator ? `\n\nconst validate${typeName} = createValidator<${typeName}>();` : ""}
                `;
            }

            if (queryParams.length > 0) {
                const typeName = getQueryParamsTypeName(op);
                const properties = queryParams
                    .map((param) => {
                        const optional = !param.required ? "?" : "";
                        const type = getTypeFromSchema(param.schema);
                        return `  ${param.name}${optional}: ${type};`;
                    })
                    .join("\n");

                parts[parts.length] = dedent`
                    export type ${typeName} = {
                    ${properties}
                    };${options.wizValidator ? `\n\nconst validate${typeName} = createValidator<${typeName}>();` : ""}
                `;
            }

            return parts.join("\n\n");
        })
        .filter((s) => s)
        .join("\n\n");

    // Generate methods
    const methods = operations
        .filter((op) => op !== undefined)
        .map((op) => generateMethodCode(op, defaultBaseUrl, options))
        .join(",\n\n");

    // Assemble all sections using template literal
    return dedent`
        ${validatorSection}

        export interface ApiConfig {
          baseUrl?: string;
          headers?: Record<string, string>;
          fetch?: typeof fetch;
          bearerTokenProvider?: () => Promise<string>;
        }

        let globalConfig: ApiConfig = {};

        export function setApiConfig(config: ApiConfig): void {
          globalConfig = config;
        }

        export function getApiConfig(): ApiConfig {
          return globalConfig;
        }

        ${parameterTypesSection}

        export const api = {
        ${methods}
        };
    `.replace(/\n{3,}/g, "\n\n"); // Clean up excessive blank lines
}

/**
 * Generate code for a single API method using template literals
 */
function generateMethodCode(op: OperationInfo, defaultBaseUrl: string, options: any): string {
    const methodName = getMethodName(op);
    const { pathParams, queryParams, hasRequestBody } = analyzeParameters(op);

    // Build JSDoc comment using template literal
    const jsDoc =
        op.summary || op.description
            ? `  /**\n${[op.summary && `   * ${op.summary}`, op.description && op.description !== op.summary && `   * ${op.description}`].filter(Boolean).join("\n")}\n   */\n`
            : "";

    // Build parameter list using array operations
    const params = [
        pathParams.length > 0 && `pathParams: ${getPathParamsTypeName(op)}`,
        queryParams.length > 0 && `queryParams?: ${getQueryParamsTypeName(op)}`,
        hasRequestBody && `requestBody: ${getRequestBodyType(op)}`,
        "init?: RequestInit",
    ]
        .filter(Boolean)
        .join(", ");

    // Determine return type
    const responseBodyType = options.wizValidator && getResponseBodyType(op);
    const returnType =
        options.wizValidator && responseBodyType && responseBodyType !== "any" && !responseBodyType.includes("[]")
            ? `Promise<TypedResponse<Models.${responseBodyType}>>`
            : "Promise<Response>";

    // Build validation blocks using array reduce
    const validationCode = [
        options.wizValidator &&
            pathParams.length > 0 &&
            dedent`
                // Validate path parameters
                const pathParamsErrors = validate${getPathParamsTypeName(op)}(pathParams);
                if (pathParamsErrors.length > 0) {
                  throw new TypeError("Invalid path parameters: " + JSON.stringify(pathParamsErrors));
                }
            `,
        options.wizValidator &&
            queryParams.length > 0 &&
            dedent`
                // Validate query parameters
                if (queryParams) {
                  const queryParamsErrors = validate${getQueryParamsTypeName(op)}(queryParams);
                  if (queryParamsErrors.length > 0) {
                    throw new TypeError("Invalid query parameters: " + JSON.stringify(queryParamsErrors));
                  }
                }
            `,
        options.wizValidator &&
            hasRequestBody &&
            getRequestBodyType(op) !== "any" &&
            !getRequestBodyType(op).includes("[]") &&
            dedent`
                // Validate request body
                const requestBodyErrors = validate${getRequestBodyType(op)}(requestBody);
                if (requestBodyErrors.length > 0) {
                  throw new TypeError("Invalid request body: " + JSON.stringify(requestBodyErrors));
                }
            `,
    ]
        .filter(Boolean)
        .join("\n\n");

    // Build URL construction
    const urlCode =
        pathParams.length > 0
            ? dedent`
            let url = baseUrl + \`${op.path}\`;
            ${pathParams.map((param) => `url = url.replace("{${param.name}}", String(pathParams.${param.name}));`).join("\n            ")}
          `
            : `const url = baseUrl + "${op.path}";`;

    // Build query params code
    const queryCode =
        queryParams.length > 0
            ? dedent`
            const searchParams = new URLSearchParams();
            if (queryParams) {
            ${queryParams
                .map(
                    (param) => dedent`
              if (queryParams.${param.name} !== undefined) {
                searchParams.append("${param.name}", String(queryParams.${param.name}));
              }
            `,
                )
                .join("")}
            }
            const queryString = searchParams.toString();
            const fullUrl = queryString ? \`\${url}?\${queryString}\` : url;
          `
            : "const fullUrl = url;";

    // Build request body
    const bodyLine = hasRequestBody ? "      body: JSON.stringify(requestBody)," : "";

    // Build return statement
    const returnCode =
        options.wizValidator && responseBodyType && responseBodyType !== "any" && !responseBodyType.includes("[]")
            ? `return createTypedResponse<Models.${responseBodyType}>(response, validate${responseBodyType});`
            : "return response;";

    // Assemble the complete method
    return dedent`
        ${jsDoc}  async ${methodName}(${params}): ${returnType} {
            const config = getApiConfig();
            const baseUrl = config.baseUrl ?? "${defaultBaseUrl}";
            const fetchImpl = config.fetch ?? fetch;
            ${validationCode ? "\n" + validationCode : ""}

            ${urlCode}

            ${queryCode}

            // Add bearer token if configured
            if (config.bearerTokenProvider) {
              const token = await config.bearerTokenProvider();
              if (!init?.headers) {
                init = { ...init, headers: {} };
              }
              (init.headers as Record<string, string>)["Authorization"] = \`Bearer \${token}\`;
            }

            const options: RequestInit = {
              method: "${op.method}",
              headers: {
                "Content-Type": "application/json",
                ...config.headers,
                ...init?.headers,
              },
        ${bodyLine}
              ...init,
            };

            const response = await fetchImpl(fullUrl, options);

            ${returnCode}
          }
    `.replace(/\n{3,}/g, "\n\n"); // Remove excessive blank lines
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
