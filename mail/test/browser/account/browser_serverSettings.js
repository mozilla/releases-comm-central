/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { click_account_tree_row, get_account_tree_row, open_advanced_settings } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/AccountManagerHelpers.sys.mjs"
  );

const { wait_for_frame_load } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);

// The accounts to use in tests.
var ewsAccount;
var imapAccount;

add_setup(() => {
  ewsAccount = MailServices.accounts.createAccount();
  const identity = MailServices.accounts.createIdentity();
  ewsAccount.addIdentity(identity);

  // Create an EWS server and attach it to the account.
  ewsAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "nobody",
    "test.test",
    "ews"
  );

  imapAccount = MailServices.accounts.createAccount();
  imapAccount.addIdentity(MailServices.accounts.createIdentity());

  // Create an IMAP server and attach it to the account.
  imapAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "localhost",
    "imap"
  );

  registerCleanupFunction(() => {
    // Make sure the account doesn't persist beyond the test.
    ewsAccount.incomingServer.closeCachedConnections();
    imapAccount.incomingServer.closeCachedConnections();
    MailServices.accounts.removeAccount(ewsAccount, false);
    MailServices.accounts.removeAccount(imapAccount, false);
  });
});

/**
 * Open the server settings dialog and return its top level iframe.
 *
 * @param {HTMLElement} accountSettingsTab
 * @param {string} serverKey
 * @returns {HTMLIFrameElement}
 */
