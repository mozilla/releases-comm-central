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
          description: "Reply default.",
          funcName: "beginReply",
          arguments: [messages[0].id, details],
        },
        {
          description: "Reply as replyToSender.",
          funcName: "beginReply",
          arguments: [messages[0].id, "replyToSender", details],
        },
        {
          description: "Reply as replyToList.",
          funcName: "beginReply",
          arguments: [messages[0].id, "replyToList", details],
        },
        {
          description: "Reply as replyToAll.",
          funcName: "beginReply",
          arguments: [messages[0].id, "replyToAll", details],
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
