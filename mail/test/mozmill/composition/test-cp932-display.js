/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that messages in cp932, Thunderbirds alias for Shift_JIS, are correctly displayed.
 */

"use strict";

var os = ChromeUtils.import("chrome://mozmill/content/stdlib/os.jsm");

var { assert_true, open_message_from_file } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { close_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

function test_cp932_display() {
  let file = os.getFileForPath(
    os.abspath("./charset-cp932.eml", os.getFileForPath(__file__))
  );
  let msgc = open_message_from_file(file);
  let subjectText = msgc.e("expandedsubjectBox").textContent;
  let bodyText = msgc.e("messagepane").contentDocument.querySelector("body")
    .textContent;
  close_window(msgc);

  assert_true(
    subjectText.includes("ここに本文がきます。"),
    "Decoded cp932 text not found in message subject."
  );
  assert_true(
    bodyText.includes("ここに本文がきます。"),
    "Decoded cp932 text not found in message body."
  );
}
