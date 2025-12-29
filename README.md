# wiz

A general-purpose wizard to generate all sorts of schemas from typescript types

- JSON Schemas
- Openapi Schemas
- optimized JSON reader and writer
- validators
- protobuf Schemas
- avro Schemas
- REST and RPC client and server stubs
- Pluggable to produce custom codecs

## Installation

To install dependencies:

```bash
bun install
```

## CLI Usage

Wiz provides a command-line interface for generating OpenAPI specifications and inlining validators.

### OpenAPI Generation

Generate OpenAPI specifications from TypeScript files containing `createOpenApi` calls or exported types:

```bash
# Generate from directory (YAML output by default)
wiz openapi src/

# Generate with JSON output
wiz openapi src/types.ts --format json

# Generate from multiple sources
wiz openapi src/models/ src/api.ts

# Generate from glob pattern
wiz openapi "src/**/*.ts"
```

#### How it works:
1. First, wiz looks for `createOpenApi` calls in your files and executes them
2. If no `createOpenApi` calls are found, it generates schemas from all exported types
3. Metadata from the nearest `package.json` is used to populate the `info` section

### Validator Inlining

Transform validator function calls to inline implementations:

```bash
# Transform files from src/ to dist/
wiz inline src/ --outdir dist/

# Transform specific file
wiz inline src/validators.ts --outdir dist/

# Transform using glob pattern
wiz inline "src/**/*.ts" --outdir dist/
```

The inline command transforms validator calls (`createValidator`, `is`, `assert`, etc.) into optimized inline implementations, preserving the directory structure in the output.

## OpenAPI Schema Generation

Wiz can automatically generate OpenAPI schemas from TypeScript types using the Bun plugin system.

### Usage

Generate OpenAPI schemas with a `components.schemas` structure by passing types as a tuple:

```typescript
import { createOpenApiSchema } from "wiz/openApiSchema";

type User = {
    id: number;
    name: string;
    email: string;
};

type Product = {
    sku: string;
    name: string;
    price: number;
};

// Generate components.schemas for multiple types (OpenAPI 3.0)
export const schema = createOpenApiSchema<[User, Product], "3.0">();

// Or for a single type (still requires tuple syntax)
export const userSchema = createOpenApiSchema<[User], "3.0">();

// Generate OpenAPI 3.1 schemas
export const schema31 = createOpenApiSchema<[User, Product], "3.1">();
```

### Full OpenAPI Specification Generation

In addition to generating just the schemas, Wiz can also generate complete OpenAPI specification documents with additional metadata such as info, servers, tags, security, and more using the `createOpenApi` function.

```typescript
import { createOpenApi } from "wiz/openApiSchema";

type User = {
    id: number;
    name: string;
    email: string;
};

type Post = {
    id: number;
    title: string;
    content: string;
    authorId: number;
};

// Generate a full OpenAPI specification
export const spec = createOpenApi<[User, Post], "3.0">({
    info: {
        title: "My API",
        description: "A comprehensive API for users and posts",
        version: "1.0.0",
    },
    servers: [
        {
            url: "https://api.example.com/v1",
            description: "Production server",
        },
        {
            url: "https://staging.example.com/v1",
            description: "Staging server",
        },
    ],
    tags: [
        {
            name: "users",
            description: "User management operations",
        },
        {
            name: "posts",
            description: "Post management operations",
        },
    ],
    security: [
        {
            bearerAuth: [],
        },
    ],
    externalDocs: {
        description: "Find more info here",
        url: "https://docs.example.com",
    },
});
```

This generates a complete OpenAPI specification:

```json
{
    "openapi": "3.0.3",
    "info": {
        "title": "My API",
        "description": "A comprehensive API for users and posts",
        "version": "1.0.0"
    },
    "servers": [
        {
            "url": "https://api.example.com/v1",
            "description": "Production server"
        },
        {
            "url": "https://staging.example.com/v1",
            "description": "Staging server"
        }
    ],
    "components": {
        "schemas": {
            "User": {
                "type": "object",
                "properties": {
                    "id": { "type": "number" },
                    "name": { "type": "string" },
                    "email": { "type": "string" }
                },
                "required": ["id", "name", "email"],
                "title": "User"
            },
            "Post": {
                "type": "object",
                "properties": {
                    "id": { "type": "number" },
                    "title": { "type": "string" },
                    "content": { "type": "string" },
                    "authorId": { "type": "number" }
                },
                "required": ["id", "title", "content", "authorId"],
                "title": "Post"
            }
        }
    },
    "paths": {},
    "tags": [
        {
            "name": "users",
            "description": "User management operations"
        },
        {
            "name": "posts",
            "description": "Post management operations"
        }
    ],
    "security": [
        {
            "bearerAuth": []
        }
    ],
    "externalDocs": {
        "description": "Find more info here",
        "url": "https://docs.example.com"
    }
}
```

