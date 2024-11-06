/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { IMAPServer } = ChromeUtils.importESModule(
  "resource://testing-common/IMAPServer.sys.mjs"
);
const { NNTPServer } = ChromeUtils.importESModule(
  "resource://testing-common/NNTPServer.sys.mjs"
);

let imapServer, nntpServer;

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
const context = about3Pane.document.getElementById("folderPaneContext");
const { folderPane, folderTree } = about3Pane;
let imapRootFolder;
let nntpRootFolder;

add_setup(async function () {
  const imapAccount = MailServices.accounts.createAccount();
  imapServer = new IMAPServer({ username: `${imapAccount.key}user` });
  imapServer.daemon.createMailbox("Bar", { subscribed: false });
  imapServer.daemon.createMailbox("Baz", { subscribed: true });
  imapServer.daemon.createMailbox("Foo", { subscribed: false });
  imapServer.daemon.createMailbox("Foo/Subfoo", { subscribed: false });
  imapServer.daemon.getMailbox("INBOX").specialUseFlag = "\\Inbox";
  imapServer.daemon.getMailbox("INBOX").subscribed = true;

  imapAccount.addIdentity(MailServices.accounts.createIdentity());
  imapAccount.incomingServer = MailServices.accounts.createIncomingServer(
    `${imapAccount.key}user`,
    "localhost",
    "imap"
  );
  imapAccount.incomingServer.port = imapServer.port;
  imapAccount.incomingServer.password = "password";
  imapAccount.incomingServer.deleteModel = Ci.nsMsgImapDeleteModels.IMAPDelete;
  imapRootFolder = imapAccount.incomingServer.rootFolder;

  nntpServer = new NNTPServer();
  nntpServer.addGroup("subscribe.bar");
  nntpServer.addGroup("subscribe.baz");
  nntpServer.addGroup("subscribe.baz.subbaz");
  nntpServer.addGroup("subscribe.foo");

  const nntpAccount = MailServices.accounts.createAccount();
  nntpAccount.incomingServer = MailServices.accounts.createIncomingServer(
    `${nntpAccount.key}user`,
    "localhost",
    "nntp"
  );
  nntpAccount.incomingServer.port = nntpServer.port;
  nntpRootFolder = nntpAccount.incomingServer.rootFolder;

  registerCleanupFunction(async function () {
    await promiseServerIdle(imapAccount.incomingServer);
    MailServices.accounts.removeAccount(imapAccount, false);
    MailServices.accounts.removeAccount(nntpAccount, false);
  });
});

