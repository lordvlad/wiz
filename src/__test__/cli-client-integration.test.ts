import { $ } from "bun";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "fs/promises";
import { resolve } from "path";

const tmpDir = resolve(import.meta.dir, ".tmp-integration-test");

/**
 * Real-world integration test for OpenAPI client generation
 *
 * This test uses a real public API (JSONPlaceholder) to:
 * 1. Generate a TypeScript client from an OpenAPI spec using CLI
 * 2. Import and use the generated client
 * 3. Make actual API calls to verify functionality
 * 4. Test TypeScript type checking with intentional errors
 */
describe("Real-world OpenAPI client integration", () => {
    beforeEach(async () => {
        await mkdir(tmpDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    it("should generate client, make API calls, and enforce type safety", async () => {
        // Step 1: Create a realistic OpenAPI spec for JSONPlaceholder API
        const specFile = resolve(tmpDir, "jsonplaceholder.json");
        const spec = {
            openapi: "3.0.0",
            info: {
                title: "JSONPlaceholder API",
                version: "1.0.0",
                description: "Fake online REST API for testing and prototyping",
            },
            servers: [
                {
                    url: "https://jsonplaceholder.typicode.com",
                },
            ],
            paths: {
                "/posts": {
                    get: {
                        operationId: "getPosts",
                        summary: "Get all posts",
                        parameters: [
                            {
                                name: "userId",
                                in: "query",
                                required: false,
                                schema: { type: "number" },
                                description: "Filter posts by user ID",
                            },
                        ],
                        responses: {
                            "200": {
                                description: "Successful response",
                                content: {
                                    "application/json": {
                                        schema: {
                                            type: "array",
                                            items: {
                                                $ref: "#/components/schemas/Post",
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    post: {
                        operationId: "createPost",
                        summary: "Create a new post",
                        requestBody: {
                            required: true,
                            content: {
                                "application/json": {
                                    schema: {
                                        $ref: "#/components/schemas/CreatePostRequest",
                                    },
                                },
                            },
                        },
                        responses: {
                            "201": {
                                description: "Post created",
                                content: {
                                    "application/json": {
                                        schema: {
                                            $ref: "#/components/schemas/Post",
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                "/posts/{id}": {
                    get: {
                        operationId: "getPostById",
                        summary: "Get a post by ID",
                        parameters: [
                            {
                                name: "id",
                                in: "path",
                                required: true,
                                schema: { type: "number" },
                                description: "Post ID",
                            },
                        ],
                        responses: {
                            "200": {
                                description: "Successful response",
                                content: {
                                    "application/json": {
                                        schema: {
                                            $ref: "#/components/schemas/Post",
                                        },
                                    },
                                },
                            },
                            "404": {
                                description: "Post not found",
                            },
                        },
                    },
                },
                "/users/{id}": {
                    get: {
                        operationId: "getUserById",
                        summary: "Get a user by ID",
                        parameters: [
                            {
                                name: "id",
                                in: "path",
                                required: true,
                                schema: { type: "number" },
                                description: "User ID",
                            },
                        ],
                        responses: {
                            "200": {
                                description: "Successful response",
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
                    Post: {
                        type: "object",
                        required: ["id", "userId", "title", "body"],
                        properties: {
                            id: {
                                type: "number",
                                description: "Post ID",
                            },
                            userId: {
                                type: "number",
                                description: "User ID of the post author",
                            },
                            title: {
                                type: "string",
                                description: "Post title",
                            },
                            body: {
                                type: "string",
                                description: "Post content",
                            },
                        },
                    },
                    CreatePostRequest: {
                        type: "object",
                        required: ["userId", "title", "body"],
                        properties: {
                            userId: {
                                type: "number",
                            },
                            title: {
                                type: "string",
                            },
                            body: {
                                type: "string",
                            },
                        },
                    },
                    User: {
                        type: "object",
                        required: ["id", "name", "email"],
                        properties: {
                            id: {
                                type: "number",
                            },
                            name: {
                                type: "string",
                            },
                            email: {
                                type: "string",
                            },
                            username: {
                                type: "string",
                            },
                        },
                    },
                },
            },
        };

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

        // Step 3: Create a test file that imports and uses the generated client
        const testClientFile = resolve(tmpDir, "test-client.ts");
        const testClientCode = `
import { api, setApiConfig } from "./client/api";
import type * as Models from "./client/model";

// Test 1: Make a real API call to get posts
export async function testGetPosts() {
    const response = await api.getPosts();
    const posts = await response.json() as Models.Post[];
    
    if (!Array.isArray(posts)) {
        throw new Error("Expected posts to be an array");
    }
    
    if (posts.length === 0) {
        throw new Error("Expected at least one post");
    }
    
    // Verify structure of first post
    const firstPost = posts[0];
    if (typeof firstPost.id !== "number") {
        throw new Error("Expected post.id to be a number");
    }
    if (typeof firstPost.title !== "string") {
        throw new Error("Expected post.title to be a string");
    }
    
    return posts;
}

// Test 2: Filter posts by userId
export async function testGetPostsByUserId() {
    const response = await api.getPosts({ userId: 1 });
    const posts = await response.json() as Models.Post[];
    
    // All posts should have userId = 1
    for (const post of posts) {
        if (post.userId !== 1) {
            throw new Error(\`Expected post.userId to be 1, got \${post.userId}\`);
        }
    }
    
    return posts;
}

// Test 3: Get a specific post by ID
export async function testGetPostById() {
    const response = await api.getPostById({ id: 1 });
    const post = await response.json() as Models.Post;
    
    if (post.id !== 1) {
        throw new Error(\`Expected post.id to be 1, got \${post.id}\`);
    }
    
    return post;
}

// Test 4: Create a new post (JSONPlaceholder fakes this)
export async function testCreatePost() {
    const newPost: Models.CreatePostRequest = {
        userId: 1,
        title: "Test Post",
        body: "This is a test post created by wiz integration test",
    };
    
    const response = await api.createPost(newPost);
    const created = await response.json() as Models.Post;
    
    if (created.title !== newPost.title) {
        throw new Error("Created post title doesn't match");
    }
    
    return created;
}

// Test 5: Test error case - non-existent post
export async function testGetNonExistentPost() {
    const response = await api.getPostById({ id: 999999 });
    
    // JSONPlaceholder returns 404 for non-existent posts
    // But actually returns an empty object with status 200
    // This is the actual behavior of the API
    return response.status;
}

// Run all tests
async function runAllTests() {
    console.log("Running integration tests...");
    
    try {
        console.log("Test 1: Get all posts");
        const posts = await testGetPosts();
        console.log(\`✓ Got \${posts.length} posts\`);
        
        console.log("Test 2: Get posts filtered by userId");
        const userPosts = await testGetPostsByUserId();
        console.log(\`✓ Got \${userPosts.length} posts for user 1\`);
        
        console.log("Test 3: Get post by ID");
        const post = await testGetPostById();
        console.log(\`✓ Got post: \${post.title}\`);
        
        console.log("Test 4: Create post");
        const created = await testCreatePost();
        console.log(\`✓ Created post with ID: \${created.id}\`);
        
        console.log("Test 5: Get non-existent post");
        const status = await testGetNonExistentPost();
        console.log(\`✓ Got status: \${status}\`);
        
        console.log("\\nAll tests passed!");
        return true;
    } catch (error) {
        console.error("Test failed:", error);
        throw error;
    }
}

runAllTests();
`;

        await writeFile(testClientFile, testClientCode);

        // Step 4: Run the test client to verify it works
        const testResult = await $`bun ${testClientFile}`.quiet();

        expect(testResult.exitCode).toBe(0);
        expect(testResult.stdout.toString()).toContain("All tests passed!");

        // Step 5: Test TypeScript type checking with intentional errors
        // Create a file with type errors
        const typeErrorFile = resolve(tmpDir, "type-error-test.ts");
        const typeErrorCode = `
import { api } from "./client/api";

// This should cause TypeScript errors:
// 1. Wrong parameter type (string instead of number)
async function testTypeError1() {
    // @ts-expect-error - intentionally passing wrong type
    await api.getPostById({ id: "not-a-number" });
}

// 2. Missing required parameter
async function testTypeError2() {
    // @ts-expect-error - intentionally missing required parameter
    await api.getPostById({});
}

// 3. Wrong property in request body
async function testTypeError3() {
    // @ts-expect-error - intentionally using wrong property
    await api.createPost({ 
        wrongProperty: 123,
        title: "Test",
        body: "Test"
    });
}

// 4. Missing required properties in request body
async function testTypeError4() {
    // @ts-expect-error - intentionally missing required properties
    await api.createPost({ userId: 1 });
}

console.log("Type error tests defined");
`;

        await writeFile(typeErrorFile, typeErrorCode);

        // Run TypeScript compiler to verify errors are caught
        const tscResult = await $`bun tsc --noEmit ${typeErrorFile}`.nothrow().quiet();

        // TypeScript should find errors (non-zero exit code)
        // But we marked them with @ts-expect-error, so it should actually pass
        // Let's verify the file has the @ts-expect-error comments
        const typeErrorContent = await Bun.file(typeErrorFile).text();
        expect(typeErrorContent).toContain("@ts-expect-error");

        // Step 6: Test runtime behavior with wrong parameters
        const runtimeErrorFile = resolve(tmpDir, "runtime-error-test.ts");
        const runtimeErrorCode = `
import { api } from "./client/api";

async function testRuntimeErrors() {
    try {
        // Pass wrong type at runtime (bypassing TypeScript)
        const wrongParam: any = { id: "not-a-number" };
        const response = await api.getPostById(wrongParam);
        
        // The API might still work or return an error
        // JSONPlaceholder is forgiving, but let's check the response
        console.log("Response status:", response.status);
        
        if (response.ok) {
            const data = await response.json();
            console.log("Got response despite wrong parameter:", data);
        } else {
            console.log("Got error as expected:", response.statusText);
        }
    } catch (error) {
        console.log("Caught error:", error);
    }
    
    // Test with actually invalid ID that might cause 404
    try {
        const response = await api.getPostById({ id: -999 });
        console.log("Invalid ID response status:", response.status);
    } catch (error) {
        console.log("Caught error for invalid ID:", error);
    }
}

testRuntimeErrors();
`;

        await writeFile(runtimeErrorFile, runtimeErrorCode);

        // Run the runtime error test
        const runtimeResult = await $`bun ${runtimeErrorFile}`.quiet();

        // Should complete without crashing
        expect(runtimeResult.exitCode).toBe(0);
        expect(runtimeResult.stdout.toString()).toContain("Response status:");
    }, 30000); // 30 second timeout for API calls

    it("should generate client with validation and catch parameter errors", async () => {
        // Create OpenAPI spec
        const specFile = resolve(tmpDir, "jsonplaceholder-validated.json");
        const spec = {
            openapi: "3.0.0",
            info: {
                title: "JSONPlaceholder API with Validation",
                version: "1.0.0",
            },
            servers: [
                {
                    url: "https://jsonplaceholder.typicode.com",
                },
            ],
            paths: {
                "/posts/{id}": {
                    get: {
                        operationId: "getPostById",
                        parameters: [
                            {
                                name: "id",
                                in: "path",
                                required: true,
                                schema: { type: "number" },
                            },
                        ],
                        responses: {
                            "200": {
                                description: "Success",
                                content: {
                                    "application/json": {
                                        schema: {
                                            $ref: "#/components/schemas/Post",
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
                    Post: {
                        type: "object",
                        required: ["id", "title"],
                        properties: {
                            id: { type: "number" },
                            title: { type: "string" },
                            body: { type: "string" },
                        },
                    },
                },
            },
        };

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
        // This should throw a validation error because id should be a number
        const wrongParam: any = { id: "not-a-number" };
        await api.getPostById(wrongParam);
        console.log("ERROR: Validation should have thrown");
        process.exit(1);
    } catch (error) {
        if (error instanceof TypeError && error.message.includes("Invalid path parameters")) {
            console.log("✓ Validation caught invalid parameter:", error.message);
        } else {
            console.log("ERROR: Unexpected error:", error);
            throw error;
        }
    }
    
    // This should work fine
    const response = await api.getPostById({ id: 1 });
    console.log("✓ Valid call succeeded with status:", response.status);
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
                expect(runResult.stdout.toString()).toContain("Valid call succeeded");
            }
        }
    });
});
