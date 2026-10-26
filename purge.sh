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

# wait (up to ~10 min) for the new version to show up on jsdelivr
url="https://cdn.jsdelivr.net/npm/@xiee/utils@${tag2}/"
for i in $(seq 20); do
  echo "checking: $url"
  sleep 30
  curl -sSfL "$url" | grep "${tag2#v}" >/dev/null && exit 0
done
echo "${tag2} not available on jsdelivr" >&2
exit 1
