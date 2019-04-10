/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var {ExtensionTestUtils} = ChromeUtils.import("resource://testing-common/ExtensionXPCShellUtils.jsm");
ExtensionTestUtils.init(this);

add_task(async function test_accounts() {
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

      function assertDeepEqual(expected, actual) {
        if (Array.isArray(expected)) {
          browser.test.assertTrue(Array.isArray(actual));
          browser.test.assertEq(expected.length, actual.length);
          for (let i = 0; i < expected.length; i++) {
            assertDeepEqual(expected[i], actual[i]);
          }
          return;
        }

        let expectedKeys = Object.keys(expected);
        let actualKeys = Object.keys(actual);
        // Ignore any extra keys on the actual object.
        browser.test.assertTrue(expectedKeys.length <= actualKeys.length);

        for (let key of expectedKeys) {
          browser.test.assertTrue(actualKeys.includes(key), `Key ${key} exists`);
          if (expected[key] === null) {
            browser.test.assertTrue(actual[key] === null);
            continue;
          }
          if (["array", "object"].includes(typeof expected[key])) {
            assertDeepEqual(expected[key], actual[key]);
            continue;
          }
          browser.test.assertEq(expected[key], actual[key]);
        }
      }

      let [account1Id] = await awaitMessage();
      let result1 = await browser.accounts.list();
      browser.test.assertEq(1, result1.length);
      assertDeepEqual({
        id: account1Id,
        name: "Local Folders",
        type: "none",
        folders: [{
          accountId: account1Id,
          name: "Trash",
          path: "/Trash",
          type: "trash",
        }, {
          accountId: account1Id,
          name: "Outbox",
          path: "/Unsent Messages",
          type: "outbox",
        }],
      }, result1[0]);

      let [account2Id] = await awaitMessage("create account 2");
      let result2 = await browser.accounts.list();
      browser.test.assertEq(2, result2.length);
      assertDeepEqual(result1[0], result2[0]);
      assertDeepEqual({
        id: account2Id,
        name: "Mail for username@hostname",
        type: "imap",
        folders: [{
          accountId: account2Id,
          name: "Inbox",
          path: "/INBOX",
          type: "inbox",
        }],
      }, result2[1]);

      let result3 = await browser.accounts.get(account1Id);
      assertDeepEqual(result1[0], result3);
      let result4 = await browser.accounts.get(account2Id);
      assertDeepEqual(result2[1], result4);

      await awaitMessage("create folders");
      let result5 = await browser.accounts.get(account1Id);
      let platformInfo = await browser.runtime.getPlatformInfo();
      assertDeepEqual([{
          accountId: account1Id,
          name: "Trash",
          path: "/Trash",
          type: "trash",
        }, {
          accountId: account1Id,
          name: "foo bar",
          path: "/Trash/foo bar",
        }, {
          accountId: account1Id,
          name: "Ϟ",
          // This character is not supported on Windows, so it gets hashed,
          // by NS_MsgHashIfNecessary.
          path: platformInfo.os == "win" ? "/Trash/b52bc214" : "/Trash/Ϟ",
        }, {
          accountId: account1Id,
          name: "Outbox",
          path: "/Unsent Messages",
          type: "outbox",
        }], result5.folders);

      browser.test.notifyPass("finished");
    },
    manifest: {
      permissions: ["accountsRead"],
    },
  });

  let account1 = createAccount();

  await extension.startup();
  extension.sendMessage(account1.key);

  await extension.awaitMessage("create account 2");
  let account2 = MailServices.accounts.createAccount();
  account2.incomingServer =
    MailServices.accounts.createIncomingServer("username", "hostname", "imap");
  extension.sendMessage(account2.key);

  await extension.awaitMessage("create folders");
  let inbox1 = [...account1.incomingServer.rootFolder.subFolders][0];
  inbox1.createSubfolder("foo bar", null); // Test our code can handle spaces.
  inbox1.createSubfolder("Ϟ", null); // Test our code can handle unicode.
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();

  cleanUpAccount(account1);
  cleanUpAccount(account2);
});

add_task(async function test_folders() {
  let extension = ExtensionTestUtils.loadExtension({
    async background() {
      let accountId = await new Promise(resolve => {
        browser.test.onMessage.addListener(function listener(acctId) {
          browser.test.onMessage.removeListener(listener);
          resolve(acctId);
        });
      });

      let account = await browser.accounts.get(accountId);
      browser.test.assertEq(2, account.folders.length);

      let folder1 = await browser.accounts.createSubfolder({ accountId, path: "/" }, "folder1");
      browser.test.assertEq(accountId, folder1.accountId);
      browser.test.assertEq("folder1", folder1.name);
      browser.test.assertEq("/folder1", folder1.path);

      account = await browser.accounts.get(accountId);
      browser.test.assertEq(3, account.folders.length);
      browser.test.assertEq("/folder1", account.folders[2].path);

      let folder2 = await browser.accounts.createSubfolder({ accountId, path: "/folder1" }, "folder2");
      browser.test.assertEq(accountId, folder2.accountId);
      browser.test.assertEq("folder2", folder2.name);
      browser.test.assertEq("/folder1/folder2", folder2.path);

      account = await browser.accounts.get(accountId);
      browser.test.assertEq(4, account.folders.length);
      browser.test.assertEq("/folder1/folder2", account.folders[3].path);

      let folder3 = await browser.accounts.renameFolder({ accountId, path: "/folder1/folder2" }, "folder3");
      browser.test.assertEq(accountId, folder3.accountId);
      browser.test.assertEq("folder3", folder3.name);
      browser.test.assertEq("/folder1/folder3", folder3.path);

      account = await browser.accounts.get(accountId);
      browser.test.assertEq(4, account.folders.length);
      browser.test.assertEq("/folder1/folder3", account.folders[3].path);

      await browser.accounts.deleteFolder({ accountId, path: "/folder1/folder3" });

      account = await browser.accounts.get(accountId);
      browser.test.assertEq(4, account.folders.length);
      browser.test.assertEq("/Trash", account.folders[0].path);
      browser.test.assertEq("/Trash/folder3", account.folders[1].path);
      browser.test.assertEq("/Unsent Messages", account.folders[2].path);
      browser.test.assertEq("/folder1", account.folders[3].path);

      await browser.accounts.deleteFolder({ accountId, path: "/Trash/folder3" });

      account = await browser.accounts.get(accountId);
      browser.test.assertEq(3, account.folders.length);
      browser.test.assertEq("/Trash", account.folders[0].path);
      browser.test.assertEq("/Unsent Messages", account.folders[1].path);
      browser.test.assertEq("/folder1", account.folders[2].path);

      browser.test.notifyPass("finished");
    },
    manifest: {
      permissions: ["accountsRead", "accountsFolders"],
    },
  });

  let account = createAccount();
  await extension.startup();
  extension.sendMessage(account.key);
  await extension.awaitFinish("finished");
  await extension.unload();
});