#### Configuration Options

The `createOpenApi` function accepts an optional configuration object with the following fields:

- **`info`** (required in output, defaults to `{ title: "API", version: "1.0.0" }`): API metadata
    - `title`: The title of the API
    - `description`: A description of the API
    - `version`: The version of the API
    - `termsOfService`: A URL to the Terms of Service
    - `contact`: Contact information (name, url, email)
    - `license`: License information (name, url)

- **`servers`** (optional): Array of server objects
    - `url`: Server URL
    - `description`: Server description
    - `variables`: Server variables for templating

- **`tags`** (optional): Array of tags for grouping operations
    - `name`: Tag name
    - `description`: Tag description
    - `externalDocs`: External documentation reference

- **`security`** (optional): Array of security requirements
    - Each item is an object with security scheme names as keys

- **`externalDocs`** (optional): External documentation reference
    - `description`: Description text
    - `url`: Documentation URL

**Note:** The `components` field is managed automatically by Wiz. The `components.schemas` are generated from the type parameters.

#### Typed Path Builder API

The `createOpenApi` function also supports a callback-based API that allows you to define typed paths with a fluent path builder interface:

```typescript
import { createOpenApi } from "wiz/openApiSchema";

type User = {
    id: number;
    name: string;
    email: string;
};

type Post = {
    id: number;
    title: string;
    content: string;
};

export const spec = createOpenApi<[User, Post], "3.0">((path) => ({
    info: {
        title: "My API",
        description: "API with typed paths",
        version: "1.0.0",
    },
    servers: [
        {
            url: "https://api.example.com",
        },
    ],
    tags: [
        {
            name: "users",
            description: "User operations",
        },
        {
            name: "posts",
            description: "Post operations",
        },
    ],
    paths: [
        // Type arguments: PathParams, QueryParams, RequestBody, ResponseBody
        path.get<{ id: number }, never, never, User>("/users/:id"),
        path.get<never, { username?: string }, never, User[]>("/users"),
        path.post<never, never, User, User>("/users"),
        path.get<{ id: number }, never, never, Post>("/posts/:id"),
        path.post<never, never, Post, Post>("/posts"),
    ],
}));
```

The path builder provides methods for all HTTP verbs:

- `path.get<PathParams, QueryParams, RequestBody, ResponseBody>(path: string)`
- `path.post<PathParams, QueryParams, RequestBody, ResponseBody>(path: string)`
- `path.put<PathParams, QueryParams, RequestBody, ResponseBody>(path: string)`
- `path.patch<PathParams, QueryParams, RequestBody, ResponseBody>(path: string)`
- `path.delete<PathParams, QueryParams, RequestBody, ResponseBody>(path: string)`
- `path.head<PathParams, QueryParams, RequestBody, ResponseBody>(path: string)`
- `path.options<PathParams, QueryParams, RequestBody, ResponseBody>(path: string)`
- `path.trace<PathParams, QueryParams, RequestBody, ResponseBody>(path: string)`

Each method accepts type parameters for:

1. **PathParams**: Path parameter types (e.g., `{ id: number }` for `/users/:id`)
2. **QueryParams**: Query parameter types (e.g., `{ search?: string }`)
3. **RequestBody**: Request body type for methods that accept a body
4. **ResponseBody**: Response body type

This generates OpenAPI paths with the specified operations:

```json
{
    "paths": {
        "/users/:id": {
            "get": {
                "responses": {
                    "200": {
                        "description": "Successful response"
                    }
                }
            }
        },
        "/users": {
            "get": {
                "responses": {
                    "200": {
                        "description": "Successful response"
                    }
                }
            },
            "post": {
                "responses": {
                    "200": {
                        "description": "Successful response"
                    }
                }
            }
        }
    }
}
```

#### OpenAPI Version Support

Wiz supports both **OpenAPI 3.0** and **OpenAPI 3.1** specifications. The version is specified as a required parameter to `createOpenApiSchema()`.

