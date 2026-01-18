/**
 * React Query client template
 *
 * Generates TypeScript client code with React Query integration.
 * Extends the fetch template with queries, mutations, and React context.
 */
import { Project } from "ts-morph";

import { generateReactQueryFiles } from "../openapi-client";
import { dedent } from "./dedent";
import templateFetch from "./fetch";
import { extractOperations, getDefaultBaseUrl } from "./helpers";
import type { WizGeneratorOutput, WizTemplateContext } from "./types";

/**
 * Generate api.ts content with React Query context additions
 */
export function templateReactQueryAPI(ctx: WizTemplateContext): string {
    // Get the base API from fetch template
    const fetchResult = templateFetch({ spec: ctx.spec, options: ctx.options });
    const baseAPI = fetchResult["api.ts"];

    if (!baseAPI) {
        throw new Error("Failed to generate base API from fetch template");
    }

    const defaultBaseUrl = getDefaultBaseUrl(ctx.spec);

    // Generate React-specific additions
    const reactAdditions = dedent`
        import { createContext, useContext } from "react";
        import type { ReactNode, ReactElement } from "react";

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

    // Replace setApiConfig and getApiConfig exports with React Query versions
    // The base API has setApiConfig and getApiConfig, but we need to adjust for React Query mode
    let modifiedAPI = baseAPI;

    // Remove the setApiConfig and getApiConfig exports
    modifiedAPI = modifiedAPI.replace(/export function setApiConfig\(config: ApiConfig\): void \{[^}]+\}/s, "");
    modifiedAPI = modifiedAPI.replace(/export function getApiConfig\(\): ApiConfig \{[^}]+\}/s, "");

    // Insert React additions after ApiConfig interface and globalConfig
    const insertPoint = modifiedAPI.indexOf("let globalConfig: ApiConfig = {};");
    if (insertPoint !== -1) {
        const insertAfter = modifiedAPI.indexOf("\n", insertPoint);
        if (insertAfter !== -1) {
            modifiedAPI =
                modifiedAPI.slice(0, insertAfter + 1) +
                "\n" +
                reactAdditions +
                "\n" +
                modifiedAPI.slice(insertAfter + 1);
        }
    }

    // Update getApiConfig() calls in methods to use globalConfig directly for React Query
    // In React Query mode, methods should use globalConfig ?? {} since context is handled separately
    modifiedAPI = modifiedAPI.replace(/const config = getApiConfig\(\);/g, "const config = globalConfig ?? {};");

    return modifiedAPI;
}

/**
 * Generate queries.ts content from OpenAPI spec
 */
export function templateQueries(ctx: WizTemplateContext): string {
    const project = new Project({ useInMemoryFileSystem: true });
    const queriesFile = project.createSourceFile("queries.ts", "");
    const mutationsFile = project.createSourceFile("mutations.ts", "");

    // Generate both files but only return queries
    generateReactQueryFiles(queriesFile, mutationsFile, ctx.spec, { ...ctx.options, reactQuery: true });

    return queriesFile.getFullText();
}

/**
 * Generate mutations.ts content from OpenAPI spec
 */
export function templateMutations(ctx: WizTemplateContext): string {
    const project = new Project({ useInMemoryFileSystem: true });
    const queriesFile = project.createSourceFile("queries.ts", "");
    const mutationsFile = project.createSourceFile("mutations.ts", "");

    // Generate both files but only return mutations
    generateReactQueryFiles(queriesFile, mutationsFile, ctx.spec, { ...ctx.options, reactQuery: true });

    return mutationsFile.getFullText();
}

/**
 * Main react-query template function
 * Returns file content mappings for the react-query client
 */
export default function template(ctx: WizTemplateContext): WizGeneratorOutput {
    // Get model from fetch template
    const fetchFiles = templateFetch({ spec: ctx.spec, options: ctx.options });

    // Generate React Query specific API with context
    return {
        "model.ts": fetchFiles["model.ts"] || "",
        "api.ts": templateReactQueryAPI(ctx),
        "queries.ts": templateQueries(ctx),
        "mutations.ts": templateMutations(ctx),
    };
}
