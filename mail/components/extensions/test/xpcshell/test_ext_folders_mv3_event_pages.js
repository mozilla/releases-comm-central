/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);

var { AddonTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/AddonTestUtils.sys.mjs"
);

ExtensionTestUtils.mockAppInfo();
AddonTestUtils.maybeInit(this);

registerCleanupFunction(async () => {
  // Remove the temporary MozillaMailnews folder, which is not deleted in time when
  // the cleanupFunction registered by AddonTestUtils.maybeInit() checks for left over
  // files in the temp folder.
  // Note: PathUtils.tempDir points to the system temp folder, which is different.
  const path = PathUtils.join(
    Services.dirsvc.get("TmpD", Ci.nsIFile).path,
    "MozillaMailnews"
  );
  await IOUtils.remove(path, { recursive: true });
});

// Test events and persistent events for Manifest V3 for onCreated, onRenamed,
// onMoved, onCopied and onDeleted.
add_task(
  {
    skip_if: () => IS_NNTP,
  },
  async function test_folders_MV3_event_pages() {
    await AddonTestUtils.promiseStartupManager();

    const account = createAccount();
    const rootFolder = account.incomingServer.rootFolder;
    addIdentity(account, "id1@invalid");

    const files = {
      "background.js": () => {
        for (const eventName of [
          "onCreated",
          "onDeleted",
          "onCopied",
          "onRenamed",
          "onMoved",
        ]) {
          browser.folders[eventName].addListener(async (...args) => {
            browser.test.log(`${eventName} received: ${JSON.stringify(args)}`);
            browser.test.sendMessage(`${eventName} received`, args);
          });
        }

        browser.test.sendMessage("background started");
      },
      "utils.js": await getUtilsJS(),
    };
    const extension = ExtensionTestUtils.loadExtension({
      files,
      manifest: {
        manifest_version: 3,
        background: { scripts: ["utils.js", "background.js"] },
        permissions: ["accountsRead"],
      },
    });

    // Function to start an event page extension (MV3), which can be called whenever
    // the main test is about to trigger an event. The extension terminates its
    // background and listens for that single event, verifying it is waking up correctly.
    async function event_page_extension(eventName, actionCallback) {
      const ext = ExtensionTestUtils.loadExtension({
        files: {
          "background.js": async () => {
            // Whenever the extension starts or wakes up, hasFired is set to false. In
            // case of a wake-up, the first fired event is the one that woke up the background.
            let hasFired = false;
            const _eventName = browser.runtime.getManifest().description;

            browser.folders[_eventName].addListener(async (...args) => {
              // Only send the first event after background wake-up, this should
              // be the only one expected.
              if (!hasFired) {
                hasFired = true;
                browser.test.sendMessage(`${_eventName} received`, args);
              }
            });

            browser.test.sendMessage("background started");
          },
        },
        manifest: {
          manifest_version: 3,
          description: eventName,
          background: { scripts: ["background.js"] },
          permissions: ["accountsRead"],
        },
      });
      await ext.startup();
      await ext.awaitMessage("background started");
      // The listener should be persistent, but not primed.
      assertPersistentListeners(ext, "folders", eventName, { primed: false });

      await ext.terminateBackground({ disableResetIdleForTest: true });
      // Verify the primed persistent listener.
      assertPersistentListeners(ext, "folders", eventName, { primed: true });

      await actionCallback();
      const rv = await ext.awaitMessage(`${eventName} received`);
      await ext.awaitMessage("background started");
      // The listener should be persistent, but not primed.
      assertPersistentListeners(ext, "folders", eventName, { primed: false });

      await ext.unload();
      return rv;
    }

    await extension.startup();
    await extension.awaitMessage("background started");

    // Create a test folder before terminating the background script, to make sure
    // everything is sane.

    rootFolder.createSubfolder("TestFolder", null);
    await extension.awaitMessage("onCreated received");
    if (IS_IMAP) {
      // IMAP creates a default Trash folder on the fly.
      await extension.awaitMessage("onCreated received");
    }

    // Create SubFolder1.

    {
      rootFolder.createSubfolder("SubFolder1", null);
      const createData = await extension.awaitMessage("onCreated received");
      Assert.deepEqual(
        [
          {
            id: `${account.key}://SubFolder1`,
            accountId: account.key,
            name: "SubFolder1",
            path: "/SubFolder1",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
          },
        ],
        createData,
        "The onCreated event should return the correct values"
      );
    }

    // Create SubFolder2 (used for primed onFolderInfoChanged).

    {
      const primedChangeData = await event_page_extension(
        "onFolderInfoChanged",
        () => {
          rootFolder.createSubfolder("SubFolder3", null);
        }
      );
      const createData = await extension.awaitMessage("onCreated received");
      Assert.deepEqual(
        [
          {
            id: `${account.key}://SubFolder3`,
            accountId: account.key,
            name: "SubFolder3",
            path: "/SubFolder3",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
          },
        ],
        createData,
        "The onCreated event should return the correct values"
      );
      // Testing for onFolderInfoChanged is difficult, because it may not be for
      // the last created folder, but for one of the folders created earlier. We
      // therefore do not check the folder, but only the value.
      Assert.deepEqual(
        { totalMessageCount: 0, unreadMessageCount: 0 },
        primedChangeData[1],
        "The primed onFolderInfoChanged event should return the correct values"
      );
    }

    // Copy.

    {
      const primedCopyData = await event_page_extension("onCopied", () => {
        MailServices.copy.copyFolder(
          rootFolder.getChildNamed("SubFolder3"),
          rootFolder.getChildNamed("SubFolder1"),
          false,
          null,
          null
        );
      });
      const copyData = await extension.awaitMessage("onCopied received");
      Assert.deepEqual(
        primedCopyData,
        copyData,
        "The primed onCopied event should return the correct values"
      );
      Assert.deepEqual(
        [
          {
            id: `${account.key}://SubFolder3`,
            accountId: account.key,
            name: "SubFolder3",
            path: "/SubFolder3",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
          },
          {
            id: `${account.key}://SubFolder1/SubFolder3`,
            accountId: account.key,
            name: "SubFolder3",
            path: "/SubFolder1/SubFolder3",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
          },
        ],
        copyData,
        "The onCopied event should return the correct values"
      );

      if (IS_IMAP) {
        // IMAP fires an additional create event.
        const createData = await extension.awaitMessage("onCreated received");
        Assert.deepEqual(
          [
            {
              id: `${account.key}://SubFolder1/SubFolder3`,
              accountId: account.key,
              name: "SubFolder3",
              path: "/SubFolder1/SubFolder3",
              specialUse: [],
              isFavorite: false,
              isRoot: false,
            },
          ],
          createData,
          "The onCreated event should return the correct MailFolder values."
        );
      }
    }

    // Move.

    {
      const primedMoveData = await event_page_extension("onMoved", () => {
        MailServices.copy.copyFolder(
          rootFolder.getChildNamed("SubFolder1").getChildNamed("SubFolder3"),
          rootFolder.getChildNamed("SubFolder3"),
          true,
          null,
          null
        );
      });

      const moveData = await extension.awaitMessage("onMoved received");
      Assert.deepEqual(
        primedMoveData,
        moveData,
        "The primed onMoved event should return the correct values"
      );
      Assert.deepEqual(
        [
          {
            id: `${account.key}://SubFolder1/SubFolder3`,
            accountId: account.key,
            name: "SubFolder3",
            path: "/SubFolder1/SubFolder3",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
          },
          {
            id: `${account.key}://SubFolder3/SubFolder3`,
            accountId: account.key,
            name: "SubFolder3",
            path: "/SubFolder3/SubFolder3",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
          },
        ],
        moveData,
        "The onMoved event should return the correct values"
      );

      if (IS_IMAP) {
        // IMAP fires additional rename and delete events.
        const renameData = await extension.awaitMessage("onRenamed received");
        Assert.deepEqual(
          [
            {
              id: `${account.key}://SubFolder1/SubFolder3`,
              accountId: account.key,
              name: "SubFolder3",
              path: "/SubFolder1/SubFolder3",
              specialUse: [],
              isFavorite: false,
              isRoot: false,
            },
            {
              id: `${account.key}://SubFolder3/SubFolder3`,
              accountId: account.key,
              name: "SubFolder3",
              path: "/SubFolder3/SubFolder3",
              specialUse: [],
              isFavorite: false,
              isRoot: false,
            },
          ],
          renameData,
          "The onRenamed event should return the correct MailFolder values."
        );
        const deleteData = await extension.awaitMessage("onDeleted received");
        Assert.deepEqual(
          [
            {
              id: `${account.key}://SubFolder1/SubFolder3`,
              accountId: account.key,
              name: "SubFolder3",
              path: "/SubFolder1/SubFolder3",
              specialUse: [],
              isFavorite: false,
              isRoot: false,
            },
          ],
          deleteData,
          "The onDeleted event should return the correct MailFolder values."
        );
      }
    }

    // Delete.

    {
      const primedDeleteData = await event_page_extension("onDeleted", () => {
        const subFolder1 = rootFolder.getChildNamed("SubFolder3");
        subFolder1.propagateDelete(
          subFolder1.getChildNamed("SubFolder3"),
          true
        );
      });
      const deleteData = await extension.awaitMessage("onDeleted received");
      Assert.deepEqual(
        primedDeleteData,
        deleteData,
        "The primed onDeleted event should return the correct values"
      );
      Assert.deepEqual(
        [
          {
            id: `${account.key}://SubFolder3/SubFolder3`,
            accountId: account.key,
            name: "SubFolder3",
            path: "/SubFolder3/SubFolder3",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
          },
        ],
        deleteData,
        "The onDeleted event should return the correct values"
      );
    }

    // Rename.

    {
      const primedRenameData = await event_page_extension("onRenamed", () => {
        rootFolder.getChildNamed("TestFolder").rename("TestFolder2", null);
      });
      const renameData = await extension.awaitMessage("onRenamed received");
      Assert.deepEqual(
        primedRenameData,
        renameData,
        "The primed onRenamed event should return the correct values"
      );
      if (IS_IMAP) {
        // IMAP server sends an additional onDeleted and onCreated.
        await extension.awaitMessage("onDeleted received");
        await extension.awaitMessage("onCreated received");
      }
      Assert.deepEqual(
        [
          {
            id: `${account.key}://TestFolder`,
            accountId: account.key,
            name: "TestFolder",
            path: "/TestFolder",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
          },
          {
            id: `${account.key}://TestFolder2`,
            accountId: account.key,
            name: "TestFolder2",
            path: "/TestFolder2",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
          },
        ],
        renameData,
        "The onRenamed event should return the correct values"
      );
    }

    await extension.unload();

    cleanUpAccount(account);
    await AddonTestUtils.promiseShutdownManager();
  }
);
