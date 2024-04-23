/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the creation or import of an OpenPGP key.
 */

"use strict";

const {
  click_account_tree_row,
  get_account_tree_row,
  promise_account_tree_load,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/AccountManagerHelpers.sys.mjs"
);
var { open_content_tab_with_url } = ChromeUtils.importESModule(
  "resource://testing-common/mail/ContentTabHelpers.sys.mjs"
);
const { wait_for_frame_load } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);
const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
const { MockFilePicker } = ChromeUtils.importESModule(
  "resource://testing-common/MockFilePicker.sys.mjs"
);
const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mail/OpenPGPTestUtils.sys.mjs"
);

var gAccount;
var gIdentity;
var gTab;
var tabDocument;
var tabWindow;

const EXTERNAL_GNUP_KEY = "123456789ASD";

var gCreatedKeyId;
var gImportedKeyId;

/**
 * Set up the base account and identity.
 */
add_setup(async function () {
  gAccount = MailServices.accounts.createAccount();
  gAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "alice",
    "openpgp.example",
    "pop3"
  );
  gIdentity = MailServices.accounts.createIdentity();
  gIdentity.email = "alice@openpgp.example";
  gAccount.addIdentity(gIdentity);

  Services.prefs.setBoolPref("mail.openpgp.allow_external_gnupg", true);

  gTab = await open_content_tab_with_url("about:accountsettings");
  await promise_account_tree_load(gTab);

  // Open the End-to-End Encryption page.
  const accountRow = get_account_tree_row(gAccount.key, "am-e2e.xhtml", gTab);
  await click_account_tree_row(gTab, accountRow);

  const iframe =
    gTab.browser.contentWindow.document.getElementById("contentFrame");

  tabDocument = iframe.contentDocument;
  tabWindow = iframe.contentDocument.ownerGlobal;
});

/**
 * Test that we don't have any initial OpenPGP key configured in the
 * End-to-End Encryption page.
 */
add_task(async function check_clean_keylist() {
  // The OpenPGP Key List container should not be visible.
  Assert.equal(
    tabDocument.getElementById("openPgpKeyList").hidden,
    true,
    "The openPgpKeyList container shouldn't be visible"
  );

  // The OpenPGP Key List radiogroup should only have 1 item (the None).
  Assert.equal(
    tabDocument.getElementById("openPgpKeyListRadio").itemCount,
    1,
    "The OpenPGP Key List radiogroup should only have 1 item"
  );

  // The "None" radio item should be currently selected.
  Assert.equal(
    tabDocument.getElementById("openPgpNone").selected,
    true,
    "The openPgpNone radio option is currently selected"
  );
});

/**
 * Generate a new OpenPGP Key.
 */
add_task(async function generate_new_key() {
  // Open the key wizard from the "Add Key" button.
  const button = tabDocument.getElementById("addOpenPgpButton");
  EventUtils.synthesizeMouseAtCenter(button, {}, tabWindow);

  const wizard = await wait_for_frame_load(
    gTab.browser.contentWindow.gSubDialog._topDialog._frame,
    "chrome://openpgp/content/ui/keyWizard.xhtml"
  );
  const doc = wizard.document;
  const dialog = doc.documentElement.querySelector("dialog");

  const keyGenView = doc.getElementById("wizardCreateKey");

  // Accept the dialog since the first option should be automatically selected.
  dialog.acceptDialog();
  await BrowserTestUtils.waitForCondition(
    () => wizard.getComputedStyle(keyGenView).opacity == 1,
    "Timeout waiting for the #wizardCreateKey to appear"
  );

  // Change the expiration.
  EventUtils.synthesizeMouseAtCenter(
    doc.getElementById("keygenDoesNotExpire"),
    {},
    dialog.ownerGlobal
  );

  const wizardOverlay = doc.getElementById("wizardOverlay");

  // Move to the next screen.
  dialog.acceptDialog();
  await BrowserTestUtils.waitForCondition(
    () => wizard.getComputedStyle(wizardOverlay).opacity == 1,
    "Timeout waiting for the #wizardOverlay to appear"
  );

  // Store the wait event here before the SubDialog is destroyed and we can't
  // access it anymore.
  const frameWinUnload = BrowserTestUtils.waitForEvent(
    gTab.browser.contentWindow.gSubDialog._topDialog._frame.contentWindow,
    "unload",
    true
  );

  // Confirm the generation of the new key.
  const confirmButton = doc.getElementById("openPgpKeygenConfirmButton");
  EventUtils.synthesizeMouseAtCenter(confirmButton, {}, dialog.ownerGlobal);

  // Wait for the subdialog to close.
  info("Waiting for subdialog unload");
  await frameWinUnload;

  // The key wizard should automatically assign the newly generated key to the
  // selected identity and close the dialog. Let's wait for that change.
  await TestUtils.waitForCondition(
    () => gIdentity.getUnicharAttribute("openpgp_key_id"),
    "Timeout waiting for the newly generated key to be set"
  );
  gCreatedKeyId = gIdentity.getUnicharAttribute("openpgp_key_id");

  // The OpenPGP Key List radiogroup should only have 2 items now (None, and a key).
  Assert.equal(
    tabDocument.getElementById("openPgpKeyListRadio").itemCount,
    2,
    "The OpenPGP Key List radiogroup should have 2 items"
  );

  // The "None" radio item should NOT be selected.
  Assert.equal(
    tabDocument.getElementById("openPgpNone").selected,
    false,
    "The openPgpNone radio option should not be selected"
  );
});

