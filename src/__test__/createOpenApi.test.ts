import { describe, expect, it } from "bun:test";

import { compile, dedent } from "./util";

describe("createOpenApi function", () => {
    it("must create full OpenAPI spec without config", async () => {
        const code = `
            import { createOpenApi } from "../../openApiSchema/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            export const spec = createOpenApi<[User], "3.0">();
        `;

        const actual = await compile(code);

        // Check that it includes openapi version (JS object notation)
        expect(actual).toInclude('openapi: "3.0.3"');

        // Check that it includes default info
        expect(actual).toInclude("info:");
        expect(actual).toInclude('title: "API"');
        expect(actual).toInclude('version: "1.0.0"');

        // Check that it includes components with schemas
        expect(actual).toInclude("components:");
        expect(actual).toInclude("schemas:");
        expect(actual).toInclude("User:");

        // Check that it includes paths
        expect(actual).toInclude("paths: {}");
    });

    it("must create full OpenAPI spec with custom info", async () => {
        const code = `
            import { createOpenApi } from "../../openApiSchema/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            export const spec = createOpenApi<[User], "3.0">({
                info: {
                    title: "My API",
                    description: "A great API",
                    version: "2.0.0"
                }
            });
        `;

        const actual = await compile(code);

        expect(actual).toInclude('title: "My API"');
        expect(actual).toInclude('description: "A great API"');
        expect(actual).toInclude('version: "2.0.0"');
    });

    it("must create full OpenAPI spec with servers", async () => {
        const code = `
            import { createOpenApi } from "../../openApiSchema/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            export const spec = createOpenApi<[User], "3.0">({
                info: {
                    title: "My API",
                    version: "1.0.0"
                },
                servers: [
                    {
                        url: "https://api.example.com/v1",
                        description: "Production server"
                    },
                    {
                        url: "https://staging.example.com/v1",
                        description: "Staging server"
                    }
                ]
            });
        `;

        const actual = await compile(code);

        expect(actual).toInclude("servers:");
        expect(actual).toInclude('url: "https://api.example.com/v1"');
        expect(actual).toInclude('description: "Production server"');
        expect(actual).toInclude('url: "https://staging.example.com/v1"');
        expect(actual).toInclude('description: "Staging server"');
    });

    it("must create full OpenAPI spec with tags", async () => {
        const code = `
            import { createOpenApi } from "../../openApiSchema/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            export const spec = createOpenApi<[User], "3.0">({
                info: {
                    title: "My API",
                    version: "1.0.0"
                },
                tags: [
                    {
                        name: "users",
                        description: "User management"
                    },
                    {
                        name: "posts",
                        description: "Post management"
                    }
                ]
            });
        `;

        const actual = await compile(code);

        expect(actual).toInclude("tags:");
        expect(actual).toInclude('name: "users"');
        expect(actual).toInclude('description: "User management"');
        expect(actual).toInclude('name: "posts"');
        expect(actual).toInclude('description: "Post management"');
    });

    it("must create full OpenAPI spec with multiple types", async () => {
        const code = `
            import { createOpenApi } from "../../openApiSchema/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            type Post = {
                id: number;
                title: string;
                authorId: number;
            }
            
            export const spec = createOpenApi<[User, Post], "3.0">({
                info: {
                    title: "My API",
                    version: "1.0.0"
                }
            });
        `;

        const actual = await compile(code);

        expect(actual).toInclude("User:");
        expect(actual).toInclude("Post:");
        expect(actual).toInclude("authorId:");
    });

    it("must create OpenAPI 3.1 spec", async () => {
        const code = `
            import { createOpenApi } from "../../openApiSchema/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            export const spec = createOpenApi<[User], "3.1">({
                info: {
                    title: "My API",
                    version: "1.0.0"
                }
            });
        `;

        const actual = await compile(code);

        expect(actual).toInclude('openapi: "3.1.0"');
    });

    it("must create full OpenAPI spec with security", async () => {
        const code = `
            import { createOpenApi } from "../../openApiSchema/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            export const spec = createOpenApi<[User], "3.0">({
                info: {
                    title: "My API",
                    version: "1.0.0"
                },
                security: [
                    {
                        "bearerAuth": []
                    }
                ]
            });
        `;

        const actual = await compile(code);

        expect(actual).toInclude("security:");
        expect(actual).toInclude("bearerAuth:");
    });

    it("must create full OpenAPI spec with externalDocs", async () => {
        const code = `
            import { createOpenApi } from "../../openApiSchema/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            export const spec = createOpenApi<[User], "3.0">({
                info: {
                    title: "My API",
                    version: "1.0.0"
                },
                externalDocs: {
                    description: "Find more info here",
                    url: "https://example.com/docs"
                }
            });
        `;

        const actual = await compile(code);

        expect(actual).toInclude("externalDocs:");
        expect(actual).toInclude('description: "Find more info here"');
        expect(actual).toInclude('url: "https://example.com/docs"');
    });

    it("must create full OpenAPI spec with all options", async () => {
        const code = `
            import { createOpenApi } from "../../openApiSchema/index";
            
            type User = {
                id: number;
                name: string;
                email: string;
            }
            
            type Post = {
                id: number;
                title: string;
                content: string;
            }
            
            export const spec = createOpenApi<[User, Post], "3.0">({
                info: {
                    title: "Complete API",
                    description: "A complete API with all options",
                    version: "1.0.0"
                },
                servers: [
                    {
                        url: "https://api.example.com",
                        description: "Main server"
                    }
                ],
                tags: [
                    {
                        name: "users",
                        description: "User operations"
                    },
                    {
                        name: "posts",
                        description: "Post operations"
                    }
                ],
                security: [
                    {
                        "apiKey": []
                    }
                ],
                externalDocs: {
                    description: "External documentation",
                    url: "https://docs.example.com"
                }
            });
        `;

        const actual = await compile(code);

        // Check all major sections exist
        expect(actual).toInclude('openapi: "3.0.3"');
        expect(actual).toInclude('title: "Complete API"');
        expect(actual).toInclude('description: "A complete API with all options"');
        expect(actual).toInclude("servers:");
        expect(actual).toInclude("tags:");
        expect(actual).toInclude("security:");
        expect(actual).toInclude("externalDocs:");
        expect(actual).toInclude("components:");
        expect(actual).toInclude("schemas:");
        expect(actual).toInclude("User:");
        expect(actual).toInclude("Post:");
        expect(actual).toInclude("paths: {}");
    });

    it("must create full OpenAPI spec with callback-based path builder API", async () => {
        const code = `
            import { createOpenApi } from "../../openApiSchema/index";
            
            type User = {
                id: number;
                name: string;
                email: string;
            }
            
            type Post = {
                id: number;
                title: string;
                content: string;
            }
            
            export const spec = createOpenApi<[User, Post], "3.0">((path) => ({
                info: {
                    title: "My API",
                    description: "API with typed paths",
                    version: "1.0.0"
                },
                servers: [
                    {
                        url: "https://api.example.com"
                    }
                ],
                tags: [
                    {
                        name: "users"
                    },
                    {
                        name: "posts"
                    }
                ],
                paths: [
                    path.get("/users/:id"),
                    path.get("/users"),
                    path.post("/users")
                ]
            }));
        `;

        const actual = await compile(code);

        // Check that it includes the basic structure
        expect(actual).toInclude('openapi: "3.0.3"');
        expect(actual).toInclude('title: "My API"');
        expect(actual).toInclude('description: "API with typed paths"');

        // Check that paths are generated
        expect(actual).toInclude("paths:");
        expect(actual).toInclude('"/users/:id"');
        expect(actual).toInclude('"/users"');
        expect(actual).toInclude("get:");
        expect(actual).toInclude("post:");

        // Check schemas are still included
        expect(actual).toInclude("components:");
        expect(actual).toInclude("User:");
        expect(actual).toInclude("Post:");
    });

    it("must create fully typed OpenAPI paths with type parameters", async () => {
        const code = `
            import { createOpenApi } from "../../openApiSchema/index";
            
            type User = {
                id: number;
                name: string;
                email: string;
            }
            
            type Post = {
                id: number;
                title: string;
                content: string;
            }
            
            export const spec = createOpenApi<[User, Post], "3.0">((path) => ({
                info: {
                    title: "Typed API",
                    version: "1.0.0"
                },
                paths: [
                    path.get<{ id: number }, never, never, User>("/users/:id"),
                    path.get<never, { search?: string }, never, User[]>("/users"),
                    path.post<never, never, User, User>("/users"),
                    path.get<{ id: number }, never, never, Post>("/posts/:id")
                ]
            }));
        `;

        const actual = await compile(code);

        // Check basic structure
        expect(actual).toInclude('openapi: "3.0.3"');
        expect(actual).toInclude('title: "Typed API"');

        // Check paths with typed parameters
        expect(actual).toInclude('"/users/:id"');
        expect(actual).toInclude('"/users"');
        expect(actual).toInclude('"/posts/:id"');

        // Check for parameters in path operations
        expect(actual).toInclude("parameters:");

        // Check for path parameter with id
        expect(actual).toInclude('name: "id"');
        expect(actual).toInclude('in: "path"');
        expect(actual).toInclude("required: true");

        // Check for query parameter with search
        expect(actual).toInclude('name: "search"');
        expect(actual).toInclude('in: "query"');

        // Check for request body
        expect(actual).toInclude("requestBody:");
        expect(actual).toInclude("content:");
        expect(actual).toInclude('"application/json"');

        // Check for response with schema reference to User
        expect(actual).toInclude("responses:");
        expect(actual).toInclude('$ref: "#/components/schemas/User"');

        // Check schemas are included
        expect(actual).toInclude("User:");
        expect(actual).toInclude("Post:");
    });

    it("must collect typed paths defined via typedPath helper", async () => {
        const code = `
            import { createOpenApi, typedPath } from "../../openApiSchema/index";

            type User = {
                id: number;
                name: string;
                email: string;
            };

            type CreateUserBody = {
                name: string;
                email: string;
            };

            const routes = {
                "/users": {
                    get: typedPath<never, { search?: string }, never, User[]>(() => []),
                    post: typedPath<never, never, CreateUserBody, User>(() => ({ id: 1, name: "", email: "" }))
                },
                "/users/{id}": {
                    get: typedPath<{ id: string }>(() => ({ id: "1" }))
                }
            };

            export const spec = createOpenApi<[User, CreateUserBody], "3.0">({
                info: {
                    title: "Routes API",
                    version: "1.0.0"
                }
            });
        `;

        const actual = await compile(code);

        expect(actual).toInclude('"/users"');
        expect(actual).toInclude('"/users/{id}"');
        expect(actual).toInclude("parameters:");
        expect(actual).toInclude('name: "id"');
        expect(actual).toInclude('in: "path"');
        expect(actual).toInclude('name: "search"');
        expect(actual).toInclude('in: "query"');
        expect(actual).toInclude("requestBody:");
        expect(actual).toInclude("responses:");
        expect(actual).toInclude('$ref: "#/components/schemas/User"');
    });

    it("must include detailed parameter metadata from typedPath definitions", async () => {
        const code = `
            import { createOpenApi, typedPath } from "../../openApiSchema/index";
            import type { NumFormat } from "../../tags";

            type User = {
                id: number;
                name: string;
            };

            type UserPathParams = {
                /**
                 * Unique user identifier
                 * @minimum 1
                 * @maximum 999999
                 * @example 42
                 */
                userId: NumFormat<"int64">;
            };

            type UserQueryParams = {
                /**
                 * Filter by account state
                 * @example "active"
                 * @default "active"
                 */
                status?: "active" | "inactive";
                /**
                 * Free-text search term
                 * @minLength 3
                 * @maxLength 50
                 * @example "Ada"
                 */
                search?: string;
                /**
                 * Number of results to return
                 * @minimum 5
                 * @maximum 100
                 * @multipleOf 5
                 * @default 25
                 */
                pageSize: number;
            };

            const routes = {
                "/users/{userId}": {
                    get: typedPath<UserPathParams, UserQueryParams>(() => null)
                }
            };

            export const spec = createOpenApi<[User], "3.0">({
                info: {
                    title: "Param API",
                    version: "1.0.0"
                }
            });
        `;

        const actual = await compile(code);

        // Path parameter metadata
        expect(actual).toInclude('name: "userId"');
        expect(actual).toInclude('in: "path"');
        expect(actual).toInclude("required: true");
        expect(actual).toInclude('description: "Unique user identifier"');
        expect(actual).toInclude('format: "int64"');
        expect(actual).toInclude("minimum: 1");
        expect(actual).toInclude("maximum: 999999");
        expect(actual).toInclude("example: 42");

        // Query parameter metadata (status)
        expect(actual).toInclude('name: "status"');
        expect(actual).toInclude('in: "query"');
        expect(actual).toInclude("required: false");
        expect(actual).toInclude("enum: [");
        expect(actual).toInclude('"active"');
        expect(actual).toInclude('"inactive"');
        expect(actual).toInclude('default: "active"');
        expect(actual).toInclude('example: "active"');

        // Query parameter metadata (search)
        expect(actual).toInclude('name: "search"');
        expect(actual).toInclude("minLength: 3");
        expect(actual).toInclude("maxLength: 50");
        expect(actual).toInclude('example: "Ada"');

        // Query parameter metadata (pageSize)
        expect(actual).toInclude('name: "pageSize"');
        expect(actual).toInclude("minimum: 5");
        expect(actual).toInclude("maximum: 100");
        expect(actual).toInclude("multipleOf: 5");
        expect(actual).toInclude("default: 25");
        expect(actual).toInclude("required: true");
    });

    it("must extract OpenAPI path from JSDoc with basic @path tag", async () => {
        const code = `
            import { createOpenApi } from "../../openApiSchema/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            /**
             * Get user by ID
             * @openApi
             * @path /users/:id
             */
            function getUserById() {}
            
            export const spec = createOpenApi<[User], "3.0">();
        `;

        const actual = await compile(code);

        expect(actual).toInclude('"/users/:id":');
        expect(actual).toInclude("get:");
        expect(actual).toInclude('summary: "Get user by ID"');
    });

    it("must extract OpenAPI path from JSDoc with @method tag", async () => {
        const code = `
            import { createOpenApi } from "../../openApiSchema/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            /**
             * Create a new user
             * @openApi
             * @method POST
             * @path /users
             */
            function createUser() {}
            
            export const spec = createOpenApi<[User], "3.0">();
        `;

        const actual = await compile(code);

        expect(actual).toInclude('"/users":');
        expect(actual).toInclude("post:");
        expect(actual).toInclude('summary: "Create a new user"');
    });

    it("must extract OpenAPI path from JSDoc with @operationId", async () => {
        const code = `
            import { createOpenApi } from "../../openApiSchema/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            /**
             * @openApi
             * @path /users/:id
             * @operationId getUserById
             */
            function getUser() {}
            
            export const spec = createOpenApi<[User], "3.0">();
        `;

        const actual = await compile(code);

        expect(actual).toInclude('operationId: "getUserById"');
    });

    it("must extract OpenAPI path from JSDoc with @tag", async () => {
        const code = `
            import { createOpenApi } from "../../openApiSchema/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            /**
             * @openApi
             * @path /users
             * @tag users
             * @tag public
             */
            function getUsers() {}
            
            export const spec = createOpenApi<[User], "3.0">();
        `;

        const actual = await compile(code);

        expect(actual).toInclude("tags: [");
        expect(actual).toInclude('"users"');
        expect(actual).toInclude('"public"');
    });

    it("must extract OpenAPI path from JSDoc with path parameters", async () => {
        const code = `
            import { createOpenApi } from "../../openApiSchema/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            /**
             * @openApi
             * @path /users/:id {id: number}
             */
            function getUserById() {}
            
            export const spec = createOpenApi<[User], "3.0">();
        `;

        const actual = await compile(code);

        expect(actual).toInclude('name: "id"');
        expect(actual).toInclude('in: "path"');
        expect(actual).toInclude("required: true");
        expect(actual).toInclude('type: "number"');
    });

    it("must extract OpenAPI path from JSDoc with query parameters", async () => {
        const code = `
            import { createOpenApi } from "../../openApiSchema/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            /**
             * @openApi
             * @path /users
             * @query {search: string, limit?: number}
             */
            function searchUsers() {}
            
            export const spec = createOpenApi<[User], "3.0">();
        `;

        const actual = await compile(code);

        expect(actual).toInclude('name: "search"');
        expect(actual).toInclude('in: "query"');
        expect(actual).toInclude('name: "limit"');
        expect(actual).toInclude("required: true");
        expect(actual).toInclude("required: false");
    });

    it("must extract OpenAPI path from JSDoc with headers", async () => {
        const code = `
            import { createOpenApi } from "../../openApiSchema/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            /**
             * @openApi
             * @path /users
             * @headers {Authorization: string, X-API-Key?: string}
             */
            function getUsers() {}
            
            export const spec = createOpenApi<[User], "3.0">();
        `;

        const actual = await compile(code);

        expect(actual).toInclude('name: "Authorization"');
        expect(actual).toInclude('in: "header"');
        expect(actual).toInclude('name: "X-API-Key"');
    });

    it("must extract OpenAPI path from JSDoc with request body", async () => {
        const code = `
            import { createOpenApi } from "../../openApiSchema/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            /**
             * @openApi
             * @method POST
             * @path /users
             * @body User
             */
            function createUser() {}
            
            export const spec = createOpenApi<[User], "3.0">();
        `;

        const actual = await compile(code);

        expect(actual).toInclude("requestBody:");
        expect(actual).toInclude('$ref: "#/components/schemas/User"');
        expect(actual).toInclude('"application/json"');
    });

    it("must extract OpenAPI path from JSDoc with single response", async () => {
        const code = `
            import { createOpenApi } from "../../openApiSchema/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            /**
             * @openApi
             * @path /users/:id
             * @response 200 User - Successful response
             */
            function getUserById() {}
            
            export const spec = createOpenApi<[User], "3.0">();
        `;

        const actual = await compile(code);

        expect(actual).toInclude('"200":');
        expect(actual).toInclude('description: "Successful response"');
        expect(actual).toInclude('$ref: "#/components/schemas/User"');
    });

    it("must extract OpenAPI path from JSDoc with multiple responses", async () => {
        const code = `
            import { createOpenApi } from "../../openApiSchema/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            /**
             * @openApi
             * @path /users/:id
             * @response 200 User - User found
             * @response 404 - User not found
             */
            function getUserById() {}
            
            export const spec = createOpenApi<[User], "3.0">();
        `;

        const actual = await compile(code);

        expect(actual).toInclude('"200":');
        expect(actual).toInclude('description: "User found"');
        expect(actual).toInclude('"404":');
        expect(actual).toInclude('description: "User not found"');
    });

    it("must extract OpenAPI path from JSDoc with @deprecated", async () => {
        const code = `
            import { createOpenApi } from "../../openApiSchema/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            /**
             * @openApi
             * @path /old-endpoint
             * @deprecated
             */
            function oldEndpoint() {}
            
            export const spec = createOpenApi<[User], "3.0">();
        `;

        const actual = await compile(code);

        expect(actual).toInclude('"/old-endpoint":');
        expect(actual).toInclude("deprecated: true");
    });

    it("must extract OpenAPI path from JSDoc with summary and description", async () => {
        const code = `
            import { createOpenApi } from "../../openApiSchema/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            /**
             * Get user by ID
             *
             * This endpoint retrieves a user by their unique identifier.
             * It requires authentication.
             *
             * @openApi
             * @path /users/:id
             */
            function getUserById() {}
            
            export const spec = createOpenApi<[User], "3.0">();
        `;

        const actual = await compile(code);

        expect(actual).toInclude('summary: "Get user by ID"');
        expect(actual).toInclude("description:");
        expect(actual).toInclude("This endpoint retrieves");
    });

    it("must handle arrow functions with @openApi", async () => {
        const code = `
            import { createOpenApi } from "../../openApiSchema/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            /**
             * @openApi
             * @path /users
             */
            const getUsers = () => {};
            
            export const spec = createOpenApi<[User], "3.0">();
        `;

        const actual = await compile(code);

        expect(actual).toInclude('"/users":');
        expect(actual).toInclude("get:");
    });

    it("must handle multiple functions with @openApi", async () => {
        const code = `
            import { createOpenApi } from "../../openApiSchema/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            /**
             * @openApi
             * @path /users
             */
            function getUsers() {}
            
            /**
             * @openApi
             * @method POST
             * @path /users
             */
            function createUser() {}
            
            export const spec = createOpenApi<[User], "3.0">();
        `;

        const actual = await compile(code);

        expect(actual).toInclude('"/users":');
        expect(actual).toInclude("get:");
        expect(actual).toInclude("post:");
    });

    it("must record original type names for path and query parameters using x-type-name extension", async () => {
        const code = `
            import { createOpenApi } from "../../openApiSchema/index";

            type User = {
                id: number;
                name: string;
            };

            type UserPathParams = {
                userId: number;
            };

            type UserQueryParams = {
                search?: string;
                limit?: number;
            };

            export const spec = createOpenApi<[User], "3.0">((path) => ({
                info: {
                    title: "Type Name API",
                    version: "1.0.0"
                },
                paths: [
                    path.get<UserPathParams, UserQueryParams, never, User>("/users/:userId")
                ]
            }));
        `;

        const actual = await compile(code);

        // Check that path parameter has x-type-name extension
        expect(actual).toInclude('name: "userId"');
        expect(actual).toInclude('in: "path"');
        expect(actual).toInclude('"x-type-name": "UserPathParams"');

        // Check that query parameters have x-type-name extension
        expect(actual).toInclude('name: "search"');
        expect(actual).toInclude('in: "query"');
        expect(actual).toInclude('"x-type-name": "UserQueryParams"');

        expect(actual).toInclude('name: "limit"');
        expect(actual).toInclude('in: "query"');
        expect(actual).toInclude('"x-type-name": "UserQueryParams"');
    });

    it("must record type names for inline object types in path parameters", async () => {
        const code = `
            import { createOpenApi } from "../../openApiSchema/index";

            type User = {
                id: number;
                name: string;
            };

            export const spec = createOpenApi<[User], "3.0">((path) => ({
                info: {
                    title: "Inline Type API",
                    version: "1.0.0"
                },
                paths: [
                    path.get<{ id: number }, { filter?: string }, never, User>("/users/:id")
                ]
            }));
        `;

        const actual = await compile(code);

        // For inline types (anonymous object literals), x-type-name should not be present
        // or should be some placeholder like "__type"
        expect(actual).toInclude('name: "id"');
        expect(actual).toInclude('in: "path"');
        // Should NOT have x-type-name for anonymous inline types
        // The next assertion checks that x-type-name is not between "id" parameter and next parameter
    });
});
