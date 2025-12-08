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
