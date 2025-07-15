/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { click_account_tree_row, get_account_tree_row, open_advanced_settings } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/AccountManagerHelpers.sys.mjs"
  );

// The account to use in tests. It does not have an incoming server attached to
// it, which individual tests are expected to take care of.
var account;

add_setup(() => {
  account = MailServices.accounts.createAccount();
  const identity = MailServices.accounts.createIdentity();
  account.addIdentity(identity);

  registerCleanupFunction(() => {
    // Make sure the account doesn't persist beyond the test.
    MailServices.accounts.removeAccount(account, false);
  });
});

/**
 * Tests that the authentication methods offered for EWS accounts match the ones
 * we actually support.
 */
add_task(async function test_ews_auth_methods() {
  // Create an EWS server and attach it to the account.
  const ewsServer = MailServices.accounts.createIncomingServer(
    "nobody",
    "test.test",
    "ews"
  );
  account.incomingServer = ewsServer;

  await open_advanced_settings(async accountSettingsTab => {
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
