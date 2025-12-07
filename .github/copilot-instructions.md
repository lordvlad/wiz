# Wiz AI Coding Guide

## Big Picture
- `src/openApiSchema/index.ts` exports `createOpenApiSchema<T>()`, a compile-time hook that throws via `pluginNotEnabled()` so runtime calls are never expected; Bun plugin rewrites calls to literal schemas.
- `src/plugin/index.ts` registers the Bun plugin. It spins up a `ts-morph` `Project`, loads each `.ts/.tsx` file, runs `transformOpenApiSchema()`, and hands the modified source back to Bun.
- `transformOpenApiSchema()` finds `createOpenApiSchema<Type>()` calls, grabs the single type argument, and swaps the call for the JSON produced by `plugin/openApiSchema/codegen.ts`.
- `plugin/openApiSchema/codegen.ts` currently emits OpenAPI-ish JSON for primitives, arrays, and plain object types. Extending schema coverage happens here by interrogating `ts-morph` `Type` objects.
- Tests under `src/__test__` do real Bun builds (`Bun.build`) with the plugin to ensure the emitted JS contains the injected schema literals.

## Key Files & Roles
- `README.md`: minimal setup (Bun runtime) and `bun install`, `bun run index.ts` commands.
- `src/errors.ts`: central helper; throw this sentinel whenever a feature depends on a plugin-generated artifact.
- `src/openApiSchema/types.ts`: placeholder for eventual strongly-typed schema shape. Keep it aligned with whatever `codegen` emits.
- `src/plugin/openApiSchema.ts`: reserved for higher-level helpers that compose transform/codegen logic. Currently empty; populate when sharing logic across transforms.
- `src/plugin/openApiSchema/transform.ts`: pattern-match call expressions, log locations via `WizPluginContext`, replace AST nodes with pretty-printed JSON.

## Development Workflow
- Install deps with `bun install`. Use Bun ≥1.3.3 (project was bootstrapped with `bun init`).
- Run the plugin-powered test suite with `bun test` (tests generate `.tmp` artifacts; set `DEBUG=false` inside the test to auto-clean).
- Make use of test utils in `src/__test__/utils.ts` for building with the plugin and snapshotting outputs. Best case, you only need to add new test cases in the `test` array in `src/__test__/openApiSchema.test.ts`.
- Respect `tsconfig.json` (`moduleResolution: bundler`, `noEmit: true`, strict mode). Keep new source files under `src/` so Bun and the plugin pick them up.

## TDD Workflow
- Start every feature with a Bun test in `src/__test__/openApiSchema.test.ts`; describe the type alias under `tests` and capture the expected transformed JS snippet.
- Use the existing `compile()` helper to assert against compiled output rather than unit-level mocks; this keeps tests aligned with the plugin’s real behavior.
- Run focused iterations via `bun test src/__test__/openApiSchema.test.ts --filter "<case name>"` (Bun’s `--filter` flag) to tighten the red/green loop.
- Only touch implementation files (`plugin/openApiSchema/codegen.ts`, `transform.ts`, etc.) once the failing test clearly expresses the desired schema.

## Semantic Commits
- Follow Conventional Commits: `<type>(<scope>): <summary>` where `type` is typically `feat`, `fix`, `test`, `docs`, or `chore`; omit `scope` if noise.
- Reference the touched area in `scope` when helpful (e.g., `feat(plugin): add union support`) so history maps directly to `src/plugin/*` or tests.
- Summaries should describe observable behavior (“generate boolean schemas”) rather than implementation details.
- Keep commits focused: land failing tests (`test:`) separately before `feat:` changes if you are doing TDD so reviewers can diff intent vs. implementation.

## Conventions & Pitfalls
- Always guard plugin-only APIs with `pluginNotEnabled()` so users get actionable failures if the Bun plugin is missing.
- `codegen.ts` walks `type.getProperties()` and blindly dereferences `prop.getDeclarations()[0]!`; add null checks before handling unions/interfaces to avoid crashes on more complex inputs.
- Keep schema JSON deterministic: transformations call `JSON.stringify(schema, null, 2)` before replacement, so object key order in `codegen` determines diff noise.
- Logging is opt-in via plugin options (`wizPlugin({ log: true })`). When debugging new transforms, expose meaningful breadcrumbs through the provided `log` function rather than `console.log`.
- Tests dedent both the source and the compiled output; Indentation does not matter, but you still need to care for linebreaks.

## Extending Functionality
- Add new schema features in `plugin/openApiSchema/codegen.ts`, backed by regression tests in `src/__test__/openApiSchema.test.ts` that describe both the input type alias and the expected transformed JS.
- For future generator types (JSON Schema, protobuf, etc.), follow the same pattern: stub API in `src/<feature>/index.ts`, implement transformer + codegen under `src/plugin/<feature>/`, wire it inside `wizPlugin`.
- When exposing new plugin options, extend `WizPluginOptions` in `src/plugin/index.ts` and thread them through `WizPluginContext` so transforms remain stateless and testable.
