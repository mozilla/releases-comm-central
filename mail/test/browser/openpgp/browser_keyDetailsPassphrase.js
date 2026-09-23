/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the passphrase protection tab of the OpenPGP key details
 * dialog, and for the actions it offers depending on the pref
 * mail.openpgp.passphrases.enabled and on how the key is actually
 * protected. The pref only controls whether we offer to set a separate
 * passphrase, it doesn't change how already existing secret keys are
 * protected, so a key may be protected by a user-chosen passphrase even
 * when the pref is disabled.
 */

"use strict";

const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mail/OpenPGPTestUtils.sys.mjs"
);
const { EnigmailWindows } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/windows.sys.mjs"
);

const KEY_DETAILS_URL = "chrome://openpgp/content/ui/keyDetailsDlg.xhtml";

const ALICE_KEY_ID = "0xf231550c4f47e38e";
const ALICE_PASSPHRASE = "alice-passphrase";

// Ofelia's secret key was exported with "gpg --export-secret-subkeys",
// so the secret key material of the primary key is missing.
const OFELIA_KEY_ID = "0x97DCDA5E56EBB822";

const PASSPHRASE_PREF = "mail.openpgp.passphrases.enabled";

function keyFile(name) {
  return new FileUtils.File(getTestFilePath(`data/keys/${name}`));
}

/**
 * Import Alice's secret key, which is protected by the automatic
 * passphrase that Thunderbird manages.
 */
function importAutoProtectedKey() {
  return OpenPGPTestUtils.importPrivateKey(
    window,
    keyFile("alice@openpgp.example-0xf231550c4f47e38e-secret.asc")
  );
}

/**
 * Import Alice's secret key, keeping its user-chosen passphrase.
 */
function importPassphraseProtectedKey() {
  return OpenPGPTestUtils.importPrivateKey(
    window,
    keyFile("alice@openpgp.example-0xf231550c4f47e38e-secret-with-pp.asc"),
    OpenPGPTestUtils.ACCEPTANCE_PERSONAL,
    ALICE_PASSPHRASE,
    true
  );
}

/**
 * Open the key details dialog for the given key, the same way the key
 * manager does, and run the given function once the dialog has detected
 * the passphrase protection state of the key. The dialog is modal, so
 * it blocks the caller until it is closed, and all checks and
 * interactions must happen in the callback. The dialog is closed after
 * the callback returns.
 *
 * @param {string} keyId - The ID of a personal key.
 * @param {function(Window):Promise} checks - Receives the dialog
 *   window.
 */
async function withKeyDetails(keyId, checks) {
  const onDialogLoaded = async function (dialogWindow) {
    // The dialog sets this while it is still loading, after it has
    // determined how the key is protected.
    await TestUtils.waitForCondition(
      () =>
        dialogWindow.document
          .getElementById("passphraseStatus")
          .getAttribute("data-l10n-id"),
      "the passphrase protection state should have been detected"
    );
    await checks(dialogWindow);
    dialogWindow.close();
  };

  const dialogPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    KEY_DETAILS_URL,
    { callback: onDialogLoaded }
  );
  // Returns only after the dialog has been closed.
  await EnigmailWindows.openKeyDetails(window, keyId, false);
  await dialogPromise;
}

/**
 * Select the passphrase protection tab, so that its buttons can be
 * clicked.
 *
 * @param {Window} dialogWindow - The key details dialog.
 */
function selectPassphraseTab(dialogWindow) {
  const doc = dialogWindow.document;
  doc.getElementById("mainTabs").selectedTab =
    doc.getElementById("passphraseTab");
}

function l10nId(dialogWindow, elementId) {
  return dialogWindow.document
    .getElementById(elementId)
    .getAttribute("data-l10n-id");
}

/**
 * Click a button of the passphrase tab, and answer the passphrase
 * prompt that it triggers.
 *
 * @param {Window} dialogWindow - The key details dialog.
 * @param {string} buttonId - The button to click.
 * @param {?string} passphrase - The passphrase to enter, or null to
 *   cancel the prompt.
 */
