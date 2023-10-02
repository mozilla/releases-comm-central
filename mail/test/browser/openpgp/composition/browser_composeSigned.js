/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for OpenPGP signed message composition.
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
const { open_compose_new_mail, get_msg_source, setup_msg_contents } =
  ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
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

async function waitCheckEncryptionStateDone(win) {
  return BrowserTestUtils.waitForEvent(
    win.document,
    "encryption-state-checked"
  );
}

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
        "../data/keys/bob@openpgp.example-0xfbfcc82a015e7330-secret.asc"
      )
    )
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
 * Tests composition of a message that is signed only shows as signed in the
 * Outbox.
 */
add_task(async function testSignedMessageComposition() {
  let autocryptPrefName = "mail.identity.default.sendAutocryptHeaders";
  Services.prefs.setBoolPref(autocryptPrefName, true);

  await be_in_folder(bobAcct.incomingServer.rootFolder);

  let cwc = open_compose_new_mail();
  let composeWin = cwc;

  setup_msg_contents(
    cwc,
    "alice@openpgp.example",
    "Compose Signed Message",
    "This is a signed message composition test."
  );

  await OpenPGPTestUtils.toggleMessageSigning(composeWin);
  await OpenPGPTestUtils.toggleMessageKeyAttachment(composeWin);
  await sendMessage(composeWin);

  await be_in_folder(gOutbox);
  let msg = select_click_row(0);
  assert_selected_and_displayed(0);
  let src = await get_msg_source(msg);
  let lines = src.split("\n");

  Assert.ok(
    lines.some(
      line => line.trim() == "Autocrypt: addr=bob@openpgp.example; keydata="
    ),
    "Correct Autocrypt header found"
  );

  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "ok"),
    "message has signed icon"
  );

  Assert.equal(
    aboutMessage.document.querySelector("#attachmentList").itemChildren.length,
    0,
    "no keys attached to message"
  );

  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is not displayed"
  );

  // Delete the message so other tests work.
  EventUtils.synthesizeKey("VK_DELETE");
  // Restore pref to original value
  Services.prefs.clearUserPref(autocryptPrefName);
});

/**
 * Tests composition of a message that is signed only with, public key attachment
 * enabled, shows as signed in the Outbox.
 */
add_task(async function testSignedMessageWithKeyComposition() {
  await be_in_folder(bobAcct.incomingServer.rootFolder);

  let cwc = open_compose_new_mail();
  let composeWin = cwc;

  setup_msg_contents(
    cwc,
    "alice@openpgp.example",
    "Compose Signed Message With Key",
    "This is a signed message with key composition test."
  );

  await OpenPGPTestUtils.toggleMessageSigning(composeWin);
  await sendMessage(composeWin);

  await be_in_folder(gOutbox);
  select_click_row(0);
  assert_selected_and_displayed(0);

  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "ok"),
    "message has signed icon"
  );

  let attachmentList = aboutMessage.document.querySelector("#attachmentList");

  Assert.equal(
    attachmentList.itemChildren.length,
    1,
    "message has one attachment"
  );

  Assert.ok(
    attachmentList
      .getItemAtIndex(0)
      .attachment.name.includes(OpenPGPTestUtils.BOB_KEY_ID),
    "attachment name contains Bob's key id"
  );

  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is not displayed"
  );

  // Delete the message so other tests work.
  EventUtils.synthesizeKey("VK_DELETE");
});

/**
 * Tests composition of a signed, encrypted message is shown as signed and
 * encrypted in the Outbox.
 */
add_task(async function testSignedEncryptedMessageComposition() {
  await be_in_folder(bobAcct.incomingServer.rootFolder);

  let cwc = open_compose_new_mail();
  let composeWin = cwc;

  // setup_msg_contents will trigger checkEncryptionState.
  let checkDonePromise = waitCheckEncryptionStateDone(composeWin);
  setup_msg_contents(
    cwc,
    "alice@openpgp.example",
    "Compose Signed Encrypted Message",
    "This is a signed, encrypted message composition test."
  );
  await checkDonePromise;

  // This toggle will trigger checkEncryptionState(), request that
  // an event will be sent after the next call to checkEncryptionState
  // has completed.
  checkDonePromise = waitCheckEncryptionStateDone(composeWin);
  await OpenPGPTestUtils.toggleMessageEncryption(composeWin);
  await checkDonePromise;

  await OpenPGPTestUtils.toggleMessageKeyAttachment(composeWin);
  await sendMessage(composeWin);

  await be_in_folder(gOutbox);
  select_click_row(0);
  assert_selected_and_displayed(0);

  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "ok"),
    "message has signed icon"
  );

  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "message has encrypted icon"
  );

  Assert.equal(
    aboutMessage.document.querySelector("#attachmentList").itemChildren.length,
    0,
    "no keys attached to message"
  );

  // Delete the message so other tests work.
  EventUtils.synthesizeKey("VK_DELETE");
});

/**
 * Tests composition of a signed, encrypted, message with public key attachment
 * enabled, is shown signed, encrypted in the Outbox.
 */
add_task(async function testSignedEncryptedMessageWithKeyComposition() {
  await be_in_folder(bobAcct.incomingServer.rootFolder);

  let cwc = open_compose_new_mail();
  let composeWin = cwc;

  // setup_msg_contents will trigger checkEncryptionState.
  let checkDonePromise = waitCheckEncryptionStateDone(composeWin);
  setup_msg_contents(
    cwc,
    "alice@openpgp.example",
    "Compose Signed Encrypted Message With Key",
    "This is a signed, encrypted message with key composition test."
  );
  await checkDonePromise;

  // This toggle will trigger checkEncryptionState(), request that
  // an event will be sent after the next call to checkEncryptionState
  // has completed.
  checkDonePromise = waitCheckEncryptionStateDone(composeWin);
  await OpenPGPTestUtils.toggleMessageEncryption(composeWin);
  await checkDonePromise;

  await sendMessage(composeWin);

  await be_in_folder(gOutbox);
  select_click_row(0);
  assert_selected_and_displayed(0);

  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "ok"),
    "message has signed icon"
  );

  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "message has encrypted icon"
  );

  let attachmentList = aboutMessage.document.querySelector("#attachmentList");

  Assert.equal(
    attachmentList.itemChildren.length,
    1,
    "message has one attachment"
  );

  Assert.ok(
    attachmentList
      .getItemAtIndex(0)
      .attachment.name.includes(OpenPGPTestUtils.BOB_KEY_ID),
    "attachment name contains Bob's key id"
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
