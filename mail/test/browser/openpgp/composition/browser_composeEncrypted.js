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
const { close_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
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
let gOutbox;
let gDrafts;

// Used in some of the tests to verify key status display.
let l10n = new Localization(["messenger/openpgp/composeKeyStatus.ftl"]);

/**
 * Closes a window with a <dialog> element by calling the acceptDialog().
 * @param {Window} win
 */
async function closeDialog(win) {
  let closed = BrowserTestUtils.domWindowClosed(win);
  win.document.documentElement.querySelector("dialog").acceptDialog();
  await closed;
}

/**
 * Setup a mail account with a private key and import the public key for the
 * receiver.
 */
add_setup(async function() {
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
  gDrafts = await get_special_folder(Ci.nsMsgFolderFlags.Drafts, true);
});

/**
 * Tests composition of an encrypted only message shows as encrypted in
 * the Outbox.
 */
add_task(async function testEncryptedMessageComposition() {
  await be_in_folder(bobAcct.incomingServer.rootFolder);

  let cwc = open_compose_new_mail();
  let composeWin = cwc.window;

  setup_msg_contents(
    cwc,
    "alice@openpgp.example",
    "Compose Encrypted Message",
    "This is an encrypted message with key composition test."
  );

  await OpenPGPTestUtils.toggleMessageEncryption(composeWin);
  await OpenPGPTestUtils.toggleMessageSigning(composeWin);
  await sendMessage(composeWin);

  await be_in_folder(gOutbox);
  select_click_row(0);

  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(window.document, "ok"),
    "message should have encrypted icon"
  );

  Assert.equal(
    window.document.querySelector("#attachmentList").itemChildren.length,
    0,
    "no keys should be attached to message"
  );

  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(window.document),
    "message should have signed icon"
  );

  // Delete the message so other tests work.
  EventUtils.synthesizeKey("VK_DELETE");
});

/**
 * Tests composition of an encrypted only message, with public key attachment
 * enabled, shows as encrypted in the Outbox.
 */
add_task(async function testEncryptedMessageWithKeyComposition() {
  await be_in_folder(bobAcct.incomingServer.rootFolder);

  let cwc = open_compose_new_mail();
  let composeWin = cwc.window;

  setup_msg_contents(
    cwc,
    "alice@openpgp.example",
    "Compose Encrypted Message With Key",
    "This is an encrypted message with key composition test."
  );

  await OpenPGPTestUtils.toggleMessageEncryption(composeWin);
  await OpenPGPTestUtils.toggleMessageSigning(composeWin);
  await OpenPGPTestUtils.toggleMessageKeyAttachment(composeWin);
  await sendMessage(composeWin);

  await be_in_folder(gOutbox);
  select_click_row(0);

  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(window.document, "ok"),
    "message should have encrypted icon"
  );

  let attachmentList = window.document.querySelector("#attachmentList");

  await TestUtils.waitForCondition(
    () => attachmentList.itemChildren.length == 1,
    "message should have one attachment"
  );

  Assert.ok(
    attachmentList
      .getItemAtIndex(0)
      .attachment.name.includes(OpenPGPTestUtils.BOB_KEY_ID),
    "attachment name should contain Bob's key id"
  );

  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(window.document),
    "message should have no signed icon"
  );

  // Delete the message so other tests work.
  EventUtils.synthesizeKey("VK_DELETE");
});

/**
 * Tests composition of an encrypted message to a recipient, whom we have no
 * key for, prompts the user.
 */
add_task(
  async function testEncryptedRecipientKeyNotAvailabeMessageComposition() {
    await be_in_folder(bobAcct.incomingServer.rootFolder);

    let cwc = open_compose_new_mail();
    let composeWin = cwc.window;

    setup_msg_contents(
      cwc,
      "carol@example.com",
      "Compose Encrypted Recipient Key Not Available Message",
      "This is an encrypted recipient key not available message composition test."
    );

    await OpenPGPTestUtils.toggleMessageEncryption(composeWin);

    let kaShown = BrowserTestUtils.waitForCondition(
      () => composeWin.document.getElementById("keyAssistant").open,
      "Timeout waiting for the #keyAssistant to be visible"
    );

    composeWin.goDoCommand("cmd_sendLater");
    await kaShown;

    await BrowserTestUtils.closeWindow(composeWin);
  }
);

/**
 * Tests composition of an encrypted message to a recipient, whose key we have
 * not accepted, prompts the user.
 */
