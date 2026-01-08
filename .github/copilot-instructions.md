# Wiz - GitHub Copilot Instructions

## Project Overview

Wiz is a compile-time schema generation tool that transforms TypeScript types into various schema formats (OpenAPI, Protobuf, JSON Schema, validators) using Bun's plugin system. The core innovation is that schema generation happens at build time through AST transformation, not at runtime.

**Key Principle**: Functions like `createOpenApiSchema<T>()` throw at runtime via `pluginNotEnabled()`. The Bun plugin intercepts these calls during compilation and replaces them with literal schema objects.

## Quick Reference

### Setup & Installation

```bash
# Install Bun (if not already installed)
curl -fsSL https://bun.com/install | bash

# Install project dependencies (requires Bun ≥1.3.3)
bun install
```

### Testing

```bash
bun test                                      # Run all tests
bun test --filter "<case name>"               # Run specific test
bun test src/__test__/<module>.test.ts        # Run specific module's tests
bun run test:coverage                         # Run with coverage
bun run test:report                           # Generate coverage reports (used in CI)
```

**Test files by module**: `openApiSchema.test.ts`, `protobuf.test.ts`, `validator.test.ts`, `json.test.ts`, etc.

### Code Quality

```bash
bun run lint         # Type check with TypeScript
bun run format       # Format code with Prettier
```

**Important**: Always run `bun run lint && bun run format` before committing. Repeat until both exit cleanly.

### CLI Usage

```bash
# Generate OpenAPI spec from TypeScript (outputs to stdout)
wiz openapi src/

# Generate TypeScript models from OpenAPI/Protobuf (outputs to stdout by default)
wiz model spec.yaml
wiz model spec.yaml --outdir src/models  # Optional: write to directory

# Generate API client from OpenAPI (outputs to stdout by default)
wiz client spec.yaml
wiz client spec.yaml --outdir src/client  # Optional: write to directory

# Generate Protobuf spec from TypeScript (outputs to stdout)
wiz protobuf src/

# Inline validators (requires --outdir)
wiz inline src/ --outdir dist/
```

## Technology Stack

- **Runtime**: Bun ≥1.3.3 (JavaScript runtime with native TypeScript support)
- **Language**: TypeScript ^5 with strict mode enabled
- **Build System**: Bun bundler with custom plugin architecture
- **Key Dependencies**: 
  - `ts-morph` ^27.0.2 (TypeScript AST manipulation)
  - `openapi-types` ^12.1.3 (OpenAPI type definitions)
- **Testing**: Bun's built-in test runner
- **Formatting**: Prettier with import sorting

## Architecture

### Core Concepts

1. **Plugin System** (`src/plugin/index.ts`)
   - Registers as a Bun plugin
   - Intercepts `.ts/.tsx` file loading
   - Transforms AST using ts-morph
   - Returns modified source to Bun

2. **Transformation Pipeline**
   - Plugin loads each TypeScript file into a ts-morph `Project`
   - Finds special function calls (e.g., `createOpenApiSchema<T>()`, `createProtobufModel<T>()`, `createValidator<T>()`)
   - Extracts type arguments from these calls
   - Generates schema JSON from type information
   - Replaces function call with literal JSON object

3. **Code Generation**
   - Each feature has its own codegen module (e.g., `plugin/openApiSchema/codegen.ts`, `plugin/protobuf/codegen.ts`, `plugin/validator/codegen.ts`)
   - Codegen interrogates ts-morph `Type` objects
   - Produces JSON schemas compatible with target format
   - Output is pretty-printed with `JSON.stringify(schema, null, 2)`

### Directory Structure

```
src/
├── __test__/              # Integration tests - one test file per module
│   ├── openApiSchema.test.ts   # OpenAPI schema tests
│   ├── protobuf.test.ts        # Protobuf tests
│   ├── validator.test.ts       # Validator tests
│   ├── json.test.ts            # JSON tests
│   └── ...                     # Other module-specific tests
├── cli/                   # CLI commands and argument parsing
├── generator/             # Code generators (OpenAPI client, Protobuf, etc.)
├── plugin/                # Bun plugin and AST transformations
│   ├── openApiSchema/     # OpenAPI schema generation module
│   ├── protobuf/          # Protobuf generation module
│   ├── json/              # JSON utilities module
│   └── validator/         # Validator generation module
├── openApiSchema/         # OpenAPI schema public API (runtime stubs)
├── protobuf/              # Protobuf public API (runtime stubs)
├── validator/             # Validator public API
├── tags/                  # JSDoc tag utilities
├── json/                  # JSON utilities
└── errors.ts              # pluginNotEnabled() sentinel error
```

