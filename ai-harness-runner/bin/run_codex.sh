#!/usr/bin/env bash

set -euo pipefail

workspace=''
working_directory='.'
codex_version='0.113.0'
provider_auth_env_name='OPENAI_API_KEY'
codex_config_file=''
prompt_file=''
output_dir=''
last_response_file=''
stdout_log_file=''
manifest_file=''
outputs_file=''
installed_codex_config_file=''

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
    --codex-version)
      codex_version="$2"
      shift 2
      ;;
    --provider-auth-env-name)
      provider_auth_env_name="$2"
      shift 2
      ;;
    --codex-config-file)
      codex_config_file="$2"
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
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -n "$output_dir" ]]; then
  mkdir -p "$output_dir"
  last_response_file="${output_dir}/last_response.md"
  stdout_log_file="${output_dir}/stdout.log"
  manifest_file="${output_dir}/manifest.json"
  outputs_file="${output_dir}/outputs.json"
fi

write_outputs() {
  if [[ -z "$outputs_file" ]]; then
    return
  fi

  jq -n \
    '{
      version: 1,
      message: {
        format: "markdown",
        path: "last_response.md"
      }
    }' > "$outputs_file"
}

write_manifest() {
  local status="$1"
  local error_message="${2:-}"

  if [[ -z "$manifest_file" ]]; then
    return
  fi

  jq -n \
    --arg harness 'codex' \
    --arg codex_version "$codex_version" \
    --arg workspace "$workspace" \
    --arg working_directory "$working_directory" \
    --arg last_response_file "$last_response_file" \
    --arg stdout_log_file "$stdout_log_file" \
    --arg outputs_file "$outputs_file" \
    --arg provider_auth_env_name "$provider_auth_env_name" \
    --arg codex_config_file "$installed_codex_config_file" \
    --arg status "$status" \
    --arg error_message "$error_message" \
    '{
      harness: $harness,
      codexVersion: $codex_version,
      workspace: $workspace,
      workingDirectory: $working_directory,
      lastResponseFile: $last_response_file,
      stdoutLogFile: $stdout_log_file,
      outputsFile: $outputs_file,
      providerAuthEnvName: $provider_auth_env_name,
      codexConfigFile: $codex_config_file,
      status: $status,
      error: $error_message
    }' > "$manifest_file"
}

fail() {
  local message="$1"

  if [[ -n "$stdout_log_file" ]]; then
    printf '%s\n' "$message" | tee -a "$stdout_log_file" >&2
  else
    printf '%s\n' "$message" >&2
  fi

  if [[ -n "$last_response_file" ]]; then
    printf '%s\n' "$message" > "$last_response_file"
  fi

  write_outputs
  write_manifest 'failed' "$message"
  exit 1
}

if [[ -z "$workspace" || -z "$prompt_file" || -z "$output_dir" ]]; then
  fail 'Missing required arguments.'
fi

if [[ ! -d "$workspace" ]]; then
  fail "Workspace does not exist: $workspace"
fi

if [[ ! -f "$prompt_file" ]]; then
  fail "Prompt file does not exist: $prompt_file"
fi

if [[ -z "$provider_auth_env_name" ]]; then
  fail 'Provider auth environment variable name is required.'
fi

provider_auth_value="${!provider_auth_env_name:-}"

if [[ -z "$provider_auth_value" ]]; then
  fail "${provider_auth_env_name} is required."
fi

run_dir="${workspace}/${working_directory}"

if [[ ! -d "$run_dir" ]]; then
  fail "Working directory does not exist: $run_dir"
fi
runtime_home="${output_dir}/home"
mkdir -p "$runtime_home"

cd "$run_dir"

export HOME="$runtime_home"
export CODEX_HOME="${HOME}/.codex"
mkdir -p "$CODEX_HOME"

if [[ -n "$codex_config_file" ]]; then
  if [[ ! -f "$codex_config_file" ]]; then
    fail "Codex config file does not exist: $codex_config_file"
  fi

  installed_codex_config_file="${CODEX_HOME}/config.toml"
  cp "$codex_config_file" "$installed_codex_config_file"
fi

prompt="$(cat "$prompt_file")"

set +e
npx -y "@openai/codex@${codex_version}" exec \
  --dangerously-bypass-approvals-and-sandbox \
  --skip-git-repo-check \
  --ephemeral \
  --output-last-message "$last_response_file" \
  "$prompt" \
  2>&1 | tee "$stdout_log_file"
codex_exit=${PIPESTATUS[0]}
set -e

if [[ $codex_exit -ne 0 ]]; then
  if [[ ! -f "$last_response_file" ]]; then
    printf 'Codex CLI exited with code %s.\n' "$codex_exit" > "$last_response_file"
  fi

  write_outputs
  write_manifest 'failed' "Codex CLI exited with code ${codex_exit}."
  exit "$codex_exit"
fi

if [[ ! -f "$last_response_file" ]]; then
  echo "Codex finished without writing a last response file." > "$last_response_file"
fi

write_outputs
write_manifest 'completed'
