/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that we do the right thing wrt. message encoding when editing or
 * replying to messages.
 */

"use strict";

var {
  close_compose_window,
  compose_window_ready,
  open_compose_with_reply,
  save_compose_message,
} = ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
var {
  add_message_to_folder,
  assert_selected_and_displayed,
  be_in_folder,
  create_message,
  get_about_message,
  get_special_folder,
  make_display_unthreaded,
  press_delete,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { SyntheticPartLeaf } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { get_notification, wait_for_notification_to_show } = ChromeUtils.import(
  "resource://testing-common/mozmill/NotificationBoxHelpers.jsm"
);
var { promise_new_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MimeParser } = ChromeUtils.import("resource:///modules/mimeParser.jsm");

const aboutMessage = get_about_message();

var gDrafts;

add_setup(async function () {
  gDrafts = await get_special_folder(Ci.nsMsgFolderFlags.Drafts, true);
});

/**
 * Helper to get the full message content.
 *
 * @param aMsgHdr: nsIMsgDBHdr object whose text body will be read
 * @param aGetText: if true, return header objects. if false, return body data.
 * @returns Map(partnum -> message headers)
 */
async function getMsgHeaders(aMsgHdr, aGetText = false) {
  const msgFolder = aMsgHdr.folder;
  const msgUri = msgFolder.getUriForMsg(aMsgHdr);

  const handler = {
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
  const streamListener = MimeParser.makeStreamListenerParser(handler, {
    strformat: "unicode",
  });
  MailServices.messageServiceFromURI(msgUri).streamMessage(
    msgUri,
    streamListener,
    null,
    null,
    false,
    "",
    false
  );
  await TestUtils.waitForCondition(() => handler._done);
  return aGetText ? handler._text : handler._data;
}

/**
 * Test that if we reply to a message in an invalid charset, we don't try to compose
 * in that charset. Instead, we should be using UTF-8.
 */
add_task(async function test_wrong_reply_charset() {
  const folder = gDrafts;
  const msg0 = create_message({
    bodyPart: new SyntheticPartLeaf("Some text", {
      charset: "invalid-charset",
    }),
  });
  await add_message_to_folder([folder], msg0);
  await be_in_folder(folder);
  // Make the folder unthreaded for easier message selection.
  await make_display_unthreaded();

  let msg = await select_click_row(-1);
  await assert_selected_and_displayed(window, msg);
  Assert.equal((await getMsgHeaders(msg)).get("").charset, "invalid-charset");

  let rwc = await open_compose_with_reply();
  await save_compose_message(rwc);
  await TestUtils.waitForCondition(
    () => folder.getTotalMessages(false) == 2,
    "message saved to drafts folder"
  );
  await close_compose_window(rwc);

  const draftMsg = await select_click_row(-2);
  Assert.equal((await getMsgHeaders(draftMsg)).get("").charset, "UTF-8");
  await press_delete(window); // Delete message

  // Edit the original message. Charset should be UTF-8 now.
  msg = await select_click_row(-1);

  // Wait for the notification with the Edit button.
  await wait_for_notification_to_show(
    aboutMessage,
    "mail-notification-top",
    "draftMsgContent"
  );

  const composePromise = promise_new_window("msgcompose");

  const box = get_notification(
    aboutMessage,
    "mail-notification-top",
    "draftMsgContent"
  );
  // Click on the "Edit" button in the draft notification.
  EventUtils.synthesizeMouseAtCenter(
    box.buttonContainer.firstElementChild,
    {},
    aboutMessage
  );
  rwc = await compose_window_ready(composePromise);
  await save_compose_message(rwc);
  await close_compose_window(rwc);
  msg = await select_click_row(-1);
  await TestUtils.waitForCondition(
    async () => (await getMsgHeaders(msg)).get("").charset == "UTF-8",
    "The charset matches"
  );
  await press_delete(window); // Delete message
});

/**
 * Test that replying to bad charsets don't screw up the existing text.
 */
add_task(async function test_no_mojibake() {
  const folder = gDrafts;
  const nonASCII = "ケツァルコアトル";
  const UTF7 = "+MLEwxDChMOswszCiMMgw6w-";
  const msg0 = create_message({
    bodyPart: new SyntheticPartLeaf(UTF7, { charset: "utf-7" }),
  });
  await add_message_to_folder([folder], msg0);
  await be_in_folder(folder);
  let msg = await select_click_row(-1);
  await assert_selected_and_displayed(window, msg);
  await TestUtils.waitForCondition(
    async () => (await getMsgHeaders(msg)).get("").charset == "utf-7",
    "message charset correctly set"
  );
  Assert.equal((await getMsgHeaders(msg, true)).get("").trim(), nonASCII);

  let rwc = await open_compose_with_reply();
  await save_compose_message(rwc);
  await TestUtils.waitForCondition(
    () => folder.getTotalMessages(false) == 2,
    "message saved to drafts folder"
  );
  await close_compose_window(rwc);

  const draftMsg = await select_click_row(-2);
  Assert.equal(
    (await getMsgHeaders(draftMsg)).get("").charset.toUpperCase(),
    "UTF-8"
  );
  const text = (await getMsgHeaders(draftMsg, true)).get("");
  // Delete message first before throwing so subsequent tests are not affected.
  await press_delete(window);
  if (!text.includes(nonASCII)) {
    throw new Error("Expected to find " + nonASCII + " in " + text);
  }

  // Edit the original message. Charset should be UTF-8 now.
  msg = await select_click_row(-1);

  // Wait for the notification with the Edit button.
  await wait_for_notification_to_show(
    aboutMessage,
    "mail-notification-top",
    "draftMsgContent"
  );

  const composePromise = promise_new_window("msgcompose");
  const box = get_notification(
    aboutMessage,
    "mail-notification-top",
    "draftMsgContent"
  );
  // Click on the "Edit" button in the draft notification.
  EventUtils.synthesizeMouseAtCenter(
    box.buttonContainer.firstElementChild,
    {},
    aboutMessage
  );
  rwc = await compose_window_ready(composePromise);
  await save_compose_message(rwc);
  await close_compose_window(rwc);
  msg = await select_click_row(-1);
  Assert.equal(
    (await getMsgHeaders(msg)).get("").charset.toUpperCase(),
    "UTF-8"
  );
  Assert.equal((await getMsgHeaders(msg, true)).get("").trim(), nonASCII);
  await press_delete(window); // Delete message
});