**Key Differences:**

- **OpenAPI 3.0**:
    - Uses `nullable: true` property for nullable types
    - Example: `{ type: "string", nullable: true }`

- **OpenAPI 3.1**:
    - Uses type arrays for nullable types: `type: ["string", "null"]`
    - Fully compatible with JSON Schema Draft 2020-12
    - For union types with null (oneOf/anyOf), adds `{ type: "null" }` to the array

**Example - Nullable Properties:**

```typescript
type User = {
    name: string | null;
    age: number | null;
};

// OpenAPI 3.0
export const schema30 = createOpenApiSchema<[User], "3.0">();
// Generates: { type: "string", nullable: true }

// OpenAPI 3.1
export const schema31 = createOpenApiSchema<[User], "3.1">();
// Generates: { type: ["string", "null"] }
```

**OpenAPI 3.0 Output:**

```json
{
    "components": {
        "schemas": {
            "User": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "nullable": true
                    },
                    "age": {
                        "type": "number",
                        "nullable": true
                    }
                },
                "required": ["name", "age"],
                "title": "User"
            }
        }
    }
}
```

**OpenAPI 3.1 Output:**

```json
{
    "components": {
        "schemas": {
            "User": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": ["string", "null"]
                    },
                    "age": {
                        "type": ["number", "null"]
                    }
                },
                "required": ["name", "age"],
                "title": "User"
            }
        }
    }
}
```

**Example - Nullable Unions (oneOf/anyOf):**

```typescript
type Data = {
    value: string | number | null;
};

// OpenAPI 3.0
export const schema30 = createOpenApiSchema<[Data], "3.0">();
// Generates: { oneOf: [...], nullable: true }

// OpenAPI 3.1
export const schema31 = createOpenApiSchema<[Data], "3.1">();
// Generates: { oneOf: [..., { type: "null" }] }
```

This generates an OpenAPI schema with a `components.schemas` structure:

```json
{
    "components": {
        "schemas": {
            "User": {
                "type": "object",
                "properties": {
                    "id": { "type": "number" },
                    "name": { "type": "string" },
                    "email": { "type": "string" }
                },
                "title": "User",
                "required": ["id", "name", "email"]
            },
            "Product": {
                "type": "object",
                "properties": {
                    "sku": { "type": "string" },
                    "name": { "type": "string" },
                    "price": { "type": "number" }
                },
                "title": "Product",
                "required": ["sku", "name", "price"]
            }
        }
    }
}
```

### Type References with $ref

When a type references another type that's included in the schema, Wiz automatically generates `$ref` references instead of inlining the schema. This creates cleaner, more maintainable schemas and properly handles circular references.

```typescript
type Author = {
    id: number;
    name: string;
};

type Post = {
    title: string;
    content: string;
    author: Author; // References Author type
};

export const schema = createOpenApiSchema<[Author, Post], "3.0">();
```

This generates:

```json
{
    "components": {
        "schemas": {
            "Author": {
                "type": "object",
                "properties": {
                    "id": { "type": "number" },
                    "name": { "type": "string" }
                },
                "required": ["id", "name"],
                "title": "Author"
            },
            "Post": {
                "type": "object",
                "properties": {
                    "title": { "type": "string" },
                    "content": { "type": "string" },
                    "author": {
                        "$ref": "#/components/schemas/Author"
                    }
                },
                "required": ["title", "content", "author"],
                "title": "Post"
            }
        }
    }
}
```

#### $ref Features

- **Direct references**: Properties that reference other types in the schema use `$ref`
- **Array references**: Arrays of referenced types use `$ref` in the `items` field
- **Optional references**: Optional properties still use `$ref` (the optionality is handled by the `required` array)
- **Circular references**: Self-referencing types are automatically handled with `$ref` to prevent infinite recursion
- **Inline types**: Anonymous object types that aren't in the schema are still inlined

**Example with arrays:**

```typescript
type Tag = {
    id: number;
    name: string;
};

type Article = {
    title: string;
    tags: Tag[]; // Array of Tag references
};

export const schema = createOpenApiSchema<[Tag, Article], "3.0">();
```

Generates:

```json
{
    "components": {
        "schemas": {
            "Tag": {
                /* ... */
            },
            "Article": {
                "type": "object",
                "properties": {
                    "title": { "type": "string" },
                    "tags": {
                        "type": "array",
                        "items": {
                            "$ref": "#/components/schemas/Tag"
                        }
                    }
                },
                "required": ["title", "tags"],
                "title": "Article"
            }
        }
    }
}
```

