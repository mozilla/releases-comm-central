/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This tests some commands on messages via the UI. But we specifically check,
 * whether the commands have an effect in the message store on disk, i.e. the
 * markings on the messages are stored in the msgStore, not only in the database.
 * For now, it checks for bug 840418.
 */
var MODULE_NAME = "test-message-commands-on-msgstore";

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers",
                         "compose-helpers",
                         "window-helpers"];

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/mailServices.js");
Cu.import("resource:///modules/IOUtils.js");

var statusHeader = "X-Mozilla-Status: ";
var nsMsgMessageFlags = Ci.nsMsgMessageFlags;

var gInbox;
var gOutbox;
var gAutoRead;

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }

  gAutoRead = Services.prefs.getBoolPref("mailnews.mark_message_read.auto");
  Services.prefs.setBoolPref("mailnews.mark_message_read.auto", false);

  gOutbox = MailServices.accounts.localFoldersServer.rootFolder.getChildNamed("Outbox");
  gInbox = create_folder("MsgStoreChecks");
  make_new_sets_in_folder(gInbox, [ {count: 6} ]);

  // We delete the first message so that we have to compact anything.
  be_in_folder(gInbox);
  let curMessage = select_click_row(0);
  press_delete(mc);
  assert_not_equals(curMessage, select_click_row(0));

  let urlListener = {
    compactDone: false,

    OnStartRunningUrl: function (aUrl) {
    },
    OnStopRunningUrl: function (aUrl, aExitCode) {
      assert_equals(aExitCode, 0);
      assert_true(gInbox.msgDatabase.summaryValid);
      this.compactDone = true;
    }
  };

  // Compaction adds the X-Mozilla-Status rows into the messages
  // that we will need later on.
  assert_true(gInbox.msgStore.supportsCompaction);
  gInbox.compact(urlListener, null);

  mc.waitFor(function() { return urlListener.compactDone; },
             "Timeout waiting for compact to complete", 10000, 100);
}

/**
 * Checks that a message has particular status stored in the data file.
 * Either the aMsgHdr or the aOffset+aStatusOffset must be non-null.
 *
 * @param aMsgHdr        The nsIMsgDBHdr header of the message to check. Optional.
 * @param aOffset        Offset in the file where the message data starts. Optional.
 * @param aStatusOffset  Offset from the start of the message where the status line is. Optional.
 * @param aStatus        The required status of the message.
 */
function check_status(aMsgHdr, aOffset, aStatusOffset, aStatus) {
  if (aOffset == null)
    aOffset = aMsgHdr.messageOffset;
  if (aStatusOffset == null)
    aStatusOffset = aMsgHdr.statusOffset;

  let folder = (aMsgHdr == null) ? gInbox : aMsgHdr.folder;

  let mboxstring = IOUtils.loadFileToString(folder.filePath);

  let expectedStatusString = aStatus.toString(16);
  while (expectedStatusString.length < 4) {
    expectedStatusString = '0' + expectedStatusString;
  }

  assert_equals(mboxstring.substr(aOffset + aStatusOffset, statusHeader.length),
                statusHeader,
                "The header '" + statusHeader + "' not found at offset: " + aOffset + ", statusOffset: " + aStatusOffset);
  assert_equals(mboxstring.substr(aOffset + aStatusOffset + statusHeader.length, 4),
                expectedStatusString);
}

function test_mark_messages_read() {
  // 5 messages in the folder
  be_in_folder(gInbox);
  let curMessage = select_click_row(0);
  // Store the values because they will be unavailable via the hdr
  // after the message is deleted.
  let offset = curMessage.messageOffset;
  let statusOffset = curMessage.statusOffset;
  check_status(curMessage, null, null, 0); // status = unread
  press_delete(mc);
  assert_not_equals(curMessage, select_click_row(0));
  check_status(null, offset, statusOffset,
               nsMsgMessageFlags.Read + nsMsgMessageFlags.Expunged);

  // 4 messages in the folder.
  curMessage = select_click_row(0);
  check_status(curMessage, null, null, 0); // status = unread

  // Make sure we can mark all read with >0 messages unread.
  right_click_on_row(0);
  mc.click_menus_in_sequence(mc.e("mailContext"), [{id: "mailContext-mark"},
                                                   {id: "mailContext-markAllRead"}]);

  // All the 4 messages should now be read.
  assert_true(curMessage.isRead, "Message should have been marked Read!");
  check_status(curMessage, null, null, nsMsgMessageFlags.Read);
  curMessage = select_click_row(1);
  assert_true(curMessage.isRead, "Message should have been marked Read!");
  check_status(curMessage, null, null, nsMsgMessageFlags.Read);
  curMessage = select_click_row(2);
  assert_true(curMessage.isRead, "Message should have been marked Read!");
  check_status(curMessage, null, null, nsMsgMessageFlags.Read);
  curMessage = select_click_row(3);
  assert_true(curMessage.isRead, "Message should have been marked Read!");
  check_status(curMessage, null, null, nsMsgMessageFlags.Read);

  // Let's have the last message unread.
  right_click_on_row(3);
  mc.click_menus_in_sequence(mc.e("mailContext"), [{id: "mailContext-mark"},
                                                   {id: "mailContext-markUnread"}]);
  assert_false(curMessage.isRead, "Message should have not been marked Read!");
  check_status(curMessage, null, null, 0);
}

