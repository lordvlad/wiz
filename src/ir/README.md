# Intermediate Representation (IR) Layer

## Overview

The IR layer provides a unified type system that sits between all input and output formats in Wiz. This enables consistent transformations and makes it easier to add support for new formats.

## Architecture

```
Input Formats          IR Layer          Output Formats
─────────────         ─────────         ──────────────
TypeScript AST   →                  →   OpenAPI Schema
OpenAPI Schema   →    Common IR    →   Protobuf Schema
Protobuf Schema  →                  →   TypeScript Types
                                    →   Validators
                                    →   JSON Serializers
```

## Core Concepts

### IRType

The fundamental building block is `IRType`, which represents any type in the system:

- **Primitives**: `string`, `number`, `integer`, `boolean`, `null`, etc.
- **Literals**: Specific values like `"foo"`, `42`, `true`
- **Arrays**: Lists of items
- **Objects**: Key-value structures with typed properties
- **References**: Named type references (for circular types)
- **Unions**: One of several types (`A | B | C`)
- **Intersections**: Combination of types (`A & B & C`)
- **Maps**: Dynamic key-value mappings (`Record<string, T>`)
- **Enums**: Fixed set of values

### Metadata

Every IR node can have metadata:

- `description`: Human-readable documentation
- `deprecated`: Deprecation notice
- `examples`: Example values
- `default`: Default value
- `extensions`: Custom metadata

### Constraints

Validation constraints can be attached to types:

- Number: `minimum`, `maximum`, `multipleOf`
- String: `minLength`, `maxLength`, `pattern`
- Array: `minItems`, `maxItems`, `uniqueItems`
- Object: `minProperties`, `maxProperties`

## Directory Structure

```
src/ir/
├── types.ts              # Core IR type definitions
├── utils.ts              # Utility functions for creating IR nodes
├── converters/           # Input → IR converters
│   ├── ts-to-ir.ts      # TypeScript AST → IR
│   ├── openapi-to-ir.ts # OpenAPI → IR
│   └── proto-to-ir.ts   # Protobuf → IR
├── generators/           # IR → Output generators
│   ├── ir-to-openapi.ts # IR → OpenAPI
│   ├── ir-to-proto.ts   # IR → Protobuf
│   ├── ir-to-ts.ts      # IR → TypeScript
│   ├── ir-to-validator.ts # IR → Validators
│   └── ir-to-json.ts    # IR → JSON serializers
└── USAGE_EXAMPLES.ts     # Integration examples
```

## Usage

### Converting TypeScript to IR

```typescript
import { Type } from "ts-morph";

import { typeToIr, namedTypeToIrDefinition } from "./ir/converters/ts-to-ir";

// Convert a single type
const irType = typeToIr(tsType, {
    availableTypes: new Set(["User", "Post"]),
    coerceSymbolsToStrings: false,
});

// Convert a named type with full metadata
const typeDef = namedTypeToIrDefinition("User", tsType, {
    availableTypes: new Set(["User", "Post"]),
});
```

### Generating OpenAPI from IR

```typescript
import { irToOpenApiSchemas } from "./ir/generators/ir-to-openapi";

const schemas = irToOpenApiSchemas(
    {
        types: [
            { name: "User", type: userIrType },
            { name: "Post", type: postIrType },
        ],
    },
    {
        version: "3.0",
        unionStyle: "oneOf",
    },
);
```

### Generating TypeScript from IR

```typescript
import { irToTypeScript } from "./ir/generators/ir-to-ts";

const typeScriptCode = irToTypeScript({
    types: [
        { name: "User", type: userIrType },
        { name: "Post", type: postIrType },
    ],
});

// Returns a Map<string, string> of type name → TypeScript code
const userCode = typeScriptCode.get("User");
```

### Creating IR Types Manually

```typescript
import { createObject, createPrimitive, createArray } from "./ir/utils";

const userType = createObject([
    {
        name: "id",
        type: createPrimitive("number"),
        required: true,
    },
    {
        name: "name",
        type: createPrimitive("string"),
        required: true,
        metadata: { description: "User's full name" },
    },
    {
        name: "tags",
        type: createArray(createPrimitive("string")),
        required: false,
    },
]);
```

## Integration Wrappers

For backward compatibility and gradual migration, wrapper modules are provided:

- `plugin/openApiSchema/codegen-ir.ts` - OpenAPI schema generation
- `plugin/protobuf/codegen-ir.ts` - Protobuf generation
- `plugin/validator/codegen-ir.ts` - Validator generation
- `plugin/json/codegen-ir.ts` - JSON serializer generation
- `generator/openapi-ir.ts` - OpenAPI → TypeScript
- `generator/protobuf-ir.ts` - Protobuf → TypeScript

These provide drop-in replacements for existing functions.

## Benefits

1. **Consistency**: All transformations go through the same type representation
2. **Maintainability**: Single source of truth for type conversions
3. **Extensibility**: Easy to add new input/output formats
4. **Type Safety**: Catch errors early in the IR layer
5. **Testability**: Can test conversions independently
6. **Lossless**: Preserves metadata through transformations

## Adding New Formats

To add support for a new format:

1. **Create a converter** (if it's an input format):
    - `src/ir/converters/myformat-to-ir.ts`
    - Implement conversion from format to IR

2. **Create a generator** (if it's an output format):
    - `src/ir/generators/ir-to-myformat.ts`
    - Implement conversion from IR to format

3. **Add integration wrappers** (optional):
    - For plugin transforms
    - For CLI commands

4. **Write tests**:
    - Unit tests for converter/generator
    - Integration tests for roundtrips

## Migration Guide

### For Plugin Developers

Old approach:

```typescript
import { createOpenApiSchema } from "../plugin/openApiSchema/codegen";

const schema = createOpenApiSchema(type, context);
```

New approach:

```typescript
import { createOpenApiSchemaViaIr } from "../plugin/openApiSchema/codegen-ir";

const schema = createOpenApiSchemaViaIr(type, context);
```

### For Generator Developers

Old approach:

```typescript
import { generateModelsFromOpenApi } from "../generator/openapi";

const models = generateModelsFromOpenApi(spec);
```

New approach:

```typescript
import { generateModelsFromOpenApiViaIr } from "../generator/openapi-ir";

const models = generateModelsFromOpenApiViaIr(schemas);
```

## Future Work

- Add support for more formats (Avro, JSON Schema, GraphQL)
- Optimize performance with caching
- Add validation for IR structure
- Generate IR schemas from examples
- Support for generic types with type parameters
