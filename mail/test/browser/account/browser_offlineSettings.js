/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the UI for selection of folders with offline storage.
 */

const { click_account_tree_row, get_account_tree_row, openAccountSettings } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/AccountManagerHelpers.sys.mjs"
  );
const { RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockServer.sys.mjs"
);
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
let nntpAccount, nntpRootFolder;
let imapAccount, imapRootFolder;
let ewsAccount, ewsRootFolder;

add_setup(async () => {
  // Set up servers.

  const imapServer = await ServerTestUtils.createServer({ type: "imap" });
  imapServer.daemon.getMailbox("INBOX").specialUseFlag = "\\Inbox";
  imapServer.daemon.getMailbox("INBOX").subscribed = true;
  imapServer.daemon.createMailbox("Trash", {
    flags: ["\\Trash"],
    subscribed: true,
  });
  imapServer.daemon.createMailbox("first", { subscribed: true });
  imapServer.daemon.createMailbox("second", { subscribed: true });
  imapServer.daemon.createMailbox("third", { subscribed: true });
  imapServer.daemon.createMailbox("third/fourth", { subscribed: true });

  const ewsServer = await ServerTestUtils.createServer({ type: "ews" });
  ewsServer.setRemoteFolders([
    new RemoteFolder("root", null, "Root", "msgfolderroot"),
    new RemoteFolder("inbox", "root", "Inbox", "inbox"),
    new RemoteFolder("first", "root"),
    new RemoteFolder("second", "root"),
    new RemoteFolder("third", "root"),
    new RemoteFolder("fourth", "third"),
  ]);

  // Set up NNTP account.

  nntpAccount = MailServices.accounts.createAccount();
  nntpAccount.addIdentity(MailServices.accounts.createIdentity());
  nntpAccount.incomingServer = MailServices.accounts.createIncomingServer(
    null,
    "example.nntp.invalid",
    "nntp"
  );
  nntpRootFolder = nntpAccount.incomingServer.rootFolder;
  nntpRootFolder.createSubfolder("offline.first", null);
  nntpRootFolder
    .getChildNamed("offline.first")
    .setFlag(Ci.nsMsgFolderFlags.Offline);
  nntpRootFolder.createSubfolder("offline.second", null);
  nntpRootFolder
    .getChildNamed("offline.second")
    .setFlag(Ci.nsMsgFolderFlags.Offline);
  nntpRootFolder.createSubfolder("offline.third", null);
  nntpRootFolder.createSubfolder("offline.third.fourth", null);

  // Set up IMAP account.

  imapAccount = MailServices.accounts.createAccount();
  imapAccount.addIdentity(MailServices.accounts.createIdentity());
  imapAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "localhost",
    "imap"
  );
  imapAccount.incomingServer.port = imapServer.port;
  imapAccount.incomingServer.password = "password";
  imapAccount.incomingServer.prettyName = "IMAP Account";
  imapRootFolder = imapAccount.incomingServer.rootFolder;

  imapAccount.incomingServer.performExpand(null);
  await TestUtils.waitForCondition(
    () =>
      imapRootFolder.numSubFolders == 5 &&
      imapRootFolder.getChildNamed("third").numSubFolders == 1,
    "waiting for IMAP folders to sync"
  );
  imapRootFolder.getChildNamed("third").clearFlag(Ci.nsMsgFolderFlags.Offline);
  imapRootFolder
    .getChildNamed("third")
    .getChildNamed("fourth")
    .clearFlag(Ci.nsMsgFolderFlags.Offline);

  // Set up EWS account.

  ewsAccount = MailServices.accounts.createAccount();
  ewsAccount.addIdentity(MailServices.accounts.createIdentity());
  ewsAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "localhost",
    "ews"
  );
  ewsAccount.incomingServer.setStringValue(
    "ews_url",
    `http://localhost:${ewsServer.port}/EWS/Exchange.asmx`
  );
  ewsAccount.incomingServer.prettyName = "EWS Account";
  ewsAccount.incomingServer.username = "user";
  ewsAccount.incomingServer.password = "password";
  ewsRootFolder = ewsAccount.incomingServer.rootFolder;

  ewsAccount.incomingServer.performExpand(null);
  await TestUtils.waitForCondition(
    () =>
      ewsRootFolder.numSubFolders == 4 &&
      ewsRootFolder.getChildNamed("third").numSubFolders == 1,
    "waiting for EWS folders to sync"
  );
  ewsRootFolder.getChildNamed("Inbox").setFlag(Ci.nsMsgFolderFlags.Offline);
  ewsRootFolder.getChildNamed("first").setFlag(Ci.nsMsgFolderFlags.Offline);
  ewsRootFolder.getChildNamed("second").setFlag(Ci.nsMsgFolderFlags.Offline);

  registerCleanupFunction(async () => {
    MailServices.accounts.removeAccount(nntpAccount, false);
    MailServices.accounts.removeAccount(imapAccount, false);
    MailServices.accounts.removeAccount(ewsAccount, false);
    tabmail.closeOtherTabs(0);
  });
});

