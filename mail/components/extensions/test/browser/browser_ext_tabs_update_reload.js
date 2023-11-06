/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

/** @implements {nsIExternalProtocolService} */
const mockExternalProtocolService = {
  _loadedURLs: [],
  externalProtocolHandlerExists(protocolScheme) {},
  getApplicationDescription(scheme) {},
  getProtocolHandlerInfo(protocolScheme) {
    return {
      possibleApplicationHandlers: Cc["@mozilla.org/array;1"].createInstance(
        Ci.nsIMutableArray
      ),
    };
  },
  getProtocolHandlerInfoFromOS(protocolScheme, found) {},
  isExposedProtocol(protocolScheme) {},
  loadURI(uri, windowContext) {
    this._loadedURLs.push(uri.spec);
  },
  setProtocolHandlerDefaults(handlerInfo, osHandlerExists) {},
  QueryInterface: ChromeUtils.generateQI(["nsIExternalProtocolService"]),
};

var gAccount;
var gMessages;
var gFolder;

add_setup(() => {
  gAccount = createAccount();
  addIdentity(gAccount);
  const rootFolder = gAccount.incomingServer.rootFolder;
  rootFolder.createSubfolder("test0", null);

  const subFolders = {};
  for (const folder of rootFolder.subFolders) {
    subFolders[folder.name] = folder;
  }
  createMessages(subFolders.test0, 5);

  gFolder = subFolders.test0;
  gMessages = [...subFolders.test0.messages];
});

/**
 * Update registered WebExtension protocol handler pages.
 */
