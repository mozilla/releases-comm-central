/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals gFolderDisplay, gFolderTreeView, MsgOpenNewWindowForMessage, MsgOpenSelectedMessages  */

add_task(async () => {
  let extension = ExtensionTestUtils.loadExtension({
    async background() {
      function waitForEvent() {
        return new Promise(resolve => {
          let listener = (...args) => {
            browser.messageDisplay.onMessageDisplayed.removeListener(listener);
            resolve(args);
          };
          browser.messageDisplay.onMessageDisplayed.addListener(listener);
        });
      }

      let [{ id: firstTabId, displayedFolder }] = await browser.mailTabs.query({
        active: true,
        currentWindow: true,
      });
      let { messages } = await browser.messages.list(displayedFolder);

      // Test that selecting a different message fires the event.
      let eventListener = waitForEvent();
      browser.test.sendMessage("show message 1");
      let [tab, message] = await eventListener;
      browser.test.assertEq(firstTabId, tab.id);
      browser.test.assertEq(messages[1].subject, message.subject);

      message = await browser.messageDisplay.getDisplayedMessage(tab.id);
      browser.test.assertEq(messages[1].subject, message.subject);

      // ... and again, for good measure.
      eventListener = waitForEvent();
      browser.test.sendMessage("show message 2");
      [tab, message] = await eventListener;
      browser.test.assertEq(firstTabId, tab.id);
      browser.test.assertEq(messages[2].subject, message.subject);

      message = await browser.messageDisplay.getDisplayedMessage(tab.id);
      browser.test.assertEq(messages[2].subject, message.subject);

      // Test that opening a message in a new tab fires the event.
      eventListener = waitForEvent();
      browser.test.sendMessage("open message tab");
      [tab, message] = await eventListener;
      browser.test.assertTrue(firstTabId != tab.id);
      browser.test.assertEq(messages[2].subject, message.subject);

      message = await browser.messageDisplay.getDisplayedMessage(tab.id);
      browser.test.assertEq(messages[2].subject, message.subject);

      // Test that the first tab is not displaying a message.
      message = await browser.messageDisplay.getDisplayedMessage(firstTabId);
      browser.test.assertEq(null, message);

      // Closing the tab should return us to the first tab, and fires the
      // event. It doesn't have to be this way, it just is.
      eventListener = waitForEvent();
      browser.tabs.remove(tab.id);
      [tab, message] = await eventListener;
      browser.test.assertEq(firstTabId, tab.id);
      browser.test.assertEq(messages[2].subject, message.subject);

      message = await browser.messageDisplay.getDisplayedMessage(tab.id);
      browser.test.assertEq(messages[2].subject, message.subject);

      // Test that opening a message in a new window fires the event.
      eventListener = waitForEvent();
      browser.test.sendMessage("open message window");
      [tab, message] = await eventListener;
      browser.test.assertTrue(firstTabId != tab.id);
      browser.test.assertEq(messages[2].subject, message.subject);

      message = await browser.messageDisplay.getDisplayedMessage(tab.id);
      browser.test.assertEq(messages[2].subject, message.subject);

      // Close the window.
      browser.tabs.remove(tab.id);

      browser.test.notifyPass("finished");
    },
    manifest: {
      permissions: ["accountsRead", "messagesRead"],
    },
  });

  let account = createAccount();
  let rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("test1", null);
  let subFolders = {};
  for (let folder of rootFolder.subFolders) {
    subFolders[folder.name] = folder;
  }
  createMessages(subFolders.test1, 5);

  gFolderTreeView.selectFolder(subFolders.test1);
  gFolderDisplay.selectViewIndex(0);

  await extension.startup();

  await extension.awaitMessage("show message 1");
  gFolderDisplay.selectViewIndex(1);

  await extension.awaitMessage("show message 2");
  gFolderDisplay.selectViewIndex(2);

  await extension.awaitMessage("open message tab");
  MsgOpenSelectedMessages();

  await extension.awaitMessage("open message window");
  MsgOpenNewWindowForMessage();

  await extension.awaitFinish("finished");
  await extension.unload();
});
