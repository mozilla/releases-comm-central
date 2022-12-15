/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

requestLongerTimeout(2);

let gRootFolder;
add_setup(async () => {
  let account = createAccount();
  gRootFolder = account.incomingServer.rootFolder;
  gRootFolder.createSubfolder("testFolder", null);
  gRootFolder.createSubfolder("otherFolder", null);
  await createMessages(gRootFolder.getChildNamed("testFolder"), 5);
});

async function testOpenMessages(testConfig) {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        // Verify startup conditions.
        let accounts = await browser.accounts.list();
        browser.test.assertEq(
          1,
          accounts.length,
          `number of accounts should be correct`
        );

        let testFolder = accounts[0].folders.find(f => f.name == "testFolder");
        browser.test.assertTrue(!!testFolder, "folder should exist");
        let { messages } = await browser.messages.list(testFolder);
        browser.test.assertEq(
          5,
          messages.length,
          `number of messages should be correct`
        );

        // Get test properties.
        let [testConfig] = await window.sendMessage("getTestConfig");

        function open(message, testConfig) {
          let properties = { ...testConfig };
          if (properties.headerMessageId) {
            properties.headerMessageId = message.headerMessageId;
          } else if (properties.messageId) {
            properties.messageId = message.id;
          }
          return browser.messageDisplay.open(properties);
        }

        // Open multiple messages.
        let promisedTabs = [];
        promisedTabs.push(open(messages[0], testConfig));
        promisedTabs.push(open(messages[0], testConfig));
        promisedTabs.push(open(messages[1], testConfig));
        promisedTabs.push(open(messages[1], testConfig));
        promisedTabs.push(open(messages[2], testConfig));
        promisedTabs.push(open(messages[2], testConfig));
        promisedTabs.push(open(messages[3], testConfig));
        promisedTabs.push(open(messages[3], testConfig));
        promisedTabs.push(open(messages[4], testConfig));
        promisedTabs.push(open(messages[4], testConfig));
        let openedTabs = await Promise.allSettled(promisedTabs);
        for (let i = 0; i < openedTabs.length; i++) {
          browser.test.assertEq(
            "fulfilled",
            openedTabs[i].status,
            `Promise for the opened message should have been fulfilled for message ${i}`
          );

          let msg = await browser.messageDisplay.getDisplayedMessage(
            openedTabs[i].value.id
          );
          browser.test.assertEq(
            messages[Math.floor(i / 2)].id,
            msg.id,
            `Should see the correct message in window ${i}`
          );
          await browser.tabs.remove(openedTabs[i].value.id);
        }

        browser.test.notifyPass();
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead", "tabs"],
    },
  });

  document
    .getElementById("folderpane_splitter")
    .setAttribute("state", "opened");

  window.gFolderTreeView.selectFolder(gRootFolder.getChildNamed("otherFolder"));

  extension.onMessage("getTestConfig", async () => {
    extension.sendMessage(testConfig);
  });

  await extension.startup();
  await extension.awaitFinish();
  await extension.unload();

  document
    .getElementById("folderpane_splitter")
    .setAttribute("state", "collapsed");
}

add_task(async function testHeaderMessageIdActiveDefault() {
  await testOpenMessages({ headerMessageId: true, active: true });
});

add_task(async function testHeaderMessageIdInActiveDefault() {
  await testOpenMessages({ headerMessageId: true, active: false });
});

add_task(async function testHeaderMessageIdActiveWindow() {
  await testOpenMessages({
    headerMessageId: true,
    active: true,
    location: "window",
  });
});

add_task(async function testHeaderMessageIdInActiveWindow() {
  await testOpenMessages({
    headerMessageId: true,
    active: false,
    location: "window",
  });
});

add_task(async function testHeaderMessageIdActiveTab() {
  await testOpenMessages({
    headerMessageId: true,
    active: true,
    location: "tab",
  });
});

add_task(async function testHeaderMessageIdInActiveTab() {
  await testOpenMessages({
    headerMessageId: true,
    active: false,
    location: "tab",
  });
});

add_task(async function testMessageIdActiveDefault() {
  await testOpenMessages({ messageId: true, active: true });
});

add_task(async function testMessageIdInActiveDefault() {
  await testOpenMessages({ messageId: true, active: false });
});

add_task(async function testMessageIdActiveWindow() {
  await testOpenMessages({
    messageId: true,
    active: true,
    location: "window",
  });
});

add_task(async function testMessageIdInActiveWindow() {
  await testOpenMessages({
    messageId: true,
    active: false,
    location: "window",
  });
});

add_task(async function testMessageIdActiveTab() {
  await testOpenMessages({
    messageId: true,
    active: true,
    location: "tab",
  });
});

add_task(async function testMessageIdInActiveTab() {
  await testOpenMessages({
    messageId: true,
    active: false,
    location: "tab",
  });
});