add_task(async function testUpdateTabs_WebExtProtocolHandler() {
  const files = {
    "background.js": async () => {
      // Test a mail tab.

      let [mailTab] = await browser.mailTabs.query({
        active: true,
        currentWindow: true,
      });
      browser.test.assertTrue(!!mailTab, "Should have found a mail tab.");

      // Load a message.
      const { messages } = await browser.messages.list(
        mailTab.displayedFolder.id
      );
      await browser.mailTabs.setSelectedMessages(mailTab.id, [messages[0].id]);
      const message1 = await browser.messageDisplay.getDisplayedMessage(
        mailTab.id
      );
      browser.test.assertTrue(
        !!message1,
        "We should have a displayed message."
      );
      mailTab = await browser.tabs.get(mailTab.id);
      browser.test.assertTrue(
        mailTab.url.startsWith("mailbox:"),
        "A message should be loaded"
      );

      // Update to a registered WebExtension protocol handler.
      await new Promise(resolve => {
        let urlSeen = false;
        const updateListener = (tabId, changeInfo, tab) => {
          if (
            changeInfo.url &&
            changeInfo.url.endsWith("handler.html#ext%2Btest%3A1234-1")
          ) {
            urlSeen = true;
          }
          if (urlSeen && changeInfo.status == "complete") {
            resolve();
          }
        };
        browser.tabs.onUpdated.addListener(updateListener);
        browser.tabs.update(mailTab.id, { url: "ext+test:1234-1" });
      });

      mailTab = await browser.tabs.get(mailTab.id);
      browser.test.assertTrue(
        mailTab.url.endsWith("handler.html#ext%2Btest%3A1234-1"),
        "Should have found the correct protocol handler url loaded"
      );

      // Test a message tab.

      const messageTab = await browser.messageDisplay.open({
        location: "tab",
        messageId: message1.id,
      });
      browser.test.assertEq(
        "messageDisplay",
        messageTab.type,
        "Should have found a message tab."
      );
      browser.test.assertTrue(
        mailTab.windowId == messageTab.windowId,
        "Tab should be in the main window."
      );

      // Updating a message tab to a registered WebExtension protocol handler
      // should throw.
      browser.test.assertRejects(
        browser.tabs.update(messageTab.id, { url: "ext+test:1234-1" }),
        /Loading a registered WebExtension protocol handler url is only supported for content tabs and mail tabs./,
        "Updating a message tab to a registered WebExtension protocol handler should throw"
      );
      browser.tabs.remove(messageTab.id);

      // Test a message window.

      const messageWindowTab = await browser.messageDisplay.open({
        location: "window",
        messageId: message1.id,
      });
      browser.test.assertEq(
        "messageDisplay",
        messageWindowTab.type,
        "Should have found a message tab."
      );
      browser.test.assertFalse(
        mailTab.windowId == messageWindowTab.windowId,
        "Tab should not be in the main window."
      );

      // Updating a message window to a registered WebExtension protocol handler
      // should throw.
      browser.test.assertRejects(
        browser.tabs.update(messageWindowTab.id, { url: "ext+test:1234-1" }),
        /Loading a registered WebExtension protocol handler url is only supported for content tabs and mail tabs./,
        "Updating a message tab to a registered WebExtension protocol handler should throw"
      );

      browser.tabs.remove(messageWindowTab.id);

      // Test a compose window.

      const details1 = { to: ["Mr. Holmes <holmes@bakerstreet.invalid>"] };
      const composeTab = await browser.compose.beginNew(details1);
      browser.test.assertEq(
        "messageCompose",
        composeTab.type,
        "Should have found a compose tab."
      );
      browser.test.assertFalse(
        mailTab.windowId == composeTab.windowId,
        "Tab should not be in the main window."
      );
      const details2 = await browser.compose.getComposeDetails(composeTab.id);
      window.assertDeepEqual(
        details1.to,
        details2.to,
        "We should see the correct compose details."
      );

      // Updating a message window to a registered WebExtension protocol handler
      // should throw.
      browser.test.assertRejects(
        browser.tabs.update(composeTab.id, { url: "ext+test:1234-1" }),
        /Loading a registered WebExtension protocol handler url is only supported for content tabs and mail tabs./,
        "Updating a message tab to a registered WebExtension protocol handler should throw"
      );

      browser.tabs.remove(composeTab.id);

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
    "handler.html": "<html><body><p>Test Protocol Handler</p></body></html>",
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead", "tabs", "compose"],
      protocol_handlers: [
        {
          protocol: "ext+test",
          name: "Protocol Handler Example",
          uriTemplate: "/handler.html#%s",
        },
      ],
    },
  });

  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  about3Pane.displayFolder(gFolder);

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

/**
 * Reload and update tabs and check if it fails for forbidden cases, keep track
 * of urls opened externally.
 */
add_task(async function testUpdateReloadTabs() {
  const mockExternalProtocolServiceCID = MockRegistrar.register(
    "@mozilla.org/uriloader/external-protocol-service;1",
    mockExternalProtocolService
  );
  registerCleanupFunction(() => {
    MockRegistrar.unregister(mockExternalProtocolServiceCID);
  });

  const files = {
    "background.js": async () => {
      // Test a mail tab.

      let [mailTab] = await browser.mailTabs.query({
        active: true,
        currentWindow: true,
      });
      browser.test.assertTrue(!!mailTab, "Should have found a mail tab.");

      // Load a URL.
      await new Promise(resolve => {
        let urlSeen = false;
        const updateListener = (tabId, changeInfo, tab) => {
          if (changeInfo.url == "https://www.example.com/") {
            urlSeen = true;
          }
          if (urlSeen && changeInfo.status == "complete") {
            resolve();
          }
        };
        browser.tabs.onUpdated.addListener(updateListener);
        browser.tabs.update(mailTab.id, { url: "https://www.example.com/" });
      });

      browser.test.assertEq(
        "https://www.example.com/",
        (await browser.tabs.get(mailTab.id)).url,
        "Should have found the correct url loaded"
      );

      // This should not throw.
      await browser.tabs.reload(mailTab.id);

      // Update a tel:// url.
      await browser.tabs.update(mailTab.id, { url: "tel:1234-1" });
      await window.sendMessage("check_external_loaded_url", "tel:1234-1");

      // We should still have the same url displayed.
      browser.test.assertEq(
        "https://www.example.com/",
        (await browser.tabs.get(mailTab.id)).url,
        "Should have found the correct url loaded"
      );

      // Load a message.
      const { messages } = await browser.messages.list(
        mailTab.displayedFolder.id
      );
      await browser.mailTabs.setSelectedMessages(mailTab.id, [messages[1].id]);
      const message1 = await browser.messageDisplay.getDisplayedMessage(
        mailTab.id
      );
      browser.test.assertTrue(
        !!message1,
        "We should have a displayed message."
      );
      mailTab = await browser.tabs.get(mailTab.id);
      browser.test.assertFalse(
        "https://www.example.com/" == mailTab.url,
        "Webpage should no longer be loaded"
      );

      // Reload should now fail.
      browser.test.assertRejects(
        browser.tabs.reload(mailTab.id),
        /Reloading is only supported for tabs displaying a content page/,
        "Reloading a mail tab not displaying a content page should throw"
      );

      // We should still see the same message.
      let message2 = await browser.messageDisplay.getDisplayedMessage(
        mailTab.id
      );
      browser.test.assertTrue(
        !!message2,
        "We should have a displayed message."
      );
      browser.test.assertTrue(
        message1.id == message2.id,
        "We should see the same message."
      );

      // Update a tel:// url.
      await browser.tabs.update(mailTab.id, { url: "tel:1234-2" });
      await window.sendMessage("check_external_loaded_url", "tel:1234-2");

      // We should still see the same message.
      message2 = await browser.messageDisplay.getDisplayedMessage(mailTab.id);
      browser.test.assertTrue(
        !!message2,
        "We should have a displayed message."
      );
      browser.test.assertTrue(
        message1.id == message2.id,
        "We should see the same message."
      );

      // Update a non-registered WebExtension protocol handler.
      await browser.tabs.update(mailTab.id, { url: "ext+test:1234-1" });
      await window.sendMessage("check_external_loaded_url", "ext+test:1234-1");

      // We should still see the same message.
      message2 = await browser.messageDisplay.getDisplayedMessage(mailTab.id);
      browser.test.assertTrue(
        !!message2,
        "We should have a displayed message."
      );
      browser.test.assertTrue(
        message1.id == message2.id,
        "We should see the same message."
      );

      // Test a message tab.

      const messageTab = await browser.messageDisplay.open({
        location: "tab",
        messageId: message1.id,
      });
      browser.test.assertEq(
        "messageDisplay",
        messageTab.type,
        "Should have found a message tab."
      );
      browser.test.assertTrue(
        mailTab.windowId == messageTab.windowId,
        "Tab should be in the main window."
      );

      browser.test.assertRejects(
        browser.tabs.reload(messageTab.id),
        /Reloading is only supported for tabs displaying a content page/,
        "Reloading a message tab should throw"
      );

      // We should still see the same message.
      message2 = await browser.messageDisplay.getDisplayedMessage(
        messageTab.id
      );
      browser.test.assertTrue(
        !!message2,
        "We should have a displayed message."
      );
      browser.test.assertTrue(
        message1.id == message2.id,
        "We should see the same message."
      );

      // Update a tel:// url.
      await browser.tabs.update(messageTab.id, { url: "tel:1234-3" });
      await window.sendMessage("check_external_loaded_url", "tel:1234-3");

      // We should still see the same message.
      message2 = await browser.messageDisplay.getDisplayedMessage(
        messageTab.id
      );
      browser.test.assertTrue(
        !!message2,
        "We should have a displayed message."
      );
      browser.test.assertTrue(
        message1.id == message2.id,
        "We should see the same message."
      );

      // Update a non-registered WebExtension protocol handler.
      await browser.tabs.update(mailTab.id, { url: "ext+test:1234-2" });
      await window.sendMessage("check_external_loaded_url", "ext+test:1234-2");

      // We should still see the same message.
      message2 = await browser.messageDisplay.getDisplayedMessage(
        messageTab.id
      );
      browser.test.assertTrue(
        !!message2,
        "We should have a displayed message."
      );
      browser.test.assertTrue(
        message1.id == message2.id,
        "We should see the same message."
      );

      browser.tabs.remove(messageTab.id);

      // Test a message window.

      const messageWindowTab = await browser.messageDisplay.open({
        location: "window",
        messageId: message1.id,
      });
      browser.test.assertEq(
        "messageDisplay",
        messageWindowTab.type,
        "Should have found a message tab."
      );
      browser.test.assertFalse(
        mailTab.windowId == messageWindowTab.windowId,
        "Tab should not be in the main window."
      );

      browser.test.assertRejects(
        browser.tabs.reload(messageWindowTab.id),
        /Reloading is only supported for tabs displaying a content page/,
        "Reloading a message window should throw"
      );

      // We should still see the same message.
      message2 = await browser.messageDisplay.getDisplayedMessage(
        messageWindowTab.id
      );
      browser.test.assertTrue(
        !!message2,
        "We should have a displayed message."
      );
      browser.test.assertTrue(
        message1.id == message2.id,
        "We should see the same message."
      );

      // Update a tel:// url.
      await browser.tabs.update(messageWindowTab.id, { url: "tel:1234-4" });
      await window.sendMessage("check_external_loaded_url", "tel:1234-4");

      // We should still see the same message.
      message2 = await browser.messageDisplay.getDisplayedMessage(
        messageWindowTab.id
      );
      browser.test.assertTrue(
        !!message2,
        "We should have a displayed message."
      );
      browser.test.assertTrue(
        message1.id == message2.id,
        "We should see the same message."
      );

      // Update a non-registered WebExtension protocol handler.
      await browser.tabs.update(mailTab.id, { url: "ext+test:1234-3" });
      await window.sendMessage("check_external_loaded_url", "ext+test:1234-3");

      // We should still see the same message.
      message2 = await browser.messageDisplay.getDisplayedMessage(
        messageWindowTab.id
      );
      browser.test.assertTrue(
        !!message2,
        "We should have a displayed message."
      );
      browser.test.assertTrue(
        message1.id == message2.id,
        "We should see the same message."
      );

      browser.tabs.remove(messageWindowTab.id);

      // Test a compose window.

      const details1 = { to: ["Mr. Holmes <holmes@bakerstreet.invalid>"] };
      const composeTab = await browser.compose.beginNew(details1);
      browser.test.assertEq(
        "messageCompose",
        composeTab.type,
        "Should have found a compose tab."
      );
      browser.test.assertFalse(
        mailTab.windowId == composeTab.windowId,
        "Tab should not be in the main window."
      );
      let details2 = await browser.compose.getComposeDetails(composeTab.id);
      window.assertDeepEqual(
        details1.to,
        details2.to,
        "We should see the correct compose details."
      );

      browser.test.assertRejects(
        browser.tabs.reload(composeTab.id),
        /Reloading is only supported for tabs displaying a content page/,
        "Reloading a compose window should throw"
      );

      // We should still see the same composer.
      details2 = await browser.compose.getComposeDetails(composeTab.id);
      window.assertDeepEqual(
        details1.to,
        details2.to,
        "We should see the correct compose details."
      );

      // Update a tel:// url.
      await browser.tabs.update(composeTab.id, { url: "tel:1234-5" });
      await window.sendMessage("check_external_loaded_url", "tel:1234-5");

      // We should still see the same composer.
      details2 = await browser.compose.getComposeDetails(composeTab.id);
      window.assertDeepEqual(
        details1.to,
        details2.to,
        "We should see the correct compose details."
      );

      // Update a non-registered WebExtension protocol handler.
      await browser.tabs.update(mailTab.id, { url: "ext+test:1234-4" });
      await window.sendMessage("check_external_loaded_url", "ext+test:1234-4");

      // We should still see the same composer.
      details2 = await browser.compose.getComposeDetails(composeTab.id);
      window.assertDeepEqual(
        details1.to,
        details2.to,
        "We should see the correct compose details."
      );

      browser.tabs.remove(composeTab.id);

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead", "tabs", "compose"],
    },
  });

  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  about3Pane.displayFolder(gFolder);

  extension.onMessage("check_external_loaded_url", async expected => {
    Assert.equal(
      1,
      mockExternalProtocolService._loadedURLs.length,
      "Should have found a single loaded url"
    );
    Assert.equal(
      mockExternalProtocolService._loadedURLs[0],
      expected,
      "Should have found the expected url"
    );
    mockExternalProtocolService._loadedURLs = [];
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  Assert.equal(
    0,
    mockExternalProtocolService._loadedURLs.length,
    "Should not have any unexpected urls loaded externally"
  );
});
