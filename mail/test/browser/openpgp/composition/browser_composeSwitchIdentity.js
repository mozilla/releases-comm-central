/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for OpenPGP encrypted message composition.
 */

"use strict";

const { be_in_folder } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);
const { open_compose_new_mail, setup_msg_contents } =
  ChromeUtils.importESModule(
    "resource://testing-common/mozmill/ComposeHelpers.sys.mjs"
  );
const { click_menus_in_sequence } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/WindowHelpers.sys.mjs"
);
const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/OpenPGPTestUtils.sys.mjs"
);

const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

let bobAcct;
let bobIdentity;
let plainIdentity;

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
  // Encryption makes the compose process a little longer.
  requestLongerTimeout(5);

  bobAcct = MailServices.accounts.createAccount();
  bobAcct.incomingServer = MailServices.accounts.createIncomingServer(
    "bob",
    "openpgp.example",
    "imap"
  );
  bobIdentity = MailServices.accounts.createIdentity();
  bobIdentity.email = "bob@openpgp.example";
  bobAcct.addIdentity(bobIdentity);

  plainIdentity = MailServices.accounts.createIdentity();
  plainIdentity.email = "bob+plain@openpgp.example";
  bobAcct.addIdentity(plainIdentity);

  const [id] = await OpenPGPTestUtils.importPrivateKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "../data/keys/bob@openpgp.example-0xfbfcc82a015e7330-secret.asc"
      )
    )
  );

  Assert.ok(id, "private key id received");
  bobIdentity.setUnicharAttribute("openpgp_key_id", id.split("0x").join(""));

  await OpenPGPTestUtils.importPublicKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "../data/keys/alice@openpgp.example-0xf231550c4f47e38e-pub.asc"
      )
    )
  );
});

