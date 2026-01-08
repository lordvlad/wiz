import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "fs/promises";
import { resolve } from "path";

import { generateClient } from "../cli/client";

const tmpDir = resolve(import.meta.dir, ".tmp-client-test");

describe("CLI client command", () => {
    beforeEach(async () => {
        await mkdir(tmpDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    it("should generate client from OpenAPI spec (stdout)", async () => {
        const specFile = resolve(tmpDir, "spec.json");
        const spec = {
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

        await writeFile(specFile, JSON.stringify(spec));

        // Capture console output
        let output = "";
        const originalLog = console.log;
        console.log = (...args: any[]) => {
            output += args.join(" ") + "\n";
        };

        try {
            await generateClient(specFile);
            expect(output).toContain("export type User =");
            expect(output).toContain("export const api =");
            expect(output).toContain("getUsers");
            expect(output).toContain("id: number;");
        } finally {
            console.log = originalLog;
        }
    });

    it("should generate client from YAML spec", async () => {
        const specFile = resolve(tmpDir, "spec.yaml");
        const specYaml = `
openapi: 3.0.0
paths:
  /products:
    get:
      operationId: listProducts
      responses:
        '200':
          description: Success
components:
  schemas:
    Product:
      type: object
      properties:
        sku:
          type: string
        price:
          type: number
      required:
        - sku
        - price
        `;

        await writeFile(specFile, specYaml);

        // Capture console output
        let output = "";
        const originalLog = console.log;
        console.log = (...args: any[]) => {
            output += args.join(" ") + "\n";
        };

        try {
            await generateClient(specFile);
            expect(output).toContain("export type Product =");
            expect(output).toContain("listProducts");
            expect(output).toContain("sku: string;");
        } finally {
            console.log = originalLog;
        }
    });

    it("should write client to separate files with --outdir", async () => {
        const specFile = resolve(tmpDir, "spec.json");
        const outDir = resolve(tmpDir, "client");
        const spec = {
            openapi: "3.0.0",
            servers: [
                {
                    url: "https://api.example.com",
                },
            ],
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

        await writeFile(specFile, JSON.stringify(spec));

        // Capture console output
        let output = "";
        const originalLog = console.log;
        console.log = (...args: any[]) => {
            output += args.join(" ") + "\n";
        };

        try {
            await generateClient(specFile, { outdir: outDir });

            // Check model file was created
            const modelFile = Bun.file(resolve(outDir, "model.ts"));
            const modelContent = await modelFile.text();
            expect(modelContent).toContain("export type User =");
            expect(modelContent).toContain("name: string;");
            expect(modelContent).toContain("email: string;");

            // Check API file was created
            const apiFile = Bun.file(resolve(outDir, "api.ts"));
            const apiContent = await apiFile.text();
            expect(apiContent).toContain('import type * as Models from "./model"');
            expect(apiContent).toContain("export const api =");
            expect(apiContent).toContain("getUserById");
            expect(apiContent).toContain("updateUser");
            expect(apiContent).toContain("GetUserByIdPathParams");
            expect(apiContent).toContain('config.baseUrl ?? "https://api.example.com"');

            expect(output).toContain("model.ts");
            expect(output).toContain("api.ts");
            expect(output).toContain("Generated client");
        } finally {
            console.log = originalLog;
        }
    });

    it("should handle paths with query parameters", async () => {
        const specFile = resolve(tmpDir, "spec.json");
        const spec = {
            openapi: "3.0.0",
            paths: {
                "/search": {
                    get: {
                        operationId: "search",
                        parameters: [
                            {
                                name: "q",
                                in: "query",
                                required: true,
                                schema: { type: "string" },
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

        await writeFile(specFile, JSON.stringify(spec));

        // Capture console output
        let output = "";
        const originalLog = console.log;
        console.log = (...args: any[]) => {
            output += args.join(" ") + "\n";
        };

        try {
            await generateClient(specFile);
            expect(output).toContain("search");
            expect(output).toContain("SearchQueryParams");
            expect(output).toContain("q:");
            expect(output).toContain("limit?:");
            expect(output).toContain("searchParams.append");
        } finally {
            console.log = originalLog;
        }
    });

    it("should handle POST with request body", async () => {
        const specFile = resolve(tmpDir, "spec.json");
        const spec = {
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
                            },
                        },
                    },
                },
            },
            components: {
                schemas: {
                    CreateUserRequest: {
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

        await writeFile(specFile, JSON.stringify(spec));

        // Capture console output
        let output = "";
        const originalLog = console.log;
        console.log = (...args: any[]) => {
            output += args.join(" ") + "\n";
        };

        try {
            await generateClient(specFile);
            expect(output).toContain("createUser");
            expect(output).toContain("requestBody: CreateUserRequest");
            expect(output).toContain('method: "POST"');
            expect(output).toContain("JSON.stringify(requestBody)");
        } finally {
            console.log = originalLog;
        }
    });

    it("should use empty string for base URL when no servers specified", async () => {
        const specFile = resolve(tmpDir, "spec.json");
        const spec = {
            openapi: "3.0.0",
            paths: {
                "/test": {
                    get: {
                        operationId: "test",
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

        await writeFile(specFile, JSON.stringify(spec));

        // Capture console output
        let output = "";
        const originalLog = console.log;
        console.log = (...args: any[]) => {
            output += args.join(" ") + "\n";
        };

        try {
            await generateClient(specFile);
            expect(output).toContain('config.baseUrl ?? ""');
        } finally {
            console.log = originalLog;
        }
    });

    it("should generate client with wiz validation when --wiz-validator flag is used", async () => {
        const specFile = resolve(tmpDir, "spec.json");
        const outDir = resolve(tmpDir, "client-validation");
        const spec = {
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
                            id: { type: "string" },
                            name: { type: "string" },
                        },
                        required: ["id", "name"],
                    },
                },
            },
        };

        await writeFile(specFile, JSON.stringify(spec));

        // Capture console output
        let output = "";
        const originalLog = console.log;
        console.log = (...args: any[]) => {
            output += args.join(" ") + "\n";
        };

        try {
            await generateClient(specFile, { outdir: outDir, wizValidator: true });

            // Check API file contains validation code
            const apiFile = Bun.file(resolve(outDir, "api.ts"));
            const apiContent = await apiFile.text();

            expect(apiContent).toContain('import { createValidator } from "wiz/validator"');
            expect(apiContent).toContain("export interface TypedResponse<T> extends Response");
            expect(apiContent).toContain("function createTypedResponse<T>(");
            expect(apiContent).toContain("validateUser = createValidator<Models.User>()");
            expect(apiContent).toContain("validateGetUserByIdPathParams");
            expect(apiContent).toContain("// Validate path parameters");
            expect(apiContent).toContain("const pathParamsErrors = validateGetUserByIdPathParams(pathParams)");
            expect(apiContent).toContain('throw new TypeError("Invalid path parameters: "');
            expect(apiContent).toContain("// Validate request body");
            expect(apiContent).toContain("const requestBodyErrors = validateUser(requestBody)");
            expect(apiContent).toContain("return createTypedResponse<Models.User>(response, validateUser)");

            expect(output).toContain("Generated client");
        } finally {
            console.log = originalLog;
        }
    });
});