**Example with circular references:**

```typescript
type Node = {
    value: string;
    next?: Node; // Self-reference
};

export const schema = createOpenApiSchema<[Node], "3.0">();
```

Generates:

```json
{
    "components": {
        "schemas": {
            "Node": {
                "type": "object",
                "properties": {
                    "value": { "type": "string" },
                    "next": {
                        "$ref": "#/components/schemas/Node"
                    }
                },
                "required": ["value"],
                "title": "Node"
            }
        }
    }
}
```

### Polymorphism and Union Types (oneOf, anyOf, allOf)

Wiz supports TypeScript union types and intersection types, mapping them to OpenAPI's `oneOf`, `anyOf`, and `allOf` constructs for polymorphic schemas.

#### Union Types (oneOf)

TypeScript union types are represented using `oneOf` in the generated schema:

```typescript
type Circle = {
    kind: "circle";
    radius: number;
};

type Square = {
    kind: "square";
    side: number;
};

type Shape = Circle | Square;

type Drawing = {
    shape: Shape;
};

export const schema = createOpenApiSchema<[Drawing], "3.0">();
```

Generates:

```json
{
    "components": {
        "schemas": {
            "Drawing": {
                "type": "object",
                "properties": {
                    "shape": {
                        "oneOf": [
                            {
                                "type": "object",
                                "properties": {
                                    "kind": { "type": "string", "enum": ["circle"] },
                                    "radius": { "type": "number" }
                                },
                                "required": ["kind", "radius"]
                            },
                            {
                                "type": "object",
                                "properties": {
                                    "kind": { "type": "string", "enum": ["square"] },
                                    "side": { "type": "number" }
                                },
                                "required": ["kind", "side"]
                            }
                        ]
                    }
                },
                "required": ["shape"],
                "title": "Drawing"
            }
        }
    }
}
```

**Union types with named types use $ref:**

```typescript
type Dog = {
    breed: string;
    bark: boolean;
};

type Cat = {
    breed: string;
    meow: boolean;
};

type Pet = Dog | Cat;

type Owner = {
    pet: Pet;
};

export const schema = createOpenApiSchema<[Owner, Dog, Cat], "3.0">();
```

Generates schemas with `$ref` in the `oneOf`:

```json
{
    "components": {
        "schemas": {
            "Owner": {
                "type": "object",
                "properties": {
                    "pet": {
                        "oneOf": [{ "$ref": "#/components/schemas/Dog" }, { "$ref": "#/components/schemas/Cat" }]
                    }
                }
            },
            "Dog": {
                /* ... */
            },
            "Cat": {
                /* ... */
            }
        }
    }
}
```

**Mixed type unions:**

```typescript
type Value = string | number | boolean;

type Config = {
    value: Value;
};
```

Generates a `oneOf` with primitive types:

```json
{
    "properties": {
        "value": {
            "oneOf": [{ "type": "string" }, { "type": "number" }, { "type": "boolean" }]
        }
    }
}
```

#### Union Types with anyOf

By default, Wiz generates `oneOf` for union types, which requires that a value validates against exactly one schema. However, you can configure the plugin to use `anyOf` instead, which is more permissive and allows a value to validate against one or more schemas.

**When to use `anyOf` vs `oneOf`:**

- **`oneOf`** (default): Stricter validation - the value must match exactly one schema. Use when schemas are mutually exclusive.
- **`anyOf`**: More lenient validation - the value can match one or more schemas. Use when schemas may overlap or when you need more flexible validation.

**Configuring the plugin to use `anyOf`:**

```typescript
import wizPlugin from "wiz/plugin";

Bun.build({
    entrypoints: ["./src/index.ts"],
    plugins: [
        wizPlugin({
            unionStyle: "anyOf", // Use anyOf instead of oneOf for union types
        }),
    ],
});
```

**Example with `anyOf`:**

```typescript
type Circle = {
    kind: "circle";
    radius: number;
};

type Square = {
    kind: "square";
    side: number;
};

type Shape = Circle | Square;

type Drawing = {
    shape: Shape;
};

export const schema = createOpenApiSchema<[Drawing], "3.0">();
```

With `unionStyle: "anyOf"`, this generates:

