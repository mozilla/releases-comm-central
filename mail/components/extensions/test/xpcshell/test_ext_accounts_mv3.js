/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);

add_task(async function test_accounts() {
  // Here all the accounts are local but the first account will behave as
  // an actual local account and will be kept last always.
  const files = {
    "background.js": async () => {
      const [account1Id, account1Name] = await window.waitForMessage();

      let defaultAccount = await browser.accounts.getDefault();
      browser.test.assertEq(
        null,
        defaultAccount,
        "The default account should be null, as none is defined."
      );

      // Check that all folders are included by default.
      const result1 = await browser.accounts.list();
      browser.test.assertEq(1, result1.length);
      window.assertDeepEqual(
        {
          id: account1Id,
          name: account1Name,
          type: "none",
          rootFolder: {
            accountId: account1Id,
            name: "Root",
            path: "/",
            subFolders: [
              {
                accountId: account1Id,
                name: "Trash",
                path: "/Trash",
                specialUse: ["trash"],
              },
              {
                accountId: account1Id,
                name: "Outbox",
                path: "/Unsent Messages",
                specialUse: ["outbox"],
              },
            ],
          },
        },
        result1[0]
      );

      // Test that excluding folders works.
      const result1WithOutFolders = await browser.accounts.list(false);
      for (const account of result1WithOutFolders) {
        browser.test.assertEq(
          null,
          account.rootFolder.subFolders,
          "Folders not included"
        );
      }

      const [account2Id, account2Name] = await window.sendMessage(
        "create account 2"
      );
      // The new account is defined as default and should be returned first.
      const result2 = await browser.accounts.list();
      browser.test.assertEq(2, result2.length);
      window.assertDeepEqual(
        [
          {
            id: account2Id,
            name: account2Name,
            type: "imap",
            rootFolder: {
              accountId: account2Id,
              name: "Root",
              path: "/",
              subFolders: [
                {
                  accountId: account2Id,
                  name: "Inbox",
                  path: "/INBOX",
                  specialUse: ["inbox"],
                },
              ],
            },
          },
          {
            id: account1Id,
            name: account1Name,
            type: "none",
            rootFolder: {
              accountId: account1Id,
              name: "Root",
              path: "/",
              subFolders: [
                {
                  accountId: account1Id,
                  name: "Trash",
                  path: "/Trash",
                  specialUse: ["trash"],
                },
                {
                  accountId: account1Id,
                  name: "Outbox",
                  path: "/Unsent Messages",
                  specialUse: ["outbox"],
                },
              ],
            },
          },
        ],
        result2
      );

      const result3 = await browser.accounts.get(account1Id);
      window.assertDeepEqual(result1[0], result3);
      const result4 = await browser.accounts.get(account2Id);
      window.assertDeepEqual(result2[0], result4);

      const result3WithoutFolders = await browser.accounts.get(
        account1Id,
        false
      );
      browser.test.assertEq(
        null,
        result3WithoutFolders.rootFolder.subFolders,
        "Folders not included"
      );
      const result4WithoutFolders = await browser.accounts.get(
        account2Id,
        false
      );
      browser.test.assertEq(
        null,
        result4WithoutFolders.rootFolder.subFolders,
        "Folders not included"
      );

      await window.sendMessage("create folders");

      const result5 = await browser.accounts.get(account1Id);
      const platformInfo = await browser.runtime.getPlatformInfo();
      window.assertDeepEqual(
        [
          {
            accountId: account1Id,
            name: "Trash",
            path: "/Trash",
            subFolders: [
              {
                accountId: account1Id,
                name: "%foo.-~ %test% 'bar'(!)+",
                path: "/Trash/%foo.-~ %test% 'bar'(!)+",
              },
              {
                accountId: account1Id,
                name: "Ϟ",
                // This character is not supported on Windows, so it gets hashed,
                // by NS_MsgHashIfNecessary.
                path: platformInfo.os == "win" ? "/Trash/b52bc214" : "/Trash/Ϟ",
              },
            ],
            specialUse: ["trash"],
          },
          {
            accountId: account1Id,
            name: "Outbox",
            path: "/Unsent Messages",
            specialUse: ["outbox"],
          },
        ],
        result5.rootFolder.subFolders
      );

      // Check we can access the folders through folderPathToURI.
      for (const folder of result5.rootFolder.subFolders) {
        await browser.messages.list(folder.id);
      }

      const result6 = await browser.accounts.get(account2Id);
      window.assertDeepEqual(
        [
          {
            accountId: account2Id,
            name: "Inbox",
            path: "/INBOX",
            subFolders: [
              {
                accountId: account2Id,
                name: "%foo.-~ %test% 'bar'(!)+",
                path: "/INBOX/%foo.-~ %test% 'bar'(!)+",
              },
              {
                accountId: account2Id,
                name: "Ϟ",
                path: "/INBOX/&A94-",
              },
            ],
            specialUse: ["inbox"],
          },
          {
            // The trash folder magically appears at this point.
            // It wasn't here before.
            accountId: "account2",
            name: "Trash",
            path: "/Trash",
            specialUse: ["trash"],
          },
        ],
        result6.rootFolder.subFolders
      );

      // Check we can access the folders through folderPathToURI.
      for (const folder of result6.rootFolder.subFolders) {
        await browser.messages.list(folder.id);
      }

      defaultAccount = await browser.accounts.getDefault();
      browser.test.assertEq(result2[0].id, defaultAccount.id);

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "accountsIdentities", "messagesRead"],
    },
  });

  await extension.startup();
  const account1 = createAccount();
  extension.sendMessage(account1.key, account1.incomingServer.prettyName);

  await extension.awaitMessage("create account 2");
  const account2 = createAccount("imap");
  IMAPServer.open();
  account2.incomingServer.port = IMAPServer.port;
  account2.incomingServer.username = "user";
  account2.incomingServer.password = "password";
  MailServices.accounts.defaultAccount = account2;
  extension.sendMessage(account2.key, account2.incomingServer.prettyName);

  await extension.awaitMessage("create folders");
  const inbox1 = account1.incomingServer.rootFolder.subFolders[0];
  // According to the documentation of decodeURIComponent(), encodeURIComponent()
  // does not escape -.!~*'(), while decodeURIComponent() does unescape them.
  // Test our path-to-uri and uri-to-path functions can handle these special chars.
  inbox1.createSubfolder("%foo.-~ %test% 'bar'(!)+", null);
  inbox1.createSubfolder("Ϟ", null); // Test our code can handle unicode.

  const inbox2 = account2.incomingServer.rootFolder.subFolders[0];
  inbox2.QueryInterface(Ci.nsIMsgImapMailFolder).hierarchyDelimiter = "/";
  // According to the documentation of decodeURIComponent(), encodeURIComponent()
  // does not escape -.!~*'(), while decodeURIComponent() does unescape them.
  // Test our path-to-uri and uri-to-path functions can handle these special chars.
  inbox2.createSubfolder("%foo.-~ %test% 'bar'(!)+", null);
  await PromiseTestUtils.promiseFolderAdded("%foo.-~ %test% 'bar'(!)+");
  inbox2.createSubfolder("Ϟ", null); // Test our code can handle unicode.
  await PromiseTestUtils.promiseFolderAdded("Ϟ");

  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();

  cleanUpAccount(account1);
  cleanUpAccount(account2);
});
