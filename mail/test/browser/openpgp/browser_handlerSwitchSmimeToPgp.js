/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Ensure an OpenPGP message with outer encryption and inner signature
 * renders correctly, if the S/MIME handler is the currently active
 * handler for multipart/signed.
 */

"use strict";

const { get_about_message, open_message_from_file } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
  );
const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mail/OpenPGPTestUtils.sys.mjs"
);
const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
const { MailConsts } = ChromeUtils.importESModule(
  "resource:///modules/MailConsts.sys.mjs"
);
const { EnigmailVerify } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/mimeVerify.sys.mjs"
);
const { EnigmailConstants } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/constants.sys.mjs"
);

const MSG_TEXT = "Sundays are nothing without callaloo.";

function getMsgBodyTxt(msgc) {
  const msgPane = get_about_message(msgc).getMessagePaneBrowser();
  return msgPane.contentDocument.documentElement.textContent;
}

let aliceAcct;

add_setup(async function () {
  // This test assumes the standalone message window.
  Services.prefs.setIntPref(
    "mail.openMessageBehavior",
    MailConsts.OpenMessageBehavior.NEW_WINDOW
  );
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("mail.openMessageBehavior");
    MailServices.accounts.removeAccount(aliceAcct, true);
  });

  aliceAcct = MailServices.accounts.createAccount();
  aliceAcct.incomingServer = MailServices.accounts.createIncomingServer(
    "alice",
    "openpgp.example",
    "pop3"
  );
  const aliceIdentity = MailServices.accounts.createIdentity();
  aliceIdentity.email = "alice@openpgp.example";
  aliceAcct.addIdentity(aliceIdentity);

  // Alice's private key, so we can decrypt the message.
  const [id] = await OpenPGPTestUtils.importPrivateKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "data/keys/alice@openpgp.example-0xf231550c4f47e38e-secret.asc"
      )
    )
  );
  aliceIdentity.setUnicharAttribute("openpgp_key_id", id.split("0x").join(""));

  // Bob's public key, our verified sender.
  await OpenPGPTestUtils.importPublicKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "data/keys/bob@openpgp.example-0xfbfcc82a015e7330-pub.asc"
      )
    )
  );
});

/**
 * With the S/MIME handler active (PGP/MIME handler unregistered), open a
 * PGP/MIME encrypted (inner signed) message and assert it decrypts and
 * renders, having switched the handler back to PGP/MIME.
 */
add_task(async function test_pgp_encrypted_renders_from_smime_handler() {
  EnigmailVerify.unregisterPGPMimeHandler();
  Assert.equal(
    EnigmailVerify.currentCtHandler,
    EnigmailConstants.MIME_HANDLER_SMIME,
    "S/MIME should be the active handler before opening the message"
  );

  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/signed-by-0xfbfcc82a015e7330-encrypted-to-0xf231550c4f47e38e.eml"
      )
    )
  );
  const aboutMessage = get_about_message(msgc);

  // Switching the handler triggers a reload, so wait for the decrypted body
  // rather than asserting immediately.
  await TestUtils.waitForCondition(
    () => getMsgBodyTxt(msgc).includes(MSG_TEXT),
    "decrypted body of the PGP/MIME message should be shown"
  );

  Assert.equal(
    EnigmailVerify.currentCtHandler,
    EnigmailConstants.MIME_HANDLER_PGPMIME,
    "handler should have switched back to PGP/MIME to render the message"
  );
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "verified"),
    "signed icon should be shown for status verified"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon should be shown"
  );

  await BrowserTestUtils.closeWindow(msgc);
});
