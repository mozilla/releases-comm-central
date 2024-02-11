/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// The purpose of this test (using the real application chooser) is to test that
// the dialog is indeed properly opened.

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

  const gExternalProtocolService = Cc[
    "@mozilla.org/uriloader/external-protocol-service;1"
  ].getService(Ci.nsIExternalProtocolService);
  const gHandlerService = Cc[
    "@mozilla.org/uriloader/handler-service;1"
  ].getService(Ci.nsIHandlerService);

  // Add a phony tel handler, to make sure we get prompted for action.
  const phonyTelHandler = Cc[
    "@mozilla.org/uriloader/web-handler-app;1"
  ].createInstance(Ci.nsIWebHandlerApp);
  phonyTelHandler.name = "Phony tel handler";
  phonyTelHandler.uriTemplate = "https://test.mozilla.org/%s";

  const telHandlerInfo = gExternalProtocolService.getProtocolHandlerInfo("tel");
  const originalTelHandlerInfo = {
    alwaysAskBeforeHandling: telHandlerInfo.alwaysAskBeforeHandling,
    preferredApplicationHandler: telHandlerInfo.preferredApplicationHandler,
  };
  telHandlerInfo.alwaysAskBeforeHandling = true;
  telHandlerInfo.possibleApplicationHandlers.appendElement(phonyTelHandler);
  gHandlerService.store(telHandlerInfo);

  registerCleanupFunction(() => {
    const telHandlerInfo =
      gExternalProtocolService.getProtocolHandlerInfo("tel");
    telHandlerInfo.alwaysAskBeforeHandling =
      originalTelHandlerInfo.alwaysAskBeforeHandling;
    telHandlerInfo.preferredApplicationHandler =
      originalTelHandlerInfo.preferredApplicationHandler;
    const handlers = telHandlerInfo.possibleApplicationHandlers;
    for (let i = handlers.Count() - 1; i >= 0; i--) {
      try {
        if (
          handlers.queryElementAt(i, Ci.nsIWebHandlerApp).name ==
          "Phony tel handler"
        ) {
          handlers.removeElementAt(i);
        }
      } catch (ex) {
        /* ignore non-web-app handlers */
      }
    }
    gHandlerService.store(telHandlerInfo);
  });
});

/**
 * Update tabs with urls which should be handled by the application chooser (opened
 * externally), not changing the currently displayed content.
 */