/**
 * Test the account settings for a Local Folders account. The offline section
 * should not be visible.
 */
add_task(async function testLocalFolders() {
  const accountsTab = await openAccountSettings();
  const accountRowIndex = get_account_tree_row(
    "account1",
    "am-offline.xhtml",
    accountsTab
  );
  Assert.notEqual(accountRowIndex, -1);
  const accountRow =
    accountsTab.browser.contentDocument.getElementById("accounttree").rows[
      accountRowIndex
    ];
  Assert.equal(accountRow.textContent, "Disk Space");

  await click_account_tree_row(accountsTab, accountRowIndex);

  const { contentDocument } =
    accountsTab.browser.contentDocument.getElementById("contentFrame");
  const offlineSection = contentDocument.getElementById("offline.titlebox");
  const diskSpaceSection = contentDocument.getElementById("diskspace.titlebox");
  Assert.ok(
    BrowserTestUtils.isHidden(offlineSection),
    "offline section should be hidden for Local Folders"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(diskSpaceSection),
    "diskSpace section should be visible for Local Folders"
  );

  tabmail.closeTab(accountsTab);
});

/**
 * Test the account settings for a POP3 account. The offline section should
 * not be visible.
 */
add_task(async function testPOP3() {
  const accountsTab = await openAccountSettings();
  const accountRowIndex = get_account_tree_row(
    "account2",
    "am-offline.xhtml",
    accountsTab
  );
  Assert.notEqual(accountRowIndex, -1);
  const accountRow =
    accountsTab.browser.contentDocument.getElementById("accounttree").rows[
      accountRowIndex
    ];
  Assert.equal(accountRow.textContent, "Disk Space");

  await click_account_tree_row(accountsTab, accountRowIndex);

  const { contentDocument } =
    accountsTab.browser.contentDocument.getElementById("contentFrame");
  const offlineSection = contentDocument.getElementById("offline.titlebox");
  const diskSpaceSection = contentDocument.getElementById("diskspace.titlebox");
  Assert.ok(
    BrowserTestUtils.isHidden(offlineSection),
    "offline section should be hidden for POP3 accounts"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(diskSpaceSection),
    "diskSpace section should be visible for POP3 accounts"
  );

  tabmail.closeTab(accountsTab);
});

/**
 * Test the account settings for an NNTP account.
 */
