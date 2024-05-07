/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { IMAPServer } = ChromeUtils.importESModule(
  "resource://testing-common/IMAPServer.sys.mjs"
);
const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { NNTPServer } = ChromeUtils.importESModule(
  "resource://testing-common/NNTPServer.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

/** @type MenuData */
const editMenuData = {
  menu_undo: { disabled: true },
  menu_redo: { disabled: true },
  menu_cut: { disabled: true },
  menu_copy: { disabled: true },
  menu_paste: { disabled: true },
  menu_delete: { disabled: true, l10nID: "text-action-delete" },
  menu_select: {},
  menu_SelectAll: {},
  menu_selectThread: { disabled: true },
  menu_selectFlagged: { disabled: true },
  menu_find: {},
  menu_findCmd: { disabled: true },
  menu_findAgainCmd: { disabled: true },
  searchMailCmd: {},
  glodaSearchCmd: {},
  searchAddressesCmd: {},
  menu_favoriteFolder: { disabled: true },
  menu_properties: { disabled: true },
  "calendar-properties-menuitem": { disabled: true },
};
if (AppConstants.platform == "linux") {
  editMenuData.menu_preferences = {};
  editMenuData.menu_accountmgr = {};
}
const helper = new MenuTestHelper("menu_Edit", editMenuData);

let imapServer, nntpServer;

const tabmail = document.getElementById("tabmail");
let rootFolder, testFolder, testMessages, virtualFolder;
let nntpRootFolder, nntpFolder;
let imapRootFolder, imapFolder;

add_setup(async function () {
  document.getElementById("toolbar-menubar").removeAttribute("autohide");
  window.messenger.transactionManager.clear();

  const generator = new MessageGenerator();

  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );

  testFolder = rootFolder
    .createLocalSubfolder("edit menu")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  testFolder.addMessageBatch(
    generator.makeMessages({}).map(message => message.toMessageString())
  );
  testMessages = [...testFolder.messages];

  virtualFolder = rootFolder
    .createLocalSubfolder("edit menu virtual")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  virtualFolder.setFlag(Ci.nsMsgFolderFlags.Virtual);
  const msgDatabase = virtualFolder.msgDatabase;
  const folderInfo = msgDatabase.dBFolderInfo;
  folderInfo.setCharProperty("searchStr", "ALL");
  folderInfo.setCharProperty("searchFolderUri", testFolder.URI);

  nntpServer = new NNTPServer();
  nntpServer.addGroup("edit.menu.newsgroup");
  const nntpAccount = MailServices.accounts.createAccount();
  nntpAccount.incomingServer = MailServices.accounts.createIncomingServer(
    `${nntpAccount.key}user`,
    "localhost",
    "nntp"
  );
  nntpAccount.incomingServer.port = nntpServer.port;
  nntpRootFolder = nntpAccount.incomingServer.rootFolder;
  nntpRootFolder.createSubfolder("edit.menu.newsgroup", null);
  nntpFolder = nntpRootFolder.getChildNamed("edit.menu.newsgroup");

  imapServer = new IMAPServer();
  const imapAccount = MailServices.accounts.createAccount();
  imapAccount.addIdentity(MailServices.accounts.createIdentity());
  imapAccount.incomingServer = MailServices.accounts.createIncomingServer(
    `${imapAccount.key}user`,
    "localhost",
    "imap"
  );
  imapAccount.incomingServer.port = imapServer.port;
  imapAccount.incomingServer.username = "user";
  imapAccount.incomingServer.password = "password";
  imapAccount.incomingServer.deleteModel = Ci.nsMsgImapDeleteModels.IMAPDelete;
  imapRootFolder = imapAccount.incomingServer.rootFolder;
  imapFolder = imapRootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  await imapServer.addMessages(imapFolder, generator.makeMessages({}));

  registerCleanupFunction(async function () {
    await promiseServerIdle(imapAccount.incomingServer);
    MailServices.accounts.removeAccount(account, false);
    MailServices.accounts.removeAccount(nntpAccount, false);
    MailServices.accounts.removeAccount(imapAccount, false);
  });
});

add_task(async function test3PaneTab() {
  await helper.testAllItems("mail3PaneTab");
});

/**
 * Tests the "Delete" item in the menu. This item calls cmd_delete, which does
 * various things depending on the current context.
 */