```json
{
    "components": {
        "schemas": {
            "Drawing": {
                "type": "object",
                "properties": {
                    "shape": {
                        "anyOf": [
                            {
                                "type": "object",
                                "properties": {
                                    "kind": { "type": "string", "enum": ["circle"] },
                                    "radius": { "type": "number" }
                                },
                                "required": ["kind", "radius"]
                            },
                            {
                                "type": "object",
                                "properties": {
                                    "kind": { "type": "string", "enum": ["square"] },
                                    "side": { "type": "number" }
                                },
                                "required": ["kind", "side"]
                            }
                        ]
                    }
                },
                "required": ["shape"],
                "title": "Drawing"
            }
        }
    }
}
```

**Note:** The `anyOf` option applies to all union types in your schema. Discriminator properties are still detected and included when using `anyOf`.

#### Intersection Types (allOf)

TypeScript intersection types (`&`) are represented using `allOf` in the generated schema:

```typescript
type Timestamped = {
    createdAt: string;
    updatedAt: string;
};

type Named = {
    name: string;
};

type Entity = Timestamped & Named;

type Record = {
    entity: Entity;
};

export const schema = createOpenApiSchema<[Record], "3.0">();
```

Generates:

```json
{
    "components": {
        "schemas": {
            "Record": {
                "type": "object",
                "properties": {
                    "entity": {
                        "allOf": [
                            {
                                "type": "object",
                                "properties": {
                                    "createdAt": { "type": "string" },
                                    "updatedAt": { "type": "string" }
                                },
                                "required": ["createdAt", "updatedAt"]
                            },
                            {
                                "type": "object",
                                "properties": {
                                    "name": { "type": "string" }
                                },
                                "required": ["name"]
                            }
                        ]
                    }
                }
            }
        }
    }
}
```

#### Special Cases

**Nullable properties**: Properties that can be `null` are marked with `nullable: true` in the OpenAPI schema:

```typescript
type User = {
    name: string | null;
    email: string;
};
```

Generates:

```json
{
    "type": "object",
    "properties": {
        "name": {
            "type": "string",
            "nullable": true
        },
        "email": {
            "type": "string"
        }
    },
    "required": ["name", "email"]
}
```

**Important distinctions:**

- `field: string | null` - Required field that can be null (includes `nullable: true`, in `required` array)
- `field?: string` - Optional field (NOT in `required` array, NO `nullable: true`)
- `field?: string | null` - Optional field that can also be null (NOT in `required` array, includes `nullable: true`)

**Nullable unions**: `null` and `undefined` are automatically filtered from unions, and `nullable: true` is added when `null` is present:

```typescript
type Value = string | number | null;
```

Generates:

```json
{
    "oneOf": [{ "type": "string" }, { "type": "number" }],
    "nullable": true
}
```

**Nullable references**: Types that reference other schemas can also be nullable:

```typescript
type Author = {
    id: number;
    name: string;
};

type Post = {
    author: Author | null;
};
```

Generates:

```json
{
    "properties": {
        "author": {
            "$ref": "#/components/schemas/Author",
            "nullable": true
        }
    }
}
```

**Boolean expansion**: TypeScript expands `boolean` to `true | false` in unions. Wiz automatically collapses these back to a single `boolean` type:

```typescript
type Value = string | number | boolean;
```

Generates `oneOf` with `string`, `number`, and `boolean` (not four separate types).

**Union of arrays:**

```typescript
type Items = string[] | number[];
```

Generates:

```json
{
    "oneOf": [
        { "type": "array", "items": { "type": "string" } },
        { "type": "array", "items": { "type": "number" } }
    ]
}
```

#### Discriminator Support

Wiz automatically detects and generates discriminator metadata for union types when all members share a common property with distinct literal values. This is particularly useful for polymorphic types where a "type" or "kind" field determines the structure.

**Automatic Detection:**

```typescript
type Circle = {
    kind: "circle"; // discriminator property
    radius: number;
};

type Square = {
    kind: "square"; // discriminator property
    side: number;
};

type Shape = Circle | Square;

type Drawing = {
    shape: Shape;
};

export const schema = createOpenApiSchema<[Drawing], "3.0">();
```

Generates:

```json
{
  "components": {
    "schemas": {
      "Drawing": {
        "type": "object",
        "properties": {
          "shape": {
            "oneOf": [...],
            "discriminator": {
              "propertyName": "kind"
            }
          }
        }
      }
    }
  }
}
```

**With Mapping (Named Types):**

