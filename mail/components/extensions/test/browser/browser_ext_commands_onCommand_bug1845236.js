/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

add_task(async function test_multiple_messages_selected() {
  const account = createAccount();
  const rootFolder = account.incomingServer.rootFolder;
  const subFolders = rootFolder.subFolders;
  await createMessages(subFolders[0], 2);
  await TestUtils.waitForCondition(
    () => subFolders[0].messages.hasMoreElements(),
    "Messages should be added to folder"
  );

  async function background() {
    browser.commands.onCommand.addListener((commandName, activeTab) => {
      browser.test.sendMessage("oncommand event received", {
        commandName,
        activeTab,
      });
    });

    const { messages } = await browser.messages.query({
      autoPaginationTimeout: 0,
    });
    await browser.mailTabs.setSelectedMessages(messages.map(m => m.id));
    const { messages: selectedMessages } =
      await browser.mailTabs.getSelectedMessages();
    browser.test.assertEq(
      selectedMessages.length,
      2,
      "Should have two messages selected"
    );

    browser.test.sendMessage("ready");
  }

  const extension = ExtensionTestUtils.loadExtension({
    manifest: {
      permissions: ["accountsRead", "messagesRead"],
      commands: {
        "test-multi-message": {
          suggested_key: {
            default: "Ctrl+Up",
          },
        },
      },
    },
    background,
  });

  await extension.startup();
  await extension.awaitMessage("ready");

  // Trigger the registered command.
  await BrowserTestUtils.synthesizeKey(
    "VK_UP",
    {
      accelKey: true,
    },
    window.browsingContext
  );
  const message = await extension.awaitMessage("oncommand event received");
  is(
    message.commandName,
    "test-multi-message",
    `Expected onCommand listener to fire with the correct name: test-multi-message`
  );
  is(
    message.activeTab.type,
    "mail",
    `Expected onCommand listener to fire with the correct tab type: mail`
  );

  await extension.unload();
});