async function testComposeFlags(
  prefEncryptionPolicy,
  prefSignMail,
  prefAttachPgpKey,
  prefProtectSubject,
  expectSendEncrypted,
  expectSendSigned,
  expectAttachMyPublicPGPKey,
  expectEncryptSubject,
  testToggle,
  expectSendEncrypted2AfterToggle,
  expectSendSigned2AfterToggle,
  expectAttachMyPublicPGPKey2AfterToggle,
  expectEncryptSubject2AfterToggle,
  switchIdentity,
  expectSendEncrypted3GoneToPlainIdentity,
  expectSendSigned3GoneToPlainIdentity,
  expectAttachMyPublicPGPKey3GoneToPlainIdentity,
  expectEncryptSubject3GoneToPlainIdentity,
  expectSendEncrypted4GoneToOrigIdentity,
  expectSendSigned4GoneToOrigIdentity,
  expectAttachMyPublicPGPKey4GoneToOrigIdentity,
  expectEncryptSubject4GoneToOrigIdentity
) {
  await be_in_folder(bobAcct.incomingServer.rootFolder);

  bobIdentity.encryptionPolicy = prefEncryptionPolicy;
  bobIdentity.signMail = prefSignMail;
  bobIdentity.attachPgpKey = prefAttachPgpKey;
  bobIdentity.protectSubject = prefProtectSubject;

  const cwc = await open_compose_new_mail();
  const composeWin = cwc;

  // setup_msg_contents will trigger checkEncryptionState.
  let checkDonePromise = waitCheckEncryptionStateDone(composeWin);
  await setup_msg_contents(
    cwc,
    "alice@openpgp.example",
    "Compose Message",
    "This is a message."
  );
  await checkDonePromise;

  Assert.equal(composeWin.gSendEncrypted, expectSendEncrypted);
  Assert.equal(composeWin.gSendSigned, expectSendSigned);
  Assert.equal(composeWin.gAttachMyPublicPGPKey, expectAttachMyPublicPGPKey);
  Assert.equal(composeWin.gEncryptSubject, expectEncryptSubject);

  if (testToggle) {
    if (testToggle == "encrypt") {
      // This toggle will trigger checkEncryptionState(), request that
      // an event will be sent after the next call to checkEncryptionState
      // has completed.
      checkDonePromise = waitCheckEncryptionStateDone(composeWin);
      await OpenPGPTestUtils.toggleMessageEncryption(composeWin);
      await checkDonePromise;
    } else if (testToggle == "sign") {
      await OpenPGPTestUtils.toggleMessageSigning(composeWin);
    } else if (testToggle == "encrypt-subject") {
      await OpenPGPTestUtils.toggleMessageEncryptSubject(composeWin);
    } else if (testToggle == "attach-key") {
      await OpenPGPTestUtils.toggleMessageKeyAttachment(composeWin);
    } else {
      Assert.ok(false, "test provides allowed toggle parameter");
    }

    Assert.equal(composeWin.gSendEncrypted, expectSendEncrypted2AfterToggle);
    Assert.equal(composeWin.gSendSigned, expectSendSigned2AfterToggle);
    Assert.equal(
      composeWin.gAttachMyPublicPGPKey,
      expectAttachMyPublicPGPKey2AfterToggle
    );
    Assert.equal(composeWin.gEncryptSubject, expectEncryptSubject2AfterToggle);
  }

  if (switchIdentity) {
    checkDonePromise = waitCheckEncryptionStateDone(composeWin);

    EventUtils.synthesizeMouseAtCenter(
      cwc.document.getElementById("msgIdentity"),
      {},
      cwc.document.getElementById("msgIdentity").ownerGlobal
    );
    await click_menus_in_sequence(
      cwc.document.getElementById("msgIdentityPopup"),
      [{ identitykey: plainIdentity.key }]
    );

    await checkDonePromise;

    Assert.equal(
      composeWin.gSendEncrypted,
      expectSendEncrypted3GoneToPlainIdentity
    );
    Assert.equal(composeWin.gSendSigned, expectSendSigned3GoneToPlainIdentity);
    Assert.equal(
      composeWin.gAttachMyPublicPGPKey,
      expectAttachMyPublicPGPKey3GoneToPlainIdentity
    );
    Assert.equal(
      composeWin.gEncryptSubject,
      expectEncryptSubject3GoneToPlainIdentity
    );

    checkDonePromise = waitCheckEncryptionStateDone(composeWin);

    EventUtils.synthesizeMouseAtCenter(
      cwc.document.getElementById("msgIdentity"),
      {},
      cwc.document.getElementById("msgIdentity").ownerGlobal
    );
    await click_menus_in_sequence(
      cwc.document.getElementById("msgIdentityPopup"),
      [{ identitykey: bobIdentity.key }]
    );

    await checkDonePromise;

    Assert.equal(
      composeWin.gSendEncrypted,
      expectSendEncrypted4GoneToOrigIdentity
    );
    Assert.equal(composeWin.gSendSigned, expectSendSigned4GoneToOrigIdentity);
    Assert.equal(
      composeWin.gAttachMyPublicPGPKey,
      expectAttachMyPublicPGPKey4GoneToOrigIdentity
    );
    Assert.equal(
      composeWin.gEncryptSubject,
      expectEncryptSubject4GoneToOrigIdentity
    );
  }

  await BrowserTestUtils.closeWindow(composeWin);
  await TestUtils.waitForCondition(
    () => document.hasFocus(),
    "waiting for focus to return to the main window"
  );
}

/**
 * Each function below tests a specific identity e2ee configuration
 * (see initial variables named pref*),
 * then opening a composer window based on those prefs,
 * then optionally toggling an e2ee flag in composer window,
 * then switching to a default "from" identity (no e2ee configured),
 * then switching back to the initial identity,
 * and checks that the resulting message flags (as seen in variables)
 * at each step are as expected.
 */

