/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { GmailServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/IMAPServer.sys.mjs"
);
const { MessageGenerator, SyntheticMessageSet } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
const { VirtualFolderHelper } = ChromeUtils.importESModule(
  "resource:///modules/VirtualFolderWrapper.sys.mjs"
);

const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
const { folderPane, folderTree, threadTree } = about3Pane;
let account,
  rootFolder,
  inboxFolder,
  trashFolder,
  outboxFolder,
  folderA,
  folderB,
  folderC,
  folderMultiA,
  folderMultiB,
  folderMultiC,
  folderMultiD,
  moreButton,
  moreContext;
const generator = new MessageGenerator();

add_setup(async function () {
  account = MailServices.accounts.createLocalMailAccount();
  rootFolder = account.incomingServer.rootFolder;
  rootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  inboxFolder = rootFolder.createLocalSubfolder("Inbox");
  inboxFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  trashFolder = rootFolder.getChildNamed("Trash");
  outboxFolder = rootFolder.getChildNamed("Unsent Messages");
  folderA = rootFolder
    .createLocalSubfolder("folderTreeQuirksA")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  folderB = folderA
    .createLocalSubfolder("folderTreeQuirksB")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  folderC = folderB
    .createLocalSubfolder("folderTreeQuirksC")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);

  moreButton = about3Pane.document.querySelector("#folderPaneMoreButton");
  moreContext = about3Pane.document.getElementById("folderPaneMoreContext");

  folderA.addMessageBatch(
    generator.makeMessages({}).map(message => message.toMessageString())
  );
  folderA.markAllMessagesRead(null);
  folderB.addMessageBatch(
    generator.makeMessages({}).map(message => message.toMessageString())
  );
  folderB.markAllMessagesRead(null);
  folderC.addMessageBatch(
    generator.makeMessages({}).map(message => message.toMessageString())
  );
  folderC.markAllMessagesRead(null);

  Services.prefs.setIntPref("ui.prefersReducedMotion", 1);
  about3Pane.paneLayout.messagePaneVisible = false;

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
    Services.prefs.clearUserPref("ui.prefersReducedMotion");
    folderPane.activeModes = ["all"];
    Services.xulStore.removeDocument(
      "chrome://messenger/content/messenger.xhtml"
    );
    about3Pane.paneLayout.messagePaneVisible = true;
  });
});

/**
 * Tests the Favorite Folders mode.
 */
add_task(async function testFavoriteFolders() {
  folderPane.activeModes = ["all", "favorite"];
  await checkModeListItems("favorite", []);

  folderA.setFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", [rootFolder, folderA]);

  folderA.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", []);

  folderB.setFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", [rootFolder, folderA, folderB]);

  folderB.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", []);

  folderC.setFlag(Ci.nsMsgFolderFlags.Favorite);
  folderA.setFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", [rootFolder, folderA, folderB, folderC]);

  folderA.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", [rootFolder, folderA, folderB, folderC]);

  folderC.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", []);
});

/**
 * Tests the compact Favorite Folders mode.
 */
add_task(async function testCompactFavoriteFolders() {
  folderPane.activeModes = ["all", "favorite"];
  folderPane.isCompact = true;
  await checkModeListItems("favorite", [], "compact");

  folderA.setFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", [folderA], "compact");

  folderA.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", [], "compact");

  folderB.setFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", [folderB], "compact");

  folderB.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", [], "compact");

  folderC.setFlag(Ci.nsMsgFolderFlags.Favorite);
  folderA.setFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", [folderA, folderC], "compact"); // c, a

  folderA.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", [folderC], "compact");

  folderC.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", [], "compact");

  // Test with multiple accounts.

  const foo = MailServices.accounts.createAccount();
  foo.incomingServer = MailServices.accounts.createIncomingServer(
    `${foo.key}user`,
    "localhost",
    "none"
  );
  const fooRootFolder = foo.incomingServer.rootFolder;
  const fooTrashFolder = fooRootFolder.getChildNamed("Trash");

  fooTrashFolder.setFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", [fooTrashFolder], "compact");

  folderC.setFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", [fooTrashFolder, folderC], "compact");

  MailServices.accounts.reorderAccounts([account.key, foo.key]);
  await checkModeListItems("favorite", [folderC, fooTrashFolder], "compact");

  fooTrashFolder.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", [folderC], "compact");

  fooTrashFolder.setFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", [folderC, fooTrashFolder], "compact");

  folderC.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", [fooTrashFolder], "compact");

  // Clean up.

  MailServices.accounts.removeAccount(foo, false);
  await checkModeListItems("favorite", [], "compact");
  folderPane.isCompact = false;
});

/**
 * Tests the Unread Folders mode.
 */
add_task(async function testUnreadFolders() {
  const folderAMessages = [...folderA.messages];
  const folderBMessages = [...folderB.messages];
  const folderCMessages = [...folderC.messages];

  folderPane.activeModes = ["all", "unread"];
  await checkModeListItems("unread", []);

  folderAMessages[0].markRead(false);
  await checkModeListItems("unread", [rootFolder, folderA]);

  folderAMessages[1].markRead(false);
  folderAMessages[2].markRead(false);
  await checkModeListItems("unread", [rootFolder, folderA]);

  window.MsgMarkAllRead([folderA]);
  await checkModeListItems("unread", []);

  folderAMessages[0].markRead(false);
  folderBMessages[0].markRead(false);
  await checkModeListItems("unread", [rootFolder, folderA, folderB]);

  folderCMessages[0].markRead(false);
  await checkModeListItems("unread", [rootFolder, folderA, folderB, folderC]);

  folderBMessages[0].markRead(true);
  await checkModeListItems("unread", [rootFolder, folderA, folderB, folderC]);

  folderAMessages[0].markRead(true);
  await checkModeListItems("unread", [rootFolder, folderA, folderB, folderC]);

  folderCMessages[0].markRead(true);
  await checkModeListItems("unread", []);

  folderCMessages[0].markRead(false);
  await checkModeListItems("unread", [rootFolder, folderA, folderB, folderC]);

  folderCMessages[1].markRead(false);
  folderCMessages[2].markRead(false);
  await checkModeListItems("unread", [rootFolder, folderA, folderB, folderC]);

  window.MsgMarkAllRead([folderC]);
  await checkModeListItems("unread", []);
});

/**
 * Tests the interaction between folder selection and
 * automatic folder removal in the Unread Folders mode.
 */
