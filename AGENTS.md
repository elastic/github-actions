# Agent Notes

- `project-assigner/` is deprecated and self-contained. That action should NOT be used for style references or toolchain usage. The root TypeScript toolchain, tests, Renovate config, and `build`/`test` workflows intentionally ignore it.
- Use the repo-pinned toolchain versions for `NodeJS` and `pnpm`. Consult the root `package.json` for the required versions.
- When changing a root-managed action or the root build/test setup, always run the checks from the repo root: `pnpm format`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
