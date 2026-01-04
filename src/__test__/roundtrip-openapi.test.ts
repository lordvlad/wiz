import { describe, expect, it } from "bun:test";

import { generateModelsFromOpenApi, type OpenApiSpec } from "../generator/openapi";
import { compile, dedent } from "./util";

describe("OpenAPI → TypeScript → OpenAPI roundtrip", () => {
    it("should roundtrip basic types", async () => {
        const originalSpec: OpenApiSpec = {
            openapi: "3.0.3",
            components: {
                schemas: {
                    User: {
                        type: "object",
                        properties: {
                            id: { type: "number" },
                            name: { type: "string" },
                            active: { type: "boolean" },
                        },
                        required: ["id", "name", "active"],
                        title: "User",
                    },
                },
            },
        };

        // Step 1: OpenAPI → TypeScript
        const models = generateModelsFromOpenApi(originalSpec);
        const userModel = models.get("User");
        expect(userModel).toBeDefined();

        // Step 2: TypeScript → OpenAPI (via plugin)
        const source = `
            ${userModel}
            import { createOpenApiSchema } from "wiz/openApiSchema";
            export const schema = createOpenApiSchema<[User], "3.0">();
        `;

        const compiled = await compile(source);

        // Verify basic properties are present in schema
        expect(compiled).toContain('components:');
        expect(compiled).toContain('schemas:');
        expect(compiled).toContain('User:');
        expect(compiled).toContain('id:');
        expect(compiled).toContain('name:');
        expect(compiled).toContain('active:');
        expect(compiled).toContain('type: "object"');
        expect(compiled).toContain('type: "number"');
        expect(compiled).toContain('type: "string"');
        expect(compiled).toContain('type: "boolean"');
    });

    it("should roundtrip optional properties", async () => {
        const originalSpec: OpenApiSpec = {
            components: {
                schemas: {
                    User: {
                        type: "object",
                        properties: {
                            id: { type: "number" },
                            email: { type: "string" },
                        },
                        required: ["id"],
                        title: "User",
                    },
                },
            },
        };

        // OpenAPI → TypeScript
        const models = generateModelsFromOpenApi(originalSpec);
        const userModel = models.get("User");

        // TypeScript → OpenAPI
        const source = `
            ${userModel}
            import { createOpenApiSchema } from "wiz/openApiSchema";
            export const schema = createOpenApiSchema<[User], "3.0">();
        `;

        const compiled = await compile(source);

        // Verify optional field roundtrip
        expect(compiled).toContain('required: [\n"id"\n]');
        expect(compiled).toContain('email:');
        expect(compiled).toContain('type: "string"');
    });

    it("should roundtrip array types", async () => {
        const originalSpec: OpenApiSpec = {
            components: {
                schemas: {
                    Post: {
                        type: "object",
                        properties: {
                            tags: {
                                type: "array",
                                items: { type: "string" },
                            },
                        },
                        required: ["tags"],
                        title: "Post",
                    },
                },
            },
        };

        // OpenAPI → TypeScript
        const models = generateModelsFromOpenApi(originalSpec);
        const postModel = models.get("Post");

        // TypeScript → OpenAPI
        const source = `
            ${postModel}
            import { createOpenApiSchema } from "wiz/openApiSchema";
            export const schema = createOpenApiSchema<[Post], "3.0">();
        `;

        const compiled = await compile(source);

        // Verify array type roundtrip
        expect(compiled).toContain('tags:');
        expect(compiled).toContain('type: "array"');
        expect(compiled).toContain('items:');
        expect(compiled).toContain('type: "string"');
    });

    it("should roundtrip nested objects with $ref", async () => {
        const originalSpec: OpenApiSpec = {
            components: {
                schemas: {
                    Address: {
                        type: "object",
                        properties: {
                            street: { type: "string" },
                            city: { type: "string" },
                        },
                        required: ["street", "city"],
                        title: "Address",
                    },
                    User: {
                        type: "object",
                        properties: {
                            id: { type: "number" },
                            address: { $ref: "#/components/schemas/Address" },
                        },
                        required: ["id", "address"],
                        title: "User",
                    },
                },
            },
        };

        // OpenAPI → TypeScript
        const models = generateModelsFromOpenApi(originalSpec);
        const addressModel = models.get("Address");
        const userModel = models.get("User");

        // TypeScript → OpenAPI
        const source = `
            ${addressModel}
            ${userModel}
            import { createOpenApiSchema } from "wiz/openApiSchema";
            export const schema = createOpenApiSchema<[Address, User], "3.0">();
        `;

        const compiled = await compile(source);

        // Verify both types exist and $ref is used
        expect(compiled).toContain('Address:');
        expect(compiled).toContain('User:');
        expect(compiled).toContain('$ref: "#/components/schemas/Address"');
    });

    it("should roundtrip nullable types (OpenAPI 3.0)", async () => {
        const originalSpec: OpenApiSpec = {
            components: {
                schemas: {
                    User: {
                        type: "object",
                        properties: {
                            name: {
                                type: "string",
                                nullable: true,
                            },
                        },
                        required: ["name"],
                        title: "User",
                    },
                },
            },
        };

        // OpenAPI → TypeScript
        const models = generateModelsFromOpenApi(originalSpec);
        const userModel = models.get("User");
        expect(userModel).toContain("string | null");

        // TypeScript → OpenAPI
        const source = `
            ${userModel}
            import { createOpenApiSchema } from "wiz/openApiSchema";
            export const schema = createOpenApiSchema<[User], "3.0">();
        `;

        const compiled = await compile(source);

        // Verify nullable in 3.0 format
        expect(compiled).toContain('nullable: true');
        expect(compiled).toContain('type: "string"');
    });

    it("should roundtrip nullable types (OpenAPI 3.1)", async () => {
        const originalSpec: OpenApiSpec = {
            components: {
                schemas: {
                    User: {
                        type: "object",
                        properties: {
                            name: {
                                type: ["string", "null"],
                            },
                        },
                        required: ["name"],
                        title: "User",
                    },
                },
            },
        };

        // OpenAPI → TypeScript (handles both 3.0 and 3.1)
        const models = generateModelsFromOpenApi(originalSpec);
        const userModel = models.get("User");
        expect(userModel).toContain("string | null");

        // TypeScript → OpenAPI 3.1
        const source = `
            ${userModel}
            import { createOpenApiSchema } from "wiz/openApiSchema";
            export const schema = createOpenApiSchema<[User], "3.1">();
        `;

        const compiled = await compile(source);

        // Verify nullable in 3.1 format (type array)
        expect(compiled).toContain('type: [\n"string",\n"null"\n]');
    });

    it("should roundtrip union types with oneOf", async () => {
        const originalSpec: OpenApiSpec = {
            components: {
                schemas: {
                    Pet: {
                        oneOf: [
                            {
                                type: "object",
                                properties: {
                                    type: { type: "string", enum: ["dog"] },
                                    bark: { type: "boolean" },
                                },
                                required: ["type", "bark"],
                            },
                            {
                                type: "object",
                                properties: {
                                    type: { type: "string", enum: ["cat"] },
                                    meow: { type: "boolean" },
                                },
                                required: ["type", "meow"],
                            },
                        ],
                        title: "Pet",
                    },
                },
            },
        };

        // OpenAPI → TypeScript
        const models = generateModelsFromOpenApi(originalSpec);
        const petModel = models.get("Pet");
        expect(petModel).toContain("|");

        // TypeScript → OpenAPI
        const source = `
            ${petModel}
            import { createOpenApiSchema } from "wiz/openApiSchema";
            export const schema = createOpenApiSchema<[Pet], "3.0">();
        `;

        const compiled = await compile(source);

        // Verify oneOf exists
        expect(compiled).toContain('oneOf:');
        expect(compiled).toContain('bark:');
        expect(compiled).toContain('meow:');
    });

    it("should roundtrip enum types", async () => {
        const originalSpec: OpenApiSpec = {
            components: {
                schemas: {
                    Status: {
                        type: "string",
                        enum: ["active", "inactive", "pending"],
                        title: "Status",
                    },
                },
            },
        };

        // OpenAPI → TypeScript
        const models = generateModelsFromOpenApi(originalSpec);
        const statusModel = models.get("Status");
        expect(statusModel).toContain('"active"');
        expect(statusModel).toContain('"inactive"');
        expect(statusModel).toContain('"pending"');

        // TypeScript → OpenAPI
        const source = `
            ${statusModel}
            import { createOpenApiSchema } from "wiz/openApiSchema";
            export const schema = createOpenApiSchema<[Status], "3.0">();
        `;

        const compiled = await compile(source);

        // Verify enum values are present
        expect(compiled).toContain('enum:');
        expect(compiled).toContain('"active"');
        expect(compiled).toContain('"inactive"');
        expect(compiled).toContain('"pending"');
    });

    it("should roundtrip additionalProperties (Record types)", async () => {
        const originalSpec: OpenApiSpec = {
            components: {
                schemas: {
                    Config: {
                        type: "object",
                        properties: {
                            version: { type: "number" },
                        },
                        required: ["version"],
                        additionalProperties: { type: "string" },
                        title: "Config",
                    },
                },
            },
        };

        // OpenAPI → TypeScript
        const models = generateModelsFromOpenApi(originalSpec);
        const configModel = models.get("Config");
        expect(configModel).toContain("[key: string]: string");

        // TypeScript → OpenAPI
        const source = `
            ${configModel}
            import { createOpenApiSchema } from "wiz/openApiSchema";
            export const schema = createOpenApiSchema<[Config], "3.0">();
        `;

        const compiled = await compile(source);

        // Verify additionalProperties
        expect(compiled).toContain('additionalProperties:');
        expect(compiled).toContain('type: "string"');
    });
});
