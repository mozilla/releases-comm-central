/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let gAccount, gFolders, gMessage, gExpectedAttachments;

const { mailTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MailTestUtils.sys.mjs"
);

const URL_BASE =
  "http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data";

var tabmail = document.getElementById("tabmail");
var about3Pane = tabmail.currentAbout3Pane;
var messagePane =
  about3Pane.messageBrowser.contentWindow.getMessagePaneBrowser();

/**
 * Right-click on something and wait for the context menu to appear.
 * For elements in the parent process only.
 *
 * @param {Element} menu - The <menu> that should appear.
 * @param {Element} element - The element to be clicked on.
 * @returns {Promise} A promise that resolves when the menu appears.
 */
function rightClick(menu, element, win) {
  const shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(element, { type: "contextmenu" }, win);
  return shownPromise;
}

/**
 * Check the parameters of a browser.onShown event was fired.
 *
 * @see mail/components/extensions/schemas/menus.json
 *
 * @param extension
 * @param {object} expectedInfo
 * @param {Array} expectedInfo.menuIds
 * @param {Array} expectedInfo.contexts
 * @param {Array?} expectedInfo.attachments
 * @param {object} expectedTab
 * @param {boolean} expectedTab.active
 * @param {integer} expectedTab.index
 * @param {boolean} expectedTab.mailTab
 */
async function checkShownEvent(extension, expectedInfo, expectedTab) {
  const [info, tab] = await extension.awaitMessage("onShown");
  Assert.deepEqual(info.menuIds, expectedInfo.menuIds);
  Assert.deepEqual(info.contexts, expectedInfo.contexts);

  Assert.equal(
    !!info.attachments,
    !!expectedInfo.attachments,
    "attachments in info"
  );
  if (expectedInfo.attachments) {
    for (let i = 0; i < expectedInfo.attachments.length; i++) {
      Assert.equal(info.attachments[i].name, expectedInfo.attachments[i].name);
      Assert.equal(info.attachments[i].size, expectedInfo.attachments[i].size);
      Assert.equal(
        info.attachments[i].partName,
        expectedInfo.attachments[i].partName
      );
      Assert.equal(
        info.attachments[i].contentType,
        expectedInfo.attachments[i].contentType
      );
    }
  }

  Assert.equal(tab.active, expectedTab.active, "tab is active");
  Assert.equal(tab.index, expectedTab.index, "tab index");
  Assert.equal(tab.mailTab, expectedTab.mailTab, "tab is mailTab");
}

/**
 * Check the parameters of a browser.onClicked event was fired.
 *
 * @see mail/components/extensions/schemas/menus.json
 *
 * @param extension
 * @param {object} expectedInfo
 * @param {string?} expectedInfo.menuItemId
 * @param {Array?} expectedInfo.attachments
 * @param {object} expectedTab
 * @param {boolean} expectedTab.active
 * @param {integer} expectedTab.index
 * @param {boolean} expectedTab.mailTab
 */
async function checkClickedEvent(extension, expectedInfo, expectedTab) {
  const [info, tab] = await extension.awaitMessage("onClicked");

  Assert.equal(
    !!info.attachments,
    !!expectedInfo.attachments,
    "attachments in info"
  );
  if (expectedInfo.attachments) {
    for (let i = 0; i < expectedInfo.attachments.length; i++) {
      Assert.equal(info.attachments[i].name, expectedInfo.attachments[i].name);
      Assert.equal(info.attachments[i].size, expectedInfo.attachments[i].size);
      Assert.equal(
        info.attachments[i].partName,
        expectedInfo.attachments[i].partName
      );
      Assert.equal(
        info.attachments[i].contentType,
        expectedInfo.attachments[i].contentType
      );
    }
  }

  if (expectedInfo.menuItemId) {
    Assert.equal(info.menuItemId, expectedInfo.menuItemId, "menuItemId");
  }

  Assert.equal(tab.active, expectedTab.active, "tab is active");
  Assert.equal(tab.index, expectedTab.index, "tab index");
  Assert.equal(tab.mailTab, expectedTab.mailTab, "tab is mailTab");
}

function getExtensionDetails(...permissions) {
  return {
    files: {
      "background.js": async () => {
        for (const context of [
          "message_attachments",
          "all_message_attachments",
        ]) {
          await new Promise(resolve => {
            browser.menus.create(
              {
                id: context,
                title: context,
                contexts: [context],
              },
              resolve
            );
          });
        }

        browser.menus.onShown.addListener((...args) => {
          browser.test.sendMessage("onShown", args);
        });

        browser.menus.onClicked.addListener((...args) => {
          browser.test.sendMessage("onClicked", args);
        });
        browser.test.sendMessage("menus-created");
      },
    },
    manifest: {
      applications: {
        gecko: {
          id: "menus@mochi.test",
        },
      },
      background: { scripts: ["background.js"] },
      permissions: [...permissions, "menus"],
    },
    useAddonManager: "temporary",
  };
}

