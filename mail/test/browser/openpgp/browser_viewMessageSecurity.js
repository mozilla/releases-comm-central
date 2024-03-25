/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the display of the Message Security popup panel, which displays
 * encryption information for both OpenPGP and S/MIME.
 */

"use strict";

const {
  be_in_folder,
  get_about_message,
  get_special_folder,
  select_click_row,
  press_delete,
  plan_for_message_display,
  wait_for_message_display_completion,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
const {
  get_notification_button,
  wait_for_notification_to_show,
  wait_for_notification_to_stop,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/NotificationBoxHelpers.sys.mjs"
);
const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mail/OpenPGPTestUtils.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
const { SmimeUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/SmimeUtils.sys.mjs"
);

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

const MSG_TEXT = "Sundays are nothing without callaloo.";

function getMsgBodyTxt() {
  const msgPane = get_about_message(window).getMessagePaneBrowser();
  return msgPane.contentDocument.documentElement.textContent;
}

var aliceAcct;
var aliceIdentity;
var gInbox;

/**
 * Set up the base account, identity and keys needed for the tests.
 */
add_setup(async function () {
  SmimeUtils.ensureNSS();
  SmimeUtils.loadCertificateAndKey(
    new FileUtils.File(getTestFilePath("data/smime/Bob.p12")),
    "nss"
  );

  aliceAcct = MailServices.accounts.createAccount();
  aliceAcct.incomingServer = MailServices.accounts.createIncomingServer(
    "alice",
    "openpgp.example",
    "pop3"
  );
  aliceIdentity = MailServices.accounts.createIdentity();
  aliceIdentity.email = "alice@openpgp.example";
  aliceAcct.addIdentity(aliceIdentity);

  // Set up the alice's private key.
  const [id] = await OpenPGPTestUtils.importPrivateKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "data/keys/alice@openpgp.example-0xf231550c4f47e38e-secret.asc"
      )
    )
  );

  aliceIdentity.setUnicharAttribute("openpgp_key_id", id);

  // Import and accept the public key for Bob, our verified sender.
  await OpenPGPTestUtils.importPublicKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "data/keys/bob@openpgp.example-0xfbfcc82a015e7330-pub.asc"
      )
    )
  );

  gInbox = await get_special_folder(Ci.nsMsgFolderFlags.Inbox, true);
  await be_in_folder(gInbox);
});

/**
 * Test that the encryption icons and the message security popup properly update
 * when selecting an S/MIME or OpenPGP message with different signature and
 * encryption states.
 */
add_task(async function testSmimeOpenPgpSelection() {
  const smimeFile = new FileUtils.File(
    getTestFilePath("data/smime/alice.env.eml")
  );
  // Fetch a local OpenPGP message.
  const openPgpFile = new FileUtils.File(
    getTestFilePath(
      "data/eml/signed-by-0xfbfcc82a015e7330-encrypted-to-0xf231550c4f47e38e.eml"
    )
  );

  // Add the fetched S/MIME message to the inbox folder.
  let copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFileMessage(
    smimeFile,
    gInbox,
    null,
    false,
    0,
    "",
    copyListener,
    null
  );
  await copyListener.promise;

  // Add the fetched OpenPGP message to the inbox folder.
  copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFileMessage(
    openPgpFile,
    gInbox,
    null,
    false,
    0,
    "",
    copyListener,
    null
  );
  await copyListener.promise;

  // Select the second row, which should contain the S/MIME message.
  await select_click_row(-2);

  const aboutMessage = get_about_message();
  Assert.equal(
    aboutMessage.document
      .getElementById("encryptionTechBtn")
      .querySelector("span").textContent,
    "S/MIME"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "S/MIME message should be decrypted"
  );

  const openpgpprocessed = BrowserTestUtils.waitForEvent(
    aboutMessage.document,
    "openpgpprocessed"
  );
  // Select the first row, which should contain the OpenPGP message.
  await select_click_row(-1);
  await openpgpprocessed;

  Assert.equal(
    aboutMessage.document
      .getElementById("encryptionTechBtn")
      .querySelector("span").textContent,
    "OpenPGP"
  );

  Assert.ok(getMsgBodyTxt().includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "verified"),
    "signed verified icon is displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is displayed"
  );

  // Delete the two generated messages.
  await press_delete();
  await select_click_row(-1);
  await press_delete();
});

