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

    describe("URL support", () => {
        let server: any;
        let port: number;

        beforeEach(async () => {
            // Start a simple HTTP server to serve test specs
            server = Bun.serve({
                port: 0, // Use random available port
                fetch(req) {
                    const url = new URL(req.url);
                    if (url.pathname === "/openapi.json") {
                        return new Response(
                            JSON.stringify({
                                openapi: "3.0.0",
                                components: {
                                    schemas: {
                                        Article: {
                                            type: "object",
                                            properties: {
                                                id: { type: "number" },
                                                title: { type: "string" },
                                            },
                                            required: ["id", "title"],
                                        },
                                    },
                                },
                            }),
                            { headers: { "content-type": "application/json" } },
                        );
                    } else if (url.pathname === "/openapi.yaml") {
                        return new Response(
                            `openapi: 3.0.0
components:
  schemas:
    Book:
      type: object
      properties:
        isbn:
          type: string
        title:
          type: string
      required:
        - isbn
        - title`,
                            { headers: { "content-type": "text/yaml" } },
                        );
                    } else if (url.pathname === "/api.proto") {
                        return new Response(
                            `syntax = "proto3";

message Movie {
  int32 id = 1;
  string title = 2;
}`,
                            { headers: { "content-type": "text/plain" } },
                        );
                    }
                    return new Response("Not Found", { status: 404 });
                },
            });
            port = server.port;
        });

        afterEach(() => {
            server.stop();
        });

        it("should generate models from HTTP URL (OpenAPI JSON)", async () => {
            const specUrl = `http://localhost:${port}/openapi.json`;

            // Capture console output
            let output = "";
            const originalLog = console.log;
            console.log = (...args: any[]) => {
                output += args.join(" ") + "\n";
            };

            try {
                await generateModels(specUrl);
                expect(output).toContain("export type Article =");
                expect(output).toContain("id: number;");
                expect(output).toContain("title: string;");
            } finally {
                console.log = originalLog;
            }
        });

        it("should generate models from HTTP URL (OpenAPI YAML)", async () => {
            const specUrl = `http://localhost:${port}/openapi.yaml`;

            // Capture console output
            let output = "";
            const originalLog = console.log;
            console.log = (...args: any[]) => {
                output += args.join(" ") + "\n";
            };

            try {
                await generateModels(specUrl);
                expect(output).toContain("export type Book =");
                expect(output).toContain("isbn: string;");
                expect(output).toContain("title: string;");
            } finally {
                console.log = originalLog;
            }
        });

        it("should generate models from HTTP URL (Protobuf)", async () => {
            const specUrl = `http://localhost:${port}/api.proto`;

            // Capture console output
            let output = "";
            const originalLog = console.log;
            console.log = (...args: any[]) => {
                output += args.join(" ") + "\n";
            };

            try {
                await generateModels(specUrl);
                expect(output).toContain("export type Movie =");
                expect(output).toContain("id: number;");
                expect(output).toContain("title: string;");
            } finally {
                console.log = originalLog;
            }
        });

        it("should generate models from file:// URL (OpenAPI)", async () => {
            const specFile = resolve(tmpDir, "file-url-spec.json");
            const spec = {
                openapi: "3.0.0",
                components: {
                    schemas: {
                        Product: {
                            type: "object",
                            properties: {
                                sku: { type: "string" },
                            },
                            required: ["sku"],
                        },
                    },
                },
            };

            await writeFile(specFile, JSON.stringify(spec));

            const fileUrl = `file://${specFile}`;

            // Capture console output
            let output = "";
            const originalLog = console.log;
            console.log = (...args: any[]) => {
                output += args.join(" ") + "\n";
            };

            try {
                await generateModels(fileUrl);
                expect(output).toContain("export type Product =");
                expect(output).toContain("sku: string;");
            } finally {
                console.log = originalLog;
            }
        });

        it("should generate models from file:// URL (Protobuf)", async () => {
            const protoFile = resolve(tmpDir, "file-url-api.proto");
            const protoContent = `
syntax = "proto3";

message Author {
  int32 id = 1;
  string name = 2;
}`;

            await writeFile(protoFile, protoContent);

            const fileUrl = `file://${protoFile}`;

            // Capture console output
            let output = "";
            const originalLog = console.log;
            console.log = (...args: any[]) => {
                output += args.join(" ") + "\n";
            };

            try {
                await generateModels(fileUrl);
                expect(output).toContain("export type Author =");
                expect(output).toContain("id: number;");
                expect(output).toContain("name: string;");
            } finally {
                console.log = originalLog;
            }
        });
    });
});
