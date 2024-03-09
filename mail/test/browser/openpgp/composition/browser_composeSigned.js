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
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);
const { open_compose_new_mail, get_msg_source, setup_msg_contents } =
  ChromeUtils.importESModule(
    "resource://testing-common/mozmill/ComposeHelpers.sys.mjs"
  );
const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/OpenPGPTestUtils.sys.mjs"
);
const { EnigmailPersistentCrypto } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/persistentCrypto.sys.mjs"
);

const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

let bobAcct;
let bobIdentity;
let initialKeyIdPref = "";
let gOutbox;

const aboutMessage = get_about_message();

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

  const [id] = await OpenPGPTestUtils.importPrivateKey(
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

  await OpenPGPTestUtils.importPublicKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "../data/keys/carol@example.com-0x3099ff1238852b9f-pub.asc"
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
  const autocryptPrefName = "mail.identity.default.sendAutocryptHeaders";
  Services.prefs.setBoolPref(autocryptPrefName, true);

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
  await sendMessage(composeWin);

  await be_in_folder(gOutbox);
  const msg = await select_click_row(0);
  await assert_selected_and_displayed(0);
  const src = await get_msg_source(msg);
  const lines = src.split("\n");

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

  const cwc = await open_compose_new_mail();
  const composeWin = cwc;

  await setup_msg_contents(
    cwc,
    "alice@openpgp.example",
    "Compose Signed Message With Key",
    "This is a signed message with key composition test."
  );

  await OpenPGPTestUtils.toggleMessageSigning(composeWin);
  await sendMessage(composeWin);

  await be_in_folder(gOutbox);
  await select_click_row(0);
  await assert_selected_and_displayed(0);

  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "ok"),
    "message has signed icon"
  );

  const attachmentList = aboutMessage.document.querySelector("#attachmentList");

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

/*
This comment documents Carol's and Alice's keys encoded as autocrypt
headers.

Autocrypt-Gossip: addr=alice@openpgp.example; keydata=
 xjMEXEcE6RYJKwYBBAHaRw8BAQdArjWwk3FAqyiFbFBKT4TzXcVBqPTB3gmzlC/Ub7O1u13N
 JkFsaWNlIExvdmVsYWNlIDxhbGljZUBvcGVucGdwLmV4YW1wbGU+wpAEExYIADgCGwMFCwkI
 BwIGFQoJCAsCBBYCAwECHgECF4AWIQTrhbtfozp14V6UTmPyMVUMT0fjjgUCXaWfOgAKCRDy
 MVUMT0fjjukrAPoDnHBSogOmsHOsd9qGsiZpgRnOdypvbm+QtXZqth9rvwD9HcDC0tC+PHAs
 O7OTh1S1TC9RiJsvawAfCPaQZoed8gLOOARcRwTpEgorBgEEAZdVAQUBAQdAQv8GIa2rSTzg
 qbXCpDDYMiKRVitCsy203x3sE9+eviIDAQgHwngEGBYIACAWIQTrhbtfozp14V6UTmPyMVUM
 T0fjjgUCXEcE6QIbDAAKCRDyMVUMT0fjjlnQAQDFHUs6TIcxrNTtEZFjUFm1M0PJ1Dng/cDW
 4xN80fsn0QEA22Kr7VkCjeAEC08VSTeV+QFsmz55/lntWkwYWhmvOgE=
Autocrypt-Gossip: addr=carol@example.com; keydata=
 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
 meCtpxz2PoYBJfxGPEzu9xTLV6k9wSVTCgE=
*/

/**
 * Tests composition of a signed, encrypted message, for two recipients,
 * is shown as signed and encrypted in the Outbox, and has the
 * Autocrypt-Gossip headers.
 */
add_task(async function testSignedEncryptedMessageComposition() {
  await be_in_folder(bobAcct.incomingServer.rootFolder);

  const cwc = await open_compose_new_mail();
  const composeWin = cwc;

  // setup_msg_contents will trigger checkEncryptionState.
  let checkDonePromise = waitCheckEncryptionStateDone(composeWin);
  await setup_msg_contents(
    cwc,
    "alice@openpgp.example, carol@example.com",
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
  const encryptedMsg = await select_click_row(0);
  await assert_selected_and_displayed(0);

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

  // Check that the gossip headers are inside the encrypted message.
  // To check that easily, we decrypt the message to another folder,
  // and then get its source.

  // moving to decrypted message in same folder (deleting original)
  await EnigmailPersistentCrypto.cryptMessage(
    encryptedMsg,
    gOutbox.URI,
    true,
    null
  );

  const msg = await select_click_row(0);
  const src = await get_msg_source(msg);
  const lines = src.split("\r\n");

  // As a sanity check, we check that the header line, plus the first
  // and last lines of the keydata are present.
  const expectedGossipLines = [
    "Autocrypt-Gossip: addr=alice@openpgp.example; keydata=",
    " xjMEXEcE6RYJKwYBBAHaRw8BAQdArjWwk3FAqyiFbFBKT4TzXcVBqPTB3gmzlC/Ub7O1u13N",
    " 4xN80fsn0QEA22Kr7VkCjeAEC08VSTeV+QFsmz55/lntWkwYWhmvOgE=",
    "Autocrypt-Gossip: addr=carol@example.com; keydata=",
    " xsFNBF9GZTQBEACjK8Db1095rU74k/RwLhmp9rmFBZR6qyEHANlHSVwqARxa4aJPaNoLbqNP",
    " meCtpxz2PoYBJfxGPEzu9xTLV6k9wSVTCgE=",
  ];

  for (const egl of expectedGossipLines) {
    Assert.ok(
      lines.some(line => line == egl),
      "The following Autocrypt-Gossip header line was found: " + egl
    );
  }

  // Delete the message so other tests work.
  EventUtils.synthesizeKey("VK_DELETE");
});

/**
 * Tests composition of a signed, encrypted, message with public key attachment
 * enabled, is shown signed, encrypted in the Outbox.
 */
add_task(async function testSignedEncryptedMessageWithKeyComposition() {
  await be_in_folder(bobAcct.incomingServer.rootFolder);

  const cwc = await open_compose_new_mail();
  const composeWin = cwc;

  // setup_msg_contents will trigger checkEncryptionState.
  let checkDonePromise = waitCheckEncryptionStateDone(composeWin);
  await setup_msg_contents(
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
  await select_click_row(0);
  await assert_selected_and_displayed(0);

  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "ok"),
    "message has signed icon"
  );

  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "message has encrypted icon"
  );

  const attachmentList = aboutMessage.document.querySelector("#attachmentList");

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
