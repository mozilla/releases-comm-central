/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

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
  let path = PathUtils.join(
    Services.dirsvc.get("TmpD", Ci.nsIFile).path,
    "MozillaMailnews"
  );
  await IOUtils.remove(path, { recursive: true });
});

// Function to start an event page extension (MV3), which can be called whenever
// the main test is about to trigger an event. The extension terminates its
// background and listens for that single event, verifying it is waking up correctly.
async function event_page_extension(eventName, actionCallback) {
  let ext = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        // Whenever the extension starts or wakes up, hasFired is set to false. In
        // case of a wake-up, the first fired event is the one that woke up the background.
        let hasFired = false;
        let _eventName = browser.runtime.getManifest().description;

        browser.messages[_eventName].addListener(async (...args) => {
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
      browser_specific_settings: {
        gecko: { id: "event_page_extension@mochi.test" },
      },
      permissions: ["accountsRead", "messagesRead", "messagesMove"],
    },
  });
  await ext.startup();
  await ext.awaitMessage("background started");
  // The listener should be persistent, but not primed.
  assertPersistentListeners(ext, "messages", eventName, { primed: false });

  await ext.terminateBackground({ disableResetIdleForTest: true });
  // Verify the primed persistent listener.
  assertPersistentListeners(ext, "messages", eventName, { primed: true });

  await actionCallback();
  let rv = await ext.awaitMessage(`${eventName} received`);
  await ext.awaitMessage("background started");
  // The listener should be persistent, but not primed.
  assertPersistentListeners(ext, "messages", eventName, { primed: false });

  await ext.unload();
  return rv;
}

add_task(async function () {
  await AddonTestUtils.promiseStartupManager();

  let account = createAccount();
  let inbox = await createSubfolder(account.incomingServer.rootFolder, "test1");

  let files = {
    "background.js": async () => {
      browser.messages.onNewMailReceived.addListener((folder, messageList) => {
        window.assertDeepEqual(
          { accountId: "account1", name: "test1", path: "/test1" },
          folder
        );
        browser.test.sendMessage("onNewMailReceived event received", [
          folder,
          messageList,
        ]);
      });
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

  await extension.startup();

  // Create a new message.

  await createMessages(inbox, 1);
  inbox.hasNewMessages = true;
  inbox.setNumNewMessages(1);
  inbox.biffState = Ci.nsIMsgFolder.nsMsgBiffState_NewMail;

  let inboxMessages = [...inbox.messages];
  let onNewMailReceivedEventData = await extension.awaitMessage(
    "onNewMailReceived event received"
  );
  equal(onNewMailReceivedEventData[1].messages.length, 1);
  equal(
    onNewMailReceivedEventData[1].messages[0].subject,
    inboxMessages[0].subject
  );

  // Create 2 more new messages.

  let primedOnNewMailReceivedEventData = await event_page_extension(
    "onNewMailReceived",
    async () => {
      await createMessages(inbox, 2);
      inbox.hasNewMessages = true;
      inbox.setNumNewMessages(2);
      inbox.biffState = Ci.nsIMsgFolder.nsMsgBiffState_NewMail;
    }
  );

  inboxMessages = [...inbox.messages];
  onNewMailReceivedEventData = await extension.awaitMessage(
    "onNewMailReceived event received"
  );

  // Checks the folder type property of the given message and returns a clone
  // where the type has been removed.
  function preCheckFolderType(message, expected) {
    Assert.deepEqual(
      message.folder.type,
      expected,
      "Folder type should be correct"
    );
    let m = JSON.parse(JSON.stringify(message));
    delete m.folder.type;
    return m;
  }

  Assert.deepEqual(
    preCheckFolderType({ folder: primedOnNewMailReceivedEventData[0] }, []),
    preCheckFolderType({ folder: onNewMailReceivedEventData[0] }, undefined),
    "The primed and non-primed onNewMailReceived events should return the same folder"
  );

  Assert.deepEqual(
    {
      id: primedOnNewMailReceivedEventData[1].id,
      messages: primedOnNewMailReceivedEventData[1].messages.map(m =>
        preCheckFolderType(m, [])
      ),
    },
    {
      id: onNewMailReceivedEventData[1].id,
      messages: onNewMailReceivedEventData[1].messages.map(m =>
        preCheckFolderType(m, undefined)
      ),
    },
    "The primed and non-primed onNewMailReceived events should return the same messages"
  );

  equal(onNewMailReceivedEventData[1].messages.length, 2);
  equal(
    onNewMailReceivedEventData[1].messages[0].subject,
    inboxMessages[1].subject
  );
  equal(
    onNewMailReceivedEventData[1].messages[1].subject,
    inboxMessages[2].subject
  );

  await extension.unload();

  cleanUpAccount(account);
  await AddonTestUtils.promiseShutdownManager();
});
