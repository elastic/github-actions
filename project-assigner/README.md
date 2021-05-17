# Project Assigner GitHub Action

This is a GitHub action, implemented in JavaScript, which does the following:
  - Assigns an issue or pull request to a project when a specified label is applied
  - Removes an issue or pull request from a project when a specified label is removed

You can provide multiple label to project mappings as the action input.

## Inputs

### `issue-mappings`
A JSON array of objects containing `label`, `projectNumber`, and `columnName` attributes.

**`label`** - name of the GitHub label that should trigger this action when it's applied to or removed from an issue or a pull request.

**`projectNumber`** - number of the project that an issue or pull request should be assinged to when the label is applied, or removed from when the label is removed.

**`projectScope`** - Optional. Defaults to `repo`. One of: `repo`, `user`, or `org`. Indicate where the assigned project resides, for example at the organization level or a repository level. For `org` and `user` projects, you will need to specify a custom GitHub API token. See `ghToken` below.

**`columnName`** - *name* of the GitHub project column that an issue or a pull request should be placed in when they're assigned to the project.  For issues, this would typically be the "To do" column. For pull requests, this may be the "In Review" column. You should use your own discretion when choosing which columns to use for your particular project.

Here's a sample format of the `issue-mappings` input:

```
issue-mappings: |
  [
    {"label": "Test", "projectNumber": "21", "columnName": "To do"},
    {"label": "bug", "projectNumber": "3", "projectScope": "org", "columnName": "In Review"}
  ]
```

### `ghToken`

Specify a secret GitHub API token with access to read/write issues, PRs, and project cards for the target repo and project.

The `GITHUB_TOKEN` secret is available by default on all repositories. This token has sufficient permissions to add and remove cards from any projects within the issue or PR's own repository. Reference this secret using:

```
ghToken: ${{ secrets.GITHUB_TOKEN }}
```

If you need to read/write project cards in a `user` or `org` project, generate an API token with sufficient privileges under https://github.com/settings/tokens. Store the secret in the workflow repository's secrets as `MY_PROJECT_ASSIGNER_TEST_TOKEN`, for example. See `https://github.com/$ORG/$REPO/settings/secrets/actions`. Reference this repository secret in your workflow using:

```
ghToken: ${{ secrets.MY_PROJECT_ASSIGNER_TEST_TOKEN }}
```


## Example usage

In order to use this action, create a workflow configuration file (e.g. `issues-workflow.yml`) in your repository's `.github/workflows` directory. *Note that you need to have GitHub Actions enabled for your repository in order for this to work!*

### A workflow configuration for assigning issues to projects

```
on:
  issues:
    # `labeled`: adds cards to projects when a label is added.
    # `unlabeled`: removes cards from projects when a label is removed.
    types: [labeled, unlabeled]

jobs:
  assign_to_project:
    runs-on: ubuntu-latest
    name: Assign or remove an issue from a project based on a label
    steps:
      - name: Assign to project
        uses: elastic/github-actions/project-assigner@v2.1.0
        id: project_assigner
        with:
          issue-mappings: |
            [
              {"label": "Test", "projectNumber": "21", "columnName": "To do", "projectScope": "repo"},
              {"label": "bug", "projectNumber": "3", "columnName": "In Review", "projectScope": "org"}
            ]

          # The GITHUB_TOKEN secret is available by default on all repositories.
          # This token has sufficient permissions to add and remove cards from any
          # projects within this repository.
          ghToken: ${{ secrets.GITHUB_TOKEN }}

          # To let this action add issues to an organization or user level project,
          # set the projectScope attribute in issue-mappings and set a custom
          # GitHub API token below, stored in the repo's Secrets settings.
          #ghToken: ${{ secrets.PROJECT_ASSIGNER_TEST_TOKEN }}
```

### A workflow configuration for assigning and unassigning pull requests to projects

```
on:
  pull_request:
    types: [labeled, unlabeled]

jobs:
  assign_to_project:
    runs-on: ubuntu-latest
    name: Assign or remove a PR from a project based on a label
    steps:
      - name: Assign to project
        uses: elastic/github-actions/project-assigner@v2.1.0
        id: project_assigner
        with:
          issue-mappings: |
            [
              {"label": "Test", "projectNumber": "21", "columnName": "To do", "projectScope": "repo"},
              {"label": "enhancement", "projectNumber": "3", "columnName": "In Review", "projectScope": "repo"}
            ]
          ghToken: ${{ secrets.GITHUB_TOKEN }}
```

## Development

To make changes to this action's source code, fork this repository and make any edits you need.

Rebuild the `dist/index.js` file to include all packages by running:
```
npm run build
```

If you are pushing many changes to your own fork and testing iteratively, you'll want to re-push the release tags so that your test projects can run actions with your new code.
```
git tag -d vX.y.z
git tag -a -m "vX.y.z" vX.y.z
git push --force origin master --tags  # BE CAREFUL!
```

GitHub's [GraphQL Explorer](https://docs.github.com/en/graphql/overview/explorer) helps when debugging queries.

### Testing

#### Unit testing
```
npm test
```

#### Manual testing

Create a project and test repository in your own GitHub account. Push your built action with tags to your own fork of this repo. Reference your project-assigner tagged build in your own workflow `yml`.

Testing suggestions:
- [ ] Issues
  - [ ] Create an issue with a project label
  - [ ] Remove a project label from an issue and re-apply
  - [ ] Also test assigning to a project with a user project and an org project using a custom ghToken repository secret
- [ ] Pull requests
  - [ ] Create a PR with a project label
  - [ ] Remove a project label from a PR and re-apply
  - [ ] Also test assigning to a project with a user project and an org project using a custom ghToken repository secret
