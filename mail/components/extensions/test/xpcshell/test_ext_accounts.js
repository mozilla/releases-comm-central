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

      // Test that excluding folders works.
      let result1WithOutFolders = await browser.accounts.list(false);
      for (let account of result1WithOutFolders) {
        browser.test.assertEq(null, account.folders, "Folders not included");
      }

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

      let result3WithoutFolders = await browser.accounts.get(account1Id, false);
      browser.test.assertEq(
        null,
        result3WithoutFolders.folders,
        "Folders not included"
      );
      let result4WithoutFolders = await browser.accounts.get(account2Id, false);
      browser.test.assertEq(
        null,
        result4WithoutFolders.folders,
        "Folders not included"
      );

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
                name: "%foo %test% 'bar'(!)+",
                path: "/Trash/%foo %test% 'bar'(!)+",
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
                name: "%foo %test% 'bar'(!)+",
                path: "/INBOX/%foo %test% 'bar'(!)+",
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
      permissions: ["accountsRead", "accountsIdentities", "messagesRead"],
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
  let inbox1 = account1.incomingServer.rootFolder.subFolders[0];
  // Test our code can handle characters that might be escaped.
  inbox1.createSubfolder("%foo %test% 'bar'(!)+", null);
  inbox1.createSubfolder("Ϟ", null); // Test our code can handle unicode.

  let inbox2 = account2.incomingServer.rootFolder.subFolders[0];
  inbox2.QueryInterface(Ci.nsIMsgImapMailFolder).hierarchyDelimiter = "/";
  // Test our code can handle characters that might be escaped.
  inbox2.createSubfolder("%foo %test% 'bar'(!)+", null);
  await PromiseTestUtils.promiseFolderAdded("%foo %test% 'bar'(!)+");
  inbox2.createSubfolder("Ϟ", null); // Test our code can handle unicode.
  await PromiseTestUtils.promiseFolderAdded("Ϟ");

  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();

  cleanUpAccount(account1);
  cleanUpAccount(account2);
});