When union members are named types included in the schema, Wiz generates a full discriminator with mapping:

```typescript
type Dog = {
    petType: "dog";
    breed: string;
    bark: boolean;
};

type Cat = {
    petType: "cat";
    breed: string;
    meow: boolean;
};

type Pet = Dog | Cat;

export const schema = createOpenApiSchema<[Pet, Dog, Cat], "3.0">();
```

Generates:

```json
{
    "components": {
        "schemas": {
            "Pet": {
                "oneOf": [{ "$ref": "#/components/schemas/Dog" }, { "$ref": "#/components/schemas/Cat" }],
                "discriminator": {
                    "propertyName": "petType",
                    "mapping": {
                        "dog": "#/components/schemas/Dog",
                        "cat": "#/components/schemas/Cat"
                    }
                }
            }
        }
    }
}
```

**Requirements for Discriminator Detection:**

1. All union members must be object types
2. All members must share a common property name
3. The common property must have distinct literal values (string or number)
4. For `mapping` generation: all types must be named and included in `availableTypes`

### JSDoc Annotations

Wiz supports JSDoc comments to enrich your OpenAPI schemas with additional metadata and constraints. This allows you to maintain documentation and validation rules close to your type definitions.

#### Supported JSDoc Tags

##### `@description` - Add descriptions to properties

```typescript
type User = {
    /**
     * Unique identifier for the user
     */
    id: number;

    /**
     * @description The user's email address
     */
    email: string;
};
```

Generated schema:

```json
{
    "type": "object",
    "properties": {
        "id": {
            "type": "number",
            "description": "Unique identifier for the user"
        },
        "email": {
            "type": "string",
            "description": "The user's email address"
        }
    }
}
```

##### `@default` - Specify default values

```typescript
type Config = {
    /**
     * @default "guest"
     */
    role: string;

    /**
     * @default 100
     */
    maxConnections: number;

    /**
     * @default true
     */
    enabled: boolean;
};
```

##### `@example` - Provide example values

```typescript
type User = {
    /**
     * @example "john.doe@example.com"
     */
    email: string;
};
```

##### `@deprecated` - Mark fields as deprecated

```typescript
type User = {
    /** @deprecated Use email instead */
    username: string;

    email: string;
};
```

##### Validation Constraints

**Number constraints** (`@minimum`, `@maximum`):

```typescript
type Product = {
    /**
     * @minimum 1
     * @maximum 100
     */
    quantity: number;
};
```

**String length constraints** (`@minLength`, `@maxLength`):

```typescript
type User = {
    /**
     * @minLength 3
     * @maxLength 50
     */
    username: string;
};
```

**Pattern constraint** (`@pattern`):

```typescript
type User = {
    /**
     * @pattern ^[a-z0-9]+$
     */
    slug: string;
};
```

**Format constraint** (`@format`):

```typescript
type User = {
    /**
     * @format email
     */
    email: string;
};
```

#### Field Filtering

Use these tags to exclude fields from the generated schema:

- `@private` - Mark fields as private (excluded from schema)
- `@ignore` - Explicitly ignore fields
- `@package` - Mark fields as package-internal (excluded from schema)

```typescript
type User = {
    id: number;
    name: string;

    /** @private Internal use only */
    internalId: string;

    /** @ignore */
    temporaryData: any;

    /** @package */
    packageField: string;
};
```

Generated schema will only include `id` and `name`.

#### Combining Multiple Tags

You can combine multiple JSDoc tags on a single field:

```typescript
type User = {
    /**
     * User's email address
     * @default "user@example.com"
     * @example "john.doe@example.com"
     * @format email
     */
    email: string;
};
```

#### Nested Objects

JSDoc annotations work on nested object properties:

```typescript
type User = {
    profile: {
        /** User's first name */
        firstName: string;

        /** User's last name */
        lastName: string;

        /**
         * @minimum 0
         * @maximum 150
         */
        age: number;
    };
};
```

### Precedence Rules

When both TypeScript type information and JSDoc metadata are present:

1. TypeScript type determines the base schema type (`string`, `number`, `boolean`, etc.)
2. JSDoc annotations add or override specific fields (description, constraints, etc.)
3. JSDoc `@format` does NOT override format inferred from special types (like `Date` → `date-time`)
4. JSDoc constraints are always additive to the schema

### Object Maps and Dynamic Keys (additionalProperties)

