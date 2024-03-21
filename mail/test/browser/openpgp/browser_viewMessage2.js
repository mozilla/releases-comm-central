/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the display of OpenPGP signed/encrypted state in opened messages,
 * when OpenPGP passphrases are in use.
 */

"use strict";

const { get_about_message, open_message_from_file } =
  ChromeUtils.importESModule(
    "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
  );

const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/OpenPGPTestUtils.sys.mjs"
);
const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

const MSG_TEXT = "Sundays are nothing without callaloo.";

function getMsgBodyTxt(msgc) {
  const msgPane = get_about_message(msgc).getMessagePaneBrowser();
  return msgPane.contentDocument.documentElement.textContent;
}

var aliceAcct;

/**
 * Set up the base account, identity and keys needed for the tests.
 */
add_setup(async function () {
  aliceAcct = MailServices.accounts.createAccount();
  aliceAcct.incomingServer = MailServices.accounts.createIncomingServer(
    "alice",
    "openpgp.example",
    "pop3"
  );
  const aliceIdentity = MailServices.accounts.createIdentity();
  aliceIdentity.email = "alice@openpgp.example";
  aliceAcct.addIdentity(aliceIdentity);

  // Set up the alice's private key, which has a passphrase set
  const [id] = await OpenPGPTestUtils.importPrivateKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "data/keys/alice@openpgp.example-0xf231550c4f47e38e-secret-with-pp.asc"
      )
    ),
    OpenPGPTestUtils.ACCEPTANCE_PERSONAL,
    "alice-passphrase",
    true
  );

  aliceIdentity.setUnicharAttribute("openpgp_key_id", id);

  // Import and accept the public key for Bob, our verified sender.
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
 * Test that opening an unsigned encrypted message shows as such.
 */
add_task(async function testOpenVerifiedUnsignedEncrypted2() {
  const passPromptPromise = BrowserTestUtils.promiseAlertDialogOpen();

  const openMessagePromise = open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/unsigned-encrypted-to-0xf231550c4f47e38e-from-0xfbfcc82a015e7330.eml"
      )
    )
  );

  const ppWin = await passPromptPromise;

  // We'll enter a wrong pp, so we expect another prompt
  const passPromptPromise2 = BrowserTestUtils.promiseAlertDialogOpen();

  ppWin.document.getElementById("password1Textbox").value = "WRONG-passphrase";
  ppWin.document.querySelector("dialog").getButton("accept").click();

  const ppWin2 = await passPromptPromise2;

  ppWin2.document.getElementById("password1Textbox").value = "alice-passphrase";
  ppWin2.document.querySelector("dialog").getButton("accept").click();

  const msgc = await openMessagePromise;

  const aboutMessage = get_about_message(msgc);

  Assert.ok(getMsgBodyTxt(msgc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(aboutMessage.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is displayed"
  );
  await BrowserTestUtils.closeWindow(msgc);
});

registerCleanupFunction(async function tearDown() {
  MailServices.accounts.removeAccount(aliceAcct, true);
  await OpenPGPTestUtils.removeKeyById("0xf231550c4f47e38e", true);
});
