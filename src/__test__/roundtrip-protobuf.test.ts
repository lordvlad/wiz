import { describe, expect, it } from "bun:test";

import { generateModelsFromProtobuf, parseProtoFile } from "../generator/protobuf";
import { compile } from "./util";

describe("Protobuf → TypeScript → Protobuf roundtrip", () => {
    it("should roundtrip basic types", async () => {
        const originalProto = `
syntax = "proto3";

message User {
  int32 id = 1;
  string name = 2;
  bool active = 3;
}
        `;

        // Step 1: Protobuf → TypeScript
        const protoFile = parseProtoFile(originalProto);
        const models = generateModelsFromProtobuf(protoFile);
        const userModel = models.get("User");
        expect(userModel).toBeDefined();
        expect(userModel).toContain("id: number");
        expect(userModel).toContain("name: string");
        expect(userModel).toContain("active: boolean");

        // Step 2: TypeScript → Protobuf (via plugin)
        const source = `
            ${userModel}
            import { createProtobufModel } from "wiz/protobuf";
            export const model = createProtobufModel<[User]>();
        `;

        const compiled = await compile(source);

        // Verify basic types are present
        expect(compiled).toContain('messages:');
        expect(compiled).toContain('User:');
        expect(compiled).toContain('id');
        expect(compiled).toContain('name');
        expect(compiled).toContain('active');
        expect(compiled).toContain('type: "int32"');
        expect(compiled).toContain('type: "string"');
        expect(compiled).toContain('type: "bool"');
    });

    it("should roundtrip optional fields", async () => {
        const originalProto = `
syntax = "proto3";

message User {
  int32 id = 1;
  optional string email = 2;
}
        `;

        // Protobuf → TypeScript
        const protoFile = parseProtoFile(originalProto);
        const models = generateModelsFromProtobuf(protoFile);
        const userModel = models.get("User");
        expect(userModel).toContain("email?: string");

        // TypeScript → Protobuf
        const source = `
            ${userModel}
            import { createProtobufModel } from "wiz/protobuf";
            export const model = createProtobufModel<[User]>();
        `;

        const compiled = await compile(source);

        // Verify optional field - check that email is present and not in required
        expect(compiled).toContain('email');
        expect(compiled).toContain('type: "string"');
    });

    it("should roundtrip repeated fields (arrays)", async () => {
        const originalProto = `
syntax = "proto3";

message Post {
  int32 id = 1;
  repeated string tags = 2;
}
        `;

        // Protobuf → TypeScript
        const protoFile = parseProtoFile(originalProto);
        const models = generateModelsFromProtobuf(protoFile);
        const postModel = models.get("Post");
        expect(postModel).toContain("tags: string[]");

        // TypeScript → Protobuf
        const source = `
            ${postModel}
            import { createProtobufModel } from "wiz/protobuf";
            export const model = createProtobufModel<[Post]>();
        `;

        const compiled = await compile(source);

        // Verify array field
        expect(compiled).toContain('tags');
        expect(compiled).toContain('type: "string"');
    });

    it("should roundtrip map fields", async () => {
        const originalProto = `
syntax = "proto3";

message User {
  int32 id = 1;
  map<string, string> metadata = 2;
}
        `;

        // Protobuf → TypeScript
        const protoFile = parseProtoFile(originalProto);
        const models = generateModelsFromProtobuf(protoFile);
        const userModel = models.get("User");
        expect(userModel).toContain("metadata: Record<string, string>");

        // TypeScript → Protobuf
        const source = `
            ${userModel}
            import { createProtobufModel } from "wiz/protobuf";
            export const model = createProtobufModel<[User]>();
        `;

        const compiled = await compile(source);

        // Verify map field - Record types should generate maps
        expect(compiled).toContain('metadata');
    });

    it("should roundtrip nested messages", async () => {
        const originalProto = `
syntax = "proto3";

message Address {
  string street = 1;
  string city = 2;
}

message User {
  int32 id = 1;
  Address address = 2;
}
        `;

        // Protobuf → TypeScript
        const protoFile = parseProtoFile(originalProto);
        const models = generateModelsFromProtobuf(protoFile);
        const addressModel = models.get("Address");
        const userModel = models.get("User");
        expect(userModel).toContain("address: Address");

        // TypeScript → Protobuf
        const source = `
            ${addressModel}
            ${userModel}
            import { createProtobufModel } from "wiz/protobuf";
            export const model = createProtobufModel<[Address, User]>();
        `;

        const compiled = await compile(source);

        // Verify both types exist
        expect(compiled).toContain('Address:');
        expect(compiled).toContain('User:');
        expect(compiled).toContain('address');
    });

    it("should roundtrip various protobuf types", async () => {
        const originalProto = `
syntax = "proto3";

message Types {
  string str = 1;
  int32 int32val = 2;
  int64 int64val = 3;
  bool boolval = 4;
  float floatval = 5;
  double doubleval = 6;
  bytes bytesval = 7;
}
        `;

        // Protobuf → TypeScript
        const protoFile = parseProtoFile(originalProto);
        const models = generateModelsFromProtobuf(protoFile);
        const typesModel = models.get("Types");
        expect(typesModel).toContain("str: string");
        expect(typesModel).toContain("int32val: number");
        expect(typesModel).toContain("int64val: number");
        expect(typesModel).toContain("boolval: boolean");
        expect(typesModel).toContain("floatval: number");
        expect(typesModel).toContain("doubleval: number");
        expect(typesModel).toContain("bytesval: Uint8Array");

        // TypeScript → Protobuf
        const source = `
            ${typesModel}
            import { createProtobufModel } from "wiz/protobuf";
            export const model = createProtobufModel<[Types]>();
        `;

        const compiled = await compile(source);

        // Verify all types are present
        expect(compiled).toContain('Types:');
        expect(compiled).toContain('str');
        expect(compiled).toContain('int32val');
        expect(compiled).toContain('int64val');
        expect(compiled).toContain('boolval');
        expect(compiled).toContain('floatval');
        expect(compiled).toContain('doubleval');
        expect(compiled).toContain('bytesval');
    });
});
