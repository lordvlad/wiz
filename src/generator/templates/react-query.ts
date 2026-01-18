/**
 * React Query client template
 *
 * Generates TypeScript client code with React Query integration.
 * Extends the fetch template with queries and mutations.
 * Does not modify api.ts - uses React context for configuration instead.
 */
import { dedent } from "./dedent";
import templateFetch from "./fetch";
import { extractOperations, getDefaultBaseUrl, getMethodName, getRequestBodyType } from "./helpers";
import type { WizGeneratorOutput, WizTemplateContext } from "./types";

/**
 * Generate api.ts content - uses fetch template as-is
 */
export function templateReactQueryAPI(ctx: WizTemplateContext): string {
    const operations = extractOperations(ctx.spec);
    const defaultBaseUrl = getDefaultBaseUrl(ctx.spec);

    // Generate React-specific additions at the top
    const reactImports = dedent`
        import { createContext, useContext } from "react";
        import type { ReactNode, ReactElement } from "react";
    `;

    const reactContext = dedent`
        export const ApiContext = createContext<ApiConfig | undefined>(undefined);

        const defaultApiConfig: ApiConfig = { baseUrl: "${defaultBaseUrl}" };

        export function useApiConfig(): ApiConfig {
          const config = useContext(ApiContext);
          return config ?? defaultApiConfig;
        }

        export interface ApiProviderProps {
          config?: Partial<ApiConfig>;
          children: ReactNode;
        }

        export function ApiProvider({ config, children }: ApiProviderProps): ReactElement {
          const mergedConfig: ApiConfig = {
            ...defaultApiConfig,
            ...config,
            headers: {
              ...(defaultApiConfig.headers ?? {}),
              ...(config?.headers ?? {}),
            },
          };

          return (
            <ApiContext.Provider value={mergedConfig}>
              {children}
            </ApiContext.Provider>
          );
        }

        export function setGlobalApiConfig(config: ApiConfig): void {
          // For direct API calls outside React context
          globalConfig = config;
        }
    `;

    // Get the base API from fetch template
    const fetchResult = templateFetch({ spec: ctx.spec, options: ctx.options });
    const baseAPI = fetchResult["api.ts"];

    if (!baseAPI) {
        throw new Error("Failed to generate base API from fetch template");
    }

    // Remove setApiConfig and getApiConfig from base API since we use React context
    let modifiedAPI = baseAPI
        .replace(/export function setApiConfig\(config: ApiConfig\): void \{[^}]+\}/s, "")
        .replace(/export function getApiConfig\(\): ApiConfig \{[^}]+\}/s, "");

    // Insert React additions at the beginning, after any imports
    const lines = modifiedAPI.split("\n");
    const insertIndex = lines.findIndex((line) => !line.startsWith("import ") && line.trim() !== "");

    if (insertIndex !== -1) {
        lines.splice(insertIndex, 0, reactImports, "", reactContext, "");
    } else {
        return reactImports + "\n\n" + reactContext + "\n\n" + modifiedAPI;
    }

    return lines.join("\n");
}

/**
 * Generate queries.ts content from OpenAPI spec using template literals
 */
export function templateQueries(ctx: WizTemplateContext): string {
    const operations = extractOperations(ctx.spec);

    // Filter operations that are queries (GET, HEAD, OPTIONS)
    const queryOperations = operations.filter((op) => ["GET", "HEAD", "OPTIONS"].includes(op.method));

    const queryHooks = queryOperations
        .map((op) => {
            const methodName = getMethodName(op);
            const capitalizedName = methodName.charAt(0).toUpperCase() + methodName.slice(1);

            // Build parameters type
            const paramsType = `Parameters<typeof api.${methodName}>[0]`;

            return dedent`
            export function use${capitalizedName}Query(
              params: ${paramsType},
              options?: Omit<UseQueryOptions<Awaited<ReturnType<typeof api.${methodName}>>>, 'queryKey' | 'queryFn'>
            ) {
              return useQuery({
                queryKey: ['${methodName}', params],
                queryFn: () => api.${methodName}(params),
                ...options,
              });
            }
        `;
        })
        .join("\n\n");

    return dedent`
        import { useQuery } from "@tanstack/react-query";
        import type { UseQueryOptions } from "@tanstack/react-query";
        import * as api from "./api";

        ${queryHooks}
    `;
}

/**
 * Generate mutations.ts content from OpenAPI spec using template literals
 */
export function templateMutations(ctx: WizTemplateContext): string {
    const operations = extractOperations(ctx.spec);

    // Filter operations that are mutations (POST, PUT, PATCH, DELETE)
    const mutationOperations = operations.filter((op) => ["POST", "PUT", "PATCH", "DELETE"].includes(op.method));

    const mutationHooks = mutationOperations
        .map((op) => {
            const methodName = getMethodName(op);
            const capitalizedName = methodName.charAt(0).toUpperCase() + methodName.slice(1);

            // Build parameters type
            const paramsType = `Parameters<typeof api.${methodName}>[0]`;

            return dedent`
            export function use${capitalizedName}Mutation(
              options?: Omit<UseMutationOptions<Awaited<ReturnType<typeof api.${methodName}>>, Error, ${paramsType}>, 'mutationFn'>
            ) {
              return useMutation({
                mutationFn: (params: ${paramsType}) => api.${methodName}(params),
                ...options,
              });
            }
        `;
        })
        .join("\n\n");

    return dedent`
        import { useMutation } from "@tanstack/react-query";
        import type { UseMutationOptions } from "@tanstack/react-query";
        import * as api from "./api";

        ${mutationHooks}
    `;
}

/**
 * Main react-query template function
 * Returns file content mappings for the react-query client
 */
export default function template(ctx: WizTemplateContext): WizGeneratorOutput {
    // Get model from fetch template
    const fetchFiles = templateFetch({ spec: ctx.spec, options: ctx.options });

    // Generate React Query specific files
    return {
        "model.ts": fetchFiles["model.ts"] || "",
        "api.ts": templateReactQueryAPI(ctx),
        "queries.ts": templateQueries(ctx),
        "mutations.ts": templateMutations(ctx),
    };
}