add_task(async function testUnreadFoldersAutoRemovalWithSelection() {
  const folderB1 = folderA
    .createLocalSubfolder("folderTreeQuirksB1")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  folderB1.addMessageBatch(
    generator.makeMessages({}).map(message => message.toMessageString())
  );
  folderB1.markAllMessagesRead(null);

  const folderAMessages = [...folderA.messages];
  const folderBMessages = [...folderB.messages];
  const folderB1Messages = [...folderB1.messages];
  const folderCMessages = [...folderC.messages];

  folderPane.activeModes = ["all", "unread"];
  await checkModeListItems("unread", [], "with selection");

  // This test uses folder.markMessagesRead instead of message.markRead
  // because moving the selection around tends to cause folders' databases
  // to be closed. In that situation, markMessagesRead triggers folder
  // listeners, but markRead doesn't.
  folderC.markMessagesRead([folderCMessages[0]], false);
  await checkModeListItems(
    "unread",
    [rootFolder, folderA, folderB, folderC],
    "with selection"
  );

  // Marking the selected folder read:
  await selectFolder(folderC, "unread");
  folderC.markAllMessagesRead(null);
  await checkModeListItems(
    "unread",
    [rootFolder, folderA, folderB, folderC],
    "with selection"
  );

  // Marking an ancestor of the selected folder as read:
  folderA.markMessagesRead([folderAMessages[0]], false);
  folderA.markAllMessagesRead(null);
  await checkModeListItems(
    "unread",
    [rootFolder, folderA, folderB, folderC],
    "with selection"
  );

  // Marking a descendant of the selected folder as read:
  folderC.markMessagesRead([folderCMessages[0]], false);
  await selectFolder(folderA, "unread");
  folderC.markAllMessagesRead(null);
  await checkModeListItems("unread", [rootFolder, folderA], "with selection");

  // Marking a descendant of the selected folder as read, but there's an intermediate unread folder.
  folderB.markMessagesRead([folderBMessages[0]], false);
  folderC.markMessagesRead([folderCMessages[0]], false);
  folderC.markAllMessagesRead(null);
  await checkModeListItems(
    "unread",
    [rootFolder, folderA, folderB],
    "with selection"
  );
  folderB.markAllMessagesRead(null);

  // Marking a descendant of the selected folder as read, but there's an unread sibling.
  folderB.markMessagesRead([folderBMessages[0]], false);
  folderB1.markMessagesRead([folderB1Messages[0]], false);
  folderB.markAllMessagesRead(null);
  await checkModeListItems(
    "unread",
    [rootFolder, folderA, folderB1],
    "with selection"
  );
  folderB1.markAllMessagesRead(null);

  // Moving selection from a read folder to its descendant:
  folderB.markMessagesRead([folderBMessages[0]], false); // Can't select the folder if it's not in the view.
  await selectFolder(folderB, "unread");
  folderB.markAllMessagesRead(null);
  await checkModeListItems(
    "unread",
    [rootFolder, folderA, folderB],
    "with selection"
  );

  // Moving selection from a read folder to its ancestor:
  await selectFolder(folderA, "unread");
  await checkModeListItems("unread", [rootFolder, folderA], "with selection");

  // Moving selection from a read folder to its sibling:
  folderB.markMessagesRead([folderBMessages[0]], false);
  folderB1.markMessagesRead([folderB1Messages[0]], false);
  await selectFolder(folderB1, "unread");
  folderB1.markAllMessagesRead(null);
  await checkModeListItems(
    "unread",
    [rootFolder, folderA, folderB, folderB1],
    "with selection"
  );
  await selectFolder(folderB, "unread");
  await checkModeListItems(
    "unread",
    [rootFolder, folderA, folderB],
    "with selection"
  );
  folderB.markAllMessagesRead(null);

  // Moving selection from a read folder to its sibling, but the previously selected
  // folder has a child with unread messages
  folderB1.markMessagesRead([folderB1Messages[0]], false);
  folderC.markMessagesRead([folderCMessages[0]], false);
  await checkModeListItems(
    "unread",
    [rootFolder, folderA, folderB, folderC, folderB1],
    "with selection"
  );
  await selectFolder(folderB1, "unread");
  folderB1.markAllMessagesRead(null);
  await checkModeListItems(
    "unread",
    [rootFolder, folderA, folderB, folderC, folderB1],
    "with selection"
  );
  folderC.markAllMessagesRead(null);

  // Clean up.
  // Deselecting the folder should be enough to remove it from the unread list.
  await selectFolder(folderA, null);
  await checkModeListItems("unread", [], "with selection");
  folderB1.deleteSelf(null);
  rootFolder.emptyTrash(null, null);
});

/**
 * Tests the compact Unread Folders mode.
 */
add_task(async function testCompactUnreadFolders() {
  const folderAMessages = [...folderA.messages];
  const folderBMessages = [...folderB.messages];
  const folderCMessages = [...folderC.messages];

  folderPane.activeModes = ["all", "unread"];
  folderPane.isCompact = true;
  await checkModeListItems("unread", [], "compact");

  folderAMessages[0].markRead(false);
  await checkModeListItems("unread", [folderA], "compact");

  folderAMessages[1].markRead(false);
  folderAMessages[2].markRead(false);
  await checkModeListItems("unread", [folderA], "compact");

  window.MsgMarkAllRead([folderA]);
  await checkModeListItems("unread", [], "compact");

  folderAMessages[0].markRead(false);
  folderBMessages[0].markRead(false);
  await checkModeListItems("unread", [folderA, folderB], "compact");

  folderCMessages[0].markRead(false);
  await checkModeListItems("unread", [folderA, folderB, folderC], "compact");

  folderBMessages[0].markRead(true);
  await checkModeListItems("unread", [folderA, folderC], "compact");

  folderAMessages[0].markRead(true);
  await checkModeListItems("unread", [folderC], "compact");

  folderCMessages[0].markRead(true);
  await checkModeListItems("unread", [], "compact");

  folderCMessages[0].markRead(false);
  await checkModeListItems("unread", [folderC], "compact");

  folderCMessages[1].markRead(false);
  folderCMessages[2].markRead(false);
  await checkModeListItems("unread", [folderC], "compact");

  window.MsgMarkAllRead([folderC]);
  await checkModeListItems("unread", [], "compact");

  // Test with multiple accounts.

  const foo = MailServices.accounts.createAccount();
  foo.incomingServer = MailServices.accounts.createIncomingServer(
    `${foo.key}user`,
    "localhost",
    "none"
  );
  const fooRootFolder = foo.incomingServer.rootFolder;
  const fooTrashFolder = fooRootFolder.getChildNamed("Trash");

  fooTrashFolder
    .QueryInterface(Ci.nsIMsgLocalMailFolder)
    .addMessage(generator.makeMessages({}).map(m => m.toMessageString()));
  const fooMessages = [...fooTrashFolder.messages];

  fooMessages[0].markRead(false);
  await checkModeListItems("unread", [fooTrashFolder], "compact");

  folderCMessages[0].markRead(false);
  await checkModeListItems("unread", [fooTrashFolder, folderC], "compact");

  MailServices.accounts.reorderAccounts([account.key, foo.key]);
  await checkModeListItems("unread", [folderC, fooTrashFolder], "compact");

  fooMessages[0].markRead(true);
  await checkModeListItems("unread", [folderC], "compact");

  fooMessages[0].markRead(false);
  await checkModeListItems("unread", [folderC, fooTrashFolder], "compact");

  folderCMessages[0].markRead(true);
  await checkModeListItems("unread", [fooTrashFolder], "compact");

  // Clean up.

  MailServices.accounts.removeAccount(foo, false);
  await checkModeListItems("unread", [], "compact");
  folderPane.isCompact = false;
});

/**
 * Tests the interation between folder selection and automatic
 * folder removal in the compact Unread Folders mode.
 */
