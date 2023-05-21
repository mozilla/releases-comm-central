/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for OpenPGP encrypted message composition.
 */

"use strict";

const {
  open_message_from_file,
  be_in_folder,
  get_special_folder,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
const { open_compose_new_mail, setup_msg_contents } = ChromeUtils.import(
  "resource://testing-common/mozmill/ComposeHelpers.jsm"
);
const { click_menus_in_sequence, close_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);
const { OpenPGPTestUtils } = ChromeUtils.import(
  "resource://testing-common/mozmill/OpenPGPTestUtils.jsm"
);

const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

let bobAcct;
let bobIdentity;
let plainIdentity;
let gOutbox;

// Used in some of the tests to verify key status display.
let l10n = new Localization(["messenger/openpgp/composeKeyStatus.ftl"]);

/**
 * Closes a window with a <dialog> element by calling the acceptDialog().
 *
 * @param {Window} win
 */
async function closeDialog(win) {
  let closed = BrowserTestUtils.domWindowClosed(win);
  win.document.documentElement.querySelector("dialog").acceptDialog();
  await closed;
}

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

  let [id] = await OpenPGPTestUtils.importPrivateKey(
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

  gOutbox = await get_special_folder(Ci.nsMsgFolderFlags.Queue);
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

  let cwc = open_compose_new_mail();
  let composeWin = cwc.window;

  // setup_msg_contents will trigger checkEncryptionState.
  let checkDonePromise = waitCheckEncryptionStateDone(composeWin);
  setup_msg_contents(
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
      cwc.window.document.getElementById("msgIdentity"),
      {},
      cwc.window.document.getElementById("msgIdentity").ownerGlobal
    );
    await click_menus_in_sequence(
      cwc.window.document.getElementById("msgIdentityPopup"),
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
      cwc.window.document.getElementById("msgIdentity"),
      {},
      cwc.window.document.getElementById("msgIdentity").ownerGlobal
    );
    await click_menus_in_sequence(
      cwc.window.document.getElementById("msgIdentityPopup"),
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
  let prefEncryptionPolicy = 0; // default encryption: off
  let prefSignMail = false; // sign unencrypted messages: off
  let prefAttachPgpKey = true; // attach key to signed messages: on
  let prefProtectSubject = true; // encrypt subject of encrypted message: on

  let expectSendEncrypted = false;
  let expectSendSigned = false;
  let expectAttachMyPublicPGPKey = false;
  let expectEncryptSubject = false;
  let testToggle = null;
  let expectSendEncrypted2AfterToggle = undefined;
  let expectSendSigned2AfterToggle = undefined;
  let expectAttachMyPublicPGPKey2AfterToggle = undefined;
  let expectEncryptSubject2AfterToggle = undefined;
  let switchIdentity = true;
  let expectSendEncrypted3GoneToPlainIdentity = false;
  let expectSendSigned3GoneToPlainIdentity = false;
  let expectAttachMyPublicPGPKey3GoneToPlainIdentity = false;
  let expectEncryptSubject3GoneToPlainIdentity = false;
  let expectSendEncrypted4GoneToOrigIdentity = false;
  let expectSendSigned4GoneToOrigIdentity = false;
  let expectAttachMyPublicPGPKey4GoneToOrigIdentity = false;
  let expectEncryptSubject4GoneToOrigIdentity = false;

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
  let prefEncryptionPolicy = 0; // default encryption: off
  let prefSignMail = false; // sign unencrypted messages: off
  let prefAttachPgpKey = true; // attach key to signed messages: on
  let prefProtectSubject = true; // encrypt subject of encrypted message: on

  let expectSendEncrypted = false;
  let expectSendSigned = false;
  let expectAttachMyPublicPGPKey = false;
  let expectEncryptSubject = false;
  let testToggle = "sign";
  let expectSendEncrypted2AfterToggle = false;
  let expectSendSigned2AfterToggle = true;
  let expectAttachMyPublicPGPKey2AfterToggle = true;
  let expectEncryptSubject2AfterToggle = false;
  let switchIdentity = true;
  let expectSendEncrypted3GoneToPlainIdentity = false;
  let expectSendSigned3GoneToPlainIdentity = false;
  let expectAttachMyPublicPGPKey3GoneToPlainIdentity = false;
  let expectEncryptSubject3GoneToPlainIdentity = false;
  let expectSendEncrypted4GoneToOrigIdentity = false;
  let expectSendSigned4GoneToOrigIdentity = false;
  let expectAttachMyPublicPGPKey4GoneToOrigIdentity = false;
  let expectEncryptSubject4GoneToOrigIdentity = false;

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
  let prefEncryptionPolicy = 0; // default encryption: off
  let prefSignMail = true; // sign unencrypted messages: on
  let prefAttachPgpKey = true; // attach key to signed messages: on
  let prefProtectSubject = true; // encrypt subject of encrypted message: on

  let expectSendEncrypted = false;
  let expectSendSigned = true;
  let expectAttachMyPublicPGPKey = true;
  let expectEncryptSubject = false;
  let testToggle = null;
  let expectSendEncrypted2AfterToggle = undefined;
  let expectSendSigned2AfterToggle = undefined;
  let expectAttachMyPublicPGPKey2AfterToggle = undefined;
  let expectEncryptSubject2AfterToggle = undefined;
  let switchIdentity = true;
  let expectSendEncrypted3GoneToPlainIdentity = false;
  let expectSendSigned3GoneToPlainIdentity = false;
  let expectAttachMyPublicPGPKey3GoneToPlainIdentity = false;
  let expectEncryptSubject3GoneToPlainIdentity = false;
  let expectSendEncrypted4GoneToOrigIdentity = false;
  let expectSendSigned4GoneToOrigIdentity = true;
  let expectAttachMyPublicPGPKey4GoneToOrigIdentity = true;
  let expectEncryptSubject4GoneToOrigIdentity = false;

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
  let prefEncryptionPolicy = 0; // default encryption: off
  let prefSignMail = true; // sign unencrypted messages: on
  let prefAttachPgpKey = true; // attach key to signed messages: on
  let prefProtectSubject = true; // encrypt subject of encrypted message: on

  let expectSendEncrypted = false;
  let expectSendSigned = true;
  let expectAttachMyPublicPGPKey = true;
  let expectEncryptSubject = false;
  let testToggle = "attach-key";
  let expectSendEncrypted2AfterToggle = false;
  let expectSendSigned2AfterToggle = true;
  let expectAttachMyPublicPGPKey2AfterToggle = false;
  let expectEncryptSubject2AfterToggle = false;
  let switchIdentity = true;
  let expectSendEncrypted3GoneToPlainIdentity = false;
  let expectSendSigned3GoneToPlainIdentity = false;
  let expectAttachMyPublicPGPKey3GoneToPlainIdentity = false;
  let expectEncryptSubject3GoneToPlainIdentity = false;
  let expectSendEncrypted4GoneToOrigIdentity = false;
  let expectSendSigned4GoneToOrigIdentity = true;
  let expectAttachMyPublicPGPKey4GoneToOrigIdentity = false;
  let expectEncryptSubject4GoneToOrigIdentity = false;

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
  let prefEncryptionPolicy = 2; // default encryption: on (require)
  let prefSignMail = false; // sign unencrypted messages: off
  let prefAttachPgpKey = true; // attach key to signed messages: on
  let prefProtectSubject = true; // encrypt subject of encrypted message: on

  let expectSendEncrypted = true;
  let expectSendSigned = true;
  let expectAttachMyPublicPGPKey = true;
  let expectEncryptSubject = true;
  let testToggle = null;
  let expectSendEncrypted2AfterToggle = undefined;
  let expectSendSigned2AfterToggle = undefined;
  let expectAttachMyPublicPGPKey2AfterToggle = undefined;
  let expectEncryptSubject2AfterToggle = undefined;
  let switchIdentity = true;
  let expectSendEncrypted3GoneToPlainIdentity = true;
  let expectSendSigned3GoneToPlainIdentity = false;
  let expectAttachMyPublicPGPKey3GoneToPlainIdentity = false;
  let expectEncryptSubject3GoneToPlainIdentity = true;
  let expectSendEncrypted4GoneToOrigIdentity = true;
  let expectSendSigned4GoneToOrigIdentity = true;
  let expectAttachMyPublicPGPKey4GoneToOrigIdentity = true;
  let expectEncryptSubject4GoneToOrigIdentity = true;

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
  let prefEncryptionPolicy = 2; // default encryption: on (require)
  let prefSignMail = false; // sign unencrypted messages: off
  let prefAttachPgpKey = true; // attach key to signed messages: on
  let prefProtectSubject = true; // encrypt subject of encrypted message: on

  let expectSendEncrypted = true;
  let expectSendSigned = true;
  let expectAttachMyPublicPGPKey = true;
  let expectEncryptSubject = true;
  let testToggle = "encrypt-subject";
  let expectSendEncrypted2AfterToggle = true;
  let expectSendSigned2AfterToggle = true;
  let expectAttachMyPublicPGPKey2AfterToggle = true;
  let expectEncryptSubject2AfterToggle = false;
  let switchIdentity = true;
  let expectSendEncrypted3GoneToPlainIdentity = true;
  let expectSendSigned3GoneToPlainIdentity = false;
  let expectAttachMyPublicPGPKey3GoneToPlainIdentity = false;
  let expectEncryptSubject3GoneToPlainIdentity = false;
  let expectSendEncrypted4GoneToOrigIdentity = true;
  let expectSendSigned4GoneToOrigIdentity = true;
  let expectAttachMyPublicPGPKey4GoneToOrigIdentity = true;
  let expectEncryptSubject4GoneToOrigIdentity = false;

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
  let prefEncryptionPolicy = 2; // default encryption: on (require)
  let prefSignMail = true; // sign unencrypted messages: on
  let prefAttachPgpKey = true; // attach key to signed messages: on
  let prefProtectSubject = true; // encrypt subject of encrypted message: on

  let expectSendEncrypted = true;
  let expectSendSigned = true;
  let expectAttachMyPublicPGPKey = true;
  let expectEncryptSubject = true;
  let testToggle = null;
  let expectSendEncrypted2AfterToggle = undefined;
  let expectSendSigned2AfterToggle = undefined;
  let expectAttachMyPublicPGPKey2AfterToggle = undefined;
  let expectEncryptSubject2AfterToggle = undefined;
  let switchIdentity = true;
  let expectSendEncrypted3GoneToPlainIdentity = true;
  let expectSendSigned3GoneToPlainIdentity = false;
  let expectAttachMyPublicPGPKey3GoneToPlainIdentity = false;
  let expectEncryptSubject3GoneToPlainIdentity = true;
  let expectSendEncrypted4GoneToOrigIdentity = true;
  let expectSendSigned4GoneToOrigIdentity = true;
  let expectAttachMyPublicPGPKey4GoneToOrigIdentity = true;
  let expectEncryptSubject4GoneToOrigIdentity = true;

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
  let prefEncryptionPolicy = 2; // default encryption: on (require)
  let prefSignMail = true; // sign unencrypted messages: on
  let prefAttachPgpKey = true; // attach key to signed messages: on
  let prefProtectSubject = true; // encrypt subject of encrypted message: on

  let expectSendEncrypted = true;
  let expectSendSigned = true;
  let expectAttachMyPublicPGPKey = true;
  let expectEncryptSubject = true;
  let testToggle = "attach-key";
  let expectSendEncrypted2AfterToggle = true;
  let expectSendSigned2AfterToggle = true;
  let expectAttachMyPublicPGPKey2AfterToggle = false;
  let expectEncryptSubject2AfterToggle = true;
  let switchIdentity = true;
  let expectSendEncrypted3GoneToPlainIdentity = true;
  let expectSendSigned3GoneToPlainIdentity = false;
  let expectAttachMyPublicPGPKey3GoneToPlainIdentity = false;
  let expectEncryptSubject3GoneToPlainIdentity = true;
  let expectSendEncrypted4GoneToOrigIdentity = true;
  let expectSendSigned4GoneToOrigIdentity = true;
  let expectAttachMyPublicPGPKey4GoneToOrigIdentity = false;
  let expectEncryptSubject4GoneToOrigIdentity = true;

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
  let prefEncryptionPolicy = 2; // default encryption: on (require)
  let prefSignMail = false; // sign unencrypted messages: off
  let prefAttachPgpKey = false; // attach key to signed messages: off
  let prefProtectSubject = false; // encrypt subject of encrypted message: off

  let expectSendEncrypted = true;
  let expectSendSigned = true;
  let expectAttachMyPublicPGPKey = false;
  let expectEncryptSubject = false;
  let testToggle = null;
  let expectSendEncrypted2AfterToggle = undefined;
  let expectSendSigned2AfterToggle = undefined;
  let expectAttachMyPublicPGPKey2AfterToggle = undefined;
  let expectEncryptSubject2AfterToggle = undefined;
  let switchIdentity = true;
  let expectSendEncrypted3GoneToPlainIdentity = true;
  let expectSendSigned3GoneToPlainIdentity = false;
  let expectAttachMyPublicPGPKey3GoneToPlainIdentity = false;
  let expectEncryptSubject3GoneToPlainIdentity = true;
  let expectSendEncrypted4GoneToOrigIdentity = true;
  let expectSendSigned4GoneToOrigIdentity = true;
  let expectAttachMyPublicPGPKey4GoneToOrigIdentity = false;
  let expectEncryptSubject4GoneToOrigIdentity = false;

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
  let prefEncryptionPolicy = 0; // default encryption: off
  let prefSignMail = false; // sign unencrypted messages: off
  let prefAttachPgpKey = true; // attach key to signed messages: on
  let prefProtectSubject = true; // encrypt subject of encrypted message: on

  let expectSendEncrypted = false;
  let expectSendSigned = false;
  let expectAttachMyPublicPGPKey = false;
  let expectEncryptSubject = false;
  let testToggle = "encrypt";
  let expectSendEncrypted2AfterToggle = true;
  let expectSendSigned2AfterToggle = true;
  let expectAttachMyPublicPGPKey2AfterToggle = true;
  let expectEncryptSubject2AfterToggle = true;
  let switchIdentity = true;
  let expectSendEncrypted3GoneToPlainIdentity = true;
  let expectSendSigned3GoneToPlainIdentity = false;
  let expectAttachMyPublicPGPKey3GoneToPlainIdentity = false;
  let expectEncryptSubject3GoneToPlainIdentity = true;
  let expectSendEncrypted4GoneToOrigIdentity = true;
  let expectSendSigned4GoneToOrigIdentity = true;
  let expectAttachMyPublicPGPKey4GoneToOrigIdentity = true;
  let expectEncryptSubject4GoneToOrigIdentity = true;

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
  let prefEncryptionPolicy = 0; // default encryption: off
  let prefSignMail = true; // sign unencrypted messages: on
  let prefAttachPgpKey = false; // attach key to signed messages: off
  let prefProtectSubject = false; // encrypt subject of encrypted message: off

  let expectSendEncrypted = false;
  let expectSendSigned = true;
  let expectAttachMyPublicPGPKey = false;
  let expectEncryptSubject = false;
  let testToggle = "encrypt";
  let expectSendEncrypted2AfterToggle = true;
  let expectSendSigned2AfterToggle = true;
  let expectAttachMyPublicPGPKey2AfterToggle = false;
  let expectEncryptSubject2AfterToggle = false;
  let switchIdentity = true;
  let expectSendEncrypted3GoneToPlainIdentity = true;
  let expectSendSigned3GoneToPlainIdentity = false;
  let expectAttachMyPublicPGPKey3GoneToPlainIdentity = false;
  let expectEncryptSubject3GoneToPlainIdentity = true;
  let expectSendEncrypted4GoneToOrigIdentity = true;
  let expectSendSigned4GoneToOrigIdentity = true;
  let expectAttachMyPublicPGPKey4GoneToOrigIdentity = false;
  let expectEncryptSubject4GoneToOrigIdentity = false;

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