add_task(async function testUpdateTabs_with_application_chooser() {
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
            browser.tabs.onUpdated.removeListener(updateListener);
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

      // Update a tel:// url.

      await window.sendMessage("createAppChooserDialogPromise");
      await browser.tabs.update(mailTab.id, { url: "tel:1234-1" });
      await window.sendMessage("awaitAppChooserDialogPromise");

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

      // Update a tel:// url.
      await window.sendMessage("createAppChooserDialogPromise");
      await browser.tabs.update(mailTab.id, { url: "tel:1234-2" });
      await window.sendMessage("awaitAppChooserDialogPromise");

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

      // Update a non-registered WebExtension protocol handler.
      await window.sendMessage("createAppChooserDialogPromise");
      await browser.tabs.update(mailTab.id, { url: "ext+test:1234-1" });
      await window.sendMessage("awaitAppChooserDialogPromise");

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

      // Update a tel:// url.
      await window.sendMessage("createAppChooserDialogPromise");
      await browser.tabs.update(messageTab.id, { url: "tel:1234-3" });
      await window.sendMessage("awaitAppChooserDialogPromise");

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
      await window.sendMessage("createAppChooserDialogPromise");
      await browser.tabs.update(mailTab.id, { url: "ext+test:1234-2" });
      await window.sendMessage("awaitAppChooserDialogPromise");

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

      // Update a tel:// url.
      await window.sendMessage("createAppChooserDialogPromise");
      await browser.tabs.update(messageWindowTab.id, { url: "tel:1234-4" });
      await window.sendMessage("awaitAppChooserDialogPromise");

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
      await window.sendMessage("createAppChooserDialogPromise");
      await browser.tabs.update(mailTab.id, { url: "ext+test:1234-3" });
      await window.sendMessage("awaitAppChooserDialogPromise");

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

      const details1 = { to: ['"Mr. Holmes" <holmes@bakerstreet.invalid>'] };
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

      // Update a tel:// url.
      await window.sendMessage("createAppChooserDialogPromise");
      await browser.tabs.update(composeTab.id, { url: "tel:1234-5" });
      await window.sendMessage("awaitAppChooserDialogPromise");

      // We should still see the same composer.
      details2 = await browser.compose.getComposeDetails(composeTab.id);
      window.assertDeepEqual(
        details1.to,
        details2.to,
        "We should see the correct compose details."
      );

      // Update a non-registered WebExtension protocol handler.
      await window.sendMessage("createAppChooserDialogPromise");
      await browser.tabs.update(mailTab.id, { url: "ext+test:1234-4" });
      await window.sendMessage("awaitAppChooserDialogPromise");

      // We should still see the same composer.
      details2 = await browser.compose.getComposeDetails(composeTab.id);
      window.assertDeepEqual(
        details1.to,
        details2.to,
        "We should see the correct compose details."
      );

      browser.tabs.remove(composeTab.id);

      // Test a popup window.

      const popupTab = await new Promise(resolve => {
        let urlSeen = false;
        const updateListener = (tabId, changeInfo, tab) => {
          if (changeInfo.url == "https://www.example.com/") {
            urlSeen = true;
          }
          if (urlSeen && changeInfo.status == "complete") {
            browser.tabs.onUpdated.removeListener(updateListener);
            resolve(tab);
          }
        };
        browser.tabs.onUpdated.addListener(updateListener);
        browser.windows.create({
          type: "popup",
          url: "https://www.example.com",
        });
      });

      browser.test.assertEq(
        "content",
        popupTab.type,
        "Should have found a popup content tab."
      );

      browser.test.assertFalse(
        mailTab.windowId == popupTab.windowId,
        "Tab should not be in the main window."
      );

      // Update a tel:// url.
      await window.sendMessage("createAppChooserDialogPromise");
      await browser.tabs.update(popupTab.id, { url: "tel:1234-6" });
      await window.sendMessage("awaitAppChooserDialogPromise");

      // We should still see the same content page.
      const { url: popupTabUrl1 } = await browser.tabs.get(popupTab.id);
      browser.test.assertEq(
        popupTabUrl1,
        "https://www.example.com/",
        "url should be correct"
      );

      // Update a non-registered WebExtension protocol handler.
      await window.sendMessage("createAppChooserDialogPromise");
      await browser.tabs.update(mailTab.id, { url: "ext+test:1234-5" });
      await window.sendMessage("awaitAppChooserDialogPromise");

      // We should still see the same content page.
      const { url: popupTabUrl2 } = await browser.tabs.get(popupTab.id);
      browser.test.assertEq(
        popupTabUrl2,
        "https://www.example.com/",
        "url should be correct"
      );
      browser.tabs.remove(popupTab.id);

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

  let appChooserDialogOpenPromise = null;
  extension.onMessage("createAppChooserDialogPromise", async () => {
    appChooserDialogOpenPromise = BrowserTestUtils.domWindowOpened(
      null,
      async win => {
        await BrowserTestUtils.waitForEvent(win, "load");
        Assert.ok(
          win.document.documentURI ==
            "chrome://mozapps/content/handling/appChooser.xhtml",
          "application chooser dialog opened"
        );
        return true;
      }
    );
    extension.sendMessage();
  });
  extension.onMessage("awaitAppChooserDialogPromise", async () => {
    const appChooserDialog = await appChooserDialogOpenPromise;
    const appChooserDialogClosePromise =
      BrowserTestUtils.domWindowClosed(appChooserDialog);
    const dialog = appChooserDialog.document.getElementsByTagName("dialog")[0];
    const cancelButton = dialog.getButton("cancel");
    cancelButton.click();
    await appChooserDialogClosePromise;
    appChooserDialogOpenPromise = null;
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function testCreateTabs_with_application_chooser() {
  const files = {
    "background.js": async () => {
      // Create a tab with a tel:// url.
      await window.sendMessage("createAppChooserDialogPromise");
      const tab1 = await browser.tabs.create({ url: "tel:1234-1" });
      await window.sendMessage("awaitAppChooserDialogPromise");
      const { url: tab1Url } = await browser.tabs.get(tab1.id);
      browser.test.assertEq(tab1Url, "about:blank", "Url should be correct");
      await browser.tabs.remove(tab1.id);

      // Following Firefox, creating a tab with a non-registered WebExtension
      // protocol handler is not supported. The url will be loaded, displaying a
      // "missing software" notice.
      const tab2 = await new Promise(resolve => {
        let urlSeen = false;
        const updateListener = (tabId, changeInfo, tab) => {
          if (changeInfo.url == "ext+test:1234-1") {
            urlSeen = true;
          }
          if (urlSeen && changeInfo.status == "complete") {
            browser.tabs.onUpdated.removeListener(updateListener);
            resolve(tab);
          }
        };
        browser.tabs.onUpdated.addListener(updateListener);
        browser.tabs.create({ url: "ext+test:1234-1" });
      });
      await browser.tabs.remove(tab2.id);

      // Create a popup tab with a tel:// url.
      await window.sendMessage("createAppChooserDialogPromise");
      const win1 = await browser.windows.create({
        type: "popup",
        url: "tel:1234-2",
      });
      await window.sendMessage("awaitAppChooserDialogPromise");
      const [win1tab] = await browser.tabs.query({ windowId: win1.id });
      const { url: win1tabUrl } = await browser.tabs.get(win1tab.id);
      browser.test.assertEq(win1tabUrl, "about:blank", "Url should be correct");
      await browser.tabs.remove(win1tab.id);

      // Following Firefox, creating a popup tab with a non-registered WebExtension
      // protocol handler is not supported. The url will be loaded, displaying a
      // "missing software" notice.
      const win2tab = await new Promise(resolve => {
        let urlSeen = false;
        const updateListener = (tabId, changeInfo, tab) => {
          if (changeInfo.url == "ext+test:1234-2") {
            urlSeen = true;
          }
          if (urlSeen && changeInfo.status == "complete") {
            browser.tabs.onUpdated.removeListener(updateListener);
            resolve(tab);
          }
        };
        browser.tabs.onUpdated.addListener(updateListener);
        browser.windows.create({ type: "popup", url: "ext+test:1234-2" });
      });
      await browser.tabs.remove(win2tab.id);

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

  let appChooserDialogOpenPromise = null;
  extension.onMessage("createAppChooserDialogPromise", async () => {
    appChooserDialogOpenPromise = BrowserTestUtils.domWindowOpened(
      null,
      async win => {
        await BrowserTestUtils.waitForEvent(win, "load");
        return (
          win.document.documentURI ==
          "chrome://mozapps/content/handling/appChooser.xhtml"
        );
      }
    );
    extension.sendMessage();
  });
  extension.onMessage("awaitAppChooserDialogPromise", async () => {
    const appChooserDialog = await appChooserDialogOpenPromise;
    const appChooserDialogClosePromise =
      BrowserTestUtils.domWindowClosed(appChooserDialog);
    const dialog = appChooserDialog.document.getElementsByTagName("dialog")[0];
    const cancelButton = dialog.getButton("cancel");
    cancelButton.click();
    await appChooserDialogClosePromise;
    appChooserDialogOpenPromise = null;
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
