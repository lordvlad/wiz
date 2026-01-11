# Protobuf Migration Analysis

## Summary

Attempted to refactor the Protobuf schema generator to use the IR (Intermediate Representation) layer. While the basic structure works, several advanced features are not yet supported by the IR generator, causing test failures.

## Test Results

- **Status**: 5/12 tests passing (42%)
- **Working**: Basic types, primitives, arrays, optionals, multiple types
- **Failing**: Nested types, JSDoc comments/tags, branded types, custom tags

## Issues Identified

### 1. Nested Type References
**Problem**: When a type references another type (e.g., `User` has an `Address` field), the IR generator stringifies it as a primitive string instead of preserving the reference.

**Expected**:
```json
{
  "name": "address",
  "type": "Address"  // Reference to Address message
}
```

**Actual**:
```json
{
  "name": "address",
  "type": "string"  // Lost the reference
}
```

**Root Cause**: The `irTypeToProtoType()` function in `ir-to-proto.ts` doesn't properly handle reference types from the IR.

### 2. JSDoc Comments Not Preserved
**Problem**: Type and field descriptions from JSDoc comments are not included in the generated Protobuf model.

**Current Protobuf codegen** includes:
```json
{
  "User": {
    "name": "User",
    "comment": "User entity representing a system user",
    "fields": [...]
  }
}
```

**IR generator** omits comments entirely.

### 3. JSDoc Tags Not Preserved
**Problem**: Custom JSDoc tags like `@version`, `@customTag`, etc. are not extracted and included in the IR, so they're lost in the Protobuf output.

**Expected**: Tags should be preserved in metadata or options field.

### 4. wiz-format Tags Missing
**Problem**: Branded types (e.g., `StrFormat<"email">`, `StrFormat<"uuid">`) should generate `wiz-format` tags in the Protobuf model, but the IR doesn't extract this information.

**Current behavior**: Treats branded types as plain strings.

### 5. Unsupported Global Types Detection
**Problem**: The current Protobuf codegen actively detects and rejects unsupported global types like `HTMLElement`. The IR converter doesn't have this validation.

**Result**: Stack overflow error instead of clear error message.

## Architecture Gap

The current Protobuf codegen (`src/plugin/protobuf/codegen.ts`) is ~700+ lines with sophisticated features:

- **Type relationship tracking**: Detects nested references, circular dependencies
- **JSDoc extraction**: Comments, tags, descriptions at type and field levels
- **Branded type handling**: Extracts format information from `StrFormat`, `NumFormat`, etc.
- **Custom tag support**: Preserves all JSDoc tags verbatim
- **Unsupported type detection**: Validates against browser/Node.js types
- **Field numbering**: Intelligent field number assignment with stability
- **Enum support**: Proper enum handling with Protobuf conventions

The IR generator (`src/ir/generators/ir-to-proto.ts`) is ~60 lines with basic features:

- ✅ Primitive type mapping
- ✅ Basic object structure
- ✅ Optional/required fields
- ✅ Array handling
- ❌ No JSDoc comments
- ❌ No custom tags
- ❌ No branded types
- ❌ Limited reference handling
- ❌ No validation

## Comparison with Successful Migrations

### JSON Stringifier (✅ Complete)
- Simpler transformation (TypeScript → JavaScript function)
- No metadata preservation needed
- Direct type handling sufficient
- Test suite: 23/23 passing (100%)

### Validator (✅ Complete - after user fixes)
- Moderate complexity
- Some JSDoc extraction for constraints
- Format validation added
- Test suite: 21/21 passing (100%)

### Protobuf (❌ Incomplete)
- High complexity
- Extensive JSDoc and metadata requirements
- Custom tag system
- Test suite: 5/12 passing (42%)

## Recommendations

### Option 1: Enhance IR Generator (Recommended for long-term)
**Effort**: High (2-3 days)
**Benefits**: Complete IR coverage, consistent architecture
**Tasks**:
1. Enhance IR type definitions to include:
   - JSDoc comments (descriptions)
   - Custom tags (key-value metadata)
   - Branded type information (formats)
   - Better reference tracking
2. Update `ts-to-ir.ts` converter to extract:
   - All JSDoc comments and tags
   - Branded type formats
   - Circular reference detection
3. Update `ir-to-proto.ts` generator to:
   - Include comments in output
   - Preserve custom tags
   - Generate wiz-format tags
   - Proper reference resolution
4. Add validation for unsupported types

### Option 2: Keep Direct Codegen (Recommended for short-term)
**Effort**: None
**Benefits**: Working implementation, all tests passing
**Drawbacks**: Not using IR architecture
**Justification**: Protobuf codegen is mature, well-tested, and handles complex edge cases

### Option 3: Hybrid Approach
**Effort**: Medium (1-2 days)
**Benefits**: Gradual migration path
**Approach**:
1. Keep direct codegen as primary
2. Add IR wrapper for simple use cases
3. Feature flag to choose implementation
4. Gradually move features to IR

## Next Steps

**Immediate**:
- Revert Protobuf transform changes (already done)
- Document findings (this file)
- Keep Protobuf with direct codegen

**Future Work** (when IR is enhanced):
1. Add JSDoc comment support to IR types
2. Add custom tag preservation to IR converters
3. Add branded type detection to TS→IR converter
4. Enhance reference resolution in IR→Proto generator
5. Add validation for unsupported types
6. Re-attempt Protobuf migration

## Conclusion

The Protobuf migration reveals that the IR layer, while excellent for basic transformations, needs significant enhancement to support the advanced features that Protobuf requires. The JSON and Validator migrations succeeded because they had simpler requirements. 

For now, Protobuf should remain with its proven direct codegen implementation. The IR infrastructure should be enhanced before attempting this migration again.

## Test Command

```bash
bun test src/__test__/protobuf.test.ts
```

Current output: 5 pass, 7 fail
Expected: 12 pass, 0 fail
