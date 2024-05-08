/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let messages;
const about3Pane = document.getElementById("tabmail").currentAbout3Pane;

add_setup(async () => {
  const account = createAccount();
  const rootFolder = account.incomingServer.rootFolder;
  const trashFolder = rootFolder.getChildNamed("Trash");

  rootFolder.createSubfolder("Test1", null);
  const testFolder = rootFolder.getChildNamed("Test1");
  testFolder.createSubfolder("Test2", null);

  createMessages(trashFolder, 10);
  about3Pane.displayFolder(trashFolder);
});

add_task(async () => {
  async function background() {
    async function checkState(id, expectedWebExtState, expectedNativeState) {
      const state = await browser.mailTabs.get(id);
      window.assertDeepEqual(
        expectedWebExtState,
        state,
        "mailTab state should be as expected"
      );
      await window.sendMessage("checkNativeState", expectedNativeState);
      return state;
    }

    const tagFolderLabel1 = await browser.folders.getTagFolder("$label1");
    const unifiedInbox = await browser.folders.getUnifiedFolder("inbox");

    const { id: mailTabId } = await browser.mailTabs.getCurrent();
    const [trashFolder] = await browser.folders.query({ name: "Trash" });
    const [testFolder] = await browser.folders.query({ name: "Test2" });

    const accountId = trashFolder.accountId;
    const [rootFolder] = await browser.folders.query({
      accountId,
      isRoot: true,
    });

    const { messages: trashMessages } = await browser.messages.list(
      trashFolder.id
    );

    // Test initial state.
    await checkState(
      mailTabId,
      {
        folderMode: "all",
        folderModesEnabled: ["all"],
        displayedFolder: { id: trashFolder.id },
      },
      {
        modeName: "all",
        activeModes: ["all"],
        folderUri: `mailbox://${accountId}user@localhost/Trash`,
      }
    );

    // Force a switch to the "unified" mode. It should get enabled, and the Trash
    // folder should be selected in the unified container.
    await browser.mailTabs.update(mailTabId, {
      folderMode: "unified",
    });
    await checkState(
      mailTabId,
      {
        folderMode: "unified",
        folderModesEnabled: ["all", "unified"],
        displayedFolder: { id: trashFolder.id },
      },
      {
        modeName: "smart",
        activeModes: ["all", "smart"],
        folderUri: `mailbox://${accountId}user@localhost/Trash`,
      }
    );

    // Switch order of modes.
    await browser.mailTabs.update(mailTabId, {
      folderModesEnabled: ["unified", "all"],
    });
    await checkState(
      mailTabId,
      {
        folderMode: "unified",
        folderModesEnabled: ["unified", "all"],
        displayedFolder: { id: trashFolder.id },
      },
      {
        modeName: "smart",
        activeModes: ["smart", "all"],
        folderUri: `mailbox://${accountId}user@localhost/Trash`,
      }
    );

    // Switch to the test folder and enforce "all" mode.
    await browser.mailTabs.update(mailTabId, {
      folderMode: "all",
      displayedFolderId: testFolder.id,
    });
    await checkState(
      mailTabId,
      {
        folderMode: "all",
        folderModesEnabled: ["unified", "all"],
        displayedFolder: { id: testFolder.id },
      },
      {
        modeName: "all",
        activeModes: ["smart", "all"],
        folderUri: `mailbox://${accountId}user@localhost/Test1/Test2`,
      }
    );

    // Switching to the trash folder and enforcing "tags" mode should throw.
    browser.test.assertRejects(
      browser.mailTabs.update(mailTabId, {
        folderMode: "tags",
        displayedFolderId: trashFolder.id,
      }),
      /Requested folder is not viewable in the requested folder mode/,
      "Should reject requesting an non-matching folder/mode pair"
    );
    // The "tags" mode should have been enabled nevertheless.
    await checkState(
      mailTabId,
      {
        folderMode: "all",
        folderModesEnabled: ["unified", "all", "tags"],
        displayedFolder: { id: testFolder.id },
      },
      {
        modeName: "all",
        activeModes: ["smart", "all", "tags"],
        folderUri: `mailbox://${accountId}user@localhost/Test1/Test2`,
      }
    );

    // Displaying a message from the trash folder should not switch to the top
    // most "unified" container, but stick at the current "all" container.
    await browser.mailTabs.setSelectedMessages([trashMessages[0].id]);
    await checkState(
      mailTabId,
      {
        folderMode: "all",
        folderModesEnabled: ["unified", "all", "tags"],
        displayedFolder: { id: trashFolder.id },
      },
      {
        modeName: "all",
        activeModes: ["smart", "all", "tags"],
        folderUri: `mailbox://${accountId}user@localhost/Trash`,
      }
    );

    // Bring "tags" mode to the top and disable "all" mode, the trash folder should
    // get selected in the remaining "unified" mode.
    await browser.mailTabs.update(mailTabId, {
      folderModesEnabled: ["tags", "unified"],
    });
    await checkState(
      mailTabId,
      {
        folderMode: "unified",
        folderModesEnabled: ["tags", "unified"],
        displayedFolder: { id: trashFolder.id },
      },
      {
        modeName: "smart",
        activeModes: ["tags", "smart"],
        folderUri: `mailbox://${accountId}user@localhost/Trash`,
      }
    );

    // Enable "recent" mode and add it to the top. Nothing else should change.
    await browser.mailTabs.update(mailTabId, {
      folderModesEnabled: ["recent", "tags", "unified"],
    });
    await checkState(
      mailTabId,
      {
        folderMode: "unified",
        folderModesEnabled: ["recent", "tags", "unified"],
        displayedFolder: { id: trashFolder.id },
      },
      {
        modeName: "smart",
        activeModes: ["recent", "tags", "smart"],
        folderUri: `mailbox://${accountId}user@localhost/Trash`,
      }
    );

    // Switching to the "tags" mode should deselect the trash folder and select
    // the first entry in the tags container.
    await browser.mailTabs.update(mailTabId, {
      folderMode: "tags",
    });
    await checkState(
      mailTabId,
      {
        folderMode: "tags",
        folderModesEnabled: ["recent", "tags", "unified"],
        displayedFolder: { id: tagFolderLabel1.id },
      },
      {
        modeName: "tags",
        activeModes: ["recent", "tags", "smart"],
        folderUri: "mailbox://nobody@smart%20mailboxes/tags/%24label1",
      }
    );

    // Enable only the "tags" mode.
    await browser.mailTabs.update(mailTabId, {
      folderModesEnabled: ["tags"],
    });
    await checkState(
      mailTabId,
      {
        folderMode: "tags",
        folderModesEnabled: ["tags"],
        displayedFolder: { id: tagFolderLabel1.id },
      },
      {
        modeName: "tags",
        activeModes: ["tags"],
        folderUri: "mailbox://nobody@smart%20mailboxes/tags/%24label1",
      }
    );

    // Displaying a messages from the trash folder should throw.
    browser.test.assertRejects(
      browser.mailTabs.setSelectedMessages([trashMessages[0].id]),
      /Folder of the requested message\(s\) is not viewable in any of the enabled folder modes/,
      "Displaying a message which is not viewable should throw"
    );

    // Enforce only the "all" mode. Since we disable the "tags" mode, the first
    // entry of the only remaining enabled "all" mode should be selected.
    await browser.mailTabs.update(mailTabId, {
      folderModesEnabled: ["all"],
    });
    await checkState(
      mailTabId,
      {
        folderModesEnabled: ["all"],
        folderMode: "all",
        displayedFolder: { id: rootFolder.id },
      },
      {
        modeName: "all",
        activeModes: ["all"],
        folderUri: `mailbox://${accountId}user@localhost`,
      }
    );

    // Switching to a unified folder while "unified" mode is not enabled should
    // throw.
    browser.test.assertRejects(
      browser.mailTabs.update(mailTabId, {
        displayedFolderId: unifiedInbox.id,
      }),
      /Requested folder is not viewable in any of the enabled folder modes/,
      "Should reject if it is not possible to view the requested folder."
    );

    browser.test.notifyPass("finished");
  }

  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": background,
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["messagesRead", "accountsRead"],
    },
  });

  extension.onMessage("checkNativeState", async expected => {
    const actual = {
      modeName: about3Pane.folderTree.selectedRow.modeName,
      activeModes: about3Pane.folderPane.activeModes,
      folderUri: about3Pane.folderTree.selectedRow.uri,
    };
    Assert.deepEqual(actual, expected);
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
