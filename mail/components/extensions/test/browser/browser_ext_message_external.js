/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var gAccount;
var gFolder;

add_setup(() => {
  gAccount = createAccount();
  const rootFolder = gAccount.incomingServer.rootFolder;
  rootFolder.createSubfolder("test0", null);
  gFolder = rootFolder.getChildNamed("test0");
  createMessages(gFolder, 5);
});

add_task(async function testExternalMessage() {
  // Copy eml file into the profile folder, where we can delete it during the test.
  const profileDir = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  profileDir.initWithPath(PathUtils.profileDir);
  const sampleFile = new FileUtils.File(
    getTestFilePath("messages/attachedMessageSample.eml")
  );
  sampleFile.copyTo(profileDir, "attachedMessageSample.eml");

  const files = {
    "background.js": async () => {
      const platformInfo = await browser.runtime.getPlatformInfo();

      const emlData = {
        openExternalFileMessage: {
          headerMessageId: "sample.eml@mime.sample",
          author: "Batman <bruce@wayne-enterprises.com>",
          ccList: ["Robin <damian@wayne-enterprises.com>"],
          subject: "Attached message with attachments",
          attachments: 2,
          size: 9754,
          external: true,
          read: undefined,
          recipients: ["Heinz <mueller@example.com>"],
          date: 958796995000,
          body: "This message has one normal attachment and one email attachment",
        },
        openExternalAttachedMessage: {
          headerMessageId: "sample-attached.eml@mime.sample",
          author: "Superman <clark.kent@dailyplanet.com>",
          ccList: ["Jimmy <jimmy.Olsen@dailyplanet.com>"],
          subject: "Test message",
          attachments: 3,
          size: platformInfo.os == "win" ? 6947 : 6825, // Line endings.
          external: true,
          read: undefined,
          recipients: ["Heinz Müller <mueller@examples.com>"],
          date: 958606367000,
          body: "Die Hasen und die Frösche",
        },
      };

      const [{ displayedFolder, windowId: mainWindowId }] =
        await browser.mailTabs.query({
          active: true,
          currentWindow: true,
        });

      // Open an external file, either from file or via API.
      async function openAndVerifyExternalMessage(
        actionOrMessageId,
        location,
        expected
      ) {
        const tabPromise = window.waitForEvent("tabs.onCreated");
        const messagePromise = window.waitForEvent(
          "messageDisplay.onMessageDisplayed"
        );

        let returnedMsgTab;
        if (Number.isInteger(actionOrMessageId)) {
          returnedMsgTab = await browser.messageDisplay.open({
            messageId: actionOrMessageId,
            location,
          });
        } else {
          await window.sendMessage(actionOrMessageId, location);
        }
        const [msgTab] = await tabPromise;
        const [openedMsgTab, message] = await messagePromise;

        if ("windowId" in expected) {
          browser.test.assertEq(
            expected.windowId,
            msgTab.windowId,
            "The opened tab should belong to the correct window"
          );
        } else {
          browser.test.assertTrue(
            msgTab.windowId != mainWindowId,
            "The opened tab should not belong to the main window"
          );
        }
        browser.test.assertEq(
          msgTab.id,
          openedMsgTab.id,
          "The opened tab should match the onMessageDisplayed event tab"
        );

        if (Number.isInteger(actionOrMessageId)) {
          browser.test.assertEq(
            msgTab.id,
            returnedMsgTab.id,
            "The returned tab should match the onMessageDisplayed event tab"
          );
        }

        if ("messageId" in expected) {
          browser.test.assertEq(
            expected.messageId,
            message.id,
            "The message should have the same ID as it did previously"
          );
        }

        // Test the received message and the re-queried message.
        for (const msg of [message, await browser.messages.get(message.id)]) {
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

        const raw = await browser.messages.getRaw(message.id);
        browser.test.assertTrue(
          raw.startsWith(`Message-ID: <${expected.headerMessageId}>`),
          "Raw msg should be correct"
        );

        const full = await browser.messages.getFull(message.id);
        browser.test.assertTrue(
          full.headers["message-id"].includes(`<${expected.headerMessageId}>`),
          "Message-ID of full msg should be correct"
        );
        browser.test.assertTrue(
          full.parts[0].parts[0].body.includes(expected.body),
          "Body of full msg should be correct"
        );

        const attachments = await browser.messages.listAttachments(message.id);
        browser.test.assertEq(
          expected.attachments,
          attachments.length,
          "Should find the correct number of attachments"
        );

        await browser.tabs.remove(msgTab.id);
        return message;
      }

      // Check API operations on the given message.
      async function testMessageOperations(message) {
        // Test copying a file message into Thunderbird.
        const { messages: messagesBeforeCopy } = await browser.messages.list(
          displayedFolder.id
        );
        await browser.messages.copy([message.id], displayedFolder.id);
        const { messages: messagesAfterCopy } = await browser.messages.list(
          displayedFolder.id
        );
        browser.test.assertEq(
          messagesBeforeCopy.length + 1,
          messagesAfterCopy.length,
          "The file message should have been copied into the current folder"
        );
        const { messages } = await browser.messages.query({
          folderId: displayedFolder.id,
          headerMessageId: message.headerMessageId,
        });
        browser.test.assertTrue(
          messages.length == 1,
          "A query should find the new copied file message in the current folder"
        );

        // All other operations should fail.
        await browser.test.assertRejects(
          browser.messages.update(message.id, {}),
          `Error updating message: Operation not permitted for external messages`,
          "Updating external messages should throw."
        );

        await browser.test.assertRejects(
          browser.messages.delete([message.id]),
          `Error deleting message: Operation not permitted for external messages`,
          "Deleting external messages should throw."
        );

        await browser.test.assertRejects(
          browser.messages.archive([message.id]),
          `Error archiving message: Operation not permitted for external messages`,
          "Archiving external messages should throw."
        );

        await browser.test.assertRejects(
          browser.messages.move([message.id], displayedFolder.id),
          `Error moving message: Operation not permitted for external messages`,
          "Moving external messages should throw."
        );

        return messages[0];
      }

      // Open an external message in a tab and check its details.
      const externalMessage = await openAndVerifyExternalMessage(
        "openExternalFileMessage",
        "tab",
        { ...emlData.openExternalFileMessage, windowId: mainWindowId }
      );
      // Open and check the same message in a window.
      await openAndVerifyExternalMessage("openExternalFileMessage", "window", {
        ...emlData.openExternalFileMessage,
        messageId: externalMessage.id,
      });
      // Open and check the same message in a tab, using the API.
      await openAndVerifyExternalMessage(externalMessage.id, "tab", {
        ...emlData.openExternalFileMessage,
        messageId: externalMessage.id,
        windowId: mainWindowId,
      });
      // Open and check the same message in a window, using the API.
      await openAndVerifyExternalMessage(externalMessage.id, "window", {
        ...emlData.openExternalFileMessage,
        messageId: externalMessage.id,
      });

      // Test operations on the external message. This will put a copy in a
      // folder that we can use for the next step.
      const copiedMessage = await testMessageOperations(externalMessage);
      const messagePromise = window.waitForEvent(
        "messageDisplay.onMessageDisplayed"
      );
      await browser.mailTabs.setSelectedMessages([copiedMessage.id]);
      await messagePromise;

      // Open an attached message in a tab and check its details.
      const attachedMessage = await openAndVerifyExternalMessage(
        "openExternalAttachedMessage",
        "tab",
        { ...emlData.openExternalAttachedMessage, windowId: mainWindowId }
      );
      // Open and check the same message in a window.
      await openAndVerifyExternalMessage(
        "openExternalAttachedMessage",
        "window",
        {
          ...emlData.openExternalAttachedMessage,
          messageId: attachedMessage.id,
        }
      );
      // Open and check the same message in a tab, using the API.
      await openAndVerifyExternalMessage(attachedMessage.id, "tab", {
        ...emlData.openExternalAttachedMessage,
        messageId: attachedMessage.id,
        windowId: mainWindowId,
      });
      // Open and check the same message in a window, using the API.
      await openAndVerifyExternalMessage(attachedMessage.id, "window", {
        ...emlData.openExternalAttachedMessage,
        messageId: attachedMessage.id,
      });

      // Test operations on the attached message.
      await testMessageOperations(attachedMessage);

      // Delete the local eml file to trigger access errors.
      await window.sendMessage(`deleteExternalMessage`);

      await browser.test.assertRejects(
        browser.messages.update(externalMessage.id, {}),
        `Error updating message: Message not found: ${externalMessage.id}.`,
        "Updating a missing message should throw."
      );

      await browser.test.assertRejects(
        browser.messages.delete([externalMessage.id]),
        `Error deleting message: Message not found: ${externalMessage.id}.`,
        "Deleting a missing message should throw."
      );

      await browser.test.assertRejects(
        browser.messages.archive([externalMessage.id]),
        `Error archiving message: Message not found: ${externalMessage.id}.`,
        "Archiving a missing message should throw."
      );

      await browser.test.assertRejects(
        browser.messages.move([externalMessage.id], displayedFolder.id),
        `Error moving message: Message not found: ${externalMessage.id}.`,
        "Moving a missing message should throw."
      );

      await browser.test.assertRejects(
        browser.messages.copy([externalMessage.id], displayedFolder.id),
        `Error copying message: Message not found: ${externalMessage.id}.`,
        "Copying a missing message should throw."
      );

      await browser.test.assertRejects(
        browser.messageDisplay.open({ messageId: externalMessage.id }),
        `Unknown or invalid messageId: ${externalMessage.id}.`,
        "Opening a missing message should throw."
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
        "messagesUpdate",
      ],
    },
  });

  const tabmail = document.getElementById("tabmail");
  const about3Pane = tabmail.currentAbout3Pane;
  about3Pane.displayFolder(gFolder.URI);
  about3Pane.threadTree.selectedIndex = 0;

  extension.onMessage("openExternalFileMessage", async location => {
    const messagePath = PathUtils.join(
      PathUtils.profileDir,
      "attachedMessageSample.eml"
    );
    const messageFile = new FileUtils.File(messagePath);
    const url = Services.io
      .newFileURI(messageFile)
      .mutate()
      .setQuery("type=application/x-message-display")
      .finalize();

    Services.prefs.setIntPref(
      "mail.openMessageBehavior",
      MailConsts.OpenMessageBehavior[
        location == "window" ? "NEW_WINDOW" : "NEW_TAB"
      ]
    );

    MailUtils.openEMLFile(window, messageFile, url);
    extension.sendMessage();
  });

  extension.onMessage("openExternalAttachedMessage", async location => {
    Services.prefs.setIntPref(
      "mail.openMessageBehavior",
      MailConsts.OpenMessageBehavior[
        location == "window" ? "NEW_WINDOW" : "NEW_TAB"
      ]
    );

    // The message with attachment should be loaded in the 3-pane tab.
    const aboutMessage = tabmail.currentAboutMessage;
    aboutMessage.toggleAttachmentList(true);
    EventUtils.synthesizeMouseAtCenter(
      aboutMessage.document.querySelector(".attachmentItem"),
      { clickCount: 2 },
      aboutMessage
    );
    extension.sendMessage();
  });

  extension.onMessage("deleteExternalMessage", async () => {
    const messagePath = PathUtils.join(
      PathUtils.profileDir,
      "attachedMessageSample.eml"
    );
    const messageFile = new FileUtils.File(messagePath);
    messageFile.remove(false);
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
