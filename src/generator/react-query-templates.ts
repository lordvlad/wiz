/**
 * Templates for React Query integration
 * All templates use ${var} syntax for variable interpolation
 */

// React imports
export const reactImports = `import { createContext, useContext } from "react";
import type { ReactNode, ReactElement } from "react";
`;

// React Query imports for queries file
export const reactQueryImportsForQueries = `import { useQuery } from "@tanstack/react-query";
`;

// React Query imports for mutations file
export const reactQueryImportsForMutations = `import { useMutation } from "@tanstack/react-query";
`;

// setGlobalApiConfig for React Query mode
export const setGlobalApiConfig = `export function setGlobalApiConfig(config: ApiConfig): void {
  globalConfig = config;
}
`;

// React Query context
export const apiContextDeclaration = `export const ApiContext = createContext<ApiConfig | undefined>(undefined);
`;

export const defaultApiConfigDeclaration = `const defaultApiConfig: ApiConfig = { baseUrl: "\${defaultBaseUrl}" };
`;

export const useApiConfigHook = `export function useApiConfig(): ApiConfig {
  const config = useContext(ApiContext);
  return config ?? defaultApiConfig;
}
`;

// ApiProvider interface and component
export const apiProviderInterface = `export interface ApiProviderProps {
  config?: Partial<ApiConfig>;
  children: ReactNode;
}
`;

export const apiProviderComponent = `export function ApiProvider({ config, children }: ApiProviderProps): ReactElement {
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
`;

// API method for React Query mode
export const apiMethodReactQuery =
    `\${jsDoc}async \${methodName}(\${params}): \${returnType} {
    const config = globalConfig ?? {};
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

// Stable key helper function
export const stableKeyFunction = `function stableKey(obj: any): string | null | undefined {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return JSON.stringify(obj.map(stableKey));
  }
  const sorted: Record<string, any> = {};
  Object.keys(obj).sort().forEach(key => {
    sorted[key] = obj[key];
  });
  return JSON.stringify(sorted);
}
`;

// Query options function
export const queryOptionsFunction = `export function get\${capitalizedMethodName}QueryOptions(\${params}): { queryKey: unknown[]; queryFn: () => Promise<\${dataType}> } {
  return {
    queryKey: [\${queryKey}],
    queryFn: async () => {
      const response = await api.\${methodName}(\${callParams});
\${jsonParsing}
    },
  };
}
`;

// JSON parsing for query
export const jsonParsingWithType = `      return response.json() as Promise<\${dataType}>;`;

export const jsonParsingWithoutType = `      return response.json();`;

export const noJsonParsing = `      return response;`;

// Query hook
export const queryHook = `\${jsDoc}export function use\${capitalizedMethodName}(\${params}) {
  const queryOptions = get\${capitalizedMethodName}QueryOptions(\${callParams});
  return useQuery({ ...queryOptions, ...options });
}
`;

// Mutation options function
export const mutationOptionsFunction = `export function get\${capitalizedMethodName}MutationOptions(): { mutationFn: (variables: \${variablesType}) => Promise<\${dataType}> } {
  return {
    mutationFn: async (variables: \${variablesType}) => {
      const response = await api.\${methodName}(\${callParams});
\${jsonParsing}
    },
  };
}
`;

// Mutation hook
export const mutationHook = `\${jsDoc}export function use\${capitalizedMethodName}(options = {}): ReturnType<typeof useMutation> {
  const mutationOptions = get\${capitalizedMethodName}MutationOptions();
  return useMutation({ ...mutationOptions, ...options });
}
`;
