/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { ExtensionSupport } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionSupport.sys.mjs"
);
var { localAccountUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/LocalAccountUtils.jsm"
);
// Import the smtp server scripts
var {
  nsMailServer,
  gThreadManager,
  fsDebugNone,
  fsDebugAll,
  fsDebugRecv,
  fsDebugRecvSend,
} = ChromeUtils.import("resource://testing-common/mailnews/Maild.jsm");
var { SmtpDaemon, SMTP_RFC2821_handler } = ChromeUtils.import(
  "resource://testing-common/mailnews/Smtpd.jsm"
);
var { AuthPLAIN, AuthLOGIN, AuthCRAM } = ChromeUtils.import(
  "resource://testing-common/mailnews/Auth.jsm"
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
  let server = localAccountUtils.create_outgoing_server(
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
  let identity = MailServices.accounts.createIdentity();
  identity.email = senderName;
  identity.smtpServerKey = smtpServer.key;

  return identity;
}

function tracksentMessages(aSubject, aTopic, aMsgID) {
  // The aMsgID starts with < and ends with > which is not used by the API.
  let headerMessageId = aMsgID.replace(/^<|>$/g, "");
  gSentMessages.push(headerMessageId);
}

var gServer;
var gOutbox;
var gSentMessages = [];
let gPopAccount;
let gLocalAccount;

add_setup(() => {
  gServer = setupServerDaemon();
  gServer.start();

  // Test needs a non-local default account to be able to send messages.
  gPopAccount = createAccount("pop3");
  gLocalAccount = createAccount("local");
  MailServices.accounts.defaultAccount = gPopAccount;

  let identity = getSmtpIdentity(
    "identity@foo.invalid",
    getBasicSmtpServer(gServer.port)
  );
  gPopAccount.addIdentity(identity);
  gPopAccount.defaultIdentity = identity;

  // Test is using the Sent folder and Outbox folder of the local account.
  let rootFolder = gLocalAccount.incomingServer.rootFolder;
  rootFolder.createSubfolder("Sent", null);
  MailServices.accounts.setSpecialFolders();
  gOutbox = rootFolder.getChildNamed("Outbox");

  Services.obs.addObserver(tracksentMessages, "mail:composeSendSucceeded");

  registerCleanupFunction(() => {
    gServer.stop();
    Services.obs.removeObserver(tracksentMessages, "mail:composeSendSucceeded");
  });
});

add_task(async function test_no_permission() {
  let files = {
    "background.js": async () => {
      let details = {
        to: ["send@test.invalid"],
        subject: "Test send",
      };

      // Open a compose window with a message.
      let tab = await browser.compose.beginNew(details);

      // Send now. It should fail due to the missing compose.send permission.
      await browser.test.assertThrows(
        () => browser.compose.sendMessage(tab.id),
        /browser.compose.sendMessage is not a function/,
        "browser.compose.sendMessage() should reject, if the permission compose.send is not granted."
      );

      // Clean up.
      let removedWindowPromise = window.waitForEvent("windows.onRemoved");
      browser.tabs.remove(tab.id);
      await removedWindowPromise;

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function test_fail() {
  let files = {
    "background.js": async () => {
      let details = {
        to: ["send@test.invalid"],
        subject: "Test send",
      };

      // Open a compose window with a message.
      let createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew(details);
      let [createdWindow] = await createdWindowPromise;
      browser.test.assertEq("messageCompose", createdWindow.type);

      await window.sendMessage("checkWindow", details);

      let [tab] = await browser.tabs.query({ windowId: createdWindow.id });

      browser.compose.onBeforeSend.addListener(() => {
        return { cancel: true };
      });

      // Add onAfterSend listener
      let collectedEventsMap = new Map();
      function onAfterSendListener(tab, info) {
        collectedEventsMap.set(tab.id, info);
      }
      browser.compose.onAfterSend.addListener(onAfterSendListener);

      // Send now. It should fail due to the aborting onBeforeSend listener.
      await browser.test.assertRejects(
        browser.compose.sendMessage(tab.id),
        /Send aborted by an onBeforeSend event/,
        "browser.compose.sendMessage() should reject, if the message could not be send."
      );

      // Check onAfterSend listener
      browser.compose.onAfterSend.removeListener(onAfterSendListener);
      browser.test.assertEq(
        1,
        collectedEventsMap.size,
        "Should have received the correct number of onAfterSend events"
      );
      browser.test.assertEq(
        "Send aborted by an onBeforeSend event",
        collectedEventsMap.get(tab.id).error,
        "Should have received the correct error"
      );

      // Clean up.
      let removedWindowPromise = window.waitForEvent("windows.onRemoved");
      browser.windows.remove(createdWindow.id);
      await removedWindowPromise;

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose", "compose.send"],
    },
  });

  extension.onMessage("checkWindow", async expected => {
    await checkComposeHeaders(expected);
    extension.sendMessage();
  });

  extension.onMessage("getSentMessages", async () => {
    extension.sendMessage(gSentMessages);
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function test_send() {
  let files = {
    "background.js": async () => {
      let details = {
        to: ["send@test.invalid"],
        subject: "Test send",
      };

      // Open a compose window with a message.
      let createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew(details);
      let [createdWindow] = await createdWindowPromise;
      browser.test.assertEq("messageCompose", createdWindow.type);

      await window.sendMessage("checkWindow", details);

      let [tab] = await browser.tabs.query({ windowId: createdWindow.id });

      // Add onAfterSend listener
      let collectedEventsMap = new Map();
      function onAfterSendListener(tab, info) {
        collectedEventsMap.set(tab.id, info);
      }
      browser.compose.onAfterSend.addListener(onAfterSendListener);

      // Send now.
      let removedWindowPromise = window.waitForEvent("windows.onRemoved");
      let rv = await browser.compose.sendMessage(tab.id);
      let [sentMessages] = await window.sendMessage("getSentMessages");

      browser.test.assertEq(
        1,
        sentMessages.length,
        "Number of total messages sent should be correct."
      );
      browser.test.assertEq(
        "sendNow",
        rv.mode,
        "The mode of the last message operation should be correct."
      );
      browser.test.assertEq(
        sentMessages[0],
        rv.headerMessageId,
        "The headerMessageId of last message sent should be correct."
      );
      browser.test.assertEq(
        sentMessages[0],
        rv.messages[0].headerMessageId,
        "The headerMessageId in the copy of last message sent should be correct."
      );

      // Window should have closed after send.
      await removedWindowPromise;

      // Check onAfterSend listener
      browser.compose.onAfterSend.removeListener(onAfterSendListener);
      browser.test.assertEq(
        1,
        collectedEventsMap.size,
        "Should have received the correct number of onAfterSend events"
      );
      browser.test.assertTrue(
        collectedEventsMap.has(tab.id),
        "The received event should belong to the correct tab."
      );
      browser.test.assertEq(
        "sendNow",
        collectedEventsMap.get(tab.id).mode,
        "The received event should have the correct mode."
      );
      browser.test.assertEq(
        rv.headerMessageId,
        collectedEventsMap.get(tab.id).headerMessageId,
        "The received event should have the correct headerMessageId."
      );
      browser.test.assertEq(
        rv.headerMessageId,
        collectedEventsMap.get(tab.id).messages[0].headerMessageId,
        "The message in the received event should have the correct headerMessageId."
      );

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose", "compose.send"],
    },
  });

  extension.onMessage("checkWindow", async expected => {
    await checkComposeHeaders(expected);
    extension.sendMessage();
  });

  extension.onMessage("getSentMessages", async () => {
    extension.sendMessage(gSentMessages);
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function test_sendDefault() {
  let files = {
    "background.js": async () => {
      let details = {
        to: ["sendDefault@test.invalid"],
        subject: "Test sendDefault",
      };

      // Open a compose window with a message.
      let createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew(details);
      let [createdWindow] = await createdWindowPromise;
      browser.test.assertEq("messageCompose", createdWindow.type);

      await window.sendMessage("checkWindow", details);

      let [tab] = await browser.tabs.query({ windowId: createdWindow.id });

      // Send via default mode, which should be sendNow.
      let removedWindowPromise = window.waitForEvent("windows.onRemoved");
      let rv = await browser.compose.sendMessage(tab.id, { mode: "default" });
      let [sentMessages] = await window.sendMessage("getSentMessages");

      browser.test.assertEq(
        2,
        sentMessages.length,
        "Number of total messages sent should be correct."
      );
      browser.test.assertEq(
        "sendNow",
        rv.mode,
        "The mode of the last message operation should be correct."
      );
      browser.test.assertEq(
        sentMessages[1],
        rv.headerMessageId,
        "The headerMessageId of last message sent should be correct."
      );
      browser.test.assertEq(
        sentMessages[1],
        rv.messages[0].headerMessageId,
        "The headerMessageId in the copy of last message sent should be correct."
      );

      // Window should have closed after send.
      await removedWindowPromise;

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose", "compose.send"],
    },
  });

  extension.onMessage("checkWindow", async expected => {
    await checkComposeHeaders(expected);
    extension.sendMessage();
  });

  extension.onMessage("getSentMessages", async () => {
    extension.sendMessage(gSentMessages);
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
  gServer.resetTest();
});

add_task(async function test_sendNow() {
  let files = {
    "background.js": async () => {
      let details = {
        to: ["sendNow@test.invalid"],
        subject: "Test sendNow",
      };

      // Open a compose window with a message.
      let createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew(details);
      let [createdWindow] = await createdWindowPromise;
      browser.test.assertEq("messageCompose", createdWindow.type);

      await window.sendMessage("checkWindow", details);

      let [tab] = await browser.tabs.query({ windowId: createdWindow.id });

      // Send via sendNow mode.
      let removedWindowPromise = window.waitForEvent("windows.onRemoved");
      let rv = await browser.compose.sendMessage(tab.id, { mode: "sendNow" });
      let [sentMessages] = await window.sendMessage("getSentMessages");

      browser.test.assertEq(
        3,
        sentMessages.length,
        "Number of total messages sent should be correct."
      );
      browser.test.assertEq(
        "sendNow",
        rv.mode,
        "The mode of the last message operation should be correct."
      );
      browser.test.assertEq(
        sentMessages[2],
        rv.headerMessageId,
        "The headerMessageId of last message sent should be correct."
      );
      browser.test.assertEq(
        sentMessages[2],
        rv.messages[0].headerMessageId,
        "The headerMessageId in the copy of last message sent should be correct."
      );

      // Window should have closed after send.
      await removedWindowPromise;

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose", "compose.send"],
    },
  });

  extension.onMessage("checkWindow", async expected => {
    await checkComposeHeaders(expected);
    extension.sendMessage();
  });

  extension.onMessage("getSentMessages", async () => {
    extension.sendMessage(gSentMessages);
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function test_sendLater() {
  let files = {
    "background.js": async () => {
      let details = {
        to: ["sendLater@test.invalid"],
        subject: "Test sendLater",
      };

      let createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew(details);
      let [createdWindow] = await createdWindowPromise;
      browser.test.assertEq("messageCompose", createdWindow.type);

      await window.sendMessage("checkWindow", details);

      let [tab] = await browser.tabs.query({ windowId: createdWindow.id });

      // Send Later.

      let rv = await browser.compose.sendMessage(tab.id, { mode: "sendLater" });
      let [outboxMessage] = await window.sendMessage(
        "checkMessagesInOutbox",
        details
      );

      browser.test.assertEq(
        "sendLater",
        rv.mode,
        "The mode of the last message operation should be correct."
      );
      browser.test.assertEq(
        outboxMessage,
        rv.messages[0].headerMessageId,
        "The headerMessageId in the copy of last message sent should be correct."
      );

      await window.sendMessage("clearMessagesInOutbox");
      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose", "compose.send", "messagesRead", "accountsRead"],
    },
  });

  extension.onMessage("checkMessagesInOutbox", async expected => {
    // Check if the sendLater request did put the message in the outbox.
    let outboxMessages = [...gOutbox.messages];
    Assert.ok(outboxMessages.length == 1);
    let sentMessage = outboxMessages.shift();
    Assert.equal(sentMessage.subject, expected.subject, "subject is correct");
    Assert.equal(sentMessage.recipients, expected.to, "recipient is correct");
    extension.sendMessage(sentMessage.messageId);
  });

  extension.onMessage("clearMessagesInOutbox", async () => {
    let outboxMessages = [...gOutbox.messages];
    await new Promise(resolve => {
      gOutbox.deleteMessages(
        outboxMessages,
        null,
        true,
        false,
        { OnStopCopy: resolve },
        false
      );
    });

    Assert.equal(0, [...gOutbox.messages].length, "outbox should be empty");
    extension.sendMessage();
  });

  extension.onMessage("checkWindow", async expected => {
    await checkComposeHeaders(expected);
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function test_onComposeStateChanged() {
  let files = {
    "background.js": async () => {
      let numberOfEvents = 0;
      browser.compose.onComposeStateChanged.addListener(async (tab, state) => {
        numberOfEvents++;
        browser.test.log(`State #${numberOfEvents}: ${JSON.stringify(state)}`);
        switch (numberOfEvents) {
          case 1:
            // The fresh created composer has no recipient, send is disabled.
            browser.test.assertEq(false, state.canSendNow);
            browser.test.assertEq(false, state.canSendLater);
            break;

          case 2:
            // The composer updated its initial details data, send is enabled.
            browser.test.assertEq(true, state.canSendNow);
            browser.test.assertEq(true, state.canSendLater);
            break;

          case 3:
            // The recipient has been invalidated, send is disabled.
            browser.test.assertEq(false, state.canSendNow);
            browser.test.assertEq(false, state.canSendLater);
            break;

          case 4:
            // The recipient has been reverted, send is enabled.
            browser.test.assertEq(true, state.canSendNow);
            browser.test.assertEq(true, state.canSendLater);

            // Clean up.

            let removedWindowPromise = window.waitForEvent("windows.onRemoved");
            browser.windows.remove(createdWindow.id);
            await removedWindowPromise;

            browser.test.notifyPass("finished");
            break;
        }
      });

      // The call to beginNew should create two onComposeStateChanged events,
      // one after the empty window has been created and one after the initial
      // details have been set.
      let createdWindowPromise = window.waitForEvent("windows.onCreated");
      let createdTab = await browser.compose.beginNew({
        to: ["test@test.invalid"],
        subject: "Test part 1",
        body: "Original body.",
      });
      let [createdWindow] = await createdWindowPromise;
      browser.test.assertEq("messageCompose", createdWindow.type);

      // Trigger an onComposeStateChanged event by invalidating the recipient.
      await browser.compose.setComposeDetails(createdTab.id, {
        to: ["test"],
        subject: "Test part 2",
      });

      // Trigger an onComposeStateChanged event by reverting the recipient.
      await browser.compose.setComposeDetails(createdTab.id, {
        to: ["test@test.invalid"],
        subject: "Test part 3",
      });
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

// Test onAfterSend for MV3
add_task(async function test_onAfterSend_MV3_event_pages() {
  let files = {
    "background.js": async () => {
      // Whenever the extension starts or wakes up, hasFired is set to false. In
      // case of a wake-up, the first fired event is the one that woke up the background.
      let hasFired = false;

      browser.compose.onAfterSend.addListener(async (tab, sendInfo) => {
        // Only send the first event after background wake-up, this should be
        // the only one expected.
        if (!hasFired) {
          hasFired = true;
          browser.test.sendMessage("onAfterSend received", sendInfo);
        }
      });

      browser.test.sendMessage("background started");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose"],
      browser_specific_settings: {
        gecko: { id: "compose.onAfterSend@xpcshell.test" },
      },
    },
  });

  function checkPersistentListeners({ primed }) {
    // A persistent event is referenced by its moduleName as defined in
    // ext-mails.json, not by its actual namespace.
    const persistent_events = ["compose.onAfterSend"];

    for (let event of persistent_events) {
      let [moduleName, eventName] = event.split(".");
      assertPersistentListeners(extension, moduleName, eventName, {
        primed,
      });
    }
  }

  await extension.startup();
  await extension.awaitMessage("background started");
  // The listeners should be persistent, but not primed.
  checkPersistentListeners({ primed: false });

  // Trigger onAfterSend without terminating the background first.

  let firstComposeWindow = await openComposeWindow(gPopAccount);
  await focusWindow(firstComposeWindow);
  firstComposeWindow.SetComposeDetails({ to: "first@invalid.net" });
  firstComposeWindow.SetComposeDetails({ subject: "First message" });
  firstComposeWindow.SendMessage();
  let firstSaveInfo = await extension.awaitMessage("onAfterSend received");
  Assert.equal(
    "sendNow",
    firstSaveInfo.mode,
    "Returned SaveInfo should be correct"
  );

  // Terminate background and re-trigger onAfterSend.

  await extension.terminateBackground({ disableResetIdleForTest: true });
  // The listeners should be primed.
  checkPersistentListeners({ primed: true });
  let secondComposeWindow = await openComposeWindow(gPopAccount);
  await focusWindow(secondComposeWindow);
  secondComposeWindow.SetComposeDetails({ to: "second@invalid.net" });
  secondComposeWindow.SetComposeDetails({ subject: "Second message" });
  secondComposeWindow.SendMessage();
  let secondSaveInfo = await extension.awaitMessage("onAfterSend received");
  Assert.equal(
    "sendNow",
    secondSaveInfo.mode,
    "Returned SaveInfo should be correct"
  );

  // The background should have been restarted.
  await extension.awaitMessage("background started");
  // The listener should no longer be primed.
  checkPersistentListeners({ primed: false });

  await extension.unload();
});
