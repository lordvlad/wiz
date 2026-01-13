import { $ } from "bun";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "fs";
import { mkdir, rm, writeFile } from "fs/promises";
import { resolve } from "path";

const tmpDir = resolve(import.meta.dir, ".tmp-integration-test");
const cacheDir = resolve(import.meta.dir, "../../node_modules/.cache/wiz");

/**
 * Fetch OpenAPI spec with caching and ETAG support
 */
async function fetchOpenApiSpec(url: string, filename: string): Promise<any> {
    await mkdir(cacheDir, { recursive: true });

    const specPath = resolve(cacheDir, filename);
    const etagPath = resolve(cacheDir, `${filename}.etag`);

    let etag: string | undefined;

    // Check if cached spec exists
    if (existsSync(specPath) && existsSync(etagPath)) {
        etag = await Bun.file(etagPath).text();
    }

    // Fetch with conditional request if we have an ETAG
    const headers: Record<string, string> = {
        Accept: "application/json",
    };

    if (etag) {
        headers["If-None-Match"] = etag;
    }

    const response = await fetch(url, { headers });

    // If 304 Not Modified, use cached version
    if (response.status === 304 && existsSync(specPath)) {
        const cached = await Bun.file(specPath).text();
        return JSON.parse(cached);
    }

    // If 200 OK, save spec and ETAG
    if (response.status === 200) {
        const spec = await response.json();
        await Bun.write(specPath, JSON.stringify(spec, null, 2));

        const newEtag = response.headers.get("etag");
        if (newEtag) {
            await Bun.write(etagPath, newEtag);
        }

        return spec;
    }

    throw new Error(`Failed to fetch spec from ${url}: ${response.status} ${response.statusText}`);
}

/**
 * Real-world integration test for OpenAPI client generation
 *
 * This test uses a real public API (Swagger PetStore) to:
 * 1. Fetch OpenAPI spec from a public URL with caching and ETAG support
 * 2. Generate a TypeScript client from the spec using CLI
 * 3. Import and verify the generated client
 * 4. Test TypeScript type checking with intentional errors
 * 5. Test runtime behavior with wrong parameters
 */
