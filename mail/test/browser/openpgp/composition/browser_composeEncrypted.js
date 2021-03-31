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
 * Used to intercept the alert prompt that comes before the key status dialog.
 */
async function handleUnableToSendEncryptedDialog() {
  return BrowserTestUtils.promiseAlertDialogOpen(
    "",
    "chrome://openpgp/content/ui/enigmailMsgBox.xhtml",
    {
      async callback(win) {
        // Ensure this contains text related to the tests here.
        Assert.ok(
          win.document.documentElement.textContent.includes(
            "Unable to send this message with end-to-end encryption"
          ),
          "unable to send encrypted dialog should be displayed"
        );

        await closeDialog(win);
      },
    }
  );
}

/**
 * Used to intercept the dialog that displays the key statuses when an error
 * is encountered.
 * @param {Function} callback - A function that is called with the dialog window
 *  when it's intercepted. Opening the dialog will block until it's closed so
 *  this function must close the dialog or tests will timeout.
 */
async function handleKeyStatusDialog(callback) {
  return BrowserTestUtils.promiseAlertDialogOpen(
    "",
    "chrome://openpgp/content/ui/composeKeyStatus.xhtml",
    {
      async callback(win) {
        if (Services.focus.activeWindow != win) {
          await BrowserTestUtils.waitForEvent(win, "focus");
        }
        // Wait for the onLoad() handler to finish loading. It does some async
        // work to build the displayed columns.
        await BrowserTestUtils.waitForCondition(
          () =>
            win.gRowToEmail &&
            win.gEmailAddresses &&
            (win.gRowToEmail.length = win.gEmailAddresses.length),
          "status list columns did not load in time"
        );
        return callback(win);
      },
    }
  );
}

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
add_task(async function setUp() {
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

  gOutbox = get_special_folder(Ci.nsMsgFolderFlags.Queue);
  gDrafts = get_special_folder(Ci.nsMsgFolderFlags.Drafts, true);
});

/**
 * Tests composition of an encrypted only message shows as encrypted in
 * the Outbox.
 */
