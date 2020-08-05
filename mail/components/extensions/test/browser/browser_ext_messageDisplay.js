/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals gFolderDisplay, gFolderTreeView, MsgOpenNewWindowForMessage, MsgOpenSelectedMessages  */

add_task(async () => {
  let extension = ExtensionTestUtils.loadExtension({
    async background() {
      let [{ id: firstTabId, displayedFolder }] = await browser.mailTabs.query({
        active: true,
        currentWindow: true,
      });

      let { messages } = await browser.messages.list(displayedFolder);

      function waitForMessage() {
        return new Promise(resolve => {
          let listener = (...args) => {
            browser.messageDisplay.onMessageDisplayed.removeListener(listener);
            resolve(args);
          };
          browser.messageDisplay.onMessageDisplayed.addListener(listener);
        });
      }

      async function checkResults(action, expectedMessages, sameTab) {
        let msgListener = waitForMessage();

        if (typeof action == "string") {
          browser.test.sendMessage(action);
        } else {
          action();
        }

        let [tab, message] = await msgListener;
        if (expectedMessages.length == 1) {
          if (sameTab) {
            browser.test.assertEq(firstTabId, tab.id);
          } else {
            browser.test.assertTrue(firstTabId != tab.id);
          }
          browser.test.assertEq(
            messages[expectedMessages[0]].subject,
            message.subject
          );

          message = await browser.messageDisplay.getDisplayedMessage(tab.id);
          browser.test.assertEq(
            messages[expectedMessages[0]].subject,
            message.subject
          );
        } else {
          // Figure this out
          browser.test.assertEq(false, true);
        }
        return tab;
      }

      // Test that selecting a different message fires the event.
      await checkResults("show message 1", [1], true);

      // ... and again, for good measure.
      await checkResults("show message 2", [2], true);

      // Test that opening a message in a new tab fires the event.
      let tab = await checkResults("open message tab", [2], false);

      // Test that the first tab is not displaying a message.
      let message = await browser.messageDisplay.getDisplayedMessage(
        firstTabId
      );
      browser.test.assertEq(null, message);

      // Closing the tab should return us to the first tab, and fires the
      // event. It doesn't have to be this way, it just is.
      await checkResults(() => browser.tabs.remove(tab.id), [2], true);

      // Test that opening a message in a new window fires the event.
      tab = await checkResults("open message window", [2], false);

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
