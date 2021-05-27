/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { ExtensionSupport } = ChromeUtils.import(
  "resource:///modules/ExtensionSupport.jsm"
);

// We need at least one identity to be able to send messages.
let account = createAccount();
let defaultIdentity = addIdentity(account);

// A local outbox is needed so we can use "send later".
let localAccount = createAccount("local");
let outbox = localAccount.incomingServer.rootFolder.getChildNamed("outbox");

// We can't allow sending to actually happen, this is a test. For every
// compose window that opens, replace the function which does the actual
// sending with one that only records when it has been called.
let didTryToSendMessage = false;
let windowListenerRemoved = false;
ExtensionSupport.registerWindowListener("mochitest", {
  chromeURLs: [
    "chrome://messenger/content/messengercompose/messengercompose.xhtml",
  ],
  onLoadWindow(window) {
    window.CompleteGenericSendMessage = function(msgType) {
      didTryToSendMessage = true;
    };
  },
});
registerCleanupFunction(() => {
  if (!windowListenerRemoved) {
    ExtensionSupport.unregisterWindowListener("mochitest");
  }
});

function messagesInOutbox(count) {
  info(`Checking for ${count} messages in outbox`);

  count -= [...outbox.messages].length;
  if (count <= 0) {
    return Promise.resolve();
  }

  info(`Waiting for ${count} messages in outbox`);
  return new Promise(resolve => {
    MailServices.mfn.addListener(
      {
        msgAdded(msgHdr) {
          info(count);
          if (--count == 0) {
            MailServices.mfn.removeListener(this);
            resolve();
          }
        },
      },
      MailServices.mfn.msgAdded
    );
  });
}

add_task(async function test_sendNow() {
  let files = {
    "background.js": async () => {
      let details = {
        to: ["sendNow@test.invalid"],
        subject: "Test sendNow",
      };

      // Open a compose window with a message. The message will never send
      // because we removed the sending function.

      let createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew(details);
      let [createdWindow] = await createdWindowPromise;
      browser.test.assertEq("messageCompose", createdWindow.type);

      await window.sendMessage("checkWindow", details);

      let [tab] = await browser.tabs.query({ windowId: createdWindow.id });

      // Send now.

      await browser.compose.sendMessage(tab.id, { mode: "sendNow" });
      await window.sendMessage("checkIfSent", details);

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

  extension.onMessage("checkIfSent", async expected => {
    // Wait a moment to see if send happens asynchronously.
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(resolve => setTimeout(resolve, 500));

    // A sendNow request should trigger a direct send.
    is(didTryToSendMessage, true, "did try to send a message directly");
    didTryToSendMessage = false;
    extension.sendMessage();
  });

  extension.onMessage("checkWindow", async expected => {
    await checkComposeHeaders(expected);
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  ExtensionSupport.unregisterWindowListener("mochitest");
  windowListenerRemoved = true;
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

      await browser.compose.sendMessage(tab.id, { mode: "sendLater" });
      await window.sendMessage("checkIfSent", details);

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

  extension.onMessage("checkIfSent", async expected => {
    // Wait a moment to see if send happens asynchronously.
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(resolve => setTimeout(resolve, 500));

    // A sendLater request should not trigger a direct send.
    is(didTryToSendMessage, false, "did try to send a message directly");
    didTryToSendMessage = false;

    // Check if the sendLater request did put the message in the outbox.
    await messagesInOutbox(1);

    let outboxMessages = [...outbox.messages];
    Assert.ok(outboxMessages.length == 1);
    let sentMessage = outboxMessages.shift();
    Assert.equal(sentMessage.subject, expected.subject, "subject is correct");
    Assert.equal(sentMessage.recipients, expected.to, "recipient is correct");

    await new Promise(resolve => {
      outbox.deleteMessages(
        [sentMessage],
        null,
        true,
        false,
        { OnStopCopy: resolve },
        false
      );
    });

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