**Module Structure**: Each major feature (openApiSchema, protobuf, validator, json) follows the same pattern:
- Runtime API in `src/<module>/` (throws `pluginNotEnabled()`)
- Transform/codegen logic in `src/plugin/<module>/`
- Tests in `src/__test__/<module>.test.ts`

### Key Files & Their Roles

- **`src/errors.ts`**: Central `pluginNotEnabled()` helper - throw this when plugin must be active
- **`src/plugin/index.ts`**: Plugin registration and orchestration for all modules
- **`src/plugin/<module>/transform.ts`**: AST pattern matching and node replacement (per module)
- **`src/plugin/<module>/codegen.ts`**: Type-to-schema conversion logic (per module)
- **`src/__test__/utils.ts`**: Test utilities for building with the plugin
- **`tsconfig.json`**: TypeScript configuration (bundler mode, strict, noEmit)

**Note**: Examples below use openApiSchema, but the same patterns apply to protobuf, validator, and other modules.

## Development Workflow

### Making Changes

1. **Identify the module** you're working on (openApiSchema, protobuf, validator, json, etc.)
2. **Start with a test** in the corresponding `src/__test__/<module>.test.ts` file
3. Use existing test utilities (`compile()` helper from `utils.ts`)
4. Run focused tests: `bun test --filter "<test name>"` or `bun test src/__test__/<module>.test.ts`
5. Implement the feature in `src/plugin/<module>/codegen.ts` or `transform.ts`
6. Run lint and format: `bun run lint && bun run format`
7. Verify all tests pass: `bun test`

### TDD Approach (Recommended)

```bash
# Example: Adding a feature to OpenAPI module
# 1. Add failing test case to src/__test__/openApiSchema.test.ts
# 2. Run specific test to see failure
bun test --filter "should handle my new type"
# OR: bun test src/__test__/openApiSchema.test.ts

# 3. Implement in plugin/openApiSchema/codegen.ts
# 4. Run test again until it passes
# 5. Run full test suite
bun test

# 6. Lint and format
bun run lint && bun run format
```

**For other modules**: Replace `openApiSchema` with `protobuf`, `validator`, `json`, etc.

### Test Structure

Tests use real Bun builds with the plugin enabled:
- Create temporary TypeScript files
- Build with `Bun.build()` including the Wiz plugin
- Assert on the compiled JavaScript output
- Tests auto-clean `.tmp` artifacts when `DEBUG=false`

**Dedenting**: Tests use dedent for both input and output - indentation doesn't matter, but linebreaks do.

## Coding Conventions

### TypeScript

- **Strict mode enabled**: All strict TypeScript checks are on
- **No emit**: TypeScript only for type checking, Bun handles compilation
- **Module resolution**: `bundler` mode (allows `.ts` imports)
- **Import style**: Use `import type` for type-only imports when possible

### Plugin Development

- **Always guard runtime APIs**: Use `pluginNotEnabled()` for compile-time-only functions
- **Use ts-morph exclusively**: Don't mix raw TypeScript compiler APIs
- **Keep transforms stateless**: Thread configuration through `WizPluginContext`
- **Log via plugin options**: Use `wizPlugin({ log: true })` for debugging, not `console.log`
- **Deterministic output**: Object key order in codegen affects diffs

### Schema Generation

- **$ref for known types**: Generate `$ref` references for types in the schema tuple
- **Inline for anonymous types**: Generate inline schemas for object literals
- **Handle null carefully**: 
  - OpenAPI 3.0: use `nullable: true`
  - OpenAPI 3.1: use `type: ["string", "null"]` array syntax
- **Date handling**: Defaults to `{ type: "string", format: "date-time" }`, configurable via plugin options

### Commit Messages

Follow Conventional Commits:
```
feat(plugin): add union type support
fix(codegen): handle circular references correctly
test(openapi): add test cases for discriminated unions
docs(readme): clarify plugin setup process
chore(deps): update ts-morph to v27.0.2
```

Use scope when helpful: `plugin`, `codegen`, `cli`, `generator`, `tests`, `docs`

## Testing Strategy

### Test Types

1. **Unit Tests**: Test individual functions in isolation (rare, prefer integration)
2. **Integration Tests**: Test full build pipeline with plugin (most common)
3. **CLI Tests**: Test CLI commands end-to-end

### Running Tests

```bash
# All tests
bun test

# Specific module's tests
bun test src/__test__/openApiSchema.test.ts  # OpenAPI tests
bun test src/__test__/protobuf.test.ts       # Protobuf tests
bun test src/__test__/validator.test.ts      # Validator tests

# Filter by test name
bun test --filter "nullable"

# With coverage
bun run test:coverage

# Generate reports for CI
bun run test:report
```

### Writing Tests

