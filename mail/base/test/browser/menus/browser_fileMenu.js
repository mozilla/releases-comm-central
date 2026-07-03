/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { FeedUtils } = ChromeUtils.importESModule(
  "resource:///modules/FeedUtils.sys.mjs"
);
const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);

/** @type {MenuData} */
const fileMenuData = {
  menu_New: {},
  menu_newNewMsgCmd: {},
  "calendar-new-event-menuitem": { hidden: true },
  "calendar-new-task-menuitem": { hidden: true },
  menu_newFolder: {
    hidden: ["mailMessageTab", "contentTab"],
    disabled: ["mailMessageWindow"],
  },
  menu_newVirtualFolder: {
    hidden: ["mailMessageTab", "contentTab"],
    disabled: ["mailMessageWindow"],
  },
  newMailAccountMenuItem: {},
  menu_newAddressbook: {}, // TODO: Bug 1991626 Remove line.
  menu_newLocalAddressbook: {},
  menu_newCarddavAddressbook: {},
  menu_newLdapAddressbook: {},
  menu_newAccountHubAddressbook: { hidden: true }, // TODO: Bug 1991626 Remove hidden attr.
  newIMAccountMenuItem: {},
  newFeedAccountMenuItem: {},
  newNewsgroupAccountMenuItem: {},
  "calendar-new-calendar-menuitem": {},
  menu_newCard: {},
  newIMContactMenuItem: { disabled: true },
  menu_Open: {},
  openMessageFileMenuitem: {},
  "calendar-open-calendar-file-menuitem": {},
  menu_close: {},
  "calendar-save-menuitem": { hidden: true },
  "calendar-save-and-close-menuitem": { hidden: true },
  menu_saveAs: {},
  menu_saveAsFile: { disabled: ["mail3PaneTab", "contentTab"] },
  menu_saveAsTemplate: { disabled: ["mail3PaneTab", "contentTab"] },
  menu_getAllNewMsg: {},
  menu_getnewmsgs_all_accounts: {},
  menu_getnewmsgs_current_account: {},
  menu_getnextnmsg: { hidden: true },
  menu_sendunsentmsgs: { disabled: true },
  menu_subscribe: {
    disabled: ["mailMessageTab", "mailMessageWindow", "contentTab"],
  },
  menu_deleteFolder: { disabled: true, hidden: ["mailMessageWindow"] },
  menu_renameFolder: { disabled: true, hidden: ["mailMessageWindow"] },
  menu_compactFolder: { hidden: true },
  menu_compactFolderAll: {
    disabled: ["mailMessageTab", "contentTab"],
    hidden: ["mailMessageWindow"],
  },
  menu_emptyTrash: {
    disabled: ["mailMessageTab", "contentTab"],
    hidden: ["mailMessageWindow"],
  },
  offlineMenuItem: {},
  goOfflineMenuItem: {},
  menu_synchronizeOffline: {},
  menu_settingsOffline: { disabled: true },
  menu_downloadFlagged: { disabled: true },
  menu_downloadSelected: { disabled: true },
  printMenuItem: { disabled: ["mail3PaneTab"] },
  menu_FileQuitItem: {},
};
const nonMainWindowData = Object.fromEntries(
  Object.entries(fileMenuData).filter(
    ([id]) =>
      ![
        "menu_newAddressbook", // TODO: Bug 1991626 Remove line.
        "menu_newLocalAddressbook",
        "menu_newCarddavAddressbook",
        "menu_newLdapAddressbook",
        "menu_newAccountHubAddressbook",
        "calendar-new-event-menuitem",
        "calendar-new-task-menuitem",
        "calendar-new-calendar-menuitem",
        "calendar-open-calendar-file-menuitem",
        "calendar-save-menuitem",
        "calendar-save-and-close-menuitem",
        "menu_FileQuitItem",
      ].includes(id)
  )
);
const helper = new MenuTestHelper("menu_File", fileMenuData);

const tabmail = document.getElementById("tabmail");
let inboxFolder, plainFolder, rootFolder, testMessages, trashFolder;
let imapRootFolder, nntpRootFolder, rssRootFolder;

add_setup(async function () {
  document.getElementById("toolbar-menubar").removeAttribute("autohide");

  const generator = new MessageGenerator();

  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );

  inboxFolder = rootFolder
    .createLocalSubfolder("file menu inbox")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  inboxFolder.setFlag(Ci.nsMsgFolderFlags.Inbox);
  inboxFolder.addMessageBatch(
    generator
      .makeMessages({ count: 5 })
      .map(message => message.toMessageString())
  );
  testMessages = [...inboxFolder.messages];

  plainFolder = rootFolder
    .createLocalSubfolder("file menu plain")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  trashFolder = rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash);

  const imapAccount = MailServices.accounts.createAccount();
  imapAccount.incomingServer = MailServices.accounts.createIncomingServer(
    `${imapAccount.key}user`,
    "localhost",
    "imap"
  );
  imapRootFolder = imapAccount.incomingServer.rootFolder;

  const nntpAccount = MailServices.accounts.createAccount();
  nntpAccount.incomingServer = MailServices.accounts.createIncomingServer(
    `${nntpAccount.key}user`,
    "localhost",
    "nntp"
  );
  nntpRootFolder = nntpAccount.incomingServer.rootFolder;

  const rssAccount = FeedUtils.createRssAccount("Test RSS Account");
  rssRootFolder = rssAccount.incomingServer.rootFolder;

  window.OpenMessageInNewTab(testMessages[0], { background: true });
  await BrowserTestUtils.waitForEvent(
    tabmail.tabInfo[1].chromeBrowser,
    "MsgLoaded"
  );

  window.openTab("contentTab", {
    url: "https://example.com/",
    background: true,
  });

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(0);
    MailServices.accounts.removeAccount(account, false);
    MailServices.accounts.removeAccount(imapAccount);
    MailServices.accounts.removeAccount(nntpAccount);
    MailServices.accounts.removeAccount(rssAccount);
  });
});