add_task(async function testCompactUnreadFoldersAutoRemovalWithSelection() {
  const folderAMessages = [...folderA.messages];
  const folderBMessages = [...folderB.messages];
  const folderCMessages = [...folderC.messages];

  folderPane.activeModes = ["all", "unread"];
  folderPane.isCompact = true;
  await checkModeListItems("unread", [], "compact with selection");

  folderBMessages[0].markRead(false);
  await checkModeListItems("unread", [folderB], "compact with selection");

  // Marking the selected folder read:
  await selectFolder(folderB, "unread");
  folderB.markAllMessagesRead(null);
  await checkModeListItems("unread", [folderB], "compact with selection");

  // Marking an ancestor of the selected folder as read:
  folderAMessages[0].markRead(false);
  folderA.markAllMessagesRead(null);
  await checkModeListItems("unread", [folderB], "compact with selection");

  // Marking a descendant of the selected folder as read:
  folderCMessages[0].markRead(false);
  folderC.markAllMessagesRead(null);
  await checkModeListItems("unread", [folderB], "compact with selection");

  // Clean up.
  // Deselecting the folder should be enough to remove it from the unread list.
  await selectFolder(folderA, null);
  await checkModeListItems("unread", [], "compact with selection");
  folderPane.isCompact = false;
});

/**
 * Tests the Smart Folders mode.
 */
add_task(async function testSmartFolders() {
  folderPane.activeModes = ["smart"];

  // Check the mode is set up correctly.
  const localExtraFolders = [
    rootFolder,
    outboxFolder,
    folderA,
    folderB,
    folderC,
  ];
  const smartServer = getSmartServer();
  const smartInbox = smartServer.rootFolder.getChildNamed("Inbox");
  const smartInboxFolders = [smartInbox, inboxFolder];
  const smartArchives = smartServer.rootFolder.getChildNamed("Archives");
  const otherSmartFolders = [
    smartServer.rootFolder.getChildNamed("Drafts"),
    smartServer.rootFolder.getChildNamed("Templates"),
    smartServer.rootFolder.getChildNamed("Sent"),
    smartArchives,
    smartServer.rootFolder.getChildNamed("Junk"),
    smartServer.rootFolder.getChildNamed("Trash"),
  ];
  await checkModeListItems("smart", [
    ...smartInboxFolders,
    ...otherSmartFolders,
    trashFolder,
    ...localExtraFolders,
  ]);

  // Add some subfolders of existing folders.
  let folderX = rootFolder.createLocalSubfolder("folderTreeQuirksX");
  let folderY = inboxFolder
    .createLocalSubfolder("folderTreeQuirksY")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  let folderYY = folderY.createLocalSubfolder("folderTreeQuirksYY");
  let folderZ = folderB.createLocalSubfolder("folderTreeQuirksZ");

  // Check the folders are listed in the right order.
  await checkModeListItems("smart", [
    ...smartInboxFolders,
    folderY,
    folderYY,
    ...otherSmartFolders,
    trashFolder,
    ...localExtraFolders,
    folderZ,
    folderX,
  ]);

  // Check the hierarchy.
  const rootRow = folderPane.getRowForFolder(rootFolder);
  const inboxRow = folderPane.getRowForFolder(inboxFolder);
  const trashRow = folderPane.getRowForFolder(trashFolder);
  const rowB = folderPane.getRowForFolder(folderB);
  let rowX = folderPane.getRowForFolder(folderX);
  let rowY = folderPane.getRowForFolder(folderY);
  let rowYY = folderPane.getRowForFolder(folderYY);
  let rowZ = folderPane.getRowForFolder(folderZ);
  Assert.equal(
    inboxRow.nameLabel.textContent,
    "Local Folders",
    "inbox row should be named after the server"
  );
  Assert.equal(
    trashRow.nameLabel.textContent,
    "Local Folders",
    "trash row should be named after the server"
  );
  Assert.equal(
    rowX.parentNode.parentNode,
    rootRow,
    "folderX should be displayed as a child of rootFolder"
  );
  Assert.equal(
    rowX.nameLabel.textContent,
    "folderTreeQuirksX",
    "folderTreeQuirksX row should be named after the folder"
  );
  Assert.equal(
    rowY.parentNode.parentNode,
    inboxRow,
    "folderY should be displayed as a child of inboxFolder"
  );
  Assert.equal(
    rowY.nameLabel.textContent,
    "folderTreeQuirksY",
    "folderTreeQuirksY row should be named after the folder"
  );
  Assert.equal(
    rowYY.parentNode.parentNode,
    rowY,
    "folderYY should be displayed as a child of folderY"
  );
  Assert.equal(
    rowYY.nameLabel.textContent,
    "folderTreeQuirksYY",
    "folderTreeQuirksYY row should be named after the folder"
  );
  Assert.equal(
    rowZ.parentNode.parentNode,
    rowB,
    "folderZ should be displayed as a child of folderB"
  );
  Assert.equal(
    rowZ.nameLabel.textContent,
    "folderTreeQuirksZ",
    "folderTreeQuirksZ row should be named after the folder"
  );

  // Check that a folder given a special flag is moved into the smart folder.
  folderX.setFlag(Ci.nsMsgFolderFlags.Archive);
  await checkModeListItems("smart", [
    ...smartInboxFolders,
    folderY,
    folderYY,
    smartServer.rootFolder.getChildNamed("Drafts"),
    smartServer.rootFolder.getChildNamed("Templates"),
    smartServer.rootFolder.getChildNamed("Sent"),
    smartArchives,
    folderX,
    smartServer.rootFolder.getChildNamed("Junk"),
    smartServer.rootFolder.getChildNamed("Trash"),
    trashFolder,
    ...localExtraFolders,
    folderZ,
  ]);
  rowX = folderPane.getRowForFolder(folderX);
  Assert.equal(
    rowX.nameLabel.textContent,
    "folderTreeQuirksX - Local Folders",
    "special folder with non-localised name should be named after the folder AND the server"
  );

  // Check that a folder losing its special flag is removed from the smart folder.
  folderX.clearFlag(Ci.nsMsgFolderFlags.Archive);
  await checkModeListItems("smart", [
    ...smartInboxFolders,
    folderY,
    folderYY,
    ...otherSmartFolders,
    trashFolder,
    ...localExtraFolders,
    folderZ,
    folderX,
  ]);
  rowX = folderPane.getRowForFolder(folderX);
  Assert.equal(
    rowX.nameLabel.textContent,
    "folderTreeQuirksX",
    "folderTreeQuirksX row should be named after the folder"
  );

  // Stop searching folderY and folderYY in the smart inbox. They should stop
  // being listed under the inbox and instead appear under the root folder.
  const wrappedInbox = VirtualFolderHelper.wrapVirtualFolder(smartInbox);
  Assert.deepEqual(wrappedInbox.searchFolders, [
    inboxFolder,
    folderY,
    folderYY,
  ]);
  wrappedInbox.searchFolders = [inboxFolder];

  // Check the folders are listed in the right order.
  await checkModeListItems("smart", [
    ...smartInboxFolders,
    ...otherSmartFolders,
    trashFolder,
    ...localExtraFolders,
    folderZ,
    folderX,
    folderY,
    folderYY,
  ]);

  // Check the hierarchy.
  rowY = folderPane.getRowForFolder(folderY);
  rowYY = folderPane.getRowForFolder(folderYY);
  Assert.equal(
    rowY.parentNode.parentNode,
    rootRow,
    "folderY should be displayed as a child of the rootFolder"
  );
  Assert.equal(
    rowYY.parentNode.parentNode,
    rowY,
    "folderYY should be displayed as a child of folderY"
  );

  // Search them again. They should move back to the smart inbox section.
  wrappedInbox.searchFolders = [inboxFolder, folderY, folderYY];

  // Check the folders are listed in the right order.
  await checkModeListItems("smart", [
    ...smartInboxFolders,
    folderY,
    folderYY,
    ...otherSmartFolders,
    trashFolder,
    ...localExtraFolders,
    folderZ,
    folderX,
  ]);

  // Check the hierarchy.
  rowY = folderPane.getRowForFolder(folderY);
  rowYY = folderPane.getRowForFolder(folderYY);
  Assert.equal(
    rowY.parentNode.parentNode,
    inboxRow,
    "folderY should be displayed as a child of inboxFolder"
  );
  Assert.equal(
    rowYY.parentNode.parentNode,
    rowY,
    "folderYY should be displayed as a child of folderY"
  );

  // Delete the added folders.
  folderX.deleteSelf(null);
  folderY.deleteSelf(null);
  folderZ.deleteSelf(null);
  folderX = trashFolder.getChildNamed("folderTreeQuirksX");
  folderY = trashFolder.getChildNamed("folderTreeQuirksY");
  folderYY = folderY.getChildNamed("folderTreeQuirksYY");
  folderZ = trashFolder.getChildNamed("folderTreeQuirksZ");

  // Check they appear in the trash.
  await checkModeListItems("smart", [
    ...smartInboxFolders,
    ...otherSmartFolders,
    trashFolder,
    folderX,
    folderY,
    folderYY,
    folderZ,
    ...localExtraFolders,
  ]);

  // Check the hierarchy.
  rowX = folderPane.getRowForFolder(folderX);
  rowY = folderPane.getRowForFolder(folderY);
  rowYY = folderPane.getRowForFolder(folderYY);
  rowZ = folderPane.getRowForFolder(folderZ);
  Assert.equal(
    rowX.parentNode.parentNode,
    trashRow,
    "folderX should be displayed as a child of trashFolder"
  );
  Assert.equal(
    rowY.parentNode.parentNode,
    trashRow,
    "folderY should be displayed as a child of trashFolder"
  );
  Assert.equal(
    rowYY.parentNode.parentNode,
    rowY,
    "folderYY should be displayed as a child of folderY"
  );
  Assert.equal(
    rowZ.parentNode.parentNode,
    trashRow,
    "folderZ should be displayed as a child of trashFolder"
  );

  // Empty the trash and check everything is back to normal.
  rootFolder.emptyTrash(null, null);
  await checkModeListItems("smart", [
    ...smartInboxFolders,
    ...otherSmartFolders,
    trashFolder,
    ...localExtraFolders,
  ]);

  // Check that marking a unified folder as favorite works and is persistent.
  const smartMailboxes = { URI: "mailbox://nobody@smart%20mailboxes" };
  folderPane.activeModes = ["smart", "favorite"];
  await checkModeListItems("favorite", []);

  smartInbox.setFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", [smartMailboxes, smartInbox]);

  folderPane.activeModes = ["smart"];
  folderPane.activeModes = ["favorite"];
  await checkModeListItems("favorite", [smartMailboxes, smartInbox]);

  smartInbox.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", []);

  folderPane.activeModes = ["smart"];
  folderPane.activeModes = ["smart", "favorite"];
  await checkModeListItems("favorite", []);
});

