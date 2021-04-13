/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that we do the right thing wrt. message encoding when editing or
 * replying to messages.
 */

"use strict";

var utils = ChromeUtils.import("resource://testing-common/mozmill/utils.jsm");

var {
  close_compose_window,
  open_compose_with_reply,
  wait_for_compose_window,
} = ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
var {
  add_message_to_folder,
  assert_selected_and_displayed,
  be_in_folder,
  create_message,
  get_special_folder,
  mc,
  press_delete,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { SyntheticPartLeaf } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { wait_for_notification_to_show, get_notification } = ChromeUtils.import(
  "resource://testing-common/mozmill/NotificationBoxHelpers.jsm"
);
var { plan_for_new_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MimeParser } = ChromeUtils.import("resource:///modules/mimeParser.jsm");

var gDrafts;

add_task(function setupModule(module) {
  gDrafts = get_special_folder(Ci.nsMsgFolderFlags.Drafts, true);
});

/**
 * Helper to get the full message content.
 *
 * @param aMsgHdr: nsIMsgDBHdr object whose text body will be read
 * @param aGetText: if true, return header objects. if false, return body data.
 * @return Map(partnum -> message headers)
 */
function getMsgHeaders(aMsgHdr, aGetText = false) {
  let msgFolder = aMsgHdr.folder;
  let msgUri = msgFolder.getUriForMsg(aMsgHdr);

  let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
    Ci.nsIMessenger
  );
  let handler = {
    _done: false,
    _data: new Map(),
    _text: new Map(),
    endMessage() {
      this._done = true;
    },
    deliverPartData(num, text) {
      this._text.set(num, this._text.get(num) + text);
    },
    startPart(num, headers) {
      this._data.set(num, headers);
      this._text.set(num, "");
    },
  };
  let streamListener = MimeParser.makeStreamListenerParser(handler, {
    strformat: "unicode",
  });
  messenger
    .messageServiceFromURI(msgUri)
    .streamMessage(msgUri, streamListener, null, null, false, "", false);
  utils.waitFor(() => handler._done);
  return aGetText ? handler._text : handler._data;
}

/**
 * Test that if we reply to a message in an invalid charset, we don't try to compose
 * in that charset. Instead, we should be using UTF-8.
 */
add_task(function test_wrong_reply_charset() {
  let folder = gDrafts;
  let msg0 = create_message({
    bodyPart: new SyntheticPartLeaf("Some text", {
      charset: "invalid-charset",
    }),
  });
  add_message_to_folder(folder, msg0);
  be_in_folder(folder);
  let msg = select_click_row(0);
  assert_selected_and_displayed(mc, msg);
  Assert.equal(getMsgHeaders(msg).get("").charset, "invalid-charset");

  let rwc = open_compose_with_reply();
  // Ctrl+S = save as draft.
  EventUtils.synthesizeKey(
    "s",
    { shiftKey: false, accelKey: true },
    rwc.window
  );
  waitForSaveOperation(rwc);
  close_compose_window(rwc);

  let draftMsg = select_click_row(1);
  Assert.equal(getMsgHeaders(draftMsg).get("").charset, "UTF-8");
  press_delete(mc); // Delete message

  // Edit the original message. Charset should be UTF-8 now.
  msg = select_click_row(0);

  // Wait for the notification with the Edit button.
  wait_for_notification_to_show(mc, "mail-notification-top", "draftMsgContent");

  plan_for_new_window("msgcompose");

  let box = get_notification(mc, "mail-notification-top", "draftMsgContent");
  // Click on the "Edit" button in the draft notification.
  EventUtils.synthesizeMouseAtCenter(box.buttonContainer.firstElementChild, {});
  rwc = wait_for_compose_window();
  EventUtils.synthesizeKey(
    "s",
    { shiftKey: false, accelKey: true },
    rwc.window
  );
  waitForSaveOperation(rwc);
  close_compose_window(rwc);
  msg = select_click_row(0);
  Assert.equal(getMsgHeaders(msg).get("").charset, "UTF-8");
  press_delete(mc); // Delete message
});

/**
 * Test that replying to bad charsets don't screw up the existing text.
 */
add_task(function test_no_mojibake() {
  let folder = gDrafts;
  let nonASCII = "ケツァルコアトル";
  let UTF7 = "+MLEwxDChMOswszCiMMgw6w-";
  let msg0 = create_message({
    bodyPart: new SyntheticPartLeaf(UTF7, { charset: "utf-7" }),
  });
  add_message_to_folder(folder, msg0);
  be_in_folder(folder);
  let msg = select_click_row(0);
  assert_selected_and_displayed(mc, msg);
  Assert.equal(getMsgHeaders(msg).get("").charset, "utf-7");
  Assert.equal(
    getMsgHeaders(msg, true)
      .get("")
      .trim(),
    nonASCII
  );

  let rwc = open_compose_with_reply();
  // Ctrl+S = save as draft.
  EventUtils.synthesizeKey(
    "s",
    { shiftKey: false, accelKey: true },
    rwc.window
  );
  waitForSaveOperation(rwc);
  close_compose_window(rwc);

  let draftMsg = select_click_row(1);
  Assert.equal(
    getMsgHeaders(draftMsg)
      .get("")
      .charset.toUpperCase(),
    "UTF-8"
  );
  let text = getMsgHeaders(draftMsg, true).get("");
  // Delete message first before throwing so subsequent tests are not affected.
  press_delete(mc);
  if (!text.includes(nonASCII)) {
    throw new Error("Expected to find " + nonASCII + " in " + text);
  }

  // Edit the original message. Charset should be UTF-8 now.
  msg = select_click_row(0);

  // Wait for the notification with the Edit button.
  wait_for_notification_to_show(mc, "mail-notification-top", "draftMsgContent");

  plan_for_new_window("msgcompose");
  let box = get_notification(mc, "mail-notification-top", "draftMsgContent");
  // Click on the "Edit" button in the draft notification.
  EventUtils.synthesizeMouseAtCenter(box.buttonContainer.firstElementChild, {});
  rwc = wait_for_compose_window();
  EventUtils.synthesizeKey(
    "s",
    { shiftKey: false, accelKey: true },
    rwc.window
  );
  waitForSaveOperation(rwc);
  close_compose_window(rwc);
  msg = select_click_row(0);
  Assert.equal(
    getMsgHeaders(msg)
      .get("")
      .charset.toUpperCase(),
    "UTF-8"
  );
  Assert.equal(
    getMsgHeaders(msg, true)
      .get("")
      .trim(),
    nonASCII
  );
  press_delete(mc); // Delete message
});
