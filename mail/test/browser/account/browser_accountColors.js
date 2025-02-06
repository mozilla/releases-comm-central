/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var {
  click_account_tree_row,
  get_account_tree_listitem,
  open_advanced_settings,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/AccountManagerHelpers.sys.mjs"
);

var { close_compose_window, compose_window_ready } = ChromeUtils.importESModule(
  "resource://testing-common/mail/ComposeHelpers.sys.mjs"
);
var { content_tab_e } = ChromeUtils.importESModule(
  "resource://testing-common/mail/ContentTabHelpers.sys.mjs"
);

var { FeedUtils } = ChromeUtils.importESModule(
  "resource:///modules/FeedUtils.sys.mjs"
);

var { promise_new_window } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);

var gPopAccount,
  gOriginalAccountCount,
  gFeedAccount,
  gLocalAccount,
  gComposeCtrl;

add_setup(async function () {
  // There may be pre-existing accounts from other tests.
  gOriginalAccountCount = MailServices.accounts.allServers.length;

  // Create a POP server.
  const popServer = MailServices.accounts
    .createIncomingServer("nobody", "foo.invalid", "pop3")
    .QueryInterface(Ci.nsIPop3IncomingServer);

  const identity = MailServices.accounts.createIdentity();
  identity.email = "tinderbox@foo.invalid";

  gPopAccount = MailServices.accounts.createAccount();
  gPopAccount.incomingServer = popServer;
  gPopAccount.addIdentity(identity);

  // Create a Feed account.
  gFeedAccount = FeedUtils.createRssAccount("rss");

  // Get the local folder account.
  gLocalAccount = MailServices.accounts.findAccountForServer(
    MailServices.accounts.localFoldersServer
  );

  Assert.equal(
    MailServices.accounts.allServers.length,
    gOriginalAccountCount + 2,
    "there should be two more accounts"
  );

  const composePromise = promise_new_window("msgcompose");
  EventUtils.synthesizeKey("n", { accelKey: true });
  gComposeCtrl = await compose_window_ready(composePromise);
});

registerCleanupFunction(async function () {
  // Remove our test account to leave the profile clean.
  if (gPopAccount) {
    MailServices.accounts.removeAccount(gPopAccount);
    gPopAccount = null;
  }
  if (gFeedAccount) {
    MailServices.accounts.removeAccount(gFeedAccount);
    gFeedAccount = null;
  }
  Assert.equal(
    MailServices.accounts.allServers.length,
    gOriginalAccountCount,
    "There should be only the original accounts left."
  );
  await close_compose_window(gComposeCtrl);
});

add_task(async function test_pop_account_color() {
  await open_advanced_settings(async function (tab) {
    await subtest_account_color(tab, gPopAccount);
  });
});

add_task(async function test_feed_account_color() {
  await open_advanced_settings(async function (tab) {
    // Feed accounts don't have an identity to send email from.
    await subtest_account_color(tab, gFeedAccount, true);
  });
});

add_task(async function test_local_account_color() {
  await open_advanced_settings(async function (tab) {
    await subtest_account_color(tab, gLocalAccount);
  });
});

/**
 *
 * @param {XULElement} tab - The account settings tab.
 * @param {msIMsgAccount} account - The account ot test.
 * @param {boolean} [skipCompose=false] - If the test should skip checking for
 *   the account color in the compose windows.
 */
async function subtest_account_color(tab, account, skipCompose = false) {
  const customColor = "#ff0000";
  const accountRow = get_account_tree_listitem(account.key, tab);
  const accountTree = content_tab_e(tab, "accounttree");
  await click_account_tree_row(tab, accountTree.rows.indexOf(accountRow));

  Assert.ok(
    !accountRow.querySelector(".icon").style.getPropertyValue("--icon-color"),
    "The account icon should not have any custom color"
  );

  const iframe =
    tab.browser.contentWindow.document.getElementById("contentFrame");
  const inputColor = iframe.contentDocument.getElementById("serverColor");

  SpecialPowers.MockColorPicker.init(inputColor.ownerGlobal);
  SpecialPowers.MockColorPicker.returnColor = customColor;
  const inputPromise = BrowserTestUtils.waitForEvent(inputColor, "input");
  EventUtils.synthesizeMouseAtCenter(inputColor, {}, inputColor.ownerGlobal);
  await inputPromise;
  SpecialPowers.MockColorPicker.cleanup();

  Assert.equal(
    accountRow.querySelector(".icon").style.getPropertyValue("--icon-color"),
    customColor,
    "The account icon should have a custom color"
  );

  const tabmail = document.getElementById("tabmail");
  // Switch to about3Pane.
  tabmail.switchToTab(0);
  Assert.equal(
    tabmail.currentAbout3Pane.folderTree
      .querySelector(
        `li[data-server-type][data-server-key="${account.incomingServer.key}"] .icon`
      )
      .style.getPropertyValue("--icon-color"),
    customColor,
    "The account icon in folder pane should have a custom color"
  );

  if (!skipCompose) {
    Assert.equal(
      gComposeCtrl.document
        .querySelector(
          `#msgIdentityPopup menuitem[accountkey="${account.key}"]`
        )
        .style.getPropertyValue("--icon-color"),
      customColor,
      "The identity menuitem in the message compose should have a custom color"
    );
  }

  // Switch back to account settings.
  tabmail.switchToTab(1);

  EventUtils.synthesizeMouseAtCenter(
    iframe.contentDocument.getElementById("resetColor"),
    {},
    inputColor.ownerGlobal
  );

  Assert.ok(
    !accountRow.querySelector(".icon").style.getPropertyValue("--icon-color"),
    "The account icon should not have a custom color anymore"
  );

  // Switch to about3Pane.
  tabmail.switchToTab(0);

  Assert.ok(
    !tabmail.currentAbout3Pane.folderTree
      .querySelector(
        `li[data-server-type][data-server-key="${account.incomingServer.key}"] .icon`
      )
      .style.getPropertyValue("--icon-color"),
    "The account icon in folder pane should not have a custom color"
  );

  if (!skipCompose) {
    Assert.ok(
      !gComposeCtrl.document
        .querySelector(
          `#msgIdentityPopup menuitem[accountkey="${account.key}"]`
        )
        .style.getPropertyValue("--icon-color"),
      "The identity menuitem in the message compose should not have a custom color"
    );
  }

  // Switch back to account settings.
  tabmail.switchToTab(1);
}
