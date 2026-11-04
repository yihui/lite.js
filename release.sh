#!/bin/sh
# Make a release: bump the version in package.json and package-lock.json, commit it
# as "Bump to X.Y.Z", and tag it vX.Y.Z. Pushing the tag triggers npm-publish.yml,
# so the push is a separate step: pass -p to do it.
#
# Usage: ./release.sh [-p] [-t] [patch|minor|major|X.Y.Z]   (default: patch)
#   -p  push the commit and the tag
#   -t  skip the tests

set -e

push= test=1
while getopts pt o; do
  case $o in
    p) push=1 ;;
    t) test= ;;
    *) exit 2 ;;
  esac
done
shift $((OPTIND - 1))

cd "$(dirname "$0")"
[ "$(git branch --show-current)" = main ] || { echo "not on main" >&2; exit 1; }
git diff --quiet HEAD -- || { echo "uncommitted changes in tracked files" >&2; exit 1; }

[ -z "$test" ] || npm test

# updates both package.json and package-lock.json, without committing or tagging
v=$(npm version "${1:-patch}" --no-git-tag-version | sed 's/^v//')
git add package.json package-lock.json
git commit -q -m "Bump to $v"
git tag "v$v"
echo "committed and tagged v$v"

if [ -n "$push" ]; then
  git push origin main "v$v"
else
  echo "to publish: git push origin main v$v"
fi
