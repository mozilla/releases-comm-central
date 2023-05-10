/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_setup(async () => {
  Assert.equal(
    0,
    Object.keys(getState()).length,
    "Unified toolbar should not be customized"
  );
});

// Load browserAction tests.
Services.scriptloader.loadSubScript(
  new URL("test_browserAction.js", gTestPath).href,
  this
);
