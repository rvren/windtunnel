#!/usr/bin/env bash
# Publishes each folder of samples/storefront to its own private repository,
# <owner>/storefront-<service>. Creates the repository if it is missing and
# updates it if it exists. Needs the GitHub CLI, signed in as the owner.
#
#   scripts/publish-samples.sh [owner]      (owner defaults to rvren)
set -euo pipefail

owner="${1:-rvren}"
root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

for dir in "$root"/samples/storefront/*/; do
  service="$(basename "$dir")"
  repo="$owner/storefront-$service"
  if ! gh repo view "$repo" >/dev/null 2>&1; then
    gh repo create "$repo" --private \
      --description "Storefront sample for Windtunnel: $service. Flaws are deliberate." >/dev/null
    echo "created  $repo"
  fi
  copy="$work/$service"
  mkdir -p "$copy"
  cp -R "$dir". "$copy"
  (
    cd "$copy"
    git init -q -b main
    git add -A
    git -c user.name="$(git -C "$root" config user.name)" \
        -c user.email="$(git -C "$root" config user.email)" \
        commit -q -m "Storefront sample: $service"
    git push -q --force "https://github.com/$repo.git" main
  )
  echo "pushed   $repo"
done
