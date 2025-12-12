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
});
