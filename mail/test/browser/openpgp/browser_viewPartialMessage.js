/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the display of OpenPGP signed/encrypted state in opened messages.
 */

"use strict";

const { get_about_message, open_message_from_file } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
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
    expectDecryption: true,
    expectVerification: false,
    expectSuccess: false,
  },
  {
    filename: "partial-encrypt-for-carol-html.eml",
    expectDecryption: true,
    expectVerification: false,
    expectSuccess: false,
  },
  {
    filename: "partial-encrypt-for-alice-plaintext.eml",
    expectDecryption: true,
    expectVerification: false,
    expectSuccess: true,
  },
  {
    filename: "partial-encrypt-for-alice-html.eml",
    expectDecryption: true,
    expectVerification: false,
    expectSuccess: true,
  },
  {
    filename: "partial-signed-from-carol-plaintext.eml",
    expectDecryption: false,
    expectVerification: true,
    expectSuccess: false,
  },
  {
    filename: "partial-signed-from-carol-html.eml",
    expectDecryption: false,
    expectVerification: true,
    expectSuccess: false,
  },
  {
    filename: "partial-signed-from-bob-plaintext.eml",
    expectDecryption: false,
    expectVerification: true,
    expectSuccess: true,
  },
  {
    filename: "partial-signed-from-bob-html.eml",
    expectDecryption: false,
    expectVerification: true,
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

    // Assert that the message was processed and the partial content reminder
    // notification is visible.
    await wait_for_notification_to_show(
      aboutMessage,
      notificationBox,
      "decryptInlinePGReminder"
    );

    // Get updated body text after processing the PGP subset.
    body = getMsgBodyTxt(msgc);

    Assert.ok(!body.includes("prefix"), "prefix should not be shown");
    Assert.ok(!body.includes("suffix"), "suffix should not be shown");

    if (test.expectDecryption) {
      const containsSecret = body.includes(
        "Insert a coin to play your personal lucky melody."
      );
      if (test.expectSuccess) {
        Assert.ok(containsSecret, "secret decrypted content should be shown");
        Assert.ok(
          OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
          "decryption success icon is shown"
        );
      } else {
        Assert.ok(
          !containsSecret,
          "secret decrypted content should not be shown"
        );
        Assert.ok(
          OpenPGPTestUtils.hasEncryptedIconState(
            aboutMessage.document,
            "notok"
          ),
          "decryption failure icon is shown"
        );
      }
    } else if (test.expectVerification) {
      if (test.expectSuccess) {
        Assert.ok(
          OpenPGPTestUtils.hasSignedIconState(
            aboutMessage.document,
            "verified"
          ),
          "ok verification icon is shown for " + test.filename
        );
      } else {
        Assert.ok(
          OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "unknown"),
          "unknown verification icon is shown"
        );
      }
    }

    await BrowserTestUtils.closeWindow(msgc);
  }
});

registerCleanupFunction(async function tearDown() {
  MailServices.accounts.removeAccount(aliceAcct, true);
  await OpenPGPTestUtils.removeKeyById("0xf231550c4f47e38e", true);
});
