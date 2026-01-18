import { describe, expect, it } from "bun:test";

import type { OpenApiSpec } from "../generator/openapi";
import { generateClientFromOpenApi } from "../generator/openapi-client";

describe("OpenAPI to TypeScript client generator with React Query", () => {
    it("should generate ApiContext when reactQuery option is enabled", () => {
        const spec: OpenApiSpec = {
            openapi: "3.0.0",
            paths: {
                "/users": {
                    get: {
                        operationId: "getUsers",
                        responses: {
                            "200": {
                                description: "Success",
                            },
                        },
                    },
                },
            },
            components: {
                schemas: {},
            },
        };

        const { api } = generateClientFromOpenApi(spec, { reactQuery: true });

        // Should import React hooks
        expect(api).toContain('import { createContext, useContext } from "react"');

        // Should create ApiContext
        expect(api).toContain("export const ApiContext");
        expect(api).toContain("createContext<ApiConfig | undefined>(undefined)");

        // Should create useApiConfig hook
        expect(api).toContain("export function useApiConfig(): ApiConfig");
        expect(api).toContain("const config = useContext(ApiContext)");
        expect(api).toContain("return config ?? defaultApiConfig");
    });

    it("should generate ApiProvider wrapper component with merged defaults", () => {
        const spec: OpenApiSpec = {
            openapi: "3.0.0",
            servers: [
                {
                    url: "https://api.example.com",
                },
            ],
            paths: {
                "/users": {
                    get: {
                        operationId: "getUsers",
                        responses: {
                            "200": {
                                description: "Success",
                            },
                        },
                    },
                },
            },
            components: {
                schemas: {},
            },
        };

        const { api } = generateClientFromOpenApi(spec, { reactQuery: true });

        // Should import React types
        expect(api).toContain('import type { ReactNode, ReactElement } from "react"');

        // Should create default config with baseUrl from servers
        expect(api).toContain("const defaultApiConfig: ApiConfig");
        expect(api).toContain('baseUrl: "https://api.example.com"');

        // Should create ApiProviderProps interface
        expect(api).toContain("export interface ApiProviderProps");
        expect(api).toContain("config?: Partial<ApiConfig>");
        expect(api).toContain("children: ReactNode");

        // Should create ApiProvider component
        expect(api).toContain("export function ApiProvider");
        expect(api).toContain("const mergedConfig: ApiConfig");
        expect(api).toContain("...defaultApiConfig");
        expect(api).toContain("...config");
        expect(api).toContain("<ApiContext.Provider value={mergedConfig}>");
    });

    it("should not generate setApiConfig/getApiConfig when reactQuery is enabled", () => {
        const spec: OpenApiSpec = {
            openapi: "3.0.0",
            paths: {
                "/users": {
                    get: {
                        operationId: "getUsers",
                        responses: {
                            "200": {
                                description: "Success",
                            },
                        },
                    },
                },
            },
            components: {
                schemas: {},
            },
        };

        const { api } = generateClientFromOpenApi(spec, { reactQuery: true });

        // Should not have setApiConfig/getApiConfig
        expect(api).not.toContain("export function setApiConfig");
        expect(api).not.toContain("export function getApiConfig");

        // Should have setGlobalApiConfig instead
        expect(api).toContain("export function setGlobalApiConfig");
    });

    it("should generate query options method for GET operation", () => {
        const spec: OpenApiSpec = {
            openapi: "3.0.0",
            paths: {
                "/users/{id}": {
                    get: {
                        operationId: "getUserById",
                        parameters: [
                            {
                                name: "id",
                                in: "path",
                                required: true,
                                schema: { type: "string" },
                            },
                        ],
                        responses: {
                            "200": {
                                description: "Success",
                                content: {
                                    "application/json": {
                                        schema: {
                                            $ref: "#/components/schemas/User",
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            components: {
                schemas: {
                    User: {
                        type: "object",
                        properties: {
                            id: { type: "string" },
                            name: { type: "string" },
                        },
                        required: ["id", "name"],
                    },
                },
            },
        };

        const { queries } = generateClientFromOpenApi(spec, { reactQuery: true });

        // Should generate query options method in queries file
        expect(queries).toContain("export function useGetUserByIdQuery");
        expect(queries).toContain("queryKey:");
        expect(queries).toContain("queryFn:");
        expect(queries).toContain("api.getUserById");
    });

    it("should generate custom query hook for GET operation", () => {
        const spec: OpenApiSpec = {
            openapi: "3.0.0",
            paths: {
                "/users": {
                    get: {
                        operationId: "getUsers",
                        responses: {
                            "200": {
                                description: "Success",
                            },
                        },
                    },
                },
            },
            components: {
                schemas: {},
            },
        };

        const { queries } = generateClientFromOpenApi(spec, { reactQuery: true });

        // Should generate custom hook
        expect(queries).toContain("export function useGetUsers");
        expect(queries).toContain("useGetUsersQuery");

        // Should import and use React Query
        expect(queries).toContain('import { useQuery } from "@tanstack/react-query"');
        expect(queries).toContain("useQuery({");

        // Should NOT throw error
        expect(queries).not.toContain("throw new Error");
    });

    it("should generate mutation options method for POST operation", () => {
        const spec: OpenApiSpec = {
            openapi: "3.0.0",
            paths: {
                "/users": {
                    post: {
                        operationId: "createUser",
                        requestBody: {
                            content: {
                                "application/json": {
                                    schema: {
                                        $ref: "#/components/schemas/CreateUserRequest",
                                    },
                                },
                            },
                        },
                        responses: {
                            "201": {
                                description: "Created",
                                content: {
                                    "application/json": {
                                        schema: {
                                            $ref: "#/components/schemas/User",
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            components: {
                schemas: {
                    User: {
                        type: "object",
                        properties: {
                            id: { type: "string" },
                            name: { type: "string" },
                        },
                        required: ["id", "name"],
                    },
                    CreateUserRequest: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                        },
                        required: ["name"],
                    },
                },
            },
        };

        const { mutations } = generateClientFromOpenApi(spec, { reactQuery: true });

        // Should generate mutation options method
        expect(mutations).toContain("export function useCreateUserMutation");
        expect(mutations).toContain("mutationFn:");
        expect(mutations).toContain("api.createUser");
    });

    it("should generate custom mutation hook for POST operation", () => {
        const spec: OpenApiSpec = {
            openapi: "3.0.0",
            paths: {
                "/users": {
                    post: {
                        operationId: "createUser",
                        requestBody: {
                            content: {
                                "application/json": {
                                    schema: {
                                        $ref: "#/components/schemas/User",
                                    },
                                },
                            },
                        },
                        responses: {
                            "201": {
                                description: "Created",
                            },
                        },
                    },
                },
            },
            components: {
                schemas: {
                    User: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                        },
                        required: ["name"],
                    },
                },
            },
        };

        const { mutations } = generateClientFromOpenApi(spec, { reactQuery: true });

        // Should generate custom hook
        expect(mutations).toContain("export function useCreateUser");
        expect(mutations).toContain("useCreateUserMutation");

        // Should import and use React Query
        expect(mutations).toContain('import { useMutation } from "@tanstack/react-query"');
        expect(mutations).toContain("useMutation({");

        // Should NOT throw error
        expect(mutations).not.toContain("throw new Error");
    });

    it("should handle query parameters in query options", () => {
        const spec: OpenApiSpec = {
            openapi: "3.0.0",
            paths: {
                "/users": {
                    get: {
                        operationId: "listUsers",
                        parameters: [
                            {
                                name: "page",
                                in: "query",
                                required: false,
                                schema: { type: "number" },
                            },
                            {
                                name: "limit",
                                in: "query",
                                required: false,
                                schema: { type: "number" },
                            },
                        ],
                        responses: {
                            "200": {
                                description: "Success",
                            },
                        },
                    },
                },
            },
            components: {
                schemas: {},
            },
        };

        const { queries } = generateClientFromOpenApi(spec, { reactQuery: true });

        // Should include query params in the function signature
        expect(queries).toContain("export function useListUsersQuery");
        expect(queries).toContain("api.listUsers");
        expect(queries).toContain("queryKey:");
    });

    it("should generate both regular api methods and React Query helpers", () => {
        const spec: OpenApiSpec = {
            openapi: "3.0.0",
            paths: {
                "/users": {
                    get: {
                        operationId: "getUsers",
                        responses: {
                            "200": {
                                description: "Success",
                            },
                        },
                    },
                },
            },
            components: {
                schemas: {},
            },
        };

        const { api, queries, mutations } = generateClientFromOpenApi(spec, { reactQuery: true });

        // Should have regular api object
        expect(api).toContain("export const api =");
        expect(api).toContain("export async function getUsers");

        // Should have React Query helpers
        expect(queries).toContain("export function useGetUsersQuery");
        expect(queries).toContain("export function useGetUsers");
    });

    it("should handle multiple operations with mixed query and mutation types", () => {
        const spec: OpenApiSpec = {
            openapi: "3.0.0",
            paths: {
                "/users": {
                    get: {
                        operationId: "listUsers",
                        responses: {
                            "200": {
                                description: "Success",
                            },
                        },
                    },
                    post: {
                        operationId: "createUser",
                        requestBody: {
                            content: {
                                "application/json": {
                                    schema: {
                                        $ref: "#/components/schemas/User",
                                    },
                                },
                            },
                        },
                        responses: {
                            "201": {
                                description: "Created",
                            },
                        },
                    },
                },
                "/users/{id}": {
                    get: {
                        operationId: "getUserById",
                        parameters: [
                            {
                                name: "id",
                                in: "path",
                                required: true,
                                schema: { type: "string" },
                            },
                        ],
                        responses: {
                            "200": {
                                description: "Success",
                            },
                        },
                    },
                    put: {
                        operationId: "updateUser",
                        parameters: [
                            {
                                name: "id",
                                in: "path",
                                required: true,
                                schema: { type: "string" },
                            },
                        ],
                        requestBody: {
                            content: {
                                "application/json": {
                                    schema: {
                                        $ref: "#/components/schemas/User",
                                    },
                                },
                            },
                        },
                        responses: {
                            "200": {
                                description: "Success",
                            },
                        },
                    },
                    delete: {
                        operationId: "deleteUser",
                        parameters: [
                            {
                                name: "id",
                                in: "path",
                                required: true,
                                schema: { type: "string" },
                            },
                        ],
                        responses: {
                            "204": {
                                description: "Deleted",
                            },
                        },
                    },
                },
            },
            components: {
                schemas: {
                    User: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                        },
                        required: ["name"],
                    },
                },
            },
        };

        const { queries, mutations } = generateClientFromOpenApi(spec, { reactQuery: true });

        // Should have query options for GET operations
        expect(queries).toContain("useListUsersQuery");
        expect(queries).toContain("useGetUserByIdQuery");

        // Should have mutation options for POST/PUT/DELETE operations
        expect(mutations).toContain("useCreateUserMutation");
        expect(mutations).toContain("useUpdateUserMutation");
        expect(mutations).toContain("useDeleteUserMutation");

        // Should have custom hooks for all operations
        expect(queries).toContain("useListUsers");
        expect(queries).toContain("useGetUserById");
        expect(mutations).toContain("useCreateUser");
        expect(mutations).toContain("useUpdateUser");
        expect(mutations).toContain("useDeleteUser");
    });
});