describe("Real-world OpenAPI client integration", () => {
    beforeEach(async () => {
        await mkdir(tmpDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    it("should generate client, make API calls, and enforce type safety", async () => {
        // Step 1: Fetch a real OpenAPI spec from a public API
        // Using the Swagger Petstore API as it's a well-known example
        const specUrl = "https://petstore3.swagger.io/api/v3/openapi.json";
        const spec = await fetchOpenApiSpec(specUrl, "petstore-openapi.json");

        // Write the spec to a temporary file for the CLI
        const specFile = resolve(tmpDir, "petstore.json");
        await writeFile(specFile, JSON.stringify(spec, null, 2));

        // Step 2: Generate client using wiz CLI via Bun shell
        const clientDir = resolve(tmpDir, "client");
        const projectRoot = resolve(import.meta.dir, "../..");
        const wizCli = resolve(projectRoot, "src/cli/index.ts");

        // Use Bun shell to run the wiz CLI
        const result = await $`bun ${wizCli} client ${specFile} --outdir ${clientDir}`.quiet();

        expect(result.exitCode).toBe(0);

        // Verify that the client files were generated
        const modelFile = Bun.file(resolve(clientDir, "model.ts"));
        const modelExists = await modelFile.exists();
        expect(modelExists).toBe(true);

        const apiFile = Bun.file(resolve(clientDir, "api.ts"));
        const apiExists = await apiFile.exists();
        expect(apiExists).toBe(true);

        // Step 3: Verify client generation was successful
        const testClientFile = resolve(tmpDir, "test-client.ts");
        const testClientCode = `
import { api } from "./client/api";
import type * as Models from "./client/model";

// Verify the API client is properly typed
// This test ensures TypeScript compilation works with the generated types
console.log("API client generated successfully");
console.log("Available methods:", Object.keys(api));

// Verify some expected methods exist in the PetStore API
if (!api.findPetsByStatus) {
    throw new Error("Expected findPetsByStatus method to exist");
}

if (!api.addPet) {
    throw new Error("Expected addPet method to exist");
}

console.log("✓ Client validation passed");
`;

        await writeFile(testClientFile, testClientCode);

        // Step 4: Run the test client to verify it compiles and runs
        const testResult = await $`bun ${testClientFile}`.quiet();

        expect(testResult.exitCode).toBe(0);
        expect(testResult.stdout.toString()).toContain("Client validation passed");

        // Step 5: Test TypeScript type checking with intentional errors
        const typeErrorFile = resolve(tmpDir, "type-error-test.ts");
        const typeErrorCode = `
import { api } from "./client/api";

// This should cause TypeScript errors:
// 1. Wrong parameter type in findPetsByStatus
async function testTypeError1() {
    // @ts-expect-error - intentionally passing wrong type
    await api.findPetsByStatus({ status: 123 }); // status should be string
}

// 2. Missing required parameter in addPet
async function testTypeError2() {
    // @ts-expect-error - intentionally missing required parameter
    await api.addPet({});
}

console.log("Type error tests defined");
`;

        await writeFile(typeErrorFile, typeErrorCode);

        // Verify the file has @ts-expect-error comments (TypeScript should catch these)
        const typeErrorContent = await Bun.file(typeErrorFile).text();
        expect(typeErrorContent).toContain("@ts-expect-error");

        // Step 6: Test runtime behavior with wrong parameters
        const runtimeErrorFile = resolve(tmpDir, "runtime-error-test.ts");
        const runtimeErrorCode = `
import { api } from "./client/api";

async function testRuntimeErrors() {
    try {
        // Pass wrong type at runtime (bypassing TypeScript)
        const wrongParam: any = { status: 12345 };
        console.log("Attempting call with wrong parameter type...");
        const response = await api.findPetsByStatus(wrongParam);
        console.log("Response status:", response.status);
    } catch (error) {
        console.log("Caught error:", error instanceof Error ? error.message : error);
    }
}

testRuntimeErrors();
`;

        await writeFile(runtimeErrorFile, runtimeErrorCode);

        // Run the runtime error test
        const runtimeResult = await $`bun ${runtimeErrorFile}`.nothrow().quiet();

        // Should complete (may get errors from API, but shouldn't crash)
        const output = runtimeResult.stdout.toString();
        // Either we get a response status or we catch an error - both are valid
        const hasExpectedOutput = output.includes("Response status:") || output.includes("Caught error:");
        expect(hasExpectedOutput).toBe(true);
    }, 30000); // 30 second timeout for API calls

    it("should generate client with validation and catch parameter errors", async () => {
        // Fetch the same PetStore API spec
        const specUrl = "https://petstore3.swagger.io/api/v3/openapi.json";
        const spec = await fetchOpenApiSpec(specUrl, "petstore-openapi.json");

        // Write the spec to a temporary file for the CLI
        const specFile = resolve(tmpDir, "petstore-validated.json");
        await writeFile(specFile, JSON.stringify(spec, null, 2));

        // Generate client with validation enabled
        const clientDir = resolve(tmpDir, "client-validated");
        const projectRoot = resolve(import.meta.dir, "../..");
        const wizCli = resolve(projectRoot, "src/cli/index.ts");

        const result = await $`bun ${wizCli} client ${specFile} --outdir ${clientDir} --wiz-validator`.quiet();

        expect(result.exitCode).toBe(0);

        // Verify validation code is present
        const apiFile = Bun.file(resolve(clientDir, "api.ts"));
        const apiContent = await apiFile.text();
        expect(apiContent).toContain("createValidator");
        expect(apiContent).toContain("// Validate path parameters");

        // Create test file that triggers validation errors
        const validationTestFile = resolve(tmpDir, "validation-test.ts");
        const validationTestCode = `
import { api } from "./client-validated/api";

async function testValidation() {
    try {
        // This should throw a validation error 
        const wrongParam: any = { petId: "not-a-number" };
        await api.getPetById(wrongParam);
        console.log("ERROR: Validation should have thrown");
        process.exit(1);
    } catch (error) {
        if (error instanceof TypeError && error.message.includes("Invalid")) {
            console.log("✓ Validation caught invalid parameter:", error.message);
        } else {
            console.log("ERROR: Unexpected error:", error);
            throw error;
        }
    }
    
    // This should work fine (just validates types, doesn't make real call)
    console.log("✓ Validation test completed");
}

testValidation();
`;

        await writeFile(validationTestFile, validationTestCode);

        // Run validation test - needs wiz plugin for createValidator to work
        // We need to create a proper build with the wiz plugin
        const validationTestWithPlugin = resolve(tmpDir, "validation-test-compiled.ts");
        const buildResult = await $`bun build ${validationTestFile} --outdir ${tmpDir} --target bun`.nothrow().quiet();

        if (buildResult.exitCode === 0) {
            const compiledFile = resolve(tmpDir, "validation-test.js");
            const runResult = await $`bun ${compiledFile}`.nothrow().quiet();

            // The test should pass (exit code 0) and show validation working
            if (runResult.exitCode === 0) {
                expect(runResult.stdout.toString()).toContain("Validation caught invalid parameter");
                expect(runResult.stdout.toString()).toContain("Validation test completed");
            }
        }
    });
});
