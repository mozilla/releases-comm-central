/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Tests for composition when a key is expired.
 */

const { open_compose_new_mail } = ChromeUtils.importESModule(
  "resource://testing-common/mail/ComposeHelpers.sys.mjs"
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

var gAccount;
var gIdentity;
var gExpiredKeyId;
var gNotExpiredKeyId;

add_setup(async () => {
  gAccount = MailServices.accounts.createAccount();
  gAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "eddie",
    "openpgp.example",
    "imap"
  );

  gIdentity = MailServices.accounts.createIdentity();
  gIdentity.email = "eddie@openpgp.example";
  gAccount.addIdentity(gIdentity);
  MailServices.accounts.defaultAccount = gAccount;
  MailServices.accounts.defaultAccount.defaultIdentity = gIdentity;

  [gExpiredKeyId] = await OpenPGPTestUtils.importPrivateKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "../data/keys/eddie@openpgp.example-0x15e9357d2c2395c0-secret.asc"
      )
    )
  );
  [gNotExpiredKeyId] = await OpenPGPTestUtils.importPrivateKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "../data/keys/alice@openpgp.example-0xf231550c4f47e38e-secret.asc"
      )
    )
  );
  // FIXME: ^^^ should use a non-expiring key matching EDDIE!

  registerCleanupFunction(async () => {
    await OpenPGPTestUtils.removeKeyById(gExpiredKeyId, true);
    await OpenPGPTestUtils.removeKeyById(gNotExpiredKeyId, true);
    MailServices.accounts.removeIncomingServer(gAccount.incomingServer, true);
    MailServices.accounts.removeAccount(gAccount, true);
  });
});

add_task(async function testExpiredKeyShowsNotificationBar() {
  Services.wm
    .getMostRecentWindow("mail:3pane")
    .document.getElementById("tabmail")
    .currentAbout3Pane.displayFolder(gAccount.incomingServer.rootFolder);
  info(`Using key ${gExpiredKeyId}`);
  gIdentity.setUnicharAttribute(
    "openpgp_key_id",
    gExpiredKeyId.replace(/^0x/, "")
  );
  const cwc = await open_compose_new_mail();

  await wait_for_notification_to_show(
    cwc,
    "compose-notification-bottom",
    "openpgpSenderKeyExpired"
  );
  const notification = get_notification(
    cwc,
    "compose-notification-bottom",
    "openpgpSenderKeyExpired"
  );

  Assert.ok(notification !== null, "notification should be visible");
  Assert.equal(
    notification.messageText.textContent,
    "Your current configuration uses the key 0x15E9357D2C2395C0, which has expired.",
    "correct notification message should be displayed"
  );

  const buttons = notification._buttons;
  Assert.equal(
    buttons[0]["l10n-id"],
    "settings-context-open-account-settings-item2",
    "button0 should be the button to open account settings"
  );
  cwc.close();
});

add_task(async function testKeyWithoutExpiryDoesNotShowNotification() {
  Services.wm
    .getMostRecentWindow("mail:3pane")
    .document.getElementById("tabmail")
    .currentAbout3Pane.displayFolder(gAccount.incomingServer.rootFolder);
  info(`Using key ${gNotExpiredKeyId}`);
  gIdentity.setUnicharAttribute(
    "openpgp_key_id",
    gNotExpiredKeyId.replace(/^0x/, "")
  );
  const cwc = await open_compose_new_mail();

  // Give it some time to potentially start showing.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 200));
  const notification = get_notification(
    cwc,
    "compose-notification-bottom",
    "openpgpSenderKeyExpired"
  );

  Assert.ok(
    notification === null,
    "the expiry warning should not be visible if the key is not expired"
  );
  cwc.close();
});
