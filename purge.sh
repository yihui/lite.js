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

# visit the latest index page and make sure it's accessible
curl -sSfL "https://cdn.jsdelivr.net/npm/@xiee/utils@${tag2}/" | grep ${tag2#v}
