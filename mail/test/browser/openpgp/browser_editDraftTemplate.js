/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Tests that drafts and templates get the appropriate security properties
 * when opened.
 */

var { open_compose_new_mail, setup_msg_contents } = ChromeUtils.import(
  "resource://testing-common/mozmill/ComposeHelpers.jsm"
);

var { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);

var {
  be_in_folder,
  get_special_folder,
  mc,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { OpenPGPTestUtils } = ChromeUtils.import(
  "resource://testing-common/mozmill/OpenPGPTestUtils.jsm"
);
var { FileUtils } = ChromeUtils.import("resource://gre/modules/FileUtils.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

let aliceAcct;
let aliceIdentity;
let draftsFolder;
let templatesFolder;

/**
 * Helper funtion to wait for a compose window to get opened.
 *
 * @return The opened window.
 */
async function waitForComposeWindow() {
  return BrowserTestUtils.domWindowOpened(null, async win => {
    await BrowserTestUtils.waitForEvent(win, "load");
    return (
      win.document.documentURI ===
      "chrome://messenger/content/messengercompose/messengercompose.xhtml"
    );
  });
}

function clearFolder(folder) {
  return new Promise(resolve => {
    let msgs = [...folder.msgDatabase.EnumerateMessages()];

    folder.deleteMessages(
      msgs,
      null,
      true,
      false,
      { OnStopCopy: resolve },
      false
    );
  });
}

add_task(async function setUp() {
  aliceAcct = MailServices.accounts.createAccount();
  aliceAcct.incomingServer = MailServices.accounts.createIncomingServer(
    "alice",
    "openpgp.example",
    "pop3"
  );
  aliceIdentity = MailServices.accounts.createIdentity();
  aliceIdentity.email = "alice@openpgp.example";
  aliceAcct.addIdentity(aliceIdentity);

  let [id] = await OpenPGPTestUtils.importPrivateKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "data/keys/alice@openpgp.example-0xf231550c4f47e38e-secret.asc"
      )
    )
  );

  Assert.ok(id, "private key imported");

  aliceIdentity.setUnicharAttribute("openpgp_key_id", id.split("0x").join(""));

  draftsFolder = get_special_folder(
    Ci.nsMsgFolderFlags.Drafts,
    true,
    aliceAcct.incomingServer.localFoldersServer
  );

  templatesFolder = get_special_folder(
    Ci.nsMsgFolderFlags.Templates,
    true,
    aliceAcct.incomingServer.localFoldersServer
  );
});

/**
 * Create draft, make sure the sec properties are as they should after
 * opening.
 */
add_task(async function testDraftSec() {
  be_in_folder(draftsFolder);
  await doTestSecState(true, false); // draft, not secure
  await doTestSecState(true, true); // draft, secure
});

/**
 * Create template, make sure the sec properties are as they should after
 * opening.
 */
add_task(async function testTemplSec() {
  be_in_folder(templatesFolder);
  await doTestSecState(true, false); // template, not secure
  await doTestSecState(true, true); // template, secure
});

/**
 * Drafts/templates are stored encrypted before sent. Test that when composing
 * and the reopening, the correct encryption states get set.
 */
async function doTestSecState(isDraft, secure) {
  // Make sure to compose from alice.
  let inbox = aliceAcct.incomingServer.rootFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Inbox
  );
  be_in_folder(inbox);

  let cwc = open_compose_new_mail();
  let type = isDraft ? "draft" : "template";
  let theFolder = isDraft ? draftsFolder : templatesFolder;
  setup_msg_contents(
    cwc,
    "test@example.invalid",
    `test ${type}; secure=${secure}`,
    `This is a ${type}; secure=${secure}`
  );
  info(`Testing ${type}; secure=${secure}`);

  if (secure) {
    // Tick "Require encryption".
    // Encryption and signing should get turned on.
    await OpenPGPTestUtils.toggleMessageEncryption(cwc.window);
    Assert.ok(
      cwc.window.document.querySelector("#signing-status.signing-msg"),
      "should be signed"
    );
    Assert.ok(
      cwc.window.document.querySelector("#encryption-status.encrypting-msg"),
      "should be encrypted"
    );
  }

  if (isDraft) {
    cwc.window.SaveAsDraft();
  } else {
    cwc.window.SaveAsTemplate();
  }

  await TestUtils.waitForCondition(
    () => !cwc.window.gSaveOperationInProgress && !cwc.window.gWindowLock,
    "timeout wating for saving to finish."
  );

  info(`Saved as ${type} with secure=${secure}`);
  cwc.window.close();

  be_in_folder(theFolder);
  select_click_row(0);

  info(`Will double click to open the ${type}`);
  let draftWindowPromise = waitForComposeWindow();
  let threadTree = mc.window.document.getElementById("threadTree");
  mailTestUtils.treeClick(EventUtils, mc.window, threadTree, 0, 4, {
    clickCount: 2,
  });

  // The double click on col 4 (the subject) should bring up compose window
  // for editing this draft.

  let draftWindow = await draftWindowPromise;

  info(`Checking security props in the UI...`);

  // @see setEncSigStatusUI()
  if (!secure) {
    // Wait some to make sure it won't (soon) be showing.
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(resolve => setTimeout(resolve, 100));
    Assert.ok(
      !draftWindow.document.querySelector("#signing-status.signing-msg"),
      "should not use signing"
    );
    Assert.ok(
      !draftWindow.document.querySelector("#encryption-status.encrypting-msg"),
      "should not use encryption"
    );
  } else {
    await TestUtils.waitForCondition(
      () => draftWindow.document.querySelector("#signing-status.signing-msg"),
      "waited for signing to get turned on"
    );

    await TestUtils.waitForCondition(
      () =>
        draftWindow.document.querySelector("#encryption-status.encrypting-msg"),
      "waited for encryption to get turned on"
    );
  }
  draftWindow.close();
  clearFolder(theFolder);
}

registerCleanupFunction(async function() {
  MailServices.accounts.removeAccount(aliceAcct, true);
  await OpenPGPTestUtils.removeKeyById("0xf231550c4f47e38e", true);
});
