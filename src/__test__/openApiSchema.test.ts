import { describe, expect, it } from 'bun:test';
import { compile, dedent } from './util';
import type { WizPluginOptions } from '../plugin/index';

// Type definition for test cases
type TestCase = {
    title: string;
    type: string;
    schema?: string;
    expectError?: string;
    pluginOptions?: WizPluginOptions;
    isArrayTest?: boolean;
    arrayTypes?: string[];
};

const cases: TestCase[] = [
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
            components: {
                schemas: {
                    Type: {
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
            ],
            title: "Type"
                    }
                }
            }
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
            components: {
                schemas: {
                    Type: {
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
            ],
            title: "Type"
                    }
                }
            }
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
            components: {
                schemas: {
                    Type: {
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
            ],
            title: "Type"
                    }
                }
            }
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
            components: {
                schemas: {
                    Type: {
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
            ],
            title: "Type"
                    }
                }
            }
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
            components: {
                schemas: {
                    Type: {
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
            ],
            title: "Type"
                    }
                }
            }
        }`
    },
    {
        title: "bigint formats",
        type: `type Type = {
                    id: tags.BigIntFormat<"int64">;
                    reference: tags.BigIntFormat<"string">;
                };`,
        schema: `{
            components: {
                schemas: {
                    Type: {
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
            ],
            title: "Type"
                    }
                }
            }
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
            components: {
                schemas: {
                    Type: {
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
            ],
            title: "Type"
                    }
                }
            }
        }`
    },
    {
        title: "date defaults to date-time string",
        type: `type Type = {
                    occurredAt: Date;
                };`,
        schema: `{
            components: {
                schemas: {
                    Type: {
            type: "object",
            properties: {
                occurredAt: {
                    type: "string",
                    format: "date-time"
                }
            },
            required: [
                "occurredAt"
            ],
            title: "Type"
                    }
                }
            }
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
            components: {
                schemas: {
                    Type: {
            type: "object",
            properties: {
                occurredAt: {
                    type: "integer",
                    format: "unix-ms"
                }
            },
            required: [
                "occurredAt"
            ],
            title: "Type"
                    }
                }
            }
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
            components: {
                schemas: {
                    Type: {
            type: "object",
            properties: {
                token: {
                    type: "string"
                }
            },
            required: [
                "token"
            ],
            title: "Type"
                    }
                }
            }
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
            components: {
                schemas: {
                    Type: {
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
            ],
            title: "Type"
                    }
                }
            }
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
            components: {
                schemas: {
                    Type: {
            type: "object",
            properties: {
                email: {
                    type: "string",
                    description: "The user's email address"
                }
            },
            required: [
                "email"
            ],
            title: "Type"
                    }
                }
            }
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
            components: {
                schemas: {
                    Type: {
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
            ],
            title: "Type"
                    }
                }
            }
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
            components: {
                schemas: {
                    Type: {
            type: "object",
            properties: {
                email: {
                    type: "string",
                    example: "john@example.com"
                }
            },
            required: [
                "email"
            ],
            title: "Type"
                    }
                }
            }
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
            components: {
                schemas: {
                    Type: {
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
            ],
            title: "Type"
                    }
                }
            }
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
            components: {
                schemas: {
                    Type: {
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
            ],
            title: "Type"
                    }
                }
            }
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
            components: {
                schemas: {
                    Type: {
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
            ],
            title: "Type"
                    }
                }
            }
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
            components: {
                schemas: {
                    Type: {
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
            ],
            title: "Type"
                    }
                }
            }
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
            components: {
                schemas: {
                    Type: {
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
            ],
            title: "Type"
                    }
                }
            }
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
            components: {
                schemas: {
                    Type: {
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
            ],
            title: "Type"
                    }
                }
            }
        }`
    },
    {
        title: "jsdoc on nested objects",
        type: `type Type = {
                    user: {
                        /** User's unique identifier */
                        id: number;
                        /** Full name */
                        name: string;
                    };
                }`,
        schema: `{
            components: {
                schemas: {
                    Type: {
            type: "object",
            properties: {
                user: {
                    type: "object",
                    properties: {
                        id: {
                            type: "number",
                            description: "User's unique identifier"
                        },
                        name: {
                            type: "string",
                            description: "Full name"
                        }
                    },
                    required: [
                        "id",
                        "name"
                    ]
                }
            },
            required: [
                "user"
            ],
            title: "Type"
                    }
                }
            }
        }`
    },
    {
        title: "jsdoc with minLength and maxLength",
        type: `type Type = {
                    /**
                     * @minLength 3
                     * @maxLength 50
                     */
                    username: string;
                }`,
        schema: `{
            components: {
                schemas: {
                    Type: {
            type: "object",
            properties: {
                username: {
                    type: "string",
                    minLength: 3,
                    maxLength: 50
                }
            },
            required: [
                "username"
            ],
            title: "Type"
                    }
                }
            }
        }`
    },
    {
        title: "string literal union",
        type: `type Environment = "development" | "staging" | "production";
                type Type = {
                    env: Environment;
                }`,
        schema: `{
            components: {
                schemas: {
                    Type: {
            type: "object",
            properties: {
                env: {
                    type: "string",
                    enum: [
                        "development",
                        "staging",
                        "production"
                    ]
                }
            },
            required: [
                "env"
            ],
            title: "Type"
                    }
                }
            }
        }`
    },
    {
        title: "inline string literal union",
        type: `type Type = {
                    status: "active" | "inactive" | "pending";
                }`,
        schema: `{
            components: {
                schemas: {
                    Type: {
            type: "object",
            properties: {
                status: {
                    type: "string",
                    enum: [
                        "active",
                        "inactive",
                        "pending"
                    ]
                }
            },
            required: [
                "status"
            ],
            title: "Type"
                    }
                }
            }
        }`
    },
    {
        title: "typescript string enum",
        type: `enum UserRole {
                    Admin = "admin",
                    User = "user",
                    Guest = "guest"
                }
                type Type = {
                    role: UserRole;
                }`,
        schema: `{
            components: {
                schemas: {
                    Type: {
            type: "object",
            properties: {
                role: {
                    type: "string",
                    enum: [
                        "admin",
                        "user",
                        "guest"
                    ]
                }
            },
            required: [
                "role"
            ],
            title: "Type"
                    }
                }
            }
        }`
    },
    {
        title: "typescript numeric enum",
        type: `enum StatusCode {
                    Ok = 200,
                    NotFound = 404,
                    ServerError = 500
                }
                type Type = {
                    status: StatusCode;
                }`,
        schema: `{
            components: {
                schemas: {
                    Type: {
            type: "object",
            properties: {
                status: {
                    type: "number",
                    enum: [
                        200,
                        404,
                        500
                    ]
                }
            },
            required: [
                "status"
            ],
            title: "Type"
                    }
                }
            }
        }`
    },
    {
        title: "mixed enum types in one schema",
        type: `enum UserRole {
                    Admin = "admin",
                    User = "user"
                }
                type Environment = "dev" | "prod";
                type Type = {
                    role: UserRole;
                    env: Environment;
                    priority: 1 | 2 | 3;
                }`,
        schema: `{
            components: {
                schemas: {
                    Type: {
            type: "object",
            properties: {
                role: {
                    type: "string",
                    enum: [
                        "admin",
                        "user"
                    ]
                },
                env: {
                    type: "string",
                    enum: [
                        "dev",
                        "prod"
                    ]
                },
                priority: {
                    type: "number",
                    enum: [
                        1,
                        2,
                        3
                    ]
                }
            },
            required: [
                "role",
                "env",
                "priority"
            ],
            title: "Type"
                    }
                }
            }
        }`
    },
    {
        title: "array with single type",
        type: `type User = {
                    id: number;
                    name: string;
                }`,
        isArrayTest: true,
        arrayTypes: ['User'],
        schema: `{
            components: {
                schemas: {
                    User: {
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
                        ],
                        title: "User"
                    }
                }
            }
        }`
    },
    {
        title: "array with multiple types",
        type: `type User = {
                    id: number;
                    name: string;
                }
                type Product = {
                    sku: string;
                    price: number;
                }`,
        isArrayTest: true,
        arrayTypes: ['User', 'Product'],
        schema: `{
            components: {
                schemas: {
                    User: {
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
                        ],
                        title: "User"
                    },
                    Product: {
                        type: "object",
                        properties: {
                            sku: {
                                type: "string"
                            },
                            price: {
                                type: "number"
                            }
                        },
                        required: [
                            "sku",
                            "price"
                        ],
                        title: "Product"
                    }
                }
            }
        }`
    },
    {
        title: "array with duplicate type names",
        type: `type User = {
                    id: number;
                    name: string;
                }`,
        isArrayTest: true,
        arrayTypes: ['User', 'User'],
        expectError: "Duplicate type name 'User' detected in tuple"
    },
    {
        title: "$ref for type reference in property",
        type: `type User = {
                    id: number;
                    name: string;
                }
                type Post = {
                    title: string;
                    author: User;
                }`,
        isArrayTest: true,
        arrayTypes: ['User', 'Post'],
        schema: `{
            components: {
                schemas: {
                    User: {
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
                        ],
                        title: "User"
                    },
                    Post: {
                        type: "object",
                        properties: {
                            title: {
                                type: "string"
                            },
                            author: {
                                $ref: "#/components/schemas/User"
                            }
                        },
                        required: [
                            "title",
                            "author"
                        ],
                        title: "Post"
                    }
                }
            }
        }`
    },
    {
        title: "$ref for array of referenced type",
        type: `type Tag = {
                    id: number;
                    name: string;
                }
                type Article = {
                    title: string;
                    tags: Tag[];
                }`,
        isArrayTest: true,
        arrayTypes: ['Tag', 'Article'],
        schema: `{
            components: {
                schemas: {
                    Tag: {
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
                        ],
                        title: "Tag"
                    },
                    Article: {
                        type: "object",
                        properties: {
                            title: {
                                type: "string"
                            },
                            tags: {
                                type: "array",
                                items: {
                                    $ref: "#/components/schemas/Tag"
                                }
                            }
                        },
                        required: [
                            "title",
                            "tags"
                        ],
                        title: "Article"
                    }
                }
            }
        }`
    },
    {
        title: "$ref for optional referenced type",
        type: `type Profile = {
                    bio: string;
                }
                type User = {
                    name: string;
                    profile?: Profile;
                }`,
        isArrayTest: true,
        arrayTypes: ['Profile', 'User'],
        schema: `{
            components: {
                schemas: {
                    Profile: {
                        type: "object",
                        properties: {
                            bio: {
                                type: "string"
                            }
                        },
                        required: [
                            "bio"
                        ],
                        title: "Profile"
                    },
                    User: {
                        type: "object",
                        properties: {
                            name: {
                                type: "string"
                            },
                            profile: {
                                $ref: "#/components/schemas/Profile"
                            }
                        },
                        required: [
                            "name"
                        ],
                        title: "User"
                    }
                }
            }
        }`
    },
    {
        title: "$ref with multiple references",
        type: `type Author = {
                    name: string;
                }
                type Category = {
                    title: string;
                }
                type Post = {
                    content: string;
                    author: Author;
                    category: Category;
                }`,
        isArrayTest: true,
        arrayTypes: ['Author', 'Category', 'Post'],
        schema: `{
            components: {
                schemas: {
                    Author: {
                        type: "object",
                        properties: {
                            name: {
                                type: "string"
                            }
                        },
                        required: [
                            "name"
                        ],
                        title: "Author"
                    },
                    Category: {
                        type: "object",
                        properties: {
                            title: {
                                type: "string"
                            }
                        },
                        required: [
                            "title"
                        ],
                        title: "Category"
                    },
                    Post: {
                        type: "object",
                        properties: {
                            content: {
                                type: "string"
                            },
                            author: {
                                $ref: "#/components/schemas/Author"
                            },
                            category: {
                                $ref: "#/components/schemas/Category"
                            }
                        },
                        required: [
                            "content",
                            "author",
                            "category"
                        ],
                        title: "Post"
                    }
                }
            }
        }`
    },
    {
        title: "$ref circular reference",
        type: `type Node = {
                    value: string;
                    next?: Node;
                }`,
        isArrayTest: true,
        arrayTypes: ['Node'],
        schema: `{
            components: {
                schemas: {
                    Node: {
                        type: "object",
                        properties: {
                            value: {
                                type: "string"
                            },
                            next: {
                                $ref: "#/components/schemas/Node"
                            }
                        },
                        required: [
                            "value"
                        ],
                        title: "Node"
                    }
                }
            }
        }`
    },
    {
        title: "inline type when not in components",
        type: `type User = {
                    id: number;
                    name: string;
                }
                type Post = {
                    title: string;
                    metadata: {
                        views: number;
                    };
                }`,
        isArrayTest: true,
        arrayTypes: ['User', 'Post'],
        schema: `{
            components: {
                schemas: {
                    User: {
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
                        ],
                        title: "User"
                    },
                    Post: {
                        type: "object",
                        properties: {
                            title: {
                                type: "string"
                            },
                            metadata: {
                                type: "object",
                                properties: {
                                    views: {
                                        type: "number"
                                    }
                                },
                                required: [
                                    "views"
                                ]
                            }
                        },
                        required: [
                            "title",
                            "metadata"
                        ],
                        title: "Post"
                    }
                }
            }
        }`
    },
    {
        title: "oneOf for type union",
        type: `type Circle = {
                    kind: "circle";
                    radius: number;
                }
                type Square = {
                    kind: "square";
                    side: number;
                }
                type Shape = Circle | Square;
                type Type = {
                    shape: Shape;
                }`,
        schema: `{
            components: {
                schemas: {
                    Type: {
            type: "object",
            properties: {
                shape: {
                    oneOf: [
                        {
                            type: "object",
                            properties: {
                                kind: {
                                    type: "string",
                                    enum: [
                                        "circle"
                                    ]
                                },
                                radius: {
                                    type: "number"
                                }
                            },
                            required: [
                                "kind",
                                "radius"
                            ]
                        },
                        {
                            type: "object",
                            properties: {
                                kind: {
                                    type: "string",
                                    enum: [
                                        "square"
                                    ]
                                },
                                side: {
                                    type: "number"
                                }
                            },
                            required: [
                                "kind",
                                "side"
                            ]
                        }
                    ],
                    discriminator: {
                        propertyName: "kind"
                    }
                }
            },
            required: [
                "shape"
            ],
            title: "Type"
                    }
                }
            }
        }`
    },
    {
        title: "oneOf for mixed type union",
        type: `type Type = {
                    value: string | number | boolean;
                }`,
        schema: `{
            components: {
                schemas: {
                    Type: {
            type: "object",
            properties: {
                value: {
                    oneOf: [
                        {
                            type: "string"
                        },
                        {
                            type: "number"
                        },
                        {
                            type: "boolean"
                        }
                    ]
                }
            },
            required: [
                "value"
            ],
            title: "Type"
                    }
                }
            }
        }`
    },
    {
        title: "allOf for intersection type",
        type: `type Timestamped = {
                    createdAt: string;
                    updatedAt: string;
                }
                type Named = {
                    name: string;
                }
                type Entity = Timestamped & Named;
                type Type = {
                    entity: Entity;
                }`,
        schema: `{
            components: {
                schemas: {
                    Type: {
            type: "object",
            properties: {
                entity: {
                    allOf: [
                        {
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
                        },
                        {
                            type: "object",
                            properties: {
                                name: {
                                    type: "string"
                                }
                            },
                            required: [
                                "name"
                            ]
                        }
                    ]
                }
            },
            required: [
                "entity"
            ],
            title: "Type"
                    }
                }
            }
        }`
    },
    {
        title: "oneOf with $ref for named types",
        type: `type Dog = {
                    breed: string;
                    bark: boolean;
                }
                type Cat = {
                    breed: string;
                    meow: boolean;
                }
                type Pet = Dog | Cat;
                type Type = {
                    pet: Pet;
                }`,
        arrayTypes: ['Type', 'Dog', 'Cat'],
        schema: `{
            components: {
                schemas: {
                    Type: {
                        type: "object",
                        properties: {
                            pet: {
                                oneOf: [
                                    {
                                        $ref: "#/components/schemas/Dog"
                                    },
                                    {
                                        $ref: "#/components/schemas/Cat"
                                    }
                                ]
                            }
                        },
                        required: [
                            "pet"
                        ],
                        title: "Type"
                    },
                    Dog: {
                        type: "object",
                        properties: {
                            breed: {
                                type: "string"
                            },
                            bark: {
                                type: "boolean"
                            }
                        },
                        required: [
                            "breed",
                            "bark"
                        ],
                        title: "Dog"
                    },
                    Cat: {
                        type: "object",
                        properties: {
                            breed: {
                                type: "string"
                            },
                            meow: {
                                type: "boolean"
                            }
                        },
                        required: [
                            "breed",
                            "meow"
                        ],
                        title: "Cat"
                    }
                }
            }
        }`
    },
    {
        title: "oneOf with nullable union",
        type: `type Type = {
                    value: string | number | null;
                }`,
        schema: `{
            components: {
                schemas: {
                    Type: {
            type: "object",
            properties: {
                value: {
                    oneOf: [
                        {
                            type: "string"
                        },
                        {
                            type: "number"
                        }
                    ]
                }
            },
            required: [
                "value"
            ],
            title: "Type"
                    }
                }
            }
        }`
    },
    {
        title: "nested oneOf",
        type: `type A = { a: string };
                type B = { b: number };
                type C = { c: boolean };
                type Type = {
                    nested: {
                        value: A | B | C;
                    };
                }`,
        schema: `{
            components: {
                schemas: {
                    Type: {
            type: "object",
            properties: {
                nested: {
                    type: "object",
                    properties: {
                        value: {
                            oneOf: [
                                {
                                    type: "object",
                                    properties: {
                                        a: {
                                            type: "string"
                                        }
                                    },
                                    required: [
                                        "a"
                                    ]
                                },
                                {
                                    type: "object",
                                    properties: {
                                        b: {
                                            type: "number"
                                        }
                                    },
                                    required: [
                                        "b"
                                    ]
                                },
                                {
                                    type: "object",
                                    properties: {
                                        c: {
                                            type: "boolean"
                                        }
                                    },
                                    required: [
                                        "c"
                                    ]
                                }
                            ]
                        }
                    },
                    required: [
                        "value"
                    ]
                }
            },
            required: [
                "nested"
            ],
            title: "Type"
                    }
                }
            }
        }`
    },
    {
        title: "allOf with multiple intersections",
        type: `type A = { a: string };
                type B = { b: number };
                type C = { c: boolean };
                type Combined = A & B & C;
                type Type = {
                    combined: Combined;
                }`,
        schema: `{
            components: {
                schemas: {
                    Type: {
            type: "object",
            properties: {
                combined: {
                    allOf: [
                        {
                            type: "object",
                            properties: {
                                a: {
                                    type: "string"
                                }
                            },
                            required: [
                                "a"
                            ]
                        },
                        {
                            type: "object",
                            properties: {
                                b: {
                                    type: "number"
                                }
                            },
                            required: [
                                "b"
                            ]
                        },
                        {
                            type: "object",
                            properties: {
                                c: {
                                    type: "boolean"
                                }
                            },
                            required: [
                                "c"
                            ]
                        }
                    ]
                }
            },
            required: [
                "combined"
            ],
            title: "Type"
                    }
                }
            }
        }`
    },
    {
        title: "union of arrays",
        type: `type Type = {
                    items: string[] | number[];
                }`,
        schema: `{
            components: {
                schemas: {
                    Type: {
            type: "object",
            properties: {
                items: {
                    oneOf: [
                        {
                            type: "array",
                            items: {
                                type: "string"
                            }
                        },
                        {
                            type: "array",
                            items: {
                                type: "number"
                            }
                        }
                    ]
                }
            },
            required: [
                "items"
            ],
            title: "Type"
                    }
                }
            }
        }`
    },
    {
        title: "oneOf with discriminator for inline types",
        type: `type Circle = {
                    kind: "circle";
                    radius: number;
                }
                type Square = {
                    kind: "square";
                    side: number;
                }
                type Shape = Circle | Square;
                type Type = {
                    shape: Shape;
                }`,
        schema: `{
            components: {
                schemas: {
                    Type: {
            type: "object",
            properties: {
                shape: {
                    oneOf: [
                        {
                            type: "object",
                            properties: {
                                kind: {
                                    type: "string",
                                    enum: [
                                        "circle"
                                    ]
                                },
                                radius: {
                                    type: "number"
                                }
                            },
                            required: [
                                "kind",
                                "radius"
                            ]
                        },
                        {
                            type: "object",
                            properties: {
                                kind: {
                                    type: "string",
                                    enum: [
                                        "square"
                                    ]
                                },
                                side: {
                                    type: "number"
                                }
                            },
                            required: [
                                "kind",
                                "side"
                            ]
                        }
                    ],
                    discriminator: {
                        propertyName: "kind"
                    }
                }
            },
            required: [
                "shape"
            ],
            title: "Type"
                    }
                }
            }
        }`
    },
    {
        title: "oneOf with discriminator and mapping for named types",
        type: `type Dog = {
                    petType: "dog";
                    breed: string;
                    bark: boolean;
                }
                type Cat = {
                    petType: "cat";
                    breed: string;
                    meow: boolean;
                }
                type Pet = Dog | Cat;
                type Type = {
                    pet: Pet;
                }`,
        arrayTypes: ['Type', 'Dog', 'Cat'],
        schema: `{
            components: {
                schemas: {
                    Type: {
                        type: "object",
                        properties: {
                            pet: {
                                oneOf: [
                                    {
                                        $ref: "#/components/schemas/Dog"
                                    },
                                    {
                                        $ref: "#/components/schemas/Cat"
                                    }
                                ],
                                discriminator: {
                                    propertyName: "petType",
                                    mapping: {
                                        dog: "#/components/schemas/Dog",
                                        cat: "#/components/schemas/Cat"
                                    }
                                }
                            }
                        },
                        required: [
                            "pet"
                        ],
                        title: "Type"
                    },
                    Dog: {
                        type: "object",
                        properties: {
                            petType: {
                                type: "string",
                                enum: [
                                    "dog"
                                ]
                            },
                            breed: {
                                type: "string"
                            },
                            bark: {
                                type: "boolean"
                            }
                        },
                        required: [
                            "petType",
                            "breed",
                            "bark"
                        ],
                        title: "Dog"
                    },
                    Cat: {
                        type: "object",
                        properties: {
                            petType: {
                                type: "string",
                                enum: [
                                    "cat"
                                ]
                            },
                            breed: {
                                type: "string"
                            },
                            meow: {
                                type: "boolean"
                            }
                        },
                        required: [
                            "petType",
                            "breed",
                            "meow"
                        ],
                        title: "Cat"
                    }
                }
            }
        }`
    },
    {
        title: "oneOf with numeric discriminator",
        type: `type TypeA = {
                    version: 1;
                    dataA: string;
                }
                type TypeB = {
                    version: 2;
                    dataB: number;
                }
                type Versioned = TypeA | TypeB;
                type Type = {
                    item: Versioned;
                }`,
        schema: `{
            components: {
                schemas: {
                    Type: {
            type: "object",
            properties: {
                item: {
                    oneOf: [
                        {
                            type: "object",
                            properties: {
                                version: {
                                    type: "number",
                                    enum: [
                                        1
                                    ]
                                },
                                dataA: {
                                    type: "string"
                                }
                            },
                            required: [
                                "version",
                                "dataA"
                            ]
                        },
                        {
                            type: "object",
                            properties: {
                                version: {
                                    type: "number",
                                    enum: [
                                        2
                                    ]
                                },
                                dataB: {
                                    type: "number"
                                }
                            },
                            required: [
                                "version",
                                "dataB"
                            ]
                        }
                    ],
                    discriminator: {
                        propertyName: "version"
                    }
                }
            },
            required: [
                "item"
            ],
            title: "Type"
                    }
                }
            }
        }`
    },
    {
        title: "map with string values",
        type: `type Type = {
                    [key: string]: string;
                }`,
        schema: `{
            components: {
                schemas: {
                    Type: {
            type: "object",
            additionalProperties: {
                type: "string"
            },
            title: "Type"
                    }
                }
            }
        }`
    },
    {
        title: "map with number values",
        type: `type Type = {
                    [key: string]: number;
                }`,
        schema: `{
            components: {
                schemas: {
                    Type: {
            type: "object",
            additionalProperties: {
                type: "number"
            },
            title: "Type"
                    }
                }
            }
        }`
    },
    {
        title: "map with boolean values",
        type: `type Type = {
                    [key: string]: boolean;
                }`,
        schema: `{
            components: {
                schemas: {
                    Type: {
            type: "object",
            additionalProperties: {
                type: "boolean"
            },
            title: "Type"
                    }
                }
            }
        }`
    },
    {
        title: "map with object values",
        type: `type Type = {
                    [key: string]: {
                        id: number;
                        name: string;
                    };
                }`,
        schema: `{
            components: {
                schemas: {
                    Type: {
            type: "object",
            additionalProperties: {
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
            },
            title: "Type"
                    }
                }
            }
        }`
    },
    {
        title: "map with array values",
        type: `type Type = {
                    [key: string]: string[];
                }`,
        schema: `{
            components: {
                schemas: {
                    Type: {
            type: "object",
            additionalProperties: {
                type: "array",
                items: {
                    type: "string"
                }
            },
            title: "Type"
                    }
                }
            }
        }`
    },
    {
        title: "map with $ref values",
        type: `type Item = {
                    id: number;
                    value: string;
                }
                type Type = {
                    [key: string]: Item;
                }`,
        isArrayTest: true,
        arrayTypes: ['Type', 'Item'],
        schema: `{
            components: {
                schemas: {
                    Type: {
                        type: "object",
                        additionalProperties: {
                            $ref: "#/components/schemas/Item"
                        },
                        title: "Type"
                    },
                    Item: {
                        type: "object",
                        properties: {
                            id: {
                                type: "number"
                            },
                            value: {
                                type: "string"
                            }
                        },
                        required: [
                            "id",
                            "value"
                        ],
                        title: "Item"
                    }
                }
            }
        }`
    },
    {
        title: "mixed properties and map",
        type: `type Type = {
                    fixedProp: string;
                    count: number;
                    [key: string]: any;
                }`,
        schema: `{
            components: {
                schemas: {
                    Type: {
            type: "object",
            properties: {
                fixedProp: {
                    type: "string"
                },
                count: {
                    type: "number"
                }
            },
            required: [
                "fixedProp",
                "count"
            ],
            additionalProperties: true,
            title: "Type"
                    }
                }
            }
        }`
    },
    {
        title: "map with union values",
        type: `type Type = {
                    [key: string]: string | number;
                }`,
        schema: `{
            components: {
                schemas: {
                    Type: {
            type: "object",
            additionalProperties: {
                oneOf: [
                    {
                        type: "string"
                    },
                    {
                        type: "number"
                    }
                ]
            },
            title: "Type"
                    }
                }
            }
        }`
    },
    {
        title: "nested map",
        type: `type Type = {
                    metadata: {
                        [key: string]: string;
                    };
                }`,
        schema: `{
            components: {
                schemas: {
                    Type: {
            type: "object",
            properties: {
                metadata: {
                    type: "object",
                    additionalProperties: {
                        type: "string"
                    }
                }
            },
            required: [
                "metadata"
            ],
            title: "Type"
                    }
                }
            }
        }`
    }
];

describe("openApiSchema plugin", () => {
    it.each(cases)(`must create schema for $title`, async ({ type, schema, title, pluginOptions, expectError, isArrayTest, arrayTypes }) => {
        const needsTags = type.includes("tags.");
        
        // All tests now use tuple syntax
        const types = arrayTypes || ['Type'];
        const code = `
            ${needsTags ? 'import * as tags from "../../tags/index";' : ''}
            import { createOpenApiSchema } from "../../openApiSchema/index";
            ${type}
            export const schema = createOpenApiSchema<[${types.join(', ')}]>();
        `;

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

