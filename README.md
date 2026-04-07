# Elastic GitHub Actions

This repository contains GitHub Actions maintained by the Elastic Organization. Each action lives in
its own top-level directory.

Additional actions can be added as new top-level directories.

## Using Actions From This Repo

Actions in this repository are consumed with the standard subdirectory syntax:

```yaml
uses: elastic/github-actions/<action-name>@<ref>
```

Examples:

```yaml
steps:
  - uses: elastic/github-actions/litellm-token@v2.1.1
```

```yaml
steps:
  - uses: elastic/github-actions/litellm-token@f443b600d91635bebf5b0d9ebc620189c0d6fba5 # v2.1.1
```

The `@<ref>` portion is always a repository ref. That means a tag, branch, or SHA points to a
commit in `elastic/github-actions`, and GitHub then loads the requested action directory from
that commit.

## Versioning And SHAs

Because refs are repository-wide, action usage looks path-scoped but versioning is commit-scoped.
In practice, this means:

- `elastic/github-actions/litellm-token@v2.1.1` uses the `litellm-token/` directory from
  the repo tag `v2.1.1`
- `elastic/github-actions/another-action@v3.0.0` would use the `another-action/`
  directory from the repo tag `v3.0.0`
- SHA pinning is supported and recommended when consumers want an immutable reference

Different actions in this repository can be referenced at different SHAs if needed:

```yaml
jobs:
  first_job:
    runs-on: ubuntu-latest
    steps:
      - uses: elastic/github-actions/litellm-token@abc123 # v3.1.0

  second_job:
    runs-on: ubuntu-latest
    steps:
      - uses: elastic/github-actions/action-two@def456 # v3.0.0
```

## Development

The root toolchain uses [pnpm](https://pnpm.io/) (see `packageManager` in [`package.json`](package.json) for exact version). Use a Node.js version that matches `engines.node`, enable Corepack, then install and run scripts from the repository root:

```bash
corepack enable
pnpm install
```

Repository scripts in `scripts/` are authored in TypeScript and run with `tsx`. They are covered by the standard root checks:

- `pnpm typecheck` for script typechecking and editor-friendly TS support
- `pnpm lint` for `oxlint`
- `pnpm test` for Vitest coverage
- `pnpm build` to execute `scripts/build-actions.ts`

### Adding A New Action

New actions should be created as top-level directories. A minimal example looks like this:

```text
my-action/
  action.yml
  src/
    index.ts
    pre.ts      # optional
    post.ts     # optional
  dist/
    index.js
    pre.js      # generated when src/pre.ts exists
    post.js     # generated when src/post.ts exists
    licenses.txt
```

Example `action.yml`:

```yaml
name: My Action
description: Example action layout for this repository

runs:
  using: node24
  main: dist/index.js
  pre: dist/pre.js
  post: dist/post.js
```

Example usage after release:

```yaml
steps:
  - uses: elastic/github-actions/my-action@v1
```

The important part is that `dist/` is committed before release so consumers can run the action
directly from the repository ref they pin to. In this repository, `dist/` is treated as a generated
artifact:

- Pull requests are reviewed as source changes and must build successfully.
- Release PRs must include up to date, committed `dist/` output before merging.
- Releases rebuild and fail if a fresh build would change committed output, so release tags always
  point to commits with up-to-date `dist/`.

CI installs dependencies with `pnpm install --frozen-lockfile`, so changes that require lockfile
updates must include an updated `pnpm-lock.yaml`.

The build treats any **top-level directory** that contains an `action.yml` as an action and builds it with `@vercel/ncc`.

Build assumptions for root-managed actions:

- `src/index.ts` is required and always builds to `dist/index.js`
- `src/pre.ts` is optional and, when present, builds to `dist/pre.js`
- `src/post.ts` is optional and, when present, builds to `dist/post.js`
- `pnpm build` deletes each action's existing `dist/` directory before rebuilding generated output
- `dist/licenses.txt` is generated from the main bundle build

If an action declares JavaScript lifecycle hooks in `action.yml`, they should follow the same output convention:

```yaml
runs:
  using: node24
  main: dist/index.js
  pre: dist/pre.js
  post: dist/post.js
```

### Release tags and floating majors

The root [`package.json`](package.json) version is the release source of truth for this repository.

Use the release helper script to create a same-repo `release/**` branch and open the release pull
request:

```bash
bash scripts/create-release-pr.sh 2.1.3
```

The helper finds the remote that points at `elastic/github-actions`, creates `release/v<version>`
from that remote's `master`, updates the root `package.json` version, rebuilds committed `dist/`
output, pushes the branch, and opens a pull request titled `Release v<version>`.

After merge, the `publish-release` workflow:

- reads the merged package version and creates the matching `vX.Y.Z` tag
- generates release notes automatically with GitHub
- uses [`.github/release.yml`](.github/release.yml) labels and categories to section the release notes
- force-updates the floating major tag (for example `v3`)
