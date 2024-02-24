/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the many ways to make Thunderbird fetch new mail. In this file are
 * best case scenarios. Edge cases and failure cases are in separate files.
 *
 * An account of each type is created, and they are tested collectively and
 * individually. For each test, new messages are put on the server, the action
 * being tested is performed, then the test waits for the messages to appear.
 */

requestLongerTimeout(2);

const { MailConsts } = ChromeUtils.importESModule(
  "resource:///modules/MailConsts.sys.mjs"
);
const { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");
const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);
const { storeState } = ChromeUtils.importESModule(
  "resource:///modules/CustomizationState.mjs"
);

const generator = new MessageGenerator();
let localAccount, localRootFolder;
let imapServer, imapAccount, imapRootFolder, imapInbox;
let pop3Server, pop3Account, pop3RootFolder, pop3Inbox;
let nntpServer, nntpAccount, nntpRootFolder, nntpFolder;

const allInboxes = [];

const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
const getMessagesButton = about3Pane.document.getElementById(
  "folderPaneGetMessages"
);
const getMessagesContext = about3Pane.document.getElementById(
  "folderPaneGetMessagesContext"
);
let toolbarButton, toolbarContext;

add_setup(async function () {
  localAccount = MailServices.accounts.createLocalMailAccount();
  localRootFolder = localAccount.incomingServer.rootFolder;

  [imapServer, pop3Server, nntpServer] = await ServerTestUtils.createServers([
    ServerTestUtils.serverDefs.imap.plain,
    ServerTestUtils.serverDefs.pop3.plain,
    ServerTestUtils.serverDefs.nntp.plain,
  ]);
  nntpServer.addGroup("getmessages.newsgroup");

  imapAccount = MailServices.accounts.createAccount();
  imapAccount.addIdentity(MailServices.accounts.createIdentity());
  imapAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "localhost",
    "imap"
  );
  imapAccount.incomingServer.prettyName = "IMAP Account";
  imapAccount.incomingServer.port = imapServer.port;
  imapAccount.incomingServer.password = "password";
  imapRootFolder = imapAccount.incomingServer.rootFolder;
  imapInbox = imapRootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  allInboxes.push(imapInbox);

  pop3Account = MailServices.accounts.createAccount();
  pop3Account.addIdentity(MailServices.accounts.createIdentity());
  pop3Account.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "localhost",
    "pop3"
  );
  pop3Account.incomingServer.prettyName = "POP3 Account";
  pop3Account.incomingServer.port = pop3Server.port;
  pop3Account.incomingServer.password = "password";
  pop3RootFolder = pop3Account.incomingServer.rootFolder;
  pop3Inbox = pop3RootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  allInboxes.push(pop3Inbox);

  nntpAccount = MailServices.accounts.createAccount();
  nntpAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "localhost",
    "nntp"
  );
  nntpAccount.incomingServer.prettyName = "NNTP Account";
  nntpAccount.incomingServer.port = nntpServer.port;
  nntpRootFolder = nntpAccount.incomingServer.rootFolder;
  nntpRootFolder.createSubfolder("getmessages.newsgroup", null);
  nntpFolder = nntpRootFolder.getChildNamed("getmessages.newsgroup");
  allInboxes.push(nntpFolder);

  document.getElementById("toolbar-menubar").removeAttribute("autohide");
  about3Pane.displayFolder(localRootFolder);
  storeState({ mail: ["get-messages"] });

  toolbarButton = document.querySelector(
    `#unifiedToolbarContent [item-id="get-messages"]`
  );
  toolbarContext = document.getElementById("toolbarGetMessagesContext");
  await TestUtils.waitForCondition(
    () => toolbarButton.clientWidth && toolbarButton.clientHeight,
    "waiting for toolbar button"
  );

  registerCleanupFunction(async function () {
    MailServices.accounts.removeAccount(localAccount, false);
    MailServices.accounts.removeAccount(imapAccount, false);
    MailServices.accounts.removeAccount(pop3Account, false);
    MailServices.accounts.removeAccount(nntpAccount, false);
    storeState({});
  });
});

