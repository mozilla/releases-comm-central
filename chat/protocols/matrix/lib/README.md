This directory contains the Matrix Client-Server SDK for Javascript available
at https://github.com/matrix-org/matrix-js-sdk/. Current version is v2.4.1.

The following npm dependencies are included:

* another-json: https://www.npmjs.com/package/another-json/ v0.2.0
* base-x: https://www.npmjs.com/package/base-x v3.0.7
* bluebird: https://www.npmjs.com/package/bluebird v3.5.5
* bs58: https://www.npmjs.com/package/bs58 v4.0.1
* browser-request: https://www.npmjs.com/package/browser-request v0.3.3
* content-type: https://www.npmjs.com/package/content-type v1.0.4
* events: https://www.npmjs.com/package/events v3.0.7
* unhomoglyph: https://www.npmjs.com/package/unhomoglyph 1.0.2

The following npm dependencies are shimmed:

* loglevel: The chat framework's logging methods are used internally.
* url: The global URL object is used directly.

There is not any automated way to update the libraries.

Files have been obtained by downloading the matrix-js-sdk git repository,
using yarn to obtain the dependencies), and then compiling the SDK using Babel.

To make the whole thing work, some file paths and global variables are defined
in chat/protocols/matrix/matrix-sdk.jsm.

## Updating matrix-js-sdk

1. Download the matrix-js-sdk repository from https://github.com/matrix-org/matrix-js-sdk/.
2. Modify `.babelrc` (see below).
3. Run yarn install
4. Run babel (`./node_modules/.bin/babel -d lib src`)
5. Remove the old SDK files `hg rm chat/protocols/matrix/lib/matrix-sdk`
6. Copy `lib/` from the matrix-js-sdk to `chat/protocols/matrix/lib/matrix-sdk`
7. Add the files back to Mercurial: `hg add chat/protocols/matrix/lib/matrix-sdk`
7. Modify `moz.build` to add/remove/rename modified files.
8. Modify `matrix-js-sdk` to add/remove/rename modified files.

### Custom `.babelrc`

By default the matrix-js-sdk targets a version of ECMAScript that is far below
what Gecko supports, this causes lots of additional processing to occur (e.g.
converting async functions, etc.) To disable this, a custom `.babelrc` file is
used:

```javascript
{
    "presets": [],
    "plugins": [
        "transform-class-properties",

        // To convert imports to requires.
        ["babel-plugin-transform-es2015-modules-commonjs", {
            "noInterop": false
        }]
    ],
}
```

## Updating dependencies

First, follow the steps above. Then, check the `node_modules` directory that
gets created by yarn. The necessary dependencies are available here,
unfortunately each one has slightly different conventions.

### Updating single file dependencies

another-json, base-x, browser-request, bs58, content-type, and events all have a
single file named for the package or named index.js. This should get copied to
the proper sub-directory.

### Updating bluebird

The bluebird library has a file different distributions, the one that is
currently integrated is the "full browser" distribution. It can be found under:
`node_modules/bluebird/js/browser/bluebird.js`.

### Updating unhomoglyph

This is simlar to the single file dependencies, but also has a JSON data file.
Both of these files should be copied to the unhomoglyph directory.
