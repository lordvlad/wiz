import { describe, expect, it } from "bun:test";

import type { OpenApiSpec } from "../generator/openapi";
import { generateClientFromOpenApi } from "../generator/openapi-client";

describe("OpenAPI to TypeScript client generator", () => {
    it("should generate a basic client with GET method", () => {
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

        const { api } = generateClientFromOpenApi(spec);

        expect(api).toContain("export const api =");
        expect(api).toContain("getUsers");
        expect(api).toContain('method: "GET"');
        expect(api).toContain("/users");
    });

    it("should generate client with path parameters", () => {
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

        const { api } = generateClientFromOpenApi(spec);

        expect(api).toContain("getUserById");
        expect(api).toContain("pathParams:");
        expect(api).toContain("GetUserByIdPathParams");
        expect(api).toContain("id:");
    });

    it("should generate client with query parameters", () => {
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

        const { api } = generateClientFromOpenApi(spec);

        expect(api).toContain("listUsers");
        expect(api).toContain("queryParams?:");
        expect(api).toContain("ListUsersQueryParams");
        expect(api).toContain("page?:");
        expect(api).toContain("limit?:");
    });

    it("should generate client with POST method and request body", () => {
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
                            email: { type: "string" },
                        },
                        required: ["name", "email"],
                    },
                },
            },
        };

        const { api } = generateClientFromOpenApi(spec);

        expect(api).toContain("createUser");
        expect(api).toContain('method: "POST"');
        expect(api).toContain("requestBody: User");
        expect(api).toContain("JSON.stringify(requestBody)");
    });

    it("should use operationId when available", () => {
        const spec: OpenApiSpec = {
            openapi: "3.0.0",
            paths: {
                "/users/{id}": {
                    get: {
                        operationId: "fetchUserDetails",
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
                },
            },
            components: {
                schemas: {},
            },
        };

        const { api } = generateClientFromOpenApi(spec);

        expect(api).toContain("fetchUserDetails");
        expect(api).not.toContain("getUsersId");
    });

    it("should fallback to methodPath when operationId is missing", () => {
        const spec: OpenApiSpec = {
            openapi: "3.0.0",
            paths: {
                "/api/users/{id}": {
                    get: {
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
                },
            },
            components: {
                schemas: {},
            },
        };

        const { api } = generateClientFromOpenApi(spec);

        expect(api).toContain("getApiUsers");
    });

    it("should throw error on duplicate method names", () => {
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
                "/admin/users": {
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

        expect(() => generateClientFromOpenApi(spec)).toThrow("Duplicate method names detected");
        expect(() => generateClientFromOpenApi(spec)).toThrow("getUsers");
    });

    it("should generate config interface", () => {
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

        const { api } = generateClientFromOpenApi(spec);

        expect(api).toContain("export interface ApiConfig");
        expect(api).toContain("baseUrl?:");
        expect(api).toContain("headers?:");
        expect(api).toContain("export function setApiConfig");
        expect(api).toContain("export function getApiConfig");
    });

    it("should use default base URL from servers", () => {
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

        const { api } = generateClientFromOpenApi(spec);

        // The default baseUrl should be used in the method body
        expect(api).toContain('const baseUrl = config.baseUrl || "https://api.example.com" || "";');
    });

    it("should generate models alongside API", () => {
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
                            email: { type: "string" },
                        },
                        required: ["name", "email"],
                    },
                },
            },
        };

        const { models, api } = generateClientFromOpenApi(spec);

        expect(models).toContain("export type User =");
        expect(models).toContain("name: string;");
        expect(models).toContain("email: string;");
        expect(api).toContain("createUser");
    });

    it("should handle multiple HTTP methods on same path", () => {
        const spec: OpenApiSpec = {
            openapi: "3.0.0",
            paths: {
                "/users/{id}": {
                    get: {
                        operationId: "getUser",
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

        const { api } = generateClientFromOpenApi(spec);

        expect(api).toContain("getUser");
        expect(api).toContain("updateUser");
        expect(api).toContain("deleteUser");
        expect(api).toContain('method: "GET"');
        expect(api).toContain('method: "PUT"');
        expect(api).toContain('method: "DELETE"');
    });

    it("should include summary and description in JSDoc", () => {
        const spec: OpenApiSpec = {
            openapi: "3.0.0",
            paths: {
                "/users": {
                    get: {
                        operationId: "getUsers",
                        summary: "List all users",
                        description: "Retrieves a list of all users in the system",
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

        const { api } = generateClientFromOpenApi(spec);

        expect(api).toContain("/**");
        expect(api).toContain("List all users");
        expect(api).toContain("Retrieves a list of all users in the system");
        expect(api).toContain("*/");
    });

    it("should accept optional fetch init override", () => {
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

        const { api } = generateClientFromOpenApi(spec);

        expect(api).toContain("init?: RequestInit");
        expect(api).toContain("...init");
        expect(api).toContain("...init?.headers");
    });
});
