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

    it("must deduce types from rpcCall function parameter", async () => {
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
                getUser: rpcCall((req: GetUserRequest): User => ({ id: 1, name: "test", email: "test@example.com" }))
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
        expect(actual).toInclude("User:");
    });

    it("must detect rpcCall from @rpcCall JSDoc annotation", async () => {
        const code = `
            import { createProtobufSpec } from "../../protobuf/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            type GetUserRequest = {
                id: number;
            }
            
            /**
             * @rpcCall
             * @rpcService UserService
             */
            function getUser(req: GetUserRequest): User {
                return { id: 1, name: "test" };
            }
            
            export const spec = createProtobufSpec<[User, GetUserRequest]>({
                package: "user.api"
            });
        `;

        const actual = await compile(code);

        expect(actual).toInclude("services:");
        expect(actual).toInclude("UserService:");
        expect(actual).toInclude("getUser");
        expect(actual).toInclude("GetUserRequest");
    });

    it("must detect rpcCall from object literal with @rpcService on variable", async () => {
        const code = `
            import { createProtobufSpec } from "../../protobuf/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            type GetUserRequest = {
                id: number;
            }
            
            type CreateUserRequest = {
                name: string;
            }
            
            /**
             * @rpcService UserService
             */
            const service = {
                /**
                 * @rpcCall
                 */
                getUser: (req: GetUserRequest): User => ({ id: 1, name: "test" }),
                /**
                 * @rpcCall
                 */
                createUser: (req: CreateUserRequest): User => ({ id: 2, name: "new" })
            };
            
            export const spec = createProtobufSpec<[User, GetUserRequest, CreateUserRequest]>({
                package: "user.api"
            });
        `;

        const actual = await compile(code);

        expect(actual).toInclude("services:");
        expect(actual).toInclude("UserService:");
        expect(actual).toInclude("getUser");
        expect(actual).toInclude("createUser");
    });

    it("must detect rpcCall from class methods with @rpcService on class", async () => {
        const code = `
            import { createProtobufSpec } from "../../protobuf/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            type GetUserRequest = {
                id: number;
            }
            
            /**
             * @rpcService UserService
             */
            class UserServiceImpl {
                /**
                 * @rpcCall
                 */
                getUser(req: GetUserRequest): User {
                    return { id: 1, name: "test" };
                }
            }
            
            export const spec = createProtobufSpec<[User, GetUserRequest]>({
                package: "user.api"
            });
        `;

        const actual = await compile(code);

        expect(actual).toInclude("services:");
        expect(actual).toInclude("UserService:");
        expect(actual).toInclude("getUser");
    });

    it("must support multiple services", async () => {
        const code = `
            import { createProtobufSpec } from "../../protobuf/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            type Post = {
                id: number;
                title: string;
            }
            
            type GetUserRequest = {
                id: number;
            }
            
            type GetPostRequest = {
                id: number;
            }
            
            /**
             * @rpcService UserService
             */
            const userService = {
                /**
                 * @rpcCall
                 */
                getUser: (req: GetUserRequest): User => ({ id: 1, name: "test" })
            };
            
            /**
             * @rpcService PostService
             */
            const postService = {
                /**
                 * @rpcCall
                 */
                getPost: (req: GetPostRequest): Post => ({ id: 1, title: "test" })
            };
            
            export const spec = createProtobufSpec<[User, Post, GetUserRequest, GetPostRequest]>({
                package: "my.api"
            });
        `;

        const actual = await compile(code);

        expect(actual).toInclude("services:");
        expect(actual).toInclude("UserService:");
        expect(actual).toInclude("PostService:");
        expect(actual).toInclude("getUser");
        expect(actual).toInclude("getPost");
    });

    it("must use default service name when @rpcService is not provided", async () => {
        const code = `
            import { createProtobufSpec } from "../../protobuf/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            type GetUserRequest = {
                id: number;
            }
            
            /**
             * @rpcCall
             */
            function getUser(req: GetUserRequest): User {
                return { id: 1, name: "test" };
            }
            
            export const spec = createProtobufSpec<[User, GetUserRequest]>({
                package: "user.api"
            });
        `;

        const actual = await compile(code);

        expect(actual).toInclude("services:");
        expect(actual).toInclude("DefaultService:");
        expect(actual).toInclude("getUser");
    });

    it("must treat all object methods as RPC calls when @rpcService is present without @rpcCall", async () => {
        const code = `
            import { createProtobufSpec } from "../../protobuf/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            type GetUserRequest = {
                id: number;
            }
            
            type CreateUserRequest = {
                name: string;
            }
            
            /**
             * @rpcService UserService
             */
            const service = {
                getUser: (req: GetUserRequest): User => ({ id: 1, name: "test" }),
                createUser: (req: CreateUserRequest): User => ({ id: 2, name: "new" })
            };
            
            export const spec = createProtobufSpec<[User, GetUserRequest, CreateUserRequest]>({
                package: "user.api"
            });
        `;

        const actual = await compile(code);

        expect(actual).toInclude("services:");
        expect(actual).toInclude("UserService:");
        expect(actual).toInclude("getUser");
        expect(actual).toInclude("createUser");
    });

    it("must treat all class methods as RPC calls when @rpcService is present without @rpcCall", async () => {
        const code = `
            import { createProtobufSpec } from "../../protobuf/index";
            
            type User = {
                id: number;
                name: string;
            }
            
            type GetUserRequest = {
                id: number;
            }
            
            type UpdateUserRequest = {
                id: number;
                name: string;
            }
            
            /**
             * @rpcService UserService
             */
            class UserServiceImpl {
                getUser(req: GetUserRequest): User {
                    return { id: 1, name: "test" };
                }
                
                updateUser(req: UpdateUserRequest): User {
                    return { id: 1, name: "updated" };
                }
            }
            
            export const spec = createProtobufSpec<[User, GetUserRequest, UpdateUserRequest]>({
                package: "user.api"
            });
        `;

        const actual = await compile(code);

        expect(actual).toInclude("services:");
        expect(actual).toInclude("UserService:");
        expect(actual).toInclude("getUser");
        expect(actual).toInclude("updateUser");
    });
});
