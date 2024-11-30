/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);
var { FileUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/FileUtils.sys.mjs"
);
var { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mail/OpenPGPTestUtils.sys.mjs"
);

const OPENPGP_TEST_DIR = do_get_file("../../../../test/browser/openpgp");
const OPENPGP_KEY_PATH = PathUtils.join(
  OPENPGP_TEST_DIR.path,
  "data",
  "keys",
  "alice@openpgp.example-0xf231550c4f47e38e-secret.asc"
);

add_setup(async function setup() {
  // There are a couple of deprecated properties in MV3, which we still want to
  // test in MV2 but also report to the user. By default, tests throw when
  // deprecated properties are used.
  Services.prefs.setBoolPref(
    "extensions.webextensions.warnings-as-errors",
    false
  );
  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref("extensions.webextensions.warnings-as-errors");
  });
  await OpenPGPTestUtils.initOpenPGP();
  await new Promise(resolve => executeSoon(resolve));
});

add_task(async function test_accounts() {
  // Here all the accounts are local but the first account will behave as
  // an actual local account and will be kept last always.
  const files = {
    "background.js": async () => {
      const [account1Id, account1Name] = await window.waitForMessage();

      const defaultAccount = await browser.accounts.getDefault();
      browser.test.assertEq(
        null,
        defaultAccount,
        "The default account should be null, as none is defined."
      );

      const result1 = await browser.accounts.list();
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
      const result1WithOutFolders = await browser.accounts.list(false);
      for (const account of result1WithOutFolders) {
        browser.test.assertEq(null, account.folders, "Folders not included");
      }

      const [account2Id, account2Name] =
        await window.sendMessage("create account 2");
      // The new account is defined as default and should be returned first.
      const result2 = await browser.accounts.list();
      browser.test.assertEq(2, result2.length);
      window.assertDeepEqual(
        [
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
        result3WithoutFolders.folders,
        "Folders not included"
      );
      const result4WithoutFolders = await browser.accounts.get(
        account2Id,
        false
      );
      browser.test.assertEq(
        null,
        result4WithoutFolders.folders,
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
      for (const folder of result5.folders) {
        await browser.messages.list(folder);
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
      for (const folder of result6.folders) {
        await browser.messages.list(folder);
      }

      // Strict check for accounts.getDefault(false).
      const defaultAccountFalse = await browser.accounts.getDefault(false);
      window.assertDeepEqual(
        {
          id: result2[0].id,
          name: "Mail for user@localhost",
          type: "imap",
          rootFolder: {
            id: `${result2[0].id}://`,
            name: "Root",
            path: "/",
            specialUse: [],
            isFavorite: false,
            isRoot: true,
            isTag: false,
            isUnified: false,
            isVirtual: false,
            accountId: result2[0].id,
          },
          identities: [],
          folders: null,
        },
        defaultAccountFalse,
        "The return value for accounts.getDefault(false) should be correct",
        { strict: true }
      );

      // Remove properties, which will be different, if folders are included.
      delete defaultAccountFalse.folders;

      // Lazy check for accounts.getDefault(): It should return at least the same
      // values as accounts.getDefault(false). The additional folder and subFolder
      // properties are checked seperatly.
      const defaultAccountTrue = await browser.accounts.getDefault();
      window.assertDeepEqual(
        defaultAccountFalse,
        defaultAccountTrue,
        "The return value for accounts.getDefault() should be correct"
      );
      browser.test.assertTrue(
        Array.isArray(defaultAccountTrue.folders),
        "The MailAccount.folders property should be an array"
      );
      browser.test.assertTrue(
        Array.isArray(defaultAccountTrue.rootFolder.subFolders),
        "The MailFolder.subFolders property should be an array"
      );

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      manifest_version: 2,
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

add_task(async function test_identities() {
  const account1 = createAccount();
  const account2 = createAccount("imap");
  const identity1 = addIdentity(account1, "id1@invalid");
  const identity2 = addIdentity(account1, "id2@invalid");
  const identity3 = addIdentity(account1, "id3@invalid");
  const identity4 = addIdentity(account2, "id4@invalid");
  addIdentity(account2, "id4@invalid");
  identity3.label = "A label";
  identity3.fullName = "Identity 3!";
  identity3.organization = "Dis Organization";
  identity3.replyTo = "reply@invalid";
  identity3.composeHtml = true;
  identity3.htmlSigText = "This is me. And this is my Dog.";
  identity3.htmlSigFormat = false;

  // Make identity1 fully support S/MIME (certs do not need to be real).
  identity1.setUnicharAttribute("encryption_cert_name", "smime-cert");
  identity1.setUnicharAttribute("signing_cert_name", "smime-cert");

  // Make identity2 support S/MIME signing.
  identity2.setUnicharAttribute("signing_cert_name", "smime-cert");

  // Make identity3 support S/MIME encryption.
  identity3.setUnicharAttribute("encryption_cert_name", "smime-cert");

  // Make identity1 support OpenPGP.
  const [keyId] = await OpenPGPTestUtils.importPrivateKey(
    null,
    new FileUtils.File(OPENPGP_KEY_PATH)
  );
  identity1.setUnicharAttribute("openpgp_key_id", keyId);

  equal(account1.defaultIdentity.key, identity1.key);
  equal(account2.defaultIdentity.key, identity4.key);
  const files = {
    "background.js": async () => {
      const accounts = await browser.accounts.list();
      browser.test.assertEq(2, accounts.length);

      const localAccount = accounts.find(account => account.type == "none");
      const imapAccount = accounts.find(account => account.type == "imap");

      // Register event listener.
      const onCreatedLog = [];
      browser.identities.onCreated.addListener((id, created) => {
        onCreatedLog.push({ id, created });
      });
      const onUpdatedLog = [];
      browser.identities.onUpdated.addListener((id, changed) => {
        onUpdatedLog.push({ id, changed });
      });
      const onDeletedLog = [];
      browser.identities.onDeleted.addListener(id => {
        onDeletedLog.push(id);
      });

      const { id: accountId, identities } = localAccount;
      const identityIds = identities.map(i => i.id);
      browser.test.assertEq(3, identities.length);
      // The identities and identityIds arrays are 0-index, while the identities
      // themselves are 1-index.
      browser.test.assertEq(accountId, identities[0].accountId);
      browser.test.assertEq("id1@invalid", identities[0].email);
      browser.test.assertEq(accountId, identities[1].accountId);
      browser.test.assertEq("id2@invalid", identities[1].email);
      browser.test.assertEq(accountId, identities[2].accountId);
      browser.test.assertEq("id3@invalid", identities[2].email);
      browser.test.assertEq("A label", identities[2].label);
      browser.test.assertEq("Identity 3!", identities[2].name);
      browser.test.assertEq("Dis Organization", identities[2].organization);
      browser.test.assertEq("reply@invalid", identities[2].replyTo);
      browser.test.assertEq(true, identities[2].composeHtml);
      browser.test.assertEq(
        "This is me. And this is my Dog.",
        identities[2].signature
      );
      browser.test.assertEq(true, identities[2].signatureIsPlainText);

      const expectedIdentity = [
        {
          accountId: "account3",
          id: "id1",
          label: "",
          name: "",
          email: "id1@invalid",
          replyTo: "",
          organization: "",
          composeHtml: true,
          signature: "",
          signatureIsPlainText: true,
          encryptionCapabilities: {
            OpenPGP: {
              canEncrypt: true,
              canSign: true,
            },
            "S/MIME": {
              canEncrypt: true,
              canSign: true,
            },
          },
        },
        {
          accountId: "account3",
          id: "id2",
          label: "",
          name: "",
          email: "id2@invalid",
          replyTo: "",
          organization: "",
          composeHtml: true,
          signature: "",
          signatureIsPlainText: true,
          encryptionCapabilities: {
            OpenPGP: {
              canEncrypt: false,
              canSign: false,
            },
            "S/MIME": {
              canEncrypt: false,
              canSign: true,
            },
          },
        },
        {
          accountId: "account3",
          id: "id3",
          label: "A label",
          name: "Identity 3!",
          email: "id3@invalid",
          replyTo: "reply@invalid",
          organization: "Dis Organization",
          composeHtml: true,
          signature: "This is me. And this is my Dog.",
          signatureIsPlainText: true,
          encryptionCapabilities: {
            OpenPGP: {
              canEncrypt: false,
              canSign: false,
            },
            "S/MIME": {
              canEncrypt: true,
              canSign: false,
            },
          },
        },
      ];

      for (let i = 0; i < 3; i++) {
        window.assertDeepEqual(
          expectedIdentity[i],
          localAccount.identities[i],
          "returned local identity by accounts.list() is correct",
          { strict: true }
        );
      }

      // Testing browser.identities.list().

      const allIdentities = await browser.identities.list();
      browser.test.assertEq(5, allIdentities.length);

      const localIdentities = await browser.identities.list(localAccount.id);
      browser.test.assertEq(
        3,
        localIdentities.length,
        "number of local identities is correct"
      );
      for (let i = 0; i < 3; i++) {
        window.assertDeepEqual(
          expectedIdentity[i],
          localIdentities[i],
          "returned local identity by identities.list() is correct",
          { strict: true }
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

      const badIdentity = await browser.identities.get("funny");
      browser.test.assertEq(null, badIdentity);
      for (const identity of identities) {
        const testIdentity = await browser.identities.get(identity.id);
        for (const prop of Object.keys(identity)) {
          window.assertDeepEqual(
            identity[prop],
            testIdentity[prop],
            `Testing identity.${prop}`
          );
        }
      }

      // Testing browser.identities.delete().

      const imapDefaultIdentity = await browser.identities.getDefault(
        imapAccount.id
      );
      const imapNonDefaultIdentity = imapIdentities.find(
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

      const createTests = [
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
          // Try to set the encryptionCapabilities property.
          accountId: imapAccount.id,
          details: {
            encryptionCapabilities: {
              OpenPGP: { canSign: true, canEncrypt: true },
              "S/MIME": { canSign: true, canEncrypt: true },
            },
          },
          expectedThrow: `Setting the encryptionCapabilities property of a MailIdentity is not supported.`,
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
      for (const createTest of createTests) {
        if (createTest.expectedThrow) {
          await browser.test.assertRejects(
            browser.identities.create(createTest.accountId, createTest.details),
            createTest.expectedThrow,
            `It rejects as expected: ${createTest.expectedThrow}.`
          );
        } else {
          const createPromise = new Promise(resolve => {
            const callback = (id, identity) => {
              browser.identities.onCreated.removeListener(callback);
              resolve(identity);
            };
            browser.identities.onCreated.addListener(callback);
          });
          const createdIdentity = await browser.identities.create(
            createTest.accountId,
            createTest.details
          );
          const createdIdentity2 = await createPromise;

          const expected = createTest.details;
          for (const prop of Object.keys(expected)) {
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

        const foundIdentities = await browser.identities.list(imapAccount.id);
        browser.test.assertEq(
          1,
          foundIdentities.length,
          "number of imap identities after create/delete is correct"
        );
      }

      // Testing browser.identities.update().

      const updateTests = [
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
          // Try to update the encryptionCapabilities property.
          identityId: identities[2].id,
          details: {
            encryptionCapabilities: {
              OpenPGP: { canSign: true, canEncrypt: true },
              "S/MIME": { canSign: true, canEncrypt: true },
            },
          },
          expectedThrow: `Setting the encryptionCapabilities property of a MailIdentity is not supported.`,
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
      for (const updateTest of updateTests) {
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

        const updatePromise = new Promise(resolve => {
          const callback = (id, changed) => {
            browser.identities.onUpdated.removeListener(callback);
            resolve(changed);
          };
          browser.identities.onUpdated.addListener(callback);
        });
        const updatedIdentity = await browser.identities.update(
          updateTest.identityId,
          updateTest.details
        );
        await updatePromise;

        const returnedIdentity = await browser.identities.get(
          updateTest.identityId
        );

        const expected = updateTest.expected || updateTest.details;
        for (const prop of Object.keys(expected)) {
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

      // Trigger change to encryption capabilities.
      await new Promise(resolve => {
        const found = new Set();
        const listener = id => {
          found.add(id);
          if (found.size == 3) {
            browser.identities.onUpdated.removeListener(listener);
            resolve();
          }
        };
        browser.identities.onUpdated.addListener(listener);
        window.sendMessage("removeEncryptionCapabilities");
      });

      // Check event listeners.
      window.assertDeepEqual(
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
              encryptionCapabilities: {
                OpenPGP: {
                  canEncrypt: false,
                  canSign: false,
                },
                "S/MIME": {
                  canEncrypt: false,
                  canSign: false,
                },
              },
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
              encryptionCapabilities: {
                OpenPGP: {
                  canEncrypt: false,
                  canSign: false,
                },
                "S/MIME": {
                  canEncrypt: false,
                  canSign: false,
                },
              },
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
              encryptionCapabilities: {
                OpenPGP: {
                  canEncrypt: false,
                  canSign: false,
                },
                "S/MIME": {
                  canEncrypt: false,
                  canSign: false,
                },
              },
            },
          },
        ],
        onCreatedLog,
        "captured onCreated events are correct",
        { strict: true }
      );
      window.assertDeepEqual(
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
          {
            id: "id1",
            changed: {
              encryptionCapabilities: {
                OpenPGP: {
                  canEncrypt: false,
                  canSign: false,
                },
                "S/MIME": {
                  canEncrypt: false,
                  canSign: false,
                },
              },
              accountId: "account3",
              id: "id1",
            },
          },
          {
            id: "id2",
            changed: {
              encryptionCapabilities: {
                OpenPGP: {
                  canEncrypt: false,
                  canSign: false,
                },
                "S/MIME": {
                  canEncrypt: false,
                  canSign: false,
                },
              },
              accountId: "account3",
              id: "id2",
            },
          },
          {
            id: "id3",
            changed: {
              encryptionCapabilities: {
                OpenPGP: {
                  canEncrypt: false,
                  canSign: false,
                },
                "S/MIME": {
                  canEncrypt: false,
                  canSign: false,
                },
              },
              accountId: "account3",
              id: "id3",
            },
          },
        ],
        onUpdatedLog,
        "captured onUpdated events are correct",
        { strict: true }
      );
      window.assertDeepEqual(
        ["id5", "id6", "id7", "id8"],
        onDeletedLog,
        "captured onDeleted events are correct",
        { strict: true }
      );

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      manifest_version: 2,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "accountsIdentities"],
    },
  });

  extension.onMessage("removeEncryptionCapabilities", async () => {
    identity1.setUnicharAttribute("encryption_cert_name", "");
    identity1.setUnicharAttribute("signing_cert_name", "");
    identity1.setUnicharAttribute("openpgp_key_id", "");
    identity2.setUnicharAttribute("signing_cert_name", "");
    identity3.setUnicharAttribute("encryption_cert_name", "");
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  equal(account1.defaultIdentity.key, identity2.key);

  cleanUpAccount(account1);
  cleanUpAccount(account2);
});

add_task(async function test_identities_without_write_permissions() {
  const account = createAccount();
  const identity0 = addIdentity(account, "id1@invalid");

  equal(account.defaultIdentity.key, identity0.key);

  const extension = ExtensionTestUtils.loadExtension({
    async background() {
      const accounts = await browser.accounts.list();
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
      manifest_version: 2,
      permissions: ["accountsRead"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  cleanUpAccount(account);
});

add_task(async function test_accounts_events() {
  const account1 = createAccount();
  addIdentity(account1, "id2@invalid");

  const files = {
    "background.js": async () => {
      // Register event listener.
      const onCreatedLog = [];
      const onUpdatedLog = [];
      const onDeletedLog = [];

      const createListener = (id, created) => {
        onCreatedLog.push({ id, created });
      };
      const updateListener = (id, changed) => {
        onUpdatedLog.push({ id, changed });
      };
      const deleteListener = id => {
        onDeletedLog.push(id);
      };

      await browser.accounts.onCreated.addListener(createListener);
      await browser.accounts.onUpdated.addListener(updateListener);
      await browser.accounts.onDeleted.addListener(deleteListener);

      // Create accounts.
      const imapAccountKey = await window.sendMessage("createAccount", {
        type: "imap",
        identity: "user@invalidImap",
      });
      const localAccountKey = await window.sendMessage("createAccount", {
        type: "none",
        identity: "user@invalidLocal",
      });
      const popAccountKey = await window.sendMessage("createAccount", {
        type: "pop3",
        identity: "user@invalidPop",
      });

      // Update account identities.
      const accounts = await browser.accounts.list();
      const imapAccount = accounts.find(a => a.id == imapAccountKey);
      const localAccount = accounts.find(a => a.id == localAccountKey);
      const popAccount = accounts.find(a => a.id == popAccountKey);

      const id1 = await browser.identities.create(imapAccount.id, {
        composeHtml: true,
        email: "user1@inter.net",
        name: "user1",
      });
      const id2 = await browser.identities.create(localAccount.id, {
        composeHtml: false,
        email: "user2@inter.net",
        name: "user2",
      });
      const id3 = await browser.identities.create(popAccount.id, {
        composeHtml: false,
        email: "user3@inter.net",
        name: "user3",
      });

      await browser.identities.setDefault(imapAccount.id, id1.id);
      browser.test.assertEq(
        id1.id,
        (await browser.identities.getDefault(imapAccount.id)).id
      );
      await browser.identities.setDefault(localAccount.id, id2.id);
      browser.test.assertEq(
        id2.id,
        (await browser.identities.getDefault(localAccount.id)).id
      );
      await browser.identities.setDefault(popAccount.id, id3.id);
      browser.test.assertEq(
        id3.id,
        (await browser.identities.getDefault(popAccount.id)).id
      );

      // Update account names.
      await window.sendMessage("updateAccountName", {
        accountKey: imapAccountKey,
        name: "Test1",
      });
      await window.sendMessage("updateAccountName", {
        accountKey: localAccountKey,
        name: "Test2",
      });
      await window.sendMessage("updateAccountName", {
        accountKey: popAccountKey,
        name: "Test3",
      });

      // Delete accounts.
      await window.sendMessage("removeAccount", {
        accountKey: imapAccountKey,
      });
      await window.sendMessage("removeAccount", {
        accountKey: localAccountKey,
      });
      await window.sendMessage("removeAccount", {
        accountKey: popAccountKey,
      });

      await browser.accounts.onCreated.removeListener(createListener);
      await browser.accounts.onUpdated.removeListener(updateListener);
      await browser.accounts.onDeleted.removeListener(deleteListener);

      // Check event listeners.
      browser.test.assertEq(3, onCreatedLog.length);
      window.assertDeepEqual(
        [
          {
            id: "account7",
            created: {
              id: "account7",
              type: "imap",
              identities: [],
              name: "Mail for account7user@localhost",
              folders: null,
            },
          },
          {
            id: "account8",
            created: {
              id: "account8",
              type: "none",
              identities: [],
              name: "account8user on localhost",
              folders: null,
            },
          },
          {
            id: "account9",
            created: {
              id: "account9",
              type: "pop3",
              identities: [],
              name: "account9user on localhost",
              folders: null,
            },
          },
        ],
        onCreatedLog,
        "captured onCreated events are correct"
      );
      window.assertDeepEqual(
        [
          {
            id: "account7",
            changed: { id: "account7", name: "Mail for user@localhost" },
          },
          {
            id: "account7",
            changed: {
              id: "account7",
              defaultIdentity: { id: "id11" },
            },
          },
          {
            id: "account8",
            changed: {
              id: "account8",
              defaultIdentity: { id: "id12" },
            },
          },
          {
            id: "account9",
            changed: {
              id: "account9",
              defaultIdentity: { id: "id13" },
            },
          },
          {
            id: "account7",
            changed: {
              id: "account7",
              defaultIdentity: { id: "id14" },
            },
          },
          {
            id: "account8",
            changed: {
              id: "account8",
              defaultIdentity: { id: "id15" },
            },
          },
          {
            id: "account9",
            changed: {
              id: "account9",
              defaultIdentity: { id: "id16" },
            },
          },
          {
            id: "account7",
            changed: {
              id: "account7",
              name: "Test1",
            },
          },
          {
            id: "account8",
            changed: {
              id: "account8",
              name: "Test2",
            },
          },
          {
            id: "account9",
            changed: {
              id: "account9",
              name: "Test3",
            },
          },
        ],
        onUpdatedLog,
        "captured onUpdated events are correct"
      );
      window.assertDeepEqual(
        ["account7", "account8", "account9"],
        onDeletedLog,
        "captured onDeleted events are correct"
      );

      // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
      await new Promise(r => window.setTimeout(r, 250));
      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      manifest_version: 2,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "accountsIdentities"],
    },
  });

  extension.onMessage("createAccount", details => {
    const account = createAccount(details.type);
    addIdentity(account, details.identity);
    extension.sendMessage(account.key);
  });
  extension.onMessage("updateAccountName", details => {
    const account = MailServices.accounts.getAccount(details.accountKey);
    account.incomingServer.prettyName = details.name;
    extension.sendMessage();
  });
  extension.onMessage("removeAccount", details => {
    const account = MailServices.accounts.getAccount(details.accountKey);
    cleanUpAccount(account);
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  cleanUpAccount(account1);
});
