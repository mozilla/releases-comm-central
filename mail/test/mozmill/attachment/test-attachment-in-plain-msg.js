/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from ../shared-modules/test-dom-helpers.js */
/* import-globals-from ../shared-modules/test-folder-display-helpers.js */
/* import-globals-from ../shared-modules/test-window-helpers.js */

var MODULE_NAME = "test-attachment-in-plain-msg";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers", "window-helpers", "dom-helpers"];

var os = ChromeUtils.import("chrome://mozmill/content/stdlib/os.jsm");

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }
}

/**
 * Bug 1358565
 * Check that a non-empty image is shown as attachment and is detected as non-empty
 * when message is viewed as plain text.
 */
async function test_attachment_not_empty() {
  Services.prefs.setBoolPref("mailnews.display.prefer_plaintext", true);

  let thisFilePath = os.getFileForPath(__file__);
  let file = os.getFileForPath(os.abspath("./bug1358565.eml", thisFilePath));

  let msgc = open_message_from_file(file);

  wait_for_element_visible(msgc, "attachmentToggle");
  msgc.click(msgc.eid("attachmentToggle"));

  wait_for_element_visible(msgc, "attachmentList");
  assert_equals(msgc.e("attachmentList").itemCount, 1);

  let attachmentElem = msgc.e("attachmentList").getItemAtIndex(0);
  assert_equals(attachmentElem.attachment.contentType, "image/jpeg");
  assert_equals(attachmentElem.attachment.name, "bug.png");
  assert_true(attachmentElem.attachment.hasFile);
  assert_false(await attachmentElem.attachment.isEmpty(),
               "Attachment incorrectly determined empty");

  close_window(msgc);

  Services.prefs.clearUserPref("mailnews.display.prefer_plaintext");
}
