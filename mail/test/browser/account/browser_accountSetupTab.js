/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { openAccountSetup } = ChromeUtils.import(
  "resource://testing-common/mozmill/AccountManagerHelpers.jsm"
);
var { mc } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

/**
 * Test the ability of dismissing the account setup without triggering the
 * generation of a local folders account nor the update of the mail UI.
 */
add_task(async function test_use_thunderbird_without_email() {
  // Delete all accounts to start clean.
  for (let account of MailServices.accounts.accounts) {
    MailServices.accounts.removeAccount(account, true);
  }

  // Confirm that we don't have any account in our test run.
  Assert.equal(
    MailServices.accounts.accounts.length,
    0,
    "No account currently configured"
  );

  let spacesToolbar = document.getElementById("spacesToolbar");
  Assert.ok(spacesToolbar, "The spaces toolbar exists");

  let spacesVisiblePromise = BrowserTestUtils.waitForCondition(
    () => !spacesToolbar.hidden,
    "The spaces toolbar is visible"
  );

  // Get the current tab, which should be the account setup tab.
  let tab = mc.window.document.getElementById("tabmail").selectedTab;
  Assert.equal(tab.browser.currentURI?.spec, "about:accountsetup");

  let tabDocument = tab.browser.contentWindow.document;

  let closeButton = tabDocument.getElementById("cancelButton");
  closeButton.scrollIntoView();

  // Close the account setup tab by clicking on the Cancel button.
  EventUtils.synthesizeMouseAtCenter(
    closeButton,
    {},
    tab.browser.contentWindow
  );

  // Confirm the exit dialog is visible.
  Assert.ok(tabDocument.getElementById("confirmExitDialog").open);

  // Check the checkbox and close the dialog.
  EventUtils.synthesizeMouseAtCenter(
    tabDocument.getElementById("useWithoutAccount"),
    {},
    tab.browser.contentWindow
  );
  EventUtils.synthesizeMouseAtCenter(
    tabDocument.getElementById("exitDialogConfirmButton"),
    {},
    tab.browser.contentWindow
  );

  // We should now have switched to the main mail tab.
  Assert.equal(
    mc.window.document.getElementById("tabmail").selectedTab.mode.name,
    "mail3PaneTab",
    "The currently selected tab is the primary Mail tab"
  );

  // Confirm the folder pane didn't load.
  // Assert.ok(!mc.window.document.getElementById("tabmail").currentTabInfo.folderPaneVisible); TODO

  // The spaces toolbar should be available and visible.
  await spacesVisiblePromise;

  // Confirm the pref was updated properly.
  Assert.ok(Services.prefs.getBoolPref("app.use_without_mail_account", false));
});

registerCleanupFunction(function () {
  // Reset the changed pref.
  Services.prefs.setBoolPref("app.use_without_mail_account", false);

  // Restore the local folders account.
  MailServices.accounts.createLocalMailAccount();
});
