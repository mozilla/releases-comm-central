/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { ExtensionSupport } = ChromeUtils.import(
  "resource:///modules/ExtensionSupport.jsm"
);

add_task(async () => {
  let account = createAccount();
  addIdentity(account);

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

      // Send the message. No listeners exist, so sending should continue.

      await beginSend(true);

      // Add a non-cancelling listener. Sending should continue.

      let listener1 = () => {
        listener1.fired = true;
        return {};
      };
      browser.compose.onBeforeSend.addListener(listener1);
      await beginSend(true);
      browser.test.assertTrue(listener1.fired, "listener1 was fired");
      browser.compose.onBeforeSend.removeListener(listener1);

      // Add a cancelling listener. Sending should not continue.

      let listener2 = () => {
        listener2.fired = true;
        return { cancel: true };
      };
      browser.compose.onBeforeSend.addListener(listener2);
      await beginSend(false, false);
      browser.test.assertTrue(listener2.fired, "listener2 was fired");
      browser.compose.onBeforeSend.removeListener(listener2);
      await beginSend(true); // Removing the listener worked.

      // Add a listener returning a Promise. Resolve the Promise to unblock.
      // Sending should continue.

      let listener3 = () => {
        listener3.fired = true;
        return new Promise(resolve => {
          listener3.resolve = resolve;
        });
      };
      browser.compose.onBeforeSend.addListener(listener3);
      await beginSend(false, true);
      browser.test.assertTrue(listener3.fired, "listener3 was fired");
      listener3.resolve({ cancel: false });
      await checkIfSent(true);
      browser.compose.onBeforeSend.removeListener(listener3);

      // Add a listener returning a Promise. Resolve the Promise to cancel.
      // Sending should not continue.

      let listener4 = () => {
        listener4.fired = true;
        return new Promise(resolve => {
          listener4.resolve = resolve;
        });
      };
      browser.compose.onBeforeSend.addListener(listener4);
      await beginSend(false, true);
      browser.test.assertTrue(listener4.fired, "listener4 was fired");
      listener4.resolve({ cancel: true });
      await checkIfSent(false, false);
      browser.compose.onBeforeSend.removeListener(listener4);
      await beginSend(true); // Removing the listener worked.

      // Add a listener that changes the subject. Sending should continue and
      // the subject should change. This is largely the same code as tested in
      // browser_ext_compose_details.js, so just test that the change happens.

      // First check that the original headers are unmodified.
      await checkWindow({ to: ["test@test.invalid"], subject: "Test" });

      let listener5 = details => {
        listener5.fired = true;
        listener5.details = details;
        return {
          details: {
            subject: "Changed by listener5",
          },
        };
      };
      browser.compose.onBeforeSend.addListener(listener5);
      await beginSend(true);
      browser.test.assertTrue(listener5.fired, "listener5 was fired");
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
      // First check that the subject has changed but recipient hasn't.
      await checkWindow({
        to: ["test@test.invalid"],
        subject: "Changed by listener5",
      });
      browser.compose.onBeforeSend.removeListener(listener5);

      // Clean up.

      let removedWindowPromise = waitForEvent("onRemoved");
      browser.windows.remove(createdWindow.id);
      await removedWindowPromise;

      browser.test.notifyPass("finished");
    },
    manifest: { permissions: ["accountsRead", "compose", "messagesRead"] },
  });

  // We can't allow sending to actually happen, this is a test. For every
  // compose window that opens, replace the function which does the actual
  // sending with one that only records when it has been called.
  let didTryToSendMessage = false;
  ExtensionSupport.registerWindowListener("xpcshell", {
    chromeURLs: [
      "chrome://messenger/content/messengercompose/messengercompose.xhtml",
    ],
    onLoadWindow(window) {
      window.CompleteGenericSendMessage = function(msgType) {
        didTryToSendMessage = true;
      };
    },
  });
  registerCleanupFunction(() =>
    ExtensionSupport.unregisterWindowListener("xpcshell")
  );

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
});
