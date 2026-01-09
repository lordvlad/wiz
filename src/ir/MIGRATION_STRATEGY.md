# IR Migration Strategy

## Overview

This document outlines the strategy for migrating existing codegen to use the IR layer.

## Migration Approach

### Phase 6.1: Create Migration Helper Functions

Create helper functions that bridge between current transform code and IR wrappers:

1. **Extract Type Collection** - Gather all types that need to be converted
2. **Build IR Schema** - Convert collected types to IR
3. **Generate Output** - Use IR generators to produce output
4. **Format Result** - Match existing output format

### Phase 6.2: Migrate Plugin Transforms (One at a Time)

Start with the simplest transforms and work up to more complex ones:

1. ✅ **JSON Plugin** (simplest - single type transformations)
2. ✅ **Validator Plugin** (single type with validation)
3. ⏱️ **Protobuf Plugin** (multiple types, field numbering)
4. ⏱️ **OpenAPI Plugin** (most complex - multiple types, paths, operations)

### Phase 6.3: Migrate CLI Commands

Update CLI commands to use IR pipeline:

1. `wiz model` command (OpenAPI/Protobuf → TypeScript)
2. `wiz openapi` command (TypeScript → OpenAPI)
3. `wiz protobuf` command (TypeScript → Protobuf)

### Phase 6.4: Update Generators

Migrate generator modules to use IR:

1. `generator/openapi.ts` → use `openapi-ir.ts`
2. `generator/protobuf.ts` → use `protobuf-ir.ts`

## Implementation Strategy

### For Simple Plugins (JSON, Validator)

**Current Flow:**

```
Call Expression → Extract Type → Generate Code Directly → Replace AST Node
```

**New Flow with IR:**

```
Call Expression → Extract Type → Convert to IR → Generate from IR → Replace AST Node
```

**Implementation:**

- Add IR conversion step in transform
- Use IR wrapper functions
- Keep same public API

### For Complex Plugins (OpenAPI, Protobuf)

**Current Flow:**

```
Call Expression → Extract Multiple Types → Build Schema → Replace AST Node
```

**New Flow with IR:**

```
Call Expression → Extract Multiple Types → Convert to IR Schema → Generate from IR → Replace AST Node
```

**Implementation:**

- Build IR schema from all collected types
- Use IR generator for final output
- Preserve all metadata and settings

## Benefits of Migration

1. **Consistency** - All transforms use same type conversion logic
2. **Maintainability** - Fixes in IR benefit all transforms
3. **Testability** - Can test IR conversion separately
4. **Extensibility** - Easy to add new output formats

## Backwards Compatibility

- All existing tests must pass
- No changes to public APIs
- Same output format (JSON structure)
- Preserve all existing features

## Testing Strategy

For each migrated component:

1. Run existing tests - must all pass
2. Compare output with/without IR (should be identical)
3. Add IR-specific test if needed
4. Document any differences

## Rollout Plan

### Step 1: Helper Functions (This Commit)

- Create migration helper utilities
- Add bridge functions for common patterns

### Step 2: Simple Plugins (Next Commits)

- Migrate JSON plugin transform
- Migrate Validator plugin transform
- Test thoroughly

### Step 3: Complex Plugins (Subsequent Commits)

- Migrate Protobuf plugin transform
- Migrate OpenAPI plugin transform
- Test thoroughly, especially edge cases

### Step 4: CLI & Generators (Final Commits)

- Update CLI commands
- Update generator modules
- Integration testing

### Step 5: Cleanup (Optional)

- Remove unused code paths
- Consolidate duplicate logic
- Performance optimization

## Non-Goals

- Do NOT change test files (unless they fail)
- Do NOT change public APIs
- Do NOT add new features during migration
- Do NOT optimize prematurely

## Success Criteria

✅ All existing tests pass
✅ Output matches previous implementation
✅ IR layer is used for all transformations
✅ Code is cleaner and more maintainable
✅ Easy to add new formats
