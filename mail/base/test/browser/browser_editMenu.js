/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);
const { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
const { nsMailServer } = ChromeUtils.import(
  "resource://testing-common/mailnews/Maild.jsm"
);
const { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
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
  menu_favoriteFolder: {},
  menu_properties: { disabled: true },
  "calendar-properties-menuitem": { disabled: true },
};
if (AppConstants.platform == "linux") {
  editMenuData.menu_preferences = {};
  editMenuData.menu_accountmgr = {};
}
let helper = new MenuTestHelper("menu_Edit", editMenuData);

let tabmail = document.getElementById("tabmail");
let rootFolder, testFolder, testMessages;
let nntpRootFolder, nntpFolder;
let imapRootFolder, imapFolder;

add_setup(async function () {
  document.getElementById("toolbar-menubar").removeAttribute("autohide");

  const generator = new MessageGenerator();

  MailServices.accounts.createLocalMailAccount();
  let account = MailServices.accounts.accounts[0];
  account.addIdentity(MailServices.accounts.createIdentity());
  rootFolder = account.incomingServer.rootFolder;

  rootFolder.createSubfolder("edit menu", null);
  testFolder = rootFolder
    .getChildNamed("edit menu")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  testFolder.addMessageBatch(
    generator.makeMessages({}).map(message => message.toMboxString())
  );
  testMessages = [...testFolder.messages];

  NNTPServer.open();
  NNTPServer.addGroup("edit.menu.newsgroup");
  let nntpAccount = MailServices.accounts.createAccount();
  nntpAccount.incomingServer = MailServices.accounts.createIncomingServer(
    `${nntpAccount.key}user`,
    "localhost",
    "nntp"
  );
  nntpAccount.incomingServer.port = NNTPServer.port;
  nntpRootFolder = nntpAccount.incomingServer.rootFolder;
  nntpRootFolder.createSubfolder("edit.menu.newsgroup", null);
  nntpFolder = nntpRootFolder.getChildNamed("edit.menu.newsgroup");

  IMAPServer.open();
  let imapAccount = MailServices.accounts.createAccount();
  imapAccount.addIdentity(MailServices.accounts.createIdentity());
  imapAccount.incomingServer = MailServices.accounts.createIncomingServer(
    `${imapAccount.key}user`,
    "localhost",
    "imap"
  );
  imapAccount.incomingServer.port = IMAPServer.port;
  imapAccount.incomingServer.username = "user";
  imapAccount.incomingServer.password = "password";
  imapAccount.incomingServer.deleteModel = Ci.nsMsgImapDeleteModels.IMAPDelete;
  imapRootFolder = imapAccount.incomingServer.rootFolder;
  imapFolder = imapRootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  IMAPServer.addMessages(imapFolder, generator.makeMessages({}));

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
    MailServices.accounts.removeAccount(nntpAccount, false);
    MailServices.accounts.removeAccount(imapAccount, false);
    NNTPServer.close();
    IMAPServer.close();
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
  let about3Pane = tabmail.currentAbout3Pane;
  let { displayFolder, folderTree, paneLayout, threadTree } = about3Pane;
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
  await helper.testItems({
    menu_delete: { l10nID: "menu-edit-unsubscribe-newsgroup" },
  });
  let promptPromise = BrowserTestUtils.promiseAlertDialog("cancel");
  goDoCommand("cmd_delete");
  await promptPromise;

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
  await helper.testItems({
    menu_delete: { l10nID: "menu-edit-delete-folder" },
  });
  promptPromise = BrowserTestUtils.promiseAlertDialog("cancel");
  goDoCommand("cmd_delete");
  await promptPromise;
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
  await helper.testItems({
    menu_delete: {
      l10nID: "menu-edit-delete-messages",
      l10nArgs: { count: 3 },
    },
  });
  let deleteListener = new PromiseTestUtils.promiseFolderEvent(
    testFolder,
    "DeleteOrMoveMsgCompleted"
  );
  goDoCommand("cmd_delete");
  await deleteListener.promise;
  await new Promise(resolve => setTimeout(resolve));

  // Load an IMAP folder with the "just mark deleted" model. With no messages
  // selected check the menu item shows "Delete".

  // Note that for each flag change, we wait for a second for the change to
  // be sent to the IMAP server.

  displayFolder(imapFolder);
  await TestUtils.waitForCondition(() => threadTree.view.rowCount == 10);
  let dbView = about3Pane.gDBView;
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
  let message = dbView.getMsgHdrAt(0);
  await helper.testItems({
    menu_delete: {
      l10nID: "menu-edit-delete-messages",
      l10nArgs: { count: 1 },
    },
  });
  goDoCommand("cmd_delete");
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));
  Assert.ok(
    message.flags & Ci.nsMsgMessageFlags.IMAPDeleted,
    "IMAPDeleted flag should be set"
  );

  // Check the menu item now shows "Undelete Message" and that calling
  // cmd_delete clears the flag on the message.

  // The delete operation moved the selection, go back.
  threadTree.selectedIndex = 0;
  await helper.testItems({
    menu_delete: {
      l10nID: "menu-edit-undelete-messages",
      l10nArgs: { count: 1 },
    },
  });
  goDoCommand("cmd_delete");
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));
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
  let messages = dbView.getSelectedMsgHdrs();
  await helper.testItems({
    menu_delete: {
      l10nID: "menu-edit-delete-messages",
      l10nArgs: { count: 3 },
    },
  });
  goDoCommand("cmd_delete");
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));
  Assert.ok(
    messages.every(m => m.flags & Ci.nsMsgMessageFlags.IMAPDeleted),
    "IMAPDeleted flags should be set"
  );

  // Check the menu item now shows "Undelete Messages" and that calling
  // cmd_delete clears the flag on the messages.

  threadTree.selectedIndices = [1, 3, 5];
  await helper.testItems({
    menu_delete: {
      l10nID: "menu-edit-undelete-messages",
      l10nArgs: { count: 3 },
    },
  });
  goDoCommand("cmd_delete");
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, 1000));
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
}).__skipMe = AppConstants.DEBUG; // Too unreliable.

var NNTPServer = {
  open() {
    let { NNTP_RFC977_handler, NntpDaemon } = ChromeUtils.import(
      "resource://testing-common/mailnews/Nntpd.jsm"
    );

    this.daemon = new NntpDaemon();
    this.server = new nsMailServer(
      daemon => new NNTP_RFC977_handler(daemon),
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

  addGroup(group) {
    return this.daemon.addGroup(group);
  },
};

var IMAPServer = {
  open() {
    let { ImapDaemon, ImapMessage, IMAP_RFC3501_handler } = ChromeUtils.import(
      "resource://testing-common/mailnews/Imapd.jsm"
    );
    IMAPServer.ImapMessage = ImapMessage;

    this.daemon = new ImapDaemon();
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

  addMessages(folder, messages) {
    let fakeFolder = IMAPServer.daemon.getMailbox(folder.name);
    messages.forEach(message => {
      if (typeof message != "string") {
        message = message.toMessageString();
      }
      let msgURI = Services.io.newURI(
        "data:text/plain;base64," + btoa(message)
      );
      let imapMsg = new IMAPServer.ImapMessage(
        msgURI.spec,
        fakeFolder.uidnext++,
        []
      );
      fakeFolder.addMessage(imapMsg);
    });

    return new Promise(resolve =>
      mailTestUtils.updateFolderAndNotify(folder, resolve)
    );
  },
};
