/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { ExtensionSupport } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionSupport.sys.mjs"
);
var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);
// Import the smtp server scripts
var { nsMailServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/Maild.sys.mjs"
);
var { SmtpDaemon, SMTP_RFC2821_handler } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/Smtpd.sys.mjs"
);
var { AuthPLAIN, AuthLOGIN, AuthCRAM } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/Auth.sys.mjs"
);

// Setup the daemon and server
function setupServerDaemon(handler) {
  if (!handler) {
    handler = function (d) {
      return new SMTP_RFC2821_handler(d);
    };
  }
  var server = new nsMailServer(handler, new SmtpDaemon());
  return server;
}

function getBasicSmtpServer(port = 1, hostname = "localhost") {
  const server = localAccountUtils.create_outgoing_server(
    port,
    "user",
    "password",
    hostname
  );

  // Override the default greeting so we get something predictable
  // in the ELHO message
  Services.prefs.setCharPref("mail.smtpserver.default.hello_argument", "test");

  return server;
}

function getSmtpIdentity(senderName, smtpServer) {
  // Set up the identity.
  const identity = MailServices.accounts.createIdentity();
  identity.email = senderName;
  identity.smtpServerKey = smtpServer.key;

  return identity;
}

var gServer;
var gLocalRootFolder;
let gPopAccount;
let gLocalAccount;

add_setup(() => {
  gServer = setupServerDaemon();
  gServer.start();

  // Test needs a non-local default account to be able to send messages.
  gPopAccount = createAccount("pop3");
  gLocalAccount = createAccount("local");
  MailServices.accounts.defaultAccount = gPopAccount;

  const identity = getSmtpIdentity(
    "identity@foo.invalid",
    getBasicSmtpServer(gServer.port)
  );
  gPopAccount.addIdentity(identity);
  gPopAccount.defaultIdentity = identity;

  // Test is using the Sent folder and Outbox folder of the local account.
  gLocalRootFolder = gLocalAccount.incomingServer.rootFolder;
  gLocalRootFolder.createSubfolder("Sent", null);
  gLocalRootFolder.createSubfolder("Drafts", null);
  gLocalRootFolder.createSubfolder("Fcc", null);
  MailServices.accounts.setSpecialFolders();

  requestLongerTimeout(4);

  registerCleanupFunction(() => {
    gServer.stop();
  });
});

