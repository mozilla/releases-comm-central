/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that messages marked as "not junk" in a virtual folder are returned
 * to the inbox for the account they belong to (see bug 1884660).
 */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
const { SmartMailboxUtils } = ChromeUtils.importESModule(
  "resource:///modules/SmartMailboxUtils.sys.mjs"
);

const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
let inbox, junk;
let otherInbox, otherJunk;
let smartJunk;

add_setup(async function () {
  Services.prefs.setBoolPref(
    "mailnews.ui.junk.manualMarkAsJunkMarksRead",
    true
  );
  Services.prefs.setBoolPref("mail.spam.manualMark", true);
  Services.prefs.setIntPref(
    "mail.spam.manualMarkMode",
    Ci.nsISpamSettings.MANUAL_MARK_MODE_MOVE
  );

  const server = MailServices.accounts.localFoldersServer;
  const rootFolder = server.rootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);

  // I hate that I have to do this, but even if the previous test cleaned up
  // these special folders, they'd still exist in the folder lookup service,
  // and that causes problems. So we might as well use the existing folder.
  inbox = rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  if (!inbox) {
    inbox = rootFolder.createLocalSubfolder("Inbox");
    inbox.setFlag(Ci.nsMsgFolderFlags.Inbox);
  }

  junk = rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Junk);
  if (!junk) {
    junk = rootFolder.createLocalSubfolder("Junk");
    junk.setFlag(Ci.nsMsgFolderFlags.Junk);
  }

  const generator = new MessageGenerator();
  inbox.QueryInterface(Ci.nsIMsgLocalMailFolder);
  inbox.addMessageBatch(
    generator
      .makeMessages({ count: 3 })
      .map(message => message.toMessageString())
  );

  const otherAccount = MailServices.accounts.createAccount();
  const otherServer = MailServices.accounts.createIncomingServer(
    "nobody",
    "nowhere",
    "none"
  );
  const otherRootFolder = otherServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  otherAccount.incomingServer = otherServer;

  otherInbox = otherRootFolder.createLocalSubfolder("Inbox");
  otherInbox.setFlag(Ci.nsMsgFolderFlags.Inbox);

  otherJunk = otherRootFolder.createLocalSubfolder("Junk");
  otherJunk.setFlag(Ci.nsMsgFolderFlags.Junk);

  otherInbox.QueryInterface(Ci.nsIMsgLocalMailFolder);
  otherInbox.addMessageBatch(
    generator
      .makeMessages({ count: 2 })
      .map(message => message.toMessageString())
  );

  about3Pane.folderPane.activeModes = ["all", "smart"];
  smartJunk = SmartMailboxUtils.getSmartMailbox().getSmartFolder("Junk");

  registerCleanupFunction(function () {
    inbox.deleteSelf(null);
    junk.deleteSelf(null);
    MailServices.accounts.removeAccount(otherAccount, false);
  });
});

add_task(async function () {
  Assert.equal(inbox.getTotalMessages(false), 3);
  Assert.equal(otherInbox.getTotalMessages(false), 2);

  // Mark the messages in inbox as junk.

  about3Pane.displayFolder(inbox);
  about3Pane.threadTree.selectAll();
  const move1 = PromiseTestUtils.promiseFolderEvent(
    inbox,
    "DeleteOrMoveMsgCompleted"
  );
  EventUtils.synthesizeKey("j", {}, about3Pane);
  await move1;
  Assert.equal(inbox.getTotalMessages(false), 0);

  // Mark the messages in otherInbox as junk.

  about3Pane.displayFolder(otherInbox);
  about3Pane.threadTree.selectAll();
  const move2 = PromiseTestUtils.promiseFolderEvent(
    otherInbox,
    "DeleteOrMoveMsgCompleted"
  );
  EventUtils.synthesizeKey("j", {}, about3Pane);
  await move2;
  Assert.equal(otherInbox.getTotalMessages(false), 0);

  // Open the smart junk folder.

  about3Pane.displayFolder(smartJunk);
  about3Pane.threadTree.selectAll();
  await TestUtils.waitForCondition(
    () => about3Pane.dbViewWrapperListener.allMessagesLoaded
  );
  Assert.equal(smartJunk.getTotalMessages(false), 5);

  // Unmark the messages.

  const move3 = PromiseTestUtils.promiseFolderEvent(
    junk,
    "DeleteOrMoveMsgCompleted"
  );
  const move4 = PromiseTestUtils.promiseFolderEvent(
    otherJunk,
    "DeleteOrMoveMsgCompleted"
  );
  EventUtils.synthesizeKey("j", { shiftKey: true }, about3Pane);
  await Promise.all([move3, move4]);

  Assert.equal(inbox.getTotalMessages(false), 3);
  Assert.equal(otherInbox.getTotalMessages(false), 2);
});
