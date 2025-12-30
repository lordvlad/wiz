import { describe, expect, it } from "bun:test";

import { compile, dedent } from "./util";

describe("validator plugin", () => {
    describe("createValidator", () => {
        it("should validate simple object types", async () => {
            const source = `
                import { createValidator } from '../validator/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                export const validator = createValidator<User>();
            `;

            const output = await compile(source);

            // Should contain validator function
            expect(output).toContain("function(value)");
            expect(output).toContain("errors");

            // Test the actual validator by importing from file
            const module = await import(`${import.meta.dir}/.tmp/out/src.js`);
            const validator = module.validator;

            // Valid object
            const validResult = validator({ id: 10, username: "foobar" });
            expect(validResult).toEqual([]);

            // Invalid object - wrong types
            const invalidResult = validator({ id: "foo", username: 123 });
            expect(invalidResult.length).toBeGreaterThan(0);
            expect(invalidResult[0].path).toBe("id");
            expect(invalidResult[0].expected.type).toContain("number");
        });

        it("should validate nested object types", async () => {
            const source = `
                import { createValidator } from '../validator/index';
                
                type User = {
                    id: number;
                    username: string;
                    posts: {
                        title: string;
                        id: number;
                    }[];
                };
                
                export const validator = createValidator<User>();
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);
            const validator = module.validator;

            // Valid object
            const validResult = validator({
                id: 10,
                username: "foobar",
                posts: [{ title: "Hello", id: 1 }],
            });
            expect(validResult).toEqual([]);

            // Invalid - wrong type in nested array
            const invalidResult = validator({
                id: 10,
                username: "foobar",
                posts: [{ title: 10, id: 1 }],
            });
            expect(invalidResult.length).toBeGreaterThan(0);
            expect(invalidResult[0].path).toContain("posts");
            expect(invalidResult[0].path).toContain("title");
        });

        it("should handle missing required fields", async () => {
            const source = `
                import { createValidator } from '../validator/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                export const validator = createValidator<User>();
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);
            const validator = module.validator as (value: any) => any[];

            // Missing username
            const result = validator({ id: 10 });
            expect(result.length).toBeGreaterThan(0);
            const usernameError = result.find((e) => e.path === "username");
            expect(usernameError).toBeDefined();
            expect(usernameError?.actual.type).toBe("undefined");
        });

        it("should validate primitive types", async () => {
            const source = `
                import { createValidator } from '../validator/index';
                
                type Config = {
                    name: string;
                    count: number;
                    enabled: boolean;
                };
                
                export const validator = createValidator<Config>();
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);
            const validator = module.validator;

            // Valid
            const validResult = validator({ name: "test", count: 42, enabled: true });
            expect(validResult).toEqual([]);

            // Invalid types
            const invalidResult = validator({ name: 123, count: "bad", enabled: "yes" });
            expect(invalidResult.length).toBe(3);
        });

        it("should validate array types", async () => {
            const source = `
                import { createValidator } from '../validator/index';
                
                type Data = {
                    tags: string[];
                    scores: number[];
                };
                
                export const validator = createValidator<Data>();
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);
            const validator = module.validator;

            // Valid
            const validResult = validator({ tags: ["a", "b"], scores: [1, 2, 3] });
            expect(validResult).toEqual([]);

            // Invalid - wrong element types
            const invalidResult = validator({ tags: [1, 2], scores: ["a", "b"] });
            expect(invalidResult.length).toBeGreaterThan(0);
        });
    });

    describe("jsdoc tags", () => {
        it("should enforce numeric and string constraints from jsdoc", async () => {
            const source = `
                import { createValidator } from '../validator/index';

                type Payload = {
                    /**
                     * @minimum 1
                     * @maximum 10
                     */
                    count: number;
                    /**
                     * @minLength 3
                     * @maxLength 5
                     * @pattern ^[a-z]+$
                     */
                    name: string;
                };

                export const validator = createValidator<Payload>();
            `;

            await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);
            const validator = module.validator as (value: unknown) => any[];

            expect(validator({ count: 5, name: "abc" })).toEqual([]);

            const errors = validator({ count: 0, name: "A" });
            expect(errors.some((e) => e.path === "count")).toBe(true);
            expect(errors.some((e) => e.path === "name")).toBe(true);
        });

        it("should validate @format email from jsdoc", async () => {
            const source = `
                import { createValidator } from '../validator/index';

                type Payload = {
                    /**
                     * @format email
                     */
                    email: string;
                };

                export const validator = createValidator<Payload>();
            `;

            await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);
            const validator = module.validator as (value: unknown) => any[];

            expect(validator({ email: "user@example.com" })).toEqual([]);
            expect(validator({ email: "not-an-email" }).some((e) => e.path === "email")).toBe(true);
        });

        it("should validate other supported formats from jsdoc", async () => {
            const source = `
                import { createValidator } from '../validator/index';

                type Payload = {
                    /** @format ipv4 */
                    ip: string;
                    /** @format hostname */
                    host: string;
                    /** @format uri */
                    link: string;
                    /** @format uuid */
                    uid: string;
                    /** @format date */
                    birthday: string;
                    /** @format byte */
                    data: string;
                    /** @format regex */
                    pattern: string;
                    /** @format json-pointer */
                    pointer: string;
                    /** @format relative-json-pointer */
                    relPointer: string;
                    /** @format uri-template */
                    template: string;
                };

                export const validator = createValidator<Payload>();
            `;

            await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);
            const validator = module.validator as (value: unknown) => any[];

            expect(
                validator({
                    ip: "192.168.0.1",
                    host: "example.com",
                    link: "https://example.com",
                    uid: "123e4567-e89b-12d3-a456-426614174000",
                    birthday: "2020-01-01",
                    data: "Zm9v",
                    pattern: "^[a-z]+$",
                    pointer: "/foo/bar",
                    relPointer: "1/foo",
                    template: "/users/{id}",
                }),
            ).toEqual([]);

            const errors = validator({
                ip: "999.0.0.1",
                host: "bad_host!",
                link: "not a uri",
                uid: "bad",
                birthday: "20-01-01",
                data: "not base64!",
                pattern: "[",
                pointer: "not/pointer",
                relPointer: "abc",
                template: "has space",
            });

            expect(errors.some((e) => e.path === "ip")).toBe(true);
            expect(errors.some((e) => e.path === "host")).toBe(true);
            expect(errors.some((e) => e.path === "link")).toBe(true);
            expect(errors.some((e) => e.path === "uid")).toBe(true);
            expect(errors.some((e) => e.path === "birthday")).toBe(true);
            expect(errors.some((e) => e.path === "data")).toBe(true);
            expect(errors.some((e) => e.path === "pattern")).toBe(true);
            expect(errors.some((e) => e.path === "pointer")).toBe(true);
            expect(errors.some((e) => e.path === "relPointer")).toBe(true);
            expect(errors.some((e) => e.path === "template")).toBe(true);
        });
    });

    describe("validate", () => {
        it("should validate inline with value", async () => {
            const source = `
                import { validate } from '../validator/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                export const result = validate<User>({ id: 10, username: "test" });
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            expect(module.result).toEqual([]);
        });

        it("should return errors for invalid values", async () => {
            const source = `
                import { validate } from '../validator/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                export const result = validate<User>({ id: "bad", username: 123 });
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            expect(module.result.length).toBeGreaterThan(0);
        });
    });

    describe("createIs", () => {
        it("should create type guard function", async () => {
            const source = `
                import { createIs } from '../validator/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                export const isUser = createIs<User>();
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);
            const isUser = module.isUser;

            expect(isUser({ id: 10, username: "test" })).toBe(true);
            expect(isUser({ id: "bad", username: "test" })).toBe(false);
            expect(isUser(null)).toBe(false);
            expect(isUser(undefined)).toBe(false);
        });
    });

    describe("is", () => {
        it("should check type inline and return boolean", async () => {
            const source = `
                import { is } from '../validator/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                export const result1 = is<User>({ id: 10, username: "test" });
                export const result2 = is<User>({ id: "bad", username: "test" });
                export const result3 = is<User>(null);
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            expect(module.result1).toBe(true);
            expect(module.result2).toBe(false);
            expect(module.result3).toBe(false);
        });

        it("should work with complex types", async () => {
            const source = `
                import { is } from '../validator/index';
                
                type Data = {
                    items: string[];
                    count: number;
                };
                
                export const validResult = is<Data>({ items: ["a", "b"], count: 2 });
                export const invalidResult = is<Data>({ items: [1, 2], count: 2 });
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            expect(module.validResult).toBe(true);
            expect(module.invalidResult).toBe(false);
        });
    });

    describe("assert", () => {
        it("should not throw for valid values", async () => {
            const source = `
                import { assert } from '../validator/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                const value: any = { id: 10, username: "test" };
                assert<User>(value);
                export const result = "success";
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            expect(module.result).toBe("success");
        });

        it("should throw for invalid values", async () => {
            const source = `
                import { assert } from '../validator/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                export function testAssert() {
                    const value: any = { id: "bad", username: 123 };
                    assert<User>(value);
                }
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);

            expect(() => module.testAssert()).toThrow(TypeError);
        });
    });

    describe("createAssert", () => {
        it("should create asserter with default error", async () => {
            const source = `
                import { createAssert } from '../validator/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                export const assertUser = createAssert<User>();
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);
            const assertUser = module.assertUser;

            // Should not throw for valid
            expect(() => assertUser({ id: 10, username: "test" })).not.toThrow();

            // Should throw for invalid
            expect(() => assertUser({ id: "bad", username: 123 })).toThrow(TypeError);
        });

        it("should create asserter with custom error factory", async () => {
            const source = `
                import { createAssert } from '../validator/index';
                
                type User = {
                    id: number;
                    username: string;
                };
                
                class CustomError extends Error {
                    constructor(public errors: any[]) {
                        super("Custom validation error");
                    }
                }
                
                export const assertUser = createAssert<User>((errors) => new CustomError(errors));
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);
            const assertUser = module.assertUser;

            // Should not throw for valid
            expect(() => assertUser({ id: 10, username: "test" })).not.toThrow();

            // Should throw custom error for invalid
            try {
                assertUser({ id: "bad", username: 123 });
                expect(true).toBe(false); // Should not reach here
            } catch (error: any) {
                expect(error.message).toBe("Custom validation error");
                expect(error.errors).toBeDefined();
            }
        });
    });

    describe("optional properties", () => {
        it("should handle optional properties correctly", async () => {
            const source = `
                import { createValidator } from '../validator/index';
                
                type User = {
                    id: number;
                    username: string;
                    email?: string;
                };
                
                export const validator = createValidator<User>();
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);
            const validator = module.validator;

            // Valid without optional field
            const validResult = validator({ id: 10, username: "test" });
            expect(validResult).toEqual([]);

            // Valid with optional field
            const validResult2 = validator({ id: 10, username: "test", email: "test@example.com" });
            expect(validResult2).toEqual([]);

            // Invalid - wrong type for optional field
            const invalidResult = validator({ id: 10, username: "test", email: 123 });
            expect(invalidResult.length).toBeGreaterThan(0);
        });
    });

    describe("union types", () => {
        it("should validate union types", async () => {
            const source = `
                import { createValidator } from '../validator/index';
                
                type Value = string | number;
                
                type Data = {
                    value: Value;
                };
                
                export const validator = createValidator<Data>();
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);
            const validator = module.validator;

            // Valid with string
            expect(validator({ value: "test" })).toEqual([]);

            // Valid with number
            expect(validator({ value: 42 })).toEqual([]);

            // Invalid with boolean
            const invalidResult = validator({ value: true });
            expect(invalidResult.length).toBeGreaterThan(0);
        });

        it("should validate nullable types", async () => {
            const source = `
                import { createValidator } from '../validator/index';
                
                type Data = {
                    value: string | null;
                };
                
                export const validator = createValidator<Data>();
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);
            const validator = module.validator;

            // Valid with string
            expect(validator({ value: "test" })).toEqual([]);

            // Valid with null
            expect(validator({ value: null })).toEqual([]);

            // Invalid with number
            const invalidResult = validator({ value: 42 });
            expect(invalidResult.length).toBeGreaterThan(0);
        });
    });

    describe("literal types", () => {
        it("should validate string literal types", async () => {
            const source = `
                import { createValidator } from '../validator/index';
                
                type Status = {
                    kind: "active" | "inactive";
                };
                
                export const validator = createValidator<Status>();
            `;

            const output = await compile(source);
            const module = await import(`${import.meta.dir}/.tmp/out/src.js?t=${Date.now()}`);
            const validator = module.validator;

            // Valid
            expect(validator({ kind: "active" })).toEqual([]);
            expect(validator({ kind: "inactive" })).toEqual([]);

            // Invalid
            const invalidResult = validator({ kind: "other" });
            expect(invalidResult.length).toBeGreaterThan(0);
        });
    });
});
