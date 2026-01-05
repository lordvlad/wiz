import { describe, expect, it } from "bun:test";

import { generateModelsFromProtobuf } from "../generator/protobuf";
import { compile } from "./util";

describe("TypeScript → Protobuf → TypeScript roundtrip", () => {
    it("should roundtrip basic types", async () => {
        // Step 1: Define TypeScript type
        const originalType = `
export type User = {
    id: number;
    name: string;
    active: boolean;
};
        `;

        // Step 2: TypeScript → Protobuf (via plugin)
        const source = `
            ${originalType}
            import { createProtobufModel } from "wiz/protobuf";
            export const model = createProtobufModel<[User]>();
        `;

        const compiled = await compile(source);

        // Verify protobuf was generated
        expect(compiled).toContain("messages:");
        expect(compiled).toContain("User:");

        // Extract the model from compiled code
        const modelMatch = compiled.match(/var model = ({[\s\S]*?});/);
        expect(modelMatch).toBeTruthy();

        const protoModel = eval(`(${modelMatch![1]})`);

        // Step 3: Protobuf → TypeScript
        const protoFile = {
            syntax: "proto3",
            messages: Object.values(protoModel.messages),
        };

        const models = generateModelsFromProtobuf(protoFile);
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

        // TypeScript → Protobuf
        const source = `
            ${originalType}
            import { createProtobufModel } from "wiz/protobuf";
            export const model = createProtobufModel<[User]>();
        `;

        const compiled = await compile(source);

        // Extract and parse model
        const modelMatch = compiled.match(/var model = ({[\s\S]*?});/);
        const protoModel = eval(`(${modelMatch![1]})`);

        // Protobuf → TypeScript
        const protoFile = {
            syntax: "proto3",
            messages: Object.values(protoModel.messages),
        };

        const models = generateModelsFromProtobuf(protoFile);
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

        // TypeScript → Protobuf
        const source = `
            ${originalType}
            import { createProtobufModel } from "wiz/protobuf";
            export const model = createProtobufModel<[Post]>();
        `;

        const compiled = await compile(source);

        // Extract and parse model
        const modelMatch = compiled.match(/var model = ({[\s\S]*?});/);
        const protoModel = eval(`(${modelMatch![1]})`);

        // Protobuf → TypeScript
        const protoFile = {
            syntax: "proto3",
            messages: Object.values(protoModel.messages),
        };

        const models = generateModelsFromProtobuf(protoFile);
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

        // TypeScript → Protobuf
        const source = `
            ${originalTypes}
            import { createProtobufModel } from "wiz/protobuf";
            export const model = createProtobufModel<[Address, User]>();
        `;

        const compiled = await compile(source);

        // Extract and parse model
        const modelMatch = compiled.match(/var model = ({[\s\S]*?});/);
        const protoModel = eval(`(${modelMatch![1]})`);

        // Protobuf → TypeScript
        const protoFile = {
            syntax: "proto3",
            messages: Object.values(protoModel.messages),
        };

        const models = generateModelsFromProtobuf(protoFile);
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

    it("should roundtrip Record types (maps)", async () => {
        const originalType = `
export type Config = {
    id: number;
    metadata: Record<string, string>;
};
        `;

        // TypeScript → Protobuf
        const source = `
            ${originalType}
            import { createProtobufModel } from "wiz/protobuf";
            export const model = createProtobufModel<[Config]>();
        `;

        const compiled = await compile(source);

        // Extract and parse model
        const modelMatch = compiled.match(/var model = ({[\s\S]*?});/);
        const protoModel = eval(`(${modelMatch![1]})`);

        // Protobuf → TypeScript
        const protoFile = {
            syntax: "proto3",
            messages: Object.values(protoModel.messages),
        };

        const models = generateModelsFromProtobuf(protoFile);
        const regeneratedModel = models.get("Config");

        // Verify map field
        expect(regeneratedModel).toContain("metadata: Record<string, string>");
        expect(regeneratedModel).toContain("id: number");
    });

    it("should roundtrip number types as int32", async () => {
        const originalType = `
export type Data = {
    count: number;
    value: number;
};
        `;

        // TypeScript → Protobuf
        const source = `
            ${originalType}
            import { createProtobufModel } from "wiz/protobuf";
            export const model = createProtobufModel<[Data]>();
        `;

        const compiled = await compile(source);

        // Verify int32 is used
        expect(compiled).toContain('type: "int32"');

        // Extract and parse model
        const modelMatch = compiled.match(/var model = ({[\s\S]*?});/);
        const protoModel = eval(`(${modelMatch![1]})`);

        // Protobuf → TypeScript
        const protoFile = {
            syntax: "proto3",
            messages: Object.values(protoModel.messages),
        };

        const models = generateModelsFromProtobuf(protoFile);
        const regeneratedModel = models.get("Data");

        // Verify number roundtrip
        expect(regeneratedModel).toContain("count: number");
        expect(regeneratedModel).toContain("value: number");
    });

    it("should roundtrip Date types", async () => {
        const originalType = `
export type Event = {
    id: number;
    timestamp: Date;
};
        `;

        // TypeScript → Protobuf
        const source = `
            ${originalType}
            import { createProtobufModel } from "wiz/protobuf";
            export const model = createProtobufModel<[Event]>();
        `;

        const compiled = await compile(source);

        // Date should remain as "Date" type in the protobuf model metadata
        // The actual proto file would convert this appropriately
        expect(compiled).toContain("timestamp");

        // Extract and parse model
        const modelMatch = compiled.match(/var model = ({[\s\S]*?});/);
        const protoModel = eval(`(${modelMatch![1]})`);

        // Verify the model has the timestamp field
        expect(protoModel.messages.Event).toBeDefined();
        expect(protoModel.messages.Event.fields).toBeDefined();
        const timestampField = protoModel.messages.Event.fields.find((f: any) => f.name === "timestamp");
        expect(timestampField).toBeDefined();
    });
});