/**
 * Tests that after moving a folder it is in the right place in the tree,
 * with any subfolders if they should be shown.
 */
add_task(async function testFolderMove() {
  const newParentFolder = rootFolder.createLocalSubfolder("new parent");
  [...folderC.messages][6].markRead(false);
  folderC.setFlag(Ci.nsMsgFolderFlags.Favorite);

  // Set up and check initial state.

  folderPane.activeModes = ["all", "unread", "favorite"];
  folderPane.isCompact = false;

  await checkModeListItems("all", [
    rootFolder,
    inboxFolder,
    trashFolder,
    outboxFolder,
    folderA,
    folderB,
    folderC,
    newParentFolder,
  ]);
  await checkModeListItems("unread", [rootFolder, folderA, folderB, folderC]);
  await checkModeListItems("favorite", [rootFolder, folderA, folderB, folderC]);

  // Move `folderB` from `folderA` to `newParentFolder`.

  let copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFolder(
    folderB,
    newParentFolder,
    true,
    copyListener,
    window.msgWindow
  );
  await copyListener.promise;

  const movedFolderB = newParentFolder.getChildNamed("folderTreeQuirksB");
  const movedFolderC = movedFolderB.getChildNamed("folderTreeQuirksC");

  await checkModeListItems("all", [
    rootFolder,
    inboxFolder,
    trashFolder,
    outboxFolder,
    folderA,
    newParentFolder,
    movedFolderB,
    movedFolderC,
  ]);
  await checkModeListItems("unread", [
    rootFolder,
    newParentFolder,
    movedFolderB,
    movedFolderC,
  ]);
  await checkModeListItems("favorite", [
    rootFolder,
    newParentFolder,
    movedFolderB,
    movedFolderC,
  ]);

  // Switch to compact mode for the return move.

  folderPane.isCompact = true;
  await checkModeListItems("unread", [movedFolderC]);
  await checkModeListItems("favorite", [movedFolderC]);

  // Move `movedFolderB` from `newParentFolder` back to `folderA`.

  copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFolder(
    movedFolderB,
    folderA,
    true,
    copyListener,
    window.msgWindow
  );
  await copyListener.promise;

  await checkModeListItems("all", [
    rootFolder,
    inboxFolder,
    trashFolder,
    outboxFolder,
    folderA,
    folderB,
    folderC,
    newParentFolder,
  ]);
  await checkModeListItems("unread", [folderC]);
  await checkModeListItems("favorite", [folderC]);

  // Clean up.

  newParentFolder.deleteSelf(null);
  rootFolder.emptyTrash(null, null);
  folderC.markAllMessagesRead(null);
  folderC.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  folderPane.isCompact = false;
});

/**
 * Tests that moving a subfolder that doesn't match the active mode doesn't
 * affect its parent folder that does match the mode.
 */
