#!/usr/bin/env bash
# Build: concatenate the sources into one self-contained index.html, then check it parses.
# There is no bundler on purpose — the whole app must stay readable as one file.
set -euo pipefail
cd "$(dirname "$0")"

cat src/head.html src/corpus.js src/eval.js src/engine.js src/ui.js src/tail.html > index.html

# extract the script block and syntax-check it
sed -n '/^<script>$/,/^<\/script>$/p' index.html | sed '1d;$d' > /tmp/ask-elroy-bundle.js
node --check /tmp/ask-elroy-bundle.js

printf 'built index.html  (%s bytes, %s corpus entries)\n' \
  "$(wc -c < index.html)" "$(grep -c '^{cat:' src/corpus.js)"
