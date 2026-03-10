#!/usr/bin/env bash

set -euo pipefail

workspace=''
working_directory='.'
codex_version='0.113.0'
provider='openai'
model=''
litellm_base_url=''
prompt=''
prompt_file=''
output_dir=''
created_prompt_file=0
created_codex_config_file=0
codex_config_file=''
provider_auth_env_name='OPENAI_API_KEY'

usage() {
  cat <<'EOF'
Usage:
  run_local_smoke_test.sh --workspace PATH [options]

Options:
  --workspace PATH            Absolute or relative path to the checked out repo.
  --working-directory PATH    Relative path inside the workspace. Default: .
  --provider PROVIDER         Supported values: openai, litellm. Default: openai
  --model MODEL               Optional model override. Required for litellm.
  --litellm-base-url URL      LiteLLM base URL. Required for litellm.
  --prompt TEXT               Prompt to send to Codex.
  --prompt-file PATH          File containing the prompt to send to Codex.
  --output-dir PATH           Output directory for harness artifacts.
  --codex-version VERSION     Exact @openai/codex version. Default: 0.113.0
  --help                      Show this help text.

If neither --prompt nor --prompt-file is provided, a read-only repository
summary prompt is used by default.

The script validates that the harness artifacts are written with the expected
shape. It exits with the same status as the underlying harness run.
EOF
}

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --workspace)
      workspace="$2"
      shift 2
      ;;
    --working-directory)
      working_directory="$2"
      shift 2
      ;;
    --provider)
      provider="$2"
      shift 2
      ;;
    --model)
      model="$2"
      shift 2
      ;;
    --litellm-base-url)
      litellm_base_url="$2"
      shift 2
      ;;
    --prompt)
      prompt="$2"
      shift 2
      ;;
    --prompt-file)
      prompt_file="$2"
      shift 2
      ;;
    --output-dir)
      output_dir="$2"
      shift 2
      ;;
    --codex-version)
      codex_version="$2"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

if [[ -z "$workspace" ]]; then
  fail '--workspace is required.'
fi

if [[ -n "$prompt" && -n "$prompt_file" ]]; then
  fail 'Use either --prompt or --prompt-file, not both.'
fi

if [[ ! -d "$workspace" ]]; then
  fail "Workspace does not exist: $workspace"
fi

if [[ -z "$output_dir" ]]; then
  output_dir="$(mktemp -d "${TMPDIR:-/tmp}/ai-harness-smoke.XXXXXX")"
fi

if [[ -z "$prompt" && -z "$prompt_file" ]]; then
  prompt='List the top-level files and directories in the repository root and provide a short markdown summary. Do not modify any files.'
fi

if [[ -n "$prompt" ]]; then
  prompt_file="$(mktemp "${TMPDIR:-/tmp}/ai-harness-prompt.XXXXXX")"
  printf '%s' "$prompt" > "$prompt_file"
  created_prompt_file=1
fi

cleanup() {
  if [[ $created_prompt_file -eq 1 && -n "$prompt_file" && -f "$prompt_file" ]]; then
    rm -f "$prompt_file"
  fi
  if [[ $created_codex_config_file -eq 1 && -n "$codex_config_file" && -f "$codex_config_file" ]]; then
    rm -f "$codex_config_file"
  fi
}

trap cleanup EXIT

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

case "$provider" in
  openai)
    provider_auth_env_name='OPENAI_API_KEY'
    if [[ -n "$model" ]]; then
      codex_config_file="$(mktemp "${TMPDIR:-/tmp}/ai-harness-codex-config.XXXXXX")"
      created_codex_config_file=1
      "${repo_root}/ai-harness-runner/bin/write_codex_config.sh" \
        --provider openai \
        --model "$model" \
        --output-file "$codex_config_file"
    fi
    ;;
  litellm)
    provider_auth_env_name='LITELLM_API_KEY'
    if [[ -z "$model" ]]; then
      fail '--model is required with --provider litellm.'
    fi
    if [[ -z "$litellm_base_url" ]]; then
      fail '--litellm-base-url is required with --provider litellm.'
    fi
    codex_config_file="$(mktemp "${TMPDIR:-/tmp}/ai-harness-codex-config.XXXXXX")"
    created_codex_config_file=1
    "${repo_root}/ai-harness-runner/bin/write_codex_config.sh" \
      --provider litellm \
      --model "$model" \
      --base-url "$litellm_base_url" \
      --env-key "$provider_auth_env_name" \
      --output-file "$codex_config_file"
    ;;
  *)
    fail "Unsupported provider: $provider"
    ;;
esac

if [[ -z "${!provider_auth_env_name:-}" ]]; then
  fail "${provider_auth_env_name} is required."
fi

runner_exit=0

set +e
"${repo_root}/ai-harness-runner/bin/run_codex.sh" \
  --workspace "$workspace" \
  --working-directory "$working_directory" \
  --codex-version "$codex_version" \
  --provider-auth-env-name "$provider_auth_env_name" \
  --codex-config-file "$codex_config_file" \
  --prompt-file "$prompt_file" \
  --output-dir "$output_dir"
runner_exit=$?
set -e

manifest_file="${output_dir}/manifest.json"
outputs_file="${output_dir}/outputs.json"
last_response_file="${output_dir}/last_response.md"
stdout_log_file="${output_dir}/stdout.log"
expected_status='completed'

if [[ $runner_exit -ne 0 ]]; then
  expected_status='failed'
fi

[[ -f "$manifest_file" ]] || fail "Missing manifest file: $manifest_file"
[[ -f "$outputs_file" ]] || fail "Missing outputs file: $outputs_file"
[[ -f "$last_response_file" ]] || fail "Missing last response file: $last_response_file"
[[ -f "$stdout_log_file" ]] || fail "Missing stdout log file: $stdout_log_file"

jq -e \
  --arg workspace "$workspace" \
  --arg working_directory "$working_directory" \
  --arg last_response_file "$last_response_file" \
  --arg stdout_log_file "$stdout_log_file" \
  --arg outputs_file "$outputs_file" \
  --arg provider_auth_env_name "$provider_auth_env_name" \
  --arg expected_status "$expected_status" \
  '
    .harness == "codex" and
    .workspace == $workspace and
    .workingDirectory == $working_directory and
    .lastResponseFile == $last_response_file and
    .stdoutLogFile == $stdout_log_file and
    .outputsFile == $outputs_file and
    .providerAuthEnvName == $provider_auth_env_name and
    .status == $expected_status
  ' "$manifest_file" > /dev/null || fail "Manifest contents did not validate: $manifest_file"

jq -e '
  .version == 1 and
  .message.format == "markdown" and
  .message.path == "last_response.md"
' "$outputs_file" > /dev/null || fail "Outputs contents did not validate: $outputs_file"

printf 'Smoke test artifacts validated.\n'
printf 'Output directory: %s\n' "$output_dir"
printf 'Harness exit code: %s\n' "$runner_exit"
printf 'Manifest status: %s\n' "$expected_status"

exit "$runner_exit"
