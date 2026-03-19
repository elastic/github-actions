# Elastic GitHub Actions

This repository contains GitHub Actions maintained by the Elastic Organization. Each action lives in
its own top-level directory, such as `project-assigner/`.

`project-assigner/` is the existing legacy action in this repository and remains self-contained.
Additional actions can be added alongside it as new top-level directories.

## Using Actions From This Repo

Actions in this repository are consumed with the standard subdirectory syntax:

```yaml
uses: elastic/github-actions/<action-name>@<ref>
```

Examples:

```yaml
steps:
  - uses: elastic/github-actions/project-assigner@v2.1.1
```

```yaml
steps:
  - uses: elastic/github-actions/project-assigner@f443b600d91635bebf5b0d9ebc620189c0d6fba5 # v2.1.1
```

The `@<ref>` portion is always a repository ref. That means a tag, branch, or SHA points to a
commit in `elastic/github-actions`, and GitHub then loads the requested action directory from
that commit.

## Versioning And SHAs

Because refs are repository-wide, action usage looks path-scoped but versioning is commit-scoped.
In practice, this means:

- `elastic/github-actions/project-assigner@v2.1.1` uses the `project-assigner/` directory from
  the repo tag `v2.1.1`
- `elastic/github-actions/my-action@v1.0.0` would use the `my-action/`
  directory from the repo tag `v1.0.0`
- SHA pinning is supported and recommended when consumers want an immutable reference

Different actions in this repository can be referenced at different SHAs if needed:

```yaml
jobs:
  first_job:
    runs-on: ubuntu-latest
    steps:
      - uses: elastic/github-actions/project-assigner@abc123

  second_job:
    runs-on: ubuntu-latest
    steps:
      - uses: elastic/github-actions/my-action@def456
```

## Adding A New Action

New actions should be created as top-level directories. A minimal example looks like this:

```text
my-action/
  action.yml
  src/
    index.ts
  dist/
    index.js
    licenses.txt
```

Example `action.yml`:

```yaml
name: My Action
description: Example action layout for this repository

runs:
  using: node24
  main: dist/index.js
```

Example usage after release:

```yaml
steps:
  - uses: elastic/github-actions/my-action@v1
```

The important part is that `dist/` is committed before release so consumers can run the action
directly from the repository ref they pin to.

For the existing legacy action, see [project-assigner/README.md](project-assigner/README.md).

## Development

The root toolchain uses [pnpm](https://pnpm.io/) (see `packageManager` in [`package.json`](package.json) for exact version). Use a Node.js version that matches `engines.node`, enable Corepack, then install and run scripts from the repository root:

```bash
corepack enable
pnpm install
```
