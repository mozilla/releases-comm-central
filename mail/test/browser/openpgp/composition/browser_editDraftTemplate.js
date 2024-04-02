/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Tests that drafts and templates get the appropriate security properties
 * when opened.
 */

var { open_compose_new_mail, setup_msg_contents } = ChromeUtils.importESModule(
  "resource://testing-common/mail/ComposeHelpers.sys.mjs"
);

var {
  be_in_folder,
  get_about_3pane,
  get_special_folder,
  right_click_on_row,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mail/OpenPGPTestUtils.sys.mjs"
);

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

let aliceAcct;
let aliceIdentity;
let draftsFolder;
let templatesFolder;

/**
 * Helper function to wait for a compose window to get opened.
 *
 * @returns The opened window.
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
    const msgs = [...folder.msgDatabase.enumerateMessages()];

    folder.deleteMessages(
      msgs,
      null,
      true,
      false,
      { onStopCopy: resolve },
      false
    );
  });
}

add_setup(async function () {
  aliceAcct = MailServices.accounts.createAccount();
  aliceAcct.incomingServer = MailServices.accounts.createIncomingServer(
    "alice",
    "openpgp.example",
    "pop3"
  );
  aliceIdentity = MailServices.accounts.createIdentity();
  aliceIdentity.email = "alice@openpgp.example";
  aliceAcct.addIdentity(aliceIdentity);

  const [id] = await OpenPGPTestUtils.importPrivateKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "../data/keys/alice@openpgp.example-0xf231550c4f47e38e-secret.asc"
      )
    )
  );

  Assert.ok(id, "private key imported");

  aliceIdentity.setUnicharAttribute("openpgp_key_id", id.split("0x").join(""));

  draftsFolder = await get_special_folder(
    Ci.nsMsgFolderFlags.Drafts,
    true,
    aliceAcct.incomingServer.localFoldersServer
  );

  templatesFolder = await get_special_folder(
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
  await be_in_folder(draftsFolder);
  await doTestSecState(true, false); // draft, not secure
  await doTestSecState(true, true); // draft, secure
});

/**
 * Create template, make sure the sec properties are as they should after
 * opening.
 */
add_task(async function testTemplSec() {
  await be_in_folder(templatesFolder);
  await doTestSecState(false, false); // template, not secure
  await doTestSecState(false, true); // template, secure
});

/**
 * Drafts/templates are stored encrypted before sent. Test that when composing
 * and the reopening, the correct encryption states get set.
 */
async function doTestSecState(isDraft, secure) {
  // Make sure to compose from alice.
  const inbox = aliceAcct.incomingServer.rootFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Inbox
  );
  await be_in_folder(inbox);

  const cwc = await open_compose_new_mail();
  const type = isDraft ? "draft" : "template";
  const theFolder = isDraft ? draftsFolder : templatesFolder;
  const subject = `test ${type}; 🤐; secure=${secure}`;
  await setup_msg_contents(
    cwc,
    "test@example.invalid",
    subject,
    `This is a ${type}; secure=${secure}`
  );
  info(`Testing ${type}; secure=${secure}`);

  if (secure) {
    // Tick "Require encryption".
    // Encryption and signing should get turned on.
    await OpenPGPTestUtils.toggleMessageEncryption(cwc);
  }

  if (isDraft) {
    cwc.SaveAsDraft();
  } else {
    cwc.SaveAsTemplate();
  }

  await TestUtils.waitForCondition(
    () => !cwc.gSaveOperationInProgress && !cwc.gWindowLock,
    "timeout waiting for saving to finish."
  );

  info(`Saved as ${type} with secure=${secure}`);
  cwc.close();

  await be_in_folder(theFolder);
  await select_click_row(0);

  info(`Will open the ${type}`);
  const draftWindowPromise = waitForComposeWindow();
  await select_click_row(0);
  await right_click_on_row(0);

  const about3Pane = get_about_3pane();
  const mailContext = about3Pane.document.getElementById("mailContext");
  if (isDraft) {
    mailContext.activateItem(
      about3Pane.document.getElementById("mailContext-editDraftMsg")
    );
  } else {
    mailContext.activateItem(
      about3Pane.document.getElementById("mailContext-newMsgFromTemplate")
    );
  }

  const draftWindow = await draftWindowPromise;

  Assert.equal(
    draftWindow.document.getElementById("msgSubject").value,
    subject,
    "subject should be decrypted"
  );

  info(`Checking security props in the UI...`);

  if (!secure) {
    // Wait some to make sure it won't (soon) be showing.
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(resolve => setTimeout(resolve, 100));
    Assert.ok(
      !draftWindow.document.getElementById("button-encryption").checked,
      "should not use encryption"
    );
  } else {
    await TestUtils.waitForCondition(
      () => draftWindow.document.getElementById("button-encryption").checked,
      "waited for encryption to get turned on"
    );
  }

  draftWindow.close();
  clearFolder(theFolder);
}

registerCleanupFunction(async function () {
  MailServices.accounts.removeAccount(aliceAcct, true);
  await OpenPGPTestUtils.removeKeyById("0xf231550c4f47e38e", true);
});