add_task(async function testFolderMoveSubfolder() {
  const newParentFolder = rootFolder.createLocalSubfolder("new parent");
  [...folderB.messages][6].markRead(false);
  folderB.setFlag(Ci.nsMsgFolderFlags.Favorite);

  // Set up and check initial state.

  folderPane.activeModes = ["all", "unread", "favorite"];
  folderPane.isCompact = false;

  await checkModeListItems("all", [
    rootFolder,
    inboxFolder,
    trashFolder,
    outboxFolder,
    folderA,
    folderB,
    folderC,
    newParentFolder,
  ]);
  await checkModeListItems("unread", [rootFolder, folderA, folderB]);
  await checkModeListItems("favorite", [rootFolder, folderA, folderB]);

  // Move `folderC` from `folderB` to `newParentFolder`.

  let copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFolder(
    folderC,
    newParentFolder,
    true,
    copyListener,
    window.msgWindow
  );
  await copyListener.promise;

  const movedFolderC = newParentFolder.getChildNamed("folderTreeQuirksC");

  await checkModeListItems("all", [
    rootFolder,
    inboxFolder,
    trashFolder,
    outboxFolder,
    folderA,
    folderB,
    newParentFolder,
    movedFolderC,
  ]);
  await checkModeListItems("unread", [rootFolder, folderA, folderB]);
  await checkModeListItems("favorite", [rootFolder, folderA, folderB]);

  // Switch to compact mode for the return move.

  folderPane.isCompact = true;
  await checkModeListItems("unread", [folderB]);
  await checkModeListItems("favorite", [folderB]);

  // Move `movedFolderB` from `newParentFolder` back to `folderA`.

  copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFolder(
    movedFolderC,
    folderB,
    true,
    copyListener,
    window.msgWindow
  );
  await copyListener.promise;

  await checkModeListItems("all", [
    rootFolder,
    inboxFolder,
    trashFolder,
    outboxFolder,
    folderA,
    folderB,
    folderC,
    newParentFolder,
  ]);
  await checkModeListItems("unread", [folderB]);
  await checkModeListItems("favorite", [folderB]);

  // Clean up.

  newParentFolder.deleteSelf(null);
  rootFolder.emptyTrash(null, null);
  folderB.markAllMessagesRead(null);
  folderB.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  folderPane.isCompact = false;
});

/**
 * Tests that after renaming a folder it is in the right place in the tree,
 * with any subfolders if they should be shown.
 */
add_task(async function testFolderRename() {
  const extraFolders = {};
  for (const name of ["aaa", "ggg", "zzz"]) {
    extraFolders[name] = rootFolder
      .createLocalSubfolder(name)
      .QueryInterface(Ci.nsIMsgLocalMailFolder);
    extraFolders[name].addMessage(generator.makeMessage({}).toMessageString());
    extraFolders[name].setFlag(Ci.nsMsgFolderFlags.Favorite);
  }
  [...folderC.messages][4].markRead(false);
  folderC.setFlag(Ci.nsMsgFolderFlags.Favorite);

  // Set up and check initial state.

  folderPane.activeModes = ["all", "unread", "favorite"];
  folderPane.isCompact = false;

  await checkModeListItems("all", [
    rootFolder,
    inboxFolder,
    trashFolder,
    outboxFolder,
    extraFolders.aaa,
    folderA,
    folderB,
    folderC,
    extraFolders.ggg,
    extraFolders.zzz,
  ]);
  await checkModeListItems("unread", [
    rootFolder,
    extraFolders.aaa,
    folderA,
    folderB,
    folderC,
    extraFolders.ggg,
    extraFolders.zzz,
  ]);
  await checkModeListItems("favorite", [
    rootFolder,
    extraFolders.aaa,
    folderA,
    folderB,
    folderC,
    extraFolders.ggg,
    extraFolders.zzz,
  ]);

  // Rename `folderA`.

  folderA.rename("renamedA", window.msgWindow);
  const renamedFolderA = rootFolder.getChildNamed("renamedA");
  const renamedFolderB = renamedFolderA.getChildNamed("folderTreeQuirksB");
  const renamedFolderC = renamedFolderB.getChildNamed("folderTreeQuirksC");

  await checkModeListItems("all", [
    rootFolder,
    inboxFolder,
    trashFolder,
    outboxFolder,
    extraFolders.aaa,
    extraFolders.ggg,
    renamedFolderA,
    renamedFolderB,
    renamedFolderC,
    extraFolders.zzz,
  ]);
  await checkModeListItems("unread", [
    rootFolder,
    extraFolders.aaa,
    extraFolders.ggg,
    renamedFolderA,
    renamedFolderB,
    renamedFolderC,
    extraFolders.zzz,
  ]);
  await checkModeListItems("favorite", [
    rootFolder,
    extraFolders.aaa,
    extraFolders.ggg,
    renamedFolderA,
    renamedFolderB,
    renamedFolderC,
    extraFolders.zzz,
  ]);

  // Switch to compact mode.

  folderPane.isCompact = true;
  await checkModeListItems("unread", [
    extraFolders.aaa,
    renamedFolderC,
    extraFolders.ggg,
    extraFolders.zzz,
  ]);
  await checkModeListItems("favorite", [
    extraFolders.aaa,
    renamedFolderC,
    extraFolders.ggg,
    extraFolders.zzz,
  ]);

  // Rename the folder back to its original name.

  renamedFolderA.rename("folderTreeQuirksA", window.msgWindow);

  await checkModeListItems("all", [
    rootFolder,
    inboxFolder,
    trashFolder,
    outboxFolder,
    extraFolders.aaa,
    folderA,
    folderB,
    folderC,
    extraFolders.ggg,
    extraFolders.zzz,
  ]);
  await checkModeListItems("unread", [
    extraFolders.aaa,
    folderC,
    extraFolders.ggg,
    extraFolders.zzz,
  ]);
  await checkModeListItems("favorite", [
    extraFolders.aaa,
    folderC,
    extraFolders.ggg,
    extraFolders.zzz,
  ]);

  // Clean up.

  extraFolders.aaa.deleteSelf(null);
  extraFolders.ggg.deleteSelf(null);
  extraFolders.zzz.deleteSelf(null);
  rootFolder.emptyTrash(null, null);
  folderC.markAllMessagesRead(null);
  folderC.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  folderPane.isCompact = false;
});

/**
 * The creation of a virtual folder involves two "folderAdded" notifications.
 * Check that only one entry in the folder tree is created.
 */
