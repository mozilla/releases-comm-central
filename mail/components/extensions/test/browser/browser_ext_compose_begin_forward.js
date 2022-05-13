/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

add_setup(() => {
  let account = createAccount("pop3");
  createAccount("local");
  MailServices.accounts.defaultAccount = account;

  addIdentity(account);

  let rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("test", null);
  let folder = rootFolder.getChildNamed("test");
  createMessages(folder, 4);
});

/* Test if getComposeDetails() is waiting until the entire init procedure of
 * the composeWindow has finished, before returning values. */
add_task(async function testComposerIsReady() {
  let files = {
    "background.js": async () => {
      let accounts = await browser.accounts.list();
      browser.test.assertEq(2, accounts.length, "number of accounts");
      let popAccount = accounts.find(a => a.type == "pop3");
      let folder = popAccount.folders.find(f => f.name == "test");
      let { messages } = await browser.messages.list(folder);
      browser.test.assertEq(4, messages.length, "number of messages");

      let details = {
        plainTextBody: "This is Text",
        to: ["Mr. Holmes <holmes@bakerstreet.invalid>"],
        subject: "Test Email",
      };

      let tests = [
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

      for (let test of tests) {
        browser.test.log(JSON.stringify(test));
        let expectedDetails = test.arguments[test.arguments.length - 1];

        // Test with windows.onCreated
        {
          let createdWindowPromise = window.waitForEvent("windows.onCreated");
          // Explicitly do not await this call.
          browser.compose[test.funcName](...test.arguments);
          let [createdWindow] = await createdWindowPromise;
          let [tab] = await browser.tabs.query({ windowId: createdWindow.id });

          let actualDetails = await browser.compose.getComposeDetails(tab.id);
          for (let detail of Object.keys(expectedDetails)) {
            browser.test.assertEq(
              expectedDetails[detail].toString(),
              actualDetails[detail].toString(),
              `After windows.OnCreated: Detail ${detail} is correct for ${test.description}`
            );
          }

          // Test the windows API being able to return the messageCompose window as
          // the current one.
          await window.waitForCondition(async () => {
            let win = await browser.windows.get(createdWindow.id);
            return win.focused;
          }, `Window should have received focus.`);

          let composeWindow = await browser.windows.get(tab.windowId);
          browser.test.assertEq(composeWindow.type, "messageCompose");
          let curWindow = await browser.windows.getCurrent();
          browser.test.assertEq(tab.windowId, curWindow.id);
          // Test the tabs API being able to return the correct current tab.
          let [currentTab] = await browser.tabs.query({
            currentWindow: true,
            active: true,
          });
          browser.test.assertEq(tab.id, currentTab.id);

          let removedWindowPromise = window.waitForEvent("windows.onRemoved");
          browser.windows.remove(createdWindow.id);
          await removedWindowPromise;
        }

        // Test with tabs.onCreated
        {
          let createdTabPromise = window.waitForEvent("tabs.onCreated");
          // Explicitly do not await this call.
          browser.compose[test.funcName](...test.arguments);
          let [createdTab] = await createdTabPromise;
          let actualDetails = await browser.compose.getComposeDetails(
            createdTab.id
          );

          for (let detail of Object.keys(expectedDetails)) {
            browser.test.assertEq(
              expectedDetails[detail].toString(),
              actualDetails[detail].toString(),
              `After tabs.OnCreated: Detail ${detail} is correct for ${test.description}`
            );
          }

          let removedWindowPromise = window.waitForEvent("windows.onRemoved");
          let createdWindow = await browser.windows.get(createdTab.windowId);
          browser.windows.remove(createdWindow.id);
          await removedWindowPromise;
        }
      }

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
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
  let files = {
    "background.js": async () => {
      let accounts = await browser.accounts.list();
      browser.test.assertEq(2, accounts.length, "number of accounts");
      let popAccount = accounts.find(a => a.type == "pop3");
      let folder = popAccount.folders.find(f => f.name == "test");
      let { messages } = await browser.messages.list(folder);
      browser.test.assertEq(4, messages.length, "number of messages");

      let details = {
        plainTextBody: "This is Text",
        to: ["Mr. Holmes <holmes@bakerstreet.invalid>"],
        subject: "Test Email",
      };

      let tests = [
        {
          description: "Forward as attachment.",
          funcName: "beginForward",
          arguments: [messages[0].id, "forwardAsAttachment", details],
          expectedAttachments: [
            {
              name: "Big Meeting Today.eml",
              type: "message/rfc822",
              size: 281,
              content: "Hello Bob Bell!",
            },
          ],
        },
      ];

      for (let test of tests) {
        browser.test.log(JSON.stringify(test));

        let tab = await browser.compose[test.funcName](...test.arguments);
        let attachments = await browser.compose.listAttachments(tab.id);
        browser.test.assertEq(
          test.expectedAttachments.length,
          attachments.length,
          `Should have the expected number of attachments`
        );
        for (let i = 0; i < attachments.length; i++) {
          let file = await browser.compose.getAttachmentFile(attachments[i].id);
          for (let [property, value] of Object.entries(
            test.expectedAttachments[i]
          )) {
            if (property == "content") {
              let content = await file.text();
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

        let removedWindowPromise = window.waitForEvent("windows.onRemoved");
        browser.windows.remove(tab.windowId);
        await removedWindowPromise;
      }

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
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
  let files = {
    "background.js": async () => {
      let accounts = await browser.accounts.list();
      browser.test.assertEq(2, accounts.length, "number of accounts");
      let popAccount = accounts.find(a => a.type == "pop3");
      let folder = popAccount.folders.find(f => f.name == "test");
      let { messages } = await browser.messages.list(folder);
      browser.test.assertEq(4, messages.length, "number of messages");

      // Test opening different messages.
      {
        let promisedTabs = [];
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

        let foundIds = new Set();
        let openedTabs = await Promise.allSettled(promisedTabs);
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

          let details = await browser.compose.getComposeDetails(
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
        let promisedTabs = [];
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

        let foundIds = new Set();
        let openedTabs = await Promise.allSettled(promisedTabs);
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

          let details = await browser.compose.getComposeDetails(
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
  let extension = ExtensionTestUtils.loadExtension({
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