add_task(async function testMsgComp1() {
  const prefEncryptionPolicy = 0; // default encryption: off
  const prefSignMail = false; // sign unencrypted messages: off
  const prefAttachPgpKey = true; // attach key to signed messages: on
  const prefProtectSubject = true; // encrypt subject of encrypted message: on

  const expectSendEncrypted = false;
  const expectSendSigned = false;
  const expectAttachMyPublicPGPKey = false;
  const expectEncryptSubject = false;
  const testToggle = null;
  const expectSendEncrypted2AfterToggle = undefined;
  const expectSendSigned2AfterToggle = undefined;
  const expectAttachMyPublicPGPKey2AfterToggle = undefined;
  const expectEncryptSubject2AfterToggle = undefined;
  const switchIdentity = true;
  const expectSendEncrypted3GoneToPlainIdentity = false;
  const expectSendSigned3GoneToPlainIdentity = false;
  const expectAttachMyPublicPGPKey3GoneToPlainIdentity = false;
  const expectEncryptSubject3GoneToPlainIdentity = false;
  const expectSendEncrypted4GoneToOrigIdentity = false;
  const expectSendSigned4GoneToOrigIdentity = false;
  const expectAttachMyPublicPGPKey4GoneToOrigIdentity = false;
  const expectEncryptSubject4GoneToOrigIdentity = false;

  await testComposeFlags(
    prefEncryptionPolicy,
    prefSignMail,
    prefAttachPgpKey,
    prefProtectSubject,
    expectSendEncrypted,
    expectSendSigned,
    expectAttachMyPublicPGPKey,
    expectEncryptSubject,
    testToggle,
    expectSendEncrypted2AfterToggle,
    expectSendSigned2AfterToggle,
    expectAttachMyPublicPGPKey2AfterToggle,
    expectEncryptSubject2AfterToggle,
    switchIdentity,
    expectSendEncrypted3GoneToPlainIdentity,
    expectSendSigned3GoneToPlainIdentity,
    expectAttachMyPublicPGPKey3GoneToPlainIdentity,
    expectEncryptSubject3GoneToPlainIdentity,
    expectSendEncrypted4GoneToOrigIdentity,
    expectSendSigned4GoneToOrigIdentity,
    expectAttachMyPublicPGPKey4GoneToOrigIdentity,
    expectEncryptSubject4GoneToOrigIdentity
  );
});

add_task(async function testMsgComp1b() {
  const prefEncryptionPolicy = 0; // default encryption: off
  const prefSignMail = false; // sign unencrypted messages: off
  const prefAttachPgpKey = true; // attach key to signed messages: on
  const prefProtectSubject = true; // encrypt subject of encrypted message: on

  const expectSendEncrypted = false;
  const expectSendSigned = false;
  const expectAttachMyPublicPGPKey = false;
  const expectEncryptSubject = false;
  const testToggle = "sign";
  const expectSendEncrypted2AfterToggle = false;
  const expectSendSigned2AfterToggle = true;
  const expectAttachMyPublicPGPKey2AfterToggle = true;
  const expectEncryptSubject2AfterToggle = false;
  const switchIdentity = true;
  const expectSendEncrypted3GoneToPlainIdentity = false;
  const expectSendSigned3GoneToPlainIdentity = false;
  const expectAttachMyPublicPGPKey3GoneToPlainIdentity = false;
  const expectEncryptSubject3GoneToPlainIdentity = false;
  const expectSendEncrypted4GoneToOrigIdentity = false;
  const expectSendSigned4GoneToOrigIdentity = false;
  const expectAttachMyPublicPGPKey4GoneToOrigIdentity = false;
  const expectEncryptSubject4GoneToOrigIdentity = false;

  await testComposeFlags(
    prefEncryptionPolicy,
    prefSignMail,
    prefAttachPgpKey,
    prefProtectSubject,
    expectSendEncrypted,
    expectSendSigned,
    expectAttachMyPublicPGPKey,
    expectEncryptSubject,
    testToggle,
    expectSendEncrypted2AfterToggle,
    expectSendSigned2AfterToggle,
    expectAttachMyPublicPGPKey2AfterToggle,
    expectEncryptSubject2AfterToggle,
    switchIdentity,
    expectSendEncrypted3GoneToPlainIdentity,
    expectSendSigned3GoneToPlainIdentity,
    expectAttachMyPublicPGPKey3GoneToPlainIdentity,
    expectEncryptSubject3GoneToPlainIdentity,
    expectSendEncrypted4GoneToOrigIdentity,
    expectSendSigned4GoneToOrigIdentity,
    expectAttachMyPublicPGPKey4GoneToOrigIdentity,
    expectEncryptSubject4GoneToOrigIdentity
  );
});

