# elastic/github-actions

## Setup - CRITICAL

- ALWAYS use the repo-pinned toolchain versions for `Node.js` and `pnpm`. ALWAYS verify the root `package.json` for the required `engines` and `packageManager`.

## Overview

- elastic/github-actions is intended for the organization's internal GitHub Actions.
- Workflows are defined at the repo root in their own directories.

## Validation

- When changing a action or the build/test setup, ALWAYS run the checks from the repo root: `pnpm format`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- All checks MUST pass before any changes are considered complete.

## Contribution Hygiene

- Unsure: read more code; if still stuck, ask w/ short options. Never guess.
- Fix root cause (not band-aid).
- Make focused changes; avoid unrelated refactors.
- Update docs and tests when behavior or usage changes.
- Never remove, skip, or comment out tests to make them pass; fix the underlying code.
