/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageGenerator, SyntheticMessageSet } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
const { MessageInjection } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageInjection.jsm"
);
const { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

let about3Pane = document.getElementById("tabmail").currentAbout3Pane;
let { folderPane, folderTree, threadTree } = about3Pane;
let account,
  rootFolder,
  inboxFolder,
  trashFolder,
  outboxFolder,
  folderA,
  folderB,
  folderC;
let generator = new MessageGenerator();
let messageInjection = new MessageInjection(
  {
    mode: "local",
  },
  generator
);

add_setup(async function() {
  account = MailServices.accounts.accounts[0];
  rootFolder = account.incomingServer.rootFolder;
  inboxFolder = rootFolder.getChildNamed("Inbox");
  trashFolder = rootFolder.getChildNamed("Trash");
  outboxFolder = rootFolder.getChildNamed("Outbox");

  rootFolder.createSubfolder("folder a", null);
  folderA = rootFolder
    .getChildNamed("folder a")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);

  folderA.createSubfolder("folder b", null);
  folderB = folderA
    .getChildNamed("folder b")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);

  folderB.createSubfolder("folder c", null);
  folderC = folderB
    .getChildNamed("folder c")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);

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
  await checkModeListItems("favorite", [rootFolder, folderB]);

  folderB.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", []);

  folderC.setFlag(Ci.nsMsgFolderFlags.Favorite);
  folderA.setFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", [rootFolder, folderA, folderC]);

  folderA.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  await checkModeListItems("favorite", [rootFolder, folderC]);

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

  let foo = MailServices.accounts.createAccount();
  foo.incomingServer = MailServices.accounts.createIncomingServer(
    `${foo.key}user`,
    "localhost",
    "none"
  );
  let fooRootFolder = foo.incomingServer.rootFolder;
  let fooTrashFolder = fooRootFolder.getChildNamed("Trash");

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
  let folderAMessages = [...folderA.messages];
  let folderBMessages = [...folderB.messages];
  let folderCMessages = [...folderC.messages];

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
  let folderAMessages = [...folderA.messages];
  let folderBMessages = [...folderB.messages];
  let folderCMessages = [...folderC.messages];

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

  let foo = MailServices.accounts.createAccount();
  foo.incomingServer = MailServices.accounts.createIncomingServer(
    `${foo.key}user`,
    "localhost",
    "none"
  );
  let fooRootFolder = foo.incomingServer.rootFolder;
  let fooTrashFolder = fooRootFolder.getChildNamed("Trash");

  let generator = new MessageGenerator();
  fooTrashFolder
    .QueryInterface(Ci.nsIMsgLocalMailFolder)
    .addMessage(generator.makeMessages({}).map(m => m.toMboxString()));
  let fooMessages = [...fooTrashFolder.messages];

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
 * Tests that after moving a folder it is in the right place in the tree,
 * with any subfolders if they should be shown.
 */