Wiz supports TypeScript index signatures and `Record<string, T>` types for object maps with dynamic keys, converting them to OpenAPI's `additionalProperties` keyword. This is useful for dictionaries, lookup tables, and objects with arbitrary string keys.

**Note:** Both `{ [key: string]: T }` index signature syntax and `Record<string, T>` utility type are fully supported and produce identical OpenAPI schemas. Choose whichever syntax you prefer for your TypeScript code.

#### Basic Maps

Map types with primitive values using index signatures or `Record`:

```typescript
// Using index signature syntax
type StringMap = {
    [key: string]: string;
};

// Using Record utility type
type NumberMap = Record<string, number>;

export const schema = createOpenApiSchema<[StringMap, NumberMap], "3.0">();
```

Both syntaxes generate the same OpenAPI schema:

```json
{
    "components": {
        "schemas": {
            "StringMap": {
                "type": "object",
                "additionalProperties": {
                    "type": "string"
                },
                "title": "StringMap"
            },
            "NumberMap": {
                "type": "object",
                "additionalProperties": {
                    "type": "number"
                },
                "title": "NumberMap"
            }
        }
    }
}
```

#### Maps with Complex Values

Index signatures and `Record` types can reference complex types:

```typescript
type User = {
    id: number;
    name: string;
};

// Using index signature
type UserMap = {
    [userId: string]: User;
};

// Or using Record (equivalent)
type UserMapAlt = Record<string, User>;

export const schema = createOpenApiSchema<[UserMap, User], "3.0">();
```

Generates:

```json
{
    "components": {
        "schemas": {
            "UserMap": {
                "type": "object",
                "additionalProperties": {
                    "$ref": "#/components/schemas/User"
                },
                "title": "UserMap"
            },
            "User": {
                "type": "object",
                "properties": {
                    "id": { "type": "number" },
                    "name": { "type": "string" }
                },
                "required": ["id", "name"],
                "title": "User"
            }
        }
    }
}
```

#### Mixed Properties and Maps

You can combine explicit properties with index signatures:

```typescript
type Config = {
    version: number;
    enabled: boolean;
    [key: string]: any;
};

export const schema = createOpenApiSchema<[Config], "3.0">();
```

Generates:

```json
{
    "components": {
        "schemas": {
            "Config": {
                "type": "object",
                "properties": {
                    "version": { "type": "number" },
                    "enabled": { "type": "boolean" }
                },
                "required": ["version", "enabled"],
                "additionalProperties": true,
                "title": "Config"
            }
        }
    }
}
```

**Note:** When the index signature type is `any`, `additionalProperties` is set to `true` to allow any value type.

#### Maps with Union Types

Index signatures support union types for the value:

```typescript
type MixedMap = {
    [key: string]: string | number;
};
```

Generates:

```json
{
    "type": "object",
    "additionalProperties": {
        "oneOf": [{ "type": "string" }, { "type": "number" }]
    }
}
```

#### Nested Maps

Maps can be nested within other object properties:

```typescript
type AppConfig = {
    metadata: {
        [key: string]: string;
    };
};
```

Generates:

```json
{
    "type": "object",
    "properties": {
        "metadata": {
            "type": "object",
            "additionalProperties": {
                "type": "string"
            }
        }
    },
    "required": ["metadata"]
}
```

#### Unions with Maps

Maps can be part of union types, allowing flexible schemas:

```typescript
type Config = {
    // Can be either a primitive or a map
    settings: Record<string, string> | string;
};

type Data = {
    // Can be different map types
    values: Record<string, string> | Record<string, number>;
};
```

Generates `oneOf` schemas:

```json
{
    "properties": {
        "settings": {
            "oneOf": [
                { "type": "string" },
                {
                    "type": "object",
                    "additionalProperties": {
                        "type": "string"
                    }
                }
            ]
        }
    }
}
```

#### Use Cases

Object maps with `additionalProperties` are ideal for:

- **Dictionaries/Lookup Tables**: Key-value stores where keys are dynamic
- **Metadata Objects**: Flexible configuration or metadata with arbitrary keys
- **Translation Maps**: Language codes mapping to translation strings
- **Resource Collections**: IDs mapping to resource objects
- **Settings/Preferences**: User-specific settings with dynamic keys

## Testing

Run tests:

```bash
bun test
```

Run tests with coverage:

```bash
bun run test:coverage
```

Generate test reports with coverage:

```bash
bun run test:report
```

This project was created using `bun init` in bun v1.3.3. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