add_task(async function testIMAPSubscribe() {
  // Ensure we've got the currently subscribed folders.

  const imapRootRow = folderPane.getRowForFolder(imapRootFolder);
  folderTree.collapseRow(imapRootRow);
  folderTree.expandRow(imapRootRow);
  await TestUtils.waitForCondition(
    () => imapRootRow.childList.childElementCount == 2,
    "waiting for folder tree to update"
  );

  Assert.ok(!imapServer.daemon.getMailbox("Bar").subscribed);
  Assert.ok(imapServer.daemon.getMailbox("Baz").subscribed);
  Assert.ok(!imapServer.daemon.getMailbox("Foo").subscribed);
  Assert.ok(!imapServer.daemon.getMailbox("Foo/Subfoo").subscribed);
  Assert.ok(imapServer.daemon.getMailbox("INBOX").subscribed);

  Assert.ok(!folderPane.getRowForFolder(`${imapRootFolder.URI}/Bar`));
  Assert.ok(folderPane.getRowForFolder(`${imapRootFolder.URI}/Baz`));
  Assert.ok(!folderPane.getRowForFolder(`${imapRootFolder.URI}/Foo`));
  Assert.ok(!folderPane.getRowForFolder(`${imapRootFolder.URI}/Foo/Subfoo`));
  Assert.ok(folderPane.getRowForFolder(`${imapRootFolder.URI}/INBOX`));

  // Open the subscribe dialog and change our subscriptions.

  const dialogPromise = BrowserTestUtils.promiseAlertDialog(
    undefined,
    "chrome://messenger/content/subscribe.xhtml",
    {
      async callback(win) {
        await SimpleTest.promiseFocus(win);

        const doc = win.document;
        const serverMenu = doc.getElementById("serverMenu");
        const tabs = doc.getElementById("subscribeTabs");
        const nameContainer = doc.getElementById("nameContainer");
        const subscribeTree = doc.getElementById("subscribeTree");
        const view = subscribeTree.view;
        const newGroupsTab = doc.getElementById("newGroupsTab");
        const acceptButton = doc.querySelector("dialog").getButton("accept");

        await TestUtils.waitForCondition(
          () => view.rowCount == 5,
          "waiting for tree view to be populated"
        );

        await TestUtils.waitForCondition(
          () => subscribeTree.clientHeight / subscribeTree.rowHeight > 5,
          `waiting for tree view to be resized, ` +
            `subscribeTree.clientHeight=${subscribeTree.clientHeight}, ` +
            `subscribeTree.rowHeight=${subscribeTree.rowHeight}`
        );

        Assert.equal(serverMenu.value, imapRootFolder.URI);
        Assert.ok(
          BrowserTestUtils.isHidden(nameContainer),
          "search row should be hidden for IMAP"
        );
        Assert.equal(tabs.selectedIndex, 0);
        Assert.ok(newGroupsTab.collapsed);

        checkTreeRow(subscribeTree, 0, {
          level: 0,
          name: "Bar",
          subscribable: true,
          subscribed: false,
        });
        checkTreeRow(subscribeTree, 1, {
          level: 0,
          name: "Baz",
          subscribable: true,
          subscribed: true,
        });
        checkTreeRow(subscribeTree, 2, {
          level: 0,
          name: "Foo",
          subscribable: true,
          subscribed: false,
        });
        checkTreeRow(subscribeTree, 3, {
          level: 1,
          name: "Subfoo",
          subscribable: true,
          subscribed: false,
        });
        checkTreeRow(subscribeTree, 4, {
          level: 0,
          name: "INBOX",
          subscribable: true,
          subscribed: true,
        });

        clickTreeRow(subscribeTree, 1);
        clickTreeRow(subscribeTree, 2);
        clickTreeRow(subscribeTree, 3);

        checkTreeRow(subscribeTree, 1, {
          subscribable: true,
          subscribed: false,
        });
        checkTreeRow(subscribeTree, 2, {
          subscribable: true,
          subscribed: true,
        });
        checkTreeRow(subscribeTree, 3, {
          subscribable: true,
          subscribed: true,
        });

        acceptButton.click();
      },
    }
  );
  leftClickOn(imapRootFolder);
  await rightClickAndActivate(imapRootFolder, "folderPaneContext-subscribe");
  await dialogPromise;

  // Check our subscriptions changed.

  await TestUtils.waitForCondition(
    () =>
      !folderPane.getRowForFolder(`${imapRootFolder.URI}/Baz`) &&
      folderPane.getRowForFolder(`${imapRootFolder.URI}/Foo`) &&
      folderPane.getRowForFolder(`${imapRootFolder.URI}/Foo/Subfoo`),
    "waiting for folder tree to update"
  );

  Assert.ok(!imapServer.daemon.getMailbox("Bar").subscribed);
  Assert.ok(!imapServer.daemon.getMailbox("Baz").subscribed);
  Assert.ok(imapServer.daemon.getMailbox("Foo").subscribed);
  Assert.ok(imapServer.daemon.getMailbox("Foo/Subfoo").subscribed);
  Assert.ok(imapServer.daemon.getMailbox("INBOX").subscribed);

  Assert.ok(!folderPane.getRowForFolder(`${imapRootFolder.URI}/Bar`));
  Assert.ok(!folderPane.getRowForFolder(`${imapRootFolder.URI}/Baz`));
  Assert.ok(folderPane.getRowForFolder(`${imapRootFolder.URI}/Foo`));
  Assert.ok(folderPane.getRowForFolder(`${imapRootFolder.URI}/Foo/Subfoo`));
  Assert.ok(folderPane.getRowForFolder(`${imapRootFolder.URI}/INBOX`));
});

