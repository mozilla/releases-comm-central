/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that relative URLs, e.g. from links or @font-face rules in a message,
 * are correctly resolved against Exchange message URLs.
 */

const SCHEMES = ["x-moz-ews", "x-moz-graph", "ews-message", "graph-message"];

add_task(function test_resolveAnchor() {
  for (const scheme of SCHEMES) {
    const base = Services.io.newURI(`${scheme}://name@localhost/Inbox/1`);
    const uri = Services.io.newURI("#anchor", null, base);
    Assert.equal(uri.scheme, scheme, `${scheme} anchor scheme should match`);
    Assert.equal(
      uri.spec,
      `${scheme}://name@localhost/Inbox/1#anchor`,
      `${scheme} anchor should resolve against the message URL`
    );
  }
});

add_task(function test_resolveRelativePath() {
  for (const scheme of SCHEMES) {
    const base = Services.io.newURI(`${scheme}://name@localhost/Inbox/1`);
    Assert.throws(
      () => Services.io.newURI("font.woff", null, base),
      /NS_ERROR_FAILURE/,
      `${scheme} relative path should not resolve against the message URL`
    );
  }
});
