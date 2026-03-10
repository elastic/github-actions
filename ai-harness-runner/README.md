# AI Harness Runner

`ai-harness-runner` is a small trusted adapter layer used by the reusable
`ai-isolated-run` workflow.

Current scope:

- supports `harness=codex`
- installs a pinned `@openai/codex` CLI version
- supports direct OpenAI auth or a LiteLLM-backed OpenAI-compatible provider
- runs a single initial prompt
- captures Codex's last response, stdout log, and typed output metadata

This runner is intentionally narrow. It does not accept arbitrary commands from
the caller repository.

First iteration note: the reusable workflow checks out the target repository
with `permissions: {}` and does not pass a checkout token into the harness job.
That keeps the boundary simple, but it means the target repository needs to be
publicly cloneable.

## Inputs

- `harness`: trusted harness adapter to run, currently only `codex`
- `prompt`: initial prompt passed to Codex
- `model_provider`: Codex model provider, currently `openai` or `litellm`
- `model`: optional Codex model name; required for `litellm`
- `workspace`: relative path to the checked out repository
- `working-directory`: relative path inside the repository to run from
- `output-directory`: absolute directory used for harness output
- `codex-version`: exact `@openai/codex` CLI version to install

## Outputs

- `last-response-file`: path to the captured last response file
- `manifest-file`: path to the emitted manifest file
- `outputs-file`: path to the emitted typed outputs file

The harness output directory currently contains:

- `last_response.md`
- `stdout.log`
- `manifest.json`
- `outputs.json`

`outputs.json` is the small typed contract intended for downstream validation
and publish steps. The current Codex adapter writes:

```json
{
  "version": 1,
  "message": {
    "format": "markdown",
    "path": "last_response.md"
  }
}
```

## Reusable workflow

The intended entrypoint is the reusable workflow:

```yaml
jobs:
  run_ai:
    uses: elastic/github-actions/.github/workflows/ai-isolated-run.yml@<ref>
    with:
      runner_ref: <ref>
      model_provider: litellm
      model: <litellm-model>
      prompt: Summarize the repository root files.
      checkout_repo: elastic/kibana
      checkout_ref: main
    secrets:
      litellm_api_key: ${{ secrets.LITELLM_API_KEY }}
      litellm_base_url: ${{ secrets.LITELLM_BASE_URL }}
```

`runner_ref` should match the reusable workflow ref so the called workflow
checks out the same trusted runner code it was invoked from.

Provider notes:

- `model_provider=openai` uses `secrets.openai_api_key` directly.
- `model_provider=litellm` mints a short-lived LiteLLM key, writes a Codex
  provider config, passes only the short-lived key into the harness step, and
  revokes that key after the harness completes.

The reusable workflow provides the least-privilege job boundary. This runner
only handles harness invocation inside that boundary.

## Testing

### GitHub-hosted branch test

This repository now includes a temporary caller workflow at
`.github/workflows/test-ai-isolated-run-kibana.yml`.

- It runs on every push to the `ai-harness-runner` branch.
- It calls the reusable workflow from the same commit under test.
- It checks out `tylersmalley/kibana` at `ai-sandbox`.
- It uses LiteLLM and requires `LITELLM_API_KEY`, `LITELLM_BASE_URL`, and
  `LITELLM_MODEL` secrets in the `elastic/github-actions` repository.

The caller uses `push` rather than `workflow_dispatch` so it can run from a
non-default branch while the workflow itself is still under development.

### Local smoke test

For a faster local validation, run:

```bash
OPENAI_API_KEY=... \
./ai-harness-runner/bin/run_local_smoke_test.sh \
  --workspace /Users/tyler/elastic/kibana-worktrees/ai-sandbox
```

To validate the LiteLLM-backed path locally, provide a LiteLLM key and the same
OpenAI-compatible base URL that Codex should call:

```bash
LITELLM_API_KEY=... \
./ai-harness-runner/bin/run_local_smoke_test.sh \
  --provider litellm \
  --model your-model \
  --litellm-base-url https://litellm.example.com/v1 \
  --workspace /Users/tyler/elastic/kibana-worktrees/ai-sandbox
```

The local helper does not mint or revoke LiteLLM keys. It uses whatever
`LITELLM_API_KEY` you export for that run.

Useful options:

- `--provider litellm`
- `--model your-model`
- `--litellm-base-url https://litellm.example.com/v1`
- `--working-directory x-pack/plugins/foo`
- `--prompt "List the root files and summarize the repo."`
- `--prompt-file /path/to/prompt.txt`
- `--output-dir /tmp/ai-harness-smoke`
- `--codex-version 0.113.0`

The local helper invokes `bin/run_codex.sh` directly and validates that
`manifest.json`, `outputs.json`, `stdout.log`, and `last_response.md` are
written with the expected structure. It exits with the same status as the
underlying harness run.
