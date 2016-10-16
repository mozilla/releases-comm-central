/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the reply to a format=flowed message is also flowed.
 */

// make SOLO_TEST=composition/test-reply-format-flowed.js mozmill-one

var MODULE_NAME = "test-reply-format-flowed";

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

  Services.prefs.setBoolPref("mail.identity.id1.compose_html", false);
}

function subtest_reply_format_flowed(aFlowed) {
  let file = os.getFileForPath(os.abspath("./format-flowed.eml",
                               os.getFileForPath(__file__)));
  let msgc = open_message_from_file(file);

  Services.prefs.setBoolPref("mailnews.send_plaintext_flowed", aFlowed);

  let cwc = open_compose_with_reply(msgc);

  close_window(msgc);

  // Now save the message as a draft.
  cwc.keypress(null, "s", {shiftKey: false, accelKey: true});
  close_compose_window(cwc);

  // Now check the message content in the drafts folder.
  be_in_folder(draftsFolder);
  let message = select_click_row(0);
  let messageContent = get_msg_source(message);

  // Check for a single line that contains text and make sure there is a
  // space at the end for a flowed reply.
  assert_true(
    messageContent.includes(
      "\r\n> text text text text text text text text text text text text text text" +
      (aFlowed ? " \r\n" : "\r\n")),
    "Expected line not found in message.");

  // Delete the outgoing message.
  press_delete();
}

function test_reply_format_flowed() {
  subtest_reply_format_flowed(true);
  subtest_reply_format_flowed(false);
}

function teardownModule() {
  Services.prefs.clearUserPref("mail.identity.id1.compose_html");
  Services.prefs.clearUserPref("mailnews.send_plaintext_flowed");
}
