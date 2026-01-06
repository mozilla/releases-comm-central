/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the display of OpenPGP signed/encrypted state in opened messages.
 */

"use strict";

const {
  get_about_message,
  open_message_from_file,
  wait_for_message_display_completion,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { promise_new_window } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);
const { get_notification_button, wait_for_notification_to_show } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/NotificationBoxHelpers.sys.mjs"
  );
const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mail/OpenPGPTestUtils.sys.mjs"
);

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

function getMsgBodyTxt(msgc) {
  const msgPane = get_about_message(msgc).getMessagePaneBrowser();
  return msgPane.contentDocument.documentElement.textContent;
}

var aliceAcct;

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
});

const partialInlineTests = [
  {
    filename: "partial-encrypt-for-carol-plaintext.eml",
    expectSuccess: false,
  },
  {
    filename: "partial-encrypt-for-carol-html.eml",
    expectSuccess: false,
  },
  {
    filename: "partial-encrypt-for-alice-plaintext.eml",
    expectSuccess: true,
  },
  {
    filename: "partial-encrypt-for-alice-html.eml",
    expectSuccess: true,
  },
];

/**
 * Test the notification/decryption/verification behavior for partially
 * encrypted/signed inline PGP messages.
 */
add_task(async function testPartialInlinePGPDecrypt() {
  for (const test of partialInlineTests) {
    if (!test.filename) {
      continue;
    }

    info(`Testing partial inline; filename=${test.filename}`);

    // Setup the message.
    const msgc = await open_message_from_file(
      new FileUtils.File(getTestFilePath("data/eml/" + test.filename))
    );
    const aboutMessage = get_about_message(msgc);

    const notificationBox = "mail-notification-top";
    const notificationValue = "decryptInlinePG";

    // Ensure the "partially encrypted notification" is visible.
    await wait_for_notification_to_show(
      aboutMessage,
      notificationBox,
      notificationValue
    );

    let body = getMsgBodyTxt(msgc);

    Assert.ok(
      body.includes("BEGIN PGP"),
      "unprocessed PGP message should still be shown"
    );

    Assert.ok(body.includes("prefix"), "prefix should still be shown");
    Assert.ok(body.includes("suffix"), "suffix should still be shown");

    const newWindowPromise = promise_new_window("mail:messageWindow");

    // Click on the button to process the message subset.
    const processButton = get_notification_button(
      aboutMessage,
      notificationBox,
      notificationValue,
      {
        popup: null,
      }
    );
    EventUtils.synthesizeMouseAtCenter(processButton, {}, aboutMessage);

    const msgc2 = await newWindowPromise;
    await wait_for_message_display_completion(msgc2, true);
    const aboutMessage2 = get_about_message(msgc2);

    body = getMsgBodyTxt(msgc2);

    Assert.ok(!body.includes("prefix"), "prefix should not be shown");
    Assert.ok(!body.includes("suffix"), "suffix should not be shown");

    const containsSecret = body.includes(
      "Insert a coin to play your personal lucky melody."
    );
    if (test.expectSuccess) {
      Assert.ok(containsSecret, "secret decrypted content should be shown");
      Assert.ok(
        OpenPGPTestUtils.hasEncryptedIconState(aboutMessage2.document, "ok"),
        "decryption success icon is shown"
      );
    } else {
      Assert.ok(
        !containsSecret,
        "secret decrypted content should not be shown"
      );
      Assert.ok(
        OpenPGPTestUtils.hasEncryptedIconState(aboutMessage2.document, "notok"),
        "decryption failure icon is shown"
      );
    }

    await BrowserTestUtils.closeWindow(msgc2);
    await BrowserTestUtils.closeWindow(msgc);
  }
});

registerCleanupFunction(async function tearDown() {
  MailServices.accounts.removeAccount(aliceAcct, true);
  await OpenPGPTestUtils.removeKeyById("0xf231550c4f47e38e", true);
});
