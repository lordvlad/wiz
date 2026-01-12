# Protobuf Model Generation Migration Status

## Overview

The Protobuf model generation (Proto → TypeScript) migration to IR has been initiated with a working wrapper in `protobuf-ir.ts`.

## Current Status

### ✅ Working (19/19 tests - 100%)

- **Protobuf Serialize/Parse** (`protobuf-serialize.test.ts`)
    - All serialization tests passing
    - All deserialization tests passing
    - Round-trip tests passing
    - Buffer support working
    - Creator functions working

### 🔄 Partially Working (11/15 tests - 73%)

- **Protobuf Model Generation** (`generator-protobuf.test.ts`)
    - ✅ Basic proto parsing
    - ✅ Package declarations
    - ✅ Simple type generation
    - ✅ Optional fields
    - ✅ Repeated fields (arrays)
    - ✅ Map fields
    - ✅ Multiple messages
    - ✅ Comment handling
    - ✅ JSDoc with custom tags
    - ✅ Disabling wiz tags
    - ✅ Standard proto types

    - ❌ `bytes` → `Uint8Array` mapping (currently maps to `string`)
    - ❌ Field number comments in JSDoc
    - ❌ `@wiz-format` branded types (e.g., `bigint & { __bigint_format: "int64" }`)

## Architecture

### Files Involved

1. **`src/generator/protobuf-ir.ts`** - IR-based wrapper (enhanced with options support)
2. **`src/ir/converters/proto-to-ir.ts`** - Proto → IR converter
3. **`src/ir/generators/ir-to-ts.ts`** - IR → TypeScript generator (enhanced with JSDoc options)
4. **`src/plugin/protobuf/serialize-codegen.ts`** - Binary serialize/parse (direct AST, working)

### What Was Enhanced

1. **protobuf-ir.ts**
    - Added full `GeneratorOptions` support
    - Re-exports types for backward compatibility
    - Supports `includeTags` and `customTags` options
    - Provides both new and legacy function names

2. **ir-to-ts.ts**
    - Added `TypeScriptGeneratorOptions` interface
    - Enhanced JSDoc generation with custom tags support
    - Preserves metadata tags from IR types
    - Multi-line JSDoc formatting

### What Needs Enhancement

To achieve 100% feature parity (15/15 tests), the IR layer needs:

1. **Proto-to-IR Converter Enhancements**
    - Map `bytes` proto type to a special IR type (not just `string`)
    - Preserve field numbers in metadata
    - Parse and preserve `@wiz-format` comments
    - Store format hints for branded types

2. **IR Type System Enhancements**
    - Add `IRBytesType` or similar for binary data
    - Extend metadata to include `fieldNumber?: number`
    - Support branded type hints in metadata

3. **IR-to-TS Generator Enhancements**
    - Generate `Uint8Array` for bytes types
    - Include field numbers in JSDoc comments
    - Generate branded type intersections (e.g., `string & { __str_format: "uuid" }`)

## Migration Strategy

### Option 1: Full IR Enhancement (Recommended)

Enhance the IR layer to support all Protobuf features. This provides long-term benefits:

- Consistent handling across all modules
- Single source of truth
- Easier to maintain
- Ready for future formats

### Option 2: Hybrid Approach

Keep the original `protobuf.ts` for model generation, use IR for schema generation:

- Less work upfront
- Maintains current functionality
- Two code paths to maintain
- Limited benefits

### Option 3: Feature Flag

Support both paths with a feature flag:

- Gradual migration
- Easy rollback
- Can test in production
- More complexity

## Recommendation

Since serialize/parse is already working (19/19 tests), focus on enhancing the IR layer to support the missing model generation features. This aligns with the overall refactoring goal and provides maximum long-term value.

## Test Status Summary

| Test Suite                 | Tests | Status     | Notes                             |
| -------------------------- | ----- | ---------- | --------------------------------- |
| protobuf-serialize.test.ts | 19/19 | ✅ Pass    | Serialize/parse working           |
| generator-protobuf.test.ts | 11/15 | 🔄 Partial | Missing bytes/fieldNum/wiz-format |
| Other protobuf tests       | N/A   | ✅ Pass    | Not affected by changes           |

## Next Steps

1. Enhance `proto-to-ir.ts` to preserve field numbers and parse `@wiz-format` tags
2. Add bytes type support to IR type system
3. Update `ir-to-ts.ts` to generate field number comments and branded types
4. Test with full generator test suite
5. Update import in `generator-protobuf.test.ts` to use `protobuf-ir`
6. Verify all 34+ protobuf-related tests pass (19 serialize + 15 generator)
