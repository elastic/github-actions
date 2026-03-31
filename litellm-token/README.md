# LiteLLM Token

Mint a short-lived LiteLLM API key for a GitHub workflow and automatically revoke it when the job finishes.

The action creates a LiteLLM virtual key during the main step and uses its post step to clean the key up at the end of the job. In addition to any custom metadata you provide, the action also attaches GitHub runtime metadata such as the repository, workflow, run ID, actor, event name, workflow run URL, and pull request number when it is available.

## Usage

Use the action from this repository with the standard subdirectory syntax. Splitting the workflow into multiple jobs is recommended to ensure that AI agents only have access to the ephemeral secrets referenced directly in their job:

```yaml
jobs:
  mint-token:
    runs-on: ubuntu-latest
    permissions: {}
    outputs:
      api_key: ${{ steps.mint.outputs.api_key }}
    steps:
      - name: Mint LiteLLM token
        id: mint
        uses: elastic/github-actions/litellm-token@v3
        with:
          base-url: ${{ secrets.LITELLM_BASE_URL }}
          master-key: ${{ secrets.LITELLM_API_KEY }}
          models: llm-gateway/claude-opus-4-5
          key-ttl: 15m
          max-budget: '5'

  claude-review:
    needs: mint-token
    runs-on: ubuntu-latest
    permissions:
      contents: read
      issues: read
      pull-requests: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2

      - name: Run Claude PR Review
        uses: anthropics/claude-code-action@64c7a0ef71df67b14cb4471f4d9c8565c61042bf # v1.0.66
        with:
          anthropic_api_key: ${{ needs.mint-token.outputs.api_key }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
          prompt: '/review'
          claude_args: '--max-turns 5'
        env:
          ANTHROPIC_BASE_URL: ${{ secrets.LITELLM_BASE_URL }}
          ANTHROPIC_MODEL: 'llm-gateway/claude-opus-4-5'
```

## Inputs

| Input        | Required | Default | Description                                                                             |
| ------------ | -------- | ------- | --------------------------------------------------------------------------------------- |
| `base-url`   | Yes      |         | LiteLLM proxy base URL                                                                  |
| `master-key` | Yes      |         | LiteLLM master key used to manage virtual keys                                          |
| `models`     | Yes      |         | Comma-separated models for mint operations                                              |
| `key-ttl`    | No       | `15m`   | TTL for minted keys, for example `15m` or `1h`                                          |
| `max-budget` | No       | `5`     | Maximum budget for the minted key                                                       |
| `metadata`   | No       |         | Newline-delimited `key=value` metadata entries merged into the LiteLLM metadata payload |

## Output

| Output    | Description                |
| --------- | -------------------------- |
| `api_key` | The minted LiteLLM API key |
