/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { GmailServer } = ChromeUtils.importESModule(
  "resource://testing-common/IMAPServer.sys.mjs"
);
const { MessageGenerator, SyntheticMessageSet } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
const { MessageInjection } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageInjection.jsm"
);
const { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);
const { VirtualFolderHelper } = ChromeUtils.import(
  "resource:///modules/VirtualFolderWrapper.jsm"
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
  moreButton,
  moreContext;
const generator = new MessageGenerator();
const messageInjection = new MessageInjection(
  {
    mode: "local",
  },
  generator
);

add_setup(async function () {
  account = MailServices.accounts.accounts[0];
  rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  inboxFolder = rootFolder
    .getChildNamed("Inbox")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  trashFolder = rootFolder.getChildNamed("Trash");
  outboxFolder = rootFolder.getChildNamed("Outbox");
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

  messageInjection.addSetsToFolders(
    [folderA, folderB, folderC],
    [
      new SyntheticMessageSet(generator.makeMessages({ read: true })),
      new SyntheticMessageSet(generator.makeMessages({ read: true })),
      new SyntheticMessageSet(generator.makeMessages({ read: true })),
    ]
  );

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
  await checkModeListItems("favorite", []);

  folderA.setFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", [folderA]);

  folderA.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", []);

  folderB.setFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", [folderB]);

  folderB.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", []);

  folderC.setFlag(Ci.nsMsgFolderFlags.Favorite);
  folderA.setFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", [folderA, folderC]); // c, a

  folderA.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", [folderC]);

  folderC.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", []);

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
  await checkModeListItems("favorite", [fooTrashFolder]);

  folderC.setFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", [fooTrashFolder, folderC]);

  MailServices.accounts.reorderAccounts([account.key, foo.key]);
  await checkModeListItems("favorite", [folderC, fooTrashFolder]);

  fooTrashFolder.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", [folderC]);

  fooTrashFolder.setFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", [folderC, fooTrashFolder]);

  folderC.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", [fooTrashFolder]);

  // Clean up.

  MailServices.accounts.removeAccount(foo, false);
  await checkModeListItems("favorite", []);
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
  await checkModeListItems("unread", [rootFolder, folderA]);

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
  await checkModeListItems("unread", [rootFolder, folderA, folderB, folderC]);

  folderCMessages[0].markRead(false);
  await checkModeListItems("unread", [rootFolder, folderA, folderB, folderC]);

  folderCMessages[1].markRead(false);
  folderCMessages[2].markRead(false);
  await checkModeListItems("unread", [rootFolder, folderA, folderB, folderC]);

  window.MsgMarkAllRead([folderC]);
  await checkModeListItems("unread", [rootFolder, folderA, folderB, folderC]);
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
  await checkModeListItems("unread", []);

  folderAMessages[0].markRead(false);
  await checkModeListItems("unread", [folderA]);

  folderAMessages[1].markRead(false);
  folderAMessages[2].markRead(false);
  await checkModeListItems("unread", [folderA]);

  window.MsgMarkAllRead([folderA]);
  await checkModeListItems("unread", [folderA]);

  folderAMessages[0].markRead(false);
  folderBMessages[0].markRead(false);
  await checkModeListItems("unread", [folderA, folderB]);

  folderCMessages[0].markRead(false);
  await checkModeListItems("unread", [folderA, folderB, folderC]);

  folderBMessages[0].markRead(true);
  await checkModeListItems("unread", [folderA, folderB, folderC]);

  folderAMessages[0].markRead(true);
  await checkModeListItems("unread", [folderA, folderB, folderC]);

  folderCMessages[0].markRead(true);
  await checkModeListItems("unread", [folderA, folderB, folderC]);

  folderCMessages[0].markRead(false);
  await checkModeListItems("unread", [folderA, folderB, folderC]);

  folderCMessages[1].markRead(false);
  folderCMessages[2].markRead(false);
  await checkModeListItems("unread", [folderA, folderB, folderC]);

  window.MsgMarkAllRead([folderC]);
  await checkModeListItems("unread", [folderA, folderB, folderC]);

  // Test with multiple accounts.

  const foo = MailServices.accounts.createAccount();
  foo.incomingServer = MailServices.accounts.createIncomingServer(
    `${foo.key}user`,
    "localhost",
    "none"
  );
  const fooRootFolder = foo.incomingServer.rootFolder;
  const fooTrashFolder = fooRootFolder.getChildNamed("Trash");

  const generator = new MessageGenerator();
  fooTrashFolder
    .QueryInterface(Ci.nsIMsgLocalMailFolder)
    .addMessage(generator.makeMessages({}).map(m => m.toMessageString()));
  const fooMessages = [...fooTrashFolder.messages];

  fooMessages[0].markRead(false);
  await checkModeListItems("unread", [
    fooTrashFolder,
    folderA,
    folderB,
    folderC,
  ]);

  folderCMessages[0].markRead(false);
  await checkModeListItems("unread", [
    fooTrashFolder,
    folderA,
    folderB,
    folderC,
  ]);

  MailServices.accounts.reorderAccounts([account.key, foo.key]);
  await checkModeListItems("unread", [
    folderA,
    folderB,
    folderC,
    fooTrashFolder,
  ]);

  fooMessages[0].markRead(true);
  await checkModeListItems("unread", [
    folderA,
    folderB,
    folderC,
    fooTrashFolder,
  ]);

  fooMessages[0].markRead(false);
  await checkModeListItems("unread", [
    folderA,
    folderB,
    folderC,
    fooTrashFolder,
  ]);

  folderCMessages[0].markRead(true);
  await checkModeListItems("unread", [
    folderA,
    folderB,
    folderC,
    fooTrashFolder,
  ]);

  // Clean up.

  MailServices.accounts.removeAccount(foo, false);
  await checkModeListItems("unread", [folderA, folderB, folderC]);
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
  const smartServer = MailServices.accounts.findServer(
    "nobody",
    "smart mailboxes",
    "none"
  );
  const smartInbox = smartServer.rootFolder.getChildNamed("Inbox");
  const smartInboxFolders = [smartInbox, inboxFolder];
  const otherSmartFolders = [
    smartServer.rootFolder.getChildNamed("Drafts"),
    smartServer.rootFolder.getChildNamed("Templates"),
    smartServer.rootFolder.getChildNamed("Sent"),
    smartServer.rootFolder.getChildNamed("Archives"),
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
    rowX.parentNode.parentNode,
    rootRow,
    "folderX should be displayed as a child of rootFolder"
  );
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
  Assert.equal(
    rowZ.parentNode.parentNode,
    rowB,
    "folderZ should be displayed as a child of folderB"
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
    () => gmailRootFolder.subFolders.length == 3,
    "waiting for folders to be created"
  );

  const gmailInboxFolder = gmailRootFolder.getChildNamed("INBOX");
  const gmailTrashFolder = gmailRootFolder.getChildNamed("Trash");
  const gmailGmailFolder = gmailRootFolder.getChildNamed("[Gmail]");
  await TestUtils.waitForCondition(
    () => gmailGmailFolder.subFolders.length == 1,
    "waiting for All Mail folder to be created"
  );
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
    gmailAllMailFolder,
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
    gmailAllMailFolder,
    gmailTrashFolder,
    rootFolder,
    inboxFolder,
    trashFolder,
    outboxFolder,
    folderA,
    folderB,
    folderC,
  ]);

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
  const smartServer = MailServices.accounts.findServer(
    "nobody",
    "smart mailboxes",
    "none"
  );
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
  const fooOutboxFolder = fooRootFolder.getChildNamed("Outbox");
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
  const barOutboxFolder = barRootFolder.getChildNamed("Outbox");
  const barFolders = [barRootFolder, barTrashFolder, barOutboxFolder];
  const barExtraFolders = [barRootFolder, barOutboxFolder];

  const generator = new MessageGenerator();
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
  await checkModeListItems("unread", [rootFolder, folderA]);
  await checkModeListItems("favorite", []);

  const shownPromise = BrowserTestUtils.waitForEvent(moreContext, "popupshown");
  EventUtils.synthesizeMouseAtCenter(moreButton, {}, about3Pane);
  await shownPromise;

  moreContext.activateItem(
    moreContext.querySelector("#folderPaneHeaderToggleLocalFolders")
  );
  // Force a 500ms timeout due to a weird intermittent macOS issue that prevents
  // the Escape key press from closing the menupopup.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));

  const menuHiddenPromise = BrowserTestUtils.waitForEvent(
    moreContext,
    "popuphidden"
  );
  EventUtils.synthesizeKey("KEY_Escape", {}, about3Pane);
  await menuHiddenPromise;

  // All instances of local folders shouldn't be present.
  await checkModeListItems("all", []);
  await checkModeListItems("smart", [...smartFolders, trashFolder]);
  await checkModeListItems("unread", []);
  await checkModeListItems("favorite", []);
});

async function checkModeListItems(modeName, folders) {
  // Jump to the end of the event queue so that any code listening for changes
  // can run first.
  await new Promise(resolve => setTimeout(resolve));
  expandAll(modeName);

  Assert.deepEqual(
    Array.from(
      folderPane._modes[modeName].containerList.querySelectorAll("li"),
      folderTreeRow => folderTreeRow.uri
    ),
    folders.map(folder => folder.URI)
  );
}

function expandAll(modeName) {
  for (const folderTreeRow of folderPane._modes[
    modeName
  ].containerList.querySelectorAll("li")) {
    folderTree.expandRow(folderTreeRow);
  }
}
