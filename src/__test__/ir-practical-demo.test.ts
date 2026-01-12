/**
 * IR Layer Demonstration
 *
 * This file demonstrates the IR layer working in practice with real examples.
 * It shows how the IR layer provides a unified approach to transformations.
 */
import { describe, expect, it } from "bun:test";
import { Project } from "ts-morph";

import { namedTypeToIrDefinition } from "../ir/converters/ts-to-ir";
import { irToOpenApiSchemas } from "../ir/generators/ir-to-openapi";
import { irToProtobuf } from "../ir/generators/ir-to-proto";
import { irToTypeScript } from "../ir/generators/ir-to-ts";

describe("IR Layer Practical Demonstrations", () => {
    it("should demonstrate TypeScript → IR → OpenAPI transformation", () => {
        // Create a TypeScript project with a type
        const project = new Project({ useInMemoryFileSystem: true });
        const sourceFile = project.createSourceFile(
            "demo.ts",
            `
            /**
             * Represents a user in the system
             */
            type User = {
                /** User's unique identifier */
                id: number;
                /** User's full name */
                name: string;
                /** User's email address */
                email: string;
                /** Optional phone number */
                phone?: string;
            };
        `,
        );

        const typeAlias = sourceFile.getTypeAliasOrThrow("User");
        const type = typeAlias.getType();

        // Convert TypeScript → IR
        const irTypeDef = namedTypeToIrDefinition("User", type, {
            availableTypes: new Set(["User"]),
        });

        expect(irTypeDef.name).toBe("User");
        expect(irTypeDef.type.kind).toBe("object");

        // Convert IR → OpenAPI
        const openApiSchemas = irToOpenApiSchemas(
            {
                types: [irTypeDef],
            },
            { version: "3.0" },
        );

        expect(openApiSchemas.User).toBeDefined();
        expect(openApiSchemas.User.type).toBe("object");
        expect(openApiSchemas.User.properties.id).toBeDefined();
        expect(openApiSchemas.User.properties.name).toBeDefined();
        expect(openApiSchemas.User.properties.email).toBeDefined();
        expect(openApiSchemas.User.properties.phone).toBeDefined();
        expect(openApiSchemas.User.required).toContain("id");
        expect(openApiSchemas.User.required).toContain("name");
        expect(openApiSchemas.User.required).not.toContain("phone");
    });

    it("should demonstrate TypeScript → IR → Protobuf transformation", () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const sourceFile = project.createSourceFile(
            "demo.ts",
            `
            type Message = {
                id: number;
                content: string;
                timestamp: number;
            };
        `,
        );

        const typeAlias = sourceFile.getTypeAliasOrThrow("Message");
        const type = typeAlias.getType();

        // Convert TypeScript → IR
        const irTypeDef = namedTypeToIrDefinition("Message", type, {
            availableTypes: new Set(["Message"]),
        });

        // Convert IR → Protobuf
        const protoModel = irToProtobuf({
            types: [irTypeDef],
            package: "demo",
        });

        expect(protoModel.messages.Message).toBeDefined();
        expect(protoModel.messages.Message.fields).toHaveLength(3);
        expect(protoModel.messages.Message.fields[0].name).toBe("id");
        expect(protoModel.messages.Message.fields[1].name).toBe("content");
        expect(protoModel.messages.Message.fields[2].name).toBe("timestamp");
    });

    it("should demonstrate TypeScript → IR → TypeScript roundtrip", () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const sourceFile = project.createSourceFile(
            "demo.ts",
            `
            type Product = {
                sku: string;
                name: string;
                price: number;
                inStock: boolean;
            };
        `,
        );

        const typeAlias = sourceFile.getTypeAliasOrThrow("Product");
        const type = typeAlias.getType();

        // Convert TypeScript → IR
        const irTypeDef = namedTypeToIrDefinition("Product", type, {
            availableTypes: new Set(["Product"]),
        });

        // Convert IR → TypeScript
        const tsCode = irToTypeScript({
            types: [irTypeDef],
        });

        const productCode = tsCode.get("Product");
        expect(productCode).toBeDefined();
        expect(productCode).toContain("export type Product");
        expect(productCode).toContain("sku: string");
        expect(productCode).toContain("name: string");
        expect(productCode).toContain("price: number");
        expect(productCode).toContain("inStock: boolean");
    });

    it("should handle complex types with nested objects", () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const sourceFile = project.createSourceFile(
            "demo.ts",
            `
            type Address = {
                street: string;
                city: string;
                country: string;
            };

            type Company = {
                name: string;
                address: Address;
                employees: number;
            };
        `,
        );

        const addressType = sourceFile.getTypeAliasOrThrow("Address").getType();
        const companyType = sourceFile.getTypeAliasOrThrow("Company").getType();

        const availableTypes = new Set(["Address", "Company"]);

        // Convert both types to IR
        const addressIr = namedTypeToIrDefinition("Address", addressType, { availableTypes });
        const companyIr = namedTypeToIrDefinition("Company", companyType, { availableTypes });

        // Convert to OpenAPI
        const openApiSchemas = irToOpenApiSchemas(
            {
                types: [addressIr, companyIr],
            },
            { version: "3.0" },
        );

        expect(openApiSchemas.Address).toBeDefined();
        expect(openApiSchemas.Company).toBeDefined();
        expect(openApiSchemas.Company.properties.address).toBeDefined();
        // The address property should be an object (inline or reference depending on implementation)
        expect(
            openApiSchemas.Company.properties.address.type === "object" ||
                openApiSchemas.Company.properties.address.$ref === "#/components/schemas/Address",
        ).toBe(true);
    });

    it("should handle union types", () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const sourceFile = project.createSourceFile(
            "demo.ts",
            `
            type Status = "active" | "inactive" | "pending";
        `,
        );

        const typeAlias = sourceFile.getTypeAliasOrThrow("Status");
        const type = typeAlias.getType();

        const irTypeDef = namedTypeToIrDefinition("Status", type, {
            availableTypes: new Set(["Status"]),
        });

        const openApiSchemas = irToOpenApiSchemas(
            {
                types: [irTypeDef],
            },
            { version: "3.0" },
        );

        expect(openApiSchemas.Status).toBeDefined();
        // String literal unions are represented as enum in OpenAPI, not oneOf
        expect(openApiSchemas.Status.enum).toBeDefined();
        expect(openApiSchemas.Status.enum).toHaveLength(3);
        expect(openApiSchemas.Status.enum).toContain("active");
        expect(openApiSchemas.Status.enum).toContain("inactive");
        expect(openApiSchemas.Status.enum).toContain("pending");
    });

    it("should handle array types", () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const sourceFile = project.createSourceFile(
            "demo.ts",
            `
            type TodoList = {
                title: string;
                items: string[];
            };
        `,
        );

        const typeAlias = sourceFile.getTypeAliasOrThrow("TodoList");
        const type = typeAlias.getType();

        const irTypeDef = namedTypeToIrDefinition("TodoList", type, {
            availableTypes: new Set(["TodoList"]),
        });

        const openApiSchemas = irToOpenApiSchemas(
            {
                types: [irTypeDef],
            },
            { version: "3.0" },
        );

        expect(openApiSchemas.TodoList).toBeDefined();
        expect(openApiSchemas.TodoList.properties.items).toBeDefined();
        expect(openApiSchemas.TodoList.properties.items.type).toBe("array");
        expect(openApiSchemas.TodoList.properties.items.items.type).toBe("string");
    });
});
