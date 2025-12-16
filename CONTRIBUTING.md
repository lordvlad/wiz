# Contributing

We welcome patches for new schema features, bug fixes, and documentation tweaks. Please skim the development workflow in the README and the Wiz AI Coding Guide before opening a pull request.

## Development Workflow

- Install dependencies with `bun install`.
- Drive new work with focused tests under `src/__test__/`.
- Use Conventional Commits (e.g., `feat(plugin): add tuple schemas`).

## Linting & Formatting

Before committing, run the project linters so CI stays quiet:

```bash
bun run lint
bun run format
```

`bun run lint` surfaces TypeScript and plugin issues, while `bun run format` applies the repository formatting rules. Re-run the commands until they exit cleanly and include any formatting changes in your commit.

## Pull Requests

- Confirm `bun test` (or the filtered cases you’re touching) passes locally.
- Add regression coverage alongside feature work.
- Describe any notable implementation details or trade-offs in the PR body so reviewers can stay focused on behavior.
