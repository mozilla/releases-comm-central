/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Ensure OpenPGP messages that contain a multipart/signed part render
 * correctly, no matter at which position in the MIME tree the signed part
 * is found. The handler is picked from the protocol parameter of the part,
 * so this must work on the first stream, without a reload.
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
 * Open a PGP/MIME encrypted (inner signed) message and assert it decrypts
 * and renders.
 */
add_task(async function test_pgp_encrypted_inner_signed_renders() {
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/signed-by-0xfbfcc82a015e7330-encrypted-to-0xf231550c4f47e38e.eml"
      )
    )
  );
  const aboutMessage = get_about_message(msgc);

  await TestUtils.waitForCondition(
    () => getMsgBodyTxt(msgc).includes(MSG_TEXT),
    "decrypted body of the PGP/MIME message should be shown"
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

/**
 * A PGP/MIME signed part nested inside a multipart/mixed message, as
 * produced by mailing list software that appends a footer, must be rendered,
 * too.
 */
add_task(async function test_pgp_signed_in_mixed_renders() {
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/signed-by-0xfbfcc82a015e7330-to-0xf231550c4f47e38e-unencrypted-in-mixed.eml"
      )
    )
  );

  await TestUtils.waitForCondition(
    () => getMsgBodyTxt(msgc).includes(MSG_TEXT),
    "body of the signed part should be shown"
  );
  Assert.ok(
    getMsgBodyTxt(msgc).includes("test-list mailing list"),
    "the unsigned mailing list footer should be shown"
  );

  await BrowserTestUtils.closeWindow(msgc);
});
