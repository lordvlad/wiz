# OpenAPI Schema Generator Migration Analysis

## Current Status

The OpenAPI schema generator has **NOT** been migrated to use the IR layer yet. An IR wrapper exists (`src/plugin/openApiSchema/codegen-ir.ts`), but the plugin transform still uses the direct codegen approach.

**Test Results When Attempted:** 87/117 tests failing (26% failure rate)

## Why Migration Is Complex

The OpenAPI schema generator has many advanced features that the current IR layer doesn't fully support:

### 1. **$ref Generation** ❌

**Issue:** IR inlines all type definitions instead of generating `$ref` references to named types.

**Example:**

```typescript
// Expected:
{
  "author": { "$ref": "#/components/schemas/User" }
}

// IR generates:
{
  "author": {
    "properties": { "id": { "type": "number" }, ... },
    "type": "object"
  }
}
```

**Impact:** 8 test failures

- Type references in properties
- Array item references
- Union type references
- Record value references

### 2. **Discriminator Support** ❌

**Issue:** IR doesn't detect or generate discriminator properties for unions.

**Example:**

```typescript
// Expected:
{
  "oneOf": [...],
  "discriminator": {
    "propertyName": "kind",
    "mapping": { "dog": "#/components/schemas/Dog", ... }
  }
}

// IR generates:
{
  "oneOf": [...] // No discriminator
}
```

**Impact:** 5 test failures

- Discriminated unions
- Named type discriminators with mapping

### 3. **Enum Handling** ❌

**Issue:** IR treats enums as separate literal unions instead of single enum schemas.

**Example:**

```typescript
// Expected:
{
  "enum": ["active", "inactive"],
  "type": "string"
}

// IR generates:
{
  "oneOf": [
    { "enum": ["active"], "type": "string" },
    { "enum": ["inactive"], "type": "string" }
  ]
}
```

**Impact:** 8 test failures

- String enums
- Numeric enums
- Nullable enums
- JSDoc enum descriptions

### 4. **Nullable Union Handling** ❌

**Issue:** IR doesn't properly collapse nullable unions for OpenAPI 3.0 format.

**Example:**

```typescript
// Expected (OpenAPI 3.0):
{
  "type": "string",
  "nullable": true
}

// IR generates:
{
  "oneOf": [
    { "nullable": true, "type": "string" },
    { "type": "string" }
  ]
}
```

**Impact:** 7 test failures

### 5. **Index Signature/Record Handling** ❌

**Issue:** IR doesn't preserve additionalProperties with fixed properties.

**Example:**

```typescript
// Expected:
{
  "properties": { "fixedProp": { "type": "string" } },
  "additionalProperties": true
}

// IR generates:
{
  "additionalProperties": {} // Lost fixed properties
}
```

**Impact:** 1 test failure

### 6. **Circular Reference Handling** ❌

**Issue:** IR causes stack overflow on circular type references.

**Impact:** 1 test failure (stack overflow)

### 7. **Null Type Handling** ❌

**Issue:** IR generates `{ "enum": [null] }` instead of `{ "type": "null" }` or `{ "type": "boolean" }`.

**Example:**

```typescript
// Expected:
{ "type": "boolean" }

// IR generates:
{ "enum": [null] }
```

**Impact:** 3 test failures

### 8. **Unsupported Type Validation** ❌

**Issue:** IR causes stack overflow instead of throwing proper error for unsupported types like HTMLElement.

**Impact:** 1 test failure

## IR Enhancements Needed

To successfully migrate the OpenAPI schema generator, the IR layer needs these features:

### High Priority

1. **$ref Generation Logic**
    - Detect when types should use references vs inline
    - Generate proper `#/components/schemas/` references
    - Track available types for reference resolution

2. **Discriminator Detection**
    - Identify discriminator properties in unions
    - Generate discriminator object with propertyName
    - Generate mapping for named type unions

3. **Enum Consolidation**
    - Detect when multiple literals should be consolidated into enum
    - Generate single enum schema instead of oneOf literals
    - Preserve JSDoc enum descriptions as x-enumDescriptions

