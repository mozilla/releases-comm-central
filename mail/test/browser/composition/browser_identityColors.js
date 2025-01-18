/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { close_compose_window, compose_window_ready } = ChromeUtils.importESModule(
  "resource://testing-common/mail/ComposeHelpers.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { click_menus_in_sequence, promise_new_window } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/WindowHelpers.sys.mjs"
  );
var { AccountManagerUtils } = ChromeUtils.importESModule(
  "resource:///modules/AccountManagerUtils.sys.mjs"
);

var gPopAccount,
  gOriginalAccountCount,
  gLocalAccount,
  gComposeCtrl,
  popAMUtils,
  localAMUtils;

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
  popAMUtils = new AccountManagerUtils(gPopAccount);
  popAMUtils.updateServerColor("#ff0000");

  // Get the local folder account.
  gLocalAccount = MailServices.accounts.findAccountForServer(
    MailServices.accounts.localFoldersServer
  );
  localAMUtils = new AccountManagerUtils(gLocalAccount);
  localAMUtils.updateServerColor("#0000ff");

  Assert.equal(
    MailServices.accounts.allServers.length,
    gOriginalAccountCount + 1,
    "there should be one more account"
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
  Assert.equal(
    MailServices.accounts.allServers.length,
    gOriginalAccountCount,
    "There should be only the original accounts left."
  );
  await close_compose_window(gComposeCtrl);
});

add_task(async function test_compose_identity_colors() {
  const rgb2hex = rgb =>
    `#${rgb
      .match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/)
      .slice(1)
      .map(n => parseInt(n, 10).toString(16).padStart(2, "0"))
      .join("")}`;

  const identityList = gComposeCtrl.document.getElementById("msgIdentity");
  identityList.selectedIndex = 1;
  Assert.ok(
    identityList.classList.contains("has-custom-color"),
    "The identity list should display custom account colors"
  );

  let pseudoStyle = getComputedStyle(identityList._labelBox, "::before");
  Assert.equal(
    pseudoStyle.display,
    "block",
    "The ::before pseudo element should be visible"
  );

  Assert.equal(
    rgb2hex(
      getComputedStyle(
        identityList.menupopup.querySelector(
          `menuitem[accountkey="${gPopAccount.key}"]`
        ),
        "::before"
      ).backgroundColor
    ),
    "#ff0000",
    "The ::before pseudo element of the POP menulist item should use the correct color"
  );

  Assert.equal(
    rgb2hex(
      getComputedStyle(
        identityList.menupopup.querySelector(
          `menuitem[accountkey="${gLocalAccount.key}"]`
        ),
        "::before"
      ).backgroundColor
    ),
    "#0000ff",
    "The ::before pseudo element of the POP menulist item should use the correct color"
  );

  // Switch to the pop account.
  EventUtils.synthesizeMouseAtCenter(
    identityList,
    {},
    identityList.ownerGlobal
  );
  await click_menus_in_sequence(
    gComposeCtrl.document.getElementById("msgIdentityPopup"),
    [{ accountkey: gPopAccount.key }]
  );
  if (AppConstants.DEBUG) {
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  pseudoStyle = getComputedStyle(identityList._labelBox, "::before");
  Assert.equal(
    pseudoStyle.display,
    "block",
    "The ::before pseudo element of the selected POP account should be visible"
  );
  Assert.equal(
    rgb2hex(pseudoStyle.backgroundColor),
    "#ff0000",
    "The ::before pseudo element of the selected POP account should use the correct color"
  );

  // Switch to the local account.
  EventUtils.synthesizeMouseAtCenter(
    identityList,
    {},
    identityList.ownerGlobal
  );
  await click_menus_in_sequence(
    gComposeCtrl.document.getElementById("msgIdentityPopup"),
    [{ accountkey: gLocalAccount.key }]
  );
  if (AppConstants.DEBUG) {
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  pseudoStyle = getComputedStyle(identityList._labelBox, "::before");
  Assert.equal(
    pseudoStyle.display,
    "block",
    "The ::before pseudo element of the selected LOCAL account should be visible"
  );
  Assert.equal(
    rgb2hex(pseudoStyle.backgroundColor),
    "#0000ff",
    "The ::before pseudo element of the selected LOCAL account should use the correct color"
  );

  // Clear colors.
  popAMUtils.resetServerColor();
  localAMUtils.resetServerColor();
  if (AppConstants.DEBUG) {
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  Assert.ok(
    !identityList.classList.contains("has-custom-color"),
    "The identity list should not display custom account colors"
  );

  pseudoStyle = getComputedStyle(identityList._labelBox, "::before");
  Assert.equal(
    pseudoStyle.content,
    "none",
    "The ::before pseudo element of the identity list should not be visible"
  );
});