async function clickAndAnswerPrompt(dialogWindow, buttonId, passphrase) {
  const promptPromise = BrowserTestUtils.promiseAlertDialogOpen();
  EventUtils.synthesizeMouseAtCenter(
    dialogWindow.document.getElementById(buttonId),
    {},
    dialogWindow
  );
  const promptWindow = await promptPromise;
  const promptDialog = promptWindow.document.querySelector("dialog");
  if (passphrase == null) {
    promptDialog.getButton("cancel").click();
    return;
  }
  promptWindow.document.getElementById("password1Textbox").value = passphrase;
  promptDialog.getButton("accept").click();
}

/**
 * With the pref disabled, a key that uses the automatic protection has
 * nothing to manage, so the tab isn't shown.
 */
add_task(async function testAutoProtectedKeyWithPrefDisabled() {
  await importAutoProtectedKey();

  await withKeyDetails(ALICE_KEY_ID, async dialogWindow => {
    const doc = dialogWindow.document;
    Assert.ok(
      doc.getElementById("passphraseTab").hidden,
      "the passphrase tab should be hidden"
    );
    Assert.ok(
      doc.getElementById("passphrasePanel").hidden,
      "the passphrase panel should be hidden"
    );
    Assert.ok(
      !doc.getElementById("changeExpiryButton").disabled,
      "changing the expiration date should be offered, the primary secret key material is available"
    );
  });

  await OpenPGPTestUtils.removeKeyById(ALICE_KEY_ID, true);
});

/**
 * With the pref disabled, a key that is protected by a user-chosen
 * passphrase must still offer the tab, otherwise the user has no way to
 * return the key to the automatic protection.
 */
add_task(async function testPassphraseProtectedKeyWithPrefDisabled() {
  await importPassphraseProtectedKey();

  await withKeyDetails(ALICE_KEY_ID, async dialogWindow => {
    const doc = dialogWindow.document;

    Assert.ok(
      !doc.getElementById("passphraseTab").hidden,
      "the passphrase tab should be shown for a key that is protected by a passphrase"
    );
    Assert.equal(
      l10nId(dialogWindow, "passphraseStatus"),
      "openpgp-passphrase-status-user-passphrase",
      "the key should be reported as protected by a passphrase"
    );
    Assert.ok(
      doc.getElementById("passphraseInstruction").hidden,
      "the instruction should be hidden"
    );
    Assert.ok(
      doc.getElementById("lockBox").hidden,
      "setting a passphrase should not be offered while the pref is disabled"
    );
    Assert.ok(
      doc.getElementById("unlockBox").hidden,
      "unlocking should not be offered separately, it happens on demand"
    );
    Assert.ok(
      !doc.getElementById("removeProtection").hidden,
      "removing the passphrase protection should be offered"
    );
    Assert.ok(
      doc.getElementById("usePrimaryPassword").hidden,
      "no primary password is set, so that alternative should be hidden"
    );

    // Use the escape hatch, and unlock the key on demand while doing so.
    selectPassphraseTab(dialogWindow);
    await clickAndAnswerPrompt(
      dialogWindow,
      "removeProtection",
      ALICE_PASSPHRASE
    );

    await TestUtils.waitForCondition(
      () =>
        l10nId(dialogWindow, "passphraseStatus") ==
        "openpgp-passphrase-status-unprotected",
      "the key should be reported as using the automatic protection"
    );
    Assert.ok(
      doc.getElementById("removeProtection").hidden,
      "removing the passphrase protection should no longer be offered"
    );
  });

  // The change must be persistent, so the tab is no longer needed.
  await withKeyDetails(ALICE_KEY_ID, async dialogWindow => {
    Assert.equal(
      l10nId(dialogWindow, "passphraseStatus"),
      "openpgp-passphrase-status-unprotected",
      "the key should still use the automatic protection"
    );
    Assert.ok(
      dialogWindow.document.getElementById("passphraseTab").hidden,
      "the passphrase tab should be hidden again"
    );
  });

  await OpenPGPTestUtils.removeKeyById(ALICE_KEY_ID, true);
});

