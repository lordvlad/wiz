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
        title: "date defaults to date-time string",
        type: `type Type = {
                    occurredAt: Date;
                };`,
        schema: `{
            type: "object",
            properties: {
                occurredAt: {
                    type: "string",
                    format: "date-time"
                }
            },
            required: [
                "occurredAt"
            ]
        }`
    },
    {
        title: "date uses custom transformer",
        type: `type Type = {
                    occurredAt: Date;
                };`,
        pluginOptions: {
            transformDate: () => ({
                type: "integer",
                format: "unix-ms"
            })
        },
        schema: `{
            type: "object",
            properties: {
                occurredAt: {
                    type: "integer",
                    format: "unix-ms"
                }
            },
            required: [
                "occurredAt"
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
    },
    {
        title: "jsdoc description on properties",
        type: `type Type = {
                    /** User's unique identifier */
                    id: number;
                    /** Full name of the user */
                    name: string;
                }`,
        schema: `{
            type: "object",
            properties: {
                id: {
                    type: "number",
                    description: "User's unique identifier"
                },
                name: {
                    type: "string",
                    description: "Full name of the user"
                }
            },
            required: [
                "id",
                "name"
            ]
        }`
    },
    {
        title: "jsdoc @description tag",
        type: `type Type = {
                    /**
                     * @description The user's email address
                     */
                    email: string;
                }`,
        schema: `{
            type: "object",
            properties: {
                email: {
                    type: "string",
                    description: "The user's email address"
                }
            },
            required: [
                "email"
            ]
        }`
    },
    {
        title: "jsdoc @default value",
        type: `type Type = {
                    /**
                     * @default "guest"
                     */
                    role: string;
                    /**
                     * @default 0
                     */
                    count: number;
                    /**
                     * @default true
                     */
                    active: boolean;
                }`,
        schema: `{
            type: "object",
            properties: {
                role: {
                    type: "string",
                    default: "guest"
                },
                count: {
                    type: "number",
                    default: 0
                },
                active: {
                    type: "boolean",
                    default: true
                }
            },
            required: [
                "role",
                "count",
                "active"
            ]
        }`
    },
    {
        title: "jsdoc @example value",
        type: `type Type = {
                    /**
                     * @example "john@example.com"
                     */
                    email: string;
                }`,
        schema: `{
            type: "object",
            properties: {
                email: {
                    type: "string",
                    example: "john@example.com"
                }
            },
            required: [
                "email"
            ]
        }`
    },
    {
        title: "jsdoc @deprecated field",
        type: `type Type = {
                    /** @deprecated Use newField instead */
                    oldField: string;
                    newField: string;
                }`,
        schema: `{
            type: "object",
            properties: {
                oldField: {
                    type: "string",
                    deprecated: true
                },
                newField: {
                    type: "string"
                }
            },
            required: [
                "oldField",
                "newField"
            ]
        }`
    },
    {
        title: "jsdoc @minimum and @maximum",
        type: `type Type = {
                    /**
                     * @minimum 1
                     * @maximum 100
                     */
                    age: number;
                }`,
        schema: `{
            type: "object",
            properties: {
                age: {
                    type: "number",
                    minimum: 1,
                    maximum: 100
                }
            },
            required: [
                "age"
            ]
        }`
    },
    {
        title: "jsdoc combined tags",
        type: `type Type = {
                    /**
                     * User's email address
                     * @default "user@example.com"
                     * @example "john.doe@example.com"
                     */
                    email: string;
                }`,
        schema: `{
            type: "object",
            properties: {
                email: {
                    type: "string",
                    description: "User's email address",
                    default: "user@example.com",
                    example: "john.doe@example.com"
                }
            },
            required: [
                "email"
            ]
        }`
    },
    {
        title: "jsdoc @private excludes field",
        type: `type Type = {
                    id: number;
                    /** @private Internal use only */
                    secret: string;
                    name: string;
                }`,
        schema: `{
            type: "object",
            properties: {
                id: {
                    type: "number"
                },
                name: {
                    type: "string"
                }
            },
            required: [
                "id",
                "name"
            ]
        }`
    },
    {
        title: "jsdoc @ignore excludes field",
        type: `type Type = {
                    id: number;
                    /** @ignore */
                    internal: string;
                    name: string;
                }`,
        schema: `{
            type: "object",
            properties: {
                id: {
                    type: "number"
                },
                name: {
                    type: "string"
                }
            },
            required: [
                "id",
                "name"
            ]
        }`
    },
    {
        title: "jsdoc @package excludes field",
        type: `type Type = {
                    id: number;
                    /** @package */
                    packageOnly: string;
                    name: string;
                }`,
        schema: `{
            type: "object",
            properties: {
                id: {
                    type: "number"
                },
                name: {
                    type: "string"
                }
            },
            required: [
                "id",
                "name"
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

