/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { ExtensionSupport } = ChromeUtils.import(
  "resource:///modules/ExtensionSupport.jsm"
);

let account = createAccount();
addIdentity(account);

add_task(async function testCancel() {
  let extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      function waitForEvent(eventName) {
        return new Promise(resolve => {
          let listener = window => {
            browser.windows[eventName].removeListener(listener);
            resolve(window);
          };
          browser.windows[eventName].addListener(listener);
        });
      }

      async function beginSend(sendExpected, lockExpected) {
        await new Promise(resolve => {
          browser.test.onMessage.addListener(function listener() {
            browser.test.onMessage.removeListener(listener);
            resolve();
          });
          browser.test.sendMessage("beginSend");
        });
        return checkIfSent(sendExpected, lockExpected);
      }

      function checkIfSent(sendExpected, lockExpected = null) {
        return new Promise(resolve => {
          browser.test.onMessage.addListener(function listener() {
            browser.test.onMessage.removeListener(listener);
            resolve();
          });
          browser.test.sendMessage("checkIfSent", sendExpected, lockExpected);
        });
      }

      function checkWindow(expected) {
        return new Promise(resolve => {
          browser.test.onMessage.addListener(function listener() {
            browser.test.onMessage.removeListener(listener);
            resolve();
          });
          browser.test.sendMessage("checkWindow", expected);
        });
      }

      // Open a compose window with a message. The message will never send
      // because we removed the sending function, so we can attempt to send
      // it over and over.

      let createdWindowPromise = waitForEvent("onCreated");
      await browser.compose.beginNew({
        to: ["test@test.invalid"],
        subject: "Test",
      });
      let createdWindow = await createdWindowPromise;
      browser.test.assertEq("messageCompose", createdWindow.type);

      await checkWindow({ to: ["test@test.invalid"], subject: "Test" });

      let [tab] = await browser.tabs.query({ windowId: createdWindow.id });

      // Send the message. No listeners exist, so sending should continue.

      await beginSend(true);

      // Add a non-cancelling listener. Sending should continue.

      let listener1 = tab => {
        listener1.tab = tab;
        return {};
      };
      browser.compose.onBeforeSend.addListener(listener1);
      await beginSend(true);
      browser.test.assertEq(tab.id, listener1.tab.id, "listener1 was fired");
      browser.compose.onBeforeSend.removeListener(listener1);

      // Add a cancelling listener. Sending should not continue.

      let listener2 = tab => {
        listener2.tab = tab;
        return { cancel: true };
      };
      browser.compose.onBeforeSend.addListener(listener2);
      await beginSend(false, false);
      browser.test.assertEq(tab.id, listener2.tab.id, "listener2 was fired");
      browser.compose.onBeforeSend.removeListener(listener2);
      await beginSend(true); // Removing the listener worked.

      // Add a listener returning a Promise. Resolve the Promise to unblock.
      // Sending should continue.

      let listener3 = tab => {
        listener3.tab = tab;
        return new Promise(resolve => {
          listener3.resolve = resolve;
        });
      };
      browser.compose.onBeforeSend.addListener(listener3);
      await beginSend(false, true);
      browser.test.assertEq(tab.id, listener3.tab.id, "listener3 was fired");
      listener3.resolve({ cancel: false });
      await checkIfSent(true);
      browser.compose.onBeforeSend.removeListener(listener3);

      // Add a listener returning a Promise. Resolve the Promise to cancel.
      // Sending should not continue.

      let listener4 = tab => {
        listener4.tab = tab;
        return new Promise(resolve => {
          listener4.resolve = resolve;
        });
      };
      browser.compose.onBeforeSend.addListener(listener4);
      await beginSend(false, true);
      browser.test.assertEq(tab.id, listener4.tab.id, "listener4 was fired");
      listener4.resolve({ cancel: true });
      await checkIfSent(false, false);
      browser.compose.onBeforeSend.removeListener(listener4);
      await beginSend(true); // Removing the listener worked.

      // Clean up.

      let removedWindowPromise = waitForEvent("onRemoved");
      browser.windows.remove(createdWindow.id);
      await removedWindowPromise;

      browser.test.notifyPass("finished");
    },
    manifest: { permissions: ["compose"] },
  });

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

  extension.onMessage("beginSend", async () => {
    let composeWindows = [...Services.wm.getEnumerator("msgcompose")];
    is(composeWindows.length, 1);

    composeWindows[0].GenericSendMessage(Ci.nsIMsgCompDeliverMode.Now);
    extension.sendMessage();
  });

  extension.onMessage("checkIfSent", async (sendExpected, lockExpected) => {
    is(didTryToSendMessage, sendExpected, "did try to send a message");

    if (lockExpected !== null) {
      let composeWindows = [...Services.wm.getEnumerator("msgcompose")];
      is(composeWindows.length, 1);
      is(composeWindows[0].gWindowLocked, lockExpected, "window is locked");
    }

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

add_task(async function testChangeDetails() {
  let extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      function waitForEvent(eventName) {
        return new Promise(resolve => {
          let listener = window => {
            browser.windows[eventName].removeListener(listener);
            resolve(window);
          };
          browser.windows[eventName].addListener(listener);
        });
      }

      async function beginSend() {
        await new Promise(resolve => {
          browser.test.onMessage.addListener(function listener() {
            browser.test.onMessage.removeListener(listener);
            resolve();
          });
          browser.test.sendMessage("beginSend");
        });
      }

      function checkWindow(expected) {
        return new Promise(resolve => {
          browser.test.onMessage.addListener(function listener() {
            browser.test.onMessage.removeListener(listener);
            resolve();
          });
          browser.test.sendMessage("checkWindow", expected);
        });
      }

      // Add a listener that changes the headers and body. Sending should
      // continue and the headers should change. This is largely the same code
      // as tested in browser_ext_compose_details.js, so just test that the
      // changes happen.

      let createdWindowPromise = waitForEvent("onCreated");
      await browser.compose.beginNew({
        to: ["test@test.invalid"],
        subject: "Test",
        body: "Original body.",
      });
      let createdWindow = await createdWindowPromise;
      browser.test.assertEq("messageCompose", createdWindow.type);

      await checkWindow({
        to: ["test@test.invalid"],
        subject: "Test",
        body: "Original body.",
      });

      let [tab] = await browser.tabs.query({ windowId: createdWindow.id });

      let listener5 = (tab, details) => {
        listener5.tab = tab;
        listener5.details = details;
        return {
          details: {
            to: ["to@test5.invalid"],
            cc: ["cc@test5.invalid"],
            subject: "Changed by listener5",
            body: "New body from listener5.",
          },
        };
      };
      browser.compose.onBeforeSend.addListener(listener5);
      await beginSend();
      browser.test.assertEq(tab.id, listener5.tab.id, "listener5 was fired");
      browser.test.assertEq(1, listener5.details.to.length);
      browser.test.assertEq(
        "test@test.invalid",
        listener5.details.to[0],
        "listener5 recipient correct"
      );
      browser.test.assertEq(
        "Test",
        listener5.details.subject,
        "listener5 subject correct"
      );
      browser.compose.onBeforeSend.removeListener(listener5);

      // Do the same thing, but this time with a Promise.

      createdWindowPromise = waitForEvent("onCreated");
      await browser.compose.beginNew({
        to: ["test@test.invalid"],
        subject: "Test",
        body: "Original body.",
      });
      createdWindow = await createdWindowPromise;
      browser.test.assertEq("messageCompose", createdWindow.type);

      await checkWindow({
        to: ["test@test.invalid"],
        subject: "Test",
        body: "Original body.",
      });

      [tab] = await browser.tabs.query({ windowId: createdWindow.id });

      let listener6 = (tab, details) => {
        listener6.tab = tab;
        listener6.details = details;
        return new Promise(resolve => {
          listener6.resolve = resolve;
        });
      };
      browser.compose.onBeforeSend.addListener(listener6);
      await beginSend();
      browser.test.assertEq(tab.id, listener6.tab.id, "listener6 was fired");
      browser.test.assertEq(1, listener6.details.to.length);
      browser.test.assertEq(
        "test@test.invalid",
        listener6.details.to[0],
        "listener6 recipient correct"
      );
      browser.test.assertEq(
        "Test",
        listener6.details.subject,
        "listener6 subject correct"
      );
      listener6.resolve({
        details: {
          to: ["to@test6.invalid"],
          cc: ["cc@test6.invalid"],
          subject: "Changed by listener6",
          body: "New body from listener6.",
        },
      });
      browser.compose.onBeforeSend.removeListener(listener6);

      browser.test.notifyPass("finished");
    },
    manifest: { permissions: ["compose"] },
  });

  extension.onMessage("beginSend", async () => {
    let composeWindows = [...Services.wm.getEnumerator("msgcompose")];
    is(composeWindows.length, 1);

    composeWindows[0].GenericSendMessage(Ci.nsIMsgCompDeliverMode.Later);
    extension.sendMessage();
  });

  extension.onMessage("checkWindow", async expected => {
    await checkComposeHeaders(expected);

    let composeWindow = Services.wm.getMostRecentWindow("msgcompose");
    let body = composeWindow.GetCurrentEditor().outputToString("text/plain", 0);
    is(body, expected.body);

    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  let outbox = account.incomingServer.rootFolder.getChildNamed("outbox");
  let outboxMessages = outbox.messages;
  ok(outboxMessages.hasMoreElements());
  let sentMessage5 = outboxMessages.getNext();
  is(sentMessage5.subject, "Changed by listener5", "subject was changed");
  is(sentMessage5.recipients, "to@test5.invalid", "to was changed");
  is(sentMessage5.ccList, "cc@test5.invalid", "cc was changed");

  await new Promise(resolve => {
    window.MsgHdrToMimeMessage(sentMessage5, null, (msgHdr, mimeMessage) => {
      is(
        // Fold Windows line-endings \r\n to \n.
        mimeMessage.parts[0].body.replace(/\r/g, ""),
        "New body from listener5.\n"
      );
      resolve();
    });
  });

  ok(outboxMessages.hasMoreElements());
  let sentMessage6 = outboxMessages.getNext();
  is(sentMessage6.subject, "Changed by listener6", "subject was changed");
  is(sentMessage6.recipients, "to@test6.invalid", "to was changed");
  is(sentMessage6.ccList, "cc@test6.invalid", "cc was changed");

  await new Promise(resolve => {
    window.MsgHdrToMimeMessage(sentMessage6, null, (msgHdr, mimeMessage) => {
      is(
        // Fold Windows line-endings \r\n to \n.
        mimeMessage.parts[0].body.replace(/\r/g, ""),
        "New body from listener6.\n"
      );
      resolve();
    });
  });

  ok(!outboxMessages.hasMoreElements());

  await new Promise(resolve => {
    outbox.deleteMessages(
      toXPCOMArray([sentMessage5, sentMessage6], Ci.nsIMutableArray),
      null,
      true,
      false,
      { OnStopCopy: resolve },
      false
    );
  });
});

add_task(async function testListExpansion() {
  let extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      function waitForEvent(eventName) {
        return new Promise(resolve => {
          let listener = window => {
            browser.windows[eventName].removeListener(listener);
            resolve(window);
          };
          browser.windows[eventName].addListener(listener);
        });
      }

      async function beginSend() {
        await new Promise(resolve => {
          browser.test.onMessage.addListener(function listener() {
            browser.test.onMessage.removeListener(listener);
            resolve();
          });
          browser.test.sendMessage("beginSend");
        });
      }

      function checkWindow(expected) {
        return new Promise(resolve => {
          browser.test.onMessage.addListener(function listener() {
            browser.test.onMessage.removeListener(listener);
            resolve();
          });
          browser.test.sendMessage("checkWindow", expected);
        });
      }

      let addressBook = await browser.addressBooks.create({
        name: "Baker Street",
      });
      let contacts = {
        sherlock: await browser.contacts.create(addressBook, {
          DisplayName: "Sherlock Holmes",
          PrimaryEmail: "sherlock@bakerstreet.invalid",
        }),
        john: await browser.contacts.create(addressBook, {
          DisplayName: "John Watson",
          PrimaryEmail: "john@bakerstreet.invalid",
        }),
      };
      let list = await browser.mailingLists.create(addressBook, {
        name: "Holmes and Watson",
        description: "Tenants221B",
      });
      await browser.mailingLists.addMember(list, contacts.sherlock);
      await browser.mailingLists.addMember(list, contacts.john);

      // Add a listener that changes the headers. Sending should continue and
      // the headers should change. The mailing list should be expanded in both
      // the To: and Bcc: headers.

      let createdWindowPromise = waitForEvent("onCreated");
      await browser.compose.beginNew({
        to: [{ id: list, type: "mailingList" }],
        subject: "Test",
      });
      let createdWindow = await createdWindowPromise;
      browser.test.assertEq("messageCompose", createdWindow.type);

      await checkWindow({
        to: ["Holmes and Watson <Tenants221B>"],
        subject: "Test",
      });

      let [tab] = await browser.tabs.query({ windowId: createdWindow.id });

      let listener7 = (tab, details) => {
        listener7.tab = tab;
        listener7.details = details;
        return {
          details: {
            bcc: details.to,
            subject: "Changed by listener7",
          },
        };
      };
      browser.compose.onBeforeSend.addListener(listener7);
      await beginSend();
      browser.test.assertEq(tab.id, listener7.tab.id, "listener7 was fired");
      browser.test.assertEq(1, listener7.details.to.length);
      browser.test.assertEq(
        "Holmes and Watson <Tenants221B>",
        listener7.details.to[0],
        "listener7 recipient correct"
      );
      browser.test.assertEq(
        "Test",
        listener7.details.subject,
        "listener7 subject correct"
      );
      browser.compose.onBeforeSend.removeListener(listener7);

      await browser.addressBooks.delete(addressBook);
      browser.test.notifyPass("finished");
    },
    manifest: { permissions: ["addressBooks", "compose"] },
  });

  extension.onMessage("beginSend", async () => {
    let composeWindows = [...Services.wm.getEnumerator("msgcompose")];
    is(composeWindows.length, 1);

    composeWindows[0].GenericSendMessage(Ci.nsIMsgCompDeliverMode.Later);
    extension.sendMessage();
  });

  extension.onMessage("checkWindow", async expected => {
    await checkComposeHeaders(expected);
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  let outbox = account.incomingServer.rootFolder.getChildNamed("outbox");
  let outboxMessages = outbox.messages;
  ok(outboxMessages.hasMoreElements());
  let sentMessage7 = outboxMessages.getNext();
  is(sentMessage7.subject, "Changed by listener7", "subject was changed");
  is(
    sentMessage7.recipients,
    "Sherlock Holmes <sherlock@bakerstreet.invalid>, John Watson <john@bakerstreet.invalid>",
    "list in unchanged field was expanded"
  );
  is(
    sentMessage7.bccList,
    "Sherlock Holmes <sherlock@bakerstreet.invalid>, John Watson <john@bakerstreet.invalid>",
    "list in changed field was expanded"
  );

  ok(!outboxMessages.hasMoreElements());

  await new Promise(resolve => {
    outbox.deleteMessages(
      toXPCOMArray([sentMessage7], Ci.nsIMutableArray),
      null,
      true,
      false,
      { OnStopCopy: resolve },
      false
    );
  });
});