// Helper function to test saving messages.
async function runTest(config) {
  const files = {
    "background.js": async () => {
      const [config] = await window.sendMessage("getConfig");

      const accounts = await browser.accounts.list();
      browser.test.assertEq(2, accounts.length, "number of accounts");
      const localAccount = accounts.find(a => a.type == "none");
      const fccFolder = localAccount.folders.find(f => f.name == "Fcc");
      browser.test.assertTrue(
        !!fccFolder,
        "should find the additional fcc folder"
      );

      // Prepare test data.
      const allDetails = [];
      for (let i = 0; i < 5; i++) {
        allDetails.push({
          to: [`test${i}@test.invalid`],
          subject: `Test${i} save as ${config.expected.mode}`,
          additionalFccFolder:
            config.expected.fcc.length > 1 ? fccFolder : null,
        });
      }

      // Open multiple compose windows.
      for (const details of allDetails) {
        details.tab = await browser.compose.beginNew(details);
      }

      // Add onAfterSave listener
      const collectedEventsMap = new Map();
      function onAfterSaveListener(tab, info) {
        collectedEventsMap.set(tab.id, info);
      }
      browser.compose.onAfterSave.addListener(onAfterSaveListener);

      // Initiate saving of all compose windows at the same time.
      const allPromises = [];
      for (const details of allDetails) {
        allPromises.push(
          browser.compose.saveMessage(details.tab.id, config.mode)
        );
      }

      // Wait until all messages have been saved.
      const allRv = await Promise.all(allPromises);

      for (let i = 0; i < allDetails.length; i++) {
        const rv = allRv[i];
        const details = allDetails[i];
        // Find the message with a matching headerMessageId.

        browser.test.assertEq(
          config.expected.mode,
          rv.mode,
          "The mode of the last message operation should be correct."
        );
        browser.test.assertEq(
          config.expected.fcc.length,
          rv.messages.length,
          "Should find the correct number of saved messages for this save operation."
        );

        // Check expected FCC folders.
        for (let i = 0; i < config.expected.fcc.length; i++) {
          // Read the actual messages in the fcc folder.
          const savedMessages = await window.sendMessage(
            "getMessagesInFolder",
            `${config.expected.fcc[i]}`
          );
          // Find the currently processed message.
          const savedMessage = savedMessages.find(
            m => m.messageId == rv.messages[i].headerMessageId
          );
          // Compare saved message to original message.
          browser.test.assertEq(
            details.subject,
            savedMessage.subject,
            "The subject of the message in the fcc folder should be correct."
          );

          // Check returned details.
          browser.test.assertEq(
            details.subject,
            rv.messages[i].subject,
            "The subject of the saved message should be correct."
          );
          browser.test.assertEq(
            details.to[0],
            rv.messages[i].recipients[0],
            "The recipients of the saved message should be correct."
          );
          browser.test.assertEq(
            `/${config.expected.fcc[i]}`,
            rv.messages[i].folder.path,
            "The saved message should be in the correct folder."
          );
        }

        const removedWindowPromise = window.waitForEvent("windows.onRemoved");
        browser.tabs.remove(details.tab.id);
        await removedWindowPromise;
      }

      // Check onAfterSave listener
      browser.compose.onAfterSave.removeListener(onAfterSaveListener);
      browser.test.assertEq(
        allDetails.length,
        collectedEventsMap.size,
        "Should have received the correct number of onAfterSave events"
      );
      const collectedEvents = [...collectedEventsMap.values()];
      for (const detail of allDetails) {
        const msg = collectedEvents.find(
          e => e.messages[0].subject == detail.subject
        );
        browser.test.assertTrue(
          msg,
          "Should have received an onAfterSave event for every single message"
        );
      }
      browser.test.assertEq(
        collectedEventsMap.size,
        collectedEvents.filter(e => e.mode == config.expected.mode).length,
        "All events should have the correct mode."
      );

      // Remove all saved messages.
      for (const fcc of config.expected.fcc) {
        await window.sendMessage("clearMessagesInFolder", fcc);
      }

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose", "compose.save", "messagesRead", "accountsRead"],
    },
  });

  extension.onMessage("getConfig", async () => {
    extension.sendMessage(config);
  });

  extension.onMessage("getMessagesInFolder", async folderName => {
    const folder = gLocalRootFolder.getChildNamed(folderName);
    const messages = [...folder.messages].map(m => {
      const { subject, messageId, recipients } = m;
      return { subject, messageId, recipients };
    });
    extension.sendMessage(...messages);
  });

  extension.onMessage("clearMessagesInFolder", async folderName => {
    const folder = gLocalRootFolder.getChildNamed(folderName);
    const messages = [...folder.messages];
    await new Promise(resolve => {
      folder.deleteMessages(
        messages,
        null,
        true,
        false,
        { onStopCopy: resolve },
        false
      );
    });

    Assert.equal(0, [...folder.messages].length, "folder should be empty");
    extension.sendMessage();
  });

  extension.onMessage("checkWindow", async expected => {
    await checkComposeHeaders(expected);
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
  gServer.resetTest();
}

// Test with default save mode.
add_task(async function test_default() {
  await runTest({
    mode: null,
    expected: {
      mode: "draft",
      fcc: ["Drafts"],
    },
  });
});

// Test with default save mode and additional fcc.
add_task(async function test_default_with_additional_fcc() {
  await runTest({
    mode: null,
    expected: {
      mode: "draft",
      fcc: ["Drafts", "Fcc"],
    },
  });
});

// Test with draft save mode.
add_task(async function test_saveAsDraft() {
  await runTest({
    mode: { mode: "draft" },
    expected: {
      mode: "draft",
      fcc: ["Drafts"],
    },
  });
});

// Test with draft save mode and additional fcc.
add_task(async function test_saveAsDraft_with_additional_fcc() {
  await runTest({
    mode: { mode: "draft" },
    expected: {
      mode: "draft",
      fcc: ["Drafts", "Fcc"],
    },
  });
});

// Test onAfterSave when saving drafts for MV3
add_task(async function test_onAfterSave_MV3_event_pages() {
  const files = {
    "background.js": async () => {
      // Whenever the extension starts or wakes up, hasFired is set to false. In
      // case of a wake-up, the first fired event is the one that woke up the background.
      let hasFired = false;

      browser.compose.onAfterSave.addListener((tab, saveInfo) => {
        // Only send the first event after background wake-up, this should be
        // the only one expected.
        if (!hasFired) {
          hasFired = true;
          browser.test.sendMessage("onAfterSave received", saveInfo);
        }
      });

      browser.test.sendMessage("background started");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose"],
      browser_specific_settings: {
        gecko: { id: "compose.onAfterSave@xpcshell.test" },
      },
    },
  });

  function checkPersistentListeners({ primed }) {
    // A persistent event is referenced by its moduleName as defined in
    // ext-mails.json, not by its actual namespace.
    const persistent_events = ["compose.onAfterSave"];

    for (const event of persistent_events) {
      const [moduleName, eventName] = event.split(".");
      assertPersistentListeners(extension, moduleName, eventName, {
        primed,
      });
    }
  }

  const composeWindow = await openComposeWindow(gPopAccount);
  await focusWindow(composeWindow);

  await extension.startup();
  await extension.awaitMessage("background started");
  // The listeners should be persistent, but not primed.
  checkPersistentListeners({ primed: false });

  // Trigger onAfterSave without terminating the background first.

  composeWindow.SetComposeDetails({ to: "first@invalid.net" });
  composeWindow.SaveAsDraft();
  const firstSaveInfo = await extension.awaitMessage("onAfterSave received");
  Assert.equal(
    "draft",
    firstSaveInfo.mode,
    "Returned SaveInfo should be correct"
  );

  // Terminate background and re-trigger onAfterSave.

  await extension.terminateBackground({ disableResetIdleForTest: true });
  // The listeners should be primed.
  checkPersistentListeners({ primed: true });

  composeWindow.SetComposeDetails({ to: "second@invalid.net" });
  composeWindow.SaveAsDraft();
  const secondSaveInfo = await extension.awaitMessage("onAfterSave received");
  Assert.equal(
    "draft",
    secondSaveInfo.mode,
    "Returned SaveInfo should be correct"
  );

  // The background should have been restarted.
  await extension.awaitMessage("background started");
  // The listener should no longer be primed.
  checkPersistentListeners({ primed: false });

  await extension.unload();
  composeWindow.close();
});
