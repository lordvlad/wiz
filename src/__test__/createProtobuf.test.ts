import { describe, expect, it } from "bun:test";

import { compile, dedent } from "./util";

describe("createProtobufSpec function", () => {
    it("must create protobuf spec without services", async () => {
        const code = `
            import { createProtobufSpec } from "../../protobuf/index";
            
            type User = {
                id: number;
                name: string;
                email: string;
            }
            
            export const spec = createProtobufSpec<[User]>({
                package: "user.api"
            });
        `;

        const actual = await compile(code);

        expect(actual).toInclude('syntax: "proto3"');
        expect(actual).toInclude('package: "user.api"');
        expect(actual).toInclude("messages:");
        expect(actual).toInclude("User:");
    });

    it("must create protobuf spec with RPC service", async () => {
        const code = `
            import { createProtobufSpec, rpcCall } from "../../protobuf/index";
            
            type User = {
                id: number;
                name: string;
                email: string;
            }
            
            type GetUserRequest = {
                id: number;
            }
            
            const service = {
                getUser: rpcCall<GetUserRequest, User>(() => null)
            };
            
            export const spec = createProtobufSpec<[User, GetUserRequest]>({
                package: "user.api",
                serviceName: "UserService"
            });
        `;

        const actual = await compile(code);

        expect(actual).toInclude("services:");
        expect(actual).toInclude("UserService:");
        expect(actual).toInclude("getUser");
        expect(actual).toInclude("GetUserRequest");
    });

    it("must handle multiple RPC methods", async () => {
        const code = `
            import { createProtobufSpec, rpcCall } from "../../protobuf/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            type CreateUserRequest = {
                name: string;
            }
            
            type GetUserRequest = {
                id: number;
            }
            
            const service = {
                getUser: rpcCall<GetUserRequest, User>(() => null),
                createUser: rpcCall<CreateUserRequest, User>(() => null)
            };
            
            export const spec = createProtobufSpec<[User, GetUserRequest, CreateUserRequest]>({
                package: "user.api",
                serviceName: "UserService"
            });
        `;

        const actual = await compile(code);

        expect(actual).toInclude("getUser");
        expect(actual).toInclude("createUser");
        expect(actual).toInclude("UserService");
    });

    it("must handle empty services when no rpcCall is used", async () => {
        const code = `
            import { createProtobufSpec } from "../../protobuf/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            export const spec = createProtobufSpec<[User]>({
                package: "user.api",
                serviceName: "UserService"
            });
        `;

        const actual = await compile(code);

        // Should not include services if no rpcCall methods are found
        expect(actual).toInclude("User:");
        expect(actual).toInclude('package: "user.api"');
    });
});
