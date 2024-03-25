/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that headers like References and X-Forwarded-Message-Id are
 * set properly when forwarding messages.
 */

"use strict";

var {
  assert_previous_text,
  get_compose_body,
  open_compose_with_forward,
  open_compose_with_forward_as_attachments,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/ComposeHelpers.sys.mjs"
);
var {
  add_message_sets_to_folders,
  be_in_folder,
  create_folder,
  create_thread,
  get_special_folder,
  make_display_unthreaded,
  press_delete,
  select_click_row,
  select_shift_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { MsgHdrToMimeMessage } = ChromeUtils.importESModule(
  "resource:///modules/gloda/MimeMessage.sys.mjs"
);

var folder;
var gDrafts;

add_setup(async function () {
  folder = await create_folder("Test");
  const thread1 = create_thread(10);
  await add_message_sets_to_folders([folder], [thread1]);

  gDrafts = await get_special_folder(Ci.nsMsgFolderFlags.Drafts, true);

  // Don't create paragraphs in the test.
  // The test checks for the first DOM node and expects a text and not
  // a paragraph.
  Services.prefs.setBoolPref("mail.compose.default_to_paragraph", false);
});

registerCleanupFunction(function () {
  Services.prefs.clearUserPref("mail.compose.default_to_paragraph");
});

async function forward_selected_messages_and_go_to_drafts_folder(callback) {
  const kText = "Hey check out this megalol link";
  // opening a new compose window
  const cwc = await callback(window);
  cwc.document.getElementById("messageEditor").focus();
  EventUtils.sendString(kText, cwc);

  const mailBody = get_compose_body(cwc);
  assert_previous_text(mailBody.firstChild, [kText]);

  const closePromise = BrowserTestUtils.domWindowClosed(cwc);
  const dialogPromise = BrowserTestUtils.promiseAlertDialog("accept");
  // quit -> do you want to save ?
  cwc.goDoCommand("cmd_close");
  await dialogPromise;
  // Actually quit the window.
  await closePromise;

  // Visit the existing Drafts folder.
  await be_in_folder(gDrafts);
  await make_display_unthreaded();
}

add_task(async function test_forward_inline() {
  await be_in_folder(folder);
  await make_display_unthreaded();
  // original message header
  const oMsgHdr = await select_click_row(0);

  await forward_selected_messages_and_go_to_drafts_folder(
    open_compose_with_forward
  );

  // forwarded message header
  const fMsgHdr = await select_click_row(0);

  Assert.ok(
    fMsgHdr.numReferences > 0,
    "No References Header in forwarded msg."
  );
  Assert.equal(
    fMsgHdr.getStringReference(0),
    oMsgHdr.messageId,
    "The forwarded message should have References: = Message-Id: of the original msg"
  );

  // test for x-forwarded-message id and exercise the js mime representation as
  // well
  return new Promise(resolve => {
    MsgHdrToMimeMessage(fMsgHdr, null, async function (aMsgHdr, aMimeMsg) {
      Assert.equal(
        aMimeMsg.headers["x-forwarded-message-id"],
        "<" + oMsgHdr.messageId + ">"
      );
      Assert.equal(aMimeMsg.headers.references, "<" + oMsgHdr.messageId + ">");

      await press_delete(window);
      resolve();
    });
  });
});

add_task(async function test_forward_as_attachments() {
  await be_in_folder(folder);
  await make_display_unthreaded();

  // original message header
  const oMsgHdr0 = await select_click_row(0);
  const oMsgHdr1 = await select_click_row(1);
  await select_shift_click_row(0);

  await forward_selected_messages_and_go_to_drafts_folder(
    open_compose_with_forward_as_attachments
  );

  // forwarded message header
  const fMsgHdr = await select_click_row(0);

  Assert.ok(
    fMsgHdr.numReferences > 0,
    "No References Header in forwarded msg."
  );
  Assert.ok(
    fMsgHdr.numReferences > 1,
    "Only one References Header in forwarded msg."
  );
  Assert.equal(
    fMsgHdr.getStringReference(1),
    oMsgHdr1.messageId,
    "The forwarded message should have References: = Message-Id: of the original msg#1"
  );
  Assert.equal(
    fMsgHdr.getStringReference(0),
    oMsgHdr0.messageId,
    "The forwarded message should have References: = Message-Id: of the original msg#0"
  );

  // test for x-forwarded-message id and exercise the js mime representation as
  // well
  return new Promise(resolve => {
    MsgHdrToMimeMessage(fMsgHdr, null, async function (aMsgHdr, aMimeMsg) {
      Assert.equal(
        aMimeMsg.headers["x-forwarded-message-id"],
        "<" + oMsgHdr0.messageId + "> <" + oMsgHdr1.messageId + ">"
      );
      Assert.equal(
        aMimeMsg.headers.references,
        "<" + oMsgHdr0.messageId + "> <" + oMsgHdr1.messageId + ">"
      );

      await press_delete(window);
      resolve();
    });
  });
});
