/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

add_setup(() => {
  const account = createAccount("pop3");
  createAccount("local");
  MailServices.accounts.defaultAccount = account;

  addIdentity(account);

  const rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("test", null);
  const folder = rootFolder.getChildNamed("test");
  createMessages(folder, 4);
});

/* Test if getComposeDetails() is waiting until the entire init procedure of
 * the composeWindow has finished, before returning values. */
add_task(async function testComposerIsReady() {
  const files = {
    "background.js": async () => {
      const accounts = await browser.accounts.list();
      browser.test.assertEq(2, accounts.length, "number of accounts");
      const popAccount = accounts.find(a => a.type == "pop3");
      const folder = popAccount.folders.find(f => f.name == "test");
      const { messages } = await browser.messages.list(folder.id);
      browser.test.assertEq(4, messages.length, "number of messages");

      const details = {
        plainTextBody: "This is Text",
        to: ['"Mr. Holmes" <holmes@bakerstreet.invalid>'],
        subject: "Test Email",
      };

      const tests = [
        {
          description: "Forward default.",
          funcName: "beginForward",
          arguments: [messages[0].id, details],
        },
        {
          description: "Forward inline.",
          funcName: "beginForward",
          arguments: [messages[0].id, "forwardInline", details],
        },
        {
          description: "Forward as attachment.",
          funcName: "beginForward",
          arguments: [messages[0].id, "forwardAsAttachment", details],
        },
      ];

      for (const test of tests) {
        browser.test.log(JSON.stringify(test));
        const expectedDetails = test.arguments[test.arguments.length - 1];

        // Test with windows.onCreated
        {
          const createdWindowPromise = window.waitForEvent("windows.onCreated");
          // Explicitly do not await this call.
          browser.compose[test.funcName](...test.arguments);
          const [createdWindow] = await createdWindowPromise;
          const [tab] = await browser.tabs.query({
            windowId: createdWindow.id,
          });

          const actualDetails = await browser.compose.getComposeDetails(tab.id);
          for (const detail of Object.keys(expectedDetails)) {
            browser.test.assertEq(
              expectedDetails[detail].toString(),
              actualDetails[detail].toString(),
              `After windows.OnCreated: Detail ${detail} is correct for ${test.description}`
            );
          }

          // Test the windows API being able to return the messageCompose window as
          // the current one.
          await window.waitForCondition(async () => {
            const win = await browser.windows.get(createdWindow.id);
            return win.focused;
          }, `Window should have received focus.`);

          const composeWindow = await browser.windows.get(tab.windowId);
          browser.test.assertEq(composeWindow.type, "messageCompose");
          const curWindow = await browser.windows.getCurrent();
          browser.test.assertEq(tab.windowId, curWindow.id);
          // Test the tabs API being able to return the correct current tab.
          const [currentTab] = await browser.tabs.query({
            currentWindow: true,
            active: true,
          });
          browser.test.assertEq(tab.id, currentTab.id);

          const removedWindowPromise = window.waitForEvent("windows.onRemoved");
          browser.windows.remove(createdWindow.id);
          await removedWindowPromise;
        }

        // Test with tabs.onCreated
        {
          const createdTabPromise = window.waitForEvent("tabs.onCreated");
          // Explicitly do not await this call.
          browser.compose[test.funcName](...test.arguments);
          const [createdTab] = await createdTabPromise;
          const actualDetails = await browser.compose.getComposeDetails(
            createdTab.id
          );

          for (const detail of Object.keys(expectedDetails)) {
            browser.test.assertEq(
              expectedDetails[detail].toString(),
              actualDetails[detail].toString(),
              `After tabs.OnCreated: Detail ${detail} is correct for ${test.description}`
            );
          }

          const removedWindowPromise = window.waitForEvent("windows.onRemoved");
          const createdWindow = await browser.windows.get(createdTab.windowId);
          browser.windows.remove(createdWindow.id);
          await removedWindowPromise;
        }
      }

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose", "accountsRead", "messagesRead"],
    },
  });
  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

/* Test the compose API accessing the forwarded message added by beginForward. */
add_task(async function testBeginForward() {
  const files = {
    "background.js": async () => {
      const accounts = await browser.accounts.list();
      browser.test.assertEq(2, accounts.length, "number of accounts");
      const popAccount = accounts.find(a => a.type == "pop3");
      const folder = popAccount.folders.find(f => f.name == "test");
      const { messages } = await browser.messages.list(folder.id);
      browser.test.assertEq(4, messages.length, "number of messages");

      const details = {
        plainTextBody: "This is Text",
        to: ['"Mr. Holmes" <holmes@bakerstreet.invalid>'],
        subject: "Test Email",
      };

      // NOTE: This test seems to rely on knowing the exact size and content
      // of message[0], generated by createMessages() (which uses
      // MessageGenerator()). That seems very brittle and error-prone...
      // See Bug 1852468.
      const tests = [
        {
          description: "Forward as attachment.",
          funcName: "beginForward",
          arguments: [messages[0].id, "forwardAsAttachment", details],
          expectedAttachments: [
            {
              name: "Big Meeting Today.eml",
              type: "message/rfc822",
              size: 256,
              content: "Hello Bob Bell!",
            },
          ],
        },
      ];

      for (const test of tests) {
        browser.test.log(JSON.stringify(test));

        const tab = await browser.compose[test.funcName](...test.arguments);
        const attachments = await browser.compose.listAttachments(tab.id);
        browser.test.assertEq(
          test.expectedAttachments.length,
          attachments.length,
          `Should have the expected number of attachments`
        );
        for (let i = 0; i < attachments.length; i++) {
          const file = await browser.compose.getAttachmentFile(
            attachments[i].id
          );
          for (const [property, value] of Object.entries(
            test.expectedAttachments[i]
          )) {
            if (property == "content") {
              const content = await file.text();
              browser.test.assertTrue(
                content.includes(value),
                `Attachment body should include ${value}`
              );
            } else {
              browser.test.assertEq(
                value,
                file[property],
                `Attachment should have the correct value for ${property}`
              );
            }
          }
        }

        const removedWindowPromise = window.waitForEvent("windows.onRemoved");
        browser.windows.remove(tab.windowId);
        await removedWindowPromise;
      }

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose", "accountsRead", "messagesRead"],
    },
  });
  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

/* The forward inline code path uses a hacky way to identify the correct window
 * after it has been opened via MailServices.compose.OpenComposeWindow. Test it.*/
add_task(async function testBeginForwardInlineMixUp() {
  const files = {
    "background.js": async () => {
      const accounts = await browser.accounts.list();
      browser.test.assertEq(2, accounts.length, "number of accounts");
      const popAccount = accounts.find(a => a.type == "pop3");
      const folder = popAccount.folders.find(f => f.name == "test");
      const { messages } = await browser.messages.list(folder.id);
      browser.test.assertEq(4, messages.length, "number of messages");

      // Test opening different messages.
      {
        const promisedTabs = [];
        promisedTabs.push(
          browser.compose.beginForward(messages[0].id, "forwardInline")
        );
        promisedTabs.push(
          browser.compose.beginForward(messages[1].id, "forwardInline")
        );
        promisedTabs.push(
          browser.compose.beginForward(messages[2].id, "forwardInline")
        );
        promisedTabs.push(
          browser.compose.beginForward(messages[3].id, "forwardInline")
        );

        const foundIds = new Set();
        const openedTabs = await Promise.allSettled(promisedTabs);
        for (let i = 0; i < 4; i++) {
          browser.test.assertEq(
            "fulfilled",
            openedTabs[i].status,
            `Promise for the opened compose window should have been fulfilled for message ${i}`
          );

          browser.test.assertTrue(
            !foundIds.has(openedTabs[i].value.id),
            `Tab ${i} should have a unique id ${openedTabs[i].value.id}`
          );
          foundIds.add(openedTabs[i].value.id);

          const details = await browser.compose.getComposeDetails(
            openedTabs[i].value.id
          );
          browser.test.assertEq(
            messages[i].id,
            details.relatedMessageId,
            `Should see the correct message in compose window ${i}`
          );
          await browser.tabs.remove(openedTabs[i].value.id);
        }
      }

      // Test opening identical messages.
      {
        const promisedTabs = [];
        promisedTabs.push(
          browser.compose.beginForward(messages[0].id, "forwardInline")
        );
        promisedTabs.push(
          browser.compose.beginForward(messages[0].id, "forwardInline")
        );
        promisedTabs.push(
          browser.compose.beginForward(messages[0].id, "forwardInline")
        );
        promisedTabs.push(
          browser.compose.beginForward(messages[0].id, "forwardInline")
        );

        const foundIds = new Set();
        const openedTabs = await Promise.allSettled(promisedTabs);
        for (let i = 0; i < 4; i++) {
          browser.test.assertEq(
            "fulfilled",
            openedTabs[i].status,
            `Promise for the opened compose window should have been fulfilled for message ${i}`
          );

          browser.test.assertTrue(
            !foundIds.has(openedTabs[i].value.id),
            `Tab ${i} should have a unique id ${openedTabs[i].value.id}`
          );
          foundIds.add(openedTabs[i].value.id);

          const details = await browser.compose.getComposeDetails(
            openedTabs[i].value.id
          );
          browser.test.assertEq(
            messages[0].id,
            details.relatedMessageId,
            `Should see the correct message in compose window ${i}`
          );
          await browser.tabs.remove(openedTabs[i].value.id);
        }
      }
      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose", "accountsRead", "messagesRead"],
    },
  });
  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
