import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, writeFile } from "fs/promises";
import { resolve } from "path";

import { inlineValidators } from "../cli/inline";
import { generateOpenApi } from "../cli/openapi";

const tmpDir = resolve(import.meta.dir, ".tmp-cli-test");

describe("CLI commands", () => {
    beforeEach(async () => {
        await mkdir(tmpDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    describe("generateOpenApi", () => {
        it("should generate OpenAPI spec from createOpenApi call", async () => {
            const testFile = resolve(tmpDir, "api.ts");
            await writeFile(
                testFile,
                `
import { createOpenApi } from "${resolve(import.meta.dir, "../openApiSchema/index.ts")}";

type User = {
    id: number;
    name: string;
}

export const spec = createOpenApi<[User], "3.0">({
    info: {
        title: "Test API",
        version: "1.0.0"
    }
});
            `,
            );

            // Capture console output
            let output = "";
            const originalLog = console.log;
            console.log = (...args: any[]) => {
                output += args.join(" ") + "\n";
            };

            try {
                await generateOpenApi([testFile], { format: "json" });
                expect(output).toContain('"openapi": "3.0.3"');
                expect(output).toContain('"title": "Test API"');
                expect(output).toContain('"version": "1.0.0"');
                expect(output).toContain("User");
            } finally {
                console.log = originalLog;
            }
        });

        it("should generate OpenAPI spec from exported types", async () => {
            const testFile = resolve(tmpDir, "types.ts");
            await writeFile(
                testFile,
                `
export type Product = {
    id: number;
    name: string;
    price: number;
}
            `,
            );

            // Capture console output
            let output = "";
            const originalLog = console.log;
            console.log = (...args: any[]) => {
                output += args.join(" ") + "\n";
            };

            try {
                await generateOpenApi([testFile], { format: "json" });
                expect(output).toContain('"openapi": "3.0.3"');
                expect(output).toContain("Product");
                expect(output).toContain("price");
            } finally {
                console.log = originalLog;
            }
        });

        it("should generate YAML format by default", async () => {
            const testFile = resolve(tmpDir, "types.ts");
            await writeFile(
                testFile,
                `
export type Item = {
    id: number;
}
            `,
            );

            // Capture console output
            let output = "";
            const originalLog = console.log;
            console.log = (...args: any[]) => {
                output += args.join(" ") + "\n";
            };

            try {
                await generateOpenApi([testFile], { format: "yaml" });
                expect(output).toContain("openapi: 3.0.3");
                expect(output).toContain("Item:");
            } finally {
                console.log = originalLog;
            }
        });

        it("should generate OpenAPI spec from JSDoc tags", async () => {
            const testFile = resolve(tmpDir, "api.ts");
            await writeFile(
                testFile,
                `
export type User = {
    id: number;
    name: string;
}

/**
 * Get user by ID
 * @openApi
 * @path /users/:id
 * @response 200 User - User found
 */
function getUserById() {}
            `,
            );

            // Capture console output
            let output = "";
            const originalLog = console.log;
            console.log = (...args: any[]) => {
                output += args.join(" ") + "\n";
            };

            try {
                await generateOpenApi([testFile], { format: "json" });
                expect(output).toContain('"openapi": "3.0.3"');
                expect(output).toContain('"/users/:id"');
                expect(output).toContain('"get"');
                expect(output).toContain("User");
            } finally {
                console.log = originalLog;
            }
        });

        it("should generate OpenAPI spec from JSDoc tags with multiple methods", async () => {
            const testFile = resolve(tmpDir, "api.ts");
            await writeFile(
                testFile,
                `
export type User = {
    id: number;
    name: string;
}

/**
 * Get all users
 * @openApi
 * @path /users
 */
function getUsers() {}

/**
 * Create a user
 * @openApi
 * @method POST
 * @path /users
 * @body User
 */
function createUser() {}
            `,
            );

            // Capture console output
            let output = "";
            const originalLog = console.log;
            console.log = (...args: any[]) => {
                output += args.join(" ") + "\n";
            };

            try {
                await generateOpenApi([testFile], { format: "json" });
                expect(output).toContain('"openapi": "3.0.3"');
                expect(output).toContain('"/users"');
                expect(output).toContain('"get"');
                expect(output).toContain('"post"');
            } finally {
                console.log = originalLog;
            }
        });

        it("should fallback to schema-only when no JSDoc tags present", async () => {
            const testFile = resolve(tmpDir, "types.ts");
            await writeFile(
                testFile,
                `
export type Product = {
    id: number;
    name: string;
    price: number;
}

// Function without @openApi tag should be ignored
function getProducts() {}
            `,
            );

            // Capture console output
            let output = "";
            const originalLog = console.log;
            console.log = (...args: any[]) => {
                output += args.join(" ") + "\n";
            };

            try {
                await generateOpenApi([testFile], { format: "json" });
                expect(output).toContain('"openapi": "3.0.3"');
                expect(output).toContain("Product");
                expect(output).toContain('"paths": {}'); // Empty paths since no JSDoc tags
            } finally {
                console.log = originalLog;
            }
        });

        it("should handle Windows-style paths with backslashes", async () => {
            const testFile = resolve(tmpDir, "api.ts");
            await writeFile(
                testFile,
                `
export type User = {
    id: number;
    name: string;
}
            `,
            );

            // Capture console output
            let output = "";
            const originalLog = console.log;
            console.log = (...args: any[]) => {
                output += args.join(" ") + "\n";
            };

            // Simulate Windows-style path with backslashes
            const windowsStylePath = testFile.replace(/\//g, "\\");

            try {
                await generateOpenApi([windowsStylePath], { format: "json" });
                expect(output).toContain('"openapi": "3.0.3"');
                expect(output).toContain("User");
            } finally {
                console.log = originalLog;
            }
        });
    });

    describe("inlineValidators", () => {
        it("should inline validator calls", async () => {
            const srcDir = resolve(tmpDir, "src");
            await mkdir(srcDir, { recursive: true });

            const testFile = resolve(srcDir, "validators.ts");
            const outDir = resolve(tmpDir, "out");

            await writeFile(
                testFile,
                `
import { createValidator } from "${resolve(import.meta.dir, "../validator/index.ts")}";

type User = {
    id: number;
    name: string;
}

export const validateUser = createValidator<User>();
            `,
            );

            // Capture console output
            let output = "";
            const originalLog = console.log;
            console.log = (...args: any[]) => {
                output += args.join(" ") + "\n";
            };

            try {
                // Change to the tmpDir so relative paths work correctly
                const originalCwd = process.cwd();
                process.chdir(tmpDir);

                try {
                    await inlineValidators([testFile], { outdir: outDir });
                    expect(output).toContain("✓");
                    expect(output).toContain("Processed: 1 file(s)");

                    // Check that output file was created with original .ts extension
                    const outFile = resolve(outDir, "src", "validators.ts");
                    const content = await Bun.file(outFile).text();
                    expect(content).toContain("validateUser");
                    expect(content).toContain("function");
                } finally {
                    process.chdir(originalCwd);
                }
            } finally {
                console.log = originalLog;
            }
        });
    });
});