/**
 * With the pref enabled, a key that uses the automatic protection is
 * already unlocked, and a passphrase can be set for it.
 */
add_task(async function testAutoProtectedKeyWithPrefEnabled() {
  await SpecialPowers.pushPrefEnv({ set: [[PASSPHRASE_PREF, true]] });
  await importAutoProtectedKey();

  await withKeyDetails(ALICE_KEY_ID, async dialogWindow => {
    const doc = dialogWindow.document;

    Assert.ok(
      !doc.getElementById("passphraseTab").hidden,
      "the passphrase tab should be shown"
    );
    Assert.equal(
      l10nId(dialogWindow, "passphraseStatus"),
      "openpgp-passphrase-status-unprotected",
      "the key should be reported as using the automatic protection"
    );
    Assert.ok(
      !doc.getElementById("lockBox").hidden,
      "setting a passphrase should be offered"
    );
    Assert.ok(
      doc.getElementById("unlockBox").hidden,
      "unlocking should not be offered, the key is already unlocked"
    );
  });

  await OpenPGPTestUtils.removeKeyById(ALICE_KEY_ID, true);
  await SpecialPowers.popPrefEnv();
});

/**
 * A failed unlock must be reported, because a key pair consists of
 * several keys, and earlier keys may have been unlocked already.
 */
add_task(async function testUnlockFailureIsReported() {
  await SpecialPowers.pushPrefEnv({ set: [[PASSPHRASE_PREF, true]] });
  await importPassphraseProtectedKey();

  await withKeyDetails(ALICE_KEY_ID, async dialogWindow => {
    const doc = dialogWindow.document;

    Assert.ok(
      !doc.getElementById("unlockBox").hidden,
      "unlocking should be offered"
    );

    selectPassphraseTab(dialogWindow);
    await clickAndAnswerPrompt(dialogWindow, "unlock", null);

    await TestUtils.waitForCondition(
      () =>
        l10nId(dialogWindow, "passphraseInstruction") ==
        "openpgp-passphrase-unlock-failed",
      "the failed unlock should be reported"
    );
    Assert.ok(
      !doc.getElementById("passphraseInstruction").hidden,
      "the report should be visible"
    );
    Assert.ok(
      !doc.getElementById("unlockBox").hidden,
      "unlocking should still be offered"
    );

    await clickAndAnswerPrompt(dialogWindow, "unlock", ALICE_PASSPHRASE);

    await TestUtils.waitForCondition(
      () =>
        l10nId(dialogWindow, "passphraseInstruction") ==
        "openpgp-passphrase-unlocked",
      "the successful unlock should be reported"
    );
    Assert.ok(
      doc.getElementById("unlockBox").hidden,
      "unlocking should no longer be offered"
    );
    Assert.ok(
      !doc.getElementById("lockBox").hidden,
      "changing the passphrase should be offered"
    );
  });

  await OpenPGPTestUtils.removeKeyById(ALICE_KEY_ID, true);
  await SpecialPowers.popPrefEnv();
});

/**
 * Changing the expiration date requires a new signature by the primary
 * key, which is impossible if its secret key material is missing.
 */
add_task(async function testOfflinePrimaryKey() {
  await OpenPGPTestUtils.importPrivateKey(
    window,
    keyFile("ofelia-secret-subkeys.asc")
  );

  await withKeyDetails(OFELIA_KEY_ID, async dialogWindow => {
    Assert.ok(
      dialogWindow.document.getElementById("changeExpiryButton").disabled,
      "changing the expiration date must not be offered without the primary secret key material"
    );
    Assert.equal(
      l10nId(dialogWindow, "passphraseStatus"),
      "openpgp-passphrase-status-unprotected",
      "the subkeys should be reported as using the automatic protection"
    );
  });

  await OpenPGPTestUtils.removeKeyById(OFELIA_KEY_ID, true);
});
