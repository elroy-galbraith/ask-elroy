#!/usr/bin/env bash
# Build: concatenate the sources into one self-contained index.html, then check it parses.
# There is no bundler on purpose — the whole app must stay readable as one file.
set -euo pipefail
cd "$(dirname "$0")"

# 1. Precomputed passage vectors (src/vectors.js). Regenerated only when the corpus,
#    the doc IDs or the chunker have moved; otherwise this is a no-op and needs no
#    network. See tools/embed.mjs.
node tools/embed.mjs --ensure

# 2. Independent gate. Drift between src/vectors.js and the corpus does not throw at
#    runtime — the vectors simply line up with the wrong passages and every answer
#    gets quietly worse. So it is a build error here, never a warning.
node tools/embed.mjs --verify

cat src/head.html src/corpus.js src/eval.js src/chunk.js src/vectors.js src/engine.js src/ui.js src/tail.html > index.html

# extract the script block and syntax-check it
sed -n '/^<script>$/,/^<\/script>$/p' index.html | sed '1d;$d' > /tmp/ask-elroy-bundle.js
node --check /tmp/ask-elroy-bundle.js

printf 'built index.html  (%s bytes, %s corpus entries, %s vector bytes)\n' \
  "$(wc -c < index.html)" "$(grep -c '^{cat:' src/corpus.js)" "$(wc -c < src/vectors.js)"
