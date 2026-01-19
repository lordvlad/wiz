import { describe, expect, it } from "bun:test";

import type { OpenApiSpec } from "../generator/openapi-ir";
import { fetchTemplate, fetchWizValidatorsTemplate, reactQueryTemplate } from "../generator/templates";

describe("Template functions - fetch template", () => {
    it("should generate model.ts and api.ts files", () => {
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

        const result = fetchTemplate({ spec });

        // Check that result has the expected structure
        expect("model.ts" in result).toBe(true);
        expect("api.ts" in result).toBe(true);

        // Check model.ts content
        expect(result["model.ts"]).toContain("export");
        expect(result["model.ts"]).toContain("User");
        expect(result["model.ts"]).toContain("id:");
        expect(result["model.ts"]).toContain("name:");

        // Check api.ts content
        expect(result["api.ts"]).toContain("export const api =");
        expect(result["api.ts"]).toContain("getUsers");
        expect(result["api.ts"]).toContain('method: "GET"');
    });

    it("should generate client with wiz validator", () => {
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
                            id: { type: "number" },
                            name: { type: "string" },
                        },
                        required: ["id", "name"],
                    },
                },
            },
        };

        const result = fetchWizValidatorsTemplate({ spec });

        // Check that validator imports are present
        expect(result["api.ts"]).toContain("createValidator");
        expect(result["api.ts"]).toContain("validateUser");
        expect(result["api.ts"]).toContain("TypedResponse");
    });
});

describe("Template functions - react-query template", () => {
    it("should generate all four files", () => {
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
                            id: { type: "number" },
                            name: { type: "string" },
                        },
                        required: ["id", "name"],
                    },
                },
            },
        };

        const result = reactQueryTemplate({ spec });

        // Check that result has all expected files
        expect("model.ts" in result).toBe(true);
        expect("api.ts" in result).toBe(true);
        expect("queries.ts" in result).toBe(true);
        expect("mutations.ts" in result).toBe(true);

        // Check model.ts content
        expect(result["model.ts"]).toContain("export");
        expect(result["model.ts"]).toContain("User");

        // Check api.ts content
        expect(result["api.ts"]).toContain("export const api =");
        expect(result["api.ts"]).toContain("ApiContext");
        expect(result["api.ts"]).toContain("ApiProvider");

        // Check queries.ts content
        expect(result["queries.ts"]).toContain("useQuery");
        expect(result["queries.ts"]).toContain("useGetUsersQuery");

        // Check mutations.ts content
        expect(result["mutations.ts"]).toContain("useMutation");
        expect(result["mutations.ts"]).toContain("useCreateUserMutation");
    });

    it("should reuse fetch template for base files", () => {
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

        const fetchResult = fetchTemplate({ spec });
        const reactQueryResult = reactQueryTemplate({ spec });

        // The model.ts should be the same
        expect(reactQueryResult["model.ts"]).toBe(fetchResult["model.ts"]);

        // The api.ts should contain React Query context
        expect(reactQueryResult["api.ts"]).toContain("ApiContext");
    });
});