add_task(
  async function testEncryptedRecipientKeyNotAcceptedMessageComposition() {
    await OpenPGPTestUtils.importPublicKey(
      window,
      new FileUtils.File(
        getTestFilePath(
          "../data/keys/carol@example.com-0x3099ff1238852b9f-pub.asc"
        )
      ),
      OpenPGPTestUtils.ACCEPTANCE_UNDECIDED
    );

    for (let level of [
      OpenPGPTestUtils.ACCEPTANCE_UNDECIDED,
      OpenPGPTestUtils.ACCEPTANCE_REJECTED,
    ]) {
      info(`Testing with acceptance level: "${level}"...`);
      await OpenPGPTestUtils.updateKeyIdAcceptance(
        OpenPGPTestUtils.CAROL_KEY_ID,
        level
      );

      await be_in_folder(bobAcct.incomingServer.rootFolder);

      let cwc = open_compose_new_mail();
      let composeWin = cwc.window;

      setup_msg_contents(
        cwc,
        "carol@example.com",
        "Compose Encrypted Recipient Key Not Accepted",
        "This is an encrypted recipient key not accepted message composition test."
      );

      await OpenPGPTestUtils.toggleMessageEncryption(composeWin);

      let kaShown = BrowserTestUtils.waitForCondition(
        () => composeWin.document.getElementById("keyAssistant").open,
        "Timeout waiting for the #keyAssistant to be visible"
      );

      composeWin.goDoCommand("cmd_sendLater");
      await kaShown;

      await BrowserTestUtils.closeWindow(composeWin);
    }
    await OpenPGPTestUtils.removeKeyById(OpenPGPTestUtils.CAROL_KEY_ID);
  }
);

/**
 * Tests composition of an encrypted message to a recipient, whose key we have
 * not verified, shows as encrypted in the Outbox.
 */
add_task(
  async function testEncryptedRecipientKeyUnverifiedMessageComposition() {
    await OpenPGPTestUtils.importPublicKey(
      window,
      new FileUtils.File(
        getTestFilePath(
          "../data/keys/carol@example.com-0x3099ff1238852b9f-pub.asc"
        )
      ),
      OpenPGPTestUtils.ACCEPTANCE_UNVERIFIED
    );

    await be_in_folder(bobAcct.incomingServer.rootFolder);

    let cwc = open_compose_new_mail();
    let composeWin = cwc.window;

    setup_msg_contents(
      cwc,
      "carol@example.com",
      "Compose Encrypted Recipient Key Unverified Message",
      "This is an encrypted, recipient key unverified message test."
    );

    await OpenPGPTestUtils.toggleMessageEncryption(composeWin);
    await sendMessage(composeWin);

    await be_in_folder(gOutbox);
    select_click_row(0);

    Assert.ok(
      OpenPGPTestUtils.hasEncryptedIconState(window.document, "ok"),
      "message should have encrypted icon"
    );

    // Clean up so other tests work.
    EventUtils.synthesizeKey("VK_DELETE");
    await OpenPGPTestUtils.removeKeyById(OpenPGPTestUtils.CAROL_KEY_ID);
  }
);

/**
 * Tests composition of a message to multiple recipients among whom, one key
 * is missing, prompts the user.
 */
add_task(
  async function testEncryptedOneRecipientKeyNotAvailableMessageComposition() {
    await be_in_folder(bobAcct.incomingServer.rootFolder);

    let cwc = open_compose_new_mail();
    let composeWin = cwc.window;

    setup_msg_contents(
      cwc,
      "alice@openpgp.example, carol@example.com",
      "Compose Encrypted One Recipient Key Not Available Message Composition",
      "This is an encrypted, one recipient key not available message test."
    );

    await OpenPGPTestUtils.toggleMessageEncryption(composeWin);

    let kaShown = BrowserTestUtils.waitForCondition(
      () => composeWin.document.getElementById("keyAssistant").open,
      "Timeout waiting for the #keyAssistant to be visible"
    );

    composeWin.goDoCommand("cmd_sendLater");
    await kaShown;

    await BrowserTestUtils.closeWindow(composeWin);
  }
);

/**
 * Tests composition of a message to multiple recipients among whom, one key
 * is not accepted, prompts the user.
 */
