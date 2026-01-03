import { describe, expect, it } from "bun:test";

import { generateModelsFromProtobuf, parseProtoFile } from "../generator/protobuf";

describe("Protobuf to TypeScript generator", () => {
    it("should parse a simple proto file", () => {
        const protoContent = `
syntax = "proto3";

message User {
  int32 id = 1;
  string name = 2;
}
        `;

        const protoFile = parseProtoFile(protoContent);

        expect(protoFile.syntax).toBe("proto3");
        expect(protoFile.messages.length).toBe(1);
        expect(protoFile.messages[0]!.name).toBe("User");
        expect(protoFile.messages[0]!.fields.length).toBe(2);
    });

    it("should parse package declaration", () => {
        const protoContent = `
syntax = "proto3";
package myapp.v1;

message User {
  int32 id = 1;
}
        `;

        const protoFile = parseProtoFile(protoContent);

        expect(protoFile.package).toBe("myapp.v1");
    });

    it("should generate a simple type from proto message", () => {
        const protoContent = `
syntax = "proto3";

message User {
  int32 id = 1;
  string name = 2;
  bool active = 3;
}
        `;

        const protoFile = parseProtoFile(protoContent);
        const models = generateModelsFromProtobuf(protoFile);

        expect(models.size).toBe(1);

        const userModel = models.get("User");
        expect(userModel).toBeDefined();
        expect(userModel).toContain("export type User =");
        expect(userModel).toContain("id: number;");
        expect(userModel).toContain("name: string;");
        expect(userModel).toContain("active: boolean;");
    });

    it("should handle optional fields", () => {
        const protoContent = `
syntax = "proto3";

message User {
  int32 id = 1;
  optional string email = 2;
}
        `;

        const protoFile = parseProtoFile(protoContent);
        const models = generateModelsFromProtobuf(protoFile);
        const userModel = models.get("User");

        expect(userModel).toContain("id: number;");
        expect(userModel).toContain("email?: string;");
    });

    it("should handle repeated fields (arrays)", () => {
        const protoContent = `
syntax = "proto3";

message Post {
  int32 id = 1;
  repeated string tags = 2;
}
        `;

        const protoFile = parseProtoFile(protoContent);
        const models = generateModelsFromProtobuf(protoFile);
        const postModel = models.get("Post");

        expect(postModel).toContain("tags: string[];");
    });

    it("should handle map fields", () => {
        const protoContent = `
syntax = "proto3";

message User {
  int32 id = 1;
  map<string, string> metadata = 2;
}
        `;

        const protoFile = parseProtoFile(protoContent);
        const models = generateModelsFromProtobuf(protoFile);
        const userModel = models.get("User");

        expect(userModel).toContain("metadata: Record<string, string>;");
    });

    it("should map proto types to TypeScript types correctly", () => {
        const protoContent = `
syntax = "proto3";

message Types {
  string str = 1;
  int32 int32val = 2;
  int64 int64val = 3;
  uint32 uint32val = 4;
  uint64 uint64val = 5;
  bool boolval = 6;
  float floatval = 7;
  double doubleval = 8;
  bytes bytesval = 9;
}
        `;

        const protoFile = parseProtoFile(protoContent);
        const models = generateModelsFromProtobuf(protoFile);
        const typesModel = models.get("Types");

        expect(typesModel).toContain("str: string;");
        expect(typesModel).toContain("int32val: number;");
        expect(typesModel).toContain("int64val: number;");
        expect(typesModel).toContain("uint32val: number;");
        expect(typesModel).toContain("uint64val: number;");
        expect(typesModel).toContain("boolval: boolean;");
        expect(typesModel).toContain("floatval: number;");
        expect(typesModel).toContain("doubleval: number;");
        expect(typesModel).toContain("bytesval: Uint8Array;");
    });

    it("should generate JSDoc with field numbers", () => {
        const protoContent = `
syntax = "proto3";

message User {
  int32 id = 1;
  string name = 2;
}
        `;

        const protoFile = parseProtoFile(protoContent);
        const models = generateModelsFromProtobuf(protoFile);
        const userModel = models.get("User");

        expect(userModel).toContain("Field number: 1");
        expect(userModel).toContain("Field number: 2");
    });

    it("should include tags in JSDoc when enabled", () => {
        const protoContent = `
syntax = "proto3";

message User {
  int32 id = 1;
}
        `;

        const tags = {
            author: "Test Author",
            version: "1.0.0",
        };

        const protoFile = parseProtoFile(protoContent);
        const models = generateModelsFromProtobuf(protoFile, { includeTags: true, tags });
        const userModel = models.get("User");

        expect(userModel).toContain("@author Test Author");
        expect(userModel).toContain("@version 1.0.0");
    });

    it("should handle multiple messages", () => {
        const protoContent = `
syntax = "proto3";

message User {
  int32 id = 1;
}

message Post {
  int32 id = 1;
  int32 authorId = 2;
}
        `;

        const protoFile = parseProtoFile(protoContent);
        const models = generateModelsFromProtobuf(protoFile);

        expect(models.size).toBe(2);
        expect(models.has("User")).toBe(true);
        expect(models.has("Post")).toBe(true);
    });

    it("should skip comments and empty lines", () => {
        const protoContent = `
syntax = "proto3";

// This is a comment
message User {
  // User ID
  int32 id = 1;
  
  // User name
  string name = 2;
}
        `;

        const protoFile = parseProtoFile(protoContent);
        const models = generateModelsFromProtobuf(protoFile);

        expect(models.size).toBe(1);
        const userModel = models.get("User");
        expect(userModel).toContain("id: number;");
        expect(userModel).toContain("name: string;");
    });
});
