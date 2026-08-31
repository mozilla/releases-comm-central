/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * An OpenPGP encrypted message whose decrypted body carries a remote image must
 * hard-block that content with no "load remote content" override, whether the
 * message is viewed in a folder or opened from a file.
 */

"use strict";

const { get_about_message, open_message_from_file } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
  );
const { get_notification, wait_for_notification_to_show } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/NotificationBoxHelpers.sys.mjs"
  );
const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mail/OpenPGPTestUtils.sys.mjs"
);
const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

const NOTIFICATION_BOX = "mail-notification-top";
const NOTIFICATION_VALUE = "remoteContent";

let bobAcct;

add_setup(async function () {
  bobAcct = MailServices.accounts.createAccount();
  bobAcct.incomingServer = MailServices.accounts.createIncomingServer(
    "bob",
    "openpgp.example",
    "pop3"
  );
  const bobIdentity = MailServices.accounts.createIdentity();
  bobIdentity.email = "bob@openpgp.example";
  bobAcct.addIdentity(bobIdentity);

  // The messages are encrypted to Bob; import Bob's secret key so they decrypt.
  const [id] = await OpenPGPTestUtils.importPrivateKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "data/keys/bob@openpgp.example-0xfbfcc82a015e7330-secret.asc"
      )
    )
  );
  bobIdentity.setUnicharAttribute("openpgp_key_id", id);

  registerCleanupFunction(async () => {
    await OpenPGPTestUtils.removeKeyById("0xfbfcc82a015e7330", true);
    MailServices.accounts.removeAccount(bobAcct, true);
  });
});

/**
 * Open the encrypted message from a file and assert the remote image inside the
 * decrypted body is blocked with no override, regardless of the global remote
 * content preference.
 *
 * @param {boolean} remoteImagesGloballyEnabled - When true, remote content is
 *   allowed globally; an encrypted message must still block it.
 */
async function checkFileOpenedEncryptedIsHardBlocked(
  remoteImagesGloballyEnabled
) {
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "mailnews.message_display.disable_remote_image",
        !remoteImagesGloballyEnabled,
      ],
    ],
  });

  const msgc = await open_message_from_file(
    new FileUtils.File(getTestFilePath("data/eml/rc-openpgp-mdc.eml"))
  );
  const aboutMessage = get_about_message(msgc);

  // Wait for the decrypted body (and its remote image) to render.
  let testElement;
  await TestUtils.waitForCondition(() => {
    testElement = aboutMessage
      .getMessagePaneBrowser()
      .contentDocument.getElementById("testelement");
    return !!testElement;
  }, "the decrypted body with the remote image should render");

  // An encrypted message blocks remote content (and shows the notification)
  // even when remote content is globally enabled.
  await wait_for_notification_to_show(
    aboutMessage,
    NOTIFICATION_BOX,
    NOTIFICATION_VALUE
  );

  Assert.equal(
    testElement.naturalWidth,
    0,
    `remote image must be blocked for the file-opened encrypted message` +
      ` (remote content globally ${
        remoteImagesGloballyEnabled ? "enabled" : "disabled"
      })`
  );

  // Hard block: the notification must offer no override button.
  const notification = get_notification(
    aboutMessage,
    NOTIFICATION_BOX,
    NOTIFICATION_VALUE
  );
  Assert.ok(notification, "a remote content notification should be shown");
  Assert.equal(
    notification.buttonContainer.querySelectorAll("button, toolbarbutton")
      .length,
    0,
    "no remote-content override button should be offered for an encrypted message"
  );

  await BrowserTestUtils.closeWindow(msgc);
  await SpecialPowers.popPrefEnv();
}

/**
 * With remote content blocked by default, a file-opened encrypted message is
 * hard-blocked and offers no override.
 */
add_task(async function test_fileOpenedEncrypted_defaultBlocked() {
  await checkFileOpenedEncryptedIsHardBlocked(false);
});

/**
 * Even with remote content globally enabled, a file-opened encrypted message
 * still blocks it.
 */
add_task(async function test_fileOpenedEncrypted_globallyEnabledStillBlocked() {
  await checkFileOpenedEncryptedIsHardBlocked(true);
});
