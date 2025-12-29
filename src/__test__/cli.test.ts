import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, writeFile } from "fs/promises";
import { resolve } from "path";

import { generateOpenApi } from "../cli/openapi";
import { inlineValidators } from "../cli/inline";

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

                    // Check that output file was created in the correct location
                    // The file should be at outDir + relative path from tmpDir
                    const outFile = resolve(outDir, "src", "validators.js");
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
