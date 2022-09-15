/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var gAccount;
var gFolder;

add_setup(() => {
  gAccount = createAccount();
  let rootFolder = gAccount.incomingServer.rootFolder;
  rootFolder.createSubfolder("test0", null);
  gFolder = rootFolder.getChildNamed("test0");
  createMessages(gFolder, 5);
});

add_task(async function testExternalMessage() {
  // Copy eml file into the profile folder, where we can delete it during the test.
  let profileDir = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  profileDir.initWithPath(PathUtils.profileDir);
  let messageFile = new FileUtils.File(
    getTestFilePath("messages/attachedMessageSample.eml")
  );
  messageFile.copyTo(profileDir, "attachedMessageSample.eml");

  let files = {
    "background.js": async () => {
      const emlData = {
        openExternalFileMessage: {
          headerMessageId: "sample.eml@mime.sample",
          author: "Batman <bruce@wayne-enterprises.com>",
          ccList: ["Robin <damian@wayne-enterprises.com>"],
          subject: "Attached message with attachments",
          attachments: 2,
          size: 9754,
          external: true,
          read: null,
          recipients: ["Heinz <mueller@example.com>"],
          date: 958796995000,
          body:
            "This message has one normal attachment and one email attachment",
        },
        openExternalAttachedMessage: {
          headerMessageId: "sample-attached.eml@mime.sample",
          author: "Superman <clark.kent@dailyplanet.com>",
          ccList: ["Jimmy <jimmy.Olsen@dailyplanet.com>"],
          subject: "Test message",
          attachments: 3,
          size: 0,
          external: true,
          read: null,
          recipients: ["Heinz Müller <mueller@examples.com>"],
          date: 958606367000,
          body: "Die Hasen und die Frösche",
        },
      };

      let [{ displayedFolder }] = await browser.mailTabs.query({
        active: true,
        currentWindow: true,
      });

      let foundMessages = [];

      // Open an external file, either from file or via API.
      async function openAndVerifyExternalMessage(actionOrMessageId, expected) {
        let windowPromise = window.waitForEvent("windows.onCreated");
        let messagePromise = window.waitForEvent(
          "messageDisplay.onMessageDisplayed"
        );

        let returnedMsgTab;
        if (Number.isInteger(actionOrMessageId)) {
          returnedMsgTab = await browser.messageDisplay.open({
            messageId: actionOrMessageId,
          });
        } else {
          await window.sendMessage(actionOrMessageId);
        }
        let [msgWindow] = await windowPromise;
        let [openedMsgTab, message] = await messagePromise;

        browser.test.assertEq(
          openedMsgTab.windowId,
          msgWindow.id,
          "The opened tab should belong to the correct window"
        );

        if (Number.isInteger(actionOrMessageId)) {
          browser.test.assertEq(
            returnedMsgTab.windowId,
            msgWindow.id,
            "The returned tab should belong to the correct window"
          );
        }

        // Test the received message and the re-queried message.
        for (let msg of [message, await browser.messages.get(message.id)]) {
          browser.test.assertEq(
            message.id,
            msg.id,
            "`The opened message should be correct."
          );
          browser.test.assertEq(
            expected.author,
            msg.author,
            "The author should be correct"
          );
          browser.test.assertEq(
            expected.headerMessageId,
            msg.headerMessageId,
            "The headerMessageId should be correct"
          );
          browser.test.assertEq(
            expected.subject,
            msg.subject,
            "The subject should be correct"
          );
          browser.test.assertEq(
            expected.size,
            msg.size,
            "The size should be correct"
          );
          browser.test.assertEq(
            expected.external,
            msg.external,
            "The external flag should be correct"
          );
          browser.test.assertEq(
            expected.date,
            msg.date.getTime(),
            "The date should be correct"
          );
          window.assertDeepEqual(
            expected.recipients,
            msg.recipients,
            "The recipients should be correct"
          );
          window.assertDeepEqual(
            expected.ccList,
            msg.ccList,
            "The carbon copy recipients should be correct"
          );
        }

        let raw = await browser.messages.getRaw(message.id);
        browser.test.assertTrue(
          raw.startsWith(`Message-ID: <${expected.headerMessageId}>`),
          "Raw msg should be correct"
        );

        let full = await browser.messages.getFull(message.id);
        browser.test.assertTrue(
          full.headers["message-id"].includes(`<${expected.headerMessageId}>`),
          "Message-ID of full msg should be correct"
        );
        browser.test.assertTrue(
          full.parts[0].parts[0].body.includes(expected.body),
          "Body of full msg should be correct"
        );

        let attachments = await browser.messages.listAttachments(message.id);
        browser.test.assertEq(
          expected.attachments,
          attachments.length,
          "Should find the correct number of attachments"
        );
        browser.windows.remove(msgWindow.id);
        return message;
      }

      for (let action of [
        "openExternalFileMessage",
        "openExternalAttachedMessage",
      ]) {
        let expected = emlData[action];

        // Open the external message file and check its details.
        let extMsgOpenByFile = await openAndVerifyExternalMessage(
          action,
          expected
        );

        // Open the external message via API and check its details.
        await openAndVerifyExternalMessage(extMsgOpenByFile.id, expected);

        // Open the external message file again and check if it returns the same id.
        let extMsgOpenByFileAgain = await openAndVerifyExternalMessage(
          action,
          expected
        );
        browser.test.assertEq(
          extMsgOpenByFile.id,
          extMsgOpenByFileAgain.id,
          "Should return the same messageId when opened again"
        );

        // Test copying a file message into Thunderbird.
        let { messages: messagesBeforeCopy } = await browser.messages.list(
          displayedFolder
        );
        await browser.messages.copy([extMsgOpenByFile.id], displayedFolder);
        let { messages: messagesAfterCopy } = await browser.messages.list(
          displayedFolder
        );
        browser.test.assertEq(
          messagesBeforeCopy.length + 1,
          messagesAfterCopy.length,
          "The file message should have been copied into the current folder"
        );
        let { messages } = await browser.messages.query({
          folder: displayedFolder,
          headerMessageId: expected.headerMessageId,
        });
        browser.test.assertTrue(
          messages.length == 1,
          "A query should find the new copied file message in the current folder"
        );

        // All other operations should fail.
        await browser.test.assertRejects(
          browser.messages.update(extMsgOpenByFile.id, {}),
          `Error updating message: Operation not permitted for external messages`,
          "Updating external messages should throw."
        );

        await browser.test.assertRejects(
          browser.messages.delete([extMsgOpenByFile.id]),
          `Error deleting message: Operation not permitted for external messages`,
          "Deleting external messages should throw."
        );

        await browser.test.assertRejects(
          browser.messages.archive([extMsgOpenByFile.id]),
          `Error archiving message: Operation not permitted for external messages`,
          "Archiving external messages should throw."
        );

        await browser.test.assertRejects(
          browser.messages.move([extMsgOpenByFile.id], displayedFolder),
          `Error moving message: Operation not permitted for external messages`,
          "Moving external messages should throw."
        );

        foundMessages[action] = extMsgOpenByFile.id;
      }

      // Delete the local eml file to trigger access errors.
      let messageId = foundMessages.openExternalFileMessage;
      await window.sendMessage(`deleteExternalMessage`);

      await browser.test.assertRejects(
        browser.messages.update(messageId, {}),
        `Error updating message: Message not found: ${messageId}.`,
        "Updating a missing message should throw."
      );

      await browser.test.assertRejects(
        browser.messages.delete([messageId]),
        `Error deleting message: Message not found: ${messageId}.`,
        "Deleting a missing message should throw."
      );

      await browser.test.assertRejects(
        browser.messages.archive([messageId]),
        `Error archiving message: Message not found: ${messageId}.`,
        "Archiving a missing message should throw."
      );

      await browser.test.assertRejects(
        browser.messages.move([messageId], displayedFolder),
        `Error moving message: Message not found: ${messageId}.`,
        "Moving a missing message should throw."
      );

      await browser.test.assertRejects(
        browser.messages.copy([messageId], displayedFolder),
        `Error copying message: Message not found: ${messageId}.`,
        "Copying a missing message should throw."
      );

      await browser.test.assertRejects(
        browser.messageDisplay.open({ messageId }),
        `Unknown or invalid messageId: ${messageId}.`,
        "Opening a missing message should throw."
      );

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
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

  let about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  about3Pane.displayFolder(gFolder.URI);
  about3Pane.threadTree.selectedIndex = 0;

  extension.onMessage("openExternalFileMessage", async () => {
    let messagePath = PathUtils.join(
      PathUtils.profileDir,
      "attachedMessageSample.eml"
    );
    let messageFile = new FileUtils.File(messagePath);
    let url = Services.io
      .newFileURI(messageFile)
      .mutate()
      .setQuery("type=application/x-message-display")
      .finalize();

    window.openDialog(
      "chrome://messenger/content/messageWindow.xhtml",
      "_blank",
      "all,chrome,dialog=no,status,toolbar",
      url
    );
    extension.sendMessage();
  });

  extension.onMessage("openExternalAttachedMessage", async () => {
    let messagePath = PathUtils.join(
      PathUtils.profileDir,
      "attachedMessageSample.eml"
    );
    let messageFile = new FileUtils.File(messagePath);
    let url = Services.io
      .newFileURI(messageFile)
      .mutate()
      .setScheme("mailbox")
      .setQuery(
        "number=0&part=1.2&filename=sample02.eml&type=application/x-message-display&filename=sample02.eml"
      )
      .finalize();

    window.openDialog(
      "chrome://messenger/content/messageWindow.xhtml",
      "_blank",
      "all,chrome,dialog=no,status,toolbar",
      url
    );
    extension.sendMessage();
  });

  extension.onMessage("deleteExternalMessage", async () => {
    let messagePath = PathUtils.join(
      PathUtils.profileDir,
      "attachedMessageSample.eml"
    );
    let messageFile = new FileUtils.File(messagePath);
    messageFile.remove(false);
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