async function addMessagesToServer(type) {
  if (type == "imap") {
    await imapServer.addMessages(imapInbox, generator.makeMessages({}), false);
  } else if (type == "pop3") {
    await pop3Server.addMessages(generator.makeMessages({}));
  } else if (type == "nntp") {
    await nntpServer.addMessages(
      "getmessages.newsgroup",
      generator.makeMessages({})
    );
  }
}

async function addMessagesToAllServers() {
  for (const inbox of allInboxes) {
    await addMessagesToServer(inbox.server.type);
  }
}

async function waitForMessages(inbox) {
  await TestUtils.waitForCondition(
    () => inbox.getNumUnread(false) == 10 && inbox.numPendingUnread == 0,
    `waiting for new ${inbox.server.type} messages to be received`
  );
  await promiseServerIdle(inbox.server);
  info(`${inbox.server.type} messages received`);

  inbox.markAllMessagesRead(window.msgWindow);
  await promiseServerIdle(inbox.server);
  await TestUtils.waitForCondition(
    () => inbox.getNumUnread(false) == 0 && inbox.numPendingUnread == 0,
    `waiting for ${inbox.server.type} messages to be marked read`
  );
  info(`${inbox.server.type} messages marked as read`);
}

async function testAllServers(testCallback) {
  await addMessagesToAllServers();

  for (const inbox of allInboxes) {
    Assert.equal(
      inbox.getNumUnread(false),
      0,
      `${inbox.server.type} inbox should start with no messages`
    );
  }

  info("getting messages for all inboxes");
  await testCallback();

  for (const inbox of allInboxes) {
    await waitForMessages(inbox);
  }
}

async function testEachServer(testCallback) {
  await addMessagesToAllServers();

  for (const inbox of allInboxes) {
    Assert.equal(
      inbox.getNumUnread(false),
      0,
      `${inbox.server.type} inbox should start with no messages`
    );
  }

  for (const inbox of allInboxes) {
    info(`getting messages for ${inbox.server.type} inbox`);
    await testCallback(inbox);
    await waitForMessages(inbox);

    for (const otherInbox of allInboxes) {
      if (otherInbox != inbox) {
        Assert.equal(
          otherInbox.getNumUnread(false),
          0,
          `${otherInbox.server.type} should have no new messages`
        );
      }
    }
  }

  for (const inbox of allInboxes) {
    await promiseServerIdle(inbox.server);
  }
}

async function checkPopupItemsAndActivateFirst(popup, startAtIndex) {
  await BrowserTestUtils.waitForPopupEvent(popup, "shown");
  Assert.equal(
    popup.childElementCount,
    allInboxes.length + startAtIndex,
    "context menu has correct entries"
  );
  for (let i = 0; i < allInboxes.length; i++) {
    Assert.equal(
      popup.children[i + startAtIndex].textContent,
      allInboxes[i].server.prettyName,
      `${allInboxes[i].server.type} context menu item is labelled correctly`
    );
  }
  popup.activateItem(popup.children[0]);
  await BrowserTestUtils.waitForPopupEvent(popup, "hidden");
}

/**
 * Tests the "Get All New Messages" menu item from the Folder Pane header button.
 */
add_task(async function testGetMessagesContextAll() {
  await testAllServers(async function () {
    EventUtils.synthesizeMouseAtCenter(
      getMessagesButton,
      { type: "contextmenu" },
      about3Pane
    );
    await checkPopupItemsAndActivateFirst(getMessagesContext, 2);
  });
});

/**
 * Tests each account menu item from the Folder Pane header button.
 */