add_task(async function testMsgComp2() {
  const prefEncryptionPolicy = 0; // default encryption: off
  const prefSignMail = true; // sign unencrypted messages: on
  const prefAttachPgpKey = true; // attach key to signed messages: on
  const prefProtectSubject = true; // encrypt subject of encrypted message: on

  const expectSendEncrypted = false;
  const expectSendSigned = true;
  const expectAttachMyPublicPGPKey = true;
  const expectEncryptSubject = false;
  const testToggle = null;
  const expectSendEncrypted2AfterToggle = undefined;
  const expectSendSigned2AfterToggle = undefined;
  const expectAttachMyPublicPGPKey2AfterToggle = undefined;
  const expectEncryptSubject2AfterToggle = undefined;
  const switchIdentity = true;
  const expectSendEncrypted3GoneToPlainIdentity = false;
  const expectSendSigned3GoneToPlainIdentity = false;
  const expectAttachMyPublicPGPKey3GoneToPlainIdentity = false;
  const expectEncryptSubject3GoneToPlainIdentity = false;
  const expectSendEncrypted4GoneToOrigIdentity = false;
  const expectSendSigned4GoneToOrigIdentity = true;
  const expectAttachMyPublicPGPKey4GoneToOrigIdentity = true;
  const expectEncryptSubject4GoneToOrigIdentity = false;

  await testComposeFlags(
    prefEncryptionPolicy,
    prefSignMail,
    prefAttachPgpKey,
    prefProtectSubject,
    expectSendEncrypted,
    expectSendSigned,
    expectAttachMyPublicPGPKey,
    expectEncryptSubject,
    testToggle,
    expectSendEncrypted2AfterToggle,
    expectSendSigned2AfterToggle,
    expectAttachMyPublicPGPKey2AfterToggle,
    expectEncryptSubject2AfterToggle,
    switchIdentity,
    expectSendEncrypted3GoneToPlainIdentity,
    expectSendSigned3GoneToPlainIdentity,
    expectAttachMyPublicPGPKey3GoneToPlainIdentity,
    expectEncryptSubject3GoneToPlainIdentity,
    expectSendEncrypted4GoneToOrigIdentity,
    expectSendSigned4GoneToOrigIdentity,
    expectAttachMyPublicPGPKey4GoneToOrigIdentity,
    expectEncryptSubject4GoneToOrigIdentity
  );
});

add_task(async function testMsgComp2b() {
  const prefEncryptionPolicy = 0; // default encryption: off
  const prefSignMail = true; // sign unencrypted messages: on
  const prefAttachPgpKey = true; // attach key to signed messages: on
  const prefProtectSubject = true; // encrypt subject of encrypted message: on

  const expectSendEncrypted = false;
  const expectSendSigned = true;
  const expectAttachMyPublicPGPKey = true;
  const expectEncryptSubject = false;
  const testToggle = "attach-key";
  const expectSendEncrypted2AfterToggle = false;
  const expectSendSigned2AfterToggle = true;
  const expectAttachMyPublicPGPKey2AfterToggle = false;
  const expectEncryptSubject2AfterToggle = false;
  const switchIdentity = true;
  const expectSendEncrypted3GoneToPlainIdentity = false;
  const expectSendSigned3GoneToPlainIdentity = false;
  const expectAttachMyPublicPGPKey3GoneToPlainIdentity = false;
  const expectEncryptSubject3GoneToPlainIdentity = false;
  const expectSendEncrypted4GoneToOrigIdentity = false;
  const expectSendSigned4GoneToOrigIdentity = true;
  const expectAttachMyPublicPGPKey4GoneToOrigIdentity = false;
  const expectEncryptSubject4GoneToOrigIdentity = false;

  await testComposeFlags(
    prefEncryptionPolicy,
    prefSignMail,
    prefAttachPgpKey,
    prefProtectSubject,
    expectSendEncrypted,
    expectSendSigned,
    expectAttachMyPublicPGPKey,
    expectEncryptSubject,
    testToggle,
    expectSendEncrypted2AfterToggle,
    expectSendSigned2AfterToggle,
    expectAttachMyPublicPGPKey2AfterToggle,
    expectEncryptSubject2AfterToggle,
    switchIdentity,
    expectSendEncrypted3GoneToPlainIdentity,
    expectSendSigned3GoneToPlainIdentity,
    expectAttachMyPublicPGPKey3GoneToPlainIdentity,
    expectEncryptSubject3GoneToPlainIdentity,
    expectSendEncrypted4GoneToOrigIdentity,
    expectSendSigned4GoneToOrigIdentity,
    expectAttachMyPublicPGPKey4GoneToOrigIdentity,
    expectEncryptSubject4GoneToOrigIdentity
  );
});