```typescript
import { compile, createTempProject } from "./utils";

describe("my feature", () => {
  it("should generate schema for X", async () => {
    const result = await compile(`
      type MyType = { foo: string };
      export const schema = createOpenApiSchema<[MyType], "3.0">();
    `);
    
    expect(result).toContain(`"foo": { "type": "string" }`);
  });
});
```

### Test Debugging

- Set `DEBUG=false` in test files to auto-clean `.tmp` artifacts
- Use `--filter` to run specific tests during development
- Check `.tmp` directories if tests fail unexpectedly
- Ensure dedent is handling whitespace correctly (linebreaks matter, indentation doesn't)

## CI/CD

### GitHub Actions Workflow

Location: `.github/workflows/test.yml`

**Triggers**: 
- Push to `master` branch
- Pull requests to `master` branch

**Jobs**:
1. Checkout code
2. Setup Bun (v1.3.4)
3. Install dependencies (`bun install`)
4. Run tests with coverage and reports (`bun run test:report`)
5. Upload coverage to Codecov
6. Upload test results as artifacts

### What CI Checks

- All tests must pass
- Test results are uploaded as JUnit XML
- Code coverage is tracked (but not enforced)
- Uses lcov format for coverage reports

## Common Patterns

### Adding a New Feature to a Module

**Identify the module first**: openApiSchema, protobuf, validator, json, etc.

1. Add test cases to `src/__test__/<module>.test.ts` (e.g., `openApiSchema.test.ts` for OpenAPI features)
2. Define expected input (TypeScript type) and output (compiled JS with schema)
3. Run test to see failure: `bun test --filter "new feature"` or `bun test src/__test__/<module>.test.ts`
4. Implement in `src/plugin/<module>/codegen.ts`:
   - Add type checking logic
   - Extract properties/metadata from ts-morph `Type`
   - Generate appropriate JSON schema structure
5. Run test until it passes
6. Add edge cases to test
7. Run full test suite: `bun test`
8. Lint and format: `bun run lint && bun run format`

### Adding a New Transform

1. Create transformer in `src/plugin/<feature>/transform.ts`
2. Create codegen in `src/plugin/<feature>/codegen.ts`
3. Register in `src/plugin/index.ts` within the plugin
4. Add runtime stub in `src/<feature>/index.ts` that throws `pluginNotEnabled()`
5. Add tests in `src/__test__/<feature>.test.ts`
6. Update exports in `package.json` if needed

### Extending Plugin Options

1. Add option to `WizPluginOptions` interface in `src/plugin/index.ts`
2. Thread option through `WizPluginContext`
3. Use option in transform/codegen functions
4. Document in README.md
5. Add tests covering the option

## Troubleshooting

### Plugin Not Transforming Code

**Symptoms**: `pluginNotEnabled()` errors at runtime

**Solutions**:
- Verify Bun version ≥1.3.3: `bun --version`
- Check plugin is registered in build config
- Ensure function name matches exactly (e.g., `createOpenApiSchema`)
- Enable logging: `wizPlugin({ log: true })`
- Check that file is under `src/` directory

### Test Failures

**Common Issues**:
- `.tmp` directories not cleaned → set `DEBUG=false` in test
- Indentation mismatch → linebreaks matter, spaces don't in dedented strings
- Type resolution failure → avoid complex conditional/inferred types initially
- ts-morph version mismatch → check that dependencies are installed correctly

**Debugging Steps**:
1. Run specific test: `bun test --filter "failing test name"`
2. Check `.tmp` directory for actual compiled output
3. Compare expected vs actual output carefully
4. Add debug logging in codegen/transform
5. Simplify test case to isolate issue

### Type Errors

**Solutions**:
- Verify `tsconfig.json` settings match project requirements
- Check all source files are under `src/`
- Ensure TypeScript ^5 is installed: `bun pm ls typescript`
- Run `bun run lint` to see all type errors
- Clear any stale build artifacts or caches

### Build Errors

**Common Issues**:
- Missing dependencies → run `bun install`
- Bun version too old → upgrade Bun to ≥1.3.3
- TypeScript errors → fix with `bun run lint`
- Import path issues → use `.ts` extensions, check `package.json` exports

### Runtime Errors About Plugin Not Enabled

**This is expected behavior!**

Functions like `createOpenApiSchema<T>()` are compile-time only. They throw `pluginNotEnabled()` at runtime by design.

**Solutions**:
- Ensure build process includes Wiz plugin
- Don't call these functions at runtime
- Only use in files processed by Bun build with plugin

## Key Concepts to Remember

### 1. Compile-Time vs Runtime

- **Compile-time**: Plugin transforms calls to literal objects during build
- **Runtime**: Transformed code contains only literal objects, no plugin logic
- **API exports**: Runtime exports only throw errors, real functionality is compile-time

### 2. Type Safety

- All schemas are generated from TypeScript types
- Type changes automatically propagate to schemas
- No manual JSON schema maintenance needed

### 3. AST Transformation

- Plugin operates on TypeScript AST via ts-morph
- Pattern matches specific function calls
- Extracts type information from generic type arguments
- Replaces entire call expression with literal object

### 4. Testing Philosophy

- Test real compilation, not mocked transforms
- Integration tests > unit tests
- Tests should verify actual build output
- Use `compile()` helper for consistent testing

### 5. Schema Generation Principles

- Primitives map directly (string → string, number → number)
- Objects generate schema with properties and required array
- Unions become oneOf/anyOf (configurable)
- Intersections become allOf
- Known types use $ref, anonymous types are inlined
- Circular references handled via $ref

## Documentation

### Main Documentation Files

- **README.md**: User-facing documentation, CLI usage, API examples
- **CONTRIBUTING.md**: Contributor guidelines, development workflow
- **OPENAPI_CLIENT_GENERATOR.md**: OpenAPI client generation features
- **JSDOC_OPENAPI_EXAMPLES.md**: JSDoc-based API endpoint documentation
- **.github/copilot-instructions.md**: This file (agent instructions)

### When to Update Documentation

- New features: Update README.md with usage examples
- API changes: Update relevant documentation file
- Breaking changes: Document in PR and update CONTRIBUTING.md if workflow changes
- Bug fixes: Usually no documentation update needed unless it exposes new behavior

## Special Considerations

### Date Type Handling

Default: `{ type: "string", format: "date-time" }`

Override via plugin option:
```typescript
wizPlugin({
  transformDate(type) {
    return { type: "number" }; // Unix timestamp
    // return undefined; // Fall back to default
  }
})
```

### Union Style (oneOf vs anyOf)

Default: `oneOf` (stricter, value must match exactly one schema)

Configure via plugin:
```typescript
wizPlugin({
  unionStyle: "anyOf" // More lenient, value can match one or more schemas
})
```

### JSDoc Annotations

Wiz supports JSDoc tags for schema enrichment:
- `@description`: Add descriptions
- `@default`: Specify default values  
- `@example`: Provide examples
- `@deprecated`: Mark as deprecated
- `@minimum`, `@maximum`: Number constraints
- `@minLength`, `@maxLength`: String constraints
- `@pattern`: Regex pattern
- `@format`: String format (email, uuid, etc.)
- `@private`, `@ignore`, `@package`: Exclude from schema

### Discriminated Unions

Wiz automatically detects discriminator properties:
- All union members must be objects
- Must share a common property with distinct literal values
- Generates OpenAPI `discriminator` with `propertyName`
- Adds `mapping` when all members are named types in the schema

## Performance Tips

- Plugin runs once during build, not at runtime (zero runtime overhead)
- Tests can be slow due to full Bun builds - use `--filter` during development
- Large schemas are fine - they're just JSON literals after compilation
- ts-morph type resolution can be slow for very complex types

## Gotchas & Pitfalls

1. **Null dereferences in codegen**: `prop.getDeclarations()[0]!` can crash on edge cases - add null checks
2. **Object key order**: Affects diff noise, keep codegen consistent
3. **Dedent in tests**: Linebreaks matter, indentation doesn't
4. **Type resolution**: Complex conditional/inferred types may not resolve correctly
5. **Plugin options**: Must be threaded through `WizPluginContext`, not global state
6. **Import paths**: Must use `.ts` extension in source, Bun handles during build
7. **Test artifacts**: `.tmp` directories persist if `DEBUG=true`, can cause confusion

## Getting Help

1. **Check existing tests**: Look in `src/__test__/` for similar examples
2. **Read documentation**: README.md covers most user-facing features
3. **Enable debug logging**: `wizPlugin({ log: true })` shows transformation details
4. **Inspect compiled output**: Check `.tmp` directories during test debugging
5. **Review commit history**: `git log` shows recent changes and patterns
6. **Check TypeScript errors**: `bun run lint` shows all type issues

## Best Practices Summary

✅ **DO**:
- Write tests before implementing features (TDD)
- Run `bun run lint && bun run format` before committing
- Use focused test runs during development (`--filter`)
- Guard runtime APIs with `pluginNotEnabled()`
- Use ts-morph exclusively for AST manipulation
- Keep transforms stateless
- Generate deterministic JSON output
- Add test coverage for new features
- Follow Conventional Commits format

❌ **DON'T**:
- Mix raw TypeScript compiler APIs with ts-morph
- Use `console.log` for plugin debugging (use log option)
- Skip linting and formatting
- Commit with test failures
- Add runtime logic to compile-time functions
- Remove or modify `.tmp` files manually during tests
- Hardcode configuration in transforms (use context)
- Skip test coverage for edge cases
