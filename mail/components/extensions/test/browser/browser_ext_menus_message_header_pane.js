/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let gAccount, gFolder, gMessage, gHeaderMessageIds, gExpectedInfo;

var tabmail = document.getElementById("tabmail");
var about3Pane = tabmail.currentAbout3Pane;
var messagePane =
  about3Pane.messageBrowser.contentWindow.getMessagePaneBrowser();

/**
 * Check the parameters of a browser.onShown event that was fired.
 *
 * @see mail/components/extensions/schemas/menus.json
 *
 * @param {ExtensionWrapper} extension
 * @param {object} expectedInfo
 * @param {Array} expectedInfo.menuIds
 * @param {Array} expectedInfo.contexts
 * @param {?string} expectedInfo.linkText
 * @param {?string} expectedInfo.linkUrl
 * @param {object} expectedTab
 * @param {boolean} expectedTab.active
 * @param {integer} expectedTab.index
 * @param {boolean} expectedTab.mailTab
 */
async function checkShownEvent(extension, expectedInfo, expectedTab) {
  const [info, tab] = await extension.awaitMessage("onShown");
  Assert.deepEqual(info.menuIds, expectedInfo.menuIds);
  Assert.deepEqual(info.contexts, expectedInfo.contexts);

  Assert.equal(!!info.linkText, !!expectedInfo.linkText, "linkText in info");
  Assert.equal(!!info.linkUrl, !!expectedInfo.linkUrl, "linkUrl in info");
  if (expectedInfo.linkText) {
    Assert.equal(info.linkText, expectedInfo.linkText);
  }
  if (expectedInfo.linkUrl) {
    Assert.equal(info.linkUrl, expectedInfo.linkUrl);
  }

  Assert.equal(tab.active, expectedTab.active, "tab is active");
  Assert.equal(tab.index, expectedTab.index, "tab index");
  Assert.equal(tab.mailTab, expectedTab.mailTab, "tab is mailTab");
}

/**
 * Check the parameters of a browser.onClicked event that was fired.
 *
 * @see mail/components/extensions/schemas/menus.json
 *
 * @param {ExtensionWrapper} extension
 * @param {object} expectedInfo
 * @param {?string} expectedInfo.linkText
 * @param {?string} expectedInfo.linkUrl
 * @param {?string} expectedInfo.menuItemId
 * @param {object} expectedTab
 * @param {boolean} expectedTab.active
 * @param {integer} expectedTab.index
 * @param {boolean} expectedTab.mailTab
 */