add_task(async function testFolderMove() {
  rootFolder.createSubfolder("new parent", null);
  let newParentFolder = rootFolder.getChildNamed("new parent");
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
  await checkModeListItems("favorite", [rootFolder, folderC]);

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

  let movedFolderB = newParentFolder.getChildNamed("folder b");
  let movedFolderC = movedFolderB.getChildNamed("folder c");

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
  await checkModeListItems("favorite", [rootFolder, movedFolderC]);

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
  let extraFolders = {};
  for (let name of ["aaa", "ggg", "zzz"]) {
    rootFolder.createSubfolder(name, null);
    extraFolders[name] = rootFolder
      .getChildNamed(name)
      .QueryInterface(Ci.nsIMsgLocalMailFolder);
    extraFolders[name].addMessage(generator.makeMessage({}).toMboxString());
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
    folderC,
    extraFolders.ggg,
    extraFolders.zzz,
  ]);

  // Rename `folderA`.

  folderA.rename("renamed", window.msgWindow);
  let renamedFolderA = rootFolder.getChildNamed("renamed");
  let renamedFolderB = renamedFolderA.getChildNamed("folder b");
  let renamedFolderC = renamedFolderB.getChildNamed("folder c");

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
    renamedFolderC,
    extraFolders.ggg,
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

  renamedFolderA.rename("folder a", window.msgWindow);

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
  let context = about3Pane.document.getElementById("folderPaneContext");
  let searchMessagesItem = about3Pane.document.getElementById(
    "folderPaneContext-searchMessages"
  );
  let removeItem = about3Pane.document.getElementById(
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

  let searchWindowPromise = BrowserTestUtils.domWindowOpenedAndLoaded(
    null,
    w =>
      w.document.documentURI == "chrome://messenger/content/SearchDialog.xhtml"
  );
  context.activateItem(searchMessagesItem);
  let searchWindow = await searchWindowPromise;

  EventUtils.synthesizeMouseAtCenter(
    searchWindow.document.getElementById("searchVal0"),
    {},
    searchWindow
  );
  EventUtils.sendString("hovercraft", searchWindow);

  // Create a virtual folder for the search.

  let vfWindowPromise = BrowserTestUtils.promiseAlertDialogOpen(
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

  let virtualFolder = rootFolder.getChildNamed("virtual folder");
  let row = await TestUtils.waitForCondition(() =>
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

  let dialogPromise = BrowserTestUtils.promiseAlertDialogOpen("accept");
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
  let pop3Account = MailServices.accounts.createAccount();
  let pop3Server = MailServices.accounts.createIncomingServer(
    `${pop3Account.key}user`,
    "localhost",
    "pop3"
  );
  pop3Server.QueryInterface(Ci.nsIPop3IncomingServer);
  pop3Account.incomingServer = pop3Server.QueryInterface(
    Ci.nsIPop3IncomingServer
  );

  let pop3RootFolder = pop3Server.rootFolder;
  let pop3Folders = [
    pop3RootFolder,
    pop3RootFolder.getChildNamed("Inbox"),
    pop3RootFolder.getChildNamed("Trash"),
  ];
  let localFolders = [
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
  IMAPServer.open();
  // Set up a fake Gmail account.
  let gmailAccount = MailServices.accounts.createAccount();
  let gmailServer = MailServices.accounts.createIncomingServer(
    "user",
    "localhost",
    "imap"
  );
  gmailServer.port = IMAPServer.port;
  gmailServer.password = "password";
  gmailAccount.incomingServer = gmailServer;

  let gmailIdentity = MailServices.accounts.createIdentity();
  gmailIdentity.email = "imap@invalid";
  gmailAccount.addIdentity(gmailIdentity);
  gmailAccount.defaultIdentity = gmailIdentity;

  let gmailRootFolder = gmailServer.rootFolder;

  // Fetch the folders from the server. We haven't added the [Gmail] folder to
  // the server yet, because for some reason we can't set the `isGMailServer`
  // flag until after calling this function, but it must be set before the
  // folder appears or the folder tree misbehaves.
  // In reality there's going to be some lag between setting the flag and the
  // folders appearing, so this hack seems justified.
  gmailServer.performBiff(window.msgWindow);
  await TestUtils.waitForCondition(
    () => gmailRootFolder.subFolders.length == 2
  );

  // All of the above needs to happen before the `isGMailServer` flag sticks.
  // This flag helps the front end behave correctly.
  gmailServer.QueryInterface(Ci.nsIImapIncomingServer);
  gmailServer.isGMailServer = true;

  let gmailInboxFolder = gmailRootFolder.getChildNamed("INBOX");
  let gmailTrashFolder = gmailRootFolder.getChildNamed("Trash");

  await checkModeListItems("all", [
    gmailRootFolder,
    gmailInboxFolder,
    gmailTrashFolder,
    rootFolder,
    inboxFolder,
    trashFolder,
    outboxFolder,
    folderA,
    folderB,
    folderC,
  ]);

  // Now add the [Gmail] folder to the server and go looking for it.
  IMAPServer.createGmailMailboxes();
  gmailServer.performExpand(window.msgWindow);
  await TestUtils.waitForCondition(() => gmailRootFolder.subFolders.length > 2);

  // Get the folder and test the utility functions with it.
  let gmailGmailFolder = gmailRootFolder.getChildNamed("[Gmail]");
  let gmailAllMailFolder = gmailGmailFolder.getChildNamed("All Mail");

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
}).__skipMe = AppConstants.DEBUG; // Too unreliable.

add_task(async function testAccountOrder() {
  // Make some changes to the main account so that it appears in all modes.

  [...folderA.messages][0].markRead(false);
  folderA.setFlag(Ci.nsMsgFolderFlags.Favorite);
  folderPane.activeModes = ["all", "smart", "unread", "favorite"];

  let localFolders = [
    rootFolder,
    inboxFolder,
    trashFolder,
    outboxFolder,
    folderA,
    folderB,
    folderC,
  ];
  let smartServer = MailServices.accounts.findServer(
    "nobody",
    "smart mailboxes",
    "none"
  );
  let smartFolders = [
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
  await checkModeListItems("smart", [...smartFolders, trashFolder]);
  await checkModeListItems("unread", [rootFolder, folderA]);
  await checkModeListItems("favorite", [rootFolder, folderA]);

  // Create two new "none" accounts, foo and bar.

  let foo = MailServices.accounts.createAccount();
  foo.incomingServer = MailServices.accounts.createIncomingServer(
    `${foo.key}user`,
    "localhost",
    "none"
  );
  let fooRootFolder = foo.incomingServer.rootFolder;
  let fooTrashFolder = fooRootFolder.getChildNamed("Trash");
  let fooOutboxFolder = fooRootFolder.getChildNamed("Outbox");
  let fooFolders = [fooRootFolder, fooTrashFolder, fooOutboxFolder];

  let bar = MailServices.accounts.createAccount();
  bar.incomingServer = MailServices.accounts.createIncomingServer(
    `${bar.key}user`,
    "localhost",
    "none"
  );
  let barRootFolder = bar.incomingServer.rootFolder;
  let barTrashFolder = barRootFolder.getChildNamed("Trash");
  let barOutboxFolder = barRootFolder.getChildNamed("Outbox");
  let barFolders = [barRootFolder, barTrashFolder, barOutboxFolder];

  let generator = new MessageGenerator();
  fooTrashFolder
    .QueryInterface(Ci.nsIMsgLocalMailFolder)
    .addMessage(generator.makeMessage({}).toMboxString());
  fooTrashFolder.setFlag(Ci.nsMsgFolderFlags.Favorite);
  barTrashFolder
    .QueryInterface(Ci.nsIMsgLocalMailFolder)
    .addMessage(generator.makeMessage({}).toMboxString());
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
  await checkModeListItems("smart", [...smartFolders, trashFolder]);
  await checkModeListItems("unread", [rootFolder, folderA]);
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
  for (let folderTreeRow of folderPane._modes[
    modeName
  ].containerList.querySelectorAll("li")) {
    folderTree.expandRow(folderTreeRow);
  }
}

var IMAPServer = {
  open() {
    const {
      ImapDaemon,
      ImapMessage,
      IMAP_RFC3501_handler,
    } = ChromeUtils.import("resource://testing-common/mailnews/Imapd.jsm");
    const { nsMailServer } = ChromeUtils.import(
      "resource://testing-common/mailnews/Maild.jsm"
    );
    IMAPServer.ImapMessage = ImapMessage;

    this.daemon = new ImapDaemon();
    this.daemon.getMailbox("INBOX").specialUseFlag = "\\Inbox";
    this.daemon.getMailbox("INBOX").subscribed = true;
    this.daemon.createMailbox("Trash", {
      flags: ["\\Trash"],
      subscribed: true,
    });
    this.server = new nsMailServer(
      daemon => new IMAP_RFC3501_handler(daemon),
      this.daemon
    );
    this.server.start();

    registerCleanupFunction(() => this.close());
  },
  close() {
    this.server.stop();
  },
  get port() {
    return this.server.port;
  },

  createGmailMailboxes() {
    this.daemon.createMailbox("[Gmail]", {
      flags: ["\\NoSelect"],
      subscribed: true,
    });
    this.daemon.createMailbox("[Gmail]/All Mail", {
      flags: ["\\Archive"],
      subscribed: true,
      specialUseFlag: "\\AllMail",
    });
  },
};
