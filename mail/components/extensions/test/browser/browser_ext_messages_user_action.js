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
  createMessages(subFolders.test0, 6);
  createMessages(subFolders.test1, 6);

  // The test uses a deprecated option which throws an error in tests by default.
  Services.prefs.setBoolPref(
    "extensions.webextensions.warnings-as-errors",
    false
  );
  Services.prefs.setStringPref("mail.last_msg_movecopy_target_uri", "");
  Services.prefs.setBoolPref("mail.last_msg_movecopy_was_move", false);
  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref("extensions.webextensions.warnings-as-errors");
    Services.prefs.clearUserPref("email.last_msg_movecopy_target_uri");
    Services.prefs.clearUserPref("email.last_msg_movecopy_was_move");
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
        6,
        messages0.length,
        "Number of messages should be correct"
      );
      browser.test.assertEq(
        6,
        messages1.length,
        "Number of messages should be correct"
      );
      await window.sendMessage("checkUserActions", {
        msg: "initial condition",
        expectedUndoCount: 0,
        expected_last_msg_movecopy_target_uri: "",
        expected_last_msg_movecopy_was_move: false,
      });

      // Test with isUserAction = false
      await browser.messages.copy([messages1[0].id], testFolder0.id);
      await window.sendMessage("checkUserActions", {
        msg: "copy with isUserAction == default",
        expectedUndoCount: 0,
        expected_last_msg_movecopy_target_uri: "",
        expected_last_msg_movecopy_was_move: false,
      });

      await browser.messages.move([messages1[1].id], testFolder0.id);
      await window.sendMessage("checkUserActions", {
        msg: "move with isUserAction == default",
        expectedUndoCount: 0,
        expected_last_msg_movecopy_target_uri: "",
        expected_last_msg_movecopy_was_move: false,
      });

      await browser.messages.delete([messages1[2].id], false);
      await window.sendMessage("checkUserActions", {
        msg: "delete with deletePermanently == false and isUserAction == default",
        expectedUndoCount: 0,
        expected_last_msg_movecopy_target_uri: "",
        expected_last_msg_movecopy_was_move: false,
      });

      await browser.messages.delete([messages1[3].id], true);
      await window.sendMessage("checkUserActions", {
        msg: "delete with deletePermanently == true and isUserAction == default",
        expectedUndoCount: 0,
        expected_last_msg_movecopy_target_uri: "",
        expected_last_msg_movecopy_was_move: false,
      });

      // Test with isUserAction = true
      await browser.messages.copy([messages1[0].id], testFolder0.id, {
        isUserAction: true,
      });
      await window.sendMessage("checkUserActions", {
        msg: "copy with isUserAction == true",
        expectedUndoCount: 1,
        expected_last_msg_movecopy_target_uri: "/test0",
        expected_last_msg_movecopy_was_move: false,
      });

      await browser.messages.move([messages0[1].id], testFolder1.id, {
        isUserAction: true,
      });
      await window.sendMessage("checkUserActions", {
        msg: "move with isUserAction == true",
        expectedUndoCount: 1,
        expected_last_msg_movecopy_target_uri: "/test1",
        expected_last_msg_movecopy_was_move: true,
      });

      await browser.messages.delete([messages0[2].id], {
        deletePermanently: false,
        isUserAction: true,
      });
      await window.sendMessage("checkUserActions", {
        msg: "delete with deletePermanently == false and isUserAction == true",
        expectedUndoCount: 1,
        expected_last_msg_movecopy_target_uri: "/test1",
        expected_last_msg_movecopy_was_move: true,
      });

      // If we delete directly, undo should not be possible / ignored.
      await browser.messages.delete([messages0[3].id], {
        deletePermanently: true,
        isUserAction: true,
      });
      await window.sendMessage("checkUserActions", {
        msg: "delete with deletePermanently == true and isUserAction == true",
        expectedUndoCount: 0,
        expected_last_msg_movecopy_target_uri: "/test1",
        expected_last_msg_movecopy_was_move: true,
      });

      // Test with isUserAction = false again, should not change last_msg_movecopy_*
      await browser.messages.copy([messages1[4].id], testFolder0.id);
      await window.sendMessage("checkUserActions", {
        msg: "copy with isUserAction == default",
        expectedUndoCount: 0,
        expected_last_msg_movecopy_target_uri: "/test1",
        expected_last_msg_movecopy_was_move: true,
      });

      await browser.messages.move([messages1[5].id], testFolder0.id);
      await window.sendMessage("checkUserActions", {
        msg: "move with isUserAction == default",
        expectedUndoCount: 0,
        expected_last_msg_movecopy_target_uri: "/test1",
        expected_last_msg_movecopy_was_move: true,
      });

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
    "checkUserActions",
    ({
      msg,
      expectedUndoCount,
      expected_last_msg_movecopy_target_uri,
      expected_last_msg_movecopy_was_move,
    }) => {
      const uri = Services.prefs.getStringPref(
        "mail.last_msg_movecopy_target_uri",
        null
      );
      const wasMove = Services.prefs.getBoolPref(
        "mail.last_msg_movecopy_was_move",
        null
      );

      Assert.ok(
        uri.endsWith(expected_last_msg_movecopy_target_uri),
        `last_msg_movecopy_target_uri should be correct for ${msg}`
      );
      Assert.equal(
        wasMove,
        expected_last_msg_movecopy_was_move,
        `last_msg_movecopy_was_move should be correct for ${msg}`
      );

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
