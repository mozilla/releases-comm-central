/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that messages in cp932, Thunderbirds alias for Shift_JIS, are correctly displayed.
 */

"use strict";

var { get_about_message, open_message_from_file } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { close_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

add_task(async function test_cp932_display() {
  let file = new FileUtils.File(getTestFilePath("data/charset-cp932.eml"));
  let msgc = await open_message_from_file(file);
  let aboutMessage = get_about_message(msgc.window);
  let subjectText =
    aboutMessage.document.getElementById("expandedsubjectBox").textContent;
  let bodyText = aboutMessage.document
    .getElementById("messagepane")
    .contentDocument.querySelector("body").textContent;
  Assert.ok(
    subjectText.includes("ここに本文がきます。"),
    "Decoded cp932 text not found in message subject. subjectText=" +
      subjectText
  );
  Assert.ok(
    bodyText.includes("ここに本文がきます。"),
    "Decoded cp932 text not found in message body."
  );
  close_window(msgc);
});
