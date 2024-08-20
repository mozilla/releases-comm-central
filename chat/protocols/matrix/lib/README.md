This directory contains the Matrix Client-Server SDK for Javascript available
at https://github.com/matrix-org/matrix-js-sdk/. Current version is v34.3.1.

The following npm dependencies are included:

* @matrix-org/olm: https://gitlab.matrix.org/matrix-org/olm/-/packages?type=npm v3.2.15
* another-json: https://www.npmjs.com/package/another-json/ v0.2.0
* base-x: https://www.npmjs.com/package/base-x v4.0.0
* bs58: https://www.npmjs.com/package/bs58 v5.0.0
* content-type: https://www.npmjs.com/package/content-type v1.0.5
* events: https://www.npmjs.com/package/events v3.3.0
* jwt-decode: https://www.npmjs.com/package/jwt-decode v4.0.0
* matrix-events-sdk: https://www.npmjs.com/package/matrix-events-sdk v0.0.1
* matrix-widget-api: https://www.npmjs.com/package/matrix-widget-api v1.6.0
* oidc-client-ts: https://www.npmjs.com/package/oidc-client-ts v3.0.1
* p-retry: https://www.npmjs.com/package/p-retry v4.6.2
* retry: https://www.npmjs.com/package/retry v0.13.1
* sdp-transform: https://www.npmjs.com/package/sdp-transform v2.14.2
* unhomoglyph: https://www.npmjs.com/package/unhomoglyph v1.0.6

The following npm dependencies are shimmed:

* loglevel: The chat framework's logging methods are used internally.
* safe-buffer: A buffer shim, initially modeled after the safe-buffer NPM package,
    now used to provide a Buffer object to the crypto stack.
* uuid: Only the v4 is provided via cryto.randomUUID().

There is not any automated way to update the libraries.

Files have been obtained by downloading the matrix-js-sdk git repository,
using yarn to obtain the dependencies, and then compiling the SDK using Babel.

To make the whole thing work, some file paths and global variables are defined
in `chat/protocols/matrix/matrix-sdk.sys.mjs`.

## Updating matrix-js-sdk

1.  Download the matrix-js-sdk repository from https://github.com/matrix-org/matrix-js-sdk/.
2.  Modify `babel.config.cjs` (see below).
3.  (If this is an old checkout, remove any previous artifacts. Run `rm -r lib; rm -r node_modules`.)
4.  Run `yarn install`.
5.  Run Babel in the matrix-js-sdk checkout:
    `./node_modules/.bin/babel -d lib --extensions ".ts,.js" src`
    (at time of writing identical to `yarn build:compile`)
6.  The following commands assume you're in mozilla-central/comm and that the
    matrix-js-sdk is checked out next to mozilla-central.
7.  Remove the old SDK files `hg rm chat/protocols/matrix/lib/matrix-sdk`
9.  Undo the removal of the license: `hg revert chat/protocols/matrix/lib/matrix-sdk/LICENSE`
0.  Copy the Babel-ified JavaScript files from the matrix-js-sdk to vendored
    location: `cp -r ../../matrix-js-sdk/lib/* chat/protocols/matrix/lib/matrix-sdk`
10. Add the files back to Mercurial: `hg add chat/protocols/matrix/lib/matrix-sdk`
11. Find "empty" files: `md5sum chat/protocols/matrix/lib/**/*.js | grep a7ef62a133eed5bbaa2a23637d04d13b | cut -d "/" -f 5-`
12. Modify `chat/protocols/matrix/lib/moz.build` to add/remove/rename modified
    files. Empty files (see step 11) have no useful content and are not packaged.
13. Modify `matrix-sdk.sys.mjs` to add/remove/rename any changed modules. Empty
    files (see step 11) which are imported should be explictly pointed to `empty.js`.

### Custom `.babelrc`

By default, the matrix-js-sdk targets a version of ECMAScript that is far below
what Gecko supports, this causes lots of additional processing to occur (e.g.
converting async functions, etc.) To disable this, a custom `babel.config.cjs` file is
used:

```javascript
module.exports = {
    sourceMaps: false,
    presets: [
        [
            "@babel/preset-env",
            {
                targets: "last 1 firefox versions",
                modules: "commonjs",
            },
        ],
        "@babel/preset-typescript",
    ],
    plugins: [
        "@babel/plugin-transform-numeric-separator",
        "@babel/plugin-transform-class-properties",
        "@babel/plugin-transform-object-rest-spread",
        "@babel/plugin-syntax-dynamic-import",
    ],
};
```

