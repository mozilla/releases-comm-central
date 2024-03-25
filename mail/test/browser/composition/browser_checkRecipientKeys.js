/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { promise_new_window } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);
var { close_compose_window, compose_window_ready } = ChromeUtils.importESModule(
  "resource://testing-common/mail/ComposeHelpers.sys.mjs"
);
var { be_in_folder } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mail/OpenPGPTestUtils.sys.mjs"
);

add_setup(() => {
  Services.prefs.setBoolPref("mail.smime.remind_encryption_possible", true);
  Services.prefs.setBoolPref("mail.openpgp.remind_encryption_possible", true);
});

registerCleanupFunction(() => {
  Services.prefs.clearUserPref("mail.smime.remind_encryption_possible");
  Services.prefs.clearUserPref("mail.openpgp.remind_encryption_possible");
});

/**
 * Test that checkEncryptionState should not affect gMsgCompose.compFields.
 */
add_task(async function test_checkEncryptionState() {
  const [id] = await OpenPGPTestUtils.importPrivateKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "../openpgp/data/keys/bob@openpgp.example-0xfbfcc82a015e7330-secret.asc"
      )
    )
  );

  // Set up the identity to cover the remindOpenPGP/remindSMime branches in
  // checkEncryptionState.
  const identity = MailServices.accounts.createIdentity();
  identity.email = "test@local";
  identity.setUnicharAttribute("encryption_cert_name", "smime-cert");
  identity.setUnicharAttribute("openpgp_key_id", id.split("0x").join(""));
  const account = MailServices.accounts.createAccount();
  account.addIdentity(identity);
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "test",
    "openpgp.example",
    "imap"
  );
  await be_in_folder(account.incomingServer.rootFolder);
  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, true);
  });

  // Set up the compose fields used to init the compose window.
  const fields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  fields.to = "to@local";
  fields.cc = "cc1@local,cc2@local";
  fields.bcc = "bcc1@local,bcc2@local";
  const params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  params.identity = identity;
  params.composeFields = fields;

  // Open a compose window.
  const composePromise = promise_new_window("msgcompose");
  MailServices.compose.OpenComposeWindowWithParams(null, params);
  const cwc = await compose_window_ready(composePromise);

  // Test gMsgCompose.compFields is intact.
  const compFields = cwc.gMsgCompose.compFields;
  Assert.equal(compFields.to, "to@local");
  Assert.equal(compFields.cc, "cc1@local, cc2@local");
  Assert.equal(compFields.bcc, "bcc1@local, bcc2@local");

  await close_compose_window(cwc);
});