add_task(async function testNNTP() {
  const accountsTab = await openAccountSettings();
  const accountRowIndex = get_account_tree_row(
    nntpAccount.key,
    "am-offline.xhtml",
    accountsTab
  );
  Assert.notEqual(accountRowIndex, -1);
  const accountRow =
    accountsTab.browser.contentDocument.getElementById("accounttree").rows[
      accountRowIndex
    ];
  Assert.equal(accountRow.textContent, "Synchronization & Storage");

  await click_account_tree_row(accountsTab, accountRowIndex);

  const { contentWindow, contentDocument } =
    accountsTab.browser.contentDocument.getElementById("contentFrame");
  const offlineSection = contentDocument.getElementById("offline.titlebox");
  const diskSpaceSection = contentDocument.getElementById("diskspace.titlebox");
  const selectFoldersButton = contentDocument.getElementById(
    "selectImapFoldersButton"
  );
  const selectNewsgroupsButton = contentDocument.getElementById(
    "selectNewsgroupsButton"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(offlineSection),
    "offline section should be visible for NNTP accounts"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(diskSpaceSection),
    "diskSpace section should be visible for NNTP accounts"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(selectFoldersButton),
    "select folders button should be hidden for NNTP accounts"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(selectNewsgroupsButton),
    "select folders button should be visible for NNTP accounts"
  );

  Assert.deepEqual(
    Array.from(
      nntpRootFolder.getFoldersWithFlags(Ci.nsMsgFolderFlags.Offline),
      folder => folder.localizedName
    ),
    ["offline.first", "offline.second"]
  );

  const dialogPromise = BrowserTestUtils.promiseAlertDialogOpen(
    undefined,
    "chrome://messenger/content/msgSelectOfflineFolders.xhtml",
    {
      isSubDialog: true,
      async callback(win) {
        await SimpleTest.promiseFocus(win);

        const doc = win.document;
        const tree = doc.getElementById("synchronizeTree");
        const acceptButton = doc.querySelector("dialog").getButton("accept");

        // Check the initial state.
        Assert.equal(tree.view.rowCount, 4);

        Assert.equal(tree.view.getCellText(0, "name"), "offline.first");
        Assert.equal(tree.view.getCellText(1, "name"), "offline.second");
        Assert.equal(tree.view.getCellText(2, "name"), "offline.third");
        Assert.equal(tree.view.getCellText(3, "name"), "offline.third.fourth");

        // Check the initial selection.
        const isSelected = index =>
          tree.view.rowAt(index).hasProperty("folderSelected");
        Assert.ok(isSelected(0));
        Assert.ok(isSelected(1));
        Assert.ok(!isSelected(2));
        Assert.ok(!isSelected(3));

        // Change the selection by clicking on a check box.
        await BrowserTestUtils.waitForMutationCondition(
          tree.table.body,
          { subtree: true, childList: true },
          () => tree.table.body.rows[0].querySelector('input[type="checkbox"]')
        );
        EventUtils.synthesizeMouseAtCenter(
          tree.table.body.rows[0].querySelector('input[type="checkbox"]'),
          {},
          win
        );

        // Change the selection by selecting some rows and pressing space.
        tree.view.selection.rangedSelect(2, 3, false);
        tree.focus();
        EventUtils.synthesizeKey(" ", {}, win);

        // Check the changed selection.
        Assert.ok(!isSelected(0));
        Assert.ok(isSelected(1));
        Assert.ok(isSelected(2));
        Assert.ok(isSelected(3));

        acceptButton.click();
      },
    }
  );
  EventUtils.synthesizeMouseAtCenter(selectNewsgroupsButton, {}, contentWindow);
  await dialogPromise;

  Assert.deepEqual(
    Array.from(
      nntpRootFolder.getFoldersWithFlags(Ci.nsMsgFolderFlags.Offline),
      folder => folder.localizedName
    ),
    ["offline.second", "offline.third", "offline.third.fourth"]
  );

  tabmail.closeTab(accountsTab);
});

/**
 * Test the account settings for an IMAP account.
 */
