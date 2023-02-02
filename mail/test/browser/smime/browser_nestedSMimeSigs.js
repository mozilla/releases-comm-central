/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that a message containing two nested S/MIME signatures shows
 * the contents of the inner signed message.
 */

"use strict";

var {
  open_message_from_file,
  get_about_message,
  smimeUtils_ensureNSS,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { close_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

function getMsgBodyTxt(mc) {
  let msgPane = get_about_message(mc.window).content;
  return msgPane.contentDocument.documentElement.textContent;
}

add_task(async function test_nested_sigs() {
  smimeUtils_ensureNSS();

  let msgc = await open_message_from_file(
    new FileUtils.File(getTestFilePath("data/nested-sigs.eml"))
  );

  Assert.ok(
    getMsgBodyTxt(msgc).includes("level 2"),
    "level 2 text is shown in body"
  );

  close_window(msgc);
});
