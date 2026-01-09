/**
 * IR Integration Examples and Documentation
 *
 * This file demonstrates how to use the IR layer for various transformations.
 */

// Example 1: TypeScript to OpenAPI via IR
// ========================================
//
// Old approach (direct):
// import { createOpenApiSchema } from "../plugin/openApiSchema/codegen";
// const schema = createOpenApiSchema(type, context);
//
// New approach (via IR):
// import { createOpenApiSchemaViaIr } from "../plugin/openApiSchema/codegen-ir";
// const schema = createOpenApiSchemaViaIr(type, context);
//
// The IR approach provides:
// - Consistent type handling across all transformations
// - Better maintainability (single source of truth for type conversions)
// - Easier to add new input/output formats
// - Type safety through the IR layer

// Example 2: OpenAPI to TypeScript via IR
// ========================================
//
// Old approach:
// import { generateModelsFromOpenApi } from "../generator/openapi";
// const models = generateModelsFromOpenApi(spec);
//
// New approach (via IR):
// import { generateModelsFromOpenApiViaIr } from "../generator/openapi-ir";
// const models = generateModelsFromOpenApiViaIr(schemas);
//
// Benefits:
// - Unified type representation
// - Consistent metadata handling
// - Easier to test (can test IR conversion separately)

// Example 3: Full roundtrip via IR
// =================================
//
// TypeScript → IR → OpenAPI → IR → TypeScript
//
// import { typeToIr } from "../ir/converters/ts-to-ir";
// import { irToOpenApiSchemas } from "../ir/generators/ir-to-openapi";
// import { openApiSchemasToIr } from "../ir/converters/openapi-to-ir";
// import { irToTypeScript } from "../ir/generators/ir-to-ts";
//
// const ir1 = typeToIr(originalType);
// const openapi = irToOpenApiSchemas({ types: [{ name: "MyType", type: ir1 }] });
// const ir2 = openApiSchemasToIr(openapi);
// const typescript = irToTypeScript(ir2);
//
// This enables lossless transformations where possible

// Example 4: Adding a new transformation
// =======================================
//
// To add support for a new format (e.g., JSON Schema, Avro):
//
// 1. Create a converter: src/ir/converters/jsonschema-to-ir.ts
//    - Convert JSON Schema to IR types
//
// 2. Create a generator: src/ir/generators/ir-to-jsonschema.ts
//    - Convert IR types to JSON Schema
//
// 3. Create integration wrappers if needed
//    - For CLI commands
//    - For plugin transforms
//
// 4. Add tests
//    - Unit tests for converter/generator
//    - Integration tests for roundtrips
//
// The IR layer handles all the type complexity for you!

export {};
