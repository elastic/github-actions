# LiteLLM Token

Mint and revoke short-lived LiteLLM API keys for GitHub workflows.

The action supports two explicit operations: `mint` to create a scoped ephemeral key and `revoke` to delete it. In addition to any custom metadata you provide, the mint operation attaches GitHub runtime metadata such as the repository, workflow, run ID, actor, event name, workflow run URL, and pull request number when available.

## Security Model

The recommended workflow layout keeps the LiteLLM master key isolated from jobs that process external input. Only privileged mint and cleanup jobs should have access to the master key. Agent jobs should only receive the ephemeral minted key through job outputs.

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
        with:
          persist-credentials: false

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

  cleanup:
    if: ${{ always() }}
    needs: [mint-token, claude-review]
    runs-on: ubuntu-latest
    permissions: {}
    steps:
      - name: Revoke LiteLLM token
        uses: elastic/github-actions/litellm-token@v3
        with:
          operation: revoke
          base-url: ${{ secrets.LITELLM_BASE_URL }}
          master-key: ${{ secrets.LITELLM_API_KEY }}
          api-key: ${{ needs.mint-token.outputs.api_key }}
```

If no cleanup job is added, the ephemeral key expires automatically based on the `key-ttl` value set during minting (default 15 minutes).

## Inputs

| Input        | Required | Default | Description                                                                             |
| ------------ | -------- | ------- | --------------------------------------------------------------------------------------- |
| `operation`  | No       | `mint`  | Operation to perform: `mint` or `revoke`                                                |
| `base-url`   | Yes      |         | LiteLLM proxy base URL                                                                  |
| `master-key` | Yes      |         | LiteLLM master key used to manage virtual keys                                          |
| `models`     | Yes\*    |         | Comma-separated models (required for `mint`)                                            |
| `key-ttl`    | No       | `15m`   | TTL for minted keys, for example `15m` or `1h`                                          |
| `max-budget` | No       | `5`     | Maximum budget for the minted key                                                       |
| `metadata`   | No       |         | Newline-delimited `key=value` metadata entries merged into the LiteLLM metadata payload |
| `api-key`    | Yes\*    |         | The LiteLLM API key to revoke (required for `revoke`)                                   |

\* `models` is required when `operation` is `mint`. `api-key` is required when `operation` is `revoke`.

## Output

| Output    | Description                                                |
| --------- | ---------------------------------------------------------- |
| `api_key` | The minted LiteLLM API key (only set for `mint` operation) |
