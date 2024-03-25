/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This tests some commands on messages via the UI. But we specifically check,
 * whether the commands have an effect in the message store on disk, i.e. the
 * markings on the messages are stored in the msgStore, not only in the database.
 * For now, it checks for bug 840418.
 */

"use strict";

const {
  open_compose_with_forward,
  open_compose_with_reply,
  setup_msg_contents,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/ComposeHelpers.sys.mjs"
);
const {
  be_in_folder,
  create_folder,
  empty_folder,
  get_special_folder,
  make_message_sets_in_folders,
  press_delete,
  right_click_on_row,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
const { click_menus_in_sequence } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);

let gInbox;
let gOutbox;
let gAutoRead;

add_setup(async function () {
  gAutoRead = Services.prefs.getBoolPref("mailnews.mark_message_read.auto");
  Services.prefs.setBoolPref("mailnews.mark_message_read.auto", false);

  gOutbox = await get_special_folder(Ci.nsMsgFolderFlags.Queue);
  gInbox = await create_folder("MsgStoreChecks");
  await make_message_sets_in_folders([gInbox], [{ count: 6 }]);

  // We delete the first message so that we have to compact anything.
  await be_in_folder(gInbox);
  const curMessage = await select_click_row(0);
  await press_delete(window);
  Assert.notEqual(curMessage, await select_click_row(0));

  const urlListener = {
    compactDone: false,

    OnStartRunningUrl() {},
    OnStopRunningUrl(aUrl, aExitCode) {
      Assert.equal(aExitCode, 0);
      Assert.ok(gInbox.msgDatabase.summaryValid);
      this.compactDone = true;
    },
  };

  // Compaction adds the X-Mozilla-Status rows into the messages
  // that we will need later on.
  Assert.ok(gInbox.msgStore.supportsCompaction);
  gInbox.compact(urlListener, null);

  await TestUtils.waitForCondition(
    function () {
      return urlListener.compactDone;
    },
    "Timeout waiting for compact to complete",
    10000,
    100
  );
});

/**
 * Checks that a message has particular status stored in the mbox file,
 * in the X-Mozilla-Status header.
 *
 * @param folder         The folder containing the message to check.
 * @param offset         Offset to the start of the message within mbox file.
 * @param expectedStatus The required status of the message.
 */
async function check_status(folder, offset, expectedStatus) {
  const mboxstring = await IOUtils.readUTF8(folder.filePath.path);

  // Ah-hoc header parsing. Only check the first 1KB because the X-Mozilla-*
  // headers should be near the start.
  let msg = mboxstring.slice(offset, offset + 1024);
  msg = msg.replace(/\r/g, ""); // Simplify by using LFs only.
  for (const line of msg.split("\n")) {
    if (line == "") {
      break; // end of header block.
    }
    if (line.startsWith("X-Mozilla-Status:")) {
      const hexValue = /:\s*([0-9a-f]+)/i.exec(line)[1];
      const gotStatus = parseInt(hexValue, 16);
      Assert.equal(
        gotStatus,
        expectedStatus,
        `Check X-Mozilla-Status (for msg at offset ${offset})`
      );
      return;
    }
  }
  // If we got this far, we didn't find the header.
  Assert.ok(
    false,
    `Find X-Mozilla-Status header (for msg at offset ${offset})`
  );
}

add_task(async function test_mark_messages_read() {
  be_in_folder(gOutbox); // TODO shouldn't have to swap folders
  // 5 messages in the folder
  await be_in_folder(gInbox);
  let curMessage = await select_click_row(0);
  // Store the offset because it will be unavailable via the hdr
  // after the message is deleted.
  const offset = curMessage.messageOffset;
  await check_status(gInbox, offset, 0); // status = unread
  await press_delete(window);
  Assert.notEqual(curMessage, await select_click_row(0));
  await check_status(
    gInbox,
    offset,
    Ci.nsMsgMessageFlags.Read + Ci.nsMsgMessageFlags.Expunged
  );

  // 4 messages in the folder.
  curMessage = await select_click_row(0);
  await check_status(gInbox, curMessage.messageOffset, 0); // status = unread

  // Make sure we can mark all read with >0 messages unread.
  await right_click_on_row(0);
  let hiddenPromise = BrowserTestUtils.waitForEvent(
    getMailContext(),
    "popuphidden"
  );
  await click_menus_in_sequence(getMailContext(), [
    { id: "mailContext-mark" },
    { id: "mailContext-markAllRead" },
  ]);
  await hiddenPromise;
  await new Promise(resolve => requestAnimationFrame(resolve));

  // All the 4 messages should now be read.
  Assert.ok(curMessage.isRead, "Message should have been marked Read!");
  await check_status(
    gInbox,
    curMessage.messageOffset,
    Ci.nsMsgMessageFlags.Read
  );
  curMessage = await select_click_row(1);
  Assert.ok(curMessage.isRead, "Message should have been marked Read!");
  await check_status(
    gInbox,
    curMessage.messageOffset,
    Ci.nsMsgMessageFlags.Read
  );
  curMessage = await select_click_row(2);
  Assert.ok(curMessage.isRead, "Message should have been marked Read!");
  await check_status(
    gInbox,
    curMessage.messageOffset,
    Ci.nsMsgMessageFlags.Read
  );
  curMessage = await select_click_row(3);
  Assert.ok(curMessage.isRead, "Message should have been marked Read!");
  await check_status(
    gInbox,
    curMessage.messageOffset,
    Ci.nsMsgMessageFlags.Read
  );

  // Let's have the last message unread.
  await right_click_on_row(3);
  hiddenPromise = BrowserTestUtils.waitForEvent(
    getMailContext(),
    "popuphidden"
  );
  await click_menus_in_sequence(getMailContext(), [
    { id: "mailContext-mark" },
    { id: "mailContext-markUnread" },
  ]);
  await hiddenPromise;
  await new Promise(resolve => requestAnimationFrame(resolve));

  Assert.ok(!curMessage.isRead, "Message should have not been marked Read!");
  await check_status(gInbox, curMessage.messageOffset, 0);
});

