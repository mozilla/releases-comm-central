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
const { FileUtils } = ChromeUtils.import(
  "resource://gre/modules/FileUtils.jsm"
);
const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

let bobAcct;
let bobIdentity;
let initialKeyIdPref = "";
let gOutbox;

/**
 * Setup a mail account with a private key and import the public key for the
 * receiver.
 */
add_task(async function setUp() {
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

  gOutbox = get_special_folder(Ci.nsMsgFolderFlags.Queue);
});

/**
 * Tests composition of a message that is signed only shows as signed in the
 * Outbox.
 */
add_task(async function testSignedMessageComposition() {
  be_in_folder(bobAcct.incomingServer.rootFolder);

  let cwc = open_compose_new_mail();
  let composeWin = cwc.window;

  setup_msg_contents(
    cwc,
    "alice@openpgp.example",
    "Compose Signed Message",
    "This is a signed message composition test."
  );

  await OpenPGPTestUtils.toggleMessageSigning(composeWin);
  await OpenPGPTestUtils.toggleMessageKeyAttachment(composeWin);
  await sendMessage(composeWin);

  be_in_folder(gOutbox);
  select_click_row(0);
  assert_selected_and_displayed(0);

  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(window.document, "ok"),
    "message has signed icon"
  );

  Assert.equal(
    window.document.querySelector("#attachmentList").itemChildren.length,
    0,
    "no keys attached to message"
  );

  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(window.document, "ok"),
    "encrypted icon is not displayed"
  );

  // Delete the message so other tests work.
  EventUtils.synthesizeKey("VK_DELETE");
});

/**
 * Tests composition of a message that is signed only with, public key attachment
 * enabled, shows as signed in the Outbox.
 */
add_task(async function testSignedMessageWithKeyComposition() {
  be_in_folder(bobAcct.incomingServer.rootFolder);

  let cwc = open_compose_new_mail();
  let composeWin = cwc.window;

  setup_msg_contents(
    cwc,
    "alice@openpgp.example",
    "Compose Signed Message With Key",
    "This is a signed message with key composition test."
  );

  await OpenPGPTestUtils.toggleMessageSigning(composeWin);
  await sendMessage(composeWin);

  be_in_folder(gOutbox);
  select_click_row(0);
  assert_selected_and_displayed(0);

  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(window.document, "ok"),
    "message has signed icon"
  );

  let attachmentList = window.document.querySelector("#attachmentList");

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
    !OpenPGPTestUtils.hasEncryptedIconState(window.document, "ok"),
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
  be_in_folder(bobAcct.incomingServer.rootFolder);

  let cwc = open_compose_new_mail();
  let composeWin = cwc.window;

  setup_msg_contents(
    cwc,
    "alice@openpgp.example",
    "Compose Signed Encrypted Message",
    "This is a signed, encrypted message composition test."
  );

  await OpenPGPTestUtils.toggleMessageEncryption(composeWin);
  await OpenPGPTestUtils.toggleMessageKeyAttachment(composeWin);
  await sendMessage(composeWin);

  be_in_folder(gOutbox);
  select_click_row(0);
  assert_selected_and_displayed(0);

  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(window.document, "ok"),
    "message has signed icon"
  );

  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(window.document, "ok"),
    "message has encrypted icon"
  );

  Assert.equal(
    window.document.querySelector("#attachmentList").itemChildren.length,
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
  be_in_folder(bobAcct.incomingServer.rootFolder);

  let cwc = open_compose_new_mail();
  let composeWin = cwc.window;

  setup_msg_contents(
    cwc,
    "alice@openpgp.example",
    "Compose Signed Encrypted Message With Key",
    "This is a signed, encrypted message with key composition test."
  );

  await OpenPGPTestUtils.toggleMessageEncryption(composeWin);
  await sendMessage(composeWin);

  be_in_folder(gOutbox);
  select_click_row(0);
  assert_selected_and_displayed(0);

  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(window.document, "ok"),
    "message has signed icon"
  );

  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(window.document, "ok"),
    "message has encrypted icon"
  );

  let attachmentList = window.document.querySelector("#attachmentList");

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

registerCleanupFunction(function tearDown() {
  bobIdentity.setUnicharAttribute("openpgp_key_id", initialKeyIdPref);
  MailServices.accounts.removeIncomingServer(bobAcct.incomingServer, true);
  MailServices.accounts.removeAccount(bobAcct, true);
});
