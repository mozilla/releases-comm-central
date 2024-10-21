/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mail/OpenPGPTestUtils.sys.mjs"
);

const OPENPGP_TEST_DIR = getTestFilePath("../../../../test/browser/openpgp");
const OPENPGP_KEY_PATH = PathUtils.join(
  OPENPGP_TEST_DIR,
  "data",
  "keys",
  "alice@openpgp.example-0xf231550c4f47e38e-secret.asc"
);

var gRootFolder, gTestFolder, gDraftsFolder, gDrafts;

add_setup(async () => {
  await OpenPGPTestUtils.initOpenPGP();

  const account = createAccount("pop3");
  const defaultIdentity = addIdentity(account);
  const nonDefaultIdentity = addIdentity(account);
  const identitySmimeAndOpenPGP = addIdentity(account, "full_enc@invalid");
  const identitySmimeSignOnly = addIdentity(account, "smime_sign@invalid");
  const identitySmimeEncryptOnly = addIdentity(account, "smime_enc@invalid");

  defaultIdentity.attachVCard = false;
  nonDefaultIdentity.attachVCard = true;

  gRootFolder = account.incomingServer.rootFolder;

  gRootFolder.createSubfolder("test", null);
  gTestFolder = gRootFolder.getChildNamed("test");
  createMessages(gTestFolder, 4);

  // TODO: Figure out why naming this folder drafts is problematic.
  gRootFolder.createSubfolder("something", null);
  gDraftsFolder = gRootFolder.getChildNamed("something");
  gDraftsFolder.flags = Ci.nsMsgFolderFlags.Drafts;
  createMessages(gDraftsFolder, 2);
  gDrafts = [...gDraftsFolder.messages];

  // Use an undefined identifier for the configured S/MIME certificates.
  // This will cause the code to assume that a certificate is configured,
  // but the code will fail when attempting to use it.
  const smimeFakeCert = "smime-cert";

  // Make identityEncryption fully support S/MIME.
  identitySmimeAndOpenPGP.setUnicharAttribute(
    "encryption_cert_name",
    smimeFakeCert
  );
  identitySmimeAndOpenPGP.setUnicharAttribute(
    "signing_cert_name",
    smimeFakeCert
  );

  // Make identitySmimeSign support S/MIME signing.
  identitySmimeSignOnly.setUnicharAttribute("signing_cert_name", smimeFakeCert);

  // Make identitySmimeEncrypt support S/MIME encryption.
  identitySmimeEncryptOnly.setUnicharAttribute(
    "encryption_cert_name",
    smimeFakeCert
  );

  // Make identityEncryption support OpenPGP.
  const [id] = await OpenPGPTestUtils.importPrivateKey(
    null,
    new FileUtils.File(OPENPGP_KEY_PATH)
  );
  identitySmimeAndOpenPGP.setUnicharAttribute("openpgp_key_id", id);

  MailServices.accounts.defaultAccount = account;
});