add_task(async function test_mark_messages_flagged() {
  // Mark a message with the star.
  const curMessage = await select_click_row(1);
  await right_click_on_row(1);
  const hiddenPromise = BrowserTestUtils.waitForEvent(
    getMailContext(),
    "popuphidden"
  );
  await click_menus_in_sequence(getMailContext(), [
    { id: "mailContext-mark" },
    { id: "mailContext-markFlagged" },
  ]);
  await hiddenPromise;
  await new Promise(resolve => requestAnimationFrame(resolve));

  Assert.ok(curMessage.isFlagged, "Message should have been marked Flagged!");
  await check_status(
    gInbox,
    curMessage.messageOffset,
    Ci.nsMsgMessageFlags.Read + Ci.nsMsgMessageFlags.Marked
  );
});

async function subtest_check_queued_message() {
  // Always check the last message in the Outbox for the correct flag.
  await be_in_folder(gOutbox);
  const lastMsg = [...gOutbox.messages].pop();
  await check_status(
    gOutbox,
    lastMsg.messageOffset,
    Ci.nsMsgMessageFlags.Queued
  );
}

/**
 * Create a reply or forward of a message and queue it for sending later.
 *
 * @param aMsgRow  Row index of message in Inbox that is to be replied/forwarded.
 * @param aReply   true = reply, false = forward.
 */
async function reply_forward_message(aMsgRow, aReply) {
  await be_in_folder(gInbox);
  await select_click_row(aMsgRow);
  let cwc;
  if (aReply) {
    // Reply to the message.
    cwc = await open_compose_with_reply();
  } else {
    // Forward the message.
    cwc = await open_compose_with_forward();
    // Type in some recipient.
    await setup_msg_contents(cwc, "somewhere@host.invalid", "", "");
  }

  // Send it later.
  const closePromise = BrowserTestUtils.domWindowClosed(cwc);
  // Ctrl+Shift+Return = Send Later
  cwc.document.getElementById("messageEditor").focus();
  EventUtils.synthesizeKey(
    "VK_RETURN",
    {
      shiftKey: true,
      accelKey: true,
    },
    cwc
  );
  await closePromise;

  await subtest_check_queued_message();

  // Now this is hacky. We can't get the message to be sent out of TB because there
  // is no fake SMTP server support yet.
  // But we know that upon real sending of the message, the code would/should call
  // .addMessageDispositionState(). So call it directly and check the expected
  // flags were set. This is risky as the real code could change and call
  // a different function and the purpose of this test would be lost.
  await be_in_folder(gInbox);
  const curMessage = await select_click_row(aMsgRow);
  const disposition = aReply
    ? gInbox.nsMsgDispositionState_Replied
    : gInbox.nsMsgDispositionState_Forwarded;
  gInbox.addMessageDispositionState(curMessage, disposition);
}

add_task(async function test_mark_messages_replied() {
  await reply_forward_message(2, true);
  const curMessage = await select_click_row(2);
  await check_status(
    gInbox,
    curMessage.messageOffset,
    Ci.nsMsgMessageFlags.Replied + Ci.nsMsgMessageFlags.Read
  );
});

add_task(async function test_mark_messages_forwarded() {
  await be_in_folder(gInbox);
  // Forward a clean message.
  await reply_forward_message(3, false);
  let curMessage = await select_click_row(3);
  await check_status(
    gInbox,
    curMessage.messageOffset,
    Ci.nsMsgMessageFlags.Forwarded
  );

  // Forward a message that is read and already replied to.
  curMessage = await select_click_row(2);
  await check_status(
    gInbox,
    curMessage.messageOffset,
    Ci.nsMsgMessageFlags.Replied + Ci.nsMsgMessageFlags.Read
  );
  await reply_forward_message(2, false);
  await check_status(
    gInbox,
    curMessage.messageOffset,
    Ci.nsMsgMessageFlags.Forwarded +
      Ci.nsMsgMessageFlags.Replied +
      Ci.nsMsgMessageFlags.Read
  );
});

registerCleanupFunction(async function () {
  Services.prefs.setBoolPref("mailnews.mark_message_read.auto", gAutoRead);
  // Clear all the created messages.
  await be_in_folder(gInbox.parent);
  await empty_folder(gInbox);
  // await empty_folder(gOutbox); TODO
  gInbox.server.rootFolder.emptyTrash(null);
});