add_task(async function testIMAP() {
  const accountsTab = await openAccountSettings();
  const accountRowIndex = get_account_tree_row(
    imapAccount.key,
    "am-offline.xhtml",
    accountsTab
  );
  Assert.notEqual(accountRowIndex, -1);
  const accountRow =
    accountsTab.browser.contentDocument.getElementById("accounttree").rows[
      accountRowIndex
    ];
  Assert.equal(accountRow.textContent, "Synchronization & Storage");

  await click_account_tree_row(accountsTab, accountRowIndex);

  const { contentWindow, contentDocument } =
    accountsTab.browser.contentDocument.getElementById("contentFrame");
  const offlineSection = contentDocument.getElementById("offline.titlebox");
  const diskSpaceSection = contentDocument.getElementById("diskspace.titlebox");
  const selectFoldersButton = contentDocument.getElementById(
    "selectImapFoldersButton"
  );
  const selectNewsgroupsButton = contentDocument.getElementById(
    "selectNewsgroupsButton"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(offlineSection),
    "offline section should be visible for IMAP accounts"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(diskSpaceSection),
    "diskSpace section should be visible for IMAP accounts"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(selectFoldersButton),
    "select folders button should be visible for IMAP accounts"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(selectNewsgroupsButton),
    "select folders button should be hidden for IMAP accounts"
  );

  Assert.deepEqual(
    Array.from(
      imapRootFolder.getFoldersWithFlags(Ci.nsMsgFolderFlags.Offline),
      folder => folder.localizedName
    ),
    ["Inbox", "first", "second"]
  );

  const dialogPromise = BrowserTestUtils.promiseAlertDialogOpen(
    undefined,
    "chrome://messenger/content/msgSelectOfflineFolders.xhtml",
    {
      isSubDialog: true,
      async callback(win) {
        await SimpleTest.promiseFocus(win);

        const doc = win.document;
        const tree = doc.getElementById("synchronizeTree");
        const acceptButton = doc.querySelector("dialog").getButton("accept");

        // Check the initial state.
        Assert.ok(
          !tree.view.isContainerOpen(4),
          "unselected folder should not be open"
        );
        tree.view.toggleOpenState(4); // Open "third" folder.
        Assert.equal(tree.view.rowCount, 6);

        Assert.equal(tree.view.getCellText(0, "name"), "Inbox");
        Assert.equal(tree.view.getCellText(1, "name"), "Trash");
        Assert.equal(tree.view.getCellText(2, "name"), "first");
        Assert.equal(tree.view.getCellText(3, "name"), "second");
        Assert.equal(tree.view.getCellText(4, "name"), "third");
        Assert.equal(tree.view.getCellText(5, "name"), "fourth");

        // Check the initial selection.
        const isSelected = index =>
          tree.view.rowAt(index).hasProperty("folderSelected");
        Assert.ok(isSelected(0));
        Assert.ok(!isSelected(1));
        Assert.ok(isSelected(2));
        Assert.ok(isSelected(3));
        Assert.ok(!isSelected(4));
        Assert.ok(!isSelected(5));

        // Change the selection by clicking on a check box.
        await BrowserTestUtils.waitForMutationCondition(
          tree.table.body,
          { subtree: true, childList: true },
          () => tree.table.body.rows[2].querySelector('input[type="checkbox"]')
        );
        EventUtils.synthesizeMouseAtCenter(
          tree.table.body.rows[2].querySelector('input[type="checkbox"]'),
          {},
          win
        );

        // Change the selection by selecting some rows and pressing space.
        tree.view.selection.rangedSelect(4, 5, false);
        tree.focus();
        EventUtils.synthesizeKey(" ", {}, win);

        // Check the changed selection.
        Assert.ok(isSelected(0));
        Assert.ok(!isSelected(1));
        Assert.ok(!isSelected(2));
        Assert.ok(isSelected(3));
        Assert.ok(isSelected(4));
        Assert.ok(isSelected(5));

        acceptButton.click();
      },
    }
  );
  EventUtils.synthesizeMouseAtCenter(selectFoldersButton, {}, contentWindow);
  await dialogPromise;

  Assert.deepEqual(
    Array.from(
      imapRootFolder.getFoldersWithFlags(Ci.nsMsgFolderFlags.Offline),
      folder => folder.localizedName
    ),
    ["Inbox", "second", "third", "fourth"]
  );

  tabmail.closeTab(accountsTab);
});

/**
 * Test the account settings for an EWS account.
 */