add_task(async function testSearchFolderAddedOnlyOnce() {
  const context = about3Pane.document.getElementById("folderPaneContext");
  const searchMessagesItem = about3Pane.document.getElementById(
    "folderPaneContext-searchMessages"
  );
  const removeItem = about3Pane.document.getElementById(
    "folderPaneContext-remove"
  );

  // Start searching for messages.

  let shownPromise = BrowserTestUtils.waitForEvent(context, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    folderPane.getRowForFolder(rootFolder).querySelector(".name"),
    { type: "contextmenu" },
    about3Pane
  );
  await shownPromise;

  const searchWindowPromise = BrowserTestUtils.domWindowOpenedAndLoaded(
    null,
    w =>
      w.document.documentURI == "chrome://messenger/content/SearchDialog.xhtml"
  );
  context.activateItem(searchMessagesItem);
  const searchWindow = await searchWindowPromise;

  EventUtils.synthesizeMouseAtCenter(
    searchWindow.document.getElementById("searchVal0"),
    {},
    searchWindow
  );
  EventUtils.sendString("hovercraft", searchWindow);

  // Create a virtual folder for the search.

  const vfWindowPromise = BrowserTestUtils.promiseAlertDialogOpen(
    null,
    "chrome://messenger/content/virtualFolderProperties.xhtml",
    {
      async callback(vfWindow) {
        EventUtils.synthesizeMouseAtCenter(
          vfWindow.document.getElementById("name"),
          {},
          vfWindow
        );
        EventUtils.sendString("virtual folder", vfWindow);
        EventUtils.synthesizeMouseAtCenter(
          vfWindow.document.querySelector("dialog").getButton("accept"),
          {},
          vfWindow
        );
      },
    }
  );
  EventUtils.synthesizeMouseAtCenter(
    searchWindow.document.getElementById("saveAsVFButton"),
    {},
    searchWindow
  );
  await vfWindowPromise;

  await BrowserTestUtils.closeWindow(searchWindow);

  // Find the folder and the row for it in the tree.

  const virtualFolder = rootFolder.getChildNamed("virtual folder");
  const row = await TestUtils.waitForCondition(() =>
    folderPane.getRowForFolder(virtualFolder)
  );

  // Check it exists only once.

  await checkModeListItems("all", [
    rootFolder,
    inboxFolder,
    trashFolder,
    virtualFolder,
    outboxFolder,
    folderA,
    folderB,
    folderC,
  ]);

  // Delete the virtual folder.

  shownPromise = BrowserTestUtils.waitForEvent(context, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    row.querySelector(".name"),
    { type: "contextmenu" },
    about3Pane
  );
  await shownPromise;

  const dialogPromise = BrowserTestUtils.promiseAlertDialogOpen("accept");
  context.activateItem(removeItem);
  await dialogPromise;
  await new Promise(resolve => setTimeout(resolve));

  // Check it went away.

  await checkModeListItems("all", [
    rootFolder,
    inboxFolder,
    trashFolder,
    outboxFolder,
    folderA,
    folderB,
    folderC,
  ]);
});

/**
 * Tests deferred POP3 accounts are not displayed in All Folders mode, and
 * that a change in their deferred status updates the folder tree.
 */
add_task(async function testDeferredAccount() {
  const pop3Account = MailServices.accounts.createAccount();
  const pop3Server = MailServices.accounts.createIncomingServer(
    `${pop3Account.key}user`,
    "localhost",
    "pop3"
  );
  pop3Server.QueryInterface(Ci.nsIPop3IncomingServer);
  pop3Account.incomingServer = pop3Server.QueryInterface(
    Ci.nsIPop3IncomingServer
  );

  const pop3RootFolder = pop3Server.rootFolder;
  const pop3Folders = [
    pop3RootFolder,
    pop3RootFolder.getChildNamed("Inbox"),
    pop3RootFolder.getChildNamed("Trash"),
  ];
  const localFolders = [
    rootFolder,
    inboxFolder,
    trashFolder,
    outboxFolder,
    folderA,
    folderB,
    folderC,
  ];

  folderPane.activeModes = ["all"];
  await checkModeListItems("all", [...pop3Folders, ...localFolders]);

  // Defer the account to Local Folders.
  pop3Server.deferredToAccount = account.key;
  await checkModeListItems("all", localFolders);

  // Remove and add the All mode again to check that an existing deferred
  // folder is not shown when the mode initialises.
  folderPane.activeModes = ["recent"];
  folderPane.activeModes = ["all"];
  await checkModeListItems("all", localFolders);

  // Stop deferring the account.
  pop3Server.deferredToAccount = null;
  await checkModeListItems("all", [...pop3Folders, ...localFolders]);

  MailServices.accounts.removeAccount(pop3Account, false);
});

/**
 * We deliberately hide the special [Gmail] folder from the folder tree.
 * Check that it doesn't appear when for a new or existing account.
 */
add_task(async function testGmailFolders() {
  const imapServer = new GmailServer(this);
  // Set up a fake Gmail account.
  const gmailAccount = MailServices.accounts.createAccount();
  const gmailServer = MailServices.accounts.createIncomingServer(
    "user",
    "localhost",
    "imap"
  );
  gmailServer.port = imapServer.port;
  gmailServer.password = "password";
  gmailAccount.incomingServer = gmailServer;

  const gmailIdentity = MailServices.accounts.createIdentity();
  gmailIdentity.email = "imap@invalid";
  gmailAccount.addIdentity(gmailIdentity);
  gmailAccount.defaultIdentity = gmailIdentity;

  const gmailRootFolder = gmailServer.rootFolder;
  gmailServer.performExpand(window.msgWindow);
  await TestUtils.waitForCondition(
    () => gmailRootFolder.subFolders.length == 2,
    "waiting for folders to be created"
  );

  const gmailInboxFolder = gmailRootFolder.getChildNamed("INBOX");
  const gmailGmailFolder = gmailRootFolder.getChildNamed("[Gmail]");
  await TestUtils.waitForCondition(
    () => gmailGmailFolder.subFolders.length == 5,
    "waiting for All Mail folder to be created"
  );
  const gmailDraftsFolder = gmailGmailFolder.getChildNamed("Drafts");
  const gmailSentFolder = gmailGmailFolder.getChildNamed("Sent Mail");
  const gmailTrashFolder = gmailGmailFolder.getChildNamed("Trash");
  const gmailSpamFolder = gmailGmailFolder.getChildNamed("Spam");
  const gmailAllMailFolder = gmailGmailFolder.getChildNamed("All Mail");

  Assert.ok(
    !folderPane._isGmailFolder(gmailRootFolder),
    "_isGmailFolder should be false for the root folder"
  );
  Assert.ok(
    folderPane._isGmailFolder(gmailGmailFolder),
    "_isGmailFolder should be true for the [Gmail] folder"
  );
  Assert.ok(
    !folderPane._isGmailFolder(gmailAllMailFolder),
    "_isGmailFolder should be false for the All Mail folder"
  );

  Assert.equal(
    folderPane._getNonGmailFolder(gmailRootFolder),
    gmailRootFolder,
    "_getNonGmailFolder should return the same folder for the root folder"
  );
  Assert.equal(
    folderPane._getNonGmailFolder(gmailGmailFolder),
    gmailRootFolder,
    "_getNonGmailFolder should return the root folder for the [Gmail] folder"
  );
  Assert.equal(
    folderPane._getNonGmailFolder(gmailAllMailFolder),
    gmailAllMailFolder,
    "_getNonGmailFolder should return the same folder for the All Mail folder"
  );

  Assert.equal(
    folderPane._getNonGmailParent(gmailRootFolder),
    null,
    "_getNonGmailParent should return null for the root folder"
  );
  Assert.equal(
    folderPane._getNonGmailParent(gmailGmailFolder),
    gmailRootFolder,
    "_getNonGmailParent should return the root folder for the [Gmail] folder"
  );
  Assert.equal(
    folderPane._getNonGmailParent(gmailAllMailFolder),
    gmailRootFolder,
    "_getNonGmailParent should return the root folder for the All Mail folder"
  );

  await checkModeListItems("all", [
    gmailRootFolder,
    gmailInboxFolder,
    gmailDraftsFolder,
    gmailSentFolder,
    gmailAllMailFolder,
    gmailSpamFolder,
    gmailTrashFolder,
    rootFolder,
    inboxFolder,
    trashFolder,
    outboxFolder,
    folderA,
    folderB,
    folderC,
  ]);

  // The accounts didn't exist when about:3pane loaded, but we can simulate
  // that by removing the mode and then re-adding it.
  folderPane.activeModes = ["favorite"];
  folderPane.activeModes = ["all"];

  await checkModeListItems("all", [
    gmailRootFolder,
    gmailInboxFolder,
    gmailDraftsFolder,
    gmailSentFolder,
    gmailAllMailFolder,
    gmailSpamFolder,
    gmailTrashFolder,
    rootFolder,
    inboxFolder,
    trashFolder,
    outboxFolder,
    folderA,
    folderB,
    folderC,
  ]);

  await promiseServerIdle(gmailAccount.incomingServer);
  MailServices.accounts.removeAccount(gmailAccount, false);
});

