/**
 * React Query client template with Wiz validator support
 *
 * Combines React Query integration with validator support.
 * Extends the fetch-wiz-validators template with React Query hooks.
 */
import { dedent } from "./dedent";
import templateFetchWizValidators from "./fetch-wiz-validators";
import { extractOperations, getDefaultBaseUrl, getMethodName, getRequestBodyType } from "./helpers";
import type { WizGeneratorOutput, WizTemplateContext } from "./types";

/**
 * Generate api.ts content with React context and validators
 */
export function templateReactQueryAPI(ctx: WizTemplateContext): string {
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

    // Get the base API from fetch-wiz-validators template
    const fetchResult = templateFetchWizValidators({ spec: ctx.spec, options: ctx.options });
    const baseAPI = fetchResult["api.ts"];

    if (!baseAPI) {
        throw new Error("Failed to generate base API from fetch-wiz-validators template");
    }

    // Remove setApiConfig and getApiConfig from base API since we use React context
    let modifiedAPI = baseAPI
        .replace(/export function setApiConfig\(config: Partial<ApiConfig & \{ oauthBearerProvider: \(\) => Promise<string> \| string \}>\): void \{[\s\S]*?\n\s*\}\n/s, "")
        .replace(/export function getApiConfig\(\): ApiConfig \{[\s\S]*?\n\s*\}\n/s, "");

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

    // Collect all method names for import
    const methodNames = queryOperations.map((op) => getMethodName(op));

    const queryHooks = queryOperations
        .map((op) => {
            const methodName = getMethodName(op);
            const capitalizedName = methodName.charAt(0).toUpperCase() + methodName.slice(1);

            // Build parameters type
            const paramsType = `Parameters<typeof ${methodName}>[0]`;

            return dedent`
            export function use${capitalizedName}Query(
              params: ${paramsType},
              options?: Omit<UseQueryOptions<Awaited<ReturnType<typeof ${methodName}>>>, 'queryKey' | 'queryFn'>
            ) {
              return useQuery({
                queryKey: ['${methodName}', params],
                queryFn: () => ${methodName}(params),
                ...options,
              });
            }
        `;
        })
        .join("\n\n");

    return dedent`
        import { useQuery } from "@tanstack/react-query";
        import type { UseQueryOptions } from "@tanstack/react-query";
        import { ${methodNames.join(", ")} } from "./api";

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

    // Collect all method names for import
    const methodNames = mutationOperations.map((op) => getMethodName(op));

    const mutationHooks = mutationOperations
        .map((op) => {
            const methodName = getMethodName(op);
            const capitalizedName = methodName.charAt(0).toUpperCase() + methodName.slice(1);

            // Build parameters type
            const paramsType = `Parameters<typeof ${methodName}>[0]`;

            return dedent`
            export function use${capitalizedName}Mutation(
              options?: Omit<UseMutationOptions<Awaited<ReturnType<typeof ${methodName}>>, Error, ${paramsType}>, 'mutationFn'>
            ) {
              return useMutation({
                mutationFn: (params: ${paramsType}) => ${methodName}(params),
                ...options,
              });
            }
        `;
        })
        .join("\n\n");

    return dedent`
        import { useMutation } from "@tanstack/react-query";
        import type { UseMutationOptions } from "@tanstack/react-query";
        import { ${methodNames.join(", ")} } from "./api";

        ${mutationHooks}
    `;
}

/**
 * Main react-query-wiz-validators template function
 * Returns file content mappings for the react-query client with validator support
 */
export default function template(ctx: WizTemplateContext): WizGeneratorOutput {
    // Get model from fetch-wiz-validators template
    const fetchFiles = templateFetchWizValidators({ spec: ctx.spec, options: ctx.options });

    // Generate React Query specific files
    return {
        "model.ts": fetchFiles["model.ts"] || "",
        "api.ts": templateReactQueryAPI(ctx),
        "queries.ts": templateQueries(ctx),
        "mutations.ts": templateMutations(ctx),
    };
}
