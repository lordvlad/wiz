import { describe, expect, it } from 'bun:test';
import { compile, dedent } from './util';

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
        expect(actual).toInclude('info:');
        expect(actual).toInclude('title: "API"');
        expect(actual).toInclude('version: "1.0.0"');
        
        // Check that it includes components with schemas
        expect(actual).toInclude('components:');
        expect(actual).toInclude('schemas:');
        expect(actual).toInclude('User:');
        
        // Check that it includes paths
        expect(actual).toInclude('paths: {}');
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
        
        expect(actual).toInclude('servers:');
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
        
        expect(actual).toInclude('tags:');
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
        
        expect(actual).toInclude('User:');
        expect(actual).toInclude('Post:');
        expect(actual).toInclude('authorId:');
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
        
        expect(actual).toInclude('security:');
        expect(actual).toInclude('bearerAuth:');
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
        
        expect(actual).toInclude('externalDocs:');
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
        expect(actual).toInclude('servers:');
        expect(actual).toInclude('tags:');
        expect(actual).toInclude('security:');
        expect(actual).toInclude('externalDocs:');
        expect(actual).toInclude('components:');
        expect(actual).toInclude('schemas:');
        expect(actual).toInclude('User:');
        expect(actual).toInclude('Post:');
        expect(actual).toInclude('paths: {}');
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
        expect(actual).toInclude('paths:');
        expect(actual).toInclude('"/users/:id"');
        expect(actual).toInclude('"/users"');
        expect(actual).toInclude('get:');
        expect(actual).toInclude('post:');
        
        // Check schemas are still included
        expect(actual).toInclude('components:');
        expect(actual).toInclude('User:');
        expect(actual).toInclude('Post:');
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
        expect(actual).toInclude('parameters:');
        
        // Check for path parameter with id
        expect(actual).toInclude('name: "id"');
        expect(actual).toInclude('in: "path"');
        expect(actual).toInclude('required: true');
        
        // Check for query parameter with search
        expect(actual).toInclude('name: "search"');
        expect(actual).toInclude('in: "query"');
        
        // Check for request body
        expect(actual).toInclude('requestBody:');
        expect(actual).toInclude('content:');
        expect(actual).toInclude('"application/json"');
        
        // Check for response with schema reference to User
        expect(actual).toInclude('responses:');
        expect(actual).toInclude('$ref: "#/components/schemas/User"');
        
        // Check schemas are included
        expect(actual).toInclude('User:');
        expect(actual).toInclude('Post:');
    });
});
