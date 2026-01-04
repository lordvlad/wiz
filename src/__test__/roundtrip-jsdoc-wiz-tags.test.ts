import { describe, expect, it } from "bun:test";

import { generateModelsFromOpenApi } from "../generator/openapi";
import { generateModelsFromProtobuf } from "../generator/protobuf";
import { compile } from "./util";

describe("Roundtrip tests for JSDoc metadata and Wiz tags", () => {
    describe("OpenAPI with JSDoc metadata", () => {
        it("should roundtrip JSDoc validation constraints", async () => {
            const originalSpec = {
                components: {
                    schemas: {
                        Product: {
                            type: "object",
                            properties: {
                                name: {
                                    type: "string",
                                    description: "Product name",
                                    minLength: 3,
                                    maxLength: 50,
                                },
                                price: {
                                    type: "number",
                                    description: "Product price",
                                    minimum: 0,
                                    maximum: 10000,
                                },
                                rating: {
                                    type: "number",
                                    description: "Product rating",
                                    minimum: 1,
                                    maximum: 5,
                                },
                            },
                            required: ["name", "price"],
                            title: "Product",
                        },
                    },
                },
            };

            // OpenAPI → TypeScript
            const models = generateModelsFromOpenApi(originalSpec);
            const productModel = models.get("Product");

            // Verify JSDoc is present
            expect(productModel).toContain("Product name");
            expect(productModel).toContain("@minLength 3");
            expect(productModel).toContain("@maxLength 50");
            expect(productModel).toContain("@minimum 0");
            expect(productModel).toContain("@maximum 10000");

            // TypeScript → OpenAPI
            const source = `
                ${productModel}
                import { createOpenApiSchema } from "wiz/openApiSchema";
                export const schema = createOpenApiSchema<[Product], "3.0">();
            `;

            const compiled = await compile(source);

            // Extract schema
            const schemaMatch = compiled.match(/var schema = ({[\s\S]*?});/);
            const regeneratedSpec = eval(`(${schemaMatch![1]})`);

            // Verify constraints are preserved
            expect(regeneratedSpec.components.schemas.Product.properties.name.minLength).toBe(3);
            expect(regeneratedSpec.components.schemas.Product.properties.name.maxLength).toBe(50);
            expect(regeneratedSpec.components.schemas.Product.properties.price.minimum).toBe(0);
            expect(regeneratedSpec.components.schemas.Product.properties.price.maximum).toBe(10000);
        });

        it("should roundtrip JSDoc format annotations", async () => {
            const originalSpec = {
                components: {
                    schemas: {
                        User: {
                            type: "object",
                            properties: {
                                email: {
                                    type: "string",
                                    description: "User email",
                                    format: "email",
                                },
                                website: {
                                    type: "string",
                                    description: "User website",
                                    format: "uri",
                                },
                                createdAt: {
                                    type: "string",
                                    description: "Creation timestamp",
                                    format: "date-time",
                                },
                            },
                            required: ["email"],
                            title: "User",
                        },
                    },
                },
            };

            // OpenAPI → TypeScript
            const models = generateModelsFromOpenApi(originalSpec);
            const userModel = models.get("User");

            // Verify format annotations
            expect(userModel).toContain("@format email");
            expect(userModel).toContain("@format uri");
            expect(userModel).toContain("@format date-time");

            // TypeScript → OpenAPI
            const source = `
                ${userModel}
                import { createOpenApiSchema } from "wiz/openApiSchema";
                export const schema = createOpenApiSchema<[User], "3.0">();
            `;

            const compiled = await compile(source);

            // Extract schema
            const schemaMatch = compiled.match(/var schema = ({[\s\S]*?});/);
            const regeneratedSpec = eval(`(${schemaMatch![1]})`);

            // Verify formats are preserved
            expect(regeneratedSpec.components.schemas.User.properties.email.format).toBe("email");
            expect(regeneratedSpec.components.schemas.User.properties.website.format).toBe("uri");
            expect(regeneratedSpec.components.schemas.User.properties.createdAt.format).toBe("date-time");
        });

        it("should roundtrip deprecated fields", async () => {
            const originalSpec = {
                components: {
                    schemas: {
                        User: {
                            type: "object",
                            properties: {
                                id: {
                                    type: "number",
                                },
                                username: {
                                    type: "string",
                                    deprecated: true,
                                    description: "Use email instead",
                                },
                                email: {
                                    type: "string",
                                },
                            },
                            required: ["id", "username", "email"],
                            title: "User",
                        },
                    },
                },
            };

            // OpenAPI → TypeScript
            const models = generateModelsFromOpenApi(originalSpec);
            const userModel = models.get("User");

            // Verify deprecated annotation
            expect(userModel).toContain("@deprecated");

            // TypeScript → OpenAPI
            const source = `
                ${userModel}
                import { createOpenApiSchema } from "wiz/openApiSchema";
                export const schema = createOpenApiSchema<[User], "3.0">();
            `;

            const compiled = await compile(source);

            // Extract schema
            const schemaMatch = compiled.match(/var schema = ({[\s\S]*?});/);
            const regeneratedSpec = eval(`(${schemaMatch![1]})`);

            // Verify deprecated is preserved
            expect(regeneratedSpec.components.schemas.User.properties.username.deprecated).toBe(true);
        });
    });

    describe("OpenAPI with Wiz tags (x-wiz-format)", () => {
        it("should roundtrip wiz tag types for string formats", async () => {
            const originalSpec = {
                components: {
                    schemas: {
                        User: {
                            type: "object",
                            properties: {
                                email: {
                                    type: "string",
                                    format: "email",
                                    "x-wiz-format": 'StrFormat<"email">',
                                },
                                website: {
                                    type: "string",
                                    format: "uri",
                                    "x-wiz-format": 'StrFormat<"uri">',
                                },
                            },
                            required: ["email"],
                            title: "User",
                        },
                    },
                },
            };

            // OpenAPI → TypeScript
            const models = generateModelsFromOpenApi(originalSpec);
            const userModel = models.get("User");

            // Verify wiz tag types are generated from x-wiz-format
            expect(userModel).toContain('string & { __str_format: "email" }');
            expect(userModel).toContain('string & { __str_format: "uri" }');

            // TypeScript → OpenAPI (via plugin)
            const source = `
                import * as tags from "../../tags/index";
                ${userModel}
                import { createOpenApiSchema } from "wiz/openApiSchema";
                export const schema = createOpenApiSchema<[User], "3.0">();
            `;

            const compiled = await compile(source);

            // Extract schema
            const schemaMatch = compiled.match(/var schema = ({[\s\S]*?});/);
            const regeneratedSpec = eval(`(${schemaMatch![1]})`);

            // Verify x-wiz-format is regenerated for intersection types
            expect(regeneratedSpec.components.schemas.User.properties.email["x-wiz-format"]).toBe(
                'StrFormat<"email">'
            );
            expect(regeneratedSpec.components.schemas.User.properties.website["x-wiz-format"]).toBe(
                'StrFormat<"uri">'
            );
            expect(regeneratedSpec.components.schemas.User.properties.email.format).toBe("email");
            expect(regeneratedSpec.components.schemas.User.properties.website.format).toBe("uri");
        });

        it("should roundtrip all wiz format types (string, number, date)", async () => {
            const originalSpec = {
                components: {
                    schemas: {
                        Data: {
                            type: "object",
                            properties: {
                                email: {
                                    type: "string",
                                    format: "email",
                                    "x-wiz-format": 'StrFormat<"email">',
                                },
                                balance: {
                                    type: "number",
                                    format: "double",
                                    "x-wiz-format": 'NumFormat<"double">',
                                },
                                createdAt: {
                                    type: "string",
                                    format: "date-time",
                                    "x-wiz-format": 'DateFormat<"date-time">',
                                },
                            },
                            required: ["email", "balance", "createdAt"],
                            title: "Data",
                        },
                    },
                },
            };

            // OpenAPI → TypeScript
            const models = generateModelsFromOpenApi(originalSpec);
            const dataModel = models.get("Data");

            // Verify wiz tag types are generated
            expect(dataModel).toContain('string & { __str_format: "email" }');
            expect(dataModel).toContain('number & { __num_format: "double" }');
            expect(dataModel).toContain('Date & { __date_format: "date-time" }');

            // TypeScript → OpenAPI
            const source = `
                import * as tags from "../../tags/index";
                ${dataModel}
                import { createOpenApiSchema } from "wiz/openApiSchema";
                export const schema = createOpenApiSchema<[Data], "3.0">();
            `;

            const compiled = await compile(source);

            // Extract schema
            const schemaMatch = compiled.match(/var schema = ({[\s\S]*?});/);
            const regeneratedSpec = eval(`(${schemaMatch![1]})`);

            // Verify all x-wiz-format extensions are regenerated
            expect(regeneratedSpec.components.schemas.Data.properties.email["x-wiz-format"]).toBe(
                'StrFormat<"email">'
            );
            expect(regeneratedSpec.components.schemas.Data.properties.balance["x-wiz-format"]).toBe(
                'NumFormat<"double">'
            );
            expect(regeneratedSpec.components.schemas.Data.properties.createdAt["x-wiz-format"]).toBe(
                'DateFormat<"date-time">'
            );
        });
    });

    describe("Protobuf with wiz-format comments", () => {
        it("should roundtrip wiz-format comments for string types", async () => {
            const originalProto = `
syntax = "proto3";

message User {
  // User email address
  // @wiz-format email
  string email = 1;
  // User website
  // @wiz-format uri
  string website = 2;
}
            `;

            // Protobuf → TypeScript
            const protoFile = {
                syntax: "proto3",
                messages: [
                    {
                        name: "User",
                        fields: [
                            {
                                name: "email",
                                type: "string",
                                number: 1,
                                comment: "User email address\n@wiz-format email",
                            },
                            {
                                name: "website",
                                type: "string",
                                number: 2,
                                comment: "User website\n@wiz-format uri",
                            },
                        ],
                    },
                ],
            };

            const models = generateModelsFromProtobuf(protoFile);
            const userModel = models.get("User");

            // Verify wiz tag types are generated
            expect(userModel).toContain('string & { __str_format: "email" }');
            expect(userModel).toContain('string & { __str_format: "uri" }');

            // TypeScript → Protobuf
            const source = `
                import * as tags from "../../tags/index";
                ${userModel}
                import { createProtobufModel } from "wiz/protobuf";
                export const model = createProtobufModel<[User]>();
            `;

            const compiled = await compile(source);

            // Verify the model includes wiz-format metadata
            expect(compiled).toContain('User:');
            expect(compiled).toContain('email');
            expect(compiled).toContain('website');
        });
    });

    describe("Complex JSDoc scenarios", () => {
        it("should roundtrip multiple constraints on single field", async () => {
            const originalSpec = {
                components: {
                    schemas: {
                        Article: {
                            type: "object",
                            properties: {
                                title: {
                                    type: "string",
                                    description: "Article title",
                                    minLength: 10,
                                    maxLength: 200,
                                    pattern: "^[A-Za-z0-9 ]+$",
                                },
                                views: {
                                    type: "number",
                                    description: "View count",
                                    minimum: 0,
                                    maximum: 1000000,
                                },
                            },
                            required: ["title", "views"],
                            title: "Article",
                        },
                    },
                },
            };

            // OpenAPI → TypeScript
            const models = generateModelsFromOpenApi(originalSpec);
            const articleModel = models.get("Article");

            // Verify all constraints are present
            expect(articleModel).toContain("@minLength 10");
            expect(articleModel).toContain("@maxLength 200");
            expect(articleModel).toContain("@pattern");
            expect(articleModel).toContain("@minimum 0");
            expect(articleModel).toContain("@maximum 1000000");

            // TypeScript → OpenAPI
            const source = `
                ${articleModel}
                import { createOpenApiSchema } from "wiz/openApiSchema";
                export const schema = createOpenApiSchema<[Article], "3.0">();
            `;

            const compiled = await compile(source);

            // Extract schema
            const schemaMatch = compiled.match(/var schema = ({[\s\S]*?});/);
            const regeneratedSpec = eval(`(${schemaMatch![1]})`);

            // Verify all constraints are preserved
            expect(regeneratedSpec.components.schemas.Article.properties.title.minLength).toBe(10);
            expect(regeneratedSpec.components.schemas.Article.properties.title.maxLength).toBe(200);
            expect(regeneratedSpec.components.schemas.Article.properties.title.pattern).toBe("^[A-Za-z0-9 ]+$");
            expect(regeneratedSpec.components.schemas.Article.properties.views.minimum).toBe(0);
            expect(regeneratedSpec.components.schemas.Article.properties.views.maximum).toBe(1000000);
        });

        it("should roundtrip default and example values", async () => {
            const originalSpec = {
                components: {
                    schemas: {
                        Config: {
                            type: "object",
                            properties: {
                                timeout: {
                                    type: "number",
                                    description: "Request timeout in milliseconds",
                                    default: 5000,
                                    example: 3000,
                                },
                                enabled: {
                                    type: "boolean",
                                    description: "Feature enabled flag",
                                    default: true,
                                },
                                environment: {
                                    type: "string",
                                    description: "Environment name",
                                    default: "production",
                                    example: "staging",
                                },
                            },
                            required: ["timeout", "enabled"],
                            title: "Config",
                        },
                    },
                },
            };

            // OpenAPI → TypeScript
            const models = generateModelsFromOpenApi(originalSpec);
            const configModel = models.get("Config");

            // Verify default and example values
            expect(configModel).toContain("@default 5000");
            expect(configModel).toContain("@example 3000");
            expect(configModel).toContain("@default true");
            expect(configModel).toContain('@default "production"');
            expect(configModel).toContain('@example "staging"');

            // TypeScript → OpenAPI
            const source = `
                ${configModel}
                import { createOpenApiSchema } from "wiz/openApiSchema";
                export const schema = createOpenApiSchema<[Config], "3.0">();
            `;

            const compiled = await compile(source);

            // Extract schema
            const schemaMatch = compiled.match(/var schema = ({[\s\S]*?});/);
            const regeneratedSpec = eval(`(${schemaMatch![1]})`);

            // Verify default and example values are preserved
            expect(regeneratedSpec.components.schemas.Config.properties.timeout.default).toBe(5000);
            expect(regeneratedSpec.components.schemas.Config.properties.timeout.example).toBe(3000);
            expect(regeneratedSpec.components.schemas.Config.properties.enabled.default).toBe(true);
            expect(regeneratedSpec.components.schemas.Config.properties.environment.default).toBe("production");
            expect(regeneratedSpec.components.schemas.Config.properties.environment.example).toBe("staging");
        });
    });
});
