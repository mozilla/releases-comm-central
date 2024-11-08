/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MenuTestHelper, promiseServerIdle */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
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
