import { describe, expect, it } from "bun:test";

import { generateModelsFromOpenApi } from "../generator/openapi";
import type { OpenApiSpec } from "../generator/openapi";

describe("OpenAPI to TypeScript generator", () => {
    it("should generate a simple type from schema", () => {
        const spec: OpenApiSpec = {
            components: {
                schemas: {
                    User: {
                        type: "object",
                        properties: {
                            id: { type: "number" },
                            name: { type: "string" },
                        },
                        required: ["id", "name"],
                    },
                },
            },
        };

        const models = generateModelsFromOpenApi(spec);
        expect(models.size).toBe(1);

        const userModel = models.get("User");
        expect(userModel).toBeDefined();
        expect(userModel).toContain("export type User =");
        expect(userModel).toContain("id: number;");
        expect(userModel).toContain("name: string;");
    });

    it("should generate optional properties", () => {
        const spec: OpenApiSpec = {
            components: {
                schemas: {
                    User: {
                        type: "object",
                        properties: {
                            id: { type: "number" },
                            email: { type: "string" },
                        },
                        required: ["id"],
                    },
                },
            },
        };

        const models = generateModelsFromOpenApi(spec);
        const userModel = models.get("User");

        expect(userModel).toContain("id: number;");
        expect(userModel).toContain("email?: string;");
    });

    it("should generate array types", () => {
        const spec: OpenApiSpec = {
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
                    },
                },
            },
        };

        const models = generateModelsFromOpenApi(spec);
        const postModel = models.get("Post");

        expect(postModel).toContain("tags: string[];");
    });

    it("should generate JSDoc comments with description", () => {
        const spec: OpenApiSpec = {
            components: {
                schemas: {
                    User: {
                        type: "object",
                        description: "Represents a user in the system",
                        properties: {
                            id: { type: "number" },
                        },
                        required: ["id"],
                    },
                },
            },
        };

        const models = generateModelsFromOpenApi(spec);
        const userModel = models.get("User");

        expect(userModel).toContain("/**");
        expect(userModel).toContain("Represents a user in the system");
        expect(userModel).toContain("*/");
    });

    it("should generate JSDoc with validation constraints", () => {
        const spec: OpenApiSpec = {
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
                                minimum: 0,
                                maximum: 10000,
                            },
                        },
                        required: ["name", "price"],
                    },
                },
            },
        };

        const models = generateModelsFromOpenApi(spec);
        const productModel = models.get("Product");

        expect(productModel).toContain("Product name");
        expect(productModel).toContain("@minLength 3");
        expect(productModel).toContain("@maxLength 50");
        expect(productModel).toContain("@minimum 0");
        expect(productModel).toContain("@maximum 10000");
    });

    it("should handle $ref references", () => {
        const spec: OpenApiSpec = {
            components: {
                schemas: {
                    Address: {
                        type: "object",
                        properties: {
                            street: { type: "string" },
                        },
                        required: ["street"],
                    },
                    User: {
                        type: "object",
                        properties: {
                            address: { $ref: "#/components/schemas/Address" },
                        },
                        required: ["address"],
                    },
                },
            },
        };

        const models = generateModelsFromOpenApi(spec);
        const userModel = models.get("User");

        expect(userModel).toContain("address: Address;");
    });

    it("should generate union types with oneOf", () => {
        const spec: OpenApiSpec = {
            components: {
                schemas: {
                    Pet: {
                        oneOf: [
                            {
                                type: "object",
                                properties: { bark: { type: "boolean" } },
                                required: ["bark"],
                            },
                            {
                                type: "object",
                                properties: { meow: { type: "boolean" } },
                                required: ["meow"],
                            },
                        ],
                    },
                },
            },
        };

        const models = generateModelsFromOpenApi(spec);
        const petModel = models.get("Pet");

        expect(petModel).toContain("|");
        expect(petModel).toContain("bark");
        expect(petModel).toContain("meow");
    });

    it("should generate enum types", () => {
        const spec: OpenApiSpec = {
            components: {
                schemas: {
                    Status: {
                        type: "string",
                        enum: ["active", "inactive", "pending"],
                    },
                },
            },
        };

        const models = generateModelsFromOpenApi(spec);
        const statusModel = models.get("Status");

        expect(statusModel).toContain('"active"');
        expect(statusModel).toContain('"inactive"');
        expect(statusModel).toContain('"pending"');
    });

    it("should include tags in JSDoc when enabled", () => {
        const spec: OpenApiSpec = {
            components: {
                schemas: {
                    User: {
                        type: "object",
                        properties: {
                            id: { type: "number" },
                        },
                        required: ["id"],
                    },
                },
            },
        };

        const tags = {
            author: "Test Author",
            version: "1.0.0",
        };

        const models = generateModelsFromOpenApi(spec, { includeTags: true, tags });
        const userModel = models.get("User");

        expect(userModel).toContain("@author Test Author");
        expect(userModel).toContain("@version 1.0.0");
    });

    it("should handle deprecated fields", () => {
        const spec: OpenApiSpec = {
            components: {
                schemas: {
                    User: {
                        type: "object",
                        properties: {
                            oldField: {
                                type: "string",
                                deprecated: true,
                            },
                        },
                        required: ["oldField"],
                    },
                },
            },
        };

        const models = generateModelsFromOpenApi(spec);
        const userModel = models.get("User");

        expect(userModel).toContain("@deprecated");
    });

    it("should handle nullable types in OpenAPI 3.0", () => {
        const spec: OpenApiSpec = {
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
                    },
                },
            },
        };

        const models = generateModelsFromOpenApi(spec);
        const userModel = models.get("User");

        expect(userModel).toContain("name: string | null;");
    });

    it("should handle additionalProperties", () => {
        const spec: OpenApiSpec = {
            components: {
                schemas: {
                    Config: {
                        type: "object",
                        properties: {
                            version: { type: "number" },
                        },
                        required: ["version"],
                        additionalProperties: { type: "string" },
                    },
                },
            },
        };

        const models = generateModelsFromOpenApi(spec);
        const configModel = models.get("Config");

        expect(configModel).toContain("version: number;");
        expect(configModel).toContain("[key: string]: string;");
    });
});
