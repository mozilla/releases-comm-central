/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that a message containing two nested S/MIME signatures shows
 * the contents of the inner signed message.
 */

"use strict";

var { open_message_from_file, get_about_message, smimeUtils_ensureNSS } =
  ChromeUtils.import(
    "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
  );

function getMsgBodyTxt(msgc) {
  const msgPane = get_about_message(msgc).getMessagePaneBrowser();
  return msgPane.contentDocument.documentElement.textContent;
}

add_task(async function test_nested_sigs() {
  smimeUtils_ensureNSS();

  const msgc = await open_message_from_file(
    new FileUtils.File(getTestFilePath("data/nested-sigs.eml"))
  );

  Assert.ok(
    getMsgBodyTxt(msgc).includes("level 2"),
    "level 2 text is shown in body"
  );

  await BrowserTestUtils.closeWindow(msgc);
});

registerCleanupFunction(() => {
  // Some tests that open new windows don't return focus to the main window
  // in a way that satisfies mochitest, and the test times out.
  Services.focus.focusedWindow = window;
  // Focus an element in the main window, then blur it again to avoid it
  // hijacking keypresses.
  const mainWindowElement = document.getElementById("button-appmenu");
  mainWindowElement.focus();
  mainWindowElement.blur();
});
