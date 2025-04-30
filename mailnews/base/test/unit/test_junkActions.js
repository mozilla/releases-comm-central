/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the actions to take when a message is manually marked as junk.
 */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

add_task(async function () {
  const account = MailServices.accounts.createLocalMailAccount();
  const server = account.incomingServer;
  const rootFolder = server.rootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);

  const inbox = rootFolder.createLocalSubfolder("Inbox");
  inbox.setFlag(Ci.nsMsgFolderFlags.Inbox);

  const junk = rootFolder.createLocalSubfolder("Junk");
  junk.setFlag(Ci.nsMsgFolderFlags.Junk);

  const trash = rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash);

  const generator = new MessageGenerator();
  inbox.QueryInterface(Ci.nsIMsgLocalMailFolder);
  inbox.addMessageBatch(
    generator
      .makeMessages({ count: 10 })
      .map(message => message.toMessageString())
  );
  const messages = Array.from(inbox.messages);

  {
    const message = messages[0];
    Assert.equal(
      message.getStringProperty("junkscore"),
      "",
      "message should have no spam score"
    );

    inbox.setJunkScoreForMessages(
      [message],
      Ci.nsIJunkMailPlugin.IS_SPAM_SCORE,
      "test",
      -1
    );
    Assert.equal(
      message.getStringProperty("junkscore"),
      "100",
      "message should have spam score set"
    );
    Assert.equal(
      message.getStringProperty("junkscoreorigin"),
      "test",
      "message should have spam score origin set"
    );

    inbox.setJunkScoreForMessages(
      [message],
      Ci.nsIJunkMailPlugin.IS_HAM_SCORE,
      "",
      -1
    );
    Assert.equal(
      message.getStringProperty("junkscore"),
      "0",
      "message should have spam score cleared"
    );
    Assert.equal(
      message.getStringProperty("junkscoreorigin"),
      "",
      "message should have spam score origin cleared"
    );
  }

  {
    // Test not marking as read, and not moving or deleting. This achieves
    // nothing, but it's a possible configuration.
    Services.prefs.setBoolPref(
      "mailnews.ui.junk.manualMarkAsJunkMarksRead",
      false
    );
    Services.prefs.setBoolPref("mail.spam.manualMark", false);

    const testMessages = messages.slice(1, 3);
    Assert.ok(
      !testMessages[0].isRead,
      "message 0 should not be marked as read"
    );
    Assert.ok(
      !testMessages[1].isRead,
      "message 1 should not be marked as read"
    );

    const listener = new PromiseTestUtils.PromiseUrlListener();
    inbox.performActionsOnJunkMsgs(testMessages, true, null, listener);
    await listener.promise;

    Assert.equal(
      inbox.getTotalMessages(false),
      10,
      "messages should still be in the inbox"
    );
    Assert.equal(
      junk.getTotalMessages(false),
      0,
      "no messages should be in the junk"
    );
    Assert.equal(
      trash.getTotalMessages(false),
      0,
      "no messages should be in the trash"
    );
    Assert.equal(
      testMessages[0].getStringProperty("junkscore"),
      "",
      "message 0 should have no spam score"
    );
    Assert.equal(
      testMessages[1].getStringProperty("junkscore"),
      "",
      "message 1 should have no spam score"
    );
    Assert.ok(
      !testMessages[0].isRead,
      "message 0 should still not be marked as read"
    );
    Assert.ok(
      !testMessages[1].isRead,
      "message 1 should still not be marked as read"
    );
  }

  {
    // Test marking as read, but not moving or deleting.
    Services.prefs.setBoolPref(
      "mailnews.ui.junk.manualMarkAsJunkMarksRead",
      true
    );
    Services.prefs.setBoolPref("mail.spam.manualMark", false);

    const testMessages = messages.slice(3, 5);
    Assert.ok(
      !testMessages[0].isRead,
      "message 0 should not be marked as read"
    );
    Assert.ok(
      !testMessages[1].isRead,
      "message 1 should not be marked as read"
    );

    const listener = new PromiseTestUtils.PromiseUrlListener();
    inbox.performActionsOnJunkMsgs(testMessages, true, null, listener);
    await listener.promise;

    Assert.equal(
      inbox.getTotalMessages(false),
      10,
      "messages should still be in the inbox"
    );
    Assert.equal(
      junk.getTotalMessages(false),
      0,
      "no messages should be in the junk"
    );
    Assert.equal(
      trash.getTotalMessages(false),
      0,
      "no messages should be in the trash"
    );
    Assert.equal(
      testMessages[0].getStringProperty("junkscore"),
      "",
      "message 0 should have no spam score"
    );
    Assert.equal(
      testMessages[1].getStringProperty("junkscore"),
      "",
      "message 1 should have no spam score"
    );
    Assert.ok(testMessages[0].isRead, "message 0 should be marked as read");
    Assert.ok(testMessages[1].isRead, "message 1 should be marked as read");
  }

  {
    // Test marking as read, and moving.
    Services.prefs.setBoolPref(
      "mailnews.ui.junk.manualMarkAsJunkMarksRead",
      true
    );
    Services.prefs.setBoolPref("mail.spam.manualMark", true);
    Services.prefs.setIntPref(
      "mail.spam.manualMarkMode",
      Ci.nsISpamSettings.MANUAL_MARK_MODE_MOVE
    );

    const testMessages = messages.slice(5, 7);
    const messageIds = testMessages.map(m => m.messageId);
    Assert.ok(
      !testMessages[0].isRead,
      "message 0 should not be marked as read"
    );
    Assert.ok(
      !testMessages[1].isRead,
      "message 1 should not be marked as read"
    );

    let listener = new PromiseTestUtils.PromiseUrlListener();
    inbox.performActionsOnJunkMsgs(testMessages, true, null, listener);
    await listener.promise;

    Assert.ok(
      !inbox.msgDatabase.containsKey(testMessages[0].messageKey),
      "message 0 should no longer be in the inbox"
    );
    Assert.ok(
      !inbox.msgDatabase.containsKey(testMessages[1].messageKey),
      "message 1 should no longer be in the inbox"
    );
    Assert.equal(
      junk.getTotalMessages(false),
      2,
      "messages should now be in the junk"
    );

    const movedMessages = Array.from(junk.messages);
    Assert.deepEqual(
      movedMessages.map(m => m.messageId),
      messageIds,
      "the right messages were moved"
    );
    Assert.equal(
      movedMessages[0].getStringProperty("junkscore"),
      "",
      "moved message 0 should have no spam score"
    );
    Assert.equal(
      movedMessages[1].getStringProperty("junkscore"),
      "",
      "moved message 1 should have no spam score"
    );
    Assert.ok(
      movedMessages[0].isRead,
      "moved message 0 should be marked as read"
    );
    Assert.ok(
      movedMessages[1].isRead,
      "moved message 1 should be marked as read"
    );

    // Test reinstating one message to the inbox. It should stop being marked
    // as read.
    Services.prefs.setBoolPref("mail.spam.markAsNotJunkMarksUnRead", true);

    listener = new PromiseTestUtils.PromiseUrlListener();
    junk.performActionsOnJunkMsgs([movedMessages[0]], false, null, listener);
    await listener.promise;

    Assert.equal(
      inbox.getTotalMessages(false),
      9,
      "one message should be back in the inbox"
    );
    Assert.ok(
      !junk.msgDatabase.containsKey(movedMessages[0].messageKey),
      "message 0 should no longer be in the junk"
    );

    let reinstatedMessage = inbox.msgDatabase.getMsgHdrForMessageID(
      messageIds[0]
    );
    Assert.ok(reinstatedMessage, "the message should have been reinstated");
    Assert.equal(
      reinstatedMessage.getStringProperty("junkscore"),
      "",
      "reinstated message should have no spam score"
    );
    Assert.ok(
      !reinstatedMessage.isRead,
      "reinstated message should no longer be marked as read"
    );

    // Test reinstating the other message to the inbox. It should remain marked
    // as read.
    Services.prefs.setBoolPref("mail.spam.markAsNotJunkMarksUnRead", false);

    listener = new PromiseTestUtils.PromiseUrlListener();
    junk.performActionsOnJunkMsgs([movedMessages[1]], false, null, listener);
    await listener.promise;

    Assert.equal(
      inbox.getTotalMessages(false),
      10,
      "both messages should be back in the inbox"
    );
    Assert.ok(
      !junk.msgDatabase.containsKey(movedMessages[1].messageKey),
      "message 1 should no longer be in the junk"
    );

    reinstatedMessage = inbox.msgDatabase.getMsgHdrForMessageID(messageIds[1]);
    Assert.ok(reinstatedMessage, "the message should have been reinstated");
    Assert.equal(
      reinstatedMessage.getStringProperty("junkscore"),
      "",
      "reinstated message should have no spam score"
    );
    Assert.ok(
      reinstatedMessage.isRead,
      "reinstated message should still be marked as read"
    );
  }

  {
    // Test marking as read, and deleting.
    Services.prefs.setBoolPref(
      "mailnews.ui.junk.manualMarkAsJunkMarksRead",
      true
    );
    Services.prefs.setBoolPref("mail.spam.manualMark", true);
    Services.prefs.setIntPref(
      "mail.spam.manualMarkMode",
      Ci.nsISpamSettings.MANUAL_MARK_MODE_DELETE
    );

    const testMessages = messages.slice(7, 9);
    const messageIds = testMessages.map(m => m.messageId);
    Assert.ok(
      !testMessages[0].isRead,
      "message 0 should not be marked as read"
    );
    Assert.ok(
      !testMessages[1].isRead,
      "message 1 should not be marked as read"
    );

    let listener = new PromiseTestUtils.PromiseUrlListener();
    inbox.performActionsOnJunkMsgs(testMessages, true, null, listener);
    await listener.promise;

    Assert.ok(
      !inbox.msgDatabase.containsKey(testMessages[0].messageKey),
      "message 0 should no longer be in the inbox"
    );
    Assert.ok(
      !inbox.msgDatabase.containsKey(testMessages[1].messageKey),
      "message 1 should no longer be in the inbox"
    );
    Assert.equal(
      trash.getTotalMessages(false),
      2,
      "messages should now be in the trash"
    );

    const deletedMessages = Array.from(trash.messages);
    Assert.deepEqual(
      deletedMessages.map(m => m.messageId),
      messageIds,
      "the right messages were deleted"
    );
    Assert.equal(
      deletedMessages[0].getStringProperty("junkscore"),
      "",
      "deleted message 0 should have no spam score"
    );
    Assert.equal(
      deletedMessages[1].getStringProperty("junkscore"),
      "",
      "deleted message 1 should have no spam score"
    );
    Assert.ok(
      deletedMessages[0].isRead,
      "deleted message 0 should be marked as read"
    );
    Assert.ok(
      deletedMessages[1].isRead,
      "deleted message 1 should be marked as read"
    );

    // Test reinstating the message to the inbox, which will do nothing because
    // it's not in the junk folder, it's in the trash.

    listener = new PromiseTestUtils.PromiseUrlListener();
    trash.performActionsOnJunkMsgs(deletedMessages, false, null, listener);
    await listener.promise;

    Assert.equal(
      inbox.getTotalMessages(false),
      8,
      "messages should not be back in the inbox"
    );
    Assert.equal(
      junk.getTotalMessages(false),
      0,
      "no messages should be in the junk"
    );
    Assert.equal(
      trash.getTotalMessages(false),
      2,
      "messages should still be in the trash"
    );
  }
});