add_setup(async () => {
  await Services.search.init();

  gAccount = createAccount();
  addIdentity(gAccount);
  gFolders = gAccount.incomingServer.rootFolder.subFolders;
  await createMessages(gFolders[0], {
    count: 1,
    body: {
      contentType: "text/html",
      body: await fetch(`${URL_BASE}/content.html`).then(r => r.text()),
    },
    attachments: [
      {
        body: "I am an text attachment.",
        filename: "test1.txt",
        contentType: "text/plain",
      },
    ],
  });
  await createMessages(gFolders[0], {
    count: 1,
    body: {
      contentType: "text/html",
      body: await fetch(`${URL_BASE}/content.html`).then(r => r.text()),
    },
    attachments: [
      {
        body: "I am an text attachment.",
        filename: "test1.txt",
        contentType: "text/plain",
      },
      {
        body: "I am another but larger attachment. ",
        filename: "test2.txt",
        contentType: "text/plain",
      },
    ],
  });

  about3Pane.restoreState({
    folderPaneVisible: true,
    folderURI: gFolders[0].URI,
    messagePaneVisible: true,
  });

  gExpectedAttachments = [
    {
      name: "test1.txt",
      size: 24,
      contentType: "text/plain",
      partName: "1.2",
    },
    {
      name: "test2.txt",
      size: 36,
      contentType: "text/plain",
      partName: "1.3",
    },
  ];
});

// Test a click on an attachment item.
async function subtest_attachmentItem(
  extension,
  win,
  element,
  expectedContext,
  expectedAttachments
) {
  const menu = element.ownerGlobal.document.getElementById(
    expectedContext == "message_attachments"
      ? "attachmentItemContext"
      : "attachmentListContext"
  );

  const expectedShowData = {
    menuIds: [expectedContext],
    contexts: [expectedContext, "all"],
    attachments: expectedAttachments,
  };
  const expectedClickData = {
    attachments: expectedAttachments,
  };
  const expectedTab = { active: true, index: 0, mailTab: false };

  const showEventPromise = checkShownEvent(
    extension,
    expectedShowData,
    expectedTab
  );
  await rightClick(menu, element, win);
  const menuItem = menu.querySelector(
    `#menus_mochi_test-menuitem-_${expectedContext}`
  );
  await showEventPromise;
  Assert.ok(menuItem);

  const clickEventPromise = checkClickedEvent(
    extension,
    expectedClickData,
    expectedTab
  );
  await clickItemInMenuPopup(menu, menuItem);
  await clickEventPromise;
}

async function subtest_attachments(
  extension,
  win,
  expectedContext,
  expectedAttachments
) {
  // Test clicking on the attachmentInfo element.
  const attachmentInfo = win.document.getElementById("attachmentInfo");
  await subtest_attachmentItem(
    extension,
    win,
    attachmentInfo,
    expectedContext,
    expectedAttachments
  );

  if (expectedAttachments) {
    win.toggleAttachmentList(true);
    const attachmentList = win.document.getElementById("attachmentList");
    Assert.equal(
      attachmentList.children.length,
      expectedAttachments.length,
      "Should see the expected number of attachments."
    );

    // Test clicking on the individual attachment elements.
    for (let i = 0; i < attachmentList.children.length; i++) {
      // Select the attachment.
      attachmentList.selectItem(attachmentList.children[i]);

      // Run context click check.
      await subtest_attachmentItem(
        extension,
        win,
        attachmentList.children[i],
        "message_attachments",
        [expectedAttachments[i]]
      );
    }
  }
}

async function subtest_message_panes(
  permissions,
  expectedContext,
  expectedAttachments = null
) {
  const extensionDetails = getExtensionDetails(...permissions);

  info("Test the message pane in the 3-pane tab.");

  let extension = ExtensionTestUtils.loadExtension(extensionDetails);
  await extension.startup();
  await extension.awaitMessage("menus-created");
  await subtest_attachments(
    extension,
    tabmail.currentAboutMessage,
    expectedContext,
    expectedAttachments
  );
  await extension.unload();

  info("Test the message pane in a tab.");

  await openMessageInTab(gMessage);
  extension = ExtensionTestUtils.loadExtension(extensionDetails);
  await extension.startup();
  await extension.awaitMessage("menus-created");
  await subtest_attachments(
    extension,
    tabmail.currentAboutMessage,
    expectedContext,
    expectedAttachments
  );
  await extension.unload();
  tabmail.closeOtherTabs(0);

  info("Test the message pane in a separate window.");

  const displayWindow = await openMessageInWindow(gMessage);
  extension = ExtensionTestUtils.loadExtension(extensionDetails);
  await extension.startup();
  await extension.awaitMessage("menus-created");
  await subtest_attachments(
    extension,
    displayWindow.messageBrowser.contentWindow,
    expectedContext,
    expectedAttachments
  );
  await extension.unload();
  await BrowserTestUtils.closeWindow(displayWindow);
}

// Tests using a message with two attachment.
add_task(async function test_message_panes() {
  gMessage = [...gFolders[0].messages][1];
  about3Pane.threadTree.selectedIndex = 0;
  await promiseMessageLoaded(messagePane, gMessage);

  await subtest_message_panes(
    ["accountsRead", "messagesRead"],
    "all_message_attachments",
    gExpectedAttachments
  );
});
add_task(async function test_message_panes_no_accounts_permission() {
  return subtest_message_panes(
    ["messagesRead"],
    "all_message_attachments",
    gExpectedAttachments
  );
});
add_task(async function test_message_panes_no_messages_permission() {
  return subtest_message_panes(["accountsRead"], "all_message_attachments");
});
add_task(async function test_message_panes_no_permissions() {
  return subtest_message_panes([], "all_message_attachments");
});
