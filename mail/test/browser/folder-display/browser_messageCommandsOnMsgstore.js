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

var {
  open_compose_with_forward,
  open_compose_with_reply,
  setup_msg_contents,
} = ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
var {
  be_in_folder,
  create_folder,
  empty_folder,
  get_special_folder,
  make_new_sets_in_folder,
  mc,
  press_delete,
  right_click_on_row,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { plan_for_window_close, wait_for_window_close } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var statusHeader = "X-Mozilla-Status: ";

var gInbox;
var gOutbox;
var gAutoRead;

add_task(function setupModule(module) {
  gAutoRead = Services.prefs.getBoolPref("mailnews.mark_message_read.auto");
  Services.prefs.setBoolPref("mailnews.mark_message_read.auto", false);

  gOutbox = get_special_folder(Ci.nsMsgFolderFlags.Queue);
  gInbox = create_folder("MsgStoreChecks");
  make_new_sets_in_folder(gInbox, [{ count: 6 }]);

  // We delete the first message so that we have to compact anything.
  be_in_folder(gInbox);
  let curMessage = select_click_row(0);
  press_delete(mc);
  Assert.notEqual(curMessage, select_click_row(0));

  let urlListener = {
    compactDone: false,

    OnStartRunningUrl(aUrl) {},
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

  mc.waitFor(
    function() {
      return urlListener.compactDone;
    },
    "Timeout waiting for compact to complete",
    10000,
    100
  );
});

/**
 * Checks that a message has particular status stored in the data file.
 * Either the aMsgHdr or the aOffset+aStatusOffset must be non-null.
 *
 * @param aMsgHdr        The nsIMsgDBHdr header of the message to check. Optional.
 * @param aOffset        Offset in the file where the message data starts. Optional.
 * @param aStatusOffset  Offset from the start of the message where the status line is. Optional.
 * @param aStatus        The required status of the message.
 */
async function check_status(aMsgHdr, aOffset, aStatusOffset, aStatus) {
  if (aOffset == null) {
    aOffset = aMsgHdr.messageOffset;
  }
  if (aStatusOffset == null) {
    aStatusOffset = aMsgHdr.statusOffset;
  }

  let folder = aMsgHdr == null ? gInbox : aMsgHdr.folder;
  let mboxstring = await IOUtils.readUTF8(folder.filePath.path);

  let expectedStatusString = aStatus.toString(16);
  while (expectedStatusString.length < 4) {
    expectedStatusString = "0" + expectedStatusString;
  }

  Assert.equal(
    mboxstring.substr(aOffset + aStatusOffset, statusHeader.length),
    statusHeader,
    "The header '" +
      statusHeader +
      "' not found at offset: " +
      aOffset +
      ", statusOffset: " +
      aStatusOffset
  );
  Assert.equal(
    mboxstring.substr(aOffset + aStatusOffset + statusHeader.length, 4),
    expectedStatusString
  );
}

add_task(async function test_mark_messages_read() {
  // 5 messages in the folder
  be_in_folder(gInbox);
  let curMessage = select_click_row(0);
  // Store the values because they will be unavailable via the hdr
  // after the message is deleted.
  let offset = curMessage.messageOffset;
  let statusOffset = curMessage.statusOffset;
  await check_status(curMessage, null, null, 0); // status = unread
  press_delete(mc);
  Assert.notEqual(curMessage, select_click_row(0));
  await check_status(
    null,
    offset,
    statusOffset,
    Ci.nsMsgMessageFlags.Read + Ci.nsMsgMessageFlags.Expunged
  );

  // 4 messages in the folder.
  curMessage = select_click_row(0);
  await check_status(curMessage, null, null, 0); // status = unread

  // Make sure we can mark all read with >0 messages unread.
  await right_click_on_row(0);
  let hiddenPromise = BrowserTestUtils.waitForEvent(
    mc.e("mailContext"),
    "popuphidden"
  );
  await mc.click_menus_in_sequence(mc.e("mailContext"), [
    { id: "mailContext-mark" },
    { id: "mailContext-markAllRead" },
  ]);
  await hiddenPromise;
  await new Promise(resolve => requestAnimationFrame(resolve));

  // All the 4 messages should now be read.
  Assert.ok(curMessage.isRead, "Message should have been marked Read!");
  await check_status(curMessage, null, null, Ci.nsMsgMessageFlags.Read);
  curMessage = select_click_row(1);
  Assert.ok(curMessage.isRead, "Message should have been marked Read!");
  await check_status(curMessage, null, null, Ci.nsMsgMessageFlags.Read);
  curMessage = select_click_row(2);
  Assert.ok(curMessage.isRead, "Message should have been marked Read!");
  await check_status(curMessage, null, null, Ci.nsMsgMessageFlags.Read);
  curMessage = select_click_row(3);
  Assert.ok(curMessage.isRead, "Message should have been marked Read!");
  await check_status(curMessage, null, null, Ci.nsMsgMessageFlags.Read);

  // Let's have the last message unread.
  await right_click_on_row(3);
  hiddenPromise = BrowserTestUtils.waitForEvent(
    mc.e("mailContext"),
    "popuphidden"
  );
  await mc.click_menus_in_sequence(mc.e("mailContext"), [
    { id: "mailContext-mark" },
    { id: "mailContext-markUnread" },
  ]);
  await hiddenPromise;
  await new Promise(resolve => requestAnimationFrame(resolve));

  Assert.ok(!curMessage.isRead, "Message should have not been marked Read!");
  await check_status(curMessage, null, null, 0);
});

add_task(async function test_mark_messages_flagged() {
  // Mark a message with the star.
  let curMessage = select_click_row(1);
  await right_click_on_row(1);
  let hiddenPromise = BrowserTestUtils.waitForEvent(
    mc.e("mailContext"),
    "popuphidden"
  );
  await mc.click_menus_in_sequence(mc.e("mailContext"), [
    { id: "mailContext-mark" },
    { id: "mailContext-markFlagged" },
  ]);
  await hiddenPromise;
  await new Promise(resolve => requestAnimationFrame(resolve));

  Assert.ok(curMessage.isFlagged, "Message should have been marked Flagged!");
  await check_status(
    curMessage,
    null,
    null,
    Ci.nsMsgMessageFlags.Read + Ci.nsMsgMessageFlags.Marked
  );
});

async function subtest_check_queued_message() {
  // Always check the last message in the Outbox for the correct flag.
  be_in_folder(gOutbox);
  let lastMsg = [...gOutbox.messages].pop();
  await check_status(lastMsg, null, null, Ci.nsMsgMessageFlags.Queued);
}

/**
 * Create a reply or forward of a message and queue it for sending later.
 *
 * @param aMsgRow  Row index of message in Inbox that is to be replied/forwarded.
 * @param aReply   true = reply, false = forward.
 */
async function reply_forward_message(aMsgRow, aReply) {
  be_in_folder(gInbox);
  select_click_row(aMsgRow);
  let cwc;
  if (aReply) {
    // Reply to the message.
    cwc = open_compose_with_reply();
  } else {
    // Forward the message.
    cwc = open_compose_with_forward();
    // Type in some recipient.
    setup_msg_contents(cwc, "somewhere@host.invalid", "", "");
  }

  // Send it later.
  plan_for_window_close(cwc);
  // Ctrl+Shift+Return = Send Later
  cwc.window.document.getElementById("content-frame").focus();
  EventUtils.synthesizeKey(
    "VK_RETURN",
    {
      shiftKey: true,
      accelKey: true,
    },
    cwc.window
  );
  wait_for_window_close(cwc);

  await subtest_check_queued_message();

  // Now this is hacky. We can't get the message to be sent out of TB because there
  // is no fake SMTP server support yet.
  // But we know that upon real sending of the message, the code would/should call
  // .addMessageDispositionState(). So call it directly and check the expected
  // flags were set. This is risky as the real code could change and call
  // a different function and the purpose of this test would be lost.
  be_in_folder(gInbox);
  let curMessage = select_click_row(aMsgRow);
  let disposition = aReply
    ? gInbox.nsMsgDispositionState_Replied
    : gInbox.nsMsgDispositionState_Forwarded;
  gInbox.addMessageDispositionState(curMessage, disposition);
}

add_task(async function test_mark_messages_replied() {
  await reply_forward_message(2, true);
  let curMessage = select_click_row(2);
  await check_status(
    curMessage,
    null,
    null,
    Ci.nsMsgMessageFlags.Replied + Ci.nsMsgMessageFlags.Read
  );
});

add_task(async function test_mark_messages_forwarded() {
  be_in_folder(gInbox);
  // Forward a clean message.
  await reply_forward_message(3, false);
  let curMessage = select_click_row(3);
  await check_status(curMessage, null, null, Ci.nsMsgMessageFlags.Forwarded);

  // Forward a message that is read and already replied to.
  curMessage = select_click_row(2);
  await check_status(
    curMessage,
    null,
    null,
    Ci.nsMsgMessageFlags.Replied + Ci.nsMsgMessageFlags.Read
  );
  await reply_forward_message(2, false);
  await check_status(
    curMessage,
    null,
    null,
    Ci.nsMsgMessageFlags.Forwarded +
      Ci.nsMsgMessageFlags.Replied +
      Ci.nsMsgMessageFlags.Read
  );
});

registerCleanupFunction(function teardownModule(module) {
  Services.prefs.setBoolPref("mailnews.mark_message_read.auto", gAutoRead);
  // Clear all the created messages.
  be_in_folder(gInbox.parent);
  empty_folder(gInbox);
  empty_folder(gOutbox);
  gInbox.server.rootFolder.emptyTrash(null, null);
});
