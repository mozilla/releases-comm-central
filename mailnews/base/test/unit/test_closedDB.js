/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that an nsMsgDBFolder's database connection and listeners are
 * restored when called by certain functions.
 */

const { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);

add_task(async function () {
  // Create a folder and some messages.

  const generator = new MessageGenerator();

  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());

  const rootFolder = account.incomingServer.rootFolder;
  rootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);

  const testFolder = rootFolder.createLocalSubfolder("testFolder");
  testFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  testFolder.addMessageBatch(
    generator
      .makeMessages({ count: 5 })
      .map(message => message.toMessageString())
  );
  const testMessages = [...testFolder.messages];

  // Listen for notifications.

  const folderListener = {
    QueryInterface: ChromeUtils.generateQI(["nsIFolderListener"]),
    notifications: [],
    onFolderIntPropertyChanged(folder, property, oldValue, newValue) {
      if (property != "TotalUnreadMessages") {
        return;
      }

      this.notifications.push({ folder, property, oldValue, newValue });
    },
    consumeNotification(expectedFolder, expectedOldValue, expectedNewValue) {
      const { folder, oldValue, newValue } = this.notifications.shift();
      Assert.equal(folder, expectedFolder, "notification folder");
      Assert.equal(oldValue, expectedOldValue, "notification oldValue");
      Assert.equal(newValue, expectedNewValue, "notification newValue");
    },
  };
  MailServices.mailSession.AddFolderListener(
    folderListener,
    Ci.nsIFolderListener.intPropertyChanged
  );

  // Clear the database reference, then mark some messages as read. We should
  // see the unread count change and get two notifications about it. We could
  // check `testFolder.msgDatabase` is not null afterwards, but that would be
  // pointless, because the getter restores the database.

  testFolder.msgDatabase = null;
  testFolder.markMessagesRead([testMessages[0], testMessages[4]], true);
  Assert.equal(
    testFolder.getNumUnread(false),
    3,
    "unread message count should be updated"
  );
  Assert.equal(
    folderListener.notifications.length,
    2,
    "two folder notifications should have fired"
  );
  folderListener.consumeNotification(testFolder, 5, 4);
  folderListener.consumeNotification(testFolder, 4, 3);

  // Clear the database reference, then mark some messages as flagged. This
  // doesn't prove much except that nothing exploded.

  testFolder.msgDatabase = null;
  testFolder.markMessagesFlagged([testMessages[1], testMessages[3]], true);

  // Clear the database reference, then mark all messages as read. We should
  // see the unread count change to zero and get a notification about it.

  testFolder.msgDatabase = null;
  testFolder.markAllMessagesRead(null);
  Assert.equal(
    testFolder.getNumUnread(false),
    0,
    "unread message count should be updated"
  );
  Assert.equal(
    folderListener.notifications.length,
    1,
    "a folder notifications should have fired"
  );
  folderListener.consumeNotification(testFolder, 3, 0);

  // Clean up.

  MailServices.mailSession.RemoveFolderListener(folderListener);
  MailServices.accounts.removeAccount(account, false);
});
