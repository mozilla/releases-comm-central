/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.import(
  "resource://testing-common/ExtensionXPCShellUtils.jsm"
);

add_task(async function test_accounts() {
  // Here all the accounts are local but the first account will behave as
  // an actual local account and will be kept last always.
  let files = {
    "background.js": async () => {
      let [account1Id, account1Name] = await window.waitForMessage();

      let defaultAccount = await browser.accounts.getDefault();
      browser.test.assertEq(
        null,
        defaultAccount,
        "The default account should be null, as none is defined."
      );

      let result1 = await browser.accounts.list();
      browser.test.assertEq(1, result1.length);
      window.assertDeepEqual(
        {
          id: account1Id,
          name: account1Name,
          type: "none",
          folders: [
            {
              accountId: account1Id,
              name: "Trash",
              path: "/Trash",
              type: "trash",
            },
            {
              accountId: account1Id,
              name: "Outbox",
              path: "/Unsent Messages",
              type: "outbox",
            },
          ],
        },
        result1[0]
      );

      let [account2Id, account2Name] = await window.sendMessage(
        "create account 2"
      );
      let result2 = await browser.accounts.list();
      browser.test.assertEq(2, result2.length);
      window.assertDeepEqual(result1[0], result2[1]);
      window.assertDeepEqual(
        {
          id: account2Id,
          name: account2Name,
          type: "imap",
          folders: [
            {
              accountId: account2Id,
              name: "Inbox",
              path: "/INBOX",
              type: "inbox",
            },
          ],
        },
        result2[0]
      );

      let result3 = await browser.accounts.get(account1Id);
      window.assertDeepEqual(result1[0], result3);
      let result4 = await browser.accounts.get(account2Id);
      window.assertDeepEqual(result2[0], result4);

      await window.sendMessage("create folders");
      let result5 = await browser.accounts.get(account1Id);
      let platformInfo = await browser.runtime.getPlatformInfo();
      window.assertDeepEqual(
        [
          {
            accountId: account1Id,
            name: "Trash",
            path: "/Trash",
            subFolders: [
              {
                accountId: account1Id,
                name: "foo 'bar'(!)",
                path: "/Trash/foo 'bar'(!)",
              },
              {
                accountId: account1Id,
                name: "Ϟ",
                // This character is not supported on Windows, so it gets hashed,
                // by NS_MsgHashIfNecessary.
                path: platformInfo.os == "win" ? "/Trash/b52bc214" : "/Trash/Ϟ",
              },
            ],
            type: "trash",
          },
          {
            accountId: account1Id,
            name: "Outbox",
            path: "/Unsent Messages",
            type: "outbox",
          },
        ],
        result5.folders
      );

      // Check we can access the folders through folderPathToURI.
      for (let folder of result5.folders) {
        await browser.messages.list(folder);
      }

      let result6 = await browser.accounts.get(account2Id);
      window.assertDeepEqual(
        [
          {
            accountId: account2Id,
            name: "Inbox",
            path: "/INBOX",
            subFolders: [
              {
                accountId: account2Id,
                name: "foo 'bar'(!)",
                path: "/INBOX/foo 'bar'(!)",
              },
              {
                accountId: account2Id,
                name: "Ϟ",
                path: "/INBOX/&A94-",
              },
            ],
            type: "inbox",
          },
          {
            // The trash folder magically appears at this point.
            // It wasn't here before.
            accountId: "account2",
            name: "Trash",
            path: "/Trash",
            type: "trash",
          },
        ],
        result6.folders
      );

      // Check we can access the folders through folderPathToURI.
      for (let folder of result6.folders) {
        await browser.messages.list(folder);
      }

      defaultAccount = await browser.accounts.getDefault();
      browser.test.assertEq(result2[0].id, defaultAccount.id);

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
    },
  });

  await extension.startup();
  let account1 = createAccount();
  extension.sendMessage(account1.key, account1.incomingServer.prettyName);

  await extension.awaitMessage("create account 2");
  let account2 = createAccount("imap");
  IMAPServer.open();
  account2.incomingServer.port = IMAPServer.port;
  account2.incomingServer.username = "user";
  account2.incomingServer.password = "password";
  MailServices.accounts.defaultAccount = account2;
  extension.sendMessage(account2.key, account2.incomingServer.prettyName);

  await extension.awaitMessage("create folders");
  let inbox1 = [...account1.incomingServer.rootFolder.subFolders][0];
  // Test our code can handle characters that might be escaped.
  inbox1.createSubfolder("foo 'bar'(!)", null);
  inbox1.createSubfolder("Ϟ", null); // Test our code can handle unicode.

  let inbox2 = [...account2.incomingServer.rootFolder.subFolders][0];
  inbox2.QueryInterface(Ci.nsIMsgImapMailFolder).hierarchyDelimiter = "/";
  // Test our code can handle characters that might be escaped.
  inbox2.createSubfolder("foo 'bar'(!)", null);
  await PromiseTestUtils.promiseFolderAdded("foo 'bar'(!)");
  inbox2.createSubfolder("Ϟ", null); // Test our code can handle unicode.
  await PromiseTestUtils.promiseFolderAdded("Ϟ");

  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();

  cleanUpAccount(account1);
  cleanUpAccount(account2);
});

