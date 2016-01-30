/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests resulting send format of a message dependent on using HTML features
 * in the composition.
 */

// make SOLO_TEST=composition/test-send-format.js mozmill-one

var MODULE_NAME = "test-send-format";

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers", "compose-helpers", "window-helpers"];

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource:///modules/mailServices.js");
var os = {};
Cu.import('resource://mozmill/stdlib/os.js', os);

const nsIMsgCompConvertible = Components.interfaces.nsIMsgCompConvertible;

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }
}

function checkMsgFile(aFilePath, aConvertibility) {
  let file = os.getFileForPath(os.abspath(aFilePath,
                               os.getFileForPath(__file__)));
  let msgc = open_message_from_file(file);

  // Creating a reply should not affect convertibility.
  let cwc = open_compose_with_reply(msgc);

  assert_equals(cwc.window.DetermineConvertibility(), aConvertibility);

  close_compose_window(cwc);
  close_window(msgc);
}

/**
 * Tests that we only open one compose window for one instance of a draft.
 */
function test_msg_convertibility() {
  checkMsgFile("./format1-plain.eml", nsIMsgCompConvertible.Plain);

  // Bug 584313
  checkMsgFile("./format2-style-attr.eml", nsIMsgCompConvertible.No);
  checkMsgFile("./format3-style-tag.eml", nsIMsgCompConvertible.No);
}

function teardownModule() {
}