Babel doesn't natively understand class properties yet, even though we would
support them, thus the class properties plugin. `last 1 firefox versions` tells
babel to compile the code so the latest released Firefox (by the time of the
last update of the packages) could run it. Alternatively a more careful
`firefox ESR` instead of the full string would compile the code so it could run
on any currently supported ESR (I guess useful if you want to uplift the code).

## Updating dependencies

First, follow the steps above. Then, check the `node_modules` directory that
gets created by yarn. The necessary dependencies are available here,
unfortunately each one has slightly different conventions.

### Updating single file dependencies

another-json, base-x, bs58 and content-type all have a single file
named for the package or named index.js. This should get copied to the proper
sub-directory.

```sh
cp ../../matrix-js-sdk/node_modules/another-json/another-json.js chat/protocols/matrix/lib/another-json
cp ../../matrix-js-sdk/node_modules/base-x/src/index.js chat/protocols/matrix/lib/base-x
cp ../../matrix-js-sdk/node_modules/bs58/index.js chat/protocols/matrix/lib/bs58
cp ../../matrix-js-sdk/node_modules/content-type/index.js chat/protocols/matrix/lib/content-type
cp ../../matrix-js-sdk/node_modules/oidc-client-ts/dist/umd/oidc-client-ts.js chat/protocols/matrix/lib/oidc-client-ts
cp ../../matrix-js-sdk/node_modules/jwt-decode/build/cjs/index.js chat/protocols/matrix/lib/jwt-decode
```

### Updating events

The events package is included as a shim for the native node `events` module.
As such, it is not a direct dependency of the `matrix-js-sdk`.

### Updating matrix-events-sdk

The matrix-events-sdk includes raw JS modules and Typescript definition files.
We only want the JS modules. So we want all the js files in `lib/**/*.js`
from the package.

### Updating matrix-widget-api

The matrix-widget-api includes raw JS modules and Typescript definition files.
We only want the JS modules. So we want all the js files in `lib/**/*.js`
from the package.

```sh
hg rm chat/protocols/matrix/lib/matrix-widget-api/
hg revert chat/protocols/matrix/lib/matrix-widget-api/LICENSE
cp -R ../../matrix-js-sdk/node_modules/matrix-widget-api/lib/* chat/protocols/matrix/lib/matrix-widget-api
rm chat/protocols/matrix/lib/matrix-widget-api/**/*.ts
rm chat/protocols/matrix/lib/matrix-widget-api/**/*.js.map
hg add chat/protocols/matrix/lib/matrix-widget-api/
```

### Updating sdp-transform

The sdp-transform package includes raw JS modules, so we want all the js files
under `lib/*.js`.

```sh
cp ../../matrix-js-sdk/node_modules/sdp-transform/lib/*.js chat/protocols/matrix/lib/sdp-transform
```

### Updating unhomoglyph

This is similar to the single file dependencies, but also has a JSON data file.
Both of these files should be copied to the unhomoglyph directory.

```sh
cp ../../matrix-js-sdk/node_modules/unhomoglyph/index.js chat/protocols/matrix/lib/unhomoglyph
cp ../../matrix-js-sdk/node_modules/unhomoglyph/data.json chat/protocols/matrix/lib/unhomoglyph
```

### Updating loglevel, safe-buffer, uuid

These packages have an alternate implementation in the `../shims` directory and
thus are not included here.

### Updating olm

The package is published on the Matrix gitlab. To update the library, download
the latest `.tgz` bundle and replace the `olm.js` and `olm.wasm` files in the
`@matrix-org/olm` folder.

### Updating p-retry

While p-retry itself only consists of a single `index.js` file, it depends on
the `retry` package, which consists of three files, and `index.js` and two
modules in the `lib` folder. All four files should be mirrored over into this
folder into a `p-retry` and `retry` folder respectively.

```sh
cp ../../matrix-js-sdk/node_modules/p-retry/index.js chat/protocols/matrix/lib/p-retry/
cp ../../matrix-js-sdk/node_modules/retry/index.js chat/protocols/matrix/lib/retry
cp ../../matrix-js-sdk/node_modules/retry/lib/*.js chat/protocols/matrix/lib/retry/lib
```
