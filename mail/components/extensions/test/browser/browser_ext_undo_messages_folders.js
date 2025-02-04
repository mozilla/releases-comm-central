/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_setup(() => {
  const gAccount = createAccount();
  const rootFolder = gAccount.incomingServer.rootFolder;
  rootFolder.createSubfolder("test0", null);
  rootFolder.createSubfolder("test1", null);

  const subFolders = {};
  for (const folder of rootFolder.subFolders) {
    subFolders[folder.name] = folder;
  }
  createMessages(subFolders.test0, 5);
  createMessages(subFolders.test1, 5);

  // The test uses a deprecated option which throws an error in tests by default.
  Services.prefs.setBoolPref(
    "extensions.webextensions.warnings-as-errors",
    false
  );
  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref("extensions.webextensions.warnings-as-errors");
  });
});

add_task(async function testMessagesUndo() {
  const files = {
    "background.js": async () => {
      const [testFolder0] = await browser.folders.query({ name: "test0" });
      const [testFolder1] = await browser.folders.query({ name: "test1" });
      const { messages: messages0 } = await browser.messages.list(
        testFolder0.id
      );
      const { messages: messages1 } = await browser.messages.list(
        testFolder1.id
      );

      // Check initial conditions.
      browser.test.assertEq(
        5,
        messages0.length,
        "Number of messages should be correct"
      );
      browser.test.assertEq(
        5,
        messages1.length,
        "Number of messages should be correct"
      );
      await window.sendMessage(
        "checkAndResetUndoTransactions",
        "initial condition",
        0
      );

      // Test with isUserAction = false
      await browser.messages.copy([messages1[0].id], testFolder0.id);
      await window.sendMessage(
        "checkAndResetUndoTransactions",
        "copy with isUserAction == default",
        0
      );

      await browser.messages.move([messages1[1].id], testFolder0.id);
      await window.sendMessage(
        "checkAndResetUndoTransactions",
        "move with isUserAction == default",
        0
      );

      await browser.messages.delete([messages1[2].id], false);
      await window.sendMessage(
        "checkAndResetUndoTransactions",
        "delete with deletePermanently == false and isUserAction == default",
        0
      );

      await browser.messages.delete([messages1[3].id], true);
      await window.sendMessage(
        "checkAndResetUndoTransactions",
        "delete with deletePermanently == true and isUserAction == default",
        0
      );

      // Test with isUserAction = true
      await browser.messages.copy([messages0[0].id], testFolder1.id, {
        isUserAction: true,
      });
      await window.sendMessage(
        "checkAndResetUndoTransactions",
        "copy with isUserAction == true",
        1
      );

      await browser.messages.move([messages0[1].id], testFolder1.id, {
        isUserAction: true,
      });
      await window.sendMessage(
        "checkAndResetUndoTransactions",
        "move with isUserAction == true",
        1
      );

      await browser.messages.delete([messages0[2].id], {
        deletePermanently: false,
        isUserAction: true,
      });
      await window.sendMessage(
        "checkAndResetUndoTransactions",
        "delete with deletePermanently == false and isUserAction == true",
        1
      );

      // If we delete directly, undo should not be possible / ignored.
      await browser.messages.delete([messages0[3].id], {
        deletePermanently: true,
        isUserAction: true,
      });
      await window.sendMessage(
        "checkAndResetUndoTransactions",
        "delete with deletePermanently == true and isUserAction == true",
        0
      );

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: [
        "accountsRead",
        "messagesRead",
        "messagesMove",
        "messagesDelete",
      ],
    },
  });

  extension.onMessage(
    "checkAndResetUndoTransactions",
    (msg, expectedUndoCount) => {
      Assert.equal(
        window.messenger.transactionManager.numberOfUndoItems,
        expectedUndoCount,
        `Number of undo items should be correct for ${msg}`
      );
      window.messenger.transactionManager.clear();
      Assert.equal(
        window.messenger.transactionManager.numberOfUndoItems,
        0,
        "Number of undo items should be correct after reset"
      );
      extension.sendMessage();
    }
  );

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
