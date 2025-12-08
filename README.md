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

## Usage

To run:

```bash
bun run index.ts
```

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

// Generate components.schemas for multiple types
export const schema = createOpenApiSchema<[User, Product]>();

// Or for a single type (still requires tuple syntax)
export const userSchema = createOpenApiSchema<[User]>();
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
    author: Author;  // References Author type
};

export const schema = createOpenApiSchema<[Author, Post]>();
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
    tags: Tag[];  // Array of Tag references
};

export const schema = createOpenApiSchema<[Tag, Article]>();
```

Generates:

```json
{
  "components": {
    "schemas": {
      "Tag": { /* ... */ },
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
    next?: Node;  // Self-reference
};

export const schema = createOpenApiSchema<[Node]>();
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

Wiz supports TypeScript union types and intersection types, mapping them to JSON Schema's `oneOf` and `allOf` constructs for polymorphic schemas.

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

export const schema = createOpenApiSchema<[Drawing]>();
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

export const schema = createOpenApiSchema<[Owner, Dog, Cat]>();
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
            "oneOf": [
              { "$ref": "#/components/schemas/Dog" },
              { "$ref": "#/components/schemas/Cat" }
            ]
          }
        }
      },
      "Dog": { /* ... */ },
      "Cat": { /* ... */ }
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
      "oneOf": [
        { "type": "string" },
        { "type": "number" },
        { "type": "boolean" }
      ]
    }
  }
}
```

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

export const schema = createOpenApiSchema<[Record]>();
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

**Nullable unions**: `null` and `undefined` are automatically filtered from unions:

```typescript
type Value = string | number | null;
```

Generates `oneOf` with only `string` and `number`.

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
    kind: "circle";  // discriminator property
    radius: number;
};

type Square = {
    kind: "square";  // discriminator property
    side: number;
};

type Shape = Circle | Square;

type Drawing = {
    shape: Shape;
};

export const schema = createOpenApiSchema<[Drawing]>();
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

export const schema = createOpenApiSchema<[Pet, Dog, Cat]>();
```

Generates:

```json
{
  "components": {
    "schemas": {
      "Pet": {
        "oneOf": [
          { "$ref": "#/components/schemas/Dog" },
          { "$ref": "#/components/schemas/Cat" }
        ],
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

Wiz supports TypeScript index signatures for object maps with dynamic keys, converting them to OpenAPI's `additionalProperties` keyword. This is useful for dictionaries, lookup tables, and objects with arbitrary string keys.

#### Basic Maps

Map types with primitive values:

```typescript
type StringMap = {
    [key: string]: string;
};

type NumberMap = {
    [key: string]: number;
};

export const schema = createOpenApiSchema<[StringMap, NumberMap]>();
```

Generates:

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

Index signatures can reference complex types:

```typescript
type User = {
    id: number;
    name: string;
};

type UserMap = {
    [userId: string]: User;
};

export const schema = createOpenApiSchema<[UserMap, User]>();
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

export const schema = createOpenApiSchema<[Config]>();
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
    "oneOf": [
      { "type": "string" },
      { "type": "number" }
    ]
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
