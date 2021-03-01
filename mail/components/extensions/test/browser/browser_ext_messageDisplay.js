/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  let files = {
    "background.js": async () => {
      let [{ id: firstTabId, displayedFolder }] = await browser.mailTabs.query({
        active: true,
        currentWindow: true,
      });

      let { messages } = await browser.messages.list(displayedFolder);

      async function checkResults(action, expectedMessages, sameTab) {
        let msgListener = window.waitForEvent(
          "messageDisplay.onMessageDisplayed"
        );
        let msgsListener = window.waitForEvent(
          "messageDisplay.onMessagesDisplayed"
        );

        if (typeof action == "string") {
          browser.test.sendMessage(action);
        } else {
          action();
        }

        let tab;
        let message;
        if (expectedMessages.length == 1) {
          [tab, message] = await msgListener;
          let [msgsTab, msgs] = await msgsListener;
          // Check listener results.
          if (sameTab) {
            browser.test.assertEq(firstTabId, tab.id);
            browser.test.assertEq(firstTabId, msgsTab.id);
          } else {
            browser.test.assertTrue(firstTabId != tab.id);
            browser.test.assertTrue(firstTabId != msgsTab.id);
          }
          browser.test.assertEq(
            messages[expectedMessages[0]].subject,
            message.subject
          );
          browser.test.assertEq(
            messages[expectedMessages[0]].subject,
            msgs[0].subject
          );

          // Check displayed message result.
          message = await browser.messageDisplay.getDisplayedMessage(tab.id);
          browser.test.assertEq(
            messages[expectedMessages[0]].subject,
            message.subject
          );
        } else {
          // onMessageDisplayed doesn't fire for the multi-message case.
          let msgs;
          [tab, msgs] = await msgsListener;

          for (let [i, expected] of expectedMessages.entries()) {
            browser.test.assertEq(messages[expected].subject, msgs[i].subject);
          }

          // More than one selected, so getDisplayMessage returns null.
          message = await browser.messageDisplay.getDisplayedMessage(tab.id);
          browser.test.assertEq(null, message);
        }

        let displayMsgs = await browser.messageDisplay.getDisplayedMessages(
          tab.id
        );
        browser.test.assertEq(expectedMessages.length, displayMsgs.length);
        for (let [i, expected] of expectedMessages.entries()) {
          browser.test.assertEq(
            messages[expected].subject,
            displayMsgs[i].subject
          );
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

      // The first tab still saves the selected messages, even if it isn't
      // showing the tab.
      let displayMsgs = await browser.messageDisplay.getDisplayedMessages(
        tab.id
      );
      browser.test.assertEq(1, displayMsgs.length);
      browser.test.assertEq(messages[2].subject, displayMsgs[0].subject);

      // Closing the tab should return us to the first tab, and fires the
      // event. It doesn't have to be this way, it just is.
      await checkResults(() => browser.tabs.remove(tab.id), [2], true);

      // Test that opening a message in a new window fires the event.
      tab = await checkResults("open message window", [2], false);

      // Close the window.
      browser.tabs.remove(tab.id);

      // Test that selecting a multiple messages fires the event.
      await checkResults("show messages 1 and 2", [1, 2], true);

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
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
  let messages = [...subFolders.test1.messages];

  window.gFolderTreeView.selectFolder(subFolders.test1);
  window.gFolderDisplay.selectViewIndex(0);

  await extension.startup();

  await extension.awaitMessage("show message 1");
  window.gFolderDisplay.selectViewIndex(1);

  await extension.awaitMessage("show message 2");
  window.gFolderDisplay.selectViewIndex(2);

  await extension.awaitMessage("open message tab");
  await openMessageInTab(messages[2]);

  await extension.awaitMessage("open message window");
  await openMessageInWindow(messages[2]);

  await extension.awaitMessage("show messages 1 and 2");
  window.gFolderDisplay.selectMessages(messages.slice(1, 3));

  await extension.awaitFinish("finished");
  await extension.unload();
});