/**
 * Import an OpenPGP secret key from file.
 */
add_task(async function import_secret_key() {
  // Open the key wizard from the "Add Key" button.
  const button = tabDocument.getElementById("addOpenPgpButton");
  EventUtils.synthesizeMouseAtCenter(button, {}, tabWindow);

  const wizard = await wait_for_frame_load(
    gTab.browser.contentWindow.gSubDialog._topDialog._frame,
    "chrome://openpgp/content/ui/keyWizard.xhtml"
  );
  const doc = wizard.document;
  const dialog = doc.documentElement.querySelector("dialog");

  // Change the selection to import a key.
  EventUtils.synthesizeMouseAtCenter(
    doc.getElementById("importOpenPgp"),
    {},
    dialog.ownerGlobal
  );

  const importView = doc.getElementById("wizardImportKey");

  // Accept the dialog to move to the next screen.
  dialog.acceptDialog();
  await BrowserTestUtils.waitForCondition(
    () => wizard.getComputedStyle(importView).opacity == 1,
    "Timeout waiting for the #wizardImportKey to appear"
  );

  const ChromeRegistry = Cc["@mozilla.org/chrome/chrome-registry;1"].getService(
    Ci.nsIChromeRegistry
  );
  const chromeUrl = Services.io.newURI(
    getRootDirectory(gTestPath) +
      "data/keys/alice@openpgp.example-0xf231550c4f47e38e-secret.asc"
  );
  gImportedKeyId = "0xf231550c4f47e38e";
  const fileUrl = ChromeRegistry.convertChromeURL(chromeUrl);
  const file = fileUrl.QueryInterface(Ci.nsIFileURL).file;

  MockFilePicker.init(window.browsingContext);
  MockFilePicker.setFiles([file]);
  MockFilePicker.returnValue = MockFilePicker.returnOK;

  const importButton = doc
    .getElementById("importKeyIntro")
    .querySelector("button");
  EventUtils.synthesizeMouseAtCenter(importButton, {}, dialog.ownerGlobal);

  // The container with the listed keys to import should be visible.
  await BrowserTestUtils.waitForCondition(
    () => !doc.getElementById("importKeyListContainer").collapsed,
    "Timeout waiting for the #importKeyListContainer to appear"
  );

  const keyList = doc.getElementById("importKeyList");

  // The dialog should display 1 key ready to be imported.
  Assert.equal(
    keyList.childNodes.length,
    1,
    "Only 1 fetched key is listed in the #importKeyList container"
  );

  // Be sure the listed private key is checked to be used as personal key.
  Assert.equal(
    keyList.querySelector("checkbox").checked,
    true,
    "The imported key is marked to be used as personal key"
  );

  // Accept the dialog to move to the next screen.
  dialog.acceptDialog();
  await BrowserTestUtils.waitForCondition(
    () => !doc.getElementById("importKeyListSuccess").collapsed,
    "Timeout waiting for the #importKeyListSuccess to appear"
  );

  const keyListRecap = doc.getElementById("importKeyListRecap");

  // The dialog should display 1 key ready to be imported.
  Assert.equal(
    keyListRecap.childNodes.length,
    1,
    "Only 1 imported key is listed in the #importKeyListRecap container"
  );

  const keyListRadio = tabDocument.getElementById("openPgpKeyListRadio");

  // Accept the dialog to close it.
  dialog.acceptDialog();
  await BrowserTestUtils.waitForCondition(
    () => keyListRadio.itemCount == 3,
    "Timeout waiting for the #importKeyListSuccess to appear"
  );

  Assert.equal(keyListRadio.itemCount, 3, "The 3 keys are listed");

  // The previously configured OpenPGP key should still be selected.
  Assert.equal(
    keyListRadio.selectedIndex,
    1,
    "The previously generated secret key is still selected"
  );
});