add_task(
  async function testEncryptedOneRecipientKeyNotAcceptedMessageComposition() {
    await OpenPGPTestUtils.importPublicKey(
      window,
      new FileUtils.File(
        getTestFilePath(
          "../data/keys/carol@example.com-0x3099ff1238852b9f-pub.asc"
        )
      ),
      OpenPGPTestUtils.ACCEPTANCE_UNDECIDED
    );

    for (let level of [
      OpenPGPTestUtils.ACCEPTANCE_UNDECIDED,
      OpenPGPTestUtils.ACCEPTANCE_REJECTED,
    ]) {
      info(`Testing with acceptance level: "${level}"...`);
      await OpenPGPTestUtils.updateKeyIdAcceptance(
        OpenPGPTestUtils.CAROL_KEY_ID,
        level
      );

      await be_in_folder(bobAcct.incomingServer.rootFolder);

      let cwc = open_compose_new_mail();
      let composeWin = cwc.window;

      setup_msg_contents(
        cwc,
        "alice@openpgp.example, carol@example.com",
        "Compose Encrypted One Recipient Key Not Accepted Message Composition",
        "This is an encrypted, one recipient key not accepted message test."
      );

      await OpenPGPTestUtils.toggleMessageEncryption(composeWin);

      let kaShown = BrowserTestUtils.waitForCondition(
        () => composeWin.document.getElementById("keyAssistant").open,
        "Timeout waiting for the #keyAssistant to be visible"
      );

      composeWin.goDoCommand("cmd_sendLater");
      await kaShown;

      await BrowserTestUtils.closeWindow(composeWin);
    }

    await OpenPGPTestUtils.removeKeyById(OpenPGPTestUtils.CAROL_KEY_ID);
  }
);

/**
 * Tests composition of a message to multiple recipients among whom, one key
 * is not verified, shows as encrypted in the Outbox.
 */
add_task(
  async function testEncryptedOneRecipientKeyUnverifiedMessageComposition() {
    await OpenPGPTestUtils.importPublicKey(
      window,
      new FileUtils.File(
        getTestFilePath(
          "../data/keys/carol@example.com-0x3099ff1238852b9f-pub.asc"
        )
      ),
      OpenPGPTestUtils.ACCEPTANCE_UNVERIFIED
    );

    await be_in_folder(bobAcct.incomingServer.rootFolder);

    let cwc = open_compose_new_mail();
    let composeWin = cwc.window;

    setup_msg_contents(
      cwc,
      "alice@openpgp.example, carol@example.com",
      "Compose Encrypted One Recipient Key Unverified Message",
      "This is an encrypted, one recipient key unverified message test."
    );

    await OpenPGPTestUtils.toggleMessageEncryption(composeWin);
    await sendMessage(composeWin);

    await be_in_folder(gOutbox);
    select_click_row(0);

    await TestUtils.waitForCondition(
      () => OpenPGPTestUtils.hasEncryptedIconState(window.document, "ok"),
      "message should have encrypted icon"
    );

    // Clean up so other tests work.
    EventUtils.synthesizeKey("VK_DELETE");
    await OpenPGPTestUtils.removeKeyById(OpenPGPTestUtils.CAROL_KEY_ID);
  }
);

/**
 * Tests composing a reply to an encrypted message is encrypted by default.
 */
add_task(async function testEncryptedMessageReplyIsEncrypted() {
  await be_in_folder(bobAcct.incomingServer.rootFolder);
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "../data/eml/signed-by-0xfbfcc82a015e7330-encrypted-to-0xf231550c4f47e38e.eml"
      )
    )
  );

  let replyWindowPromise = BrowserTestUtils.domWindowOpened(null, async win => {
    await BrowserTestUtils.waitForEvent(win, "load");
    return (
      win.document.documentURI ===
      "chrome://messenger/content/messengercompose/messengercompose.xhtml"
    );
  });

  mc.window.document.querySelector("#hdrReplyButton").click();
  close_window(mc);

  let replyWindow = await replyWindowPromise;
  await BrowserTestUtils.waitForEvent(replyWindow, "focus", true);
  replyWindow.document.querySelector("#button-save").click();

  await TestUtils.waitForCondition(
    () => gDrafts.getTotalMessages(true) > 0,
    "message should be saved to drafts folder"
  );
  replyWindow.close();

  if (Services.focus.activeWindow != window) {
    await BrowserTestUtils.waitForEvent(window, "focus");
  }

  await be_in_folder(gDrafts);
  select_click_row(0);

  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(window.document, "ok"),
    "encrypted icon should be displayed"
  );
});

registerCleanupFunction(function tearDown() {
  MailServices.accounts.removeIncomingServer(bobAcct.incomingServer, true);
  MailServices.accounts.removeAccount(bobAcct, true);
});
