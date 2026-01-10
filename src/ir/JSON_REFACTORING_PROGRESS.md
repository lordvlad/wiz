# JSON Stringifier IR Refactoring - Progress Report

## Status: Partial Success (22/23 tests passing)

### Changes Made

1. **Modified IR JSON Generator** (`src/ir/generators/ir-to-json.ts`)
    - Changed from named function to IIFE (Immediately Invoked Function Expression)
    - This matches the format expected by the AST replacement in transforms
    - Resolves previous AST manipulation issues

2. **Updated JSON Transform** (`src/plugin/json/transform.ts`)
    - Imported `createJsonStringifyViaIr` from IR wrapper
    - Updated `createJsonSerializer` case to use IR
    - Updated `jsonSerialize` case to use IR
    - Parser cases still use original codegen (not in scope)

### Test Results

**Passing (22/23):**

- ✅ Simple object serialization
- ✅ Nested objects
- ✅ Arrays and arrays of objects
- ✅ Optional properties
- ✅ Boolean values
- ✅ Type validation errors
- ✅ Buffer serialization
- ✅ Reusable serializer functions
- ✅ Parser functions (using original codegen)
- ✅ Round-trip serialization

**Failing (1/23):**

- ❌ Nullable union types (`string | null`)

### Issue Discovered

The TypeScript → IR converter has a design decision that impacts JSON serialization:

**Location:** `src/ir/converters/ts-to-ir.ts` lines 318-326

**Behavior:**
When encountering a nullable union like `string | null`, the converter:

1. Detects it's a nullable union
2. Removes the `null` type
3. Returns just the base type (`string`)
4. Assumes the consumer will handle nullability (e.g., OpenAPI adds `nullable: true`)

**Why This Is Done:**

- OpenAPI 3.0 uses `nullable: true` property instead of union types
- Simplifies the IR for common nullable pattern
- Comment says: "For OpenAPI we'll add nullable later based on version"

**Why This Breaks JSON Serialization:**

- JSON serializer needs to know the value can be `null`
- Without this info, it validates `null` as invalid `string`
- Test case `{ value: null }` fails validation

### Architectural Considerations

This reveals a fundamental question about the IR design:

**Option 1: Keep Simplification, Add Metadata**

- Continue simplifying `T | null` to `T`
- Add metadata flag: `{ nullable: true }`
- Each generator checks metadata and handles appropriately

**Option 2: Don't Simplify, Let Generators Decide**

- Keep full union `T | null` in IR
- Each generator simplifies as needed
- OpenAPI generator converts to `nullable: true`
- JSON generator keeps both types

**Option 3: Context-Aware Conversion**

- Add options to `typeToIr()` to control simplification
- Different contexts can request different behavior
- More complex but more flexible

**Option 4: Store Both Representations**

- Keep simplified type as primary
- Store original union in metadata
- Generators can choose which to use

### Recommendation

**Option 2** seems cleanest:

- IR should be faithful to source types
- Generators should handle format-specific optimizations
- Maintains consistency and predictability
- Less "magic" behavior

### Next Steps

Awaiting decision on approach before implementing fix.

### Code Changes Summary

**Modified Files:**

- `src/ir/generators/ir-to-json.ts` - Changed to IIFE format
- `src/plugin/json/transform.ts` - Uses IR for serialization

**Impact:**

- 22/23 tests passing (96% success rate)
- No breaking changes to passing tests
- Single architectural issue to resolve

### Timeline

- Initial refactoring: Successful with IIFE change
- Test execution: Identified nullable union issue
- Root cause analysis: Found in ts-to-ir.ts converter
- Reported to maintainer: Awaiting guidance