add_task(async function test3PaneTab() {
  tabmail.currentAbout3Pane.displayFolder(rootFolder);
  await helper.testAllItems("mail3PaneTab");

  tabmail.currentAbout3Pane.displayFolder(inboxFolder);
  await helper.testItems({
    menu_subscribe: {},
    menu_deleteFolder: { disabled: true },
    menu_renameFolder: { disabled: true },
    menu_compactFolder: {},
    menu_compactFolderAll: { hidden: true },
    menu_emptyTrash: {},
  });

  tabmail.currentAbout3Pane.displayFolder(plainFolder);
  await helper.testItems({
    menu_subscribe: {},
    menu_deleteFolder: {},
    menu_renameFolder: {},
    menu_compactFolder: {},
    menu_compactFolderAll: { hidden: true },
    menu_emptyTrash: {},
  });

  tabmail.currentAbout3Pane.displayFolder(trashFolder);
  await helper.testItems({
    menu_subscribe: {},
    menu_deleteFolder: { disabled: true },
    menu_renameFolder: { disabled: true },
    menu_compactFolder: {},
    menu_compactFolderAll: { hidden: true },
    menu_emptyTrash: {},
  });

  tabmail.currentAbout3Pane.displayFolder(imapRootFolder);
  await helper.testItems({
    menu_subscribe: {},
    menu_deleteFolder: { disabled: true },
    menu_renameFolder: { disabled: true },
    menu_compactFolder: { hidden: true },
    menu_compactFolderAll: {},
    menu_emptyTrash: {},
  });

  tabmail.currentAbout3Pane.displayFolder(nntpRootFolder);
  await helper.testItems({
    menu_subscribe: {},
    menu_deleteFolder: { disabled: true },
    menu_renameFolder: { disabled: true },
    menu_compactFolder: { hidden: true },
    menu_compactFolderAll: { disabled: true },
    menu_emptyTrash: { disabled: true },
  });

  tabmail.currentAbout3Pane.displayFolder(rssRootFolder);
  await helper.testItems({
    menu_subscribe: {},
    menu_deleteFolder: { disabled: true },
    menu_renameFolder: { disabled: true },
    menu_compactFolder: { hidden: true },
    menu_compactFolderAll: {},
    menu_emptyTrash: {},
  });
});

add_task(async function testMessageTab() {
  tabmail.switchToTab(1);
  await helper.testAllItems("mailMessageTab");
});

add_task(async function testContentTab() {
  tabmail.switchToTab(2);
  await helper.testAllItems("contentTab");
});

add_task(async function testMessageWindow() {
  const messageWindowPromise = BrowserTestUtils.domWindowOpenedAndLoaded(
    undefined,
    async win =>
      win.document.documentURI ==
      "chrome://messenger/content/messageWindow.xhtml"
  );
  MailUtils.openMessageInNewWindow(testMessages[0]);

  const messageWindow = await messageWindowPromise;
  await SimpleTest.promiseFocus(messageWindow);
  const windowTestHelper = new MenuTestHelper(
    "menu_File",
    nonMainWindowData,
    messageWindow.document
  );

  await windowTestHelper.testAllItems("mailMessageWindow");

  await BrowserTestUtils.closeWindow(messageWindow);
});

add_task(async function testSubscribe() {
  tabmail.switchToTab(0);

  // IMAP

  tabmail.currentAbout3Pane.displayFolder(imapRootFolder);
  let subscribePromise = BrowserTestUtils.promiseAlertDialogOpen(
    undefined,
    "chrome://messenger/content/subscribe.xhtml"
  );

  helper.activateItem("menu_subscribe");
  let subscribeWindow = await subscribePromise;
  await SimpleTest.promiseFocus(subscribeWindow);

  let serverPicker = subscribeWindow.document.getElementById("serverMenu");
  Assert.equal(
    serverPicker.value,
    imapRootFolder.URI,
    "server should be selected in the server picker"
  );

  await BrowserTestUtils.closeWindow(subscribeWindow);
  await SimpleTest.promiseFocus();
  await promiseServerIdle(imapRootFolder.server);

  // NNTP

  tabmail.currentAbout3Pane.displayFolder(nntpRootFolder);
  subscribePromise = BrowserTestUtils.promiseAlertDialogOpen(
    undefined,
    "chrome://messenger/content/subscribe.xhtml"
  );

  helper.activateItem("menu_subscribe");
  subscribeWindow = await subscribePromise;
  await SimpleTest.promiseFocus(subscribeWindow);

  serverPicker = subscribeWindow.document.getElementById("serverMenu");
  Assert.equal(
    serverPicker.value,
    nntpRootFolder.URI,
    "server should be selected in the server picker"
  );

  await BrowserTestUtils.closeWindow(subscribeWindow);
  await SimpleTest.promiseFocus();
  await promiseServerIdle(nntpRootFolder.server);

  // RSS

  tabmail.currentAbout3Pane.displayFolder(rssRootFolder);
  subscribePromise = BrowserTestUtils.promiseAlertDialogOpen(
    undefined,
    "chrome://messenger-newsblog/content/feed-subscriptions.xhtml"
  );

  helper.activateItem("menu_subscribe");
  subscribeWindow = await subscribePromise;
  await SimpleTest.promiseFocus(subscribeWindow);

  await BrowserTestUtils.closeWindow(subscribeWindow);
  await SimpleTest.promiseFocus();
});
