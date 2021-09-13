This directory contains the Matrix Client-Server SDK for Javascript available
at https://github.com/matrix-org/matrix-js-sdk/. Current version is v11.1.0.

The following npm dependencies are included:

* @matrix-org/olm: https://gitlab.matrix.org/matrix-org/olm/-/packages/10 v3.2.3
* another-json: https://www.npmjs.com/package/another-json/ v0.2.0
* base-x: https://www.npmjs.com/package/base-x v3.0.8
* bs58: https://www.npmjs.com/package/bs58 v4.0.1
* browser-request: https://www.npmjs.com/package/browser-request v0.3.3
* content-type: https://www.npmjs.com/package/content-type v1.0.4
* events: https://www.npmjs.com/package/events v3.2.0
* qs: https://www.npmjs.com/package/qs v6.9.6
* unhomoglyph: https://www.npmjs.com/package/unhomoglyph 1.0.6

The following npm dependencies are shimmed:

* loglevel: The chat framework's logging methods are used internally.
* safe-buffer: Buffer implementation used by base-x.
* url: The global URL object is used directly.

There is not any automated way to update the libraries.

Files have been obtained by downloading the matrix-js-sdk git repository,
using yarn to obtain the dependencies), and then compiling the SDK using Babel.

To make the whole thing work, some file paths and global variables are defined
in chat/protocols/matrix/matrix-sdk.jsm.

## Updating matrix-js-sdk

1.  Download the matrix-js-sdk repository from https://github.com/matrix-org/matrix-js-sdk/.
2.  Modify `.babelrc` (see below).
3.  Run yarn install
4.  Run Babel in the matrix-js-sdk checkout:
    `./node_modules/.bin/babel --source-maps false -d lib --extensions ".ts,.js" src`
    (at time of writing identical to `yarn build:compile`)
5.  The following commands assume you're in mozilla-central/comm and that the
    matrix-js-sdk is checked out next to mozilla-central.
6.  Remove the old SDK files `hg rm chat/protocols/matrix/lib/matrix-sdk`
7.  Undo the removal of the license: `hg revert chat/protocols/matrix/lib/matrix-sdk/LICENSE`
8.  Copy the Babel-ified JavaScript files from the matrix-js-sdk to vendored
    location: `cp -r ../../matrix-js-sdk/lib/ chat/protocols/matrix/lib/matrix-sdk`
9.  Add the files back to Mercurial: `hg add chat/protocols/matrix/lib/matrix-sdk`
10. Modify `moz.build` to add/remove/rename modified files.
11. Modify `matrix-sdk.jsm` to add/remove/rename modified files.

### Custom `.babelrc`

By default the matrix-js-sdk targets a version of ECMAScript that is far below
what Gecko supports, this causes lots of additional processing to occur (e.g.
converting async functions, etc.) To disable this, a custom `.babelrc` file is
used:

```javascript
{
    "sourceMaps": false,
    "presets": [
        ["@babel/preset-env", {
            "targets": "last 1 firefox versions",
            "modules": "commonjs"
        }],
        "@babel/preset-typescript"
    ],
    "plugins": [
        "@babel/plugin-proposal-class-properties"
    ]
}
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

### Updating browser-request

Follow the directions for updating single file dependencies, then modify the
index.js file so that the `is_crossDomain` always returns `false`.

### Updating events

The events package is included as a shim for the native node `events` module.
As such, it is not a direct dependency of the `matrix-js-sdk`.

### Updating qs

The qs package comes with two valid entry points, `dist/qs.js` and
`lib/index.js`. The `dist` one is already prepared for use in browsers
but still supports being loaded as commonJS module and it is only a single
file, so we prefer that one.

### Updating unhomoglyph

This is simlar to the single file dependencies, but also has a JSON data file.
Both of these files should be copied to the unhomoglyph directory.

### Updating loglevel, safe-buffer, url

These packages have an alternate implementation in the `../shims` directory and
thus are not included here.

### Updating olm

The package is published on the Matrix gitlab. To update the library, download
the latest `.tgz` bundle and replace the files in the `@matrix-org/olm` folder.
