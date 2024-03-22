/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

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
 * Update tabs to load registered WebExtension protocol handler pages and check
 * that it will work only for content tabs and mail tabs.
 */
add_task(async function testCreateUpdateTabs_WebExtProtocolHandler() {
  const files = {
    "background.js": async () => {
      function assertEndsWith(expectedEnding, actual, description) {
        browser.test.assertTrue(
          actual.endsWith(expectedEnding),
          `assertEndsWith failed for ${description} - expected ending: ${expectedEnding},  actual string ${actual}`
        );
      }

      // Test a mail tab.

      let [mailTab] = await browser.mailTabs.query({
        active: true,
        currentWindow: true,
      });
      browser.test.assertTrue(!!mailTab, "Should have found a mail tab.");

      // Load a message into the mail tab.
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

      // Update mail tab to a registered WebExtension protocol handler.

      await new Promise(resolve => {
        let urlSeen = false;
        const updateListener = (tabId, changeInfo) => {
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
      assertEndsWith(
        "handler.html#ext%2Btest%3A1234-1",
        mailTab.url,
        "mailTab.url should have the correct ending"
      );

      // Update content tab to a registered WebExtension protocol handler.

      let contentTab = await new Promise(resolve => {
        let urlSeen = false;
        const updateListener = (tabId, changeInfo, tab) => {
          if (changeInfo.url == "https://www.example.com/") {
            urlSeen = true;
          }
          if (urlSeen && changeInfo.status == "complete") {
            resolve(tab);
          }
        };
        browser.tabs.onUpdated.addListener(updateListener);
        browser.tabs.create({ url: "https://www.example.com/" });
      });

      browser.test.assertEq(
        "https://www.example.com/",
        contentTab.url,
        "Should have found the correct url loaded"
      );

      await new Promise(resolve => {
        let urlSeen = false;
        const updateListener = (tabId, changeInfo) => {
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
        browser.tabs.update(contentTab.id, { url: "ext+test:1234-1" });
      });

      contentTab = await browser.tabs.get(contentTab.id);
      assertEndsWith(
        "handler.html#ext%2Btest%3A1234-1",
        contentTab.url,
        "contentTab.url should have the correct ending"
      );
      await browser.tabs.remove(contentTab.id);

      // Create a registered WebExtension protocol handler tab.

      const extProtoTab = await new Promise(resolve => {
        let urlSeen = false;
        const updateListener = (tabId, changeInfo, tab) => {
          if (
            changeInfo.url &&
            changeInfo.url.endsWith("handler.html#ext%2Btest%3A1234-1")
          ) {
            urlSeen = true;
          }
          if (urlSeen && changeInfo.status == "complete") {
            resolve(tab);
          }
        };
        browser.tabs.onUpdated.addListener(updateListener);
        browser.tabs.create({ url: "ext+test:1234-1" });
      });

      assertEndsWith(
        "handler.html#ext%2Btest%3A1234-1",
        extProtoTab.url,
        "extProtoTab.url should have the correct ending"
      );
      await browser.tabs.remove(extProtoTab.id);

      // Create a registered WebExtension protocol handler popup tab.

      const extProtoPopupTab = await new Promise(resolve => {
        let urlSeen = false;
        const updateListener = (tabId, changeInfo, tab) => {
          if (
            changeInfo.url &&
            changeInfo.url.endsWith("handler.html#ext%2Btest%3A1234-1")
          ) {
            urlSeen = true;
          }
          if (urlSeen && changeInfo.status == "complete") {
            resolve(tab);
          }
        };
        browser.tabs.onUpdated.addListener(updateListener);
        browser.windows.create({ url: "ext+test:1234-1", type: "popup" });
      });

      assertEndsWith(
        "handler.html#ext%2Btest%3A1234-1",
        extProtoPopupTab.url,
        "extProtoTab.url should have the correct ending"
      );
      await browser.tabs.remove(extProtoPopupTab.id);

      // Test updating a message tab.

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

      // Test updating a message window.

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

      // Test updating a compose window.

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

add_task(async function testCreateUpdateTabs_mailto() {
  const files = {
    "background.js": async () => {
      function getComposeTabPromise() {
        return new Promise(resolve => {
          const listener = tab => {
            if (tab.type == "messageCompose") {
              browser.tabs.onCreated.removeListener(listener);
              resolve(tab);
            }
          };
          browser.tabs.onCreated.addListener(listener);
        });
      }

      // Create a tab with a mailto url, which should create an empty tab and a
      // new compose window/tab.

      const composeTabPromise1 = getComposeTabPromise();
      const contentTab = await browser.tabs.create({
        url: "mailto:user@invalid1",
      });
      browser.test.assertEq(
        "content",
        contentTab.type,
        "We should have found content tab."
      );

      const composeTab1 = await composeTabPromise1;
      const composeDetails1 = await browser.compose.getComposeDetails(
        composeTab1.id
      );
      browser.test.assertEq(
        "user@invalid1",
        composeDetails1.to[0],
        "Composer should have the correct to address"
      );
      await browser.tabs.remove(composeTab1.id);

      // Update the contentTab with a mailto url, which should open a new
      // compose window/tab.

      const composeTabPromise2 = getComposeTabPromise();
      await browser.tabs.update(contentTab.id, { url: "mailto:user@invalid2" });
      const composeTab2 = await composeTabPromise2;
      const composeDetails2 = await browser.compose.getComposeDetails(
        composeTab2.id
      );
      browser.test.assertEq(
        "user@invalid2",
        composeDetails2.to[0],
        "Composer should have the correct to address"
      );
      await browser.tabs.remove(composeTab2.id);
      await browser.tabs.remove(contentTab.id);

      // Create a popup window with a mailto url, which should create an empty
      // popup window and a new compose window/tab.

      const composeTabPromise3 = getComposeTabPromise();
      const popupWindow = await browser.windows.create({
        type: "popup",
        url: "mailto:user@invalid3",
      });
      browser.test.assertEq(
        "popup",
        popupWindow.type,
        "We should have found a popup window."
      );

      const composeTab3 = await composeTabPromise3;
      const composeDetails3 = await browser.compose.getComposeDetails(
        composeTab3.id
      );
      browser.test.assertEq(
        "user@invalid3",
        composeDetails3.to[0],
        "Composer should have the correct to address"
      );
      await browser.tabs.remove(composeTab3.id);

      // Update the popupWindow with a mailto url, which should open a new
      // compose window/tab.

      const [popupTab] = await browser.tabs.query({ windowId: popupWindow.id });
      const composeTabPromise4 = getComposeTabPromise();
      await browser.tabs.update(popupTab.id, { url: "mailto:user@invalid4" });
      const composeTab4 = await composeTabPromise4;
      const composeDetails4 = await browser.compose.getComposeDetails(
        composeTab4.id
      );
      browser.test.assertEq(
        "user@invalid4",
        composeDetails4.to[0],
        "Composer should have the correct to address"
      );
      await browser.tabs.remove(composeTab4.id);
      await browser.windows.remove(popupWindow.id);

      // Test updating a compose window (like with any other tab, that currently
      // creates a new compose tab and does not update the current compose tab).

      const details1 = { to: ['"Mr. Holmes" <holmes@bakerstreet.invalid>'] };
      const newComposeTab = await browser.compose.beginNew(details1);
      browser.test.assertEq(
        "messageCompose",
        newComposeTab.type,
        "Should have found a compose tab."
      );
      const details2 = await browser.compose.getComposeDetails(
        newComposeTab.id
      );
      window.assertDeepEqual(
        details1.to,
        details2.to,
        "We should see the correct compose details."
      );

      const composeTabPromise5 = getComposeTabPromise();
      await browser.tabs.update(newComposeTab.id, {
        url: "mailto:user@invalid5",
      });
      const composeTab5 = await composeTabPromise5;
      const composeDetails5 = await browser.compose.getComposeDetails(
        composeTab5.id
      );
      browser.test.assertEq(
        "user@invalid5",
        composeDetails5.to[0],
        "Composer should have the correct to address"
      );
      await browser.tabs.remove(composeTab5.id);
      await browser.tabs.remove(newComposeTab.id);

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

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

/**
 * Reload content, message and compose tabs and check if it fails for everything
 * except for content tabs.
 */
add_task(async function testReloadTabs() {
  const files = {
    "background.js": async () => {
      // Test a mail tab.

      let [mailTab] = await browser.mailTabs.query({
        active: true,
        currentWindow: true,
      });
      browser.test.assertTrue(!!mailTab, "Should have found a mail tab.");

      // Load a content URL by updating the mail tab.
      await new Promise(resolve => {
        let urlSeen = false;
        const updateListener = (tabId, changeInfo) => {
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

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