add_task(async function testDeleteItem() {
  const about3Pane = tabmail.currentAbout3Pane;
  const { displayFolder, folderTree, paneLayout, threadTree } = about3Pane;
  paneLayout.messagePaneVisible = true;

  // Focus on the folder tree and check that an NNTP account shows
  // "Unsubscribe Folder". The account can't be deleted this way so the menu
  // item should be disabled.

  folderTree.focus();
  displayFolder(nntpRootFolder);
  await helper.testItems({
    menu_delete: {
      disabled: true,
      l10nID: "text-action-delete",
    },
  });

  // Check that an NNTP folder shows "Unsubscribe Folder". Then check that
  // calling cmd_delete actually attempts to unsubscribe the folder.

  displayFolder(nntpFolder);
  await Promise.all([
    BrowserTestUtils.promiseAlertDialog("cancel"),
    helper.activateItem("menu_delete", {
      l10nID: "menu-edit-unsubscribe-newsgroup",
    }),
  ]);

  // Check that a mail account shows "Delete Folder". The account can't be
  // deleted this way so the menu item should be disabled.

  displayFolder(rootFolder);
  await helper.testItems({
    menu_delete: {
      disabled: true,
      l10nID: "text-action-delete",
    },
  });

  // Check that focus on the folder tree and a mail folder shows "Delete
  // Folder". Then check that calling cmd_delete actually attempts to delete
  // the folder.

  displayFolder(testFolder);
  await Promise.all([
    BrowserTestUtils.promiseAlertDialog("cancel"),
    helper.activateItem("menu_delete", { l10nID: "menu-edit-delete-folder" }),
  ]);
  await new Promise(resolve => setTimeout(resolve));

  // Focus the Quick Filter bar text box and check the menu item shows "Delete".

  goDoCommand("cmd_showQuickFilterBar");
  about3Pane.document.getElementById("qfb-qs-textbox").focus();
  await helper.testItems({
    menu_delete: {
      disabled: true,
      l10nID: "text-action-delete",
    },
  });

  // Focus on the thread tree with no messages selected and check the menu
  // item shows "Delete".

  threadTree.table.body.focus();
  threadTree.selectedIndex = -1;
  await helper.testItems({
    menu_delete: {
      disabled: true,
      l10nID: "text-action-delete",
    },
  });

  // With one message selected check the menu item shows "Delete Message".

  threadTree.selectedIndex = 0;
  await helper.testItems({
    menu_delete: {
      l10nID: "menu-edit-delete-messages",
      l10nArgs: { count: 1 },
    },
  });

  // Focus the Quick Filter bar text box and check the menu item shows "Delete".
  // It should *not* show "Delete Message" even though one is selected.

  about3Pane.document.getElementById("qfb-qs-textbox").focus();
  await helper.testItems({
    menu_delete: {
      disabled: true,
      l10nID: "text-action-delete",
    },
  });

  // Focus on about:message and check the menu item shows "Delete Message".

  about3Pane.messageBrowser.focus();
  await helper.testItems({
    menu_delete: {
      l10nID: "menu-edit-delete-messages",
      l10nArgs: { count: 1 },
    },
  });

  // With multiple messages selected and check the menu item shows "Delete
  // Messages". Then check that calling cmd_delete actually deletes the messages.

  threadTree.table.body.focus();
  threadTree.selectedIndices = [0, 1, 3];
  await Promise.all([
    new PromiseTestUtils.promiseFolderEvent(
      testFolder,
      "DeleteOrMoveMsgCompleted"
    ),
    helper.activateItem("menu_delete", {
      l10nID: "menu-edit-delete-messages",
      l10nArgs: { count: 3 },
    }),
  ]);

  // Load an IMAP folder with the "just mark deleted" model. With no messages
  // selected check the menu item shows "Delete".

  // Note that for each flag change, we wait for a second for the change to
  // be sent to the IMAP server.
  const SETFLAG_TIMEOUT = 1200;

  displayFolder(imapFolder);
  await promiseServerIdle(imapFolder.server);
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, SETFLAG_TIMEOUT));
  Assert.equal(threadTree.view.rowCount, 10, "IMAP folder loaded");
  const dbView = about3Pane.gDBView;
  threadTree.selectedIndex = -1;
  await helper.testItems({
    menu_delete: {
      disabled: true,
      l10nID: "text-action-delete",
    },
  });

  // With one message selected check the menu item shows "Delete Message".
  // Then check that calling cmd_delete sets the flag on the message.

  threadTree.selectedIndex = 0;
  const message = dbView.getMsgHdrAt(0);
  await helper.activateItem("menu_delete", {
    l10nID: "menu-edit-delete-messages",
    l10nArgs: { count: 1 },
  });
  await promiseServerIdle(imapFolder.server);
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, SETFLAG_TIMEOUT));
  Assert.ok(
    message.flags & Ci.nsMsgMessageFlags.IMAPDeleted,
    "IMAPDeleted flag should be set"
  );

  // Check the menu item now shows "Undelete Message" and that calling
  // cmd_delete clears the flag on the message.

  // The delete operation moved the selection, go back.
  threadTree.selectedIndex = 0;
  await helper.activateItem("menu_delete", {
    l10nID: "menu-edit-undelete-messages",
    l10nArgs: { count: 1 },
  });
  await promiseServerIdle(imapFolder.server);
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, SETFLAG_TIMEOUT));
  Assert.ok(
    !(message.flags & Ci.nsMsgMessageFlags.IMAPDeleted),
    "IMAPDeleted flag should be cleared on message 0"
  );

  // Check the menu item again shows "Delete Message".

  await helper.testItems({
    menu_delete: {
      l10nID: "menu-edit-delete-messages",
      l10nArgs: { count: 1 },
    },
  });

  // With multiple messages selected and check the menu item shows "Delete
  // Messages". Check that calling cmd_delete sets the flag on the messages.

  threadTree.selectedIndices = [1, 3, 5];
  const messages = dbView.getSelectedMsgHdrs();
  await helper.testItems({
    menu_delete: {
      l10nID: "menu-edit-delete-messages",
      l10nArgs: { count: 3 },
    },
  });
  await helper.activateItem("menu_delete");
  await promiseServerIdle(imapFolder.server);
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, SETFLAG_TIMEOUT));
  Assert.ok(
    messages.every(m => m.flags & Ci.nsMsgMessageFlags.IMAPDeleted),
    "IMAPDeleted flags should be set"
  );

  // Check the menu item now shows "Undelete Messages" and that calling
  // cmd_delete clears the flag on the messages.

  threadTree.selectedIndices = [1, 3, 5];
  await helper.activateItem("menu_delete", {
    l10nID: "menu-edit-undelete-messages",
    l10nArgs: { count: 3 },
  });
  await promiseServerIdle(imapFolder.server);
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, SETFLAG_TIMEOUT));
  Assert.ok(
    messages.every(m => !(m.flags & Ci.nsMsgMessageFlags.IMAPDeleted)),
    "IMAPDeleted flags should be cleared"
  );

  // Check the menu item again shows "Delete Messages".

  threadTree.selectedIndices = [1, 3, 5];
  await helper.testItems({
    menu_delete: {
      l10nID: "menu-edit-delete-messages",
      l10nArgs: { count: 3 },
    },
  });

  Services.focus.focusedWindow = window;
}).skip(AppConstants.DEBUG); // Too unreliable.