add_task(async function testAccountOrder() {
  // Make some changes to the main account so that it appears in all modes.

  [...folderA.messages][0].markRead(false);
  folderA.setFlag(Ci.nsMsgFolderFlags.Favorite);
  folderPane.activeModes = ["all", "smart", "unread", "favorite"];

  const localFolders = [
    rootFolder,
    inboxFolder,
    trashFolder,
    outboxFolder,
    folderA,
    folderB,
    folderC,
  ];
  const localExtraFolders = [
    rootFolder,
    outboxFolder,
    folderA,
    folderB,
    folderC,
  ];
  const smartServer = getSmartServer();
  const smartFolders = [
    smartServer.rootFolder.getChildNamed("Inbox"),
    inboxFolder,
    smartServer.rootFolder.getChildNamed("Drafts"),
    smartServer.rootFolder.getChildNamed("Templates"),
    smartServer.rootFolder.getChildNamed("Sent"),
    smartServer.rootFolder.getChildNamed("Archives"),
    smartServer.rootFolder.getChildNamed("Junk"),
    smartServer.rootFolder.getChildNamed("Trash"),
    // There are trash folders in each account, they go here.
  ];

  // Check the initial items in the folder tree.

  await checkModeListItems("all", localFolders);
  await checkModeListItems("smart", [
    ...smartFolders,
    trashFolder,
    ...localExtraFolders,
  ]);
  await checkModeListItems("unread", [rootFolder, folderA]);
  await checkModeListItems("favorite", [rootFolder, folderA]);

  // Create two new "none" accounts, foo and bar.

  const foo = MailServices.accounts.createAccount();
  foo.incomingServer = MailServices.accounts.createIncomingServer(
    `${foo.key}user`,
    "localhost",
    "none"
  );
  const fooRootFolder = foo.incomingServer.rootFolder;
  const fooTrashFolder = fooRootFolder.getChildNamed("Trash");
  const fooOutboxFolder = fooRootFolder.getChildNamed("Unsent Messages");
  const fooFolders = [fooRootFolder, fooTrashFolder, fooOutboxFolder];
  const fooExtraFolders = [fooRootFolder, fooOutboxFolder];

  const bar = MailServices.accounts.createAccount();
  bar.incomingServer = MailServices.accounts.createIncomingServer(
    `${bar.key}user`,
    "localhost",
    "none"
  );
  const barRootFolder = bar.incomingServer.rootFolder;
  const barTrashFolder = barRootFolder.getChildNamed("Trash");
  const barOutboxFolder = barRootFolder.getChildNamed("Unsent Messages");
  const barFolders = [barRootFolder, barTrashFolder, barOutboxFolder];
  const barExtraFolders = [barRootFolder, barOutboxFolder];

  fooTrashFolder
    .QueryInterface(Ci.nsIMsgLocalMailFolder)
    .addMessage(generator.makeMessage({}).toMessageString());
  fooTrashFolder.setFlag(Ci.nsMsgFolderFlags.Favorite);
  barTrashFolder
    .QueryInterface(Ci.nsIMsgLocalMailFolder)
    .addMessage(generator.makeMessage({}).toMessageString());
  barTrashFolder.setFlag(Ci.nsMsgFolderFlags.Favorite);

  // Check the addition of accounts has put them in the right order.

  Assert.deepEqual(
    MailServices.accounts.accounts.map(a => a.key),
    [foo.key, bar.key, account.key]
  );
  await checkModeListItems("all", [
    ...fooFolders,
    ...barFolders,
    ...localFolders,
  ]);
  await checkModeListItems("smart", [
    ...smartFolders,
    fooTrashFolder,
    barTrashFolder,
    trashFolder,
    ...fooExtraFolders,
    ...barExtraFolders,
    ...localExtraFolders,
  ]);
  await checkModeListItems("unread", [
    fooRootFolder,
    fooTrashFolder,
    barRootFolder,
    barTrashFolder,
    rootFolder,
    folderA,
  ]);
  await checkModeListItems("favorite", [
    fooRootFolder,
    fooTrashFolder,
    barRootFolder,
    barTrashFolder,
    rootFolder,
    folderA,
  ]);

  // Remove and add the modes again. This should reinitialise them.

  folderPane.activeModes = ["recent"];
  folderPane.activeModes = ["all", "smart", "unread", "favorite"];
  await checkModeListItems("all", [
    ...fooFolders,
    ...barFolders,
    ...localFolders,
  ]);
  await checkModeListItems("smart", [
    ...smartFolders,
    fooTrashFolder,
    barTrashFolder,
    trashFolder,
    ...fooExtraFolders,
    ...barExtraFolders,
    ...localExtraFolders,
  ]);
  await checkModeListItems("unread", [
    fooRootFolder,
    fooTrashFolder,
    barRootFolder,
    barTrashFolder,
    rootFolder,
    folderA,
  ]);
  await checkModeListItems("favorite", [
    fooRootFolder,
    fooTrashFolder,
    barRootFolder,
    barTrashFolder,
    rootFolder,
    folderA,
  ]);

  // Reorder the accounts.

  MailServices.accounts.reorderAccounts([bar.key, account.key, foo.key]);
  await checkModeListItems("all", [
    ...barFolders,
    ...localFolders,
    ...fooFolders,
  ]);
  await checkModeListItems("smart", [
    ...smartFolders,
    barTrashFolder,
    trashFolder,
    fooTrashFolder,
    ...barExtraFolders,
    ...localExtraFolders,
    ...fooExtraFolders,
  ]);
  await checkModeListItems("unread", [
    barRootFolder,
    barTrashFolder,
    rootFolder,
    folderA,
    fooRootFolder,
    fooTrashFolder,
  ]);
  await checkModeListItems("favorite", [
    barRootFolder,
    barTrashFolder,
    rootFolder,
    folderA,
    fooRootFolder,
    fooTrashFolder,
  ]);

  // Reorder the accounts again.

  MailServices.accounts.reorderAccounts([foo.key, account.key, bar.key]);
  await checkModeListItems("all", [
    ...fooFolders,
    ...localFolders,
    ...barFolders,
  ]);
  await checkModeListItems("smart", [
    ...smartFolders,
    fooTrashFolder,
    trashFolder,
    barTrashFolder,
    ...fooExtraFolders,
    ...localExtraFolders,
    ...barExtraFolders,
  ]);
  await checkModeListItems("unread", [
    fooRootFolder,
    fooTrashFolder,
    rootFolder,
    folderA,
    barRootFolder,
    barTrashFolder,
  ]);
  await checkModeListItems("favorite", [
    fooRootFolder,
    fooTrashFolder,
    rootFolder,
    folderA,
    barRootFolder,
    barTrashFolder,
  ]);

  // Remove one of the added accounts.

  MailServices.accounts.removeAccount(foo, false);
  await checkModeListItems("all", [...localFolders, ...barFolders]);
  await checkModeListItems("smart", [
    ...smartFolders,
    trashFolder,
    barTrashFolder,
    ...localExtraFolders,
    ...barExtraFolders,
  ]);
  await checkModeListItems("unread", [
    rootFolder,
    folderA,
    barRootFolder,
    barTrashFolder,
  ]);
  await checkModeListItems("favorite", [
    rootFolder,
    folderA,
    barRootFolder,
    barTrashFolder,
  ]);

  // Remove the other added account, folder flags, and the added folder.

  MailServices.accounts.removeAccount(bar, false);
  folderA.markAllMessagesRead(null);
  folderA.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  rootFolder.emptyTrash(null);

  await checkModeListItems("all", localFolders);
  await checkModeListItems("smart", [
    ...smartFolders,
    trashFolder,
    ...localExtraFolders,
  ]);
  await checkModeListItems("unread", []);
  await checkModeListItems("favorite", []);

  // Test hiding the Local Folders.

  const localFoldersItem = moreContext.querySelector(
    "#folderPaneHeaderToggleLocalFolders"
  );
  EventUtils.synthesizeMouseAtCenter(moreButton, {}, about3Pane);
  await BrowserTestUtils.waitForPopupEvent(moreContext, "shown");
  Assert.ok(
    !localFoldersItem.hasAttribute("checked"),
    "local folders should be visible"
  );
  moreContext.activateItem(localFoldersItem);
  // This doesn't happen instantly on Mac.
  await TestUtils.waitForCondition(
    () => localFoldersItem.hasAttribute("checked"),
    "waiting for local folders to become hidden"
  );
  moreContext.hidePopup();
  await BrowserTestUtils.waitForPopupEvent(moreContext, "hidden");

  // All instances of local folders shouldn't be present.
  await checkModeListItems("all", []);
  await checkModeListItems("smart", [...smartFolders, trashFolder]);
  await checkModeListItems("unread", []);
  await checkModeListItems("favorite", []);

  EventUtils.synthesizeMouseAtCenter(moreButton, {}, about3Pane);
  await BrowserTestUtils.waitForPopupEvent(moreContext, "shown");
  Assert.equal(
    localFoldersItem.hasAttribute("checked"),
    true,
    "local folders should be hidden"
  );
  moreContext.activateItem(localFoldersItem);
  // This doesn't happen instantly on Mac.
  await TestUtils.waitForCondition(
    () => !localFoldersItem.hasAttribute("checked"),
    "waiting for local folders to become visible"
  );
  moreContext.hidePopup();
  await BrowserTestUtils.waitForPopupEvent(moreContext, "hidden");
});

