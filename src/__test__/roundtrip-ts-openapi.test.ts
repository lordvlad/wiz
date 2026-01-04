import { describe, expect, it } from "bun:test";

import { generateModelsFromOpenApi } from "../generator/openapi";
import { compile } from "./util";

describe("TypeScript → OpenAPI → TypeScript roundtrip", () => {
    it("should roundtrip basic types", async () => {
        // Step 1: Define TypeScript type
        const originalType = `
export type User = {
    id: number;
    name: string;
    active: boolean;
};
        `;

        // Step 2: TypeScript → OpenAPI (via plugin)
        const source = `
            ${originalType}
            import { createOpenApiSchema } from "wiz/openApiSchema";
            export const schema = createOpenApiSchema<[User], "3.0">();
        `;

        const compiled = await compile(source);

        // Verify OpenAPI schema was generated
        expect(compiled).toContain('components:');
        expect(compiled).toContain('User:');

        // Extract the schema from compiled code
        const schemaMatch = compiled.match(/var schema = ({[\s\S]*?});/);
        expect(schemaMatch).toBeTruthy();

        const openApiSpec = eval(`(${schemaMatch![1]})`);

        // Step 3: OpenAPI → TypeScript
        const models = generateModelsFromOpenApi(openApiSpec);
        const regeneratedUserModel = models.get("User");

        // Verify roundtrip
        expect(regeneratedUserModel).toBeDefined();
        expect(regeneratedUserModel).toContain("id: number");
        expect(regeneratedUserModel).toContain("name: string");
        expect(regeneratedUserModel).toContain("active: boolean");
    });

    it("should roundtrip optional properties", async () => {
        const originalType = `
export type User = {
    id: number;
    email?: string;
};
        `;

        // TypeScript → OpenAPI
        const source = `
            ${originalType}
            import { createOpenApiSchema } from "wiz/openApiSchema";
            export const schema = createOpenApiSchema<[User], "3.0">();
        `;

        const compiled = await compile(source);

        // Extract and parse schema
        const schemaMatch = compiled.match(/var schema = ({[\s\S]*?});/);
        const openApiSpec = eval(`(${schemaMatch![1]})`);

        // OpenAPI → TypeScript
        const models = generateModelsFromOpenApi(openApiSpec);
        const regeneratedModel = models.get("User");

        // Verify optional field
        expect(regeneratedModel).toContain("email?: string");
        expect(regeneratedModel).toContain("id: number");
    });

    it("should roundtrip array types", async () => {
        const originalType = `
export type Post = {
    id: number;
    tags: string[];
};
        `;

        // TypeScript → OpenAPI
        const source = `
            ${originalType}
            import { createOpenApiSchema } from "wiz/openApiSchema";
            export const schema = createOpenApiSchema<[Post], "3.0">();
        `;

        const compiled = await compile(source);

        // Extract and parse schema
        const schemaMatch = compiled.match(/var schema = ({[\s\S]*?});/);
        const openApiSpec = eval(`(${schemaMatch![1]})`);

        // OpenAPI → TypeScript
        const models = generateModelsFromOpenApi(openApiSpec);
        const regeneratedModel = models.get("Post");

        // Verify array field
        expect(regeneratedModel).toContain("tags: string[]");
        expect(regeneratedModel).toContain("id: number");
    });

    it("should roundtrip nested types", async () => {
        const originalTypes = `
export type Address = {
    street: string;
    city: string;
};

export type User = {
    id: number;
    address: Address;
};
        `;

        // TypeScript → OpenAPI
        const source = `
            ${originalTypes}
            import { createOpenApiSchema } from "wiz/openApiSchema";
            export const schema = createOpenApiSchema<[Address, User], "3.0">();
        `;

        const compiled = await compile(source);

        // Extract and parse schema
        const schemaMatch = compiled.match(/var schema = ({[\s\S]*?});/);
        const openApiSpec = eval(`(${schemaMatch![1]})`);

        // OpenAPI → TypeScript
        const models = generateModelsFromOpenApi(openApiSpec);
        const addressModel = models.get("Address");
        const userModel = models.get("User");

        // Verify both types
        expect(addressModel).toBeDefined();
        expect(addressModel).toContain("street: string");
        expect(addressModel).toContain("city: string");

        expect(userModel).toBeDefined();
        expect(userModel).toContain("id: number");
        expect(userModel).toContain("address: Address");
    });

    it("should roundtrip union types", async () => {
        const originalType = `
export type Status = "active" | "inactive" | "pending";

export type User = {
    id: number;
    status: Status;
};
        `;

        // TypeScript → OpenAPI
        const source = `
            ${originalType}
            import { createOpenApiSchema } from "wiz/openApiSchema";
            export const schema = createOpenApiSchema<[Status, User], "3.0">();
        `;

        const compiled = await compile(source);

        // Extract and parse schema
        const schemaMatch = compiled.match(/var schema = ({[\s\S]*?});/);
        const openApiSpec = eval(`(${schemaMatch![1]})`);

        // OpenAPI → TypeScript
        const models = generateModelsFromOpenApi(openApiSpec);
        const statusModel = models.get("Status");
        const userModel = models.get("User");

        // Verify enum type
        expect(statusModel).toBeDefined();
        expect(statusModel).toContain('"active"');
        expect(statusModel).toContain('"inactive"');
        expect(statusModel).toContain('"pending"');

        expect(userModel).toBeDefined();
        expect(userModel).toContain("status: Status");
    });

    it("should roundtrip nullable types", async () => {
        const originalType = `
export type User = {
    id: number;
    name: string | null;
};
        `;

        // TypeScript → OpenAPI 3.0
        const source = `
            ${originalType}
            import { createOpenApiSchema } from "wiz/openApiSchema";
            export const schema = createOpenApiSchema<[User], "3.0">();
        `;

        const compiled = await compile(source);

        // Extract and parse schema
        const schemaMatch = compiled.match(/var schema = ({[\s\S]*?});/);
        const openApiSpec = eval(`(${schemaMatch![1]})`);

        // OpenAPI → TypeScript
        const models = generateModelsFromOpenApi(openApiSpec);
        const regeneratedModel = models.get("User");

        // Verify nullable field
        expect(regeneratedModel).toContain("name: string | null");
        expect(regeneratedModel).toContain("id: number");
    });

    it("should roundtrip JSDoc descriptions", async () => {
        const originalType = `
export type User = {
    /**
     * Unique identifier for the user
     */
    id: number;
    /**
     * User's full name
     * @minLength 3
     * @maxLength 100
     */
    name: string;
};
        `;

        // TypeScript → OpenAPI
        const source = `
            ${originalType}
            import { createOpenApiSchema } from "wiz/openApiSchema";
            export const schema = createOpenApiSchema<[User], "3.0">();
        `;

        const compiled = await compile(source);

        // Extract and parse schema
        const schemaMatch = compiled.match(/var schema = ({[\s\S]*?});/);
        const openApiSpec = eval(`(${schemaMatch![1]})`);

        // Verify JSDoc was captured
        expect(openApiSpec.components.schemas.User.properties.id.description).toBe(
            "Unique identifier for the user"
        );
        expect(openApiSpec.components.schemas.User.properties.name.description).toBe("User's full name");
        expect(openApiSpec.components.schemas.User.properties.name.minLength).toBe(3);
        expect(openApiSpec.components.schemas.User.properties.name.maxLength).toBe(100);

        // OpenAPI → TypeScript
        const models = generateModelsFromOpenApi(openApiSpec);
        const regeneratedModel = models.get("User");

        // Verify JSDoc is preserved in comments
        expect(regeneratedModel).toContain("Unique identifier for the user");
        expect(regeneratedModel).toContain("User's full name");
        expect(regeneratedModel).toContain("@minLength 3");
        expect(regeneratedModel).toContain("@maxLength 100");
    });

    it("should roundtrip Record types", async () => {
        const originalType = `
export type Config = {
    version: number;
    settings: Record<string, string>;
};
        `;

        // TypeScript → OpenAPI
        const source = `
            ${originalType}
            import { createOpenApiSchema } from "wiz/openApiSchema";
            export const schema = createOpenApiSchema<[Config], "3.0">();
        `;

        const compiled = await compile(source);

        // Extract and parse schema
        const schemaMatch = compiled.match(/var schema = ({[\s\S]*?});/);
        const openApiSpec = eval(`(${schemaMatch![1]})`);

        // OpenAPI → TypeScript
        const models = generateModelsFromOpenApi(openApiSpec);
        const regeneratedModel = models.get("Config");

        // Verify Record type (additionalProperties)
        expect(regeneratedModel).toContain("version: number");
        // The generator should preserve the additionalProperties as an index signature
        expect(regeneratedModel).toMatch(/\[key: string\]: string/);
    });

    it("should roundtrip complex union types", async () => {
        const originalType = `
export type Dog = {
    kind: "dog";
    bark: boolean;
};

export type Cat = {
    kind: "cat";
    meow: boolean;
};

export type Pet = Dog | Cat;

export type Owner = {
    id: number;
    pet: Pet;
};
        `;

        // TypeScript → OpenAPI
        const source = `
            ${originalType}
            import { createOpenApiSchema } from "wiz/openApiSchema";
            export const schema = createOpenApiSchema<[Dog, Cat, Pet, Owner], "3.0">();
        `;

        const compiled = await compile(source);

        // Extract and parse schema
        const schemaMatch = compiled.match(/var schema = ({[\s\S]*?});/);
        const openApiSpec = eval(`(${schemaMatch![1]})`);

        // OpenAPI → TypeScript
        const models = generateModelsFromOpenApi(openApiSpec);
        const dogModel = models.get("Dog");
        const catModel = models.get("Cat");
        const petModel = models.get("Pet");
        const ownerModel = models.get("Owner");

        // Verify all types exist
        expect(dogModel).toBeDefined();
        expect(catModel).toBeDefined();
        expect(petModel).toBeDefined();
        expect(ownerModel).toBeDefined();

        // Verify union structure
        expect(petModel).toContain("|");
        expect(ownerModel).toContain("pet: Pet");
    });

    it("should roundtrip nullable unions (OpenAPI 3.1)", async () => {
        const originalType = `
export type User = {
    id: number;
    name: string | null;
};
        `;

        // TypeScript → OpenAPI 3.1
        const source = `
            ${originalType}
            import { createOpenApiSchema } from "wiz/openApiSchema";
            export const schema = createOpenApiSchema<[User], "3.1">();
        `;

        const compiled = await compile(source);

        // Extract and parse schema
        const schemaMatch = compiled.match(/var schema = ({[\s\S]*?});/);
        const openApiSpec = eval(`(${schemaMatch![1]})`);

        // Verify 3.1 format (type array)
        expect(Array.isArray(openApiSpec.components.schemas.User.properties.name.type)).toBe(true);
        expect(openApiSpec.components.schemas.User.properties.name.type).toContain("string");
        expect(openApiSpec.components.schemas.User.properties.name.type).toContain("null");

        // OpenAPI → TypeScript
        const models = generateModelsFromOpenApi(openApiSpec);
        const regeneratedModel = models.get("User");

        // Verify nullable field
        expect(regeneratedModel).toContain("name: string | null");
    });
});
