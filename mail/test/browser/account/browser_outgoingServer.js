/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { click_account_tree_row, get_account_tree_row, open_advanced_settings } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/AccountManagerHelpers.sys.mjs"
  );

var account;

add_setup(async function () {
  // Some previous tests or infrastructure might have left stray SMTP servers
  // around, and we need to start with a clean slate.
  for (const server of MailServices.outgoingServer.servers) {
    MailServices.outgoingServer.deleteServer(server);
  }

  const imapServer = MailServices.accounts
    .createIncomingServer("nobody", "local.test", "imap")
    .QueryInterface(Ci.nsIImapIncomingServer);

  account = MailServices.accounts.createAccount();
  const identity = MailServices.accounts.createIdentity();
  account.incomingServer = imapServer;
  account.addIdentity(identity);

  // Create and configure two outgoing servers: an SMTP one and a non-SMTP one
  // (EWS is used in the latter case).
  const smtpServer = MailServices.outgoingServer.createServer("smtp");
  smtpServer.username = "alice@local-smtp.test";
  smtpServer.authMethod = Ci.nsMsgAuthMethod.OAuth2;

  const smtpServer2 = smtpServer.QueryInterface(Ci.nsISmtpServer);
  smtpServer2.hostname = "local-smtp.test";
  smtpServer2.port = 587;

  const ewsServer = MailServices.outgoingServer.createServer("ews");
  ewsServer.username = "alice@local-ews.test";
  ewsServer.authMethod = Ci.nsMsgAuthMethod.OAuth2;

  const ewsServer2 = ewsServer.QueryInterface(Ci.nsIEwsServer);
  ewsServer2.initialize("https://local-ews.test/EWS/Exchange.asmx");

  registerCleanupFunction(() => {
    MailServices.outgoingServer.deleteServer(smtpServer);
    MailServices.outgoingServer.deleteServer(ewsServer);
    MailServices.accounts.removeAccount(account, false);
  });
});

/**
 * Test that the settings for outgoing servers can be shown for both SMTP and
 * non-SMTP servers in the "Outgoing Servers" view, and that non-SMTP servers
 * aren't editable from there.
 */
add_task(async function test_outgoingSettings() {
  // Open an account settings tab and run the test in there.
  await open_advanced_settings(async accountSettingsTab => {
    // Navigate to the "Outgoing Servers" section.
    const outgoingRow = get_account_tree_row(null, null, accountSettingsTab);
    await click_account_tree_row(accountSettingsTab, outgoingRow);

    const iframe =
      accountSettingsTab.browser.contentWindow.document.getElementById(
        "contentFrame"
      ).contentDocument;

    // Get the localization bundle. We'll use it later to verify that the
    // localized server type is correct depending on the selected server.
    const bundle = document.getElementById("bundle_messenger");

    // The elements we will be keeping an eye on during this test.
    const typeEl = iframe.getElementById("typeValue");
    const editButton = iframe.getElementById("editButton");

    // The list of entries in the outgoing server list shown to the user.
    const serverList = iframe
      .getElementById("smtpList")
      .getElementsByClassName("smtpServerListItem");

    // Click on the first server we created (SMTP).
    EventUtils.synthesizeMouseAtCenter(
      serverList[0],
      {},
      serverList[0].ownerGlobal
    );
    await TestUtils.waitForTick();

    // Check that we're showing the correct view for the SMTP server.
    Assert.equal(
      typeEl.textContent,
      bundle.getString("serverType-smtp"),
      "the selected server type should be SMTP"
    );
    Assert.ok(
      !editButton.disabled,
      "the edit button should be enabled for SMTP"
    );

    // Now click on the second server we created (EWS).
    EventUtils.synthesizeMouseAtCenter(
      serverList[1],
      {},
      serverList[1].ownerGlobal
    );
    await TestUtils.waitForTick();

    // Check that we're showing the correct view for a non-SMTP/EWS server.
    Assert.equal(
      typeEl.textContent,
      bundle.getString("serverType-ews"),
      "the selected server type should be EWS"
    );
    Assert.ok(
      editButton.disabled,
      "the edit button should be disabled for non-SMTP servers"
    );
  });
});

/**
 * Tests that the account settings view allows the user to change the outgoing
 * server for the current account, and that non-SMTP servers aren't editable
 * from there.
 */
add_task(async function test_accountSettings() {
  // Open an account settings tab and run the test in there.
  await open_advanced_settings(async accountSettingsTab => {
    // Navigate to the main settings for the account created in the setup.
    const accountRow = get_account_tree_row(
      account.key,
      null,
      accountSettingsTab
    );
    await click_account_tree_row(accountSettingsTab, accountRow);

    const doc =
      accountSettingsTab.browser.contentWindow.document.getElementById(
        "contentFrame"
      ).contentDocument;

    if (doc.hasPendingL10nMutations) {
      await BrowserTestUtils.waitForEvent(doc, "L10nMutationsFinished");
    }

    await SimpleTest.promiseFocus(doc.ownerGlobal);

    // The button to edit the settings of the selected outgoing server, which
    // state we'll observe throughout the test.
    const editButton = doc.getElementById("editSmtp");

    // The list of outgoing servers available for the current account.
    const menu = doc.getElementById("identity.smtpServerKey");
    const serverList = menu.getElementsByTagName("menuitem");

    menu.scrollIntoView({ block: "start", behavior: "instant" });

    // Open the menu and select the first server we created (SMTP). The element at
    // index 0 is the "Use Default Server" option.
    info("Opening Outgoing Server menu to select first created server...");

    EventUtils.synthesizeMouseAtCenter(menu, {}, menu.ownerGlobal);
    await BrowserTestUtils.waitForPopupEvent(menu, "shown");

    EventUtils.synthesizeMouseAtCenter(
      serverList[1],
      {},
      serverList[1].ownerGlobal
    );
    await BrowserTestUtils.waitForPopupEvent(menu, "hidden");

    // Check that the item that's currently selected is the correct one (SMTP)
    // and that the edit button is in the correct state.
    Assert.stringMatches(
      menu.selectedItem.value,
      /^smtp/,
      "the selected server should be an SMTP server"
    );
    Assert.ok(
      !editButton.disabled,
      "the edit button should be enabled for SMTP"
    );

    // Now open the menu again and select the second server we created (EWS).
    info("Opening Outgoing Server menu again to select ews server...");
    EventUtils.synthesizeMouseAtCenter(menu, {}, menu.ownerGlobal);
    await BrowserTestUtils.waitForPopupEvent(menu, "shown");

    EventUtils.synthesizeMouseAtCenter(
      serverList[2],
      {},
      serverList[2].ownerGlobal
    );
    await BrowserTestUtils.waitForPopupEvent(menu, "hidden");

    // Check that the item that's currently selected is the correct one
    // (non-SMTP/EWS) and that the edit button is in the correct state.
    Assert.stringMatches(
      menu.selectedItem.value,
      /^ews/,
      "the selected server should be an EWS (non-SMTP) server"
    );
    Assert.ok(
      editButton.disabled,
      "the edit button should be disabled for non-SMTP servers"
    );
  });
});