/**
 * Tests the "Favorite Folder" item in the menu is checked/unchecked as expected.
 */
add_task(async function testFavoriteFolderItem() {
  const { displayFolder } = tabmail.currentAbout3Pane;

  testFolder.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  displayFolder(testFolder);
  await helper.testItems({ menu_favoriteFolder: {} });

  testFolder.setFlag(Ci.nsMsgFolderFlags.Favorite);
  await helper.activateItem("menu_favoriteFolder", { checked: true });
  Assert.ok(
    !testFolder.getFlag(Ci.nsMsgFolderFlags.Favorite),
    "favorite flag should be cleared"
  );

  await helper.activateItem("menu_favoriteFolder", {});
  Assert.ok(
    testFolder.getFlag(Ci.nsMsgFolderFlags.Favorite),
    "favorite flag should be set"
  );

  testFolder.clearFlag(Ci.nsMsgFolderFlags.Favorite);
});

/**
 * Tests the "Properties" item in the menu is enabled/disabled as expected,
 * and has the correct label.
 */
add_task(async function testPropertiesItem() {
  async function testDialog(folder, data, which = "folderProps.xhtml") {
    await Promise.all([
      BrowserTestUtils.promiseAlertDialog(
        undefined,
        `chrome://messenger/content/${which}`,
        {
          callback(win) {
            Assert.ok(true, "folder properties dialog opened");
            Assert.equal(
              win.gMsgFolder.URI,
              folder.URI,
              "dialog has correct folder"
            );
            win.document.querySelector("dialog").getButton("cancel").click();
          },
        }
      ),
      helper.activateItem("menu_properties", data),
    ]);
    await SimpleTest.promiseFocus(window);
  }

  const { displayFolder } = tabmail.currentAbout3Pane;

  displayFolder(rootFolder);
  await helper.testItems({
    menu_properties: { disabled: true, l10nID: "menu-edit-properties" },
  });

  displayFolder(testFolder);
  await testDialog(testFolder, { l10nID: "menu-edit-folder-properties" });

  displayFolder(virtualFolder);
  await testDialog(
    virtualFolder,
    { l10nID: "menu-edit-folder-properties" },
    "virtualFolderProperties.xhtml"
  );

  displayFolder(imapRootFolder);
  await helper.testItems({
    menu_properties: { disabled: true, l10nID: "menu-edit-properties" },
  });

  displayFolder(imapFolder);
  await testDialog(imapFolder, { l10nID: "menu-edit-folder-properties" });

  displayFolder(nntpRootFolder);
  await helper.testItems({
    menu_properties: { disabled: true, l10nID: "menu-edit-properties" },
  });

  displayFolder(nntpFolder);
  await testDialog(nntpFolder, { l10nID: "menu-edit-newsgroup-properties" });
});
