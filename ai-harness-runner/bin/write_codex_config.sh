#!/usr/bin/env bash

set -euo pipefail

provider=''
model=''
base_url=''
env_key=''
output_file=''

usage() {
  cat <<'EOF'
Usage:
  write_codex_config.sh --provider PROVIDER --model MODEL --output-file PATH [options]

Options:
  --provider PROVIDER   Supported values: openai, litellm
  --model MODEL         Codex model name to configure.
  --base-url URL        OpenAI-compatible base URL. Required for litellm.
  --env-key NAME        Environment variable containing the provider API key.
                        Required for litellm.
  --output-file PATH    Config file to write.
  --help                Show this help text.
EOF
}

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

toml_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --provider)
      provider="$2"
      shift 2
      ;;
    --model)
      model="$2"
      shift 2
      ;;
    --base-url)
      base_url="$2"
      shift 2
      ;;
    --env-key)
      env_key="$2"
      shift 2
      ;;
    --output-file)
      output_file="$2"
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

if [[ -z "$provider" || -z "$model" || -z "$output_file" ]]; then
  fail '--provider, --model, and --output-file are required.'
fi

model_escaped="$(toml_escape "$model")"
mkdir -p "$(dirname "$output_file")"

case "$provider" in
  openai)
    cat > "$output_file" <<EOF
model = "${model_escaped}"
EOF
    ;;
  litellm)
    if [[ -z "$base_url" || -z "$env_key" ]]; then
      fail '--base-url and --env-key are required for the litellm provider.'
    fi

    base_url_escaped="$(toml_escape "$base_url")"
    env_key_escaped="$(toml_escape "$env_key")"

    cat > "$output_file" <<EOF
model = "${model_escaped}"
model_provider = "litellm"

[model_providers.litellm]
name = "LiteLLM"
base_url = "${base_url_escaped}"
env_key = "${env_key_escaped}"
wire_api = "responses"
EOF
    ;;
  *)
    fail "Unsupported provider: $provider"
    ;;
esac