add_task(async function testGetMessagesContext() {
  await testEachServer(async function (thisInbox) {
    EventUtils.synthesizeMouseAtCenter(
      getMessagesButton,
      { type: "contextmenu" },
      about3Pane
    );
    await BrowserTestUtils.waitForPopupEvent(getMessagesContext, "shown");
    getMessagesContext.activateItem(
      getMessagesContext.querySelector(
        `[data-server-key="${thisInbox.server.key}"]`
      )
    );
    await BrowserTestUtils.waitForPopupEvent(getMessagesContext, "hidden");
  });
});

/**
 * Tests the folder pane context menu.
 */
add_task(async function testFolderPaneContext() {
  await testEachServer(async function (thisInbox) {
    const folderPaneContext =
      about3Pane.document.getElementById("folderPaneContext");
    const folderRow = about3Pane.folderPane.getRowForFolder(
      thisInbox.rootFolder
    );
    EventUtils.synthesizeMouseAtCenter(
      folderRow.querySelector(".name"),
      { type: "contextmenu" },
      about3Pane
    );
    await BrowserTestUtils.waitForPopupEvent(folderPaneContext, "shown");
    folderPaneContext.activateItem(
      folderPaneContext.querySelector("#folderPaneContext-getMessages")
    );
    await BrowserTestUtils.waitForPopupEvent(folderPaneContext, "hidden");
  });
});

/**
 * Tests clicking on the toolbar button.
 */
add_task(async function testToolbarButtonAll() {
  await testAllServers(function () {
    EventUtils.synthesizeMouseAtCenter(toolbarButton, {}, window);
  });
});

/**
 * Tests the "Get All New Messages" menu item from the toolbar button.
 */
add_task(async function testToolbarContextAll() {
  await testAllServers(async function () {
    EventUtils.synthesizeMouseAtCenter(
      toolbarButton,
      { type: "contextmenu" },
      window
    );
    await checkPopupItemsAndActivateFirst(toolbarContext, 2);
  });
});

/**
 * Tests each account menu item from the toolbar button.
 */
add_task(async function testToolbarContext() {
  await testEachServer(async function (thisInbox) {
    EventUtils.synthesizeMouseAtCenter(
      toolbarButton,
      { type: "contextmenu" },
      window
    );
    await BrowserTestUtils.waitForPopupEvent(toolbarContext, "shown");
    toolbarContext.activateItem(
      toolbarContext.querySelector(
        `[data-server-key="${thisInbox.server.key}"]`
      )
    );
    await BrowserTestUtils.waitForPopupEvent(toolbarContext, "hidden");
  });
});

async function subtestFileMenuAll(win) {
  const doc = win.document;
  const fileMenu = doc.getElementById("menu_File");
  const fileMenuGetMessages = doc.getElementById("menu_getAllNewMsg");

  await testAllServers(async function () {
    EventUtils.synthesizeMouseAtCenter(fileMenu, {}, win);
    await BrowserTestUtils.waitForPopupEvent(fileMenu.menupopup, "shown");
    fileMenuGetMessages.openMenu(true);
    await checkPopupItemsAndActivateFirst(fileMenuGetMessages.menupopup, 3);
    await BrowserTestUtils.waitForPopupEvent(fileMenu.menupopup, "hidden");
  });
}

