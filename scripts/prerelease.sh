#!/usr/bin/env bash

set -e

if [[ -n "$(git status --porcelain)" ]]; then
 echo >&2 "ERROR: Uncommitted changes found, please commit or stash them before releasing."
 exit 1
fi

echo "Switching to main and pulling ..."
git switch main
git pull

echo "Checking yarn.lock status ..."
if ! yarn install --immutable; then
  echo >&2 "ERROR: yarn.lock is not up to date, please run yarn install in a feature branch and merge the changes."
  exit 1
fi

target_version="$1"
if [[ -n "$target_version" ]]; then
  echo "Target version specified: $target_version"
else
  echo "No target version specified, using --conventional-commits flag"
  target_version="--conventional-commits"
fi

yarn lerna version --no-git-tag-version --no-private "$target_version"

release_branch="release-$(date +%s)"
git switch --create "$release_branch"
git add --all # include all files including any untracked
git commit --all --signoff --message "chore(release): generate release"
git push --set-upstream origin "$release_branch"

echo "Release notes generated and pushed to \"$release_branch\". Please open a pull request, get it reviewed, and merge to trigger package publishing."