/**
 * Manually set and external GnuPG key.
 */
add_task(async function add_external_key() {
  // Open the key wizard from the "Add Key" button.
  const button = tabDocument.getElementById("addOpenPgpButton");
  EventUtils.synthesizeMouseAtCenter(button, {}, tabWindow);

  const wizard = await wait_for_frame_load(
    gTab.browser.contentWindow.gSubDialog._topDialog._frame,
    "chrome://openpgp/content/ui/keyWizard.xhtml"
  );
  const doc = wizard.document;
  const dialog = doc.documentElement.querySelector("dialog");

  // Change the selection to import a key.
  EventUtils.synthesizeMouseAtCenter(
    doc.getElementById("externalOpenPgp"),
    {},
    dialog.ownerGlobal
  );

  const externalView = doc.getElementById("wizardExternalKey");

  // Accept the dialog to move to the next screen.
  dialog.acceptDialog();
  await BrowserTestUtils.waitForCondition(
    () => wizard.getComputedStyle(externalView).opacity == 1,
    "Timeout waiting for the #wizardExternalKey to appear"
  );

  doc.getElementById("externalKey").focus();
  EventUtils.sendString(EXTERNAL_GNUP_KEY, wizard);

  const keyListRadio = tabDocument.getElementById("openPgpKeyListRadio");

  // Accept the dialog to close it.
  dialog.acceptDialog();
  await BrowserTestUtils.waitForCondition(
    () => keyListRadio.itemCount == 4,
    "Waiting for the newly imported key to be listed"
  );

  Assert.equal(keyListRadio.itemCount, 4, "The 4 keys are listed");

  // The first key should currently be selected.
  Assert.equal(
    keyListRadio.selectedIndex,
    1,
    "The external key is selected and listed at first position"
  );

  // Confirm that the currently listed key is correct.
  Assert.equal(
    gIdentity.getUnicharAttribute("openpgp_key_id"),
    EXTERNAL_GNUP_KEY,
    "The external key was properly set for the current identity"
  );
});

/**
 * Test that the "Go Back" button does not appear when the Key Wizard is opened
 * from the key manager.
 */
add_task(async function check_for_go_back_button() {
  const keyManagerPromise = BrowserTestUtils.domWindowOpened(
    null,
    async win => {
      await BrowserTestUtils.waitForEvent(win, "load");
      return (
        win.document.documentURI ===
        "chrome://openpgp/content/ui/enigmailKeyManager.xhtml"
      );
    }
  );
  //Open the key manager from the "OpenPGP Key Manager" button.
  const openPGPKeyManagerButton = tabDocument.getElementById(
    "openOpenPGPKeyManagerButton"
  );
  EventUtils.synthesizeMouseAtCenter(openPGPKeyManagerButton, {}, tabWindow);

  const kmWindow = await keyManagerPromise;

  const dialogPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://openpgp/content/ui/keyWizard.xhtml",
    {
      callback(win) {
        const doc = win.document;
        const dialog = doc.querySelector("dialog");
        const goBackButton = dialog.getButton("extra1");

        // The "Go Back" button should not be visible.
        Assert.equal(
          goBackButton.hidden,
          true,
          "The Go Back button should not be visible."
        );

        doc.querySelector("dialog").getButton("cancel").click();
      },
    }
  );
  // Open the key wizard from the "New Key Pair" menu option.
  kmWindow.document.getElementById("genKey").click();

  await dialogPromise;

  kmWindow.close();
});

registerCleanupFunction(async function () {
  document.getElementById("tabmail").closeTab(gTab);
  gTab = null;
  tabDocument = null;
  tabWindow = null;

  Services.prefs.clearUserPref("mail.openpgp.allow_external_gnupg");
  MailServices.accounts.removeAccount(gAccount, true);
  gAccount = null;
  await OpenPGPTestUtils.removeKeyById(gCreatedKeyId, true);
  await OpenPGPTestUtils.removeKeyById(gImportedKeyId, true);
});