async function subtestFileMenu(win, thisInbox) {
  const doc = win.document;
  const fileMenu = doc.getElementById("menu_File");
  const fileMenuGetMessages = doc.getElementById("menu_getAllNewMsg");
  const fileMenuGetMessagesPopup = fileMenuGetMessages.menupopup;

  EventUtils.synthesizeMouseAtCenter(fileMenu, {}, win);
  await BrowserTestUtils.waitForPopupEvent(fileMenu.menupopup, "shown");
  fileMenuGetMessages.openMenu(true);
  await BrowserTestUtils.waitForPopupEvent(fileMenuGetMessagesPopup, "shown");
  fileMenuGetMessagesPopup.activateItem(fileMenuGetMessagesPopup.children[1]);
  await BrowserTestUtils.waitForPopupEvent(fileMenuGetMessagesPopup, "hidden");
  await BrowserTestUtils.waitForPopupEvent(fileMenu.menupopup, "hidden");

  await waitForMessages(thisInbox);
  await addMessagesToServer(thisInbox.server.type);

  EventUtils.synthesizeMouseAtCenter(fileMenu, {}, win);
  await BrowserTestUtils.waitForPopupEvent(fileMenu.menupopup, "shown");
  fileMenuGetMessages.openMenu(true);
  await BrowserTestUtils.waitForPopupEvent(fileMenuGetMessagesPopup, "shown");
  for (const menuitem of fileMenuGetMessagesPopup.children) {
    if (menuitem._folder == thisInbox.rootFolder) {
      fileMenuGetMessagesPopup.activateItem(menuitem);
      break;
    }
  }
  await BrowserTestUtils.waitForPopupEvent(fileMenuGetMessagesPopup, "hidden");
  await BrowserTestUtils.waitForPopupEvent(fileMenu.menupopup, "hidden");

  await waitForMessages(thisInbox);
  await addMessagesToServer(thisInbox.server.type);
}

/**
 * Tests the "All Accounts" menu item from the File menu.
 */
add_task(async function testFileMenuAll() {
  await subtestFileMenuAll(window);
}).skip(AppConstants.platform == "macosx"); // Can't click the menu bar on mac.

/**
 * Tests each account menu item from the File menu.
 */
add_task(async function testFileMenu() {
  const fileMenu = document.getElementById("menu_File");
  const fileMenuGetMessages = document.getElementById("menu_getAllNewMsg");
  const fileMenuGetMessagesPopup = fileMenuGetMessages.menupopup;

  await testEachServer(async function (thisInbox) {
    EventUtils.synthesizeMouseAtCenter(fileMenu, {}, window);
    await BrowserTestUtils.waitForPopupEvent(fileMenu.menupopup, "shown");
    fileMenuGetMessages.openMenu(true);
    await BrowserTestUtils.waitForPopupEvent(fileMenuGetMessagesPopup, "shown");
    for (const menuitem of fileMenuGetMessagesPopup.children) {
      if (menuitem._folder == thisInbox.rootFolder) {
        fileMenuGetMessagesPopup.activateItem(menuitem);
        break;
      }
    }
    await BrowserTestUtils.waitForPopupEvent(
      fileMenuGetMessagesPopup,
      "hidden"
    );
    await BrowserTestUtils.waitForPopupEvent(fileMenu.menupopup, "hidden");
  });
}).skip(AppConstants.platform == "macosx"); // Can't click the menu bar on mac.

/**
 * Tests displaying a folder, clicking the Folder Pane header button, the File
 * menu "Current Account" menu item, and pressing F5. All of these things are
 * tested together because the act of displaying a folder fetches new mail.
 */
add_task(async function testInFolder() {
  await testEachServer(async function (thisInbox) {
    info("displaying the folder");
    about3Pane.displayFolder(thisInbox);
    if (thisInbox.server.type != "pop3") {
      // Why don't POP3 folders update when you open them?
      await waitForMessages(thisInbox);
      await addMessagesToServer(thisInbox.server.type);
    }

    info("clicking the Folder Pane header button");
    EventUtils.synthesizeMouseAtCenter(getMessagesButton, {}, about3Pane);
    await waitForMessages(thisInbox);
    await addMessagesToServer(thisInbox.server.type);

    if (AppConstants.platform != "macosx") {
      info("clicking the File menu item");
      await subtestFileMenu(window, thisInbox);
    }

    info("pressing F5");
    EventUtils.synthesizeKey("VK_F5", {});
  });
  about3Pane.displayFolder(localRootFolder);
});

/**
 * Tests the "Read messages" button in Account Central.
 */
