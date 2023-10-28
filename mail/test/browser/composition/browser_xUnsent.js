/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that X-Unsent .eml messages are correctly opened for composition.
 */

"use strict";

var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");

function waitForComposeWindow() {
  return BrowserTestUtils.domWindowOpened(null, async win => {
    await BrowserTestUtils.waitForEvent(win, "load");
    await BrowserTestUtils.waitForEvent(win, "focus", true);
    return (
      win.document.documentURI ===
      "chrome://messenger/content/messengercompose/messengercompose.xhtml"
    );
  });
}

/**
 * Tests that opening an .eml with X-Unsent: 1 opens composition correctly.
 */
add_task(async function openXUnsent() {
  const compWinReady = waitForComposeWindow();
  const file = new FileUtils.File(getTestFilePath(`data/xunsent.eml`));
  const fileURL = Services.io
    .newFileURI(file)
    .QueryInterface(Ci.nsIFileURL)
    .mutate()
    .setQuery("type=application/x-message-display")
    .finalize();
  MailUtils.openEMLFile(window, file, fileURL);
  const compWin = await compWinReady;

  Assert.equal(
    compWin.document.getElementById("msgSubject").value,
    "xx unsent",
    "Should open as draft with correct subject"
  );
  compWin.close();
});