add_task(async function testMsgComp3() {
  const prefEncryptionPolicy = 2; // default encryption: on (require)
  const prefSignMail = false; // sign unencrypted messages: off
  const prefAttachPgpKey = true; // attach key to signed messages: on
  const prefProtectSubject = true; // encrypt subject of encrypted message: on

  const expectSendEncrypted = true;
  const expectSendSigned = true;
  const expectAttachMyPublicPGPKey = true;
  const expectEncryptSubject = true;
  const testToggle = null;
  const expectSendEncrypted2AfterToggle = undefined;
  const expectSendSigned2AfterToggle = undefined;
  const expectAttachMyPublicPGPKey2AfterToggle = undefined;
  const expectEncryptSubject2AfterToggle = undefined;
  const switchIdentity = true;
  const expectSendEncrypted3GoneToPlainIdentity = true;
  const expectSendSigned3GoneToPlainIdentity = false;
  const expectAttachMyPublicPGPKey3GoneToPlainIdentity = false;
  const expectEncryptSubject3GoneToPlainIdentity = true;
  const expectSendEncrypted4GoneToOrigIdentity = true;
  const expectSendSigned4GoneToOrigIdentity = true;
  const expectAttachMyPublicPGPKey4GoneToOrigIdentity = true;
  const expectEncryptSubject4GoneToOrigIdentity = true;

  await testComposeFlags(
    prefEncryptionPolicy,
    prefSignMail,
    prefAttachPgpKey,
    prefProtectSubject,
    expectSendEncrypted,
    expectSendSigned,
    expectAttachMyPublicPGPKey,
    expectEncryptSubject,
    testToggle,
    expectSendEncrypted2AfterToggle,
    expectSendSigned2AfterToggle,
    expectAttachMyPublicPGPKey2AfterToggle,
    expectEncryptSubject2AfterToggle,
    switchIdentity,
    expectSendEncrypted3GoneToPlainIdentity,
    expectSendSigned3GoneToPlainIdentity,
    expectAttachMyPublicPGPKey3GoneToPlainIdentity,
    expectEncryptSubject3GoneToPlainIdentity,
    expectSendEncrypted4GoneToOrigIdentity,
    expectSendSigned4GoneToOrigIdentity,
    expectAttachMyPublicPGPKey4GoneToOrigIdentity,
    expectEncryptSubject4GoneToOrigIdentity
  );
});

add_task(async function testMsgComp3b() {
  const prefEncryptionPolicy = 2; // default encryption: on (require)
  const prefSignMail = false; // sign unencrypted messages: off
  const prefAttachPgpKey = true; // attach key to signed messages: on
  const prefProtectSubject = true; // encrypt subject of encrypted message: on

  const expectSendEncrypted = true;
  const expectSendSigned = true;
  const expectAttachMyPublicPGPKey = true;
  const expectEncryptSubject = true;
  const testToggle = "encrypt-subject";
  const expectSendEncrypted2AfterToggle = true;
  const expectSendSigned2AfterToggle = true;
  const expectAttachMyPublicPGPKey2AfterToggle = true;
  const expectEncryptSubject2AfterToggle = false;
  const switchIdentity = true;
  const expectSendEncrypted3GoneToPlainIdentity = true;
  const expectSendSigned3GoneToPlainIdentity = false;
  const expectAttachMyPublicPGPKey3GoneToPlainIdentity = false;
  const expectEncryptSubject3GoneToPlainIdentity = false;
  const expectSendEncrypted4GoneToOrigIdentity = true;
  const expectSendSigned4GoneToOrigIdentity = true;
  const expectAttachMyPublicPGPKey4GoneToOrigIdentity = true;
  const expectEncryptSubject4GoneToOrigIdentity = false;

  await testComposeFlags(
    prefEncryptionPolicy,
    prefSignMail,
    prefAttachPgpKey,
    prefProtectSubject,
    expectSendEncrypted,
    expectSendSigned,
    expectAttachMyPublicPGPKey,
    expectEncryptSubject,
    testToggle,
    expectSendEncrypted2AfterToggle,
    expectSendSigned2AfterToggle,
    expectAttachMyPublicPGPKey2AfterToggle,
    expectEncryptSubject2AfterToggle,
    switchIdentity,
    expectSendEncrypted3GoneToPlainIdentity,
    expectSendSigned3GoneToPlainIdentity,
    expectAttachMyPublicPGPKey3GoneToPlainIdentity,
    expectEncryptSubject3GoneToPlainIdentity,
    expectSendEncrypted4GoneToOrigIdentity,
    expectSendSigned4GoneToOrigIdentity,
    expectAttachMyPublicPGPKey4GoneToOrigIdentity,
    expectEncryptSubject4GoneToOrigIdentity
  );
});

