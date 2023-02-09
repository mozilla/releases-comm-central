#!/bin/sh

set -e

yarn install
npm install --no-save esbuild

echo 'export * as asn1js from "./src/index.ts";' | \
  ./node_modules/.bin/esbuild --bundle \
  --sourcefile=entry.js \
  --loader=ts \
  --format=esm \
  --target=es2019 \
  --log-level=verbose \
  --outfile=asn1js.mjs

rm -rf node_modules
