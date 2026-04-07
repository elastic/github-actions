#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "Usage: bash scripts/create-release-pr.sh <x.y.z>" >&2
}

if [ "$#" -ne 1 ]; then
  usage
  exit 1
fi

VERSION="$1"

if [[ ! "${VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Version must use x.y.z semver; received: ${VERSION}" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree must be clean before creating a release PR." >&2
  exit 1
fi

find_upstream_remote() {
  local remote
  local url

  while IFS= read -r remote; do
    url="$(git remote get-url "${remote}")"

    if [[ "${url}" == *elastic/github-actions* ]]; then
      printf '%s\n' "${remote}"
      return 0
    fi
  done < <(git remote)

  return 1
}

REMOTE_NAME="$(find_upstream_remote)" || {
  echo "Could not find a git remote that points to elastic/github-actions." >&2
  exit 1
}

BRANCH_NAME="release/v${VERSION}"
CURRENT_VERSION="$(node --print "require('./package.json').version")"

if [ "${CURRENT_VERSION}" = "${VERSION}" ]; then
  echo "package.json is already at version ${VERSION}." >&2
  exit 1
fi

if git show-ref --verify --quiet "refs/heads/${BRANCH_NAME}"; then
  echo "Local branch ${BRANCH_NAME} already exists." >&2
  exit 1
fi

git fetch "${REMOTE_NAME}"

if git ls-remote --exit-code --heads "${REMOTE_NAME}" "${BRANCH_NAME}" >/dev/null 2>&1; then
  echo "Remote branch ${REMOTE_NAME}/${BRANCH_NAME} already exists." >&2
  exit 1
fi

git checkout -b "${BRANCH_NAME}" "${REMOTE_NAME}/master"

npm pkg set version="${VERSION}"

git add package.json
git commit -m "release: prepare v${VERSION}"
git push -u "${REMOTE_NAME}" "${BRANCH_NAME}"

gh pr create \
  --repo elastic/github-actions \
  --base master \
  --head "${BRANCH_NAME}" \
  --title "Release v${VERSION}"