add_task(async function testMsgComp4() {
  const prefEncryptionPolicy = 2; // default encryption: on (require)
  const prefSignMail = true; // sign unencrypted messages: on
  const prefAttachPgpKey = true; // attach key to signed messages: on
  const prefProtectSubject = true; // encrypt subject of encrypted message: on

  const expectSendEncrypted = true;
  const expectSendSigned = true;
  const expectAttachMyPublicPGPKey = true;
  const expectEncryptSubject = true;
  const testToggle = null;
  const expectSendEncrypted2AfterToggle = undefined;
  const expectSendSigned2AfterToggle = undefined;
  const expectAttachMyPublicPGPKey2AfterToggle = undefined;
  const expectEncryptSubject2AfterToggle = undefined;
  const switchIdentity = true;
  const expectSendEncrypted3GoneToPlainIdentity = true;
  const expectSendSigned3GoneToPlainIdentity = false;
  const expectAttachMyPublicPGPKey3GoneToPlainIdentity = false;
  const expectEncryptSubject3GoneToPlainIdentity = true;
  const expectSendEncrypted4GoneToOrigIdentity = true;
  const expectSendSigned4GoneToOrigIdentity = true;
  const expectAttachMyPublicPGPKey4GoneToOrigIdentity = true;
  const expectEncryptSubject4GoneToOrigIdentity = true;

  await testComposeFlags(
    prefEncryptionPolicy,
    prefSignMail,
    prefAttachPgpKey,
    prefProtectSubject,
    expectSendEncrypted,
    expectSendSigned,
    expectAttachMyPublicPGPKey,
    expectEncryptSubject,
    testToggle,
    expectSendEncrypted2AfterToggle,
    expectSendSigned2AfterToggle,
    expectAttachMyPublicPGPKey2AfterToggle,
    expectEncryptSubject2AfterToggle,
    switchIdentity,
    expectSendEncrypted3GoneToPlainIdentity,
    expectSendSigned3GoneToPlainIdentity,
    expectAttachMyPublicPGPKey3GoneToPlainIdentity,
    expectEncryptSubject3GoneToPlainIdentity,
    expectSendEncrypted4GoneToOrigIdentity,
    expectSendSigned4GoneToOrigIdentity,
    expectAttachMyPublicPGPKey4GoneToOrigIdentity,
    expectEncryptSubject4GoneToOrigIdentity
  );
});

add_task(async function testMsgComp4b() {
  const prefEncryptionPolicy = 2; // default encryption: on (require)
  const prefSignMail = true; // sign unencrypted messages: on
  const prefAttachPgpKey = true; // attach key to signed messages: on
  const prefProtectSubject = true; // encrypt subject of encrypted message: on

  const expectSendEncrypted = true;
  const expectSendSigned = true;
  const expectAttachMyPublicPGPKey = true;
  const expectEncryptSubject = true;
  const testToggle = "attach-key";
  const expectSendEncrypted2AfterToggle = true;
  const expectSendSigned2AfterToggle = true;
  const expectAttachMyPublicPGPKey2AfterToggle = false;
  const expectEncryptSubject2AfterToggle = true;
  const switchIdentity = true;
  const expectSendEncrypted3GoneToPlainIdentity = true;
  const expectSendSigned3GoneToPlainIdentity = false;
  const expectAttachMyPublicPGPKey3GoneToPlainIdentity = false;
  const expectEncryptSubject3GoneToPlainIdentity = true;
  const expectSendEncrypted4GoneToOrigIdentity = true;
  const expectSendSigned4GoneToOrigIdentity = true;
  const expectAttachMyPublicPGPKey4GoneToOrigIdentity = false;
  const expectEncryptSubject4GoneToOrigIdentity = true;

  await testComposeFlags(
    prefEncryptionPolicy,
    prefSignMail,
    prefAttachPgpKey,
    prefProtectSubject,
    expectSendEncrypted,
    expectSendSigned,
    expectAttachMyPublicPGPKey,
    expectEncryptSubject,
    testToggle,
    expectSendEncrypted2AfterToggle,
    expectSendSigned2AfterToggle,
    expectAttachMyPublicPGPKey2AfterToggle,
    expectEncryptSubject2AfterToggle,
    switchIdentity,
    expectSendEncrypted3GoneToPlainIdentity,
    expectSendSigned3GoneToPlainIdentity,
    expectAttachMyPublicPGPKey3GoneToPlainIdentity,
    expectEncryptSubject3GoneToPlainIdentity,
    expectSendEncrypted4GoneToOrigIdentity,
    expectSendSigned4GoneToOrigIdentity,
    expectAttachMyPublicPGPKey4GoneToOrigIdentity,
    expectEncryptSubject4GoneToOrigIdentity
  );
});

