/**
 * Fetch client template
 *
 * Generates TypeScript client code using native fetch API.
 * Uses template literals for clean code generation.
 */
import { generateModelsFromOpenApi } from "../openapi-ir";
import { dedent } from "./dedent";
import {
    checkDuplicateMethodNames,
    extractOperations,
    extractParameters,
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

    // Build parameter types section
    const parameterTypesSection = operations
        .map((op) => {
            const { pathParams, queryParams } = extractParameters(op);
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
                    };
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
                    };
                `;
            }

            return parts.join("\n\n");
        })
        .filter((s) => s)
        .join("\n\n");

    // Generate methods as individual exports
    const individualMethods = operations
        .filter((op) => op !== undefined)
        .map((op) => generateMethodCode(op, defaultBaseUrl))
        .join("\n\n");

    // Assemble all sections using template literal
    return dedent`
        export interface ApiConfig {
          baseUrl: string;
          headers: Record<string, string>;
          fetch: typeof fetch;
        }

        let globalConfig: ApiConfig = {
          baseUrl: "${defaultBaseUrl}",
          headers: {},
          fetch: fetch,
        };

        export function setApiConfig(config: Partial<ApiConfig & { oauthBearerProvider: () => Promise<string> | string }>): void {
          if ("baseUrl" in config) globalConfig.baseUrl = config.baseUrl!;
          if ("headers" in config) globalConfig.headers = config.headers!;
          if ("fetch" in config) globalConfig.fetch = config.fetch!;
          if ("oauthBearerProvider" in config) {
            const originalFetch = globalConfig.fetch;
            globalConfig.fetch = async (url, init) => {
              const token = await config.oauthBearerProvider!();
              return originalFetch(url, { ...init, headers: { ...init?.headers, 'Authorization': \`Bearer \${token}\` } });
            };
          }
        }

        export function getApiConfig(): ApiConfig {
          return globalConfig;
        }

        ${parameterTypesSection}

        ${individualMethods}
    `.replace(/\n{3,}/g, "\n\n"); // Clean up excessive blank lines
}

/**
 * Generate code for a single API method using template literals
 */
function generateMethodCode(op: OperationInfo, defaultBaseUrl: string): string {
    const methodName = getMethodName(op);
    const { pathParams, queryParams, hasRequestBody } = extractParameters(op);
    const requestBodyType = getRequestBodyType(op);

    // Build JSDoc comment using template literal
    const jsDoc =
        op.summary || op.description
            ? `/**\n${[op.summary && ` * ${op.summary}`, op.description && op.description !== op.summary && ` * ${op.description}`].filter(Boolean).join("\n")}\n */\n`
            : "";

    // Build parameter list using array operations - omit requestBody if not defined
    const params = [
        pathParams.length > 0 && `pathParams: ${getPathParamsTypeName(op)}`,
        queryParams.length > 0 && `queryParams?: ${getQueryParamsTypeName(op)}`,
        hasRequestBody && requestBodyType && `requestBody: ${requestBodyType}`,
        "init?: RequestInit",
    ]
        .filter(Boolean)
        .join(", ");

    // Determine return type
    const returnType = "Promise<Response>";

    // Build URL construction
    const urlCode =
        pathParams.length > 0
            ? dedent`
            let url = globalConfig.baseUrl + \`${op.path}\`;
            ${pathParams.map((param) => `url = url.replace("{${param.name}}", String(pathParams.${param.name}));`).join("\n            ")}
          `
            : `const url = globalConfig.baseUrl + "${op.path}";`;

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
    const bodyLine = hasRequestBody && requestBodyType ? "      body: JSON.stringify(requestBody)," : "";

    // Build return statement
    const returnCode = "return response;";

    // Assemble the complete method as an exported async function
    return dedent`
        ${jsDoc}export async function ${methodName}(${params}): ${returnType} {
          ${urlCode}

          ${queryCode}

          const options: RequestInit = {
            method: "${op.method}",
            headers: {
              "Content-Type": "application/json",
              ...globalConfig.headers,
              ...(init?.headers || {}),
            },
      ${bodyLine}
            ...init,
          };

          const response = await globalConfig.fetch(fullUrl, options);

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
