/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the collecting keys from messages.
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
const { CollectedKeysDB } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/CollectedKeysDB.sys.mjs"
);

var aliceAcct;

/**
 * When testing a scenario that should automatically process the OpenPGP
 * contents (it's not suppressed e.g. because of a partial content),
 * then we need to wait for the automatic processing to complete.
 */
async function openpgpProcessed() {
  const [subject] = await TestUtils.topicObserved(
    "document-element-inserted",
    document => {
      return document.ownerGlobal?.location == "about:message";
    }
  );

  return BrowserTestUtils.waitForEvent(subject, "openpgpprocessed");
}

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

  // Set up the alice's private key.
  // We need one key set up for use. Otherwise we do not process OpenPGP data.
  const [id] = await OpenPGPTestUtils.importPrivateKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "data/keys/alice@openpgp.example-0xf231550c4f47e38e-secret.asc"
      )
    )
  );
  aliceIdentity.setUnicharAttribute("openpgp_key_id", id);
});

/**
 * Test that an attached key is collected.
 */
add_task(async function testCollectKeyAttachment() {
  const keycollected = BrowserTestUtils.waitForEvent(window, "keycollected");
  const opengpgprocessed = openpgpProcessed();
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/unsigned-unencrypted-key-0x1f10171bfb881b1c-attached.eml"
      )
    )
  );
  await opengpgprocessed;
  const aboutMessage = get_about_message(msgc);

  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(aboutMessage.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is not displayed"
  );
  await keycollected;

  const db = await CollectedKeysDB.getInstance();
  const keys = await db.findKeysForEmail("jdoe@invalid");
  Assert.equal(keys.length, 1, "should find one key");

  const sources = keys[0].sources;
  Assert.equal(sources.length, 1, "should have one source");
  const source = sources[0];

  Assert.equal(source.type, "attachment");
  Assert.equal(source.uri, "mid:4a735c72-dc19-48ff-4fa5-2c1f65513b27@invalid");
  Assert.equal(source.description, "OpenPGP_0x1F10171BFB881B1C.asc");

  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that an Autocrypt header key is collected.
 */
add_task(async function testCollectAutocrypt() {
  const keycollected = BrowserTestUtils.waitForEvent(window, "keycollected");
  const opengpgprocessed = openpgpProcessed();
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/unsigned-unencrypted-0x3099ff1238852b9f-autocrypt.eml"
      )
    )
  );
  await opengpgprocessed;
  const aboutMessage = get_about_message(msgc);

  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(aboutMessage.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is not displayed"
  );
  await keycollected;

  const carolEmail = "carol@example.com";

  const db = await CollectedKeysDB.getInstance();
  let keys = await db.findKeysForEmail(carolEmail);
  Assert.equal(keys.length, 1, "should find one key");

  const sources = keys[0].sources;
  Assert.equal(sources.length, 1, "should have one source");
  const source = sources[0];

  Assert.equal(source.type, "autocrypt");
  Assert.equal(
    source.uri,
    "mid:b3609461-36e8-0371-1b9d-7ce6864ec66d@example.com"
  );
  Assert.equal(source.description, undefined);

  // Clean up to ensure other tests will not find this key
  db.deleteKeysForEmail(carolEmail);
  keys = await db.findKeysForEmail(carolEmail);
  Assert.equal(keys.length, 0, "should find zero keys after cleanup");

  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that an Autocrypt-Gossip header key is collected.
 */
add_task(async function testCollectAutocryptGossip() {
  const keycollected = BrowserTestUtils.waitForEvent(window, "keycollected");
  const keycollected2 = BrowserTestUtils.waitForEvent(window, "keycollected");
  const keycollected3 = BrowserTestUtils.waitForEvent(window, "keycollected");
  const opengpgprocessed = openpgpProcessed();
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/eml/signed-encrypted-autocrypt-gossip.eml")
    )
  );
  await opengpgprocessed;
  const aboutMessage = get_about_message(msgc);

  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "unknown"),
    "signed icon is displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is displayed"
  );

  await keycollected;
  await keycollected2;
  await keycollected3;

  const carolEmail = "carol@example.com";

  const db = await CollectedKeysDB.getInstance();
  let keys = await db.findKeysForEmail(carolEmail);
  Assert.equal(keys.length, 1, "should find one key");

  const sources = keys[0].sources;
  Assert.equal(sources.length, 1, "should have one source");
  const source = sources[0];

  Assert.equal(source.type, "autocrypt");
  Assert.equal(
    source.uri,
    "mid:e8690528-d187-4d99-b505-9f3d6a2704ca@openpgp.example"
  );
  Assert.equal(source.description, undefined);

  // Clean up to ensure other tests will not find this key
  db.deleteKeysForEmail(carolEmail);
  keys = await db.findKeysForEmail(carolEmail);
  Assert.equal(keys.length, 0, "should find zero keys after cleanup");

  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that we don't collect keys that refer to an email address that
 * isn't one of the message participants, and that we don't collect keys
 * if we already have a personal key for an email address.
 */
add_task(async function testSkipFakeOrUnrelatedKeys() {
  const opengpgprocessed = openpgpProcessed();
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/eml/unrelated-and-fake-keys-attached.eml")
    )
  );
  await opengpgprocessed;
  const aboutMessage = get_about_message(msgc);

  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(aboutMessage.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is not displayed"
  );

  const db = await CollectedKeysDB.getInstance();

  let keys = await db.findKeysForEmail("alice@openpgp.example");
  Assert.equal(
    keys.length,
    0,
    "the attached key for alice should have been ignored because we have a personal key for that address"
  );

  keys = await db.findKeysForEmail("stranger@example.com");
  Assert.equal(
    keys.length,
    0,
    "the attached key for stranger should have been ignored because stranger isn't a participant of this message"
  );

  const bobEmail = "bob@openpgp.example";

  keys = await db.findKeysForEmail(bobEmail);
  Assert.equal(keys.length, 1, "bob's key should have been collected");

  db.deleteKeysForEmail(bobEmail);
  keys = await db.findKeysForEmail(bobEmail);
  Assert.equal(keys.length, 0, "should find zero keys after cleanup");

  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * If an email contains two different keys for the same email address,
 * don't import any keys for that email address.
 */
add_task(async function testSkipDuplicateKeys() {
  const opengpgprocessed = openpgpProcessed();
  const msgc = await open_message_from_file(
    new FileUtils.File(getTestFilePath("data/eml/eve-duplicate.eml"))
  );
  await opengpgprocessed;
  const aboutMessage = get_about_message(msgc);

  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(aboutMessage.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is not displayed"
  );

  const db = await CollectedKeysDB.getInstance();

  const keys = await db.findKeysForEmail("eve@example.com");
  Assert.equal(
    keys.length,
    0,
    "the attached keys for eve should have been ignored"
  );

  await BrowserTestUtils.closeWindow(msgc);
});

registerCleanupFunction(async function tearDown() {
  MailServices.accounts.removeAccount(aliceAcct, true);
  await OpenPGPTestUtils.removeKeyById("0xf231550c4f47e38e", true);
  await CollectedKeysDB.deleteDb();
});
