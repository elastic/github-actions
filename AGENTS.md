# elastic/github-actions

## Setup

- Use the repo-pinned toolchain versions for `NodeJS` and `pnpm`. Consult the root `package.json` for the required versions.

## Overview

- elastic/github-actions is intended for the organization's Github Actions which are used for internal development.
- `project-assigner/` is deprecated and self-contained. Completely ignore it. That action should NOT be used for style references or toolchain usage. The root toolchains and workflows intentionally ignore it.

## Validation

- When changing a root-managed action or the root build/test setup, ALWAYS run the checks from the repo root: `pnpm format`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- All checks MUST pass before any changes are considered complete.

## Contribution Hygiene

- Unsure: read more code; if still stuck, ask w/ short options. Never guess.
- Fix root cause (not band-aid).
- Make focused changes; avoid unrelated refactors.
- Update docs and tests when behavior or usage changes.
- Never remove, skip, or comment out tests to make them pass; fix the underlying code.
