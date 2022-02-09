/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
"use strict";

let gMessages;

add_task(async function setup() {
  let account = createAccount();
  let rootFolder = account.incomingServer.rootFolder;
  let subFolders = rootFolder.subFolders;
  createMessages(subFolders[0], 10);
  gMessages = [...subFolders[0].messages];

  // This tests selects a folder, so make sure the folder pane is visible.
  if (
    document.getElementById("folderpane_splitter").getAttribute("state") ==
    "collapsed"
  ) {
    window.MsgToggleFolderPane();
  }
  if (window.IsMessagePaneCollapsed()) {
    window.MsgToggleMessagePane();
  }

  window.gFolderTreeView.selectFolder(subFolders[0]);
  window.gFolderDisplay.selectViewIndex(0);
  await BrowserTestUtils.browserLoaded(window.getMessagePaneBrowser());
});

async function run_getAsPDF_test(permissions) {
  async function background() {
    let description = browser.runtime.getManifest().description;
    let permissions = JSON.parse(description);

    async function openTabPromise(type) {
      return new Promise(resolve => {
        function listener(tabId, changeInfo, testTab) {
          if (
            testTab &&
            testTab.type == type &&
            changeInfo.status == "complete"
          ) {
            browser.tabs.onUpdated.removeListener(listener);
            resolve(testTab);
          }
        }
        browser.tabs.onUpdated.addListener(listener);
      });
    }

    async function openWindowTabPromise(type) {
      return new Promise(resolve => {
        async function listener(tab) {
          if (tab && tab.type == type) {
            browser.tabs.onCreated.removeListener(listener);
            resolve(tab);
          }
        }
        browser.tabs.onCreated.addListener(listener);
      });
    }

    // Test the given tab for the given permission. If the permission is
    // not granted by the test setup, the call to getAsPDF() must fail,
    // if the permission is granted, the call to gestAsPDF() must succeed.
    async function testTab(testTab, permission) {
      browser.test.assertTrue(!!testTab, `Tab for test should exist.`);
      let pageSettings = {};
      if (permissions.includes(permission)) {
        let file = await browser.tabs.getAsPDF(pageSettings, testTab.id);
        let content = await file.text();
        browser.test.assertTrue(
          content.startsWith("%PDF-"),
          "PDF file should start with '%PDF-'"
        );
      } else {
        await browser.test.assertRejects(
          browser.tabs.getAsPDF(pageSettings, testTab.id),
          `tabs.getAsPDF() requires the ${permission} permission to get the content this tab as PDF.`
        );
      }
    }

    // Test a mailTab.
    let [mailTab] = await browser.tabs.query({ mailTab: true });
    browser.test.log(
      `Test mailTab ${mailTab.id} with permissions: ${description}`
    );
    await testTab(mailTab, "messagesRead");

    // Test a content tab.
    let contentTabPromise = openTabPromise("content");
    browser.tabs.create({
      active: true,
      url: "http://example.net/",
    });
    let contentTab = await contentTabPromise;
    browser.test.log(
      `Test content tab ${contentTab.id} with permissions: ${description}`
    );
    await testTab(contentTab, "activeTab");
    await browser.tabs.remove(contentTab.id);

    // Test an addressBook tab.
    let addressBookTabPromise = openTabPromise("addressBook");
    await window.sendMessage("openAddressBookTab");
    let addressBookTab = await addressBookTabPromise;
    browser.test.log(
      `Test addressBook tab ${addressBookTab.id} with permissions: ${description}`
    );
    await testTab(addressBookTab, "addressBooks");
    await browser.tabs.remove(addressBookTab.id);

    // Test a messageTab.
    let messageTabPromise = openTabPromise("messageDisplay");
    await window.sendMessage("openMessageTab");
    let messageTab = await messageTabPromise;
    browser.test.log(
      `Test message tab ${messageTab.id} with permissions: ${description}`
    );
    await testTab(messageTab, "messagesRead");
    await browser.tabs.remove(messageTab.id);

    // Test a messageTab in a stand-alone window.
    let messageWindowTabPromise = openWindowTabPromise("messageDisplay");
    await window.sendMessage("openMessageWindowTab");
    let messageWindowTab = await messageWindowTabPromise;
    browser.test.log(
      `Test a message tab ${messageWindowTab.id} in a stand-alone window with permissions: ${description}`
    );
    await testTab(messageWindowTab, "messagesRead");
    await browser.windows.remove(messageWindowTab.windowId);

    browser.test.notifyPass("tabs.getAsPDF");
  }
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": background,
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      applications: {
        gecko: {
          id: "browser_tab_pdf@mochi.test",
        },
      },
      background: { scripts: ["utils.js", "background.js"] },
      permissions,
      description: JSON.stringify(permissions),
    },
  });

  extension.onMessage("openAddressBookTab", async () => {
    await window.toAddressBook();
    extension.sendMessage();
  });

  extension.onMessage("openMessageTab", async () => {
    await openMessageInTab(gMessages[0]);
    extension.sendMessage();
  });

  extension.onMessage("openMessageWindowTab", async () => {
    await openMessageInWindow(gMessages[1]);
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("tabs.getAsPDF");
  await extension.unload();
}

add_task(async function getAsPDF_test_without_permissions() {
  await run_getAsPDF_test([]);
});

add_task(async function getAsPDF_test_with_activeTab_permission() {
  await run_getAsPDF_test(["activeTab"]);
});

add_task(async function getAsPDF_test_with_messagesRead_permission() {
  await run_getAsPDF_test(["messagesRead"]);
});

add_task(async function getAsPDF_test_with_addressBook_permissions() {
  await run_getAsPDF_test(["addressBooks"]);
});
