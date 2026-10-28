#!/bin/sh

# purge jsdevlivr cache for assets modified between current and previous tags
JSD_URL="https://purge.jsdelivr.net/npm/@xiee/utils"

tag2=$(git describe --tags --abbrev=0)
tag1=$(git describe --tags --abbrev=0 "$tag2^")
for i in $(git diff --name-only $tag1 $tag2 | grep -E "[.](css|js)$"); do
  if [ -n "$i" ]; then
    curl "${JSD_URL}/${i}"
    curl "${JSD_URL}/$(echo "$i" | sed 's/\(\.[^.]*$\)/.min\1/')"
  fi
done

# wait (up to ~10 min) until the URL's response contains the new version
wait_for() {
  for i in $(seq 20); do
    echo "checking: $1"
    sleep 30
    curl -sSfL "$1" | grep "$2" >/dev/null && return 0
  done
  echo "${tag2} not available on jsdelivr ($1)" >&2
  exit 1
}

ver="${tag2#v}"
# 1. the package listing at the new version
wait_for "https://cdn.jsdelivr.net/npm/@xiee/utils@${tag2}/" "$ver"
# 2. the API, so that the latest version resolves to the new one
wait_for "https://data.jsdelivr.com/v1/packages/npm/@xiee/utils/resolved?specifier=latest" "\"version\":[[:space:]]*\"$ver\""
