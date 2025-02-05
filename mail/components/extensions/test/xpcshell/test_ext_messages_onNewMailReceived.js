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
  const path = PathUtils.join(
    Services.dirsvc.get("TmpD", Ci.nsIFile).path,
    "MozillaMailnews"
  );
  await IOUtils.remove(path, { recursive: true });
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
  const rv = await ext.awaitMessage(`${eventName} received`);
  await ext.awaitMessage("background started");
  // The listener should be persistent, but not primed.
  assertPersistentListeners(ext, "messages", eventName, { primed: false });

  await ext.unload();
  return rv;
}

add_task(async function test_onNewMailReceived_default() {
  await AddonTestUtils.promiseStartupManager();

  const account = createAccount();
  const inbox = await createSubfolder(
    account.incomingServer.rootFolder,
    "test1"
  );

  const files = {
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

      browser.folders.onFolderInfoChanged.addListener((folder, info) => {
        browser.test.assertTrue(
          info.lastUsed,
          "Should have received a lastUsed update"
        );
        browser.test.sendMessage("onFolderInfoChanged event received");
      });
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
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
  await extension.awaitMessage("onFolderInfoChanged event received");

  // Create 2 more new messages.

  const primedOnNewMailReceivedEventData = await event_page_extension(
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

  Assert.deepEqual(
    { folder: primedOnNewMailReceivedEventData[0] },
    { folder: onNewMailReceivedEventData[0] },
    "The primed and non-primed onNewMailReceived events should return the same folder"
  );

  Assert.deepEqual(
    {
      id: primedOnNewMailReceivedEventData[1].id,
      messages: primedOnNewMailReceivedEventData[1].messages,
    },
    {
      id: onNewMailReceivedEventData[1].id,
      messages: onNewMailReceivedEventData[1].messages,
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
  await extension.awaitMessage("onFolderInfoChanged event received");

  await extension.unload();

  cleanUpAccount(account);
  await AddonTestUtils.promiseShutdownManager();
});

add_task(async function test_onNewMailReceived_custom() {
  const account = createAccount();
  const inbox = await createSubfolder(
    account.incomingServer.rootFolder,
    "test1"
  );
  const draft = await createSubfolder(
    account.incomingServer.rootFolder,
    "test2"
  );

  // Set the test2 folder to be a drafts folder, which should not trigger the
  // onNewMailReceived event in the default listener configuration.
  draft.setFlag(Ci.nsMsgFolderFlags.Drafts);

  const files = {
    "background.js": async () => {
      const seenByListener1 = [];
      const seenByListener2 = [];

      browser.test.onMessage.addListener(async msg => {
        if (msg == "checkListeners") {
          await window.waitForCondition(
            () => seenByListener1.length == 2,
            `The non-default listener should see two events.`
          );
          await window.waitForCondition(
            () => seenByListener2.length == 1,
            `The default listener should see one event.`
          );

          window.assertDeepEqual(
            ["test1", "test2"],
            seenByListener1.map(e => e.folder.name)
          );

          window.assertDeepEqual(
            ["test1"],
            seenByListener2.map(e => e.folder.name)
          );

          browser.test.notifyPass("finished");
        }
      });

      browser.messages.onNewMailReceived.addListener((folder, messageList) => {
        seenByListener1.push({ folder, messageList });
      }, true);

      browser.messages.onNewMailReceived.addListener((folder, messageList) => {
        seenByListener2.push({ folder, messageList });
        browser.test.sendMessage("onNewMailReceived event received");
      });
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
    },
  });

  await extension.startup();

  // Create a new message in drafts and inbox.

  await createMessages(inbox, 1);
  inbox.hasNewMessages = true;
  inbox.setNumNewMessages(1);
  inbox.biffState = Ci.nsIMsgFolder.nsMsgBiffState_NewMail;

  await createMessages(draft, 1);
  draft.hasNewMessages = true;
  draft.setNumNewMessages(1);
  draft.biffState = Ci.nsIMsgFolder.nsMsgBiffState_NewMail;

  await extension.awaitMessage("onNewMailReceived event received");

  extension.sendMessage("checkListeners");
  await extension.awaitFinish("finished");
  await extension.unload();

  cleanUpAccount(account);
});
