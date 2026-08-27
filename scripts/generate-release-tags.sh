#!/usr/bin/env bash

# This script is executed after the version is bumped by lerna. It generates a release tag.
# The release tag generated will be pushed to the repository by lerna version.
set -e

sha=$(git rev-parse HEAD)
branch=$(git rev-parse --symbolic-full-name --abbrev-ref HEAD)
message=$(git log -1 --pretty=%B)

RELEASE_COMMIT_PREFIX="chore(release):"

function pre_tag_checks() {
  # # Only generate release tags for main branch
  if [[ $branch != "main" ]]; then
    echo "Skipping release tag generation as branch is not main"
    exit 0
  fi;

  if [[ $message != "$RELEASE_COMMIT_PREFIX"* ]]; then
    echo "Skipping release tag generation as last commit is not a release commit"
    exit 0
  fi;

  # check if jq is installed
  if ! command -v jq &> /dev/null; then
      echo "jq could not be found. Please install jq to generate release tag."
      exit 1
  fi
}

function generate_monorepo_tag() {
  # Generate and push release tag. Release tag format: release-YYYY-MM-DD[.N] e.g. release-2026-01-01
  if ! n=$(git rev-list --count "$sha~" --grep "$RELEASE_COMMIT_PREFIX" --since="00:00"); then
      echo 'Failed to compute release tag. Exiting.'
      exit 1
  else
      case "$n" in
          0) suffix="" ;; # first commit of the day gets no suffix
          *) suffix=".$n" ;; # subsequent commits get a suffix, starting with .1
      esac

      base_tag=$(date '+%Y-%m-%d')
      tag=$(printf "release-%s%s" "$base_tag" "$suffix")
      echo "Tagging $sha with $tag"
      git tag -a "$tag" -m "Release $tag"
      git push origin "$tag"
  fi
}

function generate_plugin_tags() {
  # List changed package.json files in the last commit
  files=$(git show --pretty="" --name-only HEAD | grep -Ei '^plugins/.*package\.json$')

  # Generate and push release tags for each package.
  # Tag format: <package-name>@<package-version> e.g. @my-org/my-package@1.0.0
  for file in $files; do
    tag=$(jq -r '.name + "@" + .version' "$file")

    echo "Tagging $sha with $tag"
    git tag -a "$tag" -m "Release $tag"
    git push origin "$tag"
  done
}

function main() {
  pre_tag_checks
  generate_monorepo_tag
  generate_plugin_tags
}

main