async function selectAccountInSettings(accountSettingsTab, serverKey) {
  // Navigate to the server settings for the account created in the setup.
  const accountRow = get_account_tree_row(
    serverKey,
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
    const iframe = await selectAccountInSettings(
      accountSettingsTab,
      ewsAccount.key
    );

    const authMethodMenu = iframe.getElementById("server.authMethod");

    // Gather the items in the authentication methods menu and filter out the
    // ones that are hidden.
    const visibleItems = Array.from(
      authMethodMenu.getElementsByTagName("html:option")
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
  const incomingServer = ewsAccount.incomingServer;

  Assert.ok(
    incomingServer instanceof Ci.IEwsIncomingServer,
    "Incoming server should be an EWS incoming server."
  );

  const rootFolder = incomingServer.rootFolder;
  rootFolder.addSubfolder("trash1");
  incomingServer.trashFolderPath = "trash1";
  rootFolder.addSubfolder("trash2");

  await open_advanced_settings(async accountSettingsTab => {
    const iframe = await selectAccountInSettings(
      accountSettingsTab,
      ewsAccount.key
    );

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

add_task(async function test_imap_trash_settings() {
  const incomingServer = imapAccount.incomingServer;

  Assert.ok(
    incomingServer instanceof Ci.nsIImapIncomingServer,
    "Incoming server should be an IMAP incoming server."
  );

  const rootFolder = incomingServer.rootFolder;
  rootFolder.addSubfolder("trash1");
  incomingServer.trashFolderName = "trash1";
  rootFolder.addSubfolder("trash2");

  await open_advanced_settings(async accountSettingsTab => {
    const iframe = await selectAccountInSettings(
      accountSettingsTab,
      imapAccount.key
    );

    // Get the label specifying the IMAP trash path.
    const trashPathElement = iframe.getElementById("imap.trashFolderName");
    Assert.ok(
      BrowserTestUtils.isHidden(trashPathElement),
      "Should have an element containing the trash path."
    );

    const deleteModelElement = iframe.getElementById("imap.deleteModel");
    Assert.ok(
      BrowserTestUtils.isVisible(deleteModelElement),
      "Should have the element specifying the delete model."
    );

    const trashFolderPickerElement = iframe.getElementById(
      "msgTrashFolderPicker"
    );
    Assert.ok(
      BrowserTestUtils.isVisible(trashFolderPickerElement),
      "Should have the trash folder picker popup element."
    );

    // Check the default values.
    Assert.equal(
      deleteModelElement.getAttribute("value"),
      Ci.nsMsgImapDeleteModels.MoveToTrash,
      "Default delete model should be move to trash (1)"
    );

    // Make sure the folder picker is enabled.
    Assert.ok(
      !trashFolderPickerElement.disabled,
      "Trash folder picker should be enabled."
    );

    // Change the UI and make sure the server updates.
    const deleteImmediatelyElement = iframe.getElementById(
      "modelDeleteImmediately"
    );
    EventUtils.synthesizeMouseAtCenter(
      deleteImmediatelyElement,
      {},
      deleteImmediatelyElement.ownerGlobal
    );
    Assert.equal(
      incomingServer.deleteModel,
      Ci.nsMsgImapDeleteModels.DeleteNoTrash,
      "Changing the delete model in the UI should update the server state."
    );

    // Make sure the trash folder picker was disabled.
    Assert.ok(
      trashFolderPickerElement.disabled,
      "Trash folder picker should be disabled."
    );

    // Change the UI and make sure the server updates.
    const markDeletedElement = iframe.getElementById("modelMarkDeleted");
    EventUtils.synthesizeMouseAtCenter(
      markDeletedElement,
      {},
      markDeletedElement.ownerGlobal
    );
    Assert.equal(
      incomingServer.deleteModel,
      Ci.nsMsgImapDeleteModels.IMAPDelete,
      "Changing the delete model in the UI should update the server state."
    );

    // Make sure the trash folder picker was disabled.
    Assert.ok(
      trashFolderPickerElement.disabled,
      "Trash folder picker should still be disabled."
    );
  });
});

/**
 * Tests that the IMAP server settings are correctly hidden for EWS accounts.
 */
add_task(async function test_ews_advanced_imap_settings() {
  await open_advanced_settings(async accountSettingsTab => {
    const iframe = await selectAccountInSettings(
      accountSettingsTab,
      ewsAccount.key
    );

    const advancedImapSettingsButton = iframe.getElementById(
      "server.imapAdvancedButton"
    );

    Assert.ok(
      BrowserTestUtils.isHidden(advancedImapSettingsButton),
      `Expected advancedImapSettingsButton to be hidden for EWS`
    );
  });
});

/**
 * Tests that inapplicable server settings are correctly hidden for EWS accounts.
 */
add_task(async function test_ews_advanced_settings_hidden_boxes() {
  await open_advanced_settings(async accountSettingsTab => {
    const iframe = await selectAccountInSettings(
      accountSettingsTab,
      ewsAccount.key
    );

    const hiddenContainerIds = [
      "server.useIdle.box",
      "pop3.downloadOnBiff.box",
      "pop3.settings.box",
      "nntp.articles.box",
      "nntp.pushAuth",
      "nntp.settings.box",
      "nntp.charset.box",
    ];

    for (const elementId of hiddenContainerIds) {
      const element = iframe.getElementById(elementId);

      Assert.ok(element, `Expected element #${elementId} to exist`);
      Assert.ok(
        BrowserTestUtils.isHidden(element),
        `Expected element #${elementId} to be hidden for EWS`
      );
    }
  });
});

/**
 * Wait for the advanced server settings dialog to open.
 *
 * @param {HTMLElement} tab
 * @returns {HTMLElement}
 */
async function waitForAdvancedDialog(tab) {
  return await wait_for_frame_load(
    tab.browser.contentWindow.gSubDialog._topDialog._frame,
    "chrome://messenger/content/am-server-advanced.xhtml"
  );
}

/**
 * Accept the advanced dialog and wait for it to close.
 *
 * @param {HTMLElement} dialog
 */
async function acceptDialogAndWaitForClose(dialog) {
  dialog.document.documentElement.querySelector("dialog").acceptDialog();
  await TestUtils.waitForCondition(() => !dialog.visible);
}

/**
 * Click the advanced settings button and wait for the advanced
 * settings dialog to open.
 *
 * @param {HTMLIFrameElement} iframe
 * @param {HTMLElement} accountSettingsTab
 * @returns {HTMLElement}
 */
async function openAdvancedDialog(iframe, accountSettingsTab) {
  const advancedSettingsButton = iframe.getElementById(
    "server.ewsAdvancedButton"
  );
  Assert.ok(
    !!advancedSettingsButton,
    "Should have advanced settings button for EWS."
  );

  EventUtils.synthesizeMouseAtCenter(
    advancedSettingsButton,
    {},
    advancedSettingsButton.ownerGlobal
  );

  return await waitForAdvancedDialog(accountSettingsTab);
}

/** Tests that setting the EWS Host URL changes the incoming server settings. */
add_task(async function test_ews_host_url_settings() {
  const incomingServer = ewsAccount.incomingServer;
  await open_advanced_settings(async accountSettingsTab => {
    const iframe = await selectAccountInSettings(
      accountSettingsTab,
      ewsAccount.key
    );

    // This page uses hidden elements to connect the advanced settings dialog to
    // the underlying save infrastructure.
    const ewsUrlDataElement = iframe.getElementById("ews.ewsUrl");
    Assert.ok(!!ewsUrlDataElement, "EWS URL data element should exist.");

    // The data elements should all be hidden.
    Assert.ok(
      !ewsUrlDataElement.visible,
      "EWS URL data element should be hidden."
    );

    const advancedDialog = await openAdvancedDialog(iframe, accountSettingsTab);

    const ewsUrlElement = advancedDialog.document.getElementById("ewsUrl");
    Assert.ok(!!ewsUrlElement, "Should have the Host URL element.");
    Assert.equal(
      ewsUrlElement.value,
      incomingServer.ewsUrl,
      "Host URL value should match incoming server URL."
    );

    // Get the original value.
    const originalHostUrl = incomingServer.ewsUrl;

    // Change to a new value.
    ewsUrlElement.focus();
    EventUtils.synthesizeKey("KEY_Delete", {}, ewsUrlElement.ownerGlobal);
    EventUtils.sendString("anothervalue", ewsUrlElement.ownerGlobal);

    await acceptDialogAndWaitForClose(advancedDialog);

    // Check the value of the hidden data element.
    Assert.equal(
      ewsUrlDataElement.value,
      "anothervalue",
      "EWS URL hidden data element value should have changed."
    );

    Assert.equal(
      incomingServer.ewsUrl,
      "anothervalue",
      "Incoming server Host URL should have changed."
    );

    // Reopen the dialog and reset the value.
    const advancedDialogReopened = await openAdvancedDialog(
      iframe,
      accountSettingsTab
    );

    const ewsUrlElementReopened =
      advancedDialogReopened.document.getElementById("ewsUrl");
    Assert.ok(!!ewsUrlElement, "Should have the Host URL element.");
    Assert.equal(
      ewsUrlElement.value,
      incomingServer.ewsUrl,
      "Host URL value should match incoming server URL."
    );

    ewsUrlElementReopened.focus();
    EventUtils.synthesizeKey("KEY_Delete", {}, ewsUrlElement.ownerGlobal);
    EventUtils.sendString(originalHostUrl, ewsUrlElementReopened.ownerGlobal);

    await acceptDialogAndWaitForClose(advancedDialogReopened);

    Assert.equal(
      incomingServer.ewsUrl,
      originalHostUrl,
      "EWS Host URL should have been reset."
    );
  });
});

/** Tests that changing the OAuth override settings correctly updates the incoming server. */
add_task(async function test_override_oauth_settings() {
  const incomingServer = ewsAccount.incomingServer;
  await open_advanced_settings(async accountSettingsTab => {
    const checkPref = Services.prefs.getBoolPref(
      "experimental.mail.ews.overrideOAuth.enabled",
      false
    );
    Assert.ok(checkPref, "pref should be enabled.");
    const iframe = await selectAccountInSettings(
      accountSettingsTab,
      ewsAccount.key
    );

    const dataElements = [
      "ews.ewsOverrideOAuthDetails",
      "ews.ewsApplicationId",
      "ews.ewsTenantId",
      "ews.ewsRedirectUri",
      "ews.ewsEndpointHost",
      "ews.ewsOAuthScopes",
    ];
    for (const dataElement of dataElements) {
      const element = iframe.getElementById(dataElement);
      Assert.ok(!!element, `Data element ${dataElement} should exist.`);
      Assert.ok(
        !element.visible,
        `Data element ${dataElement} should not be visible.`
      );
    }

    const advancedDialog = await openAdvancedDialog(iframe, accountSettingsTab);

    const oauthOverrideControl = advancedDialog.document.getElementById(
      "ewsOverrideOAuthDetails"
    );
    Assert.ok(!!oauthOverrideControl, "OAuth override checkbox should exist.");
    Assert.ok(
      !oauthOverrideControl.checked,
      "OAuth override checkbox should be unchecked."
    );

    const inputElementIds = [
      "ewsApplicationId",
      "ewsTenantId",
      "ewsRedirectUri",
      "ewsEndpointHost",
      "ewsOAuthScopes",
    ];
    const inputElements = inputElementIds.map(id =>
      advancedDialog.document.getElementById(id)
    );
    for (const inputElement of inputElements) {
      Assert.ok(
        inputElement.disabled,
        `Input element ${inputElement.id} should be disabled.`
      );
    }

    EventUtils.synthesizeMouseAtCenter(
      oauthOverrideControl,
      {},
      oauthOverrideControl.ownerGlobal
    );

    for (const inputElement of inputElements) {
      Assert.ok(
        !inputElement.disabled,
        `Input element ${inputElement.id} should be enabled.`
      );
    }

    for (const inputElement of inputElements) {
      inputElement.focus();
      EventUtils.synthesizeKey("KEY_Delete", {}, inputElement.ownerGlobal);
      EventUtils.sendString("changed_value", inputElement.ownerGlobal);
    }

    await acceptDialogAndWaitForClose(advancedDialog);

    Assert.ok(
      incomingServer.ewsOverrideOAuthDetails,
      "Incoming server should have override OAuth details selected."
    );
    Assert.equal(
      incomingServer.ewsApplicationId,
      "changed_value",
      "EWS Application ID should have changed."
    );
    Assert.equal(
      incomingServer.ewsTenantId,
      "changed_value",
      "EWS Tenant ID should have changed."
    );
    Assert.equal(
      incomingServer.ewsRedirectUri,
      "changed_value",
      "EWS Redirect URI should have changed."
    );
    Assert.equal(
      incomingServer.ewsEndpointHost,
      "changed_value",
      "EWS Endpoint Host should have changed."
    );
    Assert.equal(
      incomingServer.ewsOAuthScopes,
      "changed_value",
      "EWS OAuth Scopes should have changed."
    );
  });
});