add_task(async function testMsgComp5() {
  const prefEncryptionPolicy = 2; // default encryption: on (require)
  const prefSignMail = false; // sign unencrypted messages: off
  const prefAttachPgpKey = false; // attach key to signed messages: off
  const prefProtectSubject = false; // encrypt subject of encrypted message: off

  const expectSendEncrypted = true;
  const expectSendSigned = true;
  const expectAttachMyPublicPGPKey = false;
  const expectEncryptSubject = false;
  const testToggle = null;
  const expectSendEncrypted2AfterToggle = undefined;
  const expectSendSigned2AfterToggle = undefined;
  const expectAttachMyPublicPGPKey2AfterToggle = undefined;
  const expectEncryptSubject2AfterToggle = undefined;
  const switchIdentity = true;
  const expectSendEncrypted3GoneToPlainIdentity = true;
  const expectSendSigned3GoneToPlainIdentity = false;
  const expectAttachMyPublicPGPKey3GoneToPlainIdentity = false;
  const expectEncryptSubject3GoneToPlainIdentity = true;
  const expectSendEncrypted4GoneToOrigIdentity = true;
  const expectSendSigned4GoneToOrigIdentity = true;
  const expectAttachMyPublicPGPKey4GoneToOrigIdentity = false;
  const expectEncryptSubject4GoneToOrigIdentity = false;

  await testComposeFlags(
    prefEncryptionPolicy,
    prefSignMail,
    prefAttachPgpKey,
    prefProtectSubject,
    expectSendEncrypted,
    expectSendSigned,
    expectAttachMyPublicPGPKey,
    expectEncryptSubject,
    testToggle,
    expectSendEncrypted2AfterToggle,
    expectSendSigned2AfterToggle,
    expectAttachMyPublicPGPKey2AfterToggle,
    expectEncryptSubject2AfterToggle,
    switchIdentity,
    expectSendEncrypted3GoneToPlainIdentity,
    expectSendSigned3GoneToPlainIdentity,
    expectAttachMyPublicPGPKey3GoneToPlainIdentity,
    expectEncryptSubject3GoneToPlainIdentity,
    expectSendEncrypted4GoneToOrigIdentity,
    expectSendSigned4GoneToOrigIdentity,
    expectAttachMyPublicPGPKey4GoneToOrigIdentity,
    expectEncryptSubject4GoneToOrigIdentity
  );
});

