/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests resulting send format of a message dependent on using HTML features
 * in the composition.
 */

"use strict";

var { close_compose_window, open_compose_with_reply } = ChromeUtils.import(
  "resource://testing-common/mozmill/ComposeHelpers.jsm"
);
var { open_message_from_file } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { close_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

function checkMsgFile(aFilePath, aConvertibility) {
  let file = new FileUtils.File(getTestFilePath(`data/${aFilePath}`));
  let msgc = open_message_from_file(file);

  // Creating a reply should not affect convertibility.
  let cwc = open_compose_with_reply(msgc);

  Assert.equal(cwc.window.DetermineConvertibility(), aConvertibility);

  close_compose_window(cwc);
  close_window(msgc);
}

/**
 * Tests that we only open one compose window for one instance of a draft.
 */
add_task(function test_msg_convertibility() {
  checkMsgFile("./format1-plain.eml", Ci.nsIMsgCompConvertible.Plain);

  // Bug 1385636
  checkMsgFile("./format1-altering.eml", Ci.nsIMsgCompConvertible.Altering);

  // Bug 584313
  checkMsgFile("./format2-style-attr.eml", Ci.nsIMsgCompConvertible.No);
  checkMsgFile("./format3-style-tag.eml", Ci.nsIMsgCompConvertible.No);
});
