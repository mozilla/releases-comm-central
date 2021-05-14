/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the reply to a format=flowed message is also flowed.
 */

"use strict";

var {
  close_compose_window,
  get_msg_source,
  open_compose_with_reply,
} = ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
var {
  be_in_folder,
  get_special_folder,
  open_message_from_file,
  press_delete,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { close_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var gDrafts;

add_task(function setupModule(module) {
  gDrafts = get_special_folder(Ci.nsMsgFolderFlags.Drafts, true);

  Services.prefs.setBoolPref("mail.identity.id1.compose_html", false);
});

async function subtest_reply_format_flowed(aFlowed) {
  let file = new FileUtils.File(getTestFilePath("data/format-flowed.eml"));
  let msgc = await open_message_from_file(file);

  Services.prefs.setBoolPref("mailnews.send_plaintext_flowed", aFlowed);

  let cwc = open_compose_with_reply(msgc);

  close_window(msgc);

  // Now save the message as a draft.
  EventUtils.synthesizeKey(
    "s",
    { shiftKey: false, accelKey: true },
    cwc.window
  );
  waitForSaveOperation(cwc);
  close_compose_window(cwc);

  // Now check the message content in the drafts folder.
  be_in_folder(gDrafts);
  let msgLoaded = BrowserTestUtils.waitForEvent(window, "MsgLoaded");
  let message = select_click_row(0);
  await msgLoaded;
  let messageContent = get_msg_source(message);

  // Check for a single line that contains text and make sure there is a
  // space at the end for a flowed reply.
  Assert.ok(
    messageContent.includes(
      "\r\n> text text text text text text text text text text text text text text" +
        (aFlowed ? " \r\n" : "\r\n")
    ),
    "Expected line not found in message."
  );

  // Delete the outgoing message.
  press_delete();
}

add_task(async function test_reply_format_flowed() {
  await subtest_reply_format_flowed(true);
  await subtest_reply_format_flowed(false);
});

registerCleanupFunction(function teardownModule() {
  Services.prefs.clearUserPref("mail.identity.id1.compose_html");
  Services.prefs.clearUserPref("mailnews.send_plaintext_flowed");
});
