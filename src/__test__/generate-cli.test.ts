import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "fs/promises";
import { resolve } from "path";

import { generateModels } from "../cli/generate";

const tmpDir = resolve(import.meta.dir, ".tmp-generate-test");

describe("CLI model commands", () => {
    beforeEach(async () => {
        await mkdir(tmpDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    describe("generateModels with OpenAPI", () => {
        it("should generate TypeScript models from OpenAPI spec (stdout)", async () => {
            const specFile = resolve(tmpDir, "spec.json");
            const spec = {
                openapi: "3.0.0",
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
                await generateModels(specFile);
                expect(output).toContain("export type User =");
                expect(output).toContain("id: number;");
                expect(output).toContain("name: string;");
            } finally {
                console.log = originalLog;
            }
        });

        it("should generate TypeScript models from OpenAPI YAML spec", async () => {
            const specFile = resolve(tmpDir, "spec.yaml");
            const specYaml = `
openapi: 3.0.0
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
                await generateModels(specFile);
                expect(output).toContain("export type Product =");
                expect(output).toContain("sku: string;");
                expect(output).toContain("price: number;");
            } finally {
                console.log = originalLog;
            }
        });

        it("should write models to separate files with --outdir", async () => {
            const specFile = resolve(tmpDir, "spec.json");
            const outDir = resolve(tmpDir, "models");
            const spec = {
                openapi: "3.0.0",
                components: {
                    schemas: {
                        User: {
                            type: "object",
                            properties: {
                                id: { type: "number" },
                            },
                            required: ["id"],
                        },
                        Post: {
                            type: "object",
                            properties: {
                                title: { type: "string" },
                            },
                            required: ["title"],
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
                await generateModels(specFile, { outdir: outDir });

                // Check files were created
                const userFile = Bun.file(resolve(outDir, "User.ts"));
                const userContent = await userFile.text();
                expect(userContent).toContain("export type User =");
                expect(userContent).toContain("id: number;");

                const postFile = Bun.file(resolve(outDir, "Post.ts"));
                const postContent = await postFile.text();
                expect(postContent).toContain("export type Post =");
                expect(postContent).toContain("title: string;");

                expect(output).toContain("Generated 2 type(s)");
            } finally {
                console.log = originalLog;
            }
        });

        it("should include JSDoc with constraints", async () => {
            const specFile = resolve(tmpDir, "spec.json");
            const spec = {
                openapi: "3.0.0",
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
                            },
                            required: ["name"],
                        },
                    },
                },
            };

            await writeFile(specFile, JSON.stringify(spec));

            let output = "";
            const originalLog = console.log;
            console.log = (...args: any[]) => {
                output += args.join(" ") + "\n";
            };

            try {
                await generateModels(specFile);
                expect(output).toContain("Product name");
                expect(output).toContain("@minLength 3");
                expect(output).toContain("@maxLength 50");
            } finally {
                console.log = originalLog;
            }
        });
    });

    describe("generateFromProtobuf", () => {
        it("should generate TypeScript models from proto file (stdout)", async () => {
            const protoFile = resolve(tmpDir, "api.proto");
            const protoContent = `
syntax = "proto3";

message User {
  int32 id = 1;
  string name = 2;
}
            `;

            await writeFile(protoFile, protoContent);

            // Capture console output
            let output = "";
            const originalLog = console.log;
            console.log = (...args: any[]) => {
                output += args.join(" ") + "\n";
            };

            try {
                await generateModels(protoFile);
                expect(output).toContain("export type User =");
                expect(output).toContain("id: number;");
                expect(output).toContain("name: string;");
            } finally {
                console.log = originalLog;
            }
        });

        it("should write models to separate files with --outdir", async () => {
            const protoFile = resolve(tmpDir, "api.proto");
            const outDir = resolve(tmpDir, "models");
            const protoContent = `
syntax = "proto3";

message User {
  int32 id = 1;
}

message Post {
  int32 id = 1;
  string title = 2;
}
            `;

            await writeFile(protoFile, protoContent);

            // Capture console output
            let output = "";
            const originalLog = console.log;
            console.log = (...args: any[]) => {
                output += args.join(" ") + "\n";
            };

            try {
                await generateModels(protoFile, { outdir: outDir });

                // Check files were created
                const userFile = Bun.file(resolve(outDir, "User.ts"));
                const userContent = await userFile.text();
                expect(userContent).toContain("export type User =");
                expect(userContent).toContain("id: number;");

                const postFile = Bun.file(resolve(outDir, "Post.ts"));
                const postContent = await postFile.text();
                expect(postContent).toContain("export type Post =");
                expect(postContent).toContain("title: string;");

                expect(output).toContain("Generated 2 type(s)");
            } finally {
                console.log = originalLog;
            }
        });

        it("should handle repeated and optional fields", async () => {
            const protoFile = resolve(tmpDir, "api.proto");
            const protoContent = `
syntax = "proto3";

message Post {
  int32 id = 1;
  repeated string tags = 2;
  optional string author = 3;
}
            `;

            await writeFile(protoFile, protoContent);

            let output = "";
            const originalLog = console.log;
            console.log = (...args: any[]) => {
                output += args.join(" ") + "\n";
            };

            try {
                await generateModels(protoFile);
                expect(output).toContain("tags: string[];");
                expect(output).toContain("author?: string;");
            } finally {
                console.log = originalLog;
            }
        });
    });
});
