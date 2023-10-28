/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for OpenPGP signed message composition,
 * when OpenPGP passphrases are in use.
 */

"use strict";

const {
  assert_selected_and_displayed,
  be_in_folder,
  get_about_message,
  get_special_folder,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
const { open_compose_new_mail, setup_msg_contents } = ChromeUtils.import(
  "resource://testing-common/mozmill/ComposeHelpers.jsm"
);
const { OpenPGPTestUtils } = ChromeUtils.import(
  "resource://testing-common/mozmill/OpenPGPTestUtils.jsm"
);

const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

let bobAcct;
let gOutbox;
let kylieAcct;

const aboutMessage = get_about_message();

/**
 * Setup a mail account with a private key and import the public key for the
 * receiver.
 */
add_setup(async function () {
  bobAcct = MailServices.accounts.createAccount();
  bobAcct.incomingServer = MailServices.accounts.createIncomingServer(
    "bob",
    "openpgp.example",
    "imap"
  );
  const bobIdentity = MailServices.accounts.createIdentity();
  bobIdentity.email = "bob@openpgp.example";
  bobAcct.addIdentity(bobIdentity);

  const [id] = await OpenPGPTestUtils.importPrivateKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "../data/keys/bob@openpgp.example-0xfbfcc82a015e7330-secret-with-pp.asc"
      )
    ),
    OpenPGPTestUtils.ACCEPTANCE_PERSONAL,
    "bob-passphrase",
    true
  );

  Assert.ok(id, "private key id received");

  const initialKeyIdPref = bobIdentity.getUnicharAttribute("openpgp_key_id");
  bobIdentity.setUnicharAttribute("openpgp_key_id", id.split("0x").join(""));

  await OpenPGPTestUtils.importPublicKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "../data/keys/alice@openpgp.example-0xf231550c4f47e38e-pub.asc"
      )
    )
  );

  gOutbox = await get_special_folder(Ci.nsMsgFolderFlags.Queue);

  kylieAcct = MailServices.accounts.createAccount();
  kylieAcct.incomingServer = MailServices.accounts.createIncomingServer(
    "kylie",
    "example.com",
    "imap"
  );
  const kylieIdentity = MailServices.accounts.createIdentity();
  kylieIdentity.email = "kylie@example.com";
  kylieAcct.addIdentity(kylieIdentity);

  const [id2] = await OpenPGPTestUtils.importPrivateKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "../data/keys/kylie-0x1AABD9FAD1E411DD-secret-subkeys.asc"
      )
    ),
    OpenPGPTestUtils.ACCEPTANCE_PERSONAL,
    "kylie-passphrase",
    false
  );

  Assert.ok(id2, "private key id received");
  kylieIdentity.setUnicharAttribute("openpgp_key_id", id2.split("0x").join(""));

  registerCleanupFunction(async function tearDown() {
    bobIdentity.setUnicharAttribute("openpgp_key_id", initialKeyIdPref);
    await OpenPGPTestUtils.removeKeyById("0xfbfcc82a015e7330", true);
    MailServices.accounts.removeIncomingServer(bobAcct.incomingServer, true);
    MailServices.accounts.removeAccount(bobAcct, true);
    await OpenPGPTestUtils.removeKeyById("0x1AABD9FAD1E411DD", true);
    MailServices.accounts.removeIncomingServer(kylieAcct.incomingServer, true);
    MailServices.accounts.removeAccount(kylieAcct, true);
  });
});

/**
 * Tests composition of a signed message is shown as signed in the Outbox.
 */
add_task(async function testSignedMessageComposition2() {
  await be_in_folder(bobAcct.incomingServer.rootFolder);

  const cwc = await open_compose_new_mail();
  const composeWin = cwc;

  await setup_msg_contents(
    cwc,
    "alice@openpgp.example",
    "Compose Signed Message",
    "This is a signed message composition test."
  );

  await OpenPGPTestUtils.toggleMessageSigning(composeWin);
  await OpenPGPTestUtils.toggleMessageKeyAttachment(composeWin);

  const passPromptPromise = BrowserTestUtils.promiseAlertDialogOpen();
  const sendMessageCompletePromise = sendMessage(composeWin);

  const ppWin = await passPromptPromise;

  // We'll enter a wrong pp, so we expect another prompt
  const passPromptPromise2 = BrowserTestUtils.promiseAlertDialogOpen();

  ppWin.document.getElementById("password1Textbox").value = "WRONG-passphrase";
  ppWin.document.querySelector("dialog").getButton("accept").click();

  const ppWin2 = await passPromptPromise2;

  ppWin2.document.getElementById("password1Textbox").value = "bob-passphrase";
  ppWin2.document.querySelector("dialog").getButton("accept").click();

  await sendMessageCompletePromise;

  await be_in_folder(gOutbox);
  await select_click_row(0);
  await assert_selected_and_displayed(0);

  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "ok"),
    "message should have signed icon"
  );

  Assert.equal(
    aboutMessage.document.querySelector("#attachmentList").itemChildren.length,
    0,
    "there should be no keys attached to message"
  );

  // Delete the message so other tests work.
  EventUtils.synthesizeKey("VK_DELETE");
});

/**
 * Tests composition of a signed message is shown as signed in the Outbox,
 * with a key that has an offline primary key. Ensure the subkeys were
 * imported correctly and are no longer protected by a passphrase
 * (ensure import remove the passphrase protection and switched them
 * to use automatic protection).
 */
add_task(async function testSignedMessageComposition3() {
  await be_in_folder(kylieAcct.incomingServer.rootFolder);

  const cwc = await open_compose_new_mail();
  const composeWin = cwc.window;

  await setup_msg_contents(
    cwc,
    "alice@openpgp.example",
    "Compose Signed Message",
    "This is a signed message composition test."
  );

  await OpenPGPTestUtils.toggleMessageSigning(composeWin);
  await OpenPGPTestUtils.toggleMessageKeyAttachment(composeWin);
  await sendMessage(composeWin);

  await be_in_folder(gOutbox);
  await select_click_row(0);
  await assert_selected_and_displayed(0);

  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "ok"),
    "message should have signed icon"
  );

  Assert.equal(
    aboutMessage.document.querySelector("#attachmentList").itemChildren.length,
    0,
    "there should be no keys attached to message"
  );

  // Delete the message so other tests work.
  EventUtils.synthesizeKey("VK_DELETE");
});
