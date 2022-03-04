/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the collecting keys from messages.
 */

"use strict";

const { open_message_from_file } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
const { close_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);
const { waitForCondition } = ChromeUtils.import(
  "resource://testing-common/mozmill/utils.jsm"
);
const {
  assert_notification_displayed,
  get_notification_button,
  wait_for_notification_to_show,
  wait_for_notification_to_stop,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/NotificationBoxHelpers.jsm"
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

const { CollectedKeysDB } = ChromeUtils.import(
  "chrome://openpgp/content/modules/CollectedKeysDB.jsm"
);

var aliceAcct;

/**
 * When testing a scenario that should automatically process the OpenPGP
 * contents (it's not suppressed e.g. because of a partial content),
 * then we need to wait for the automatic processing to complete.
 */
async function openpgpProcessed() {
  let [subject] = await TestUtils.topicObserved(
    "document-element-inserted",
    document => {
      return (
        document.ownerGlobal?.location ==
        "chrome://messenger/content/messageWindow.xhtml"
      );
    }
  );

  return BrowserTestUtils.waitForEvent(subject, "openpgpprocessed");
}

/**
 * Set up the base account, identity and keys needed for the tests.
 */
add_task(async function setupTest() {
  aliceAcct = MailServices.accounts.createAccount();
  aliceAcct.incomingServer = MailServices.accounts.createIncomingServer(
    "alice",
    "openpgp.example",
    "pop3"
  );
  let aliceIdentity = MailServices.accounts.createIdentity();
  aliceIdentity.email = "alice@openpgp.example";
  aliceAcct.addIdentity(aliceIdentity);

  // Set up the alice's private key.
  // We need one key set up for use. Otherwise we do not process OpenPGP data.
  let [id] = await OpenPGPTestUtils.importPrivateKey(
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
  let keycollected = BrowserTestUtils.waitForEvent(window, "keycollected");
  let opengpgprocessed = openpgpProcessed();
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/unsigned-unencrypted-key-0x1f10171bfb881b1c-attached.eml"
      )
    )
  );
  await opengpgprocessed;

  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(mc.window.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(mc.window.document, "ok"),
    "encrypted icon is not displayed"
  );
  await keycollected;

  let db = await CollectedKeysDB.getInstance();
  let keys = await db.findKeysForEmail("jdoe@invalid");
  Assert.equal(keys.length, 1, "should find one key");

  let sources = keys[0].sources;
  Assert.equal(sources.length, 1, "should have one source");
  let source = sources[0];

  Assert.equal(source.type, "attachment");
  Assert.equal(source.uri, "mid:4a735c72-dc19-48ff-4fa5-2c1f65513b27@invalid");
  Assert.equal(source.description, "OpenPGP_0x1F10171BFB881B1C.asc");

  close_window(mc);
});

/**
 * Test that we don't collect keys that refer to an email address that
 * isn't one of the message participants, and that we don't collect keys
 * if we already have a personal key for an email address.
 */
add_task(async function testSkipFakeOrUnrelatedKeys() {
  let opengpgprocessed = openpgpProcessed();
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/eml/unrelated-and-fake-keys-attached.eml")
    )
  );
  await opengpgprocessed;

  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(mc.window.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(mc.window.document, "ok"),
    "encrypted icon is not displayed"
  );

  let db = await CollectedKeysDB.getInstance();

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

  keys = await db.findKeysForEmail("bob@openpgp.example");
  Assert.equal(keys.length, 1, "bob's key should have been collected");

  close_window(mc);
});

/**
 * If an email contains two different keys for the same email address,
 * don't import any keys for that email address.
 */
add_task(async function testSkipDuplicateKeys() {
  let opengpgprocessed = openpgpProcessed();
  let mc = await open_message_from_file(
    new FileUtils.File(getTestFilePath("data/eml/eve-duplicate.eml"))
  );
  await opengpgprocessed;

  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(mc.window.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(mc.window.document, "ok"),
    "encrypted icon is not displayed"
  );

  let db = await CollectedKeysDB.getInstance();

  let keys = await db.findKeysForEmail("eve@example.com");
  Assert.equal(
    keys.length,
    0,
    "the attached keys for eve should have been ignored"
  );

  close_window(mc);
});

registerCleanupFunction(async function tearDown() {
  MailServices.accounts.removeAccount(aliceAcct, true);
  await OpenPGPTestUtils.removeKeyById("0xf231550c4f47e38e", true);
  await CollectedKeysDB.deleteDb();
});
