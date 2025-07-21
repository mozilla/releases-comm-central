/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { click_account_tree_row, get_account_tree_row, open_advanced_settings } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/AccountManagerHelpers.sys.mjs"
  );

// The account to use in tests.
var account;

add_setup(() => {
  account = MailServices.accounts.createAccount();
  const identity = MailServices.accounts.createIdentity();
  account.addIdentity(identity);

  // Create an EWS server and attach it to the account.
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "nobody",
    "test.test",
    "ews"
  );

  registerCleanupFunction(() => {
    // Make sure the account doesn't persist beyond the test.
    account.incomingServer.closeCachedConnections();
    MailServices.accounts.removeAccount(account, false);
  });
});

/**
 * Open the server settings dialog and return its top level iframe.
 *
 * @param {HTMLElement} accountSettingsTab
 * @returns {HTMLIFrameElement}
 */
async function selectAccountInSettings(accountSettingsTab) {
  // Navigate to the server settings for the account created in the setup.
  const accountRow = get_account_tree_row(
    account.key,
    "am-server.xhtml",
    accountSettingsTab
  );
  await click_account_tree_row(accountSettingsTab, accountRow);

  const iframe =
    accountSettingsTab.browser.contentWindow.document.getElementById(
      "contentFrame"
    ).contentDocument;
  return iframe;
}

/**
 * Tests that the authentication methods offered for EWS accounts match the ones
 * we actually support.
 */
add_task(async function test_ews_auth_methods() {
  await open_advanced_settings(async accountSettingsTab => {
    const iframe = await selectAccountInSettings(accountSettingsTab);

    const authMethodMenu = iframe.getElementById("server.authMethod");

    // Gather the items in the authentication methods menu and filter out the
    // ones that are hidden.
    const visibleItems = Array.from(
      authMethodMenu.getElementsByTagName("menuitem")
    ).filter(item => !item.hidden);

    // Make sure we have the right number of authentication methods.
    Assert.equal(
      visibleItems.length,
      2,
      "only two authentication methods should be offered"
    );

    // Make sure the first method is password. EWS does not offer different
    // options between cleartext and encrypted (this is decided by whether the
    // endpoint is HTTP or HTTPS); the "cleartext" option is used here for a
    // smoother UX.
    Assert.equal(
      visibleItems[0].id,
      "authMethod-password-cleartext",
      "the first available authentication method should be password"
    );

    // Make sure the second method is OAuth2.
    Assert.equal(
      visibleItems[1].id,
      "authMethod-oauth2",
      "the second available authentication method should be OAuth2"
    );
  });
});

add_task(async function test_ews_trash_settings() {
  const incomingServer = account.incomingServer;

  Assert.ok(
    incomingServer instanceof Ci.IEwsIncomingServer,
    "Incoming server should be an EWS incoming server."
  );

  const rootFolder = incomingServer.rootFolder;
  rootFolder.addSubfolder("trash1");
  incomingServer.trashFolderPath = "trash1";
  rootFolder.addSubfolder("trash2");

  await open_advanced_settings(async accountSettingsTab => {
    const iframe = await selectAccountInSettings(accountSettingsTab);

    // Get the label specifying the EWS trash path.
    const trashPathElement = iframe.getElementById("ews.trashFolderPath");
    Assert.ok(
      BrowserTestUtils.isHidden(trashPathElement),
      "Should have an element containing the trash path."
    );

    const deleteModelElement = iframe.getElementById("ews.deleteModel");
    Assert.ok(
      BrowserTestUtils.isVisible(deleteModelElement),
      "Should have the element specifying the delete model."
    );

    const trashFolderPickerElement = iframe.getElementById(
      "ewsMsgTrashFolderPicker"
    );
    Assert.ok(
      BrowserTestUtils.isVisible(trashFolderPickerElement),
      "Should have the trash folder picker popup element."
    );

    // Check the default values.
    Assert.equal(
      deleteModelElement.getAttribute("value"),
      Ci.IEwsIncomingServer.MOVE_TO_TRASH,
      "Default delete model should be move to trash (1)"
    );

    // Make sure the folder picker is enabled.
    Assert.ok(
      !trashFolderPickerElement.disabled,
      "Trash folder picker should be enabled."
    );

    // Change the UI and make sure the server updates.
    const deleteImmediatelyElement = iframe.getElementById(
      "ewsModelDeleteImmediately"
    );
    EventUtils.synthesizeMouseAtCenter(
      deleteImmediatelyElement,
      {},
      deleteImmediatelyElement.ownerGlobal
    );
    Assert.equal(
      incomingServer.deleteModel,
      Ci.IEwsIncomingServer.PERMANENTLY_DELETE,
      "Changing the delete model in the UI should update the server state."
    );

    // Make sure the trash folder picker was disabled.
    Assert.ok(
      trashFolderPickerElement.disabled,
      "Trash folder picker should be disabled."
    );
  });
});
