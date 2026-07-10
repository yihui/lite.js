#!/bin/sh

set -e

npm config set allow-scripts=lightningcss-cli --location=user
npm install lightningcss-cli terser -g

cd js
for i in *.js; do
  terser $i --compress --mangle --source-map "url='${i%.*}.min.js.map'" --output ${i%.*}.min.js
done

cd ../css
for i in *.css; do
  lightningcss --minify --sourcemap -o ${i%.*}.min.css $i
done

cd ..
