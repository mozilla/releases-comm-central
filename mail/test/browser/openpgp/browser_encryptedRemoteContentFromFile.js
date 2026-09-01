/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * A message opened from a file must get the same remote-content decision as the
 * same message viewed in a folder (bug 2052070). For an integrity-protected
 * OpenPGP message (MDC/AEAD), that decision is to permit remote content under
 * the standard override/banner (bug 1994709) -- so a file-opened
 * integrity-protected message offers the "load remote content" override and, with
 * remote content enabled, loads the image. (The still-hard-blocked case, an
 * encrypted message that renders but must not be overridable, is covered for
 * S/MIME in mail/test/browser/smime/browser_encryptedRemoteContentFromFile.js.)
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

// Open the integrity-protected message from a file and assert it gets the same
// treatment as in a folder: with remote content enabled the image loads; with
// remote content blocked (default) the override is offered.
async function checkFileOpenedIntegrityProtected(remoteImagesGloballyEnabled) {
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
  try {
    const aboutMessage = get_about_message(msgc);

    // Wait for the decrypted body (and its remote image) to render.
    let testElement;
    await TestUtils.waitForCondition(() => {
      testElement = aboutMessage
        .getMessagePaneBrowser()
        .contentDocument.getElementById("testelement");
      return !!testElement;
    }, "the decrypted body with the remote image should render");

    if (remoteImagesGloballyEnabled) {
      // Integrity protected: the content policy permits the load.
      await TestUtils.waitForCondition(
        () => testElement.complete && testElement.naturalWidth > 0,
        "the remote image should load for a file-opened integrity-protected message"
      );
      Assert.greater(testElement.naturalWidth, 0, "remote image loaded");
    } else {
      // Blocked by default, but (unlike unprotected/S/MIME) the override is
      // offered, exactly as for the same message in a folder.
      await wait_for_notification_to_show(
        aboutMessage,
        NOTIFICATION_BOX,
        NOTIFICATION_VALUE
      );
      const button = get_notification_button(
        aboutMessage,
        NOTIFICATION_BOX,
        NOTIFICATION_VALUE,
        { popup: "remoteContentOptions" }
      );
      Assert.ok(
        button,
        "the remote-content override is offered for a file-opened integrity-protected message"
      );
    }
  } finally {
    await BrowserTestUtils.closeWindow(msgc);
  }
  await SpecialPowers.popPrefEnv();
}

add_task(
  async function test_fileOpenedIntegrityProtected_defaultOffersOverride() {
    await checkFileOpenedIntegrityProtected(false);
  }
);

add_task(
  async function test_fileOpenedIntegrityProtected_globallyEnabledLoads() {
    await checkFileOpenedIntegrityProtected(true);
  }
);