add_task(async function test_identities() {
  let account = createAccount();
  let identity0 = addIdentity(account, "id0@invalid");
  let identity1 = addIdentity(account, "id1@invalid");
  let identity2 = addIdentity(account, "id2@invalid");
  identity2.label = "A label";
  identity2.fullName = "Identity 2!";
  identity2.organization = "Dis Organization";
  identity2.replyTo = "reply@invalid";

  equal(account.defaultIdentity.key, identity0.key);

  let extension = ExtensionTestUtils.loadExtension({
    async background() {
      let accounts = await browser.accounts.list();
      browser.test.assertEq(1, accounts.length);

      const [{ id: accountId, identities }] = accounts;
      const identityIds = identities.map(i => i.id);
      browser.test.assertEq(3, identities.length);

      browser.test.assertEq(accountId, identities[0].accountId);
      browser.test.assertEq("id0@invalid", identities[0].email);
      browser.test.assertEq(accountId, identities[1].accountId);
      browser.test.assertEq("id1@invalid", identities[1].email);
      browser.test.assertEq(accountId, identities[2].accountId);
      browser.test.assertEq("id2@invalid", identities[2].email);
      browser.test.assertEq("A label", identities[2].label);
      browser.test.assertEq("Identity 2!", identities[2].name);
      browser.test.assertEq("Dis Organization", identities[2].organization);
      browser.test.assertEq("reply@invalid", identities[2].replyTo);

      let defaultIdentity = await browser.accounts.getDefaultIdentity(
        accountId
      );
      browser.test.assertEq(identities[0].id, defaultIdentity.id);

      await browser.accounts.setDefaultIdentity(accountId, identityIds[2]);
      defaultIdentity = await browser.accounts.getDefaultIdentity(accountId);
      browser.test.assertEq(identities[2].id, defaultIdentity.id);

      let { identities: newIdentities } = await browser.accounts.get(accountId);
      browser.test.assertEq(3, newIdentities.length);
      browser.test.assertEq(identityIds[2], newIdentities[0].id);
      browser.test.assertEq(identityIds[0], newIdentities[1].id);
      browser.test.assertEq(identityIds[1], newIdentities[2].id);

      await browser.accounts.setDefaultIdentity(accountId, identityIds[1]);
      defaultIdentity = await browser.accounts.getDefaultIdentity(accountId);
      browser.test.assertEq(identities[1].id, defaultIdentity.id);

      ({ identities: newIdentities } = await browser.accounts.get(accountId));
      browser.test.assertEq(3, newIdentities.length);
      browser.test.assertEq(identityIds[1], newIdentities[0].id);
      browser.test.assertEq(identityIds[2], newIdentities[1].id);
      browser.test.assertEq(identityIds[0], newIdentities[2].id);

      browser.test.notifyPass("finished");
    },
    manifest: {
      permissions: ["accountsRead"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  equal(account.defaultIdentity.key, identity1.key);

  cleanUpAccount(account);
});
