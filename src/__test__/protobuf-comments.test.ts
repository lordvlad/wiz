import { describe, expect, it } from "bun:test";

import { protobufModelToString } from "../plugin/protobuf/codegen";

describe("protobufModelToString with JSDoc comments", () => {
    it("should include message-level comments", () => {
        const model = {
            syntax: "proto3",
            package: "test.api",
            messages: {
                User: {
                    name: "User",
                    comment: {
                        description: "User entity representing a system user",
                        tags: [],
                    },
                    fields: [
                        {
                            name: "id",
                            type: "int32",
                            number: 1,
                        },
                    ],
                },
            },
        };

        const protoString = protobufModelToString(model);

        expect(protoString).toContain("// User entity representing a system user");
        expect(protoString).toContain("message User");
    });

    it("should include field-level comments", () => {
        const model = {
            syntax: "proto3",
            package: "test.api",
            messages: {
                User: {
                    name: "User",
                    fields: [
                        {
                            name: "id",
                            type: "int32",
                            number: 1,
                            comment: {
                                description: "User's unique identifier",
                                tags: [],
                            },
                        },
                    ],
                },
            },
        };

        const protoString = protobufModelToString(model);

        expect(protoString).toContain("// User's unique identifier");
        expect(protoString).toContain("int32 id = 1");
    });

    it("should include JSDoc tags in comments", () => {
        const model = {
            syntax: "proto3",
            package: "test.api",
            messages: {
                User: {
                    name: "User",
                    comment: {
                        description: "User type",
                        tags: [
                            { name: "version", value: "1.0.0" },
                            { name: "author", value: "Test Author" },
                        ],
                    },
                    fields: [
                        {
                            name: "id",
                            type: "int32",
                            number: 1,
                            comment: {
                                description: "User ID",
                                tags: [{ name: "deprecated", value: "Use uuid instead" }],
                            },
                        },
                    ],
                },
            },
        };

        const protoString = protobufModelToString(model);

        expect(protoString).toContain("// User type");
        expect(protoString).toContain("// @version 1.0.0");
        expect(protoString).toContain("// @author Test Author");
        expect(protoString).toContain("// User ID");
        expect(protoString).toContain("// @deprecated Use uuid instead");
    });

    it("should prefix custom tags with wiz-", () => {
        const model = {
            syntax: "proto3",
            package: "test.api",
            messages: {
                User: {
                    name: "User",
                    comment: {
                        description: "User type",
                        tags: [{ name: "wiz-customTag", value: "customValue" }],
                    },
                    fields: [
                        {
                            name: "id",
                            type: "int32",
                            number: 1,
                        },
                    ],
                },
            },
        };

        const protoString = protobufModelToString(model);

        expect(protoString).toContain("// @wiz-customTag customValue");
    });

    it("should handle multi-line descriptions", () => {
        const model = {
            syntax: "proto3",
            package: "test.api",
            messages: {
                User: {
                    name: "User",
                    comment: {
                        description: "User entity\nrepresenting a system user",
                        tags: [],
                    },
                    fields: [
                        {
                            name: "id",
                            type: "int32",
                            number: 1,
                        },
                    ],
                },
            },
        };

        const protoString = protobufModelToString(model);

        expect(protoString).toContain("// User entity");
        expect(protoString).toContain("// representing a system user");
    });
});
