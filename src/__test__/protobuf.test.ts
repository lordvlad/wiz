import { describe, expect, it } from "bun:test";

import { compile, dedent } from "./util";

describe("createProtobufModel function", () => {
    it("must create protobuf model with single type", async () => {
        const code = `
            import { createProtobufModel } from "../../protobuf/index";
            
            type User = {
                id: number;
                name: string;
                email: string;
            }
            
            export const model = createProtobufModel<[User]>();
        `;

        const actual = await compile(code);

        // Check that it includes syntax
        expect(actual).toInclude('syntax: "proto3"');

        // Check that it includes package
        expect(actual).toInclude("package:");

        // Check that it includes messages
        expect(actual).toInclude("messages:");
        expect(actual).toInclude("User:");

        // Check fields
        expect(actual).toInclude("name:");
        expect(actual).toInclude("email:");
        expect(actual).toInclude("fields:");
    });

    it("must create protobuf model with multiple types", async () => {
        const code = `
            import { createProtobufModel } from "../../protobuf/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            type Post = {
                id: number;
                title: string;
                authorId: number;
            }
            
            export const model = createProtobufModel<[User, Post]>();
        `;

        const actual = await compile(code);

        expect(actual).toInclude("User:");
        expect(actual).toInclude("Post:");
        expect(actual).toInclude("authorId");
    });

    it("must handle primitive types", async () => {
        const code = `
            import { createProtobufModel } from "../../protobuf/index";
            
            type Data = {
                text: string;
                count: number;
                active: boolean;
            }
            
            export const model = createProtobufModel<[Data]>();
        `;

        const actual = await compile(code);

        expect(actual).toInclude("text");
        expect(actual).toInclude("count");
        expect(actual).toInclude("active");
        expect(actual).toInclude('type: "string"');
        expect(actual).toInclude('type: "int32"');
        expect(actual).toInclude('type: "bool"');
    });

    it("must handle optional fields", async () => {
        const code = `
            import { createProtobufModel } from "../../protobuf/index";
            
            type User = {
                id: number;
                name: string;
                email?: string;
            }
            
            export const model = createProtobufModel<[User]>();
        `;

        const actual = await compile(code);

        // Check that email field is marked as optional
        expect(actual).toInclude("email");
        expect(actual).toInclude("optional: true");
    });

    it("must handle repeated fields (arrays)", async () => {
        const code = `
            import { createProtobufModel } from "../../protobuf/index";
            
            type Post = {
                id: number;
                tags: string[];
            }
            
            export const model = createProtobufModel<[Post]>();
        `;

        const actual = await compile(code);

        expect(actual).toInclude("tags");
        expect(actual).toInclude("repeated: true");
    });

    it("must handle nested types", async () => {
        const code = `
            import { createProtobufModel } from "../../protobuf/index";
            
            type Address = {
                street: string;
                city: string;
            }
            
            type User = {
                id: number;
                name: string;
                address: Address;
            }
            
            export const model = createProtobufModel<[User, Address]>();
        `;

        const actual = await compile(code);

        expect(actual).toInclude("User:");
        expect(actual).toInclude("Address:");
        expect(actual).toInclude("address");
        expect(actual).toInclude('type: "Address"');
    });
});
