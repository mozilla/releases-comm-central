/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that attached messages (message/rfc822) are correctly sent.
 * It's easiest to test the forward case.
 */

// mozmake SOLO_TEST=composition/test-forward-rfc822-attach.js mozmill-one

var MODULE_NAME = "test-forward-rfc822-attach";

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers", "compose-helpers", "window-helpers"];

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource:///modules/mailServices.js");
var os = {};
Cu.import('resource://mozmill/stdlib/os.js', os);

var draftsFolder;

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }

  draftsFolder = get_special_folder(Ci.nsMsgFolderFlags.Drafts, true);
}

function forwardDirect(aFilePath, aExpectedText) {
  let file = os.getFileForPath(os.abspath(aFilePath,
                               os.getFileForPath(__file__)));
  let msgc = open_message_from_file(file);

  let cwc = open_compose_with_forward_as_attachments(msgc);

  // Ctrl+S saves as draft.
  cwc.keypress(null, "s", {shiftKey: false, accelKey: true});

  close_compose_window(cwc);
  close_window(msgc);

  be_in_folder(draftsFolder);
  let draftMsg = select_click_row(0);

  let draftMsgContent = get_msg_source(draftMsg);

  if (!draftMsgContent.includes(aExpectedText)) {
    assert_true(false, "Failed to find expected text");
  }

  press_delete(mc); // clean up the created draft
}

function test_forwarding_long_html_line_as_attachment() {
  forwardDirect("./long-html-line.eml", "We like writing long lines.");
}

function test_forwarding_feed_message_as_attachment() {
  forwardDirect("./feed-message.eml", "We like using linefeeds only.");
}