add_task(async function testAccountCentral() {
  await testEachServer(async function (thisInbox) {
    about3Pane.displayFolder(thisInbox.rootFolder);
    const accountCentralBrowser = about3Pane.accountCentralBrowser;
    await TestUtils.waitForCondition(
      () =>
        accountCentralBrowser.currentURI.spec.endsWith(
          encodeURIComponent(thisInbox.rootFolder.URI)
        ) && accountCentralBrowser.contentDocument.readyState == "complete",
      "waiting for Account Central to load"
    );
    EventUtils.synthesizeMouseAtCenter(
      accountCentralBrowser.contentDocument.getElementById("readButton"),
      {},
      accountCentralBrowser.contentWindow
    );
    await TestUtils.waitForCondition(
      () => about3Pane.gFolder == thisInbox,
      "waiting for displayed folder to change"
    );
  });
  about3Pane.displayFolder(localRootFolder);
});

/**
 * Tests the "All Accounts" menu item from the File menu and the toolbar of a
 * standalone message window.
 */
add_task(async function testMessageWindowAll() {
  const messageWindow = await openMessageFromFile(
    new FileUtils.File(getTestFilePath("files/sampleContent.eml"))
  );

  if (AppConstants.platform != "macosx") {
    await subtestFileMenuAll(messageWindow);
  }

  info("clicking the toolbar popup menu item");
  await testAllServers(async function () {
    const button = messageWindow.document.getElementById("button-getmsg");
    EventUtils.synthesizeMouseAtCenter(
      button.querySelector(".toolbarbutton-menubutton-dropmarker"),
      {},
      messageWindow
    );
    await checkPopupItemsAndActivateFirst(button.menupopup, 2);
  });

  await BrowserTestUtils.closeWindow(messageWindow);
  await SimpleTest.promiseFocus(window);
});

/**
 * Tests displaying a message, the File menu "Current Account" menu item, the
 * toolbar button, and pressing F5 in a standalone message window.
 *
 * This test assumes at least one of the earlier tests have run and therefore
 * there are messages in each of the folders.
 */
add_task(async function testMessageWindow() {
  const windowsToClose = [];

  try {
    await testEachServer(async function (thisInbox) {
      info("opening a message");
      const messageWindowPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
      window.MsgOpenNewWindowForMessage(thisInbox.messages.getNext());
      const messageWindow = await messageWindowPromise;
      await messageLoadedIn(messageWindow.messageBrowser);
      windowsToClose.push(messageWindow);

      if (thisInbox.server.type != "pop3") {
        // Why don't POP3 folders update when you open them?
        await waitForMessages(thisInbox);
        await addMessagesToServer(thisInbox.server.type);
      }

      if (AppConstants.platform != "macosx") {
        info("clicking the File menu item");
        await subtestFileMenu(messageWindow, thisInbox);
      }

      info("clicking the toolbar button");
      const button = messageWindow.document.getElementById("button-getmsg");
      const popup = button.menupopup;
      EventUtils.synthesizeMouseAtCenter(
        button.querySelector(".toolbarbutton-menubutton-button"),
        {},
        messageWindow
      );

      await waitForMessages(thisInbox);
      await addMessagesToServer(thisInbox.server.type);

      info("clicking the toolbar popup menu item");
      EventUtils.synthesizeMouseAtCenter(
        button.querySelector(".toolbarbutton-menubutton-dropmarker"),
        {},
        messageWindow
      );
      await BrowserTestUtils.waitForPopupEvent(popup, "shown");
      for (const menuitem of popup.children) {
        if (menuitem._folder == thisInbox.rootFolder) {
          popup.activateItem(menuitem);
          break;
        }
      }
      await BrowserTestUtils.waitForPopupEvent(popup, "hidden");

      await waitForMessages(thisInbox);
      await addMessagesToServer(thisInbox.server.type);

      info("pressing F5");
      EventUtils.synthesizeKey("VK_F5", {}, messageWindow);
    });
  } finally {
    for (const win of windowsToClose) {
      await BrowserTestUtils.closeWindow(win);
    }
    await SimpleTest.promiseFocus(window);
  }
});
