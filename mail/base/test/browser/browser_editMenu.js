/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// Load common setup code shared by all browser_editMenu* tests.
Services.scriptloader.loadSubScript(
  new URL("head_editMenu.js", gTestPath).href,
  this
);

add_task(async function test3PaneTab() {
  await helper.testAllItems("mail3PaneTab");
});
