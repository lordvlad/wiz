# Using the IR Layer: Practical Guide

## For New Feature Development

### Adding a New Output Format (e.g., JSON Schema)

```typescript
// 1. Create converter: src/ir/converters/jsonschema-to-ir.ts
// 3. Create wrapper: src/plugin/jsonschema/codegen-ir.ts
import { typeToIr } from "../../ir/converters/ts-to-ir";
import { irToJsonSchema } from "../../ir/generators/ir-to-jsonschema";
import type { IRSchema, IRType } from "../types";
// 2. Create generator: src/ir/generators/ir-to-jsonschema.ts
import type { IRSchema } from "../types";
// 4. Use in CLI or generator
import { createJsonSchemaViaIr } from "./plugin/jsonschema/codegen-ir";

export function jsonSchemaToIr(schema: any): IRSchema {
    // Convert JSON Schema to IR
    // ~200-300 lines
}

export function irToJsonSchema(schema: IRSchema): any {
    // Convert IR to JSON Schema
    // ~200-300 lines
}

export function createJsonSchemaViaIr(type: Type): any {
    const irType = typeToIr(type);
    return irToJsonSchema({ types: [{ name: "Root", type: irType }] });
}

const schema = createJsonSchemaViaIr(tsType);
```

### Using IR in CLI Commands

```typescript
// src/cli/my-command.ts
import { typeToIr } from "../ir/converters/ts-to-ir";
import { irToOpenApiSchemas } from "../ir/generators/ir-to-openapi";
import { irToTypeScript } from "../ir/generators/ir-to-ts";

export async function myCommand(inputFile: string, outputFile: string) {
    // 1. Parse input
    const project = new Project();
    const sourceFile = project.addSourceFileAtPath(inputFile);
    const type = sourceFile.getTypeAlias("MyType").getType();

    // 2. Convert to IR
    const irType = typeToIr(type, { availableTypes: new Set(["MyType"]) });

    // 3. Generate output
    const openapi = irToOpenApiSchemas({ types: [{ name: "MyType", type: irType }] });

    // 4. Write to file
    await writeFile(outputFile, JSON.stringify(openapi, null, 2));
}
```

### Building Custom Transformations

```typescript
import { openApiSchemasToIr } from "../ir/converters/openapi-to-ir";
import { typeToIr } from "../ir/converters/ts-to-ir";
import { irToTypeScript } from "../ir/generators/ir-to-ts";

// TypeScript → OpenAPI → TypeScript (roundtrip)
async function roundtrip(tsType: Type) {
    // TS → IR
    const ir1 = typeToIr(tsType);

    // IR → OpenAPI
    const openapi = irToOpenApiSchemas({ types: [{ name: "T", type: ir1 }] });

    // OpenAPI → IR
    const ir2 = openApiSchemasToIr(openapi);

    // IR → TS
    const tsCode = irToTypeScript(ir2);

    return tsCode.get("T");
}
```

## For Generator Modules

### Update Existing Generators

```typescript
// Before (src/generator/openapi.ts)
export function generateModelsFromOpenApi(spec: OpenApiSpec): Map<string, string> {
    // Direct conversion logic
    // ~500 lines of complex code
}

// After (src/generator/openapi.ts)
import { generateModelsFromOpenApiViaIr } from "./openapi-ir";

export function generateModelsFromOpenApi(spec: OpenApiSpec): Map<string, string> {
    // Use IR wrapper
    return generateModelsFromOpenApiViaIr(spec.components?.schemas || {});
}

// The wrapper (src/generator/openapi-ir.ts) already exists!
```

## For Testing

### Test IR Conversions

```typescript
import { describe, expect, it } from "bun:test";

import { typeToIr } from "../ir/converters/ts-to-ir";
import { irToOpenApiSchemas } from "../ir/generators/ir-to-openapi";

describe("My Feature", () => {
    it("should convert complex type correctly", () => {
        // Create TypeScript type
        const project = new Project({ useInMemoryFileSystem: true });
        const sf = project.createSourceFile(
            "test.ts",
            `
            type User = {
                id: number;
                name: string;
                email?: string;
            };
        `,
        );

        const type = sf.getTypeAlias("User").getType();

        // Convert via IR
        const irType = typeToIr(type);
        const openapi = irToOpenApiSchemas({ types: [{ name: "User", type: irType }] });

        // Verify
        expect(openapi.User.properties.id).toBeDefined();
        expect(openapi.User.required).toContain("id");
        expect(openapi.User.required).not.toContain("email");
    });
});
```

