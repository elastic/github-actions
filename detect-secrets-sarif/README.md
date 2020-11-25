![detect-secrets status](https://github.com/pierre-ernst/github-actions/workflows/.github/workflows/run-detect-secrets-baseline.yml/badge.svg)

# secrets detector 

A GitHub action that pushes detect-secrets findings to GitHub security tab

## Requirements

A GitHub secret named `MGH_TOKEN` must be created on the repo and contain a valid GitHub token for the repo to be monitored by detect-secrets.

## Usage

```yml
on: 
  pull_request:
    types: [ready_for_review]

jobs:
  secrets_detector_job:
    runs-on: ubuntu-latest
    name: A job to push detect-secrets findings to GitHub
    steps:
    - name: push 
      id: push
      uses: elastic/github-actions/secrets-detector@v1.0.0 
      with:
        regex-title: "Issue Trigger - .+"
      env:  
        MGH_TOKEN: ${{ secrets.MGH_TOKEN }}  
    - name: Get the output HTTP response code
      run: echo "The HTTP response code was ${{ steps.push.outputs.http-response-code }}"

```

## Action inputs

| Name | Description | Required |
| --- | --- | ---|
| `snyk-org-id` | Snyk org id (not the org slug), example 4a18d42f-0706-4ad0-b127-24078731fbed | **yes** |

## Action outputs

| Name | Description |
| --- | ---|
| `http-response-code` | HTTP response code returned by the GitHub API |