async function checkClickedEvent(extension, expectedInfo, expectedTab) {
  const [info, tab] = await extension.awaitMessage("onClicked");

  Assert.equal(!!info.linkText, !!expectedInfo.linkText, "linkText in info");
  Assert.equal(!!info.linkUrl, !!expectedInfo.linkUrl, "linkUrl in info");
  if (expectedInfo.linkText) {
    Assert.equal(info.linkText, expectedInfo.linkText);
  }
  if (expectedInfo.linkUrl) {
    Assert.equal(info.linkUrl, expectedInfo.linkUrl);
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
        for (const context of ["header_pane_link"]) {
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

add_setup(async function () {
  gHeaderMessageIds = [
    "<message-id@example.com>",
    "<first-reference@example.com>",
    "<second-reference@example.com>",
  ];
  gExpectedInfo = [
    {
      linkText: "<message-id@example.com>",
      linkUrl: "mid:message-id@example.com",
    },
    {
      linkText: "<first-reference@example.com>",
      linkUrl: "mid:first-reference@example.com",
    },
    {
      linkText: "<second-reference@example.com>",
      linkUrl: "mid:second-reference@example.com",
    },
  ];

  await Services.search.init();

  // Temporarily set this preference to show all headers.
  Services.prefs.setIntPref("mail.show_headers", 2);
  Services.prefs.setBoolPref("mailnews.headers.showMessageId", true);

  gAccount = createAccount();
  addIdentity(gAccount);
  gFolder = gAccount.incomingServer.rootFolder.subFolders[0];
  gFolder
    .QueryInterface(Ci.nsIMsgLocalMailFolder)
    .addMessage(
      "Newsgroups: misc.test\n" +
        "Date: Mon, 01 Jan 2001 00:00:00 +0100\n" +
        "Subject: Test newsgroup message\n" +
        `Message-ID: ${gHeaderMessageIds[0]}\n` +
        `References: ${gHeaderMessageIds[1]}, ` +
        `${gHeaderMessageIds[2]}\n` +
        "From: Someone <someone@example.com>\n" +
        "MIME-Version: 1.0\n" +
        "Content-Type: text/plain; charset=UTF-8\n" +
        "Content-Transfer-Encoding: quoted-printable\n" +
        "\n" +
        "Test message for message header pane links.\n"
    );

  about3Pane.restoreState({
    folderPaneVisible: true,
    folderURI: gFolder.URI,
    messagePaneVisible: true,
  });

  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref("mail.show_headers");
    Services.prefs.clearUserPref("mailnews.headers.showMessageId");
  });
});

// Test a click on a header pane link.
async function subtest_headerPaneLink(
  extension,
  element,
  expectedContext,
  expectedInfo
) {
  const menu = element.ownerGlobal.document.getElementById("messageIdContext");
  const expectedShowData = {
    menuIds: [expectedContext],
    contexts: [expectedContext, "all"],
    linkText: expectedInfo?.linkText,
    linkUrl: expectedInfo?.linkUrl,
  };
  const expectedClickData = {
    menuItemId: expectedContext,
    linkText: expectedInfo?.linkText,
    linkUrl: expectedInfo?.linkUrl,
  };
  const expectedTab = { active: true, index: 0, mailTab: false };

  const showEventPromise = checkShownEvent(
    extension,
    expectedShowData,
    expectedTab
  );
  await openMenuPopup(menu, element, { type: "contextmenu" });
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
  await clickItemInMenuPopup(menuItem);
  await clickEventPromise;
}

async function subtest_headerPane(
  extension,
  win,
  expectedContext,
  expectedInfo
) {
  // Test clicking on the different message-id elements.
  for (let i = 0; i < gHeaderMessageIds.length; i++) {
    await subtest_headerPaneLink(
      extension,
      win.document.getElementById(gHeaderMessageIds[i]),
      expectedContext,
      expectedInfo?.[i]
    );
  }
}

async function subtest_message_panes(
  permissions,
  expectedContext,
  expectedInfo = null
) {
  const extensionDetails = getExtensionDetails(...permissions);

  info("Test the message pane in the 3-pane tab.");

  let extension = ExtensionTestUtils.loadExtension(extensionDetails);
  await extension.startup();
  await extension.awaitMessage("menus-created");
  await subtest_headerPane(
    extension,
    tabmail.currentAboutMessage,
    expectedContext,
    expectedInfo
  );
  await extension.unload();

  info("Test the message pane in a tab.");

  await openMessageInTab(gMessage);
  extension = ExtensionTestUtils.loadExtension(extensionDetails);
  await extension.startup();
  await extension.awaitMessage("menus-created");
  await subtest_headerPane(
    extension,
    tabmail.currentAboutMessage,
    expectedContext,
    expectedInfo
  );
  await extension.unload();
  tabmail.closeOtherTabs(0);

  info("Test the message pane in a separate window.");

  const displayWindow = await openMessageInWindow(gMessage);
  extension = ExtensionTestUtils.loadExtension(extensionDetails);
  await extension.startup();
  await extension.awaitMessage("menus-created");
  await subtest_headerPane(
    extension,
    displayWindow.messageBrowser.contentWindow,
    expectedContext,
    expectedInfo
  );
  await extension.unload();
  await BrowserTestUtils.closeWindow(displayWindow);
}

add_task(async function test_message_panes() {
  gMessage = [...gFolder.messages][0];
  about3Pane.threadTree.selectedIndex = 0;
  await promiseMessageLoaded(messagePane, gMessage);

  // Change this preference back to trigger a rebuild of the header view so
  // that "mailnews.headers.showMessageId" takes effect.
  Services.prefs.setIntPref("mail.show_headers", 1);

  await subtest_message_panes(
    ["accountsRead", "messagesRead"],
    "header_pane_link",
    gExpectedInfo
  );
});
add_task(async function test_message_panes_no_accounts_permission() {
  return subtest_message_panes(
    ["messagesRead"],
    "header_pane_link",
    gExpectedInfo
  );
});
add_task(async function test_message_panes_no_messages_permission() {
  return subtest_message_panes(["accountsRead"], "header_pane_link");
});
add_task(async function test_message_panes_no_permissions() {
  return subtest_message_panes([], "header_pane_link");
});