add_task(async function testMultiSelectionDelete() {
  folderMultiA = rootFolder
    .createLocalSubfolder("folderMultiA")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  folderMultiB = rootFolder
    .createLocalSubfolder("folderMultiB")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  folderMultiC = rootFolder
    .createLocalSubfolder("folderMultiC")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  folderMultiD = rootFolder
    .createLocalSubfolder("folderMultiD")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);

  function leftClickOn(folder, modifiers = {}) {
    EventUtils.synthesizeMouseAtCenter(
      about3Pane.folderPane.getRowForFolder(folder).querySelector(".name"),
      modifiers,
      about3Pane
    );
  }

  leftClickOn(folderA);
  leftClickOn(folderMultiA, { accelKey: true });
  leftClickOn(folderMultiB, { accelKey: true });
  leftClickOn(folderMultiC, { accelKey: true });

  // Test deleting a single folder outside the current range selection.
  const context = about3Pane.document.getElementById("folderPaneContext");
  const removeItem = about3Pane.document.getElementById(
    "folderPaneContext-remove"
  );
  const shownPromise = BrowserTestUtils.waitForEvent(context, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    folderPane.getRowForFolder(folderMultiD).querySelector(".name"),
    { type: "contextmenu" },
    about3Pane
  );
  await shownPromise;

  const dialogPromise = BrowserTestUtils.promiseAlertDialogOpen("accept");
  context.activateItem(removeItem);
  await dialogPromise;
  await new Promise(resolve => setTimeout(resolve));

  rootFolder.emptyTrash(null, null);

  // Check only the right clicked folder went away.
  await checkModeListItems("all", [
    rootFolder,
    inboxFolder,
    trashFolder,
    outboxFolder,
    folderMultiA,
    folderMultiB,
    folderMultiC,
    folderA,
    folderB,
    folderC,
  ]);

  // Remove folderA from the selection range.
  leftClickOn(folderA, { accelKey: true });

  // FIXME! Temporarily handle deleting multiple folders by waiting for each
  // confirm dialog to accept. We should update the front-end in order to handle
  // a single confirmation dialog for a batch delete.
  const multipleDialogPromise = BrowserTestUtils.promiseAlertDialog("accept")
    .then(() => BrowserTestUtils.promiseAlertDialog("accept"))
    .then(() => BrowserTestUtils.promiseAlertDialog("accept"));
  EventUtils.synthesizeKey("KEY_Delete", {}, about3Pane);
  await multipleDialogPromise;
  await new Promise(resolve => setTimeout(resolve));

  rootFolder.emptyTrash(null, null);
  // Check the multiselection went away.
  await checkModeListItems("all", [
    rootFolder,
    inboxFolder,
    trashFolder,
    outboxFolder,
    folderA,
    folderB,
    folderC,
  ]);
});

/**
 * @param {string} modeName
 * @param {nsIMsgFolder[]} folders
 * @param {string|null} context
 */
async function checkModeListItems(modeName, folders, context = null) {
  // Let things settle so that any code listening for changes
  // can run first.
  await new Promise(resolve => window.requestIdleCallback(resolve));
  for (const folderTreeRow of folderPane._modes[
    modeName
  ].containerList.querySelectorAll("li")) {
    folderTree.expandRow(folderTreeRow);
    await new Promise(resolve => requestAnimationFrame(resolve));
  }

  const contextMsg = context == null ? "" : ` (${context})`;
  Assert.deepEqual(
    Array.from(
      folderPane._modes[modeName].containerList.querySelectorAll("li"),
      folderTreeRow => folderTreeRow.uri
    ),
    folders.map(folder => folder.URI),
    `should show correct items in ${modeName} mode${contextMsg}`
  );
}

/**
 * Selects the row for the given folder in the given pane mode.
 * By default, the header in the "All Folders" view is selected.
 *
 * @param {nsIMsgFolder} folder
 * @param {string|null} mode
 */
async function selectFolder(folder, mode = null) {
  const row = about3Pane.folderPane.getRowForFolder(folder, mode);
  Assert.notEqual(row, null);
  EventUtils.synthesizeMouseAtCenter(
    row.querySelector(".name"),
    {},
    about3Pane
  );
  await TestUtils.waitForCondition(() => folderTree.selectedRow == row);
}
