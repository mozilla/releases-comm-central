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
} = ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
var {
  add_message_sets_to_folders,
  be_in_folder,
  create_folder,
  create_thread,
  get_special_folder,
  make_display_unthreaded,
  mc,
  press_delete,
  select_click_row,
  select_shift_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { MsgHdrToMimeMessage } = ChromeUtils.import(
  "resource:///modules/gloda/MimeMessage.jsm"
);
var { plan_for_window_close, wait_for_window_close } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var cwc = null; // compose window controller
var folder;
var gDrafts;

add_setup(async function () {
  folder = await create_folder("Test");
  let thread1 = create_thread(10);
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

async function forward_selected_messages_and_go_to_drafts_folder(f) {
  const kText = "Hey check out this megalol link";
  // opening a new compose window
  cwc = f(mc);
  cwc.window.document.getElementById("messageEditor").focus();
  EventUtils.sendString(kText, cwc.window);

  let mailBody = get_compose_body(cwc);
  assert_previous_text(mailBody.firstChild, [kText]);

  plan_for_window_close(cwc);
  // mwc is modal window controller
  let dialogPromise = BrowserTestUtils.promiseAlertDialog("accept");
  // quit -> do you want to save ?
  cwc.window.goDoCommand("cmd_close");
  await dialogPromise;
  // Actually quit the window.
  wait_for_window_close();

  // Visit the existing Drafts folder.
  await be_in_folder(gDrafts);
  make_display_unthreaded();
}

add_task(async function test_forward_inline() {
  await be_in_folder(folder);
  make_display_unthreaded();
  // original message header
  let oMsgHdr = select_click_row(0);

  await forward_selected_messages_and_go_to_drafts_folder(
    open_compose_with_forward
  );

  // forwarded message header
  let fMsgHdr = select_click_row(0);

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
    MsgHdrToMimeMessage(fMsgHdr, null, function (aMsgHdr, aMimeMsg) {
      Assert.equal(
        aMimeMsg.headers["x-forwarded-message-id"],
        "<" + oMsgHdr.messageId + ">"
      );
      Assert.equal(aMimeMsg.headers.references, "<" + oMsgHdr.messageId + ">");

      press_delete(mc);
      resolve();
    });
  });
});

add_task(async function test_forward_as_attachments() {
  await be_in_folder(folder);
  make_display_unthreaded();

  // original message header
  let oMsgHdr0 = select_click_row(0);
  let oMsgHdr1 = select_click_row(1);
  select_shift_click_row(0);

  await forward_selected_messages_and_go_to_drafts_folder(
    open_compose_with_forward_as_attachments
  );

  // forwarded message header
  let fMsgHdr = select_click_row(0);

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
    MsgHdrToMimeMessage(fMsgHdr, null, function (aMsgHdr, aMimeMsg) {
      Assert.equal(
        aMimeMsg.headers["x-forwarded-message-id"],
        "<" + oMsgHdr0.messageId + "> <" + oMsgHdr1.messageId + ">"
      );
      Assert.equal(
        aMimeMsg.headers.references,
        "<" + oMsgHdr0.messageId + "> <" + oMsgHdr1.messageId + ">"
      );

      press_delete(mc);
      resolve();
    });
  });
});
