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
        expect(api).toContain("baseUrl: string;");
        expect(api).toContain("headers: Record<string, string>;");
        expect(api).toContain("fetch: typeof fetch;");
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

        // The default baseUrl should be set in globalConfig initialization
        expect(api).toContain('baseUrl: "https://api.example.com"');
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
        expect(api).toContain("...(init?.headers || {})");
    });

    it("should support custom fetch implementation in config", () => {
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

        // Check that ApiConfig includes required fetch field
        expect(api).toContain("export interface ApiConfig");
        expect(api).toContain("fetch: typeof fetch;");

        // Check that setApiConfig accepts Partial<ApiConfig & { oauthBearerProvider: ... }>
        expect(api).toContain("setApiConfig(config: Partial<ApiConfig & { oauthBearerProvider: () => Promise<string> | string }>)");

        // Check that getApiConfig is synchronous
        expect(api).toContain("export function getApiConfig(): ApiConfig");
        expect(api).not.toContain("async function getApiConfig");

        // Check that fetch implementation is used directly from globalConfig
        expect(api).toContain("globalConfig.fetch");
        expect(api).toContain("const response = await globalConfig.fetch(fullUrl, options)");
        expect(api).toContain("return response;");
    });

    it("should generate client with wiz validation when wizValidator option is enabled", () => {
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
                    get: {
                        operationId: "listUsers",
                        parameters: [
                            {
                                name: "page",
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

        const { api } = generateClientFromOpenApi(spec, { wizValidator: true });

        // Check that validator is imported
        expect(api).toContain('import { createValidator } from "wiz/validator"');

        // Check that TypedResponse interface is defined
        expect(api).toContain("export interface TypedResponse<T> extends Response");
        expect(api).toContain("json(): Promise<T>");

        // Check that createTypedResponse helper function is defined
        expect(api).toContain("function createTypedResponse<T>(");
        expect(api).toContain("validator: (value: unknown) => any[]");
        expect(api).toContain("new Proxy(response");

        // Check that validators are created for model types (request/response bodies)
        expect(api).toContain("validateUser = createValidator<Models.User>()");
        expect(api).toContain("validateCreateUserRequest = createValidator<Models.CreateUserRequest>()");

        // Check that validators are created for path params
        expect(api).toContain("validateGetUserByIdPathParams = createValidator<GetUserByIdPathParams>()");

        // Check that validators are created for query params
        expect(api).toContain("validateListUsersQueryParams = createValidator<ListUsersQueryParams>()");

        // Check that validation calls exist in method bodies
        expect(api).toContain("// Validate path parameters");
        expect(api).toContain("const pathParamsErrors = validateGetUserByIdPathParams(pathParams)");
        expect(api).toContain('throw new TypeError("Invalid path parameters: " + JSON.stringify(pathParamsErrors))');

        expect(api).toContain("// Validate query parameters");
        expect(api).toContain("const queryParamsErrors = validateListUsersQueryParams(queryParams)");
        expect(api).toContain('throw new TypeError("Invalid query parameters: " + JSON.stringify(queryParamsErrors))');

        expect(api).toContain("// Validate request body");
        expect(api).toContain("const requestBodyErrors = validateCreateUserRequest(requestBody)");
        expect(api).toContain('throw new TypeError("Invalid request body: " + JSON.stringify(requestBodyErrors))');

        // Check that TypedResponse is returned for methods with response body types
        expect(api).toContain("Promise<TypedResponse<Models.User>>");
        expect(api).toContain("return createTypedResponse<Models.User>(response, validateUser)");

        // Check that regular Response is returned for methods without response body types
        expect(api).toContain("listUsers(queryParams?: ListUsersQueryParams, init?: RequestInit): Promise<Response>");
    });

    it("should not include validation code when wizValidator is false", () => {
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
                            },
                        },
                    },
                },
            },
            components: {
                schemas: {},
            },
        };

        const { api } = generateClientFromOpenApi(spec, { wizValidator: false });

        // Check that validator is NOT imported
        expect(api).not.toContain("createValidator");

        // Check that validation calls do NOT exist
        expect(api).not.toContain("// Validate path parameters");
        expect(api).not.toContain("pathParamsErrors");
        expect(api).not.toContain("// Validate query parameters");
        expect(api).not.toContain("// Validate request body");
        expect(api).not.toContain("// Validate response body");
    });

    it("should support oauthBearerProvider in setApiConfig", () => {
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

        // Check that setApiConfig accepts oauthBearerProvider
        expect(api).toContain("oauthBearerProvider: () => Promise<string> | string");
        // Check that it wraps the fetch function
        expect(api).toContain('if ("oauthBearerProvider" in config)');
        expect(api).toContain("const originalFetch = globalConfig.fetch;");
        expect(api).toContain("const token = await config.oauthBearerProvider!();");
        expect(api).toContain("'Authorization': `Bearer ${token}`");
    });

    it("should not include bearer token logic in generated methods", () => {
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

        // Bearer token handling should NOT be in the generated methods
        // It's centralized in the wrapped fetch function from setApiConfig
        expect(api).not.toContain("// Add bearer token if configured");
        expect(api).not.toContain("if (globalConfig.bearerTokenProvider)");
    });
});
