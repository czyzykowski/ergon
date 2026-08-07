# Agent Instructions (ergon)

This file guides agentic coding assistants working in this repo. Follow these
rules for every change you make.

## Global Expectations

- Keep `CHANGELOG.md` up to date using Keep a Changelog.
- Maintain root `NOTES.md` with discoveries and decisions.
- Keep `README.md` current with setup/usage.
- Update the progress tracker in `NOTES.md` when milestones change.
- Prefer small, focused changes; avoid unrelated cleanup.

## Repo Overview

- CLI name: `ergon`.
- Language/runtime: Deno (TypeScript).
- CLI entrypoint: `src/main.ts`.
- Core workflow: Jira + Clockwork integration with local state.

## Build / Test / Lint Commands

### Build

- Run directly:
  `deno run --allow-net --allow-read --allow-env --allow-write src/main.ts`.
- Install:
  `deno install --allow-net --allow-read --allow-env --allow-write --name ergon src/main.ts`.

### Test

- Add once tests exist: `deno test`.

### Lint / Format

- Format: `deno fmt`.
- Lint: `deno lint`.

## Code Style Guidelines

### TypeScript Conventions

- Use 2-space indentation; no tabs.
- Prefer `const` over `let` when possible.
- Use explicit return types for exported functions.
- Keep modules small; extract helpers for clarity.
- Use `async/await` for IO and API calls.
- Avoid `any` unless interfacing with external APIs.

### Imports

- Group standard modules, then third-party, then local.
- Keep imports sorted within each group.

### Naming

- Types: `UpperCamelCase`.
- Functions/vars: `lowerCamelCase`.
- Avoid one-letter names except simple closures.

### Error Handling

- Prefer `throws` and propagate errors upward.
- Use clear error messages for CLI failures.
- Avoid silent failures unless explicitly required.

### File IO

- Use atomic writes for state/config changes.
- Keep filesystem paths built with `URL` or `path` helpers.

## Testing Guidelines

- Prefer deterministic dates and fixed timestamps.
- Use temp directories for filesystem tests.
- Cover config parsing and API error handling first.
- Use mocking where appropriate.

## Documentation / Progress Updates

- Update `CHANGELOG.md` for user-visible changes.
- Update `NOTES.md` with facts/decisions and next steps.

## Code Quality Pass

- After implementing a new feature, re-read the related code and apply
  improvements that make it easier to understand and maintain.
- Prefer changes that also improve testability when possible.
- Keep improvements scoped to the feature; avoid unrelated refactors.

## Agent-Specific Notes

- Avoid introducing external binaries beyond Deno unless requested.
- Keep CLI behavior aligned with the implementation plan.

## Git Workflow

- Create a git commit after each meaningful, atomic change.
