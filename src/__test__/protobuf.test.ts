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

    it("must preserve JSDoc tags verbatim without prefix", async () => {
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

        // Check that all tags are preserved as-is without prefix
        expect(actual).toInclude("customTag");
        expect(actual).toInclude("customValue");
        expect(actual).toInclude("fieldTag");
        expect(actual).toInclude("fieldValue");
        expect(actual).toInclude("internal");
    });

    it("must add wiz-format tag for wiz tagging interfaces", async () => {
        const code = `
            import { createProtobufModel } from "../../protobuf/index";
            import { StrFormat } from "../../tags/index";
            
            type User = {
                /** User's email address */
                email: StrFormat<"email">;
                
                /** User's UUID */
                id: StrFormat<"uuid">;
            }
            
            export const model = createProtobufModel<[User]>();
        `;

        const actual = await compile(code);

        // Check that wiz-format tags are added for StrFormat types
        expect(actual).toInclude("wiz-format");
        expect(actual).toInclude("email");
        expect(actual).toInclude("uuid");
    });

    it("must reject unsupported global type HTMLElement", async () => {
        const code = `
            import { createProtobufModel } from "../../protobuf/index";
            
            type Type = {
                element: HTMLElement;
            }
            
            export const model = createProtobufModel<[Type]>();
        `;

        await expect(compile(code)).rejects.toThrow(/Unsupported global type.*HTMLElement/);
    });

    it("must reject unsupported global type CryptoKey", async () => {
        const code = `
            import { createProtobufModel } from "../../protobuf/index";
            
            type Type = {
                key: CryptoKey;
            }
            
            export const model = createProtobufModel<[Type]>();
        `;

        await expect(compile(code)).rejects.toThrow(/Unsupported global type.*CryptoKey/);
    });

    it("must reject unsupported global type Blob", async () => {
        const code = `
            import { createProtobufModel } from "../../protobuf/index";
            
            type Type = {
                data: Blob;
            }
            
            export const model = createProtobufModel<[Type]>();
        `;

        await expect(compile(code)).rejects.toThrow(/Unsupported global type.*Blob/);
    });

    it("must reject unsupported global type in nested object", async () => {
        const code = `
            import { createProtobufModel } from "../../protobuf/index";
            
            type Type = {
                data: {
                    element: HTMLDivElement;
                };
            }
            
            export const model = createProtobufModel<[Type]>();
        `;

        await expect(compile(code)).rejects.toThrow(/Unsupported global type.*HTMLDivElement/);
    });

    it("must reject unsupported global type in array", async () => {
        const code = `
            import { createProtobufModel } from "../../protobuf/index";
            
            type Type = {
                elements: HTMLElement[];
            }
            
            export const model = createProtobufModel<[Type]>();
        `;

        await expect(compile(code)).rejects.toThrow(/Unsupported global type.*HTMLElement/);
    });
});
