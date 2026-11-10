#!/bin/sh
# Make a release: push main, wait for CI (test.yml) to pass on it, then bump the
# version in package.json and package-lock.json, commit it as "Bump to X.Y.Z", tag
# it vX.Y.Z, and push both. Pushing the tag triggers npm-publish.yml.
# The tests run on GitHub Actions, not locally (parallel browsers can exceed the
# thread limit of a shared machine).
#
# Usage: ./release.sh [-t] [patch|minor|major|X.Y.Z]   (default: patch)
#   -t  skip waiting for CI

set -e

wait_ci=1
while getopts t o; do
  case $o in
    t) wait_ci= ;;
    *) exit 2 ;;
  esac
done
shift $((OPTIND - 1))

cd "$(dirname "$0")"
[ "$(git branch --show-current)" = main ] || { echo "not on main" >&2; exit 1; }
git diff --quiet HEAD -- || { echo "uncommitted changes in tracked files" >&2; exit 1; }

git push origin main
if [ -n "$wait_ci" ]; then
  sha=$(git rev-parse HEAD)
  echo "waiting for CI on $sha"
  # the run appears a few seconds after the push
  id=
  while [ -z "$id" ]; do
    sleep 5
    id=$(gh run list --workflow test.yml --commit "$sha" --json databaseId -q '.[0].databaseId')
  done
  gh run watch "$id" --exit-status || { echo "CI failed; not releasing" >&2; exit 1; }
fi

# updates both package.json and package-lock.json, without committing or tagging
v=$(npm version "${1:-patch}" --no-git-tag-version | sed 's/^v//')
git add package.json package-lock.json
git commit -q -m "Bump to $v"
git tag "v$v"
git push origin main "v$v"
echo "released v$v"
