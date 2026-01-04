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
        expect(actual).toInclude('name: "name"');
        expect(actual).toInclude('name: "email"');
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

    it("must preserve JSDoc comments on types", async () => {
        const code = `
            import { createProtobufModel } from "../../protobuf/index";
            
            /**
             * User entity representing a system user
             */
            type User = {
                /** User's unique identifier */
                id: number;
                /** User's full name */
                name: string;
            }
            
            export const model = createProtobufModel<[User]>();
        `;

        const actual = await compile(code);

        // Check that comments are preserved in the model
        expect(actual).toInclude("User entity representing a system user");
        expect(actual).toInclude("User's unique identifier");
        expect(actual).toInclude("User's full name");
        // Check that comments are in the model structure
        expect(actual).toInclude("comment:");
    });

    it("must preserve JSDoc tags on types", async () => {
        const code = `
            import { createProtobufModel } from "../../protobuf/index";
            
            /**
             * User type
             * @version 1.0.0
             * @author Test Author
             */
            type User = {
                /**
                 * User ID
                 * @deprecated Use uuid instead
                 */
                id: number;
                name: string;
            }
            
            export const model = createProtobufModel<[User]>();
        `;

        const actual = await compile(code);

        // Check that tags are preserved in the model structure
        expect(actual).toInclude("version");
        expect(actual).toInclude("1.0.0");
        expect(actual).toInclude("author");
        expect(actual).toInclude("deprecated");
        expect(actual).toInclude("tags:");
    });

    it("must prefix custom JSDoc tags with wiz-", async () => {
        const code = `
            import { createProtobufModel } from "../../protobuf/index";
            
            /**
             * User type
             * @customTag customValue
             * @internal This is internal
             */
            type User = {
                /**
                 * User ID
                 * @fieldTag fieldValue
                 */
                id: number;
            }
            
            export const model = createProtobufModel<[User]>();
        `;

        const actual = await compile(code);

        // Check that custom tags are prefixed with "wiz-" in the model
        expect(actual).toInclude("wiz-customTag");
        expect(actual).toInclude("customValue");
        expect(actual).toInclude("wiz-fieldTag");
        expect(actual).toInclude("fieldValue");
        // @internal should be treated as standard JSDoc tag
        expect(actual).toInclude("internal");
    });
});
