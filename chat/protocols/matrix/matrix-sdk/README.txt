This directory contains the Matrix Client-Server SDK for Javascript available
at https://github.com/matrix-org/matrix-js-sdk/. Current version is v0.7.0.

In addition, the following npm dependencies are included:

* another-json/: https://www.npmjs.com/package/another-json/
* browser-request/: https://www.npmjs.com/package/browser-request
* browserify/: https://www.npmjs.com/package/browserify
  * browserify/events.js: https://www.npmjs.com/package/events
  * browserify/punycode.js: https://github.com/bestiejs/punycode.js
  * browserify/querystring/: https://www.npmjs.com/package/querystring-es3
  * browserify/url/: https://www.npmjs.com/package/url
* q/: https://www.npmjs.com/package/q

There is not any automated way to update the libraries. Files have been obtained
by downloading the matrix-js-sdk release, compiling it with npm (to obtain the
dependencies), excluding some unneeded files from the dependencies and
optionally adding copyright notices from the original repository mentioned on
the npm page.

To make the whole thing work, some file paths and global variables are defined
in chat/protocols/matrix/matrix-sdk.jsm.