/**
 * Test the notification and repairing of a message corrupted by MS-Exchange.
 */
add_task(async function testBrokenMSExchangeEncryption() {
  // Fetch a broken MS-Exchange encrypted message.
  const brokenFile = new FileUtils.File(
    getTestFilePath("data/eml/alice-broken-exchange.eml")
  );
  const notificationBox = "mail-notification-top";
  const notificationValue = "brokenExchange";

  // Add the broken OpenPGP message to the inbox folder.
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFileMessage(
    brokenFile,
    gInbox,
    null,
    false,
    0,
    "",
    copyListener,
    null
  );
  await copyListener.promise;

  // Select the first row, which should contain the OpenPGP message.
  await select_click_row(-1);

  // Assert the "corrupted by MS-Exchange" notification is visible.
  const aboutMessage = get_about_message();
  await wait_for_notification_to_show(
    aboutMessage,
    notificationBox,
    notificationValue
  );

  // Click on the "repair" button.
  const repairButton = get_notification_button(
    aboutMessage,
    notificationBox,
    notificationValue,
    {
      popup: null,
    }
  );
  plan_for_message_display(window);
  EventUtils.synthesizeMouseAtCenter(repairButton, {}, aboutMessage);

  // Wait for the "fixing in progress" notification to go away.
  await wait_for_notification_to_stop(
    aboutMessage,
    notificationBox,
    "brokenExchangeProgress"
  );

  // The broken exchange repair process generates a new fixed message body and
  // then copies the new message in the same folder. Therefore, we need to wait
  // for the message to be automatically reloaded and reselected.
  await wait_for_message_display_completion(window, true);

  // Assert that the message was repaired and decrypted.
  await TestUtils.waitForCondition(
    () => OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is displayed"
  );

  // Delete the message.
  await press_delete();
});

/**
 * Test the working keyboard shortcut event listener for the message header.
 * Ctrl+Alt+S for Windows and Linux, Control+Cmd+S for macOS.
 */
add_task(async function testMessageSecurityShortcut() {
  // Add an S/MIME message to the inbox folder.
  const smimeFile = new FileUtils.File(
    getTestFilePath("data/smime/alice.env.eml")
  );

  // Add the fetched S/MIME message to the inbox folder.
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFileMessage(
    smimeFile,
    gInbox,
    null,
    false,
    0,
    "",
    copyListener,
    null
  );
  await copyListener.promise;

  // Select the first row, which should contain the S/MIME message.
  await select_click_row(-1);

  const aboutMessage = get_about_message();
  Assert.equal(
    aboutMessage.document
      .getElementById("encryptionTechBtn")
      .querySelector("span").textContent,
    "S/MIME",
    "should indicate S/MIME encrypted"
  );

  const modifiers =
    AppConstants.platform == "macosx"
      ? { accelKey: true, ctrlKey: true }
      : { accelKey: true, altKey: true };

  const popupshown = BrowserTestUtils.waitForEvent(
    aboutMessage.document.getElementById("messageSecurityPanel"),
    "popupshown"
  );

  EventUtils.synthesizeKey("s", modifiers, aboutMessage);

  // The Message Security popup panel should show up.
  await popupshown;

  // Select the row again since the focus moved to the popup panel.
  await select_click_row(-1);
  // Delete the message.
  await press_delete();
});

registerCleanupFunction(async function tearDown() {
  // Reset the OpenPGP key and delete the account.
  MailServices.accounts.removeAccount(aliceAcct, true);
  aliceAcct = null;

  await OpenPGPTestUtils.removeKeyById("0xf231550c4f47e38e", true);
});
