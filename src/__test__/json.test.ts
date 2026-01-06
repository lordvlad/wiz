import { describe, expect, it } from "bun:test";

import { compile, dedent } from "./util";

describe("JSON serialization/deserialization plugin", () => {
    describe("jsonSerialize", () => {
        it("should serialize simple object types to JSON string", async () => {
            const source = `
                import { jsonSerialize } from '../json/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                export const result = jsonSerialize<User>({ id: 10, username: "test" });
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            expect(module.result).toBe('{"id":10,"username":"test"}');
        });

        it("should serialize nested objects", async () => {
            const source = `
                import { jsonSerialize } from '../json/index';
                
                type User = {
                    id: number;
                    profile: {
                        name: string;
                        age: number;
                    };
                };
                
                export const result = jsonSerialize<User>({
                    id: 1,
                    profile: { name: "Alice", age: 30 }
                });
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            expect(module.result).toBe('{"id":1,"profile":{"name":"Alice","age":30}}');
        });

        it("should serialize arrays", async () => {
            const source = `
                import { jsonSerialize } from '../json/index';
                
                type Data = {
                    tags: string[];
                    scores: number[];
                };
                
                export const result = jsonSerialize<Data>({
                    tags: ["a", "b", "c"],
                    scores: [1, 2, 3]
                });
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            expect(module.result).toBe('{"tags":["a","b","c"],"scores":[1,2,3]}');
        });

        it("should serialize arrays of objects", async () => {
            const source = `
                import { jsonSerialize } from '../json/index';
                
                type User = {
                    users: Array<{ id: number; name: string }>;
                };
                
                export const result = jsonSerialize<User>({
                    users: [
                        { id: 1, name: "Alice" },
                        { id: 2, name: "Bob" }
                    ]
                });
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            expect(module.result).toBe('{"users":[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}]}');
        });

        it("should handle optional properties", async () => {
            const source = `
                import { jsonSerialize } from '../json/index';
                
                type User = {
                    id: number;
                    email?: string;
                };
                
                export const result1 = jsonSerialize<User>({ id: 1 });
                export const result2 = jsonSerialize<User>({ id: 1, email: "test@example.com" });
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            expect(module.result1).toBe('{"id":1}');
            expect(module.result2).toBe('{"id":1,"email":"test@example.com"}');
        });

        it("should handle boolean values", async () => {
            const source = `
                import { jsonSerialize } from '../json/index';
                
                type Config = {
                    enabled: boolean;
                    debug: boolean;
                };
                
                export const result = jsonSerialize<Config>({ enabled: true, debug: false });
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            expect(module.result).toBe('{"enabled":true,"debug":false}');
        });

        it("should throw TypeError when validating incorrect types", async () => {
            const source = `
                import { jsonSerialize } from '../json/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                export function testSerialize() {
                    return jsonSerialize<User>({ id: "wrong", username: 123 } as any);
                }
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            expect(() => module.testSerialize()).toThrow(TypeError);
        });

        it("should serialize to Buffer when buffer argument is provided", async () => {
            const source = `
                import { jsonSerialize } from '../json/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                export function testSerialize() {
                    const buf = Buffer.alloc(1024);
                    jsonSerialize<User>({ id: 10, username: "test" }, buf);
                    return buf.toString("utf-8", 0, 30);
                }
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            const result = module.testSerialize();
            expect(result).toContain('{"id":10,"username":"test"}');
        });
    });

    describe("createJsonSerializer", () => {
        it("should create reusable serializer function", async () => {
            const source = `
                import { createJsonSerializer } from '../json/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                export const serializer = createJsonSerializer<User>();
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            const result1 = module.serializer({ id: 1, username: "alice" });
            const result2 = module.serializer({ id: 2, username: "bob" });

            expect(result1).toBe('{"id":1,"username":"alice"}');
            expect(result2).toBe('{"id":2,"username":"bob"}');
        });

        it("should support both overloads (string and Buffer)", async () => {
            const source = `
                import { createJsonSerializer } from '../json/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                export const serializer = createJsonSerializer<User>();
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            // Test string overload
            const str = module.serializer({ id: 1, username: "test" });
            expect(str).toBe('{"id":1,"username":"test"}');

            // Test buffer overload
            const buf = Buffer.alloc(1024);
            module.serializer({ id: 2, username: "test2" }, buf);
            const bufStr = buf.toString("utf-8", 0, 31);
            expect(bufStr).toContain('{"id":2,"username":"test2"}');
        });
    });

    describe("jsonParse", () => {
        it("should parse and validate JSON string", async () => {
            const source = `
                import { jsonParse } from '../json/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                export const result = jsonParse<User>('{"id":10,"username":"test"}');
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            expect(module.result).toEqual({ id: 10, username: "test" });
        });

        it("should parse and validate nested objects", async () => {
            const source = `
                import { jsonParse } from '../json/index';
                
                type User = {
                    id: number;
                    profile: {
                        name: string;
                        age: number;
                    };
                };
                
                export const result = jsonParse<User>('{"id":1,"profile":{"name":"Alice","age":30}}');
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            expect(module.result).toEqual({
                id: 1,
                profile: { name: "Alice", age: 30 },
            });
        });

        it("should parse and validate arrays", async () => {
            const source = `
                import { jsonParse } from '../json/index';
                
                type Data = {
                    tags: string[];
                    scores: number[];
                };
                
                export const result = jsonParse<Data>('{"tags":["a","b"],"scores":[1,2,3]}');
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            expect(module.result).toEqual({
                tags: ["a", "b"],
                scores: [1, 2, 3],
            });
        });

        it("should throw TypeError for invalid JSON", async () => {
            const source = `
                import { jsonParse } from '../json/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                export function testParse() {
                    return jsonParse<User>('invalid json');
                }
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            expect(() => module.testParse()).toThrow(TypeError);
            expect(() => module.testParse()).toThrow(/Invalid JSON/);
        });

        it("should throw TypeError for JSON with wrong types", async () => {
            const source = `
                import { jsonParse } from '../json/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                export function testParse() {
                    return jsonParse<User>('{"id":"wrong","username":123}');
                }
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            expect(() => module.testParse()).toThrow(TypeError);
            expect(() => module.testParse()).toThrow(/validation failed/);
        });

        it("should parse from Buffer", async () => {
            const source = `
                import { jsonParse } from '../json/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                export function testParse() {
                    const buf = Buffer.from('{"id":10,"username":"test"}', "utf-8");
                    return jsonParse<User>(buf);
                }
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            expect(module.testParse()).toEqual({ id: 10, username: "test" });
        });

        it("should validate missing required fields", async () => {
            const source = `
                import { jsonParse } from '../json/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                export function testParse() {
                    return jsonParse<User>('{"id":10}');
                }
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            expect(() => module.testParse()).toThrow(TypeError);
        });

        it("should allow optional fields to be missing", async () => {
            const source = `
                import { jsonParse } from '../json/index';
                
                type User = {
                    id: number;
                    email?: string;
                };
                
                export const result = jsonParse<User>('{"id":1}');
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            expect(module.result).toEqual({ id: 1 });
        });
    });

    describe("createJsonParser", () => {
        it("should create reusable parser function", async () => {
            const source = `
                import { createJsonParser } from '../json/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                export const parser = createJsonParser<User>();
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            const result1 = module.parser('{"id":1,"username":"alice"}');
            const result2 = module.parser('{"id":2,"username":"bob"}');

            expect(result1).toEqual({ id: 1, username: "alice" });
            expect(result2).toEqual({ id: 2, username: "bob" });
        });

        it("should support both overloads (string and Buffer)", async () => {
            const source = `
                import { createJsonParser } from '../json/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                export const parser = createJsonParser<User>();
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            // Test string overload
            const result1 = module.parser('{"id":1,"username":"test"}');
            expect(result1).toEqual({ id: 1, username: "test" });

            // Test buffer overload
            const buf = Buffer.from('{"id":2,"username":"test2"}', "utf-8");
            const result2 = module.parser(buf);
            expect(result2).toEqual({ id: 2, username: "test2" });
        });
    });

    describe("round-trip serialization", () => {
        it("should serialize and parse back to original value", async () => {
            const source = `
                import { jsonSerialize, jsonParse } from '../json/index';
                
                type User = {
                    id: number;
                    username: string;
                    profile: {
                        name: string;
                        age: number;
                    };
                    tags: string[];
                };
                
                const original = {
                    id: 1,
                    username: "alice",
                    profile: { name: "Alice Smith", age: 30 },
                    tags: ["admin", "user"]
                };
                
                export const serialized = jsonSerialize<User>(original);
                export const parsed = jsonParse<User>(serialized);
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            expect(module.parsed).toEqual({
                id: 1,
                username: "alice",
                profile: { name: "Alice Smith", age: 30 },
                tags: ["admin", "user"],
            });
        });

        it("should work with creator functions", async () => {
            const source = `
                import { createJsonSerializer, createJsonParser } from '../json/index';
                
                type Data = {
                    count: number;
                    items: string[];
                };
                
                const serialize = createJsonSerializer<Data>();
                const parse = createJsonParser<Data>();
                
                const original = { count: 3, items: ["a", "b", "c"] };
                export const result = parse(serialize(original));
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            expect(module.result).toEqual({ count: 3, items: ["a", "b", "c"] });
        });
    });

    describe("union types", () => {
        it("should handle nullable union types", async () => {
            const source = `
                import { jsonSerialize, jsonParse } from '../json/index';
                
                type Data = {
                    value: string | null;
                };
                
                export const result1 = jsonSerialize<Data>({ value: "test" });
                export const result2 = jsonSerialize<Data>({ value: null });
                export const parsed1 = jsonParse<Data>(result1);
                export const parsed2 = jsonParse<Data>(result2);
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            expect(module.result1).toBe('{"value":"test"}');
            expect(module.result2).toBe('{"value":null}');
            expect(module.parsed1).toEqual({ value: "test" });
            expect(module.parsed2).toEqual({ value: null });
        });
    });
});
