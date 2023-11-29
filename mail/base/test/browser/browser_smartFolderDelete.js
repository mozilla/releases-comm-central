/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { VirtualFolderHelper } = ChromeUtils.import(
  "resource:///modules/VirtualFolderWrapper.jsm"
);

const { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;

let rootFolder;
let inboxFolder;

add_setup(async function () {
  MailServices.accounts.createLocalMailAccount();
  const account = MailServices.accounts.accounts[0];
  rootFolder = account.incomingServer.rootFolder;
  rootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);

  // Set the active modes of the folder pane. In theory we only need the "smart"
  // mode to test with, but in practice we also need the "all" mode to generate
  // messages in folders.
  about3Pane.folderPane.activeModes = ["all", "smart"];

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
    about3Pane.folderPane.activeModes = ["all"];
  });
});

/**
 * Test deleting a message from a smart folder using
 * gDBView.applyCommandToIndices.
 */
add_task(async function testDeleteViaDBViewCommand() {
  // Create an inbox folder.
  const inboxFolder = rootFolder
    .createLocalSubfolder("testDeleteInbox")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  inboxFolder.setFlag(Ci.nsMsgFolderFlags.Inbox);

  // Add a message to the folder.
  const generator = new MessageGenerator();
  inboxFolder.addMessage(generator.makeMessage().toMboxString());

  // Create a smart folder from the inbox.
  const smartInboxFolder = getSmartServer().rootFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Inbox
  );

  // Switch the view to the smart folder.
  about3Pane.displayFolder(smartInboxFolder.URI);

  // Get the DB view and tree view to use to send the command and observe its
  // effect.
  const dbView = about3Pane.gDBView;
  const treeView = dbView.QueryInterface(Ci.nsITreeView);

  // Ensure we currently have one message.
  Assert.equal(treeView.rowCount, 1, "should have one message before deleting");

  // Delete the message using applyCommandToIndices.
  dbView.applyCommandToIndices(Ci.nsMsgViewCommandType.deleteMsg, [0]);

  // Test that the message has been deleted.
  await TestUtils.waitForCondition(
    () => treeView.rowCount === 0,
    "there should be no remaining message in the tree"
  );
});
