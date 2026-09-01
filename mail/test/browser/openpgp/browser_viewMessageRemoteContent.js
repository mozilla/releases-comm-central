/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for remote content in encrypted OpenPGP messages (bug 1994709).
 *
 * Remote content is permitted only for OpenPGP messages that are integrity
 * protected (MDC/SEIPD v1 or AEAD) and decrypted as the top-level part; it stays
 * blocked for unprotected/tampered messages and for encrypted sub-parts inside
 * attacker-controlled MIME.
 */

"use strict";

const { get_about_message, open_message_from_file } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
  );
const {
  get_notification,
  get_notification_button,
  wait_for_notification_to_show,
} = ChromeUtils.importESModule(
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
const DISABLE_PREF = "mailnews.message_display.disable_remote_image";

add_setup(async function () {
  const account = MailServices.accounts.createAccount();
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "bob",
    "openpgp.example",
    "pop3"
  );
  const identity = MailServices.accounts.createIdentity();
  identity.email = "bob@openpgp.example";
  account.addIdentity(identity);

  const [id] = await OpenPGPTestUtils.importPrivateKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "data/keys/bob@openpgp.example-0xfbfcc82a015e7330-secret.asc"
      )
    )
  );
  identity.setUnicharAttribute("openpgp_key_id", id);

  registerCleanupFunction(async () => {
    await OpenPGPTestUtils.removeKeyById("0xFBFCC82A015E7330", true);
    MailServices.accounts.removeAccount(account, true);
  });
});

// Open a raw .eml from data/eml in its own message window. Opening from a file
// registers the message with the encrypted-URI service exactly as a folder view
// does (bug 2052070), so the content-policy gate sees the same integrity state.
async function openEml(eml) {
  return open_message_from_file(
    new FileUtils.File(getTestFilePath(`data/eml/${eml}`))
  );
}

function remoteImage(msgc) {
  return get_about_message(msgc)
    .getMessagePaneBrowser()
    .contentDocument?.getElementById("testelement");
}

function bodyText(msgc) {
  return (
    get_about_message(msgc).getMessagePaneBrowser().contentDocument
      ?.documentElement?.textContent ?? ""
  );
}

// With remote content globally allowed, an allowed message loads the image; a
// blocked one does not. Exercises the nsMsgContentPolicy gate directly (the gate
// runs before the disable_remote_image check).
async function assertImageLoads(eml, shouldLoad) {
  await SpecialPowers.pushPrefEnv({
    set: [[DISABLE_PREF, false]],
  });
  const msgc = await openEml(eml);
  try {
    if (shouldLoad) {
      await TestUtils.waitForCondition(() => {
        const img = remoteImage(msgc);
        return img && img.complete && img.naturalWidth > 0;
      }, `remote image should load for ${eml}`);
      Assert.greater(
        remoteImage(msgc).naturalWidth,
        0,
        `${eml}: image should load`
      );
    } else {
      // Wait for the (blocked) image to appear; a wrongly-permitted load would
      // happen once decryption completes, so poll until it does or we time out.
      const loaded = await TestUtils.waitForCondition(() => {
        const img = remoteImage(msgc);
        return img && img.complete && img.naturalWidth > 0;
      }, `remote image for ${eml}`).catch(() => false);
      Assert.ok(!loaded, `${eml}: remote image should NOT load`);
    }
  } finally {
    await BrowserTestUtils.closeWindow(msgc);
  }
}

// With remote content blocked by default, an integrity-protected message shows
// the remote-content notification WITH the override button.
async function assertOverrideOffered(eml, offered) {
  await SpecialPowers.pushPrefEnv({
    set: [[DISABLE_PREF, true]],
  });
  const msgc = await openEml(eml);
  try {
    const aboutMessage = get_about_message(msgc);
    await wait_for_notification_to_show(
      aboutMessage,
      NOTIFICATION_BOX,
      NOTIFICATION_VALUE
    );
    if (offered) {
      const button = get_notification_button(
        aboutMessage,
        NOTIFICATION_BOX,
        NOTIFICATION_VALUE,
        { popup: "remoteContentOptions" }
      );
      Assert.ok(button, `${eml}: override should be offered`);
    } else {
      const notification = get_notification(
        aboutMessage,
        NOTIFICATION_BOX,
        NOTIFICATION_VALUE
      );
      const buttons = notification.buttonContainer.querySelectorAll(
        "button, toolbarbutton"
      );
      Assert.equal(buttons.length, 0, `${eml}: no override should be offered`);
    }
  } finally {
    await BrowserTestUtils.closeWindow(msgc);
  }
}

add_task(async function test_mdc_allowed() {
  await assertImageLoads("rc-openpgp-mdc.eml", true);
  await assertOverrideOffered("rc-openpgp-mdc.eml", true);
});

add_task(async function test_aead_allowed() {
  await assertImageLoads("rc-openpgp-aead.eml", true);
  await assertOverrideOffered("rc-openpgp-aead.eml", true);
});

add_task(async function test_nomdc_blocked() {
  // No valid integrity -> RNP returns no plaintext -> nothing to load.
  await assertImageLoads("rc-openpgp-nomdc.eml", false);
});

add_task(async function test_tampered_blocked() {
  await assertImageLoads("rc-openpgp-mdc-tampered.eml", false);
});

add_task(async function test_sigwrap_mdc_allowed() {
  // Gateway signing: a top-level OpenPGP signature wrapping an integrity-
  // protected encrypted child must apply the same gate -> allowed (invariant #4).
  await assertImageLoads("rc-openpgp-sigwrap-mdc.eml", true);
  await assertOverrideOffered("rc-openpgp-sigwrap-mdc.eml", true);
});

add_task(async function test_sigwrap_nomdc_blocked() {
  // Same wrapper, but an unprotected child must stay blocked (invariant #4).
  await assertImageLoads("rc-openpgp-sigwrap-nomdc.eml", false);
});

add_task(async function test_mixed_subpart_blocked() {
  // The integrity-protected part is a non-top-level sub-part inside attacker
  // MIME; it must not be decrypted into this document, so neither the secret nor
  // its remote content appears (invariant #3).
  await SpecialPowers.pushPrefEnv({
    set: [[DISABLE_PREF, false]],
  });
  const msgc = await openEml("rc-openpgp-mixed-subpart.eml");
  try {
    const loaded = await TestUtils.waitForCondition(() => {
      const img = remoteImage(msgc);
      return img && img.complete && img.naturalWidth > 0;
    }, "remote image for rc-openpgp-mixed-subpart.eml").catch(() => false);
    Assert.ok(!loaded, "mixed sub-part: remote image did NOT load");
    Assert.ok(
      !bodyText(msgc).includes("Integrity-protected secret body"),
      "encrypted sub-part is not decrypted into the top-level document"
    );
  } finally {
    await BrowserTestUtils.closeWindow(msgc);
  }
});
