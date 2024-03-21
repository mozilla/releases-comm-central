/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for permanent decryption of email.
 */

"use strict";

const {
  be_in_folder,
  get_about_3pane,
  get_about_message,
  get_special_folder,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);
const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/OpenPGPTestUtils.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
const { EnigmailPersistentCrypto } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/persistentCrypto.sys.mjs"
);

const MSG_TEXT = "Sundays are nothing without callaloo.";

function getMsgBodyTxt() {
  const msgPane = get_about_message(window).getMessagePaneBrowser();
  return msgPane.contentDocument.documentElement.textContent;
}

var aliceAcct;
var aliceIdentity;
var initialKeyIdPref = "";
var gInbox;

var gDecFolder;

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
  aliceIdentity = MailServices.accounts.createIdentity();
  aliceIdentity.email = "alice@openpgp.example";
  aliceAcct.addIdentity(aliceIdentity);

  aliceAcct.incomingServer.rootFolder.createSubfolder("decrypted", null);

  gDecFolder = aliceAcct.incomingServer.rootFolder.getChildNamed("decrypted");

  // Set up the alice's private key.
  const [id] = await OpenPGPTestUtils.importPrivateKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "data/keys/alice@openpgp.example-0xf231550c4f47e38e-secret.asc"
      )
    )
  );

  initialKeyIdPref = aliceIdentity.getUnicharAttribute("openpgp_key_id");
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

  gInbox = await get_special_folder(Ci.nsMsgFolderFlags.Inbox, true);
  await be_in_folder(gInbox);
});

add_task(async function testPermanentDecrypt() {
  // Fetch a local OpenPGP message.
  const openPgpFile = new FileUtils.File(
    getTestFilePath(
      "data/eml/signed-by-0xfbfcc82a015e7330-encrypted-to-0xf231550c4f47e38e.eml"
    )
  );

  // Add the fetched OpenPGP message to the inbox folder.
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFileMessage(
    openPgpFile,
    gInbox,
    null,
    false,
    0,
    "",
    copyListener,
    null
  );
  await copyListener.promise;

  // Select the first row.
  await select_click_row(0);

  const aboutMessage = get_about_message();
  Assert.equal(
    aboutMessage.document
      .getElementById("encryptionTechBtn")
      .querySelector("span").textContent,
    "OpenPGP"
  );

  Assert.ok(getMsgBodyTxt().includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is displayed"
  );

  // Get header of selected message
  const hdr = get_about_3pane().gDBView.hdrForFirstSelectedMessage;

  await EnigmailPersistentCrypto.cryptMessage(hdr, gDecFolder.URI, false, null);

  await OpenPGPTestUtils.removeKeyById("0xf231550c4f47e38e", true);

  await be_in_folder(gDecFolder);

  await select_click_row(0);
  Assert.ok(getMsgBodyTxt().includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon NOT displayed"
  );
});

registerCleanupFunction(function () {
  // Reset the OpenPGP key and delete the account.
  aliceIdentity.setUnicharAttribute("openpgp_key_id", initialKeyIdPref);
  MailServices.accounts.removeIncomingServer(aliceAcct.incomingServer, false);
  MailServices.accounts.removeAccount(aliceAcct);
  aliceAcct = null;
});
