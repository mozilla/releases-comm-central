/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test checks that the account settings for IM accounts work.
 */

"use strict";

const { click_account_tree_row, get_account_tree_row, openAccountSettings } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/AccountManagerHelpers.sys.mjs"
  );
const { IMServices } = ChromeUtils.importESModule(
  "resource:///modules/IMServices.sys.mjs"
);

let chatAccount, frame;

add_setup(async () => {
  chatAccount = IMServices.accounts.createAccount(
    "test-management",
    "prpl-irc"
  );
  chatAccount.autoLogin = false;
  chatAccount.save();

  const incomingServer = MailServices.accounts.createIncomingServer(
    "test-management",
    "prpl-irc",
    "im"
  );
  incomingServer.wrappedJSObject.imAccount = chatAccount;
  incomingServer.valid = false;

  const mailAccount = MailServices.accounts.createAccount();
  mailAccount.incomingServer = incomingServer;
  incomingServer.valid = true;
  MailServices.accounts.notifyServerLoaded(incomingServer);

  const tab = await openAccountSettings();

  const rowIndex = get_account_tree_row(mailAccount.key, "", tab);
  info(`Chat account row index: ${rowIndex}`);
  await click_account_tree_row(tab, rowIndex);

  frame =
    tab.browser.contentWindow.document.getElementById(
      "contentFrame"
    ).contentWindow;

  registerCleanupFunction(() => {
    document.getElementById("tabmail").closeTab(tab);
    MailServices.accounts.removeAccount(mailAccount, true);
  });
});

add_task(async function test_loadingProtocolSpecificPrefs() {
  Assert.greater(
    frame.document.getElementById("protoSpecific").childElementCount,
    11,
    "Should have many protocol specific settings items"
  );
});

add_task(async function test_changingPrefs() {
  const autoLoginCheckbox = frame.document.getElementById("server.autologin");
  Assert.equal(
    autoLoginCheckbox.checked,
    chatAccount.autoLogin,
    "Auto login state should match what's saved in the account"
  );
  const initialState = chatAccount.autoLogin;

  EventUtils.synthesizeMouseAtCenter(autoLoginCheckbox, {}, frame);

  Assert.equal(
    autoLoginCheckbox.checked,
    chatAccount.autoLogin,
    "Auto login state should update to match what's saved in the account"
  );
  Assert.notEqual(
    autoLoginCheckbox.checked,
    initialState,
    "State of the checkbox should be different from it initial state"
  );

  chatAccount.autoLogin = initialState;
});
