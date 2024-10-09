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
    "smtp",
    "user",
    "password",
    { port, hostname }
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

function tracksentMessages(aSubject, aTopic, aMsgID) {
  // The aMsgID starts with < and ends with > which is not used by the API.
  const headerMessageId = aMsgID.replace(/^<|>$/g, "");
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

  const identity = getSmtpIdentity(
    "identity@foo.invalid",
    getBasicSmtpServer(gServer.port)
  );
  gPopAccount.addIdentity(identity);
  gPopAccount.defaultIdentity = identity;

  // Test is using the Sent folder and Outbox folder of the local account.
  const rootFolder = gLocalAccount.incomingServer.rootFolder;
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
  const files = {
    "background.js": async () => {
      const details = {
        to: ["send@test.invalid"],
        subject: "Test send",
      };

      // Open a compose window with a message.
      const tab = await browser.compose.beginNew(details);

      // Send now. It should fail due to the missing compose.send permission.
      await browser.test.assertThrows(
        () => browser.compose.sendMessage(tab.id),
        /browser.compose.sendMessage is not a function/,
        "browser.compose.sendMessage() should reject, if the permission compose.send is not granted."
      );

      // Clean up.
      const removedWindowPromise = window.waitForEvent("windows.onRemoved");
      browser.tabs.remove(tab.id);
      await removedWindowPromise;

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
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
  const files = {
    "background.js": async () => {
      const details = {
        to: ["send@test.invalid"],
        subject: "Test send",
      };

      // Open a compose window with a message.
      const createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew(details);
      const [createdWindow] = await createdWindowPromise;
      browser.test.assertEq("messageCompose", createdWindow.type);

      await window.sendMessage("checkWindow", details);

      const [qtab] = await browser.tabs.query({ windowId: createdWindow.id });

      browser.compose.onBeforeSend.addListener(() => {
        return { cancel: true };
      });

      // Add onAfterSend listener
      const collectedEventsMap = new Map();
      function onAfterSendListener(tab, info) {
        collectedEventsMap.set(tab.id, info);
      }
      browser.compose.onAfterSend.addListener(onAfterSendListener);

      // Send now. It should fail due to the aborting onBeforeSend listener.
      await browser.test.assertRejects(
        browser.compose.sendMessage(qtab.id),
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
        collectedEventsMap.get(qtab.id).error,
        "Should have received the correct error"
      );

      // Clean up.
      const removedWindowPromise = window.waitForEvent("windows.onRemoved");
      browser.windows.remove(createdWindow.id);
      await removedWindowPromise;

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
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
  const files = {
    "background.js": async () => {
      const details = {
        to: ["send@test.invalid"],
        subject: "Test send",
      };

      // Open a compose window with a message.
      const createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew(details);
      const [createdWindow] = await createdWindowPromise;
      browser.test.assertEq("messageCompose", createdWindow.type);

      await window.sendMessage("checkWindow", details);

      const [qtab] = await browser.tabs.query({ windowId: createdWindow.id });

      // Add onAfterSend listener
      const collectedEventsMap = new Map();
      function onAfterSendListener(tab, info) {
        collectedEventsMap.set(tab.id, info);
      }
      browser.compose.onAfterSend.addListener(onAfterSendListener);

      // Send now.
      const removedWindowPromise = window.waitForEvent("windows.onRemoved");
      const rv = await browser.compose.sendMessage(qtab.id);
      const [sentMessages] = await window.sendMessage("getSentMessages");

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
        collectedEventsMap.has(qtab.id),
        "The received event should belong to the correct tab."
      );
      browser.test.assertEq(
        "sendNow",
        collectedEventsMap.get(qtab.id).mode,
        "The received event should have the correct mode."
      );
      browser.test.assertEq(
        rv.headerMessageId,
        collectedEventsMap.get(qtab.id).headerMessageId,
        "The received event should have the correct headerMessageId."
      );
      browser.test.assertEq(
        rv.headerMessageId,
        collectedEventsMap.get(qtab.id).messages[0].headerMessageId,
        "The message in the received event should have the correct headerMessageId."
      );

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose", "compose.send", "messagesRead"],
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
  const files = {
    "background.js": async () => {
      const details = {
        to: ["sendDefault@test.invalid"],
        subject: "Test sendDefault",
      };

      // Open a compose window with a message.
      const createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew(details);
      const [createdWindow] = await createdWindowPromise;
      browser.test.assertEq("messageCompose", createdWindow.type);

      await window.sendMessage("checkWindow", details);

      const [tab] = await browser.tabs.query({ windowId: createdWindow.id });

      // Send via default mode, which should be sendNow.
      const removedWindowPromise = window.waitForEvent("windows.onRemoved");
      const rv = await browser.compose.sendMessage(tab.id, { mode: "default" });
      const [sentMessages] = await window.sendMessage("getSentMessages");

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
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose", "compose.send", "messagesRead"],
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
  const files = {
    "background.js": async () => {
      const details = {
        to: ["sendNow@test.invalid"],
        subject: "Test sendNow",
      };

      // Open a compose window with a message.
      const createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew(details);
      const [createdWindow] = await createdWindowPromise;
      browser.test.assertEq("messageCompose", createdWindow.type);

      await window.sendMessage("checkWindow", details);

      const [tab] = await browser.tabs.query({ windowId: createdWindow.id });

      // Send via sendNow mode.
      const removedWindowPromise = window.waitForEvent("windows.onRemoved");
      const rv = await browser.compose.sendMessage(tab.id, { mode: "sendNow" });
      const [sentMessages] = await window.sendMessage("getSentMessages");

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
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose", "compose.send", "messagesRead"],
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
  const files = {
    "background.js": async () => {
      const details = {
        to: ["sendLater@test.invalid"],
        subject: "Test sendLater",
      };

      const createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew(details);
      const [createdWindow] = await createdWindowPromise;
      browser.test.assertEq("messageCompose", createdWindow.type);

      await window.sendMessage("checkWindow", details);

      const [tab] = await browser.tabs.query({ windowId: createdWindow.id });

      // Send Later.

      const rv = await browser.compose.sendMessage(tab.id, {
        mode: "sendLater",
      });
      const [outboxMessage] = await window.sendMessage(
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
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose", "compose.send", "messagesRead", "accountsRead"],
    },
  });

  extension.onMessage("checkMessagesInOutbox", async expected => {
    // Check if the sendLater request did put the message in the outbox.
    const outboxMessages = [...gOutbox.messages];
    Assert.ok(outboxMessages.length == 1);
    const sentMessage = outboxMessages.shift();
    Assert.equal(sentMessage.subject, expected.subject, "subject is correct");
    Assert.equal(sentMessage.recipients, expected.to, "recipient is correct");
    extension.sendMessage(sentMessage.messageId);
  });

  extension.onMessage("clearMessagesInOutbox", async () => {
    const outboxMessages = [...gOutbox.messages];
    await new Promise(resolve => {
      gOutbox.deleteMessages(
        outboxMessages,
        null,
        true,
        false,
        { onStopCopy: resolve },
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
  const files = {
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

          case 4: {
            // The recipient has been reverted, send is enabled.
            browser.test.assertEq(true, state.canSendNow);
            browser.test.assertEq(true, state.canSendLater);

            // Clean up.

            const removedWindowPromise =
              window.waitForEvent("windows.onRemoved");
            browser.windows.remove(createdWindow.id);
            await removedWindowPromise;

            browser.test.notifyPass("finished");
            break;
          }
        }
      });

      // The call to beginNew should create two onComposeStateChanged events,
      // one after the empty window has been created and one after the initial
      // details have been set.
      const createdWindowPromise = window.waitForEvent("windows.onCreated");
      const createdTab = await browser.compose.beginNew({
        to: ["test@test.invalid"],
        subject: "Test part 1",
        body: "Original body.",
      });
      const [createdWindow] = await createdWindowPromise;
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
  const extension = ExtensionTestUtils.loadExtension({
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