function test_mark_messages_flagged() {
  // Mark a message with the star.
  let curMessage = select_click_row(1);
  right_click_on_row(1);
  mc.click_menus_in_sequence(mc.e("mailContext"), [{id: "mailContext-mark"},
                                                   {id: "mailContext-markFlagged"}]);
  assert_true(curMessage.isFlagged, "Message should have been marked Flagged!");
  check_status(curMessage, null, null, nsMsgMessageFlags.Read + nsMsgMessageFlags.Marked);
}

function subtest_check_queued_message() {
  // Always check the last message in the Outbox for the correct flag.
  let outbox = MailServices.accounts.localFoldersServer.rootFolder.getChildNamed("Outbox");
  be_in_folder(outbox);
  let queued = outbox.messages;
  while (queued.hasMoreElements()) {
    let msg = queued.getNext().QueryInterface(Ci.nsIMsgDBHdr);
    if (!queued.hasMoreElements()) {
      check_status(msg, null, null, nsMsgMessageFlags.Queued);
    }
  }
}

/**
 * Create a reply or forward of a message and queue it for sending later.
 *
 * @param aMsgRow  Row index of message in Inbox that is to be replied/forwarded.
 * @param aReply   true = reply, false = forward.
 */
function reply_forward_message(aMsgRow, aReply) {
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
    cwc.type(cwc.eid("addressCol2#1"), "somewhere@host.invalid");
  }

  // Send it later.
  plan_for_window_close(cwc);
  // Ctrl+Shift+Return = Send Later
  cwc.keypress(cwc.eid("content-frame"), "VK_RETURN", {shiftKey: true, accelKey: true});
  wait_for_window_close(cwc);

  subtest_check_queued_message();

  // Now this is hacky. We can't get the message to be sent out of TB because there
  // is no fake SMTP server support yet.
  // But we know that upon real sending of the message, the code would/should call
  // .addMessageDispositionState(). So call it directly and check the expected
  // flags were set. This is risky as the real code could change and call
  // a different function and the purpose of this test would be lost.
  be_in_folder(gInbox);
  let curMessage = select_click_row(aMsgRow);
  let disposition = aReply ? gInbox.nsMsgDispositionState_Replied :
                             gInbox.nsMsgDispositionState_Forwarded;
  gInbox.addMessageDispositionState(curMessage, disposition);
}

function test_mark_messages_replied() {
  reply_forward_message(2, true);
  let curMessage = select_click_row(2);
  check_status(curMessage, null, null,
               nsMsgMessageFlags.Replied + nsMsgMessageFlags.Read);
}

function test_mark_messages_forwarded() {
  be_in_folder(gInbox);
  // Forward a clean message.
  reply_forward_message(3, false);
  let curMessage = select_click_row(3);
  check_status(curMessage, null, null, nsMsgMessageFlags.Forwarded);

  // Forward a message that is read and already replied to.
  reply_forward_message(2, false);
  curMessage = select_click_row(2);
  check_status(curMessage, null, null,
               nsMsgMessageFlags.Forwarded + nsMsgMessageFlags.Replied +
               nsMsgMessageFlags.Read);
}

function clear_folder(aFolder) {
  be_in_folder(aFolder);
  let msgCount = 0;
  while ((msgCount = aFolder.getTotalMessages(false)) > 0) {
    let curMessage = select_click_row(0);
    press_delete(mc)
  }
}

function teardownModule(module) {
  Services.prefs.setBoolPref("mailnews.mark_message_read.auto", gAutoRead);
  // Clear all the created messages.
  be_in_folder(gInbox.parent);
  clear_folder(gInbox);
  clear_folder(gOutbox);
  gInbox.server.rootFolder.emptyTrash(null, null);
}
