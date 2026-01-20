import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, writeFile } from "fs/promises";
import { resolve } from "path";

import { inlineValidators } from "../cli/inline";
import { generateOpenApi } from "../cli/openapi";
import { generateProtobuf } from "../cli/protobuf";

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

        it("should generate YAML with proper 4-space indentation", async () => {
            const testFile = resolve(tmpDir, "types.ts");
            await writeFile(
                testFile,
                `
export type Product = {
    id: number;
    name: string;
    nested: {
        value: string;
    };
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
                // Check for proper indentation with 4 spaces
                expect(output).toContain("openapi: 3.0.3");
                expect(output).toContain("    title:"); // 4 spaces
                expect(output).toContain("        type: object"); // 8 spaces
                expect(output).toContain("            id:"); // 12 spaces
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

        it("should handle types with imports from other files", async () => {
            // Create a base types file
            const baseFile = resolve(tmpDir, "base.ts");
            await writeFile(
                baseFile,
                `
export type BaseEntity = {
    id: number;
    createdAt: string;
}
            `,
            );

            // Create a file that imports from base
            const userFile = resolve(tmpDir, "user.ts");
            await writeFile(
                userFile,
                `
import { BaseEntity } from "./base";

export type User = BaseEntity & {
    name: string;
    email: string;
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
                // This should work without errors - the old approach would fail here
                // because concatenating files would break the import
                await generateOpenApi([userFile], { format: "json" });
                expect(output).toContain('"openapi": "3.0.3"');
                expect(output).toContain("User");
                expect(output).toContain("name");
                expect(output).toContain("email");
                // Should also include properties from BaseEntity
                expect(output).toContain("createdAt");
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

        it("should include non-exported types referenced in JSDoc @response tag", async () => {
            const testFile = resolve(tmpDir, "api.ts");
            await writeFile(
                testFile,
                `
// Note: User is NOT exported
type User = {
    id: string;
    email: string;
}

/**
 * Get User By ID
 * @openApi
 * @path /users/:id
 * @method GET
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
                // Check that User is in components/schemas
                expect(output).toContain('"User"');
                expect(output).toContain('"id"');
                expect(output).toContain('"email"');
                // Check that response uses $ref to User
                expect(output).toContain('"$ref": "#/components/schemas/User"');
            } finally {
                console.log = originalLog;
            }
        });

        it("should include non-exported types referenced in JSDoc @body tag", async () => {
            const testFile = resolve(tmpDir, "api.ts");
            await writeFile(
                testFile,
                `
// Note: CreateUserRequest is NOT exported
type CreateUserRequest = {
    name: string;
    email: string;
}

// User is exported for comparison
export type User = {
    id: string;
    name: string;
    email: string;
}

/**
 * Create User
 * @openApi
 * @path /users
 * @method POST
 * @body CreateUserRequest
 * @response 201 User - User created
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
                expect(output).toContain('"post"');
                // Check that both types are in components/schemas
                expect(output).toContain('"CreateUserRequest"');
                expect(output).toContain('"User"');
                // Check that request body uses $ref to CreateUserRequest
                expect(output).toContain('"$ref": "#/components/schemas/CreateUserRequest"');
                // Check that response uses $ref to User
                expect(output).toContain('"$ref": "#/components/schemas/User"');
            } finally {
                console.log = originalLog;
            }
        });

        it("should include multiple non-exported types referenced in JSDoc tags", async () => {
            const testFile = resolve(tmpDir, "api.ts");
            await writeFile(
                testFile,
                `
// None of these are exported
type ErrorResponse = {
    code: string;
    message: string;
}

type UserResponse = {
    id: string;
    name: string;
}

type UpdateUserRequest = {
    name: string;
}

/**
 * Update User
 * @openApi
 * @path /users/:id
 * @method PUT
 * @body UpdateUserRequest
 * @response 200 UserResponse - User updated
 * @response 404 ErrorResponse - User not found
 */
function updateUser() {}
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
                expect(output).toContain('"put"');
                // Check that all three types are in components/schemas
                expect(output).toContain('"UpdateUserRequest"');
                expect(output).toContain('"UserResponse"');
                expect(output).toContain('"ErrorResponse"');
                // Check that they're referenced correctly
                expect(output).toContain('"$ref": "#/components/schemas/UpdateUserRequest"');
                expect(output).toContain('"$ref": "#/components/schemas/UserResponse"');
                expect(output).toContain('"$ref": "#/components/schemas/ErrorResponse"');
            } finally {
                console.log = originalLog;
            }
        });

        it("should NOT include exported types that are not referenced in JSDoc tags", async () => {
            const modelFile = resolve(tmpDir, "model.ts");
            await writeFile(
                modelFile,
                `
// User is NOT exported, but IS used in @response
type User = {
    id: number;
    name: string;
}

export type SomeOtherType = {
    foo: string;
    bar: number;
}
            `,
            );

            const apiFile = resolve(tmpDir, "api.ts");
            await writeFile(
                apiFile,
                `
import type { User } from './model';

/**
 * @openApi
 * @method GET
 * @path /users/:id
 * @response 200 User - user found
 */
export function getUser() {}

// SomeOtherType is exported but NOT used in any @openApi endpoint
export type SomeOtherType = {
    unused: string;
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
                await generateOpenApi([apiFile, modelFile], { format: "yaml" });
                
                // Should include User (referenced in @response)
                expect(output).toContain("User:");
                expect(output).toContain("/users/:id:");
                
                // Should NOT include SomeOtherType (exported but not referenced)
                expect(output).not.toContain("SomeOtherType:");
            } finally {
                console.log = originalLog;
            }
        });
    });

    describe("generateProtobuf", () => {
        it("should handle Windows-style paths with backslashes", async () => {
            const testFile = resolve(tmpDir, "types.ts");
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
                await generateProtobuf([windowsStylePath], { format: "json" });
                expect(output).toContain('"syntax": "proto3"');
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

        it("should handle Windows-style paths with backslashes", async () => {
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

            // Simulate Windows-style path with backslashes
            const windowsStylePath = testFile.replace(/\//g, "\\");

            try {
                // Change to the tmpDir so relative paths work correctly
                const originalCwd = process.cwd();
                process.chdir(tmpDir);

                try {
                    await inlineValidators([windowsStylePath], { outdir: outDir });
                    expect(output).toContain("✓");
                    expect(output).toContain("Processed: 1 file(s)");
                } finally {
                    process.chdir(originalCwd);
                }
            } finally {
                console.log = originalLog;
            }
        });
    });
});