add_task(async function testNNTPSubscribe() {
  // Ensure we have no subscribed folders.

  const nntpRootRow = folderPane.getRowForFolder(nntpRootFolder);
  Assert.equal(nntpRootRow.childList.childElementCount, 0);

  // Open the subscribe dialog and subscribe to some newsgroups.

  let dialogPromise = BrowserTestUtils.promiseAlertDialog(
    undefined,
    "chrome://messenger/content/subscribe.xhtml",
    {
      async callback(win) {
        await SimpleTest.promiseFocus(win);

        const doc = win.document;
        const serverMenu = doc.getElementById("serverMenu");
        const tabs = doc.getElementById("subscribeTabs");
        const subscribeTree = doc.getElementById("subscribeTree");
        const view = subscribeTree.view;
        const newGroupsTab = doc.getElementById("newGroupsTab");
        const acceptButton = doc.querySelector("dialog").getButton("accept");

        await TestUtils.waitForCondition(
          () => view.rowCount == 5,
          "waiting for tree view to be populated"
        );

        await TestUtils.waitForCondition(
          () => subscribeTree.clientHeight / subscribeTree.rowHeight > 3,
          `waiting for tree view to be resized, ` +
            `subscribeTree.clientHeight=${subscribeTree.clientHeight}, ` +
            `subscribeTree.rowHeight=${subscribeTree.rowHeight}`
        );

        Assert.equal(serverMenu.value, nntpRootFolder.URI);
        Assert.equal(tabs.selectedIndex, 0);
        Assert.ok(!newGroupsTab.collapsed);

        checkTreeRow(subscribeTree, 0, {
          level: 0,
          name: "subscribe",
          subscribable: false,
          subscribed: false,
        });
        checkTreeRow(subscribeTree, 1, {
          level: 1,
          name: "subscribe.bar",
          subscribable: true,
          subscribed: false,
        });
        checkTreeRow(subscribeTree, 2, {
          level: 1,
          name: "subscribe.baz",
          subscribable: true,
          subscribed: false,
        });
        checkTreeRow(subscribeTree, 3, {
          level: 2,
          name: "subscribe.baz.subbaz",
          subscribable: true,
          subscribed: false,
        });
        checkTreeRow(subscribeTree, 4, {
          level: 1,
          name: "subscribe.foo",
          subscribable: true,
          subscribed: false,
        });

        clickTreeRow(subscribeTree, 1);
        clickTreeRow(subscribeTree, 2);
        clickTreeRow(subscribeTree, 3);

        checkTreeRow(subscribeTree, 1, {
          subscribable: true,
          subscribed: true,
        });
        checkTreeRow(subscribeTree, 2, {
          subscribable: true,
          subscribed: true,
        });
        checkTreeRow(subscribeTree, 3, {
          subscribable: true,
          subscribed: true,
        });

        acceptButton.click();
      },
    }
  );
  leftClickOn(nntpRootFolder);
  await rightClickAndActivate(nntpRootFolder, "folderPaneContext-subscribe");
  await dialogPromise;

  // Check our subscriptions changed.

  await TestUtils.waitForCondition(
    () => nntpRootRow.querySelectorAll("li").length == 3,
    "waiting for folder tree to update"
  );

  Assert.ok(folderPane.getRowForFolder(`${nntpRootFolder.URI}/subscribe.bar`));
  Assert.ok(folderPane.getRowForFolder(`${nntpRootFolder.URI}/subscribe.baz`));
  Assert.ok(
    folderPane.getRowForFolder(`${nntpRootFolder.URI}/subscribe.baz.subbaz`)
  );
  Assert.ok(!folderPane.getRowForFolder(`${nntpRootFolder.URI}/subscribe.foo`));

  // Open the subscribe dialog again and change our subscriptions.

  dialogPromise = BrowserTestUtils.promiseAlertDialog(
    undefined,
    "chrome://messenger/content/subscribe.xhtml",
    {
      async callback(win) {
        await SimpleTest.promiseFocus(win);

        const doc = win.document;
        const serverMenu = doc.getElementById("serverMenu");
        const searchField = doc.getElementById("namefield");
        const tabs = doc.getElementById("subscribeTabs");
        const subscribeTree = doc.getElementById("subscribeTree");
        const view = subscribeTree.view;
        const searchTree = doc.getElementById("searchTree");
        const newGroupsTab = doc.getElementById("newGroupsTab");
        const acceptButton = doc.querySelector("dialog").getButton("accept");

        await TestUtils.waitForCondition(
          () => view.rowCount == 5,
          "waiting for tree view to be populated"
        );

        await TestUtils.waitForCondition(
          () => subscribeTree.clientHeight / subscribeTree.rowHeight > 3,
          `waiting for tree view to be resized, ` +
            `subscribeTree.clientHeight=${subscribeTree.clientHeight}, ` +
            `subscribeTree.rowHeight=${subscribeTree.rowHeight}`
        );

        Assert.equal(serverMenu.value, nntpRootFolder.URI);
        Assert.equal(tabs.selectedIndex, 0);
        Assert.ok(!newGroupsTab.collapsed);

        Assert.ok(BrowserTestUtils.isVisible(subscribeTree));
        Assert.ok(BrowserTestUtils.isHidden(searchTree));
        checkTreeRow(subscribeTree, 0, {
          level: 0,
          name: "subscribe",
          subscribable: false,
          subscribed: false,
        });
        checkTreeRow(subscribeTree, 1, {
          level: 1,
          name: "subscribe.bar",
          subscribable: true,
          subscribed: true,
        });
        checkTreeRow(subscribeTree, 2, {
          level: 1,
          name: "subscribe.baz",
          subscribable: true,
          subscribed: true,
        });
        checkTreeRow(subscribeTree, 3, {
          level: 2,
          name: "subscribe.baz.subbaz",
          subscribable: true,
          subscribed: true,
        });
        checkTreeRow(subscribeTree, 4, {
          level: 1,
          name: "subscribe.foo",
          subscribable: true,
          subscribed: false,
        });

        // Test the search field correctly filters the available newsgroups.

        EventUtils.synthesizeMouseAtCenter(searchField, {}, win);
        EventUtils.sendString("foo", win);
        EventUtils.synthesizeKey("VK_RETURN", {}, win);

        await TestUtils.waitForCondition(
          () => searchTree.view.rowCount == 1,
          "waiting for tree view to be populated with search"
        );
        Assert.ok(BrowserTestUtils.isHidden(subscribeTree));
        Assert.ok(BrowserTestUtils.isVisible(searchTree));

        checkTreeRow(searchTree, 0, {
          name: "subscribe.foo",
          subscribable: true,
          subscribed: false,
        });

        // Clear the search field.

        EventUtils.synthesizeKey("VK_ESCAPE", {}, win);

        await TestUtils.waitForCondition(
          () => view.rowCount == 5,
          "waiting for tree view to be populated without search"
        );
        Assert.ok(BrowserTestUtils.isVisible(subscribeTree));
        Assert.ok(BrowserTestUtils.isHidden(searchTree));

        clickTreeRow(subscribeTree, 1);

        checkTreeRow(subscribeTree, 1, {
          subscribable: true,
          subscribed: false,
        });
        checkTreeRow(subscribeTree, 2, {
          subscribable: true,
          subscribed: true,
        });
        checkTreeRow(subscribeTree, 3, {
          subscribable: true,
          subscribed: true,
        });

        acceptButton.click();
      },
    }
  );
  leftClickOn(nntpRootFolder);
  await rightClickAndActivate(nntpRootFolder, "folderPaneContext-subscribe");
  await dialogPromise;

  // Check our subscriptions changed.

  await TestUtils.waitForCondition(
    () => nntpRootRow.querySelectorAll("li").length == 2,
    "waiting for folder tree to update"
  );

  Assert.ok(!folderPane.getRowForFolder(`${nntpRootFolder.URI}/subscribe.bar`));
  Assert.ok(folderPane.getRowForFolder(`${nntpRootFolder.URI}/subscribe.baz`));
  Assert.ok(
    folderPane.getRowForFolder(`${nntpRootFolder.URI}/subscribe.baz.subbaz`)
  );
  Assert.ok(!folderPane.getRowForFolder(`${nntpRootFolder.URI}/subscribe.foo`));
});