## For Plugin Development

### Option 1: Use IR Wrapper (Recommended for New Plugins)

```typescript
// src/plugin/myformat/transform.ts
import { typeToIr } from "../../ir/converters/ts-to-ir";
import { irToMyFormat } from "../../ir/generators/ir-to-myformat";

export function transformMyFormat(src: SourceFile, context: WizPluginContext): void {
    src.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((call) => {
        if (call.getExpression().getText() === "createMyFormat") {
            const type = call.getTypeArguments()[0]?.getType();
            if (!type) return;

            // Use IR
            const irType = typeToIr(type);
            const output = irToMyFormat({ types: [{ name: "T", type: irType }] });

            // Replace call with output
            call.replaceWithText(JSON.stringify(output));
        }
    });
}
```

### Option 2: Keep Existing Codegen (For Complex AST Manipulation)

```typescript
// Keep using existing codegen if it works well
import { generateMyFormatCode } from "./codegen";

export function transformMyFormat(src: SourceFile, context: WizPluginContext): void {
    // Use existing proven code generation
    // No need to migrate if it works
}
```

## Examples of What's Possible

### 1. Multi-Format Export

```typescript
import { typeToIr } from "../ir/converters/ts-to-ir";
import { irToOpenApiSchemas } from "../ir/generators/ir-to-openapi";
import { irToProtobuf } from "../ir/generators/ir-to-proto";
import { irToTypeScript } from "../ir/generators/ir-to-ts";

// Export TypeScript type to all formats
function exportToAllFormats(tsType: Type) {
    const irType = typeToIr(tsType);
    const schema = { types: [{ name: "MyType", type: irType }] };

    return {
        openapi: irToOpenApiSchemas(schema),
        protobuf: irToProtobuf(schema),
        typescript: irToTypeScript(schema),
    };
}
```

### 2. Format Conversion Service

```typescript
// Service that converts between any supported formats
class FormatConverter {
    async convert(from: string, to: string, input: any): Promise<any> {
        // Convert input to IR
        let irSchema: IRSchema;
        switch (from) {
            case "openapi":
                irSchema = openApiSchemasToIr(input);
                break;
            case "protobuf":
                irSchema = protoToIr(input);
                break;
            // ... add more
        }

        // Convert IR to output
        switch (to) {
            case "openapi":
                return irToOpenApiSchemas(irSchema);
            case "protobuf":
                return irToProtobuf(irSchema);
            case "typescript":
                return irToTypeScript(irSchema);
            // ... add more
        }
    }
}
```

### 3. Schema Validation

```typescript
import { typeToIr } from "../ir/converters/ts-to-ir";
import { irToValidator } from "../ir/generators/ir-to-validator";

// Generate validator from TypeScript type
function createValidatorFromType(tsType: Type): (value: unknown) => boolean {
    const irType = typeToIr(tsType);
    const validatorCode = irToValidator(irType, { throwOnError: false });

    // Evaluate and return validator function
    return eval(`(${validatorCode})`);
}
```

## Best Practices

### DO ✅

- Use IR for new features
- Use IR in CLI commands
- Use IR in generator modules
- Test IR conversions separately
- Document IR usage in your code

### DON'T ❌

- Don't force-migrate working transforms
- Don't change existing tests
- Don't add complexity without benefit
- Don't optimize prematurely

## Migration Checklist

For each new feature using IR:

- [ ] Identify input format (TypeScript, OpenAPI, Protobuf)
- [ ] Identify output format (TypeScript, OpenAPI, Protobuf, Validator, JSON)
- [ ] Use appropriate converter (X-to-ir.ts)
- [ ] Use appropriate generator (ir-to-X.ts)
- [ ] Add tests for conversion
- [ ] Document usage
- [ ] Verify output matches expectations

## Getting Help

- **Documentation**: `src/ir/README.md`
- **Examples**: `src/ir/USAGE_EXAMPLES.ts`
- **Tests**: `src/__test__/ir-*.test.ts`
- **Wrappers**: `src/plugin/*/codegen-ir.ts` and `src/generator/*-ir.ts`

## Summary

The IR layer is ready for production use. Use it for:

- ✅ All new features
- ✅ CLI commands
- ✅ Generator modules
- ✅ Custom transformations
- ✅ Multi-format support

The architecture is solid, tested, and documented. Build confidently on this foundation!
