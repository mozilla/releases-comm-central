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

      async function testGetDisplayedMessageFunctions(tabId, expected) {
        let messages = await browser.messageDisplay.getDisplayedMessages(tabId);
        if (expected) {
          browser.test.assertEq(1, messages.length);
          browser.test.assertEq(expected.subject, messages[0].subject);
        } else {
          browser.test.assertEq(0, messages.length);
        }

        let message = await browser.messageDisplay.getDisplayedMessage(tabId);
        if (expected) {
          browser.test.assertEq(expected.subject, message.subject);
        } else {
          browser.test.assertEq(null, message);
        }
      }

      // Test that selecting a different message fires the event.
      await checkResults("show message 1", [1], true);

      // ... and again, for good measure.
      await checkResults("show message 2", [2], true);

      // Test that opening a message in a new tab fires the event.
      let tab = await checkResults("open message 0 in tab", [0], false);

      // The opened tab should return message #0.
      await testGetDisplayedMessageFunctions(tab.id, messages[0]);

      // The first tab should return message #2, even if it is currently not displayed.
      await testGetDisplayedMessageFunctions(firstTabId, messages[2]);

      // Closing the tab should return us to the first tab, and fires the
      // event. It doesn't have to be this way, it just is.
      await checkResults(() => browser.tabs.remove(tab.id), [2], true);

      // Test that opening a message in a new window fires the event.
      tab = await checkResults("open message 1 in window", [1], false);

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

  await extension.awaitMessage("open message 0 in tab");
  await openMessageInTab(messages[0]);

  await extension.awaitMessage("open message 1 in window");
  await openMessageInWindow(messages[1]);

  await extension.awaitMessage("show messages 1 and 2");
  window.gFolderDisplay.selectMessages(messages.slice(1, 3));

  await extension.awaitFinish("finished");
  await extension.unload();
});