4. **Nullable Union Simplification**
    - Detect `T | null | undefined` patterns
    - Generate OpenAPI 3.0 `nullable: true` format
    - Generate OpenAPI 3.1 `type: [..., "null"]` format

5. **Circular Reference Prevention**
    - Track processing stack to detect cycles
    - Use $ref for circular references
    - Prevent stack overflow

### Medium Priority

6. **Index Signature Preservation**
    - Preserve fixed properties with additionalProperties
    - Generate `additionalProperties: true` when appropriate

7. **Null Type Handling**
    - Generate `{ "type": "null" }` for null types (OpenAPI 3.1)
    - Don't use `{ "enum": [null] }` representation

8. **Unsupported Type Detection**
    - Detect unsupported global types early
    - Throw descriptive errors instead of stack overflow

## Migration Approach

### Option 1: Enhance IR Layer (Recommended Long-term)

1. Implement all needed IR enhancements (significant work)
2. Update IR-to-OpenAPI generator with new features
3. Migrate transform to use enhanced IR
4. Validate all 117 tests pass

**Pros:**

- Consistent with overall IR migration strategy
- Benefits other generators too
- Maintainable long-term

**Cons:**

- Significant development effort (~2-3 weeks)
- Complex features to implement
- Risk of introducing new bugs

### Option 2: Hybrid Approach (Pragmatic)

1. Keep OpenAPI schema generation using direct codegen
2. Use IR for simpler transformations (already working)
3. Document why OpenAPI schema uses direct approach
4. Revisit when IR layer is more mature

**Pros:**

- Zero risk to working functionality
- Fast (no changes needed)
- Proven and tested

**Cons:**

- Not using unified IR for this one module
- Inconsistent with other migrations

### Option 3: Gradual Enhancement

1. Start with simple schemas that IR handles well
2. Add IR enhancements incrementally
3. Gradually increase test coverage
4. Fall back to direct codegen for complex cases

**Pros:**

- Progressive improvement
- Lower risk per change
- Can ship incrementally

**Cons:**

- Complex hybrid logic
- Longer timeline
- Maintenance burden during transition

## Recommendation

**Use Option 2: Hybrid Approach**

The OpenAPI schema generator is complex and working perfectly with 117/117 tests passing. The IR layer would need significant enhancements to match its capabilities:

- $ref generation
- Discriminator detection
- Enum consolidation
- Nullable union handling
- Circular reference prevention
- And more...

These enhancements would benefit other generators too, but they require careful design and implementation. Until the IR layer supports these features, keeping the proven direct approach for OpenAPI schema generation is the pragmatic choice.

## Current Architecture

```
OpenAPI Schema Generation:
├── Plugin Transform (src/plugin/openApiSchema/transform.ts)
│   └── Uses: Direct codegen (src/plugin/openApiSchema/codegen.ts)
│
└── IR Wrapper Available (src/plugin/openApiSchema/codegen-ir.ts)
    └── Not used yet - needs enhancements
```

## Future Work

When ready to migrate:

1. Enhance IR layer with needed features
2. Update IR-to-OpenAPI generator
3. Change transform import from `./codegen` to `./codegen-ir`
4. Validate all 117 tests pass
5. Document migration success

## Test Coverage

- **Total Tests:** 117
- **Passing with Direct Codegen:** 117/117 (100%)
- **Passing with IR (attempted):** 30/117 (26%)
- **Failures:** 87 tests (74%)

The 87 failing tests cover:

- 8 tests: $ref generation
- 5 tests: Discriminators
- 8 tests: Enum handling
- 7 tests: Nullable unions
- 3 tests: Null types
- 2 tests: Circular references
- 1 test: Index signatures
- 53 tests: Various combinations of above issues

## Conclusion

The OpenAPI schema generator migration is **NOT READY** and should remain using the direct codegen approach. The IR layer needs significant enhancements before this migration can succeed without breaking existing functionality.

**Status:** ❌ **Not Migrated** - Keeping direct codegen approach
**Tests:** ✅ 117/117 passing with direct codegen