add_task(async function testMsgComp6() {
  const prefEncryptionPolicy = 0; // default encryption: off
  const prefSignMail = false; // sign unencrypted messages: off
  const prefAttachPgpKey = true; // attach key to signed messages: on
  const prefProtectSubject = true; // encrypt subject of encrypted message: on

  const expectSendEncrypted = false;
  const expectSendSigned = false;
  const expectAttachMyPublicPGPKey = false;
  const expectEncryptSubject = false;
  const testToggle = "encrypt";
  const expectSendEncrypted2AfterToggle = true;
  const expectSendSigned2AfterToggle = true;
  const expectAttachMyPublicPGPKey2AfterToggle = true;
  const expectEncryptSubject2AfterToggle = true;
  const switchIdentity = true;
  const expectSendEncrypted3GoneToPlainIdentity = true;
  const expectSendSigned3GoneToPlainIdentity = false;
  const expectAttachMyPublicPGPKey3GoneToPlainIdentity = false;
  const expectEncryptSubject3GoneToPlainIdentity = true;
  const expectSendEncrypted4GoneToOrigIdentity = true;
  const expectSendSigned4GoneToOrigIdentity = true;
  const expectAttachMyPublicPGPKey4GoneToOrigIdentity = true;
  const expectEncryptSubject4GoneToOrigIdentity = true;

  await testComposeFlags(
    prefEncryptionPolicy,
    prefSignMail,
    prefAttachPgpKey,
    prefProtectSubject,
    expectSendEncrypted,
    expectSendSigned,
    expectAttachMyPublicPGPKey,
    expectEncryptSubject,
    testToggle,
    expectSendEncrypted2AfterToggle,
    expectSendSigned2AfterToggle,
    expectAttachMyPublicPGPKey2AfterToggle,
    expectEncryptSubject2AfterToggle,
    switchIdentity,
    expectSendEncrypted3GoneToPlainIdentity,
    expectSendSigned3GoneToPlainIdentity,
    expectAttachMyPublicPGPKey3GoneToPlainIdentity,
    expectEncryptSubject3GoneToPlainIdentity,
    expectSendEncrypted4GoneToOrigIdentity,
    expectSendSigned4GoneToOrigIdentity,
    expectAttachMyPublicPGPKey4GoneToOrigIdentity,
    expectEncryptSubject4GoneToOrigIdentity
  );
});

add_task(async function testMsgComp7() {
  const prefEncryptionPolicy = 0; // default encryption: off
  const prefSignMail = true; // sign unencrypted messages: on
  const prefAttachPgpKey = false; // attach key to signed messages: off
  const prefProtectSubject = false; // encrypt subject of encrypted message: off

  const expectSendEncrypted = false;
  const expectSendSigned = true;
  const expectAttachMyPublicPGPKey = false;
  const expectEncryptSubject = false;
  const testToggle = "encrypt";
  const expectSendEncrypted2AfterToggle = true;
  const expectSendSigned2AfterToggle = true;
  const expectAttachMyPublicPGPKey2AfterToggle = false;
  const expectEncryptSubject2AfterToggle = false;
  const switchIdentity = true;
  const expectSendEncrypted3GoneToPlainIdentity = true;
  const expectSendSigned3GoneToPlainIdentity = false;
  const expectAttachMyPublicPGPKey3GoneToPlainIdentity = false;
  const expectEncryptSubject3GoneToPlainIdentity = true;
  const expectSendEncrypted4GoneToOrigIdentity = true;
  const expectSendSigned4GoneToOrigIdentity = true;
  const expectAttachMyPublicPGPKey4GoneToOrigIdentity = false;
  const expectEncryptSubject4GoneToOrigIdentity = false;

  await testComposeFlags(
    prefEncryptionPolicy,
    prefSignMail,
    prefAttachPgpKey,
    prefProtectSubject,
    expectSendEncrypted,
    expectSendSigned,
    expectAttachMyPublicPGPKey,
    expectEncryptSubject,
    testToggle,
    expectSendEncrypted2AfterToggle,
    expectSendSigned2AfterToggle,
    expectAttachMyPublicPGPKey2AfterToggle,
    expectEncryptSubject2AfterToggle,
    switchIdentity,
    expectSendEncrypted3GoneToPlainIdentity,
    expectSendSigned3GoneToPlainIdentity,
    expectAttachMyPublicPGPKey3GoneToPlainIdentity,
    expectEncryptSubject3GoneToPlainIdentity,
    expectSendEncrypted4GoneToOrigIdentity,
    expectSendSigned4GoneToOrigIdentity,
    expectAttachMyPublicPGPKey4GoneToOrigIdentity,
    expectEncryptSubject4GoneToOrigIdentity
  );
});

registerCleanupFunction(function tearDown() {
  MailServices.accounts.removeIncomingServer(bobAcct.incomingServer, true);
  MailServices.accounts.removeAccount(bobAcct, true);
});
