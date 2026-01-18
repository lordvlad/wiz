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

    const sections: string[] = [];

    // Add validator imports if needed
    if (options.wizValidator) {
        sections.push(dedent`
            import { createValidator } from "wiz/validator";
        `);

        // Add TypedResponse interface
        sections.push(dedent`
            export interface TypedResponse<T> extends Response {
              json(): Promise<T>;
            }
        `);

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
        const validators = Array.from(typesToValidate)
            .map((typeName) => `const validate${typeName} = createValidator<Models.${typeName}>();`)
            .join("\n");
        if (validators) {
            sections.push(validators);
        }

        // Generate createTypedResponse helper
        sections.push(dedent`
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
        `);
    }

    // Generate ApiConfig interface
    sections.push(dedent`
        export interface ApiConfig {
          baseUrl?: string;
          headers?: Record<string, string>;
          fetch?: typeof fetch;
          bearerTokenProvider?: () => Promise<string>;
        }
    `);

    // Generate global config and functions
    sections.push(dedent`
        let globalConfig: ApiConfig = {};

        export function setApiConfig(config: ApiConfig): void {
          globalConfig = config;
        }

        export function getApiConfig(): ApiConfig {
          return globalConfig;
        }
    `);

    // Generate parameter types for all operations
    for (const op of operations) {
        const { pathParams, queryParams } = analyzeParameters(op);

        if (pathParams.length > 0) {
            const typeName = getPathParamsTypeName(op);
            const properties = pathParams
                .map((param) => {
                    const optional = !param.required ? "?" : "";
                    const type = getTypeFromSchema(param.schema);
                    return `  ${param.name}${optional}: ${type};`;
                })
                .join("\n");

            sections.push(dedent`
                export type ${typeName} = {
                ${properties}
                };
            `);

            // Generate validator if needed
            if (options.wizValidator) {
                sections.push(`const validate${typeName} = createValidator<${typeName}>();`);
            }
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

            sections.push(dedent`
                export type ${typeName} = {
                ${properties}
                };
            `);

            // Generate validator if needed
            if (options.wizValidator) {
                sections.push(`const validate${typeName} = createValidator<${typeName}>();`);
            }
        }
    }

    // Generate api object with methods
    const methods = operations
        .filter((op) => op !== undefined)
        .map((op) => generateMethodCode(op, defaultBaseUrl, options))
        .join(",\n\n");

    sections.push(dedent`
        export const api = {
        ${methods}
        };
    `);

    return sections.join("\n\n");
}

/**
 * Generate code for a single API method using template literals
 */
function generateMethodCode(op: OperationInfo, defaultBaseUrl: string, options: any): string {
    const methodName = getMethodName(op);
    const { pathParams, queryParams, hasRequestBody } = analyzeParameters(op);

    // Build JSDoc comment
    let jsDoc = "";
    if (op.summary || op.description) {
        const lines = ["  /**"];
        if (op.summary) {
            lines.push(`   * ${op.summary}`);
        }
        if (op.description && op.description !== op.summary) {
            lines.push(`   * ${op.description}`);
        }
        lines.push("   */");
        jsDoc = lines.join("\n") + "\n";
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

    // Build validation blocks
    const validations: string[] = [];

    if (options.wizValidator && pathParams.length > 0) {
        const typeName = getPathParamsTypeName(op);
        validations.push(dedent`
            // Validate path parameters
            const pathParamsErrors = validate${typeName}(pathParams);
            if (pathParamsErrors.length > 0) {
              throw new TypeError("Invalid path parameters: " + JSON.stringify(pathParamsErrors));
            }
        `);
    }

    if (options.wizValidator && queryParams.length > 0) {
        const typeName = getQueryParamsTypeName(op);
        validations.push(dedent`
            // Validate query parameters
            if (queryParams) {
              const queryParamsErrors = validate${typeName}(queryParams);
              if (queryParamsErrors.length > 0) {
                throw new TypeError("Invalid query parameters: " + JSON.stringify(queryParamsErrors));
              }
            }
        `);
    }

    if (options.wizValidator && hasRequestBody) {
        const bodyType = getRequestBodyType(op);
        if (bodyType !== "any" && !bodyType.includes("[]")) {
            validations.push(dedent`
                // Validate request body
                const requestBodyErrors = validate${bodyType}(requestBody);
                if (requestBodyErrors.length > 0) {
                  throw new TypeError("Invalid request body: " + JSON.stringify(requestBodyErrors));
                }
            `);
        }
    }

    const validationCode = validations.length > 0 ? "\n" + validations.join("\n\n") : "";

    // Build URL construction
    let urlCode: string;
    if (pathParams.length > 0) {
        const replacements = pathParams
            .map((param) => `    url = url.replace("{${param.name}}", String(pathParams.${param.name}));`)
            .join("\n");
        urlCode = dedent`
            let url = baseUrl + \`${op.path}\`;
            ${replacements}
        `;
    } else {
        urlCode = `const url = baseUrl + "${op.path}";`;
    }

    // Build query params code
    let queryCode = "";
    if (queryParams.length > 0) {
        const appendCalls = queryParams
            .map(
                (param) => dedent`
              if (queryParams.${param.name} !== undefined) {
                searchParams.append("${param.name}", String(queryParams.${param.name}));
              }
          `,
            )
            .join("\n");

        queryCode = dedent`
            const searchParams = new URLSearchParams();
            if (queryParams) {
            ${appendCalls}
            }
            const queryString = searchParams.toString();
            const fullUrl = queryString ? \`\${url}?\${queryString}\` : url;
        `;
    } else {
        queryCode = "const fullUrl = url;";
    }

    // Build request body
    const bodyLine = hasRequestBody ? "      body: JSON.stringify(requestBody)," : "";

    // Build return statement
    let returnCode: string;
    if (options.wizValidator) {
        const responseBodyType = getResponseBodyType(op);
        if (responseBodyType && responseBodyType !== "any" && !responseBodyType.includes("[]")) {
            returnCode = `return createTypedResponse<Models.${responseBodyType}>(response, validate${responseBodyType});`;
        } else {
            returnCode = "return response;";
        }
    } else {
        returnCode = "return response;";
    }

    // Assemble the complete method
    return dedent`
        ${jsDoc}  async ${methodName}(${params.join(", ")}): ${returnType} {
            const config = getApiConfig();
            const baseUrl = config.baseUrl ?? "${defaultBaseUrl}";
            const fetchImpl = config.fetch ?? fetch;
            ${validationCode}

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
    `.replace(/\n\s*\n\s*\n/g, "\n\n"); // Remove excessive blank lines
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