add_task(async function testEWS() {
  const accountsTab = await openAccountSettings();
  const accountRowIndex = get_account_tree_row(
    ewsAccount.key,
    "am-offline.xhtml",
    accountsTab
  );
  Assert.notEqual(accountRowIndex, -1);
  const accountRow =
    accountsTab.browser.contentDocument.getElementById("accounttree").rows[
      accountRowIndex
    ];
  Assert.equal(accountRow.textContent, "Synchronization & Storage");

  await click_account_tree_row(accountsTab, accountRowIndex);

  const { contentWindow, contentDocument } =
    accountsTab.browser.contentDocument.getElementById("contentFrame");
  const offlineSection = contentDocument.getElementById("offline.titlebox");
  const diskSpaceSection = contentDocument.getElementById("diskspace.titlebox");
  const selectFoldersButton = contentDocument.getElementById(
    "selectImapFoldersButton"
  );
  const selectNewsgroupsButton = contentDocument.getElementById(
    "selectNewsgroupsButton"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(offlineSection),
    "offline section should be visible for EWS accounts"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(diskSpaceSection),
    "diskSpace section should be visible for EWS accounts"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(selectFoldersButton),
    "select folders button should be visible for EWS accounts"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(selectNewsgroupsButton),
    "select folders button should be hidden for EWS accounts"
  );

  Assert.deepEqual(
    Array.from(
      ewsRootFolder.getFoldersWithFlags(Ci.nsMsgFolderFlags.Offline),
      folder => folder.localizedName
    ),
    ["Inbox", "first", "second"]
  );

  const dialogPromise = BrowserTestUtils.promiseAlertDialogOpen(
    undefined,
    "chrome://messenger/content/msgSelectOfflineFolders.xhtml",
    {
      isSubDialog: true,
      async callback(win) {
        await SimpleTest.promiseFocus(win);

        const doc = win.document;
        const tree = doc.getElementById("synchronizeTree");
        const acceptButton = doc.querySelector("dialog").getButton("accept");

        // Check the initial state.
        Assert.equal(tree.view.rowCount, 4);
        Assert.ok(
          !tree.view.isContainerOpen(3),
          "unselected folder should not be open"
        );
        tree.view.toggleOpenState(3); // Open "third" folder.
        Assert.equal(tree.view.rowCount, 5);

        Assert.equal(tree.view.getCellText(0, "name"), "Inbox");
        Assert.equal(tree.view.getCellText(1, "name"), "first");
        Assert.equal(tree.view.getCellText(2, "name"), "second");
        Assert.equal(tree.view.getCellText(3, "name"), "third");
        Assert.equal(tree.view.getCellText(4, "name"), "fourth");

        // Check the initial selection.
        const isSelected = index =>
          tree.view.rowAt(index).hasProperty("folderSelected");
        Assert.ok(isSelected(0));
        Assert.ok(isSelected(1));
        Assert.ok(isSelected(2));
        Assert.ok(!isSelected(3));
        Assert.ok(!isSelected(4));

        // Change the selection by clicking on a check box.
        await BrowserTestUtils.waitForMutationCondition(
          tree.table.body,
          { subtree: true, childList: true },
          () => tree.table.body.rows[1].querySelector('input[type="checkbox"]')
        );
        EventUtils.synthesizeMouseAtCenter(
          tree.table.body.rows[1].querySelector('input[type="checkbox"]'),
          {},
          win
        );

        // Change the selection by selecting some rows and pressing space.
        tree.view.selection.rangedSelect(3, 4, false);
        tree.focus();
        EventUtils.synthesizeKey(" ", {}, win);

        // Check the changed selection.
        Assert.ok(isSelected(0));
        Assert.ok(!isSelected(1));
        Assert.ok(isSelected(2));
        Assert.ok(isSelected(3));
        Assert.ok(isSelected(4));

        acceptButton.click();
      },
    }
  );
  EventUtils.synthesizeMouseAtCenter(selectFoldersButton, {}, contentWindow);
  await dialogPromise;

  Assert.deepEqual(
    Array.from(
      ewsRootFolder.getFoldersWithFlags(Ci.nsMsgFolderFlags.Offline),
      folder => folder.localizedName
    ),
    ["Inbox", "second", "third", "fourth"]
  );

  tabmail.closeTab(accountsTab);
});
