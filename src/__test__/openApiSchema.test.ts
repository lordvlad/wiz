import { describe, expect, it } from 'bun:test';
import { compile, dedent } from './util';



const tests = [
    {
        title: "simple type",
        type: `type Type = {
                    id: number;
                    name: string;
                    isActive: boolean;
                    tags: string[];
                    metadata: {
                        createdAt: string;
                        updatedAt: string;
                    };
                }`,
        schema: `{
            type: "object",
            properties: {
                id: {
                    type: "number"
                },
                name: {
                    type: "string"
                },
                isActive: {
                    type: "boolean"
                },
                tags: {
                    type: "array",
                    items: {
                        type: "string"
                    }
                },
                metadata: {
                    type: "object",
                    properties: {
                        createdAt: {
                            type: "string"
                        },
                        updatedAt: {
                            type: "string"
                        }
                    }
                }
            }
        }`
    }
]

describe("openApiSchema plugin", () => {
    for (const { title, type, schema } of tests) {
        it(`must create schema for ${title}`, async () => {
            const code = `
                import { createOpenApiSchema } from "../../openApiSchema/index";
                ${type}
                export const schema = createOpenApiSchema<Type>();
            `

            const transformed = `var schema = ${schema};`;
            const actual = await compile(code)
            const expected = dedent(transformed);
            expect(actual).toInclude(expected);
        });
    }
});