add_task(async function testEncryptedMessageComposition() {
  be_in_folder(bobAcct.incomingServer.rootFolder);

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

  be_in_folder(gOutbox);
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
 * Tests composition of an encrypted only message, with public key attachement
 * enabled, shows as encrypted in the Outbox.
 */
add_task(async function testEncryptedMessageWithKeyComposition() {
  be_in_folder(bobAcct.incomingServer.rootFolder);

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

  be_in_folder(gOutbox);
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
    be_in_folder(bobAcct.incomingServer.rootFolder);

    let cwc = open_compose_new_mail();
    let composeWin = cwc.window;

    setup_msg_contents(
      cwc,
      "carol@example.com",
      "Compose Encrypted Recipient Key Not Available Message",
      "This is an encrypted recipient key not available message composition test."
    );

    await OpenPGPTestUtils.toggleMessageEncryption(composeWin);

    let alertDialog = handleUnableToSendEncryptedDialog();
    let txt = await l10n.formatValue(
      "openpgp-compose-key-status-intro-need-keys"
    );

    let keyStatusDialog = handleKeyStatusDialog(async win => {
      Assert.ok(
        win.document.documentElement
          .querySelector("description")
          .textContent.includes(txt),
        "key status dialog should be displayed"
      );

      await closeDialog(win);
    });

    composeWin.goDoCommand("cmd_sendLater");

    await alertDialog;
    await keyStatusDialog;
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

      be_in_folder(bobAcct.incomingServer.rootFolder);

      let cwc = open_compose_new_mail();
      let composeWin = cwc.window;

      setup_msg_contents(
        cwc,
        "carol@example.com",
        "Compose Encrypted Recipient Key Not Accepted",
        "This is an encrypted recipient key not accepted message composition test."
      );

      await OpenPGPTestUtils.toggleMessageEncryption(composeWin);

      let alertDialog = handleUnableToSendEncryptedDialog();

      let keyStatusDialog = handleKeyStatusDialog(async win => {
        let infoList = win.document.documentElement.querySelector("#infolist");

        await TestUtils.waitForCondition(
          () => infoList.itemChildren.length == 1,
          "1 recipient key status was not displayed"
        );

        // Wait for the l10n update to finish.
        let richItem = infoList.getItemAtIndex(0);
        await TestUtils.waitForCondition(
          () => richItem.textContent != "",
          "richlistitem was not translated in time"
        );

        let txt = await l10n.formatValue("openpgp-recip-none-accepted");

        Assert.ok(
          richItem.textContent.includes(txt),
          `recipient key acceptance status should be "${txt}"`
        );

        await closeDialog(win);
      });

      composeWin.goDoCommand("cmd_sendLater");

      await alertDialog;
      await keyStatusDialog;
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

    be_in_folder(bobAcct.incomingServer.rootFolder);

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

    be_in_folder(gOutbox);
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
    be_in_folder(bobAcct.incomingServer.rootFolder);

    let cwc = open_compose_new_mail();
    let composeWin = cwc.window;

    setup_msg_contents(
      cwc,
      "alice@openpgp.example, carol@example.com",
      "Compose Encrypted One Recipient Key Not Available Message Composition",
      "This is an encrypted, one recipient key not available message test."
    );

    await OpenPGPTestUtils.toggleMessageEncryption(composeWin);

    let alertDialog = handleUnableToSendEncryptedDialog();

    let keyStatusDialog = handleKeyStatusDialog(async win => {
      let infoList = win.document.documentElement.querySelector("#infolist");

      await TestUtils.waitForCondition(
        () => infoList.itemChildren.length == 2,
        "2 recipient key statuses was not be displayed"
      );

      let richItem0 = infoList.getItemAtIndex(0);
      let richItem1 = infoList.getItemAtIndex(1);

      // Wait for the l10n updates to finish.
      await TestUtils.waitForCondition(
        () => richItem0.textContent != "" && richItem1.textContent != "",
        "richlistitem(s) were not translated in time"
      );

      let okStr = await l10n.formatValue("openpgp-recip-good");
      let notOkStr = await l10n.formatValue("openpgp-recip-missing");

      Assert.ok(
        richItem0.textContent.includes(okStr),
        `first recipient key status should be "${okStr}"`
      );

      Assert.ok(
        richItem1.textContent.includes(notOkStr),
        `second recipient key status should be "${notOkStr}"`
      );

      await closeDialog(win);
    });

    composeWin.goDoCommand("cmd_sendLater");

    await alertDialog;
    await keyStatusDialog;
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

      be_in_folder(bobAcct.incomingServer.rootFolder);

      let cwc = open_compose_new_mail();
      let composeWin = cwc.window;

      setup_msg_contents(
        cwc,
        "alice@openpgp.example, carol@example.com",
        "Compose Encrypted One Recipient Key Not Accepted Message Composition",
        "This is an encrypted, one recipient key not accepted message test."
      );

      await OpenPGPTestUtils.toggleMessageEncryption(composeWin);

      let alertDialog = handleUnableToSendEncryptedDialog();

      let keyStatusDialog = handleKeyStatusDialog(async win => {
        let infoList = win.document.documentElement.querySelector("#infolist");

        await TestUtils.waitForCondition(
          () => infoList.itemChildren.length == 2,
          "2 recipient key statuses were not displayed"
        );

        let richItem0 = infoList.getItemAtIndex(0);
        let richItem1 = infoList.getItemAtIndex(1);

        // Wait for the l10n updates to finish.
        await TestUtils.waitForCondition(
          () => richItem0.textContent != "" && richItem1.textContent != "",
          "richlistitem(s) were not translated in time"
        );

        let okStr = await l10n.formatValue("openpgp-recip-good");
        let notOkStr = await l10n.formatValue("openpgp-recip-none-accepted");

        Assert.ok(
          richItem0.textContent.includes(okStr),
          `first recipient key status should be "${okStr}"`
        );
        Assert.ok(
          richItem1.textContent.includes(notOkStr),
          `second recipient key status should be "${notOkStr}"`
        );

        await closeDialog(win);
      });

      composeWin.goDoCommand("cmd_sendLater");

      await alertDialog;
      await keyStatusDialog;
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

    be_in_folder(bobAcct.incomingServer.rootFolder);

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

    be_in_folder(gOutbox);
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
  be_in_folder(bobAcct.incomingServer.rootFolder);
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
  replyWindow.close();

  await TestUtils.waitForCondition(
    () => gDrafts.getTotalMessages(true) > 0,
    "message should be saved to drafts folder"
  );

  if (Services.focus.activeWindow != window) {
    await BrowserTestUtils.waitForEvent(window, "focus");
  }

  be_in_folder(gDrafts);
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
