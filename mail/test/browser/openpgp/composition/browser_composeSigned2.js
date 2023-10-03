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
let bobIdentity;
let initialKeyIdPref = "";
let gOutbox;

let aboutMessage = get_about_message();

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
  bobIdentity = MailServices.accounts.createIdentity();
  bobIdentity.email = "bob@openpgp.example";
  bobAcct.addIdentity(bobIdentity);

  let [id] = await OpenPGPTestUtils.importPrivateKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "../data/keys/bob@openpgp.example-0xfbfcc82a015e7330-secret-with-pp.asc"
      )
    ),
    OpenPGPTestUtils.ACCEPTANCE_PERSONAL,
    "bob-passphrase"
  );

  Assert.ok(id, "private key id received");

  initialKeyIdPref = bobIdentity.getUnicharAttribute("openpgp_key_id");
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
});

/**
 * Tests composition of a signed message is shown as signed in the Outbox.
 */
add_task(async function testSignedMessageComposition2() {
  await be_in_folder(bobAcct.incomingServer.rootFolder);

  let cwc = await open_compose_new_mail();
  let composeWin = cwc;

  setup_msg_contents(
    cwc,
    "alice@openpgp.example",
    "Compose Signed Message",
    "This is a signed message composition test."
  );

  await OpenPGPTestUtils.toggleMessageSigning(composeWin);
  await OpenPGPTestUtils.toggleMessageKeyAttachment(composeWin);

  let passPromptPromise = BrowserTestUtils.promiseAlertDialogOpen();
  let sendMessageCompletePromise = sendMessage(composeWin);

  let ppWin = await passPromptPromise;

  // We'll enter a wrong pp, so we expect another prompt
  let passPromptPromise2 = BrowserTestUtils.promiseAlertDialogOpen();

  ppWin.document.getElementById("password1Textbox").value = "WRONG-passphrase";
  ppWin.document.querySelector("dialog").getButton("accept").click();

  let ppWin2 = await passPromptPromise2;

  ppWin2.document.getElementById("password1Textbox").value = "bob-passphrase";
  ppWin2.document.querySelector("dialog").getButton("accept").click();

  await sendMessageCompletePromise;

  await be_in_folder(gOutbox);
  select_click_row(0);
  assert_selected_and_displayed(0);

  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "ok"),
    "message has signed icon"
  );

  Assert.equal(
    aboutMessage.document.querySelector("#attachmentList").itemChildren.length,
    0,
    "no keys attached to message"
  );

  // Delete the message so other tests work.
  EventUtils.synthesizeKey("VK_DELETE");
});

registerCleanupFunction(async function tearDown() {
  bobIdentity.setUnicharAttribute("openpgp_key_id", initialKeyIdPref);
  await OpenPGPTestUtils.removeKeyById("0xfbfcc82a015e7330", true);
  MailServices.accounts.removeIncomingServer(bobAcct.incomingServer, true);
  MailServices.accounts.removeAccount(bobAcct, true);
});
