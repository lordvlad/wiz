import { describe, expect, it } from 'bun:test';
import { rmdir } from "fs/promises";
import wizPlugin from '../plugin/index.ts';

const DEBUG = true

function dedent(str: string) {
    return str.split(/\r?\n\r?/).map(line => line.trim()).join('\n').trim();
}

async function compile(source: string) {
    const src = `${import.meta.dir}/.tmp/src.ts`
    await Bun.write(src, dedent(source));

    const build = await Bun.build({
        entrypoints: [src],
        outdir: `${import.meta.dir}/.tmp/out`,
        throw: true,
        minify: false,
        format: 'esm',
        root: `${import.meta.dir}/.tmp`,
        packages: 'external',
        sourcemap: 'none',
        plugins: [wizPlugin({ log: DEBUG })]

    });

    if (DEBUG)
        build.logs.forEach(l => console.log(l.level, l.name, l.message, l.position));

    const code = await Bun.file(`${import.meta.dir}/.tmp/out/src.js`).text();

    if (!DEBUG)
        rmdir(`${import.meta.dir}/.tmp`, { recursive: true });

    return dedent(code);
}

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