/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_setup(async () => {
  let account = createAccount();
  let rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("folder0", null);

  let subFolders = {};
  for (let folder of rootFolder.subFolders) {
    subFolders[folder.name] = folder;
  }
  createMessages(subFolders.folder0, 5);
});

add_task(async function testOpenMessagesInDefault() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        // Verify startup conditions.
        let accounts = await browser.accounts.list();
        browser.test.assertEq(
          1,
          accounts.length,
          `number of accounts should be correct`
        );

        let folder0 = accounts[0].folders.find(f => f.name == "folder0");
        browser.test.assertTrue(!!folder0, "folder should exist");
        let { messages: messages1 } = await browser.messages.list(folder0);
        browser.test.assertEq(
          5,
          messages1.length,
          `number of messages should be correct`
        );

        // Open multiple messages using their headerMessageIds.
        let promisedTabs = [];
        promisedTabs.push(
          await browser.messageDisplay.open({
            headerMessageId: messages1[0].headerMessageId,
          })
        );
        promisedTabs.push(
          await browser.messageDisplay.open({
            headerMessageId: messages1[1].headerMessageId,
          })
        );
        promisedTabs.push(
          await browser.messageDisplay.open({
            headerMessageId: messages1[2].headerMessageId,
          })
        );
        promisedTabs.push(
          await browser.messageDisplay.open({
            headerMessageId: messages1[3].headerMessageId,
          })
        );
        promisedTabs.push(
          await browser.messageDisplay.open({
            headerMessageId: messages1[4].headerMessageId,
          })
        );
        let openedTabs = await Promise.allSettled(promisedTabs);
        for (let i = 0; i < 5; i++) {
          browser.test.assertEq(
            "fulfilled",
            openedTabs[i].status,
            `Promise for the opened message should have been fulfilled for message ${i}`
          );
          let msg = await browser.messageDisplay.getDisplayedMessage(
            openedTabs[i].value.id
          );
          browser.test.assertEq(
            messages1[i].id,
            msg.id,
            `Should see the correct message in window ${i}`
          );
          await browser.tabs.remove(openedTabs[i].value.id);
        }

        browser.test.notifyPass();
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead", "tabs"],
    },
  });

  await extension.startup();
  await extension.awaitFinish();
  await extension.unload();
});