// Verifies ComposeDetails of a given composer can be applied to a different
// composer, even if they have different compose formats. The composer should pick
// the matching body/plaintextBody value, if both are specified. The value for
// isPlainText is ignored by setComposeDetails.
add_task(async function testIsReflexive() {
  const files = {
    "background.js": async () => {
      // Start a new TEXT message.
      const createdTextWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew({
        plainTextBody: "This is some PLAIN text.",
        isPlainText: true,
      });
      const [createdTextWindow] = await createdTextWindowPromise;
      const [createdTextTab] = await browser.tabs.query({
        windowId: createdTextWindow.id,
      });

      // Get details, TEXT message.
      const textDetails = await browser.compose.getComposeDetails(
        createdTextTab.id
      );
      browser.test.assertTrue(textDetails.isPlainText);
      browser.test.assertTrue(
        textDetails.body.includes("This is some PLAIN text")
      );
      browser.test.assertEq(
        "This is some PLAIN text.",
        textDetails.plainTextBody
      );

      // Start a new HTML message.
      const createdHtmlWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew({
        body: "<p>This is some <i>HTML</i> text.</p>",
        isPlainText: false,
      });
      const [createdHtmlWindow] = await createdHtmlWindowPromise;
      const [createdHtmlTab] = await browser.tabs.query({
        windowId: createdHtmlWindow.id,
      });

      // Get details, HTML message.
      const htmlDetails = await browser.compose.getComposeDetails(
        createdHtmlTab.id
      );
      browser.test.assertFalse(htmlDetails.isPlainText);
      browser.test.assertTrue(
        htmlDetails.body.includes("<p>This is some <i>HTML</i> text.</p>")
      );
      browser.test.assertEq(
        "This is some /HTML/ text.",
        htmlDetails.plainTextBody
      );

      // Set HTML details on HTML composer. It should not throw.
      await browser.compose.setComposeDetails(createdHtmlTab.id, htmlDetails);

      // Set TEXT details on TEXT composer. It should not throw.
      await browser.compose.setComposeDetails(createdTextTab.id, textDetails);

      // Set TEXT details on HTML composer and verify the changed content.
      await browser.compose.setComposeDetails(createdHtmlTab.id, textDetails);
      const htmlDetails2 = await browser.compose.getComposeDetails(
        createdHtmlTab.id
      );
      browser.test.assertFalse(htmlDetails2.isPlainText);
      browser.test.assertTrue(
        htmlDetails2.body.includes("This is some PLAIN text")
      );
      browser.test.assertEq(
        "This is some PLAIN text.",
        htmlDetails2.plainTextBody
      );

      // Set HTML details on TEXT composer and verify the changed content.
      await browser.compose.setComposeDetails(createdTextTab.id, htmlDetails);
      const textDetails2 = await browser.compose.getComposeDetails(
        createdTextTab.id
      );
      browser.test.assertTrue(textDetails2.isPlainText);
      browser.test.assertTrue(
        textDetails2.body.includes("This is some /HTML/ text.")
      );
      browser.test.assertEq(
        "This is some /HTML/ text.",
        textDetails2.plainTextBody
      );

      // Clean up.

      const removedHtmlWindowPromise = window.waitForEvent("windows.onRemoved");
      browser.windows.remove(createdHtmlWindow.id);
      await removedHtmlWindowPromise;

      const removedTextWindowPromise = window.waitForEvent("windows.onRemoved");
      browser.windows.remove(createdTextWindow.id);
      await removedTextWindowPromise;

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "compose"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function testType() {
  const files = {
    "background.js": async () => {
      const accounts = await browser.accounts.list();
      browser.test.assertEq(1, accounts.length, "number of accounts");

      const testFolder = accounts[0].folders.find(f => f.name == "test");
      const messages = (await browser.messages.list(testFolder.id)).messages;
      browser.test.assertEq(4, messages.length, "number of messages");

      const draftFolder = accounts[0].folders.find(f => f.name == "something");
      const drafts = (await browser.messages.list(draftFolder.id)).messages;
      browser.test.assertEq(2, drafts.length, "number of drafts");

      async function checkComposer(tab, expected) {
        browser.test.assertEq("object", typeof tab, "type of tab");
        browser.test.assertEq("number", typeof tab.id, "type of tab ID");
        browser.test.assertEq(
          "number",
          typeof tab.windowId,
          "type of window ID"
        );

        const details = await browser.compose.getComposeDetails(tab.id);
        browser.test.assertEq(expected.type, details.type, "type of composer");
        browser.test.assertEq(
          expected.relatedMessageId,
          details.relatedMessageId,
          `related message id (${details.type})`
        );
        await browser.windows.remove(tab.windowId);
      }

      const tests = [
        {
          funcName: "beginNew",
          args: [],
          expected: { type: "new", relatedMessageId: undefined },
        },
        {
          funcName: "beginReply",
          args: [messages[0].id],
          expected: { type: "reply", relatedMessageId: messages[0].id },
        },
        {
          funcName: "beginReply",
          args: [messages[1].id, "replyToAll"],
          expected: { type: "reply", relatedMessageId: messages[1].id },
        },
        {
          funcName: "beginReply",
          args: [messages[2].id, "replyToList"],
          expected: { type: "reply", relatedMessageId: messages[2].id },
        },
        {
          funcName: "beginReply",
          args: [messages[3].id, "replyToSender"],
          expected: { type: "reply", relatedMessageId: messages[3].id },
        },
        {
          funcName: "beginForward",
          args: [messages[0].id],
          expected: { type: "forward", relatedMessageId: messages[0].id },
        },
        {
          funcName: "beginForward",
          args: [messages[1].id, "forwardAsAttachment"],
          expected: { type: "forward", relatedMessageId: messages[1].id },
        },
        // Uses a different code path.
        {
          funcName: "beginForward",
          args: [messages[2].id, "forwardInline"],
          expected: { type: "forward", relatedMessageId: messages[2].id },
        },
        {
          funcName: "beginNew",
          args: [messages[3].id],
          expected: { type: "new", relatedMessageId: messages[3].id },
        },
      ];
      for (const test of tests) {
        browser.test.log(test.funcName);
        const tab = await browser.compose[test.funcName](...test.args);
        await checkComposer(tab, test.expected);
      }

      browser.tabs.onCreated.addListener(async tab => {
        // Bug 1702957, if composeWindow.GetComposeDetails() is not delayed
        // until the compose window is ready, it will overwrite the compose
        // fields.
        const details = await browser.compose.getComposeDetails(tab.id);
        browser.test.assertEq(
          "Johnny Jones <johnny@jones.invalid>",
          details.to.pop(),
          "Check Recipients in draft after calling getComposeDetails()"
        );

        const window = await browser.windows.get(tab.windowId);
        if (window.type == "messageCompose") {
          await checkComposer(tab, {
            type: "draft",
            relatedMessageId: drafts[0].id,
          });
          browser.test.notifyPass("Finish");
        }
      });
      browser.test.sendMessage("openDrafts");
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

  // The first part of the test is done in the background script using the
  // compose API to open compose windows. For the second part we need to open
  // a draft, which is not possible with the compose API.
  await extension.awaitMessage("openDrafts");
  window.ComposeMessage(
    Ci.nsIMsgCompType.Draft,
    Ci.nsIMsgCompFormat.Default,
    gDraftsFolder,
    [gDraftsFolder.generateMessageURI(gDrafts[0].messageKey)]
  );

  await extension.awaitFinish("Finish");
  await extension.unload();
});

add_task(async function testFcc() {
  const files = {
    "background.js": async () => {
      async function checkWindow(createdTab, expected) {
        const state = await browser.compose.getComposeDetails(createdTab.id);

        browser.test.assertEq(
          expected.overrideDefaultFcc,
          state.overrideDefaultFcc,
          "overrideDefaultFcc should be correct"
        );

        if (expected.overrideDefaultFccFolder) {
          window.assertDeepEqual(
            state.overrideDefaultFccFolder,
            expected.overrideDefaultFccFolder,
            "overrideDefaultFccFolder should be correct"
          );
        } else {
          browser.test.assertEq(
            expected.overrideDefaultFccFolder,
            state.overrideDefaultFccFolder,
            "overrideDefaultFccFolder should be correct"
          );
        }

        if (expected.additionalFccFolder) {
          window.assertDeepEqual(
            state.additionalFccFolder,
            expected.additionalFccFolder,
            "additionalFccFolder should be correct"
          );
        } else {
          browser.test.assertEq(
            expected.additionalFccFolder,
            state.additionalFccFolder,
            "additionalFccFolder should be correct"
          );
        }

        await window.sendMessage("checkNativeWindow", expected);
      }

      const [account] = await browser.accounts.list();
      const folder1 = account.folders.find(f => f.name == "Trash");
      const folder2 = account.folders.find(f => f.name == "something");

      // Start a new message.

      const createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew();
      const [createdWindow] = await createdWindowPromise;
      const [createdTab] = await browser.tabs.query({
        windowId: createdWindow.id,
      });

      await checkWindow(createdTab, {
        overrideDefaultFcc: false,
        overrideDefaultFccFolder: undefined,
        additionalFccFolder: "",
      });

      await browser.test.assertRejects(
        browser.compose.setComposeDetails(createdTab.id, {
          overrideDefaultFcc: true,
        }),
        "Setting overrideDefaultFcc to true requires setting overrideDefaultFccFolder as well",
        "browser.compose.setComposeDetails() should reject setting overrideDefaultFcc to true."
      );

      // Set folders using IDs
      await browser.compose.setComposeDetails(createdTab.id, {
        overrideDefaultFccFolder: folder1.id,
        additionalFccFolder: folder2.id,
      });
      await checkWindow(createdTab, {
        overrideDefaultFcc: true,
        overrideDefaultFccFolder: folder1,
        additionalFccFolder: folder2,
      });

      // Setting overrideDefaultFcc true while it is already true should not change any values.
      await browser.compose.setComposeDetails(createdTab.id, {
        overrideDefaultFcc: true,
      });
      await checkWindow(createdTab, {
        overrideDefaultFcc: true,
        overrideDefaultFccFolder: folder1,
        additionalFccFolder: folder2,
      });

      // A no-op should not change any values. Set folder objects, which is not
      // deprecated here, since a received ComposeDetail object should be usable
      // as-is with compose.setComposeDetails().
      await browser.compose.setComposeDetails(createdTab.id, {});
      await checkWindow(createdTab, {
        overrideDefaultFcc: true,
        overrideDefaultFccFolder: folder1,
        additionalFccFolder: folder2,
      });

      // Disable fcc.
      await browser.compose.setComposeDetails(createdTab.id, {
        overrideDefaultFccFolder: "",
      });
      await checkWindow(createdTab, {
        overrideDefaultFcc: true,
        overrideDefaultFccFolder: "",
        additionalFccFolder: folder2,
      });

      // Disable additional fcc.
      await browser.compose.setComposeDetails(createdTab.id, {
        additionalFccFolder: "",
      });
      await checkWindow(createdTab, {
        overrideDefaultFcc: true,
        overrideDefaultFccFolder: "",
        additionalFccFolder: "",
      });

      // Clear override.
      await browser.compose.setComposeDetails(createdTab.id, {
        overrideDefaultFcc: false,
      });
      await checkWindow(createdTab, {
        overrideDefaultFcc: false,
        overrideDefaultFccFolder: undefined,
        additionalFccFolder: "",
      });

      await browser.test.assertRejects(
        browser.compose.setComposeDetails(createdTab.id, {
          overrideDefaultFccFolder: {
            path: "/bad",
            accountId: folder1.accountId,
          },
        }),
        /Folder not found/,
        "browser.compose.setComposeDetails() should reject, if an invalid folder is set as overrideDefaultFccFolder."
      );

      await browser.test.assertRejects(
        browser.compose.setComposeDetails(createdTab.id, {
          additionalFccFolder: { path: "/bad", accountId: folder1.accountId },
        }),
        /Folder not found/,
        "browser.compose.setComposeDetails() should reject, if an invalid folder is set as additionalFccFolder."
      );

      // Clean up.

      const removedWindowPromise = window.waitForEvent("windows.onRemoved");
      browser.windows.remove(createdWindow.id);
      await removedWindowPromise;

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "compose", "messagesRead"],
    },
  });

  extension.onMessage("checkNativeWindow", async expected => {
    await checkComposeHeaders(expected);
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function test_selectedEncryptionTechnology() {
  const files = {
    "background.js": async () => {
      async function checkWindow(createdTab, expected) {
        const state = await browser.compose.getComposeDetails(createdTab.id);

        browser.test.assertEq(
          expected.identityId,
          state.identityId,
          "identityId should be correct"
        );

        window.assertDeepEqual(
          expected.selectedEncryptionTechnology,
          state.selectedEncryptionTechnology,
          "selectedEncryptionTechnology should be correct",
          { strict: true }
        );

        if (expected.hasOwnProperty.attachPublicPGPKey) {
          window.assertEq(
            expected.attachPublicPGPKey,
            state.attachPublicPGPKey,
            "attachPublicPGPKey should be correct"
          );
        }

        await window.sendMessage(
          "checkNativeWindow",
          state.selectedEncryptionTechnology
        );
      }

      const [account] = await browser.accounts.list();
      const defaultIdentity = await browser.identities.getDefault(account.id);

      const identities = await browser.identities.list(account.id);
      browser.test.assertEq(
        5,
        identities.length,
        "should find the correct numbers of identities for this account"
      );
      const smimeAndOpenPGPIdentity = identities.find(
        i => i.email == "full_enc@invalid"
      );
      browser.test.assertTrue(
        smimeAndOpenPGPIdentity,
        "should find the encryptionIdentity"
      );
      const smimeSignOnlyIdentity = identities.find(
        i => i.email == "smime_sign@invalid"
      );
      browser.test.assertTrue(
        smimeSignOnlyIdentity,
        "should find the smimeSignIdentity"
      );
      const smimeEncryptionOnlyIdentity = identities.find(
        i => i.email == "smime_enc@invalid"
      );
      browser.test.assertTrue(
        smimeEncryptionOnlyIdentity,
        "should find the smimeEncryptIdentity"
      );

      // Start a new message.
      const createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew();
      const [composeWindow] = await createdWindowPromise;
      const [composeTab] = await browser.tabs.query({
        windowId: composeWindow.id,
      });

      // Default identity does not support encryption, should not return anything.
      await checkWindow(composeTab, {
        identityId: defaultIdentity.id,
        attachPublicPGPKey: false,
        selectedEncryptionTechnology: undefined,
      });

      // -----------------------------------------------------------------------

      // Switch identity fully supporting encryption.
      await browser.compose.setComposeDetails(composeTab.id, {
        identityId: smimeAndOpenPGPIdentity.id,
      });

      // The identity supports OpenPGP and S/MIME, we should get OpenPGP as the
      // (default) selected tech, but not enabled.
      await checkWindow(composeTab, {
        identityId: smimeAndOpenPGPIdentity.id,
        attachPublicPGPKey: false,
        selectedEncryptionTechnology: {
          name: "OpenPGP",
          encryptBody: false,
          encryptSubject: false,
          signMessage: false,
        },
      });

      // Updating selectedEncryptionTechnology partially should fail.
      await browser.test.assertThrows(
        () =>
          browser.compose.setComposeDetails(composeTab.id, {
            selectedEncryptionTechnology: {
              name: "OpenPGP",
              encryptBody: true,
            },
          }),
        /Error processing selectedEncryptionTechnology/,
        "browser.compose.setComposeDetails() should reject partially setting selectedEncryptionTechnology."
      );

      // Enable body encryption.
      await browser.compose.setComposeDetails(composeTab.id, {
        attachPublicPGPKey: true,
        selectedEncryptionTechnology: {
          name: "OpenPGP",
          encryptBody: true,
          encryptSubject: false,
          signMessage: false,
        },
      });
      await checkWindow(composeTab, {
        identityId: smimeAndOpenPGPIdentity.id,
        attachPublicPGPKey: true,
        selectedEncryptionTechnology: {
          name: "OpenPGP",
          encryptBody: true,
          encryptSubject: false,
          signMessage: false,
        },
      });

      // Enable body+subject encryption.
      await browser.compose.setComposeDetails(composeTab.id, {
        selectedEncryptionTechnology: {
          name: "OpenPGP",
          encryptBody: true,
          encryptSubject: true,
          signMessage: false,
        },
      });
      await checkWindow(composeTab, {
        identityId: smimeAndOpenPGPIdentity.id,
        attachPublicPGPKey: true,
        selectedEncryptionTechnology: {
          name: "OpenPGP",
          encryptBody: true,
          encryptSubject: true,
          signMessage: false,
        },
      });

      // Switch off encryption and only sign.
      await browser.compose.setComposeDetails(composeTab.id, {
        selectedEncryptionTechnology: {
          name: "OpenPGP",
          encryptBody: false,
          encryptSubject: false,
          signMessage: true,
        },
      });
      await checkWindow(composeTab, {
        identityId: smimeAndOpenPGPIdentity.id,
        attachPublicPGPKey: true,
        selectedEncryptionTechnology: {
          name: "OpenPGP",
          encryptBody: false,
          encryptSubject: false,
          signMessage: true,
        },
      });

      // Enable everything.
      await browser.compose.setComposeDetails(composeTab.id, {
        selectedEncryptionTechnology: {
          name: "OpenPGP",
          encryptBody: true,
          encryptSubject: true,
          signMessage: true,
        },
      });
      await checkWindow(composeTab, {
        identityId: smimeAndOpenPGPIdentity.id,
        attachPublicPGPKey: true,
        selectedEncryptionTechnology: {
          name: "OpenPGP",
          encryptBody: true,
          encryptSubject: true,
          signMessage: true,
        },
      });

      // -----------------------------------------------------------------------

      // Switch to S/MIME and enable signing only.
      await browser.compose.setComposeDetails(composeTab.id, {
        selectedEncryptionTechnology: {
          name: "S/MIME",
          encryptBody: false,
          signMessage: true,
        },
      });

      await checkWindow(composeTab, {
        identityId: smimeAndOpenPGPIdentity.id,
        attachPublicPGPKey: true, // Independent of selected technology.
        selectedEncryptionTechnology: {
          name: "S/MIME",
          encryptBody: false,
          signMessage: true,
        },
      });

      // Trying to enable subject encryption for S/MIME should fail.
      await browser.test.assertThrows(
        () =>
          browser.compose.setComposeDetails(composeTab.id, {
            selectedEncryptionTechnology: {
              name: "S/MIME",
              encryptBody: true,
              encryptSubject: true,
              signMessage: true,
            },
          }),
        /Error processing selectedEncryptionTechnology/,
        "browser.compose.setComposeDetails() should fail to enable subject encryption for S/MIME."
      );

      // -----------------------------------------------------------------------

      // Switch back to PGP with encryption fully enabled, but no longer attach
      // the public PGPKey.
      await browser.compose.setComposeDetails(composeTab.id, {
        attachPublicPGPKey: false,
        selectedEncryptionTechnology: {
          name: "OpenPGP",
          encryptBody: true,
          encryptSubject: true,
          signMessage: true,
        },
      });
      await checkWindow(composeTab, {
        identityId: smimeAndOpenPGPIdentity.id,
        attachPublicPGPKey: false,
        selectedEncryptionTechnology: {
          name: "OpenPGP",
          encryptBody: true,
          encryptSubject: true,
          signMessage: true,
        },
      });

      // Switch to the S/MIME sign-only identity, not touching encryption settings.
      await browser.compose.setComposeDetails(composeTab.id, {
        identityId: smimeSignOnlyIdentity.id,
      });
      // It is a desired feature of the composer to NOT disable enabled encryption
      // when switching identities, but instead show error banners. The API will
      // therefore return an "invalid" state (but that *is* the current config).
      await checkWindow(composeTab, {
        identityId: smimeSignOnlyIdentity.id,
        selectedEncryptionTechnology: {
          name: "S/MIME",
          encryptBody: true, // invalid but actually set
          signMessage: true,
        },
      });

      // Switch off all features.
      browser.compose.setComposeDetails(composeTab.id, {
        selectedEncryptionTechnology: {
          name: "S/MIME",
          encryptBody: false,
          signMessage: false,
        },
      });

      await checkWindow(composeTab, {
        identityId: smimeSignOnlyIdentity.id,
        selectedEncryptionTechnology: {
          name: "S/MIME",
          encryptBody: false,
          signMessage: false,
        },
      });

      // Since the identity does not have a cert for encryption set up, enabling
      // it should fail.
      await browser.test.assertRejects(
        browser.compose.setComposeDetails(composeTab.id, {
          selectedEncryptionTechnology: {
            name: "S/MIME",
            encryptBody: true,
            signMessage: true,
          },
        }),
        /The current identity does not support encryption/,
        "browser.compose.setComposeDetails() should fail to enable encryption if the identity does not have a cert for encryption."
      );

      // Check nothing changed.
      await checkWindow(composeTab, {
        identityId: smimeSignOnlyIdentity.id,
        selectedEncryptionTechnology: {
          name: "S/MIME",
          encryptBody: false,
          signMessage: false,
        },
      });

      // -----------------------------------------------------------------------

      // Switch to the identity fully supporting S/MINE and enable everything.
      await browser.compose.setComposeDetails(composeTab.id, {
        identityId: smimeAndOpenPGPIdentity.id,
        selectedEncryptionTechnology: {
          name: "S/MIME",
          encryptBody: true,
          signMessage: true,
        },
      });

      // Switch to the S/MIME encryption-only identity, not touching encryption
      // settings.
      await browser.compose.setComposeDetails(composeTab.id, {
        identityId: smimeEncryptionOnlyIdentity.id,
      });

      await checkWindow(composeTab, {
        identityId: smimeEncryptionOnlyIdentity.id,
        selectedEncryptionTechnology: {
          name: "S/MIME",
          encryptBody: true,
          signMessage: false,
        },
      });

      // Since the identity does not have a cert for signing set up, enabling
      // it should fail.
      await browser.test.assertRejects(
        browser.compose.setComposeDetails(composeTab.id, {
          selectedEncryptionTechnology: {
            name: "S/MIME",
            encryptBody: true,
            signMessage: true,
          },
        }),
        /The current identity does not support signing/,
        "browser.compose.setComposeDetails() should fail to enable signng if the identity does not have a cert for signing."
      );

      // Check nothing changed.
      await checkWindow(composeTab, {
        identityId: smimeEncryptionOnlyIdentity.id,
        selectedEncryptionTechnology: {
          name: "S/MIME",
          encryptBody: true,
          signMessage: false,
        },
      });

      // -----------------------------------------------------------------------

      // Switch identity back to default.
      await browser.compose.setComposeDetails(composeTab.id, {
        identityId: defaultIdentity.id,
      });

      // It is a desired feature of the composer to NOT disable enabled encryption
      // when switching identities, but instead show error banners. The API will
      // therefore return an "invalid" state (but that *is* the current config).
      await checkWindow(composeTab, {
        identityId: defaultIdentity.id,
        selectedEncryptionTechnology: {
          name: "S/MIME",
          encryptBody: true, // invalid but actually set
          signMessage: false,
        },
      });

      // Clean up.
      const removedWindowPromise = window.waitForEvent("windows.onRemoved");
      browser.windows.remove(composeWindow.id);
      await removedWindowPromise;

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      manifest_version: 2,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "compose", "messagesRead"],
    },
  });

  extension.onMessage("checkNativeWindow", async expected => {
    const composeWindow = Services.wm.getMostRecentWindow("msgcompose");

    if (expected) {
      Assert.equal(
        expected.encryptBody,
        composeWindow.gSendEncrypted,
        "gSendEncrypted should be as expected"
      );
      if (expected.name == "OpenPGP") {
        Assert.equal(
          expected.encryptSubject,
          composeWindow.gEncryptSubject,
          "gEncryptSubject should be as expected"
        );
      }
      Assert.equal(
        expected.signMessage,
        composeWindow.gSendSigned,
        "gSendSigned should be as expected"
      );

      Assert.equal(
        expected.name == "OpenPGP",
        composeWindow.gSelectedTechnologyIsPGP,
        "gSelectedTechnologyIsPGP should be as expected"
      );
    }
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function testSimpleDetails() {
  const files = {
    "background.js": async () => {
      async function checkWindow(createdTab, expected) {
        const state = await browser.compose.getComposeDetails(createdTab.id);

        if (expected.priority) {
          browser.test.assertEq(
            expected.priority,
            state.priority,
            "priority should be correct"
          );
        }

        if (expected.hasOwnProperty("returnReceipt")) {
          browser.test.assertEq(
            expected.returnReceipt,
            state.returnReceipt,
            "returnReceipt should be correct"
          );
        }

        if (expected.hasOwnProperty("deliveryStatusNotification")) {
          browser.test.assertEq(
            expected.deliveryStatusNotification,
            state.deliveryStatusNotification,
            "deliveryStatusNotification should be correct"
          );
        }

        if (expected.hasOwnProperty("attachVCard")) {
          browser.test.assertEq(
            expected.attachVCard,
            state.attachVCard,
            "attachVCard should be correct"
          );
        }

        if (expected.deliveryFormat) {
          browser.test.assertEq(
            expected.deliveryFormat,
            state.deliveryFormat,
            "deliveryFormat should be correct"
          );
        }

        await window.sendMessage("checkNativeWindow", expected);
      }

      // Start a new message.

      const createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew();
      const [createdWindow] = await createdWindowPromise;
      const [createdTab] = await browser.tabs.query({
        windowId: createdWindow.id,
      });

      const accounts = await browser.accounts.list();
      browser.test.assertEq(1, accounts.length, "number of accounts");
      const localAccount = accounts.find(a => a.type == "pop3");
      browser.test.assertEq(
        5,
        localAccount.identities.length,
        "number of identities"
      );
      const [defaultIdentity, nonDefaultIdentity] = localAccount.identities;

      const expected = {
        priority: "normal",
        returnReceipt: false,
        deliveryStatusNotification: false,
        deliveryFormat: "auto",
        attachVCard: false,
        identityId: defaultIdentity.id,
      };

      async function changeDetail(key, value, _expected = {}) {
        await browser.compose.setComposeDetails(createdTab.id, {
          [key]: value,
        });
        expected[key] = value;
        for (const [k, v] of Object.entries(_expected)) {
          expected[k] = v;
        }
        await checkWindow(createdTab, expected);
      }

      // Confirm initial condition.
      await checkWindow(createdTab, expected);

      // Changing the identity without having made any changes, should load the
      // defaults of the second identity.
      await changeDetail("identityId", nonDefaultIdentity.id, {
        attachVCard: true,
      });

      // Switching back should restore the defaults of the first identity.
      await changeDetail("identityId", defaultIdentity.id, {
        attachVCard: false,
      });

      await changeDetail("priority", "highest");
      await changeDetail("deliveryFormat", "html");
      await changeDetail("returnReceipt", true);
      await changeDetail("deliveryFormat", "plaintext");
      await changeDetail("priority", "lowest");
      await changeDetail("attachVCard", true);
      await changeDetail("priority", "high");
      await changeDetail("deliveryFormat", "both");
      await changeDetail("deliveryStatusNotification", true);
      await changeDetail("priority", "low");

      await changeDetail("priority", "normal");
      await changeDetail("deliveryFormat", "auto");
      await changeDetail("attachVCard", false);
      await changeDetail("returnReceipt", false);
      await changeDetail("deliveryStatusNotification", false);

      // Changing the identity should not load the defaults of the second identity,
      // after the values had been changed.
      await changeDetail("identityId", nonDefaultIdentity.id);

      // Clean up.

      const removedWindowPromise = window.waitForEvent("windows.onRemoved");
      browser.windows.remove(createdWindow.id);
      await removedWindowPromise;

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "compose", "messagesRead"],
    },
  });

  extension.onMessage("checkNativeWindow", async expected => {
    await checkComposeHeaders(expected);
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function testAutoComplete() {
  const files = {
    "background.js": async () => {
      async function checkWindow(createdTab, expected) {
        const state = await browser.compose.getComposeDetails(createdTab.id);

        for (const [id, value] of Object.entries(expected.pills)) {
          browser.test.assertEq(
            value,
            state[id].length ? state[id][0] : "",
            `value for ${id} should be correct`
          );
        }

        await window.sendMessage("checkNativeWindow", expected);
      }

      // Start a new message.
      const createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew();
      const [createdWindow] = await createdWindowPromise;
      const [createdTab] = await browser.tabs.query({
        windowId: createdWindow.id,
      });

      // Create a test contact.
      const [addressBook] = await browser.addressBooks.list(true);
      const contactId = await browser.contacts.create(addressBook.id, {
        PrimaryEmail: "autocomplete@invalid",
        DisplayName: "Autocomplete Test",
      });

      // Confirm the addrTo field has focus and addrTo and replyTo fields are empty.
      await checkWindow(createdTab, {
        activeElement: "toAddrInput",
        pills: { to: "", replyTo: "" },
        values: { toAddrInput: "", replyAddrInput: "" },
      });

      // Set the replyTo field, which should not break autocomplete for the currently active addrTo
      // field.
      await browser.compose.setComposeDetails(createdTab.id, {
        replyTo: "test@user.net",
      });

      // Confirm the addrTo field has focus and replyTo field is set.
      await checkWindow(createdTab, {
        activeElement: "toAddrInput",
        pills: { to: "", replyTo: "test@user.net" },
        values: { toAddrInput: "", replyAddrInput: "" },
      });

      // Manually type "Autocomplete" into the active field, which should be the toAddr field and it
      // should autocomplete.
      await window.sendMessage("typeIntoActiveAddrField", "Autocomplete");

      // Confirm the addrTo field has focus and replyTo field is set and the addrTo field has been
      // autocompleted.
      await checkWindow(createdTab, {
        activeElement: "toAddrInput",
        pills: { to: "", replyTo: "test@user.net" },
        values: {
          toAddrInput: "Autocomplete Test <autocomplete@invalid>",
          replyAddrInput: "",
        },
      });

      // Clean up.
      await browser.contacts.delete(contactId);
      const removedWindowPromise = window.waitForEvent("windows.onRemoved");
      browser.windows.remove(createdWindow.id);
      await removedWindowPromise;

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "compose", "addressBooks"],
    },
  });

  extension.onMessage("typeIntoActiveAddrField", async value => {
    const composeWindows = [...Services.wm.getEnumerator("msgcompose")];
    is(composeWindows.length, 1);

    for (const s of value) {
      EventUtils.synthesizeKey(s, {}, composeWindows[0]);
      await new Promise(r => composeWindows[0].setTimeout(r));
    }

    extension.sendMessage();
  });

  extension.onMessage("checkNativeWindow", async expected => {
    const composeWindows = [...Services.wm.getEnumerator("msgcompose")];
    is(composeWindows.length, 1);
    const composeDocument = composeWindows[0].document;
    await new Promise(resolve => composeWindows[0].setTimeout(resolve));

    Assert.equal(
      composeDocument.activeElement.id,
      expected.activeElement,
      `Active element should be correct`
    );

    for (const [id, value] of Object.entries(expected.values)) {
      await TestUtils.waitForCondition(
        () => composeDocument.getElementById(id).value == value,
        `Value of field ${id} should be correct`
      );
    }

    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
