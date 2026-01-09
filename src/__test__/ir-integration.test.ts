/**
 * Basic IR integration tests
 *
 * Tests to verify the IR layer works end-to-end
 */
import { describe, expect, it } from "bun:test";

import { typeToIr } from "../ir/converters/ts-to-ir";
import { irToOpenApiSchemas } from "../ir/generators/ir-to-openapi";
import { irToTypeScript } from "../ir/generators/ir-to-ts";
import { createPrimitive, createObject } from "../ir/utils";

describe("IR Layer Integration", () => {
    it("should convert simple IR to OpenAPI", () => {
        const irType = createObject([
            {
                name: "id",
                type: createPrimitive("number"),
                required: true,
            },
            {
                name: "name",
                type: createPrimitive("string"),
                required: true,
            },
        ]);

        const schema = irToOpenApiSchemas(
            {
                types: [{ name: "User", type: irType }],
            },
            { version: "3.0" },
        );

        expect(schema.User).toBeDefined();
        expect(schema.User.type).toBe("object");
        expect(schema.User.properties).toHaveProperty("id");
        expect(schema.User.properties).toHaveProperty("name");
    });

    it("should convert simple IR to TypeScript", () => {
        const irType = createObject([
            {
                name: "id",
                type: createPrimitive("number"),
                required: true,
            },
            {
                name: "name",
                type: createPrimitive("string"),
                required: true,
            },
        ]);

        const result = irToTypeScript({
            types: [{ name: "User", type: irType }],
        });

        const userType = result.get("User");
        expect(userType).toBeDefined();
        expect(userType).toContain("export type User");
        expect(userType).toContain("id: number");
        expect(userType).toContain("name: string");
    });
});