add_task(async function test_identities() {
  let account1 = createAccount();
  let account2 = createAccount("imap");
  let identity0 = addIdentity(account1, "id0@invalid");
  let identity1 = addIdentity(account1, "id1@invalid");
  let identity2 = addIdentity(account1, "id2@invalid");
  let identity3 = addIdentity(account2, "id3@invalid");
  addIdentity(account2, "id4@invalid");
  identity2.label = "A label";
  identity2.fullName = "Identity 2!";
  identity2.organization = "Dis Organization";
  identity2.replyTo = "reply@invalid";
  identity2.composeHtml = true;
  identity2.htmlSigText = "This is me. And this is my Dog.";
  identity2.htmlSigFormat = false;

  equal(account1.defaultIdentity.key, identity0.key);
  equal(account2.defaultIdentity.key, identity3.key);
  let files = {
    "background.js": async () => {
      let accounts = await browser.accounts.list();
      browser.test.assertEq(2, accounts.length);

      const localAccount = accounts.find(account => account.type == "none");
      const imapAccount = accounts.find(account => account.type == "imap");

      // Register event listener.
      let onCreatedLog = [];
      browser.identities.onCreated.addListener((id, created) => {
        onCreatedLog.push({ id, created });
      });
      let onUpdatedLog = [];
      browser.identities.onUpdated.addListener((id, changed) => {
        onUpdatedLog.push({ id, changed });
      });
      let onDeletedLog = [];
      browser.identities.onDeleted.addListener(id => {
        onDeletedLog.push(id);
      });

      const { id: accountId, identities } = localAccount;
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
      browser.test.assertEq(true, identities[2].composeHtml);
      browser.test.assertEq(
        "This is me. And this is my Dog.",
        identities[2].signature
      );
      browser.test.assertEq(true, identities[2].signatureIsPlainText);

      // Testing browser.identities.list().

      let allIdentities = await browser.identities.list();
      browser.test.assertEq(5, allIdentities.length);

      let localIdentities = await browser.identities.list(localAccount.id);
      browser.test.assertEq(
        3,
        localIdentities.length,
        "number of local identities is correct"
      );
      for (let i = 0; i < 2; i++) {
        browser.test.assertEq(
          localAccount.identities[i].id,
          localIdentities[i].id,
          "returned local identity is correct"
        );
      }

      let imapIdentities = await browser.identities.list(imapAccount.id);
      browser.test.assertEq(
        2,
        imapIdentities.length,
        "number of imap identities is correct"
      );
      for (let i = 0; i < 1; i++) {
        browser.test.assertEq(
          imapAccount.identities[i].id,
          imapIdentities[i].id,
          "returned imap identity is correct"
        );
      }

      // Testing browser.identities.get().

      let badIdentity = await browser.identities.get("funny");
      browser.test.assertEq(null, badIdentity);

      for (let identity of identities) {
        let testIdentity = await browser.identities.get(identity.id);
        for (let prop of Object.keys(identity)) {
          browser.test.assertEq(
            identity[prop],
            testIdentity[prop],
            `Testing identity.${prop}`
          );
        }
      }

      // Testing browser.identities.delete().

      let imapDefaultIdentity = await browser.identities.getDefault(
        imapAccount.id
      );
      let imapNonDefaultIdentity = imapIdentities.find(
        identity => identity.id != imapDefaultIdentity.id
      );

      await browser.identities.delete(imapNonDefaultIdentity.id);
      imapIdentities = await browser.identities.list(imapAccount.id);
      browser.test.assertEq(
        1,
        imapIdentities.length,
        "number of imap identities after delete is correct"
      );
      browser.test.assertEq(
        imapDefaultIdentity.id,
        imapIdentities[0].id,
        "leftover identity after delete is correct"
      );

      await browser.test.assertRejects(
        browser.identities.delete(imapDefaultIdentity.id),
        `Identity ${imapDefaultIdentity.id} is the default identity of account ${imapAccount.id} and cannot be deleted`,
        "browser.identities.delete threw exception"
      );

      await browser.test.assertRejects(
        browser.identities.delete("somethingInvalid"),
        "Identity not found: somethingInvalid",
        "browser.identities.delete threw exception"
      );

      // Testing browser.identities.create().

      let createTests = [
        {
          // Set all.
          accountId: imapAccount.id,
          details: {
            email: "id0+test@invalid",
            label: "TestLabel",
            name: "Mr. Test",
            organization: "MZLA",
            replyTo: "id0+test@invalid",
            signature: "This is Bruce. And this is my Cat.",
            composeHtml: true,
            signatureIsPlainText: false,
          },
        },
        {
          // Set some.
          accountId: imapAccount.id,
          details: {
            email: "id0+work@invalid",
            replyTo: "",
            signature: "I am Batman.",
            composeHtml: false,
          },
        },
        {
          // Set none.
          accountId: imapAccount.id,
          details: {},
        },
        {
          // Set some on an invalid account.
          accountId: "somethingInvalid",
          details: {
            email: "id0+work@invalid",
            replyTo: "",
            signature: "I am Batman.",
            composeHtml: false,
          },
          expectedThrow: `Account not found: somethingInvalid`,
        },
        {
          // Try to set a protected property.
          accountId: imapAccount.id,
          details: {
            accountId: "accountId5",
          },
          expectedThrow: `Setting the accountId property of a MailIdentity is not supported.`,
        },
        {
          // Try to set a protected property together with others.
          accountId: imapAccount.id,
          details: {
            id: "id8",
            email: "id0+work@invalid",
            label: "TestLabel",
            name: "Mr. Test",
            organization: "MZLA",
            replyTo: "",
            signature: "I am Batman.",
            composeHtml: false,
            signatureIsPlainText: false,
          },
          expectedThrow: `Setting the id property of a MailIdentity is not supported.`,
        },
      ];
      for (let createTest of createTests) {
        if (createTest.expectedThrow) {
          await browser.test.assertRejects(
            browser.identities.create(createTest.accountId, createTest.details),
            createTest.expectedThrow,
            `It rejects as expected: ${createTest.expectedThrow}.`
          );
        } else {
          let createPromise = new Promise(resolve => {
            const callback = (id, identity) => {
              browser.identities.onCreated.removeListener(callback);
              resolve(identity);
            };
            browser.identities.onCreated.addListener(callback);
          });
          let createdIdentity = await browser.identities.create(
            createTest.accountId,
            createTest.details
          );
          let createdIdentity2 = await createPromise;

          let expected = createTest.details;
          for (let prop of Object.keys(expected)) {
            browser.test.assertEq(
              expected[prop],
              createdIdentity[prop],
              `Testing created identity.${prop}`
            );
            browser.test.assertEq(
              expected[prop],
              createdIdentity2[prop],
              `Testing created identity.${prop}`
            );
          }
          await browser.identities.delete(createdIdentity.id);
        }

        let foundIdentities = await browser.identities.list(imapAccount.id);
        browser.test.assertEq(
          1,
          foundIdentities.length,
          "number of imap identities after create/delete is correct"
        );
      }

      // Testing browser.identities.update().

      let updateTests = [
        {
          // Set all.
          identityId: identities[2].id,
          details: {
            email: "id0+test@invalid",
            label: "TestLabel",
            name: "Mr. Test",
            organization: "MZLA",
            replyTo: "id0+test@invalid",
            signature: "This is Bruce. And this is my Cat.",
            composeHtml: true,
            signatureIsPlainText: false,
          },
        },
        {
          // Set some.
          identityId: identities[2].id,
          details: {
            email: "id0+work@invalid",
            replyTo: "",
            signature: "I am Batman.",
            composeHtml: false,
          },
          expected: {
            email: "id0+work@invalid",
            label: "TestLabel",
            name: "Mr. Test",
            organization: "MZLA",
            replyTo: "",
            signature: "I am Batman.",
            composeHtml: false,
            signatureIsPlainText: false,
          },
        },
        {
          // Clear.
          identityId: identities[2].id,
          details: {
            email: "",
            label: "",
            name: "",
            organization: "",
            replyTo: "",
            signature: "",
            composeHtml: false,
            signatureIsPlainText: true,
          },
        },
        {
          // Try to update an invalid identity.
          identityId: "somethingInvalid",
          details: {
            email: "id0+work@invalid",
            replyTo: "",
            signature: "I am Batman.",
            composeHtml: false,
          },
          expectedThrow: "Identity not found: somethingInvalid",
        },
        {
          // Try to update a protected property.
          identityId: identities[2].id,
          details: {
            accountId: "accountId5",
          },
          expectedThrow:
            "Setting the accountId property of a MailIdentity is not supported.",
        },
        {
          // Try to update another protected property together with others.
          identityId: identities[2].id,
          details: {
            id: "id8",
            email: "id0+work@invalid",
            label: "TestLabel",
            name: "Mr. Test",
            organization: "MZLA",
            replyTo: "",
            signature: "I am Batman.",
            composeHtml: false,
            signatureIsPlainText: false,
          },
          expectedThrow:
            "Setting the id property of a MailIdentity is not supported.",
        },
      ];
      for (let updateTest of updateTests) {
        if (updateTest.expectedThrow) {
          await browser.test.assertRejects(
            browser.identities.update(
              updateTest.identityId,
              updateTest.details
            ),
            updateTest.expectedThrow,
            `It rejects as expected: ${updateTest.expectedThrow}.`
          );
          continue;
        }

        let updatePromise = new Promise(resolve => {
          const callback = (id, changed) => {
            browser.identities.onUpdated.removeListener(callback);
            resolve(changed);
          };
          browser.identities.onUpdated.addListener(callback);
        });
        let updatedIdentity = await browser.identities.update(
          updateTest.identityId,
          updateTest.details
        );
        await updatePromise;

        let returnedIdentity = await browser.identities.get(
          updateTest.identityId
        );

        let expected = updateTest.expected || updateTest.details;
        for (let prop of Object.keys(expected)) {
          browser.test.assertEq(
            expected[prop],
            updatedIdentity[prop],
            `Testing updated identity.${prop}`
          );
          browser.test.assertEq(
            expected[prop],
            returnedIdentity[prop],
            `Testing returned identity.${prop}`
          );
        }
      }

      // Testing getDefault().

      let defaultIdentity = await browser.identities.getDefault(accountId);
      browser.test.assertEq(identities[0].id, defaultIdentity.id);

      await browser.identities.setDefault(accountId, identityIds[2]);
      defaultIdentity = await browser.identities.getDefault(accountId);
      browser.test.assertEq(identities[2].id, defaultIdentity.id);

      let { identities: newIdentities } = await browser.accounts.get(accountId);
      browser.test.assertEq(3, newIdentities.length);
      browser.test.assertEq(identityIds[2], newIdentities[0].id);
      browser.test.assertEq(identityIds[0], newIdentities[1].id);
      browser.test.assertEq(identityIds[1], newIdentities[2].id);

      await browser.identities.setDefault(accountId, identityIds[1]);
      defaultIdentity = await browser.identities.getDefault(accountId);
      browser.test.assertEq(identities[1].id, defaultIdentity.id);

      ({ identities: newIdentities } = await browser.accounts.get(accountId));
      browser.test.assertEq(3, newIdentities.length);
      browser.test.assertEq(identityIds[1], newIdentities[0].id);
      browser.test.assertEq(identityIds[2], newIdentities[1].id);
      browser.test.assertEq(identityIds[0], newIdentities[2].id);

      // Check event listeners.
      window.assertDeepEqual(
        onCreatedLog,
        [
          {
            id: "id6",
            created: {
              accountId: "account4",
              id: "id6",
              label: "TestLabel",
              name: "Mr. Test",
              email: "id0+test@invalid",
              replyTo: "id0+test@invalid",
              organization: "MZLA",
              composeHtml: true,
              signature: "This is Bruce. And this is my Cat.",
              signatureIsPlainText: false,
            },
          },
          {
            id: "id7",
            created: {
              accountId: "account4",
              id: "id7",
              label: "",
              name: "",
              email: "id0+work@invalid",
              replyTo: "",
              organization: "",
              composeHtml: false,
              signature: "I am Batman.",
              signatureIsPlainText: true,
            },
          },
          {
            id: "id8",
            created: {
              accountId: "account4",
              id: "id8",
              label: "",
              name: "",
              email: "",
              replyTo: "",
              organization: "",
              composeHtml: true,
              signature: "",
              signatureIsPlainText: true,
            },
          },
        ],
        "captured onCreated events are correct"
      );
      window.assertDeepEqual(
        onUpdatedLog,
        [
          {
            id: "id3",
            changed: {
              label: "TestLabel",
              name: "Mr. Test",
              email: "id0+test@invalid",
              replyTo: "id0+test@invalid",
              organization: "MZLA",
              signature: "This is Bruce. And this is my Cat.",
              signatureIsPlainText: false,
              accountId: "account3",
              id: "id3",
            },
          },
          {
            id: "id3",
            changed: {
              email: "id0+work@invalid",
              replyTo: "",
              composeHtml: false,
              signature: "I am Batman.",
              accountId: "account3",
              id: "id3",
            },
          },
          {
            id: "id3",
            changed: {
              label: "",
              name: "",
              email: "",
              organization: "",
              signature: "",
              signatureIsPlainText: true,
              accountId: "account3",
              id: "id3",
            },
          },
        ],
        "captured onUpdated events are correct"
      );
      window.assertDeepEqual(
        onDeletedLog,
        ["id5", "id6", "id7", "id8"],
        "captured onDeleted events are correct"
      );

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "accountsIdentities"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  equal(account1.defaultIdentity.key, identity1.key);

  cleanUpAccount(account1);
  cleanUpAccount(account2);
});

add_task(async function test_identities_without_write_permissions() {
  let account = createAccount();
  let identity0 = addIdentity(account, "id0@invalid");

  equal(account.defaultIdentity.key, identity0.key);

  let extension = ExtensionTestUtils.loadExtension({
    async background() {
      let accounts = await browser.accounts.list();
      browser.test.assertEq(1, accounts.length);

      const [{ identities }] = accounts;
      browser.test.assertEq(1, identities.length);

      // Testing browser.identities.update().

      await browser.test.assertThrows(
        () => browser.identities.update(identities[0].id, {}),
        "browser.identities.update is not a function",
        "It rejects for a missing permission."
      );

      // Testing browser.identities.delete().

      await browser.test.assertThrows(
        () => browser.identities.delete(identities[0].id),
        "browser.identities.delete is not a function",
        "It rejects for a missing permission."
      );

      browser.test.notifyPass("finished");
    },
    manifest: {
      permissions: ["accountsRead"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  cleanUpAccount(account);
});
