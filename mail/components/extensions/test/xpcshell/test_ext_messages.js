/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

ChromeUtils.import("resource://testing-common/ExtensionXPCShellUtils.jsm");
ExtensionTestUtils.init(this);

let account, rootFolder, subFolders;
async function run_test() {
  account = createAccount();
  rootFolder = account.incomingServer.rootFolder;
  subFolders = [...rootFolder.subFolders];
  createMessages(subFolders[0], 99);
  createMessages(subFolders[1], 1);

  run_next_test();
}

add_task(async function test_pagination() {
  let extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      function awaitMessage(messageToSend) {
        return new Promise(resolve => {
          browser.test.onMessage.addListener(function listener(...args) {
            browser.test.onMessage.removeListener(listener);
            resolve(args);
          });
          if (messageToSend) {
            browser.test.sendMessage(messageToSend);
          }
        });
      }

      // Test a response of 99 messages at 10 messages per page.
      let [folder] = await awaitMessage();
      let page = await browser.messages.list(folder);
      browser.test.assertEq(36, page.id.length);
      browser.test.assertEq(10, page.messages.length);

      let originalPageId = page.id;
      let numPages = 1;
      let numMessages = 10;
      while (page.id) {
        page = await browser.messages.continueList(page.id);
        browser.test.assertTrue(page.messages.length > 0);
        numPages++;
        numMessages += page.messages.length;
        if (numMessages < 99) {
          browser.test.assertEq(originalPageId, page.id);
        } else {
          browser.test.assertEq(null, page.id);
        }
      }
      browser.test.assertEq(10, numPages);
      browser.test.assertEq(99, numMessages);

      browser.test.assertRejects(browser.messages.continueList(originalPageId), null);

      await awaitMessage("setPref");

      // Do the same test, but with the default 100 messages per page.
      page = await browser.messages.list(folder);
      browser.test.assertEq(null, page.id);
      browser.test.assertEq(99, page.messages.length);

      browser.test.notifyPass("finished");
    },
    manifest: { permissions: ["accountsRead", "messagesRead"] },
  });

  Services.prefs.setIntPref("extensions.webextensions.messagesPerPage", 10);

  await extension.startup();
  extension.sendMessage({ accountId: account.key, path: "/Trash" });

  await extension.awaitMessage("setPref");
  Services.prefs.clearUserPref("extensions.webextensions.messagesPerPage");
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function test_update() {
  let extension = ExtensionTestUtils.loadExtension({
    async background() {
      function awaitMessage(messageToSend) {
        return new Promise(resolve => {
          browser.test.onMessage.addListener(function listener(...args) {
            browser.test.onMessage.removeListener(listener);
            resolve(args);
          });
          if (messageToSend) {
            browser.test.sendMessage(messageToSend);
          }
        });
      }

      let tags = await browser.messages.listTags();
      let [folder] = await awaitMessage();
      let messageList = await browser.messages.list(folder);
      browser.test.assertEq(1, messageList.messages.length);
      let message = messageList.messages[0];
      browser.test.assertFalse(message.flagged);
      browser.test.assertFalse(message.read);
      browser.test.assertEq(0, message.tags.length);

      // Test that setting flagged works.
      await browser.messages.update(message.id, { flagged: true });
      await awaitMessage("flagged");

      // Test that setting read works.
      await browser.messages.update(message.id, { read: true });
      await awaitMessage("read");

      // Test that setting one tag works.
      await browser.messages.update(message.id, { tags: [tags[0].key] });
      await awaitMessage("tags1");

      // Test that setting two tags works.
      await browser.messages.update(message.id, { tags: [tags[1].key, tags[2].key] });
      await awaitMessage("tags2");

      // Test that unspecified properties aren't changed.
      await browser.messages.update(message.id, {});
      await awaitMessage("empty");

      // Test that clearing properties works.
      await browser.messages.update(message.id, { flagged: false, read: false, tags: [] });
      await awaitMessage("clear");

      browser.test.notifyPass("finished");
    },
    manifest: {
      permissions: ["messagesRead"],
    },
  });

  let message = [...subFolders[1].messages][0];
  ok(!message.isFlagged);
  ok(!message.isRead);
  equal(message.getProperty("keywords"), "");

  await extension.startup();
  extension.sendMessage({ accountId: account.key, path: "/Unsent Messages" });

  await extension.awaitMessage("flagged");
  ok(message.isFlagged);
  extension.sendMessage();

  await extension.awaitMessage("read");
  ok(message.isRead);
  extension.sendMessage();

  await extension.awaitMessage("tags1");
  equal(message.getProperty("keywords"), "$label1");
  extension.sendMessage();

  await extension.awaitMessage("tags2");
  equal(message.getProperty("keywords"), "$label2 $label3");
  extension.sendMessage();

  await extension.awaitMessage("empty");
  ok(message.isFlagged);
  ok(message.isRead);
  equal(message.getProperty("keywords"), "$label2 $label3");
  extension.sendMessage();

  await extension.awaitMessage("clear");
  ok(!message.isFlagged);
  ok(!message.isRead);
  equal(message.getProperty("keywords"), "");
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();
});
