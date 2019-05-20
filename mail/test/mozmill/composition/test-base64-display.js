/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that messages with "broken" base64 are correctly displayed.
 */

"use strict";

/* import-globals-from ../shared-modules/test-folder-display-helpers.js */
/* import-globals-from ../shared-modules/test-window-helpers.js */

var MODULE_NAME = "test-base64-display.js";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers", "window-helpers"];

var os = ChromeUtils.import("chrome://mozmill/content/stdlib/os.jsm");

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }
}

function test_base64_display() {
  let file = os.getFileForPath(os.abspath("./base64-with-whitespace.eml",
                               os.getFileForPath(__file__)));
  let msgc = open_message_from_file(file);
  let bodyText = msgc.e("messagepane").contentDocument
                     .querySelector("body").textContent;
  close_window(msgc);

  assert_true(bodyText.includes("abcdefghijklmnopqrstuvwxyz"),
              "Decoded base64 text not found in message.");
}
