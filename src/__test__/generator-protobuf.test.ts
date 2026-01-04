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

    it("should parse and use @wiz-format comments", () => {
        const protoContent = `
syntax = "proto3";

message User {
  // User ID
  // @wiz-format int64
  int64 id = 1;
  // User email address
  // @wiz-format email
  string email = 2;
  // Account balance
  // @wiz-format double
  double balance = 3;
}
        `;

        const protoFile = parseProtoFile(protoContent);
        const models = generateModelsFromProtobuf(protoFile);
        const userModel = models.get("User");

        expect(userModel).toContain('id: bigint & { __bigint_format: "int64" };');
        expect(userModel).toContain('email: string & { __str_format: "email" };');
        expect(userModel).toContain('balance: number & { __num_format: "double" };');
    });

    it("should handle multiple @wiz-format types", () => {
        const protoContent = `
syntax = "proto3";

message Data {
  // @wiz-format uuid
  string id = 1;
  // @wiz-format date-time
  string createdAt = 2;
  // @wiz-format int32
  int32 count = 3;
}
        `;

        const protoFile = parseProtoFile(protoContent);
        const models = generateModelsFromProtobuf(protoFile);
        const dataModel = models.get("Data");

        expect(dataModel).toContain('id: string & { __str_format: "uuid" };');
        expect(dataModel).toContain('createdAt: string & { __str_format: "date-time" };');
        expect(dataModel).toContain('count: number & { __num_format: "int32" };');
    });

    it("should allow disabling wiz tag generation in protobuf", () => {
        const protoContent = `
syntax = "proto3";

message User {
  // @wiz-format email
  string email = 1;
}
        `;

        const protoFile = parseProtoFile(protoContent);
        const models = generateModelsFromProtobuf(protoFile, { disableWizTags: true });
        const userModel = models.get("User");

        expect(userModel).toContain("email: string;");
        expect(userModel).not.toContain("__str_format");
    });

    it("should preserve standard proto types when no wiz format", () => {
        const protoContent = `
syntax = "proto3";

message User {
  // Regular field without wiz format
  int64 id = 1;
  string name = 2;
}
        `;

        const protoFile = parseProtoFile(protoContent);
        const models = generateModelsFromProtobuf(protoFile);
        const userModel = models.get("User");

        expect(userModel).toContain("id: number;");
        expect(userModel).toContain("name: string;");
    });
});
