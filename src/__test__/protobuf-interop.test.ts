import { describe, expect, it } from "bun:test";
import protobuf from "protobufjs";

import { compile } from "./util";

/**
 * Tests that compare wiz protobuf serialization with protobufjs library
 * Testing both directions and round-trips from both starting points
 */
describe("Protobuf interoperability with protobufjs", () => {
    describe("Simple object serialization", () => {
        it("should produce same output as protobufjs for simple types", async () => {
            // Define protobuf schema
            const root = protobuf.Root.fromJSON({
                nested: {
                    User: {
                        fields: {
                            id: { type: "uint32", id: 1 },
                            username: { type: "string", id: 2 },
                        },
                    },
                },
            });

            const UserMessage = root.lookupType("User");

            // Create test data
            const userData = { id: 10, username: "test" };

            // Serialize with protobufjs
            const protobufJsBytes = UserMessage.encode(userData).finish();

            // Serialize with wiz
            const source = `
                import { protobufSerialize } from '../protobuf/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                export const result = protobufSerialize<User>({ id: 10, username: "test" });
            `;

            await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);
            const wizBytes = module.result;

            // Compare outputs
            expect(wizBytes).toBeInstanceOf(Uint8Array);
            expect(protobufJsBytes).toBeInstanceOf(Uint8Array);
            expect(wizBytes).toEqual(protobufJsBytes);
        });

        it("should parse protobufjs output correctly (wiz parser with protobufjs serializer)", async () => {
            // Define protobuf schema
            const root = protobuf.Root.fromJSON({
                nested: {
                    User: {
                        fields: {
                            id: { type: "uint32", id: 1 },
                            username: { type: "string", id: 2 },
                        },
                    },
                },
            });

            const UserMessage = root.lookupType("User");

            // Create test data
            const userData = { id: 10, username: "test" };

            // Serialize with protobufjs
            const protobufJsBytes = UserMessage.encode(userData).finish();

            // Parse with wiz
            const source = `
                import { protobufParse } from '../protobuf/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                export const bytes = new Uint8Array([${Array.from(protobufJsBytes).join(",")}]);
                export const result = protobufParse<User>(bytes);
            `;

            await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            expect(module.result).toEqual(userData);
        });

        it("should allow protobufjs to parse wiz output (protobufjs parser with wiz serializer)", async () => {
            // Define protobuf schema
            const root = protobuf.Root.fromJSON({
                nested: {
                    User: {
                        fields: {
                            id: { type: "uint32", id: 1 },
                            username: { type: "string", id: 2 },
                        },
                    },
                },
            });

            const UserMessage = root.lookupType("User");

            // Serialize with wiz
            const source = `
                import { protobufSerialize } from '../protobuf/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                export const result = protobufSerialize<User>({ id: 10, username: "test" });
            `;

            await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);
            const wizBytes = module.result;

            // Parse with protobufjs
            const decoded = UserMessage.decode(wizBytes);
            const parsedData = UserMessage.toObject(decoded);

            expect(parsedData).toEqual({ id: 10, username: "test" });
        });
    });

    describe("Round-trip tests", () => {
        it("should round-trip through wiz -> protobufjs -> wiz", async () => {
            // Define protobuf schema
            const root = protobuf.Root.fromJSON({
                nested: {
                    User: {
                        fields: {
                            id: { type: "uint32", id: 1 },
                            username: { type: "string", id: 2 },
                        },
                    },
                },
            });

            const UserMessage = root.lookupType("User");
            const originalData = { id: 42, username: "alice" };

            // Step 1: Serialize with wiz
            const source1 = `
                import { protobufSerialize } from '../protobuf/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                export const result = protobufSerialize<User>({ id: 42, username: "alice" });
            `;

            await compile(source1);
            const module1 = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);
            const wizBytes = module1.result;

            // Step 2: Parse with protobufjs
            const decoded = UserMessage.decode(wizBytes);
            const protobufJsData = UserMessage.toObject(decoded);

            expect(protobufJsData).toEqual(originalData);

            // Step 3: Re-serialize with protobufjs
            const protobufJsBytes = UserMessage.encode(protobufJsData).finish();

            // Step 4: Parse with wiz
            const source2 = `
                import { protobufParse } from '../protobuf/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                export const bytes = new Uint8Array([${Array.from(protobufJsBytes).join(",")}]);
                export const result = protobufParse<User>(bytes);
            `;

            await compile(source2);
            const module2 = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            expect(module2.result).toEqual(originalData);
        });

        it("should round-trip through protobufjs -> wiz -> protobufjs", async () => {
            // Define protobuf schema
            const root = protobuf.Root.fromJSON({
                nested: {
                    User: {
                        fields: {
                            id: { type: "uint32", id: 1 },
                            username: { type: "string", id: 2 },
                        },
                    },
                },
            });

            const UserMessage = root.lookupType("User");
            const originalData = { id: 99, username: "bob" };

            // Step 1: Serialize with protobufjs
            const protobufJsBytes1 = UserMessage.encode(originalData).finish();

            // Step 2: Parse with wiz
            const source1 = `
                import { protobufParse } from '../protobuf/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                export const bytes = new Uint8Array([${Array.from(protobufJsBytes1).join(",")}]);
                export const result = protobufParse<User>(bytes);
            `;

            await compile(source1);
            const module1 = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);
            const wizData = module1.result;

            expect(wizData).toEqual(originalData);

            // Step 3: Re-serialize with wiz
            const source2 = `
                import { protobufSerialize } from '../protobuf/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                export const result = protobufSerialize<User>({ id: ${wizData.id}, username: "${wizData.username}" });
            `;

            await compile(source2);
            const module2 = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);
            const wizBytes = module2.result;

            // Step 4: Parse with protobufjs
            const decoded = UserMessage.decode(wizBytes);
            const protobufJsData = UserMessage.toObject(decoded);

            expect(protobufJsData).toEqual(originalData);
        });
    });

    describe("Complex types", () => {
        it("should serialize nested objects compatibly with protobufjs", async () => {
            // Define protobuf schema
            const root = protobuf.Root.fromJSON({
                nested: {
                    Profile: {
                        fields: {
                            name: { type: "string", id: 1 },
                            age: { type: "uint32", id: 2 },
                        },
                    },
                    User: {
                        fields: {
                            id: { type: "uint32", id: 1 },
                            profile: { type: "Profile", id: 2 },
                        },
                    },
                },
            });

            const UserMessage = root.lookupType("User");

            const userData = {
                id: 1,
                profile: { name: "Alice", age: 30 },
            };

            // Serialize with protobufjs
            const protobufJsBytes = UserMessage.encode(userData).finish();

            // Serialize with wiz
            const source = `
                import { protobufSerialize } from '../protobuf/index';
                
                type User = {
                    id: number;
                    profile: {
                        name: string;
                        age: number;
                    };
                };
                
                export const result = protobufSerialize<User>({
                    id: 1,
                    profile: { name: "Alice", age: 30 }
                });
            `;

            await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);
            const wizBytes = module.result;

            expect(wizBytes).toEqual(protobufJsBytes);
        });

        it("should serialize arrays (repeated fields) compatibly with protobufjs", async () => {
            // Define protobuf schema
            const root = protobuf.Root.fromJSON({
                nested: {
                    Data: {
                        fields: {
                            tags: { type: "string", id: 1, rule: "repeated" },
                            scores: { type: "uint32", id: 2, rule: "repeated" },
                        },
                    },
                },
            });

            const DataMessage = root.lookupType("Data");

            const data = {
                tags: ["a", "b", "c"],
                scores: [1, 2, 3],
            };

            // Serialize with protobufjs
            const protobufJsBytes = DataMessage.encode(data).finish();

            // Serialize with wiz
            const source = `
                import { protobufSerialize } from '../protobuf/index';
                
                type Data = {
                    tags: string[];
                    scores: number[];
                };
                
                export const result = protobufSerialize<Data>({
                    tags: ["a", "b", "c"],
                    scores: [1, 2, 3]
                });
            `;

            await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);
            const wizBytes = module.result;

            expect(wizBytes).toEqual(protobufJsBytes);
        });

        it("should handle optional fields compatibly with protobufjs", async () => {
            // Define protobuf schema
            const root = protobuf.Root.fromJSON({
                nested: {
                    User: {
                        fields: {
                            id: { type: "uint32", id: 1 },
                            email: { type: "string", id: 2, rule: "optional" },
                        },
                    },
                },
            });

            const UserMessage = root.lookupType("User");

            const dataWithOptional = { id: 1, email: "test@example.com" };
            const dataWithoutOptional = { id: 1 };

            // Test with optional field present
            const protobufJsBytes1 = UserMessage.encode(dataWithOptional).finish();

            const source1 = `
                import { protobufSerialize } from '../protobuf/index';
                
                type User = {
                    id: number;
                    email?: string;
                };
                
                export const result = protobufSerialize<User>({ id: 1, email: "test@example.com" });
            `;

            await compile(source1);
            const module1 = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);
            const wizBytes1 = module1.result;

            expect(wizBytes1).toEqual(protobufJsBytes1);

            // Test with optional field absent
            const protobufJsBytes2 = UserMessage.encode(dataWithoutOptional).finish();

            const source2 = `
                import { protobufSerialize } from '../protobuf/index';
                
                type User = {
                    id: number;
                    email?: string;
                };
                
                export const result = protobufSerialize<User>({ id: 1 });
            `;

            await compile(source2);
            const module2 = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);
            const wizBytes2 = module2.result;

            expect(wizBytes2).toEqual(protobufJsBytes2);
        });
    });

    describe("Boolean values", () => {
        it("should serialize boolean values compatibly with protobufjs", async () => {
            // Define protobuf schema
            const root = protobuf.Root.fromJSON({
                nested: {
                    Config: {
                        fields: {
                            enabled: { type: "bool", id: 1 },
                            debug: { type: "bool", id: 2 },
                        },
                    },
                },
            });

            const ConfigMessage = root.lookupType("Config");

            const configData = { enabled: true, debug: false };

            // Serialize with protobufjs
            const protobufJsBytes = ConfigMessage.encode(configData).finish();

            // Serialize with wiz
            const source = `
                import { protobufSerialize } from '../protobuf/index';
                
                type Config = {
                    enabled: boolean;
                    debug: boolean;
                };
                
                export const result = protobufSerialize<Config>({ enabled: true, debug: false });
            `;

            await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);
            const wizBytes = module.result;

            expect(wizBytes).toEqual(protobufJsBytes);
        });
    });

    describe("Cross-parsing validation", () => {
        it("should allow protobufjs to parse wiz serialized nested objects", async () => {
            const root = protobuf.Root.fromJSON({
                nested: {
                    Profile: {
                        fields: {
                            name: { type: "string", id: 1 },
                            age: { type: "uint32", id: 2 },
                        },
                    },
                    User: {
                        fields: {
                            id: { type: "uint32", id: 1 },
                            profile: { type: "Profile", id: 2 },
                        },
                    },
                },
            });

            const UserMessage = root.lookupType("User");

            const source = `
                import { protobufSerialize } from '../protobuf/index';
                
                type User = {
                    id: number;
                    profile: {
                        name: string;
                        age: number;
                    };
                };
                
                export const result = protobufSerialize<User>({
                    id: 1,
                    profile: { name: "Alice", age: 30 }
                });
            `;

            await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);
            const wizBytes = module.result;

            const decoded = UserMessage.decode(wizBytes);
            const parsedData = UserMessage.toObject(decoded);

            expect(parsedData).toEqual({
                id: 1,
                profile: { name: "Alice", age: 30 },
            });
        });

        it("should allow wiz to parse protobufjs serialized arrays", async () => {
            const root = protobuf.Root.fromJSON({
                nested: {
                    Data: {
                        fields: {
                            tags: { type: "string", id: 1, rule: "repeated" },
                            scores: { type: "uint32", id: 2, rule: "repeated" },
                        },
                    },
                },
            });

            const DataMessage = root.lookupType("Data");

            const data = {
                tags: ["a", "b"],
                scores: [1, 2, 3],
            };

            const protobufJsBytes = DataMessage.encode(data).finish();

            const source = `
                import { protobufParse } from '../protobuf/index';
                
                type Data = {
                    tags: string[];
                    scores: number[];
                };
                
                export const bytes = new Uint8Array([${Array.from(protobufJsBytes).join(",")}]);
                export const result = protobufParse<Data>(bytes);
            `;

            await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            expect(module.result).toEqual(data);
        });
    });
});
