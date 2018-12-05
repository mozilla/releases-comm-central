/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that messages in cp932, Thunderbirds alias for Shift_JIS, are correctly displayed.
 */

// mozmake SOLO_TEST=composition/test-cp932-display.js mozmill-one

"use strict";

var MODULE_NAME = "test-cp932-display.js";

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers", "window-helpers"];

var os = {};
ChromeUtils.import("chrome://mozmill/content/stdlib/os.js", os);

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }
}

function test_cp932_display() {
  let file = os.getFileForPath(os.abspath("./charset-cp932.eml",
                               os.getFileForPath(__file__)));
  let msgc = open_message_from_file(file);
  let subjectText = msgc.e("expandedsubjectBox").textContent;
  let bodyText = msgc.e("messagepane").contentDocument
                     .querySelector("body").textContent;
  close_window(msgc);

  assert_true(subjectText.includes("ここに本文がきます。"),
              "Decoded cp932 text not found in message subject.");
  assert_true(bodyText.includes("ここに本文がきます。"),
              "Decoded cp932 text not found in message body.");
}