/**
 * @param {nsIMsgFolder} folder
 */
function leftClickOn(folder) {
  EventUtils.synthesizeMouseAtCenter(
    folderPane.getRowForFolder(folder).querySelector(".name"),
    {},
    about3Pane
  );
}

/**
 * @param {nsIMsgFolder} folder
 * @param {string} idToActivate
 * @param {object} activateOptions - see ActivateMenuItemOptions
 */
async function rightClickAndActivate(folder, idToActivate, activateOptions) {
  EventUtils.synthesizeMouseAtCenter(
    folderPane.getRowForFolder(folder).querySelector(".name"),
    { type: "contextmenu" },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(context, "shown");
  context.activateItem(
    about3Pane.document.getElementById(idToActivate),
    activateOptions
  );
  await BrowserTestUtils.waitForPopupEvent(context, "hidden");
}

/**
 * @param {XULTreeElement} tree
 * @param {integer} index
 * @param {object} expected
 * @param {integer} [expected.level]
 * @param {string} [expected.name]
 * @param {boolean} expected.subscribable
 * @param {boolean} expected.subscribed
 */
function checkTreeRow(tree, index, expected) {
  const nameColumn = tree.columns.getFirstColumn();
  const nameCellText = tree.view.getCellText(index, nameColumn);
  const subscribedColumn = tree.columns.getLastColumn();
  const properties = tree.view
    .getCellProperties(index, subscribedColumn)
    .split(" ");
  if (expected.level !== undefined) {
    Assert.equal(tree.view.getLevel(index), expected.level, "Expected levels");
  }
  if (expected.name !== undefined) {
    Assert.equal(
      tree.view.getCellText(index, nameColumn),
      expected.name,
      "Expected Name"
    );
  }
  if (expected.subscribable) {
    // Properties usually has "subscribable-true", but sometimes it doesn't.
    Assert.ok(
      !properties.includes("subscribable-false"),
      `should not include subscribable-false for ${nameCellText}`
    );
  } else {
    Assert.ok(
      !properties.includes("subscribable-true"),
      `should not include subscribable-true for ${nameCellText}`
    );
    Assert.ok(
      properties.includes("subscribable-false"),
      `should include subscribable-false for ${nameCellText}`
    );
  }
  if (expected.subscribed) {
    Assert.ok(
      properties.includes("subscribed-true"),
      `should include subscribed-true for ${nameCellText}`
    );
    Assert.ok(
      !properties.includes("subscribed-false"),
      `should not include subscribed-false for ${nameCellText}`
    );
  } else {
    Assert.ok(
      !properties.includes("subscribed-true"),
      `should not include subscribed-true for ${nameCellText}`
    );
    // Properties usually has "subscribed-false", but sometimes it doesn't.
  }
}

/**
 * Toggle the subscribed state of the given row.
 *
 * @param {XULTreeElement} tree
 * @param {integer} index
 */
function clickTreeRow(tree, index) {
  tree.scrollToRow(index);

  const treeChildren = tree.lastElementChild;
  const coords = tree.getCoordsForCellItem(
    index,
    tree.columns.subscribedColumn,
    "cell"
  );

  EventUtils.synthesizeMouse(
    treeChildren,
    coords.x + coords.width / 2,
    coords.y + coords.height / 2,
    {},
    tree.ownerGlobal
  );
}
