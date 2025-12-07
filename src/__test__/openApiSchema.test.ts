import { describe, expect, it } from 'bun:test';
import { compile, dedent } from './util';


const cases = [
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
                    },
                    required: [
                        "createdAt",
                        "updatedAt"
                    ]
                }
            },
            required: [
                "id",
                "name",
                "isActive",
                "tags",
                "metadata"
            ]
        }`
    },
    {
        title: "optional properties",
        type: `type Type = {
                    id: number;
                    description?: string;
                    limit?: number;
                    tags?: string[];
                    settings: {
                        language: string;
                        notifications?: {
                            push: boolean;
                            email?: boolean;
                        };
                    };
                }`,
        schema: `{
            type: "object",
            properties: {
                id: {
                    type: "number"
                },
                description: {
                    type: "string"
                },
                limit: {
                    type: "number"
                },
                tags: {
                    type: "array",
                    items: {
                        type: "string"
                    }
                },
                settings: {
                    type: "object",
                    properties: {
                        language: {
                            type: "string"
                        },
                        notifications: {
                            type: "object",
                            properties: {
                                push: {
                                    type: "boolean"
                                },
                                email: {
                                    type: "boolean"
                                }
                            },
                            required: [
                                "push"
                            ]
                        }
                    },
                    required: [
                        "language"
                    ]
                }
            },
            required: [
                "id",
                "settings"
            ]
        }`
    },
    {
        title: "all primitives",
        type: `type Type = {
                    title: string;
                    count: number;
                    published: boolean;
                }`,
        schema: `{
            type: "object",
            properties: {
                title: {
                    type: "string"
                },
                count: {
                    type: "number"
                },
                published: {
                    type: "boolean"
                }
            },
            required: [
                "title",
                "count",
                "published"
            ]
        }`
    },
    {
        title: "arrays of primitives",
        type: `type Type = {
                    titles: string[];
                    scores: number[];
                    flags: boolean[];
                }`,
        schema: `{
            type: "object",
            properties: {
                titles: {
                    type: "array",
                    items: {
                        type: "string"
                    }
                },
                scores: {
                    type: "array",
                    items: {
                        type: "number"
                    }
                },
                flags: {
                    type: "array",
                    items: {
                        type: "boolean"
                    }
                }
            },
            required: [
                "titles",
                "scores",
                "flags"
            ]
        }`
    },
    {
        title: "deeply nested objects",
        type: `type Type = {
                    id: number;
                    profile: {
                        name: {
                            first: string;
                            middle?: string;
                            last: string;
                        };
                        contact: {
                            email: string;
                            phone?: string;
                        };
                    };
                    history: {
                        logins: {
                            timestamp: string;
                            location?: string;
                            device: {
                                os: string;
                                version?: string;
                            };
                        }[];
                    };
                }`,
        schema: `{
            type: "object",
            properties: {
                id: {
                    type: "number"
                },
                profile: {
                    type: "object",
                    properties: {
                        name: {
                            type: "object",
                            properties: {
                                first: {
                                    type: "string"
                                },
                                middle: {
                                    type: "string"
                                },
                                last: {
                                    type: "string"
                                }
                            },
                            required: [
                                "first",
                                "last"
                            ]
                        },
                        contact: {
                            type: "object",
                            properties: {
                                email: {
                                    type: "string"
                                },
                                phone: {
                                    type: "string"
                                }
                            },
                            required: [
                                "email"
                            ]
                        }
                    },
                    required: [
                        "name",
                        "contact"
                    ]
                },
                history: {
                    type: "object",
                    properties: {
                        logins: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    timestamp: {
                                        type: "string"
                                    },
                                    location: {
                                        type: "string"
                                    },
                                    device: {
                                        type: "object",
                                        properties: {
                                            os: {
                                                type: "string"
                                            },
                                            version: {
                                                type: "string"
                                            }
                                        },
                                        required: [
                                            "os"
                                        ]
                                    }
                                },
                                required: [
                                    "timestamp",
                                    "device"
                                ]
                            }
                        }
                    },
                    required: [
                        "logins"
                    ]
                }
            },
            required: [
                "id",
                "profile",
                "history"
            ]
        }`
    },
    {
        title: "bigint formats",
        type: `type Type = {
                    id: tags.BigIntFormat<"int64">;
                    reference: tags.BigIntFormat<"string">;
                };`,
        schema: `{
            type: "object",
            properties: {
                id: {
                    type: "integer",
                    format: "int64"
                },
                reference: {
                    type: "string"
                }
            },
            required: [
                "id",
                "reference"
            ]
        }`
    },
    {
        title: "number formats",
        type: `type Type = {
                    floatValue: tags.NumFormat<"float">;
                    preciseValue: tags.NumFormat<"double">;
                    smallInt: tags.NumFormat<"int32">;
                    bigInt: tags.NumFormat<"int64">;
                    stringified?: tags.NumFormat<"string">;
                    plain: number;
                };`,
        schema: `{
            type: "object",
            properties: {
                floatValue: {
                    type: "number",
                    format: "float"
                },
                preciseValue: {
                    type: "number",
                    format: "double"
                },
                smallInt: {
                    type: "integer",
                    format: "int32"
                },
                bigInt: {
                    type: "integer",
                    format: "int64"
                },
                stringified: {
                    type: "string"
                },
                plain: {
                    type: "number"
                }
            },
            required: [
                "floatValue",
                "preciseValue",
                "smallInt",
                "bigInt",
                "plain"
            ]
        }`
    },
    {
        title: "symbol unsupported by default",
        type: `type Type = {
                    token: symbol;
                };`,
        expectError: /coerceSymbolsToStrings/
    },
    {
        title: "symbol coerced to string",
        type: `type Type = {
                    token: symbol;
                };`,
        pluginOptions: { coerceSymbolsToStrings: true },
        schema: `{
            type: "object",
            properties: {
                token: {
                    type: "string"
                }
            },
            required: [
                "token"
            ]
        }`
    }
];

describe("openApiSchema plugin", () => {
    it.each(cases)(`must create schema for $title`, async ({ type, schema, title, pluginOptions, expectError }) => {
        const needsTags = type.includes("tags.");
        const code = `
                ${needsTags ? 'import * as tags from "../../tags/index";' : ''}
                import { createOpenApiSchema } from "../../openApiSchema/index";
                ${type}
                export const schema = createOpenApiSchema<Type>();
            `

        if (schema) {
            const transformed = `var schema = ${schema};`;
            const actual = await compile(code, pluginOptions)
            const expected = dedent(transformed);
            expect(actual).toInclude(expected);
            return;
        }

        if (expectError) {
            await expect(compile(code, pluginOptions)).rejects.toThrow(expectError);
            return;
        }

        throw new Error(`Test case for ${title} must specify either schema or expectError`);
    });
});

