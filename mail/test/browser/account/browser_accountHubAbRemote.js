/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

add_task(async function test_remoteAddressBookFormGoesToPwForm() {
  const dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");
  await goToRemoteForm(dialog);
  await fillInForm(dialog, "test@example.com", "https://example.com/");

  const passwordStep = dialog.querySelector("#addressBookPasswordSubview");
  await BrowserTestUtils.waitForAttributeRemoval("hidden", passwordStep);

  Assert.ok(
    BrowserTestUtils.isVisible(passwordStep),
    "Should show password entry step"
  );

  await dialog.querySelector("account-hub-address-book").reset();
});

add_task(async function test_remoteAddressBookFormPwFromStorage() {
  const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
    Ci.nsILoginInfo
  );
  login.init(
    "https://example.com",
    null,
    "",
    "test@example.com",
    "hunter2",
    "",
    ""
  );
  await Services.logins.addLoginAsync(login);
  const dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");
  await goToRemoteForm(dialog);
  await fillInForm(dialog, "test@example.com", "https://example.com/", false);

  Assert.ok(
    BrowserTestUtils.isHidden(
      dialog.querySelector("#addressBookPasswordSubview")
    ),
    "Should not get password entry step"
  );

  Services.logins.removeLogin(login);

  await dialog.querySelector("account-hub-address-book").reset();
});

add_task(
  async function test_remoteAddressBookFormInferHostFromUsernamePwFromStorage() {
    const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
      Ci.nsILoginInfo
    );
    login.init(
      "https://example.com",
      null,
      "",
      "test@example.com",
      "hunter2",
      "",
      ""
    );
    await Services.logins.addLoginAsync(login);
    const dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");
    await goToRemoteForm(dialog);
    await fillInForm(dialog, "test@example.com", "", false);

    // We are using the login being found as implicit check that the URL got
    // properly expanded from the username field.
    Assert.ok(
      BrowserTestUtils.isHidden(
        dialog.querySelector("#addressBookPasswordSubview")
      ),
      "Should not get password entry step"
    );

    Services.logins.removeLogin(login);

    await dialog.querySelector("account-hub-address-book").reset();
  }
);

add_task(async function test_remoteAddressBookFormOauth() {
  const dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");
  await goToRemoteForm(dialog);
  await fillInForm(dialog, "test@mochi.test", "https://mochi.test/", false);

  Assert.ok(
    BrowserTestUtils.isHidden(
      dialog.querySelector("#addressBookPasswordSubview")
    ),
    "Should not get password entry step"
  );

  await dialog.querySelector("account-hub-address-book").reset();
});

/**
 * Open the remote address book form in the account hub dialog.
 *
 * @param {HTMLDialogElement} dialog - The account hub dialog.
 */
async function goToRemoteForm(dialog) {
  const remoteAccountFormSubview = dialog.querySelector(
    "#addressBookRemoteAccountFormSubview"
  );

  EventUtils.synthesizeMouseAtCenter(
    dialog.querySelector("address-book-option-select #addRemoteAddressBook"),
    {},
    window
  );
  await BrowserTestUtils.waitForAttributeRemoval(
    "hidden",
    remoteAccountFormSubview
  );
  Assert.ok(
    BrowserTestUtils.isVisible(remoteAccountFormSubview),
    "Remote account form subview should be visible"
  );
}

/**
 * Fill in the remote address book form and submit it.
 *
 * @param {HTMLDialogElement} dialog - The account hub dialog.
 * @param {string} username - The username for the address book.
 * @param {string} [server] - The server URL, can be omitted for auto detection.
 * @param {boolean} [shouldContinue=true] - If we're expecting form submission
 *   to advance.
 */
async function fillInForm(dialog, username, server, shouldContinue = true) {
  const remoteAccountFormSubview = dialog.querySelector(
    "#addressBookRemoteAccountFormSubview"
  );
  const forward = dialog.querySelector("#addressBookFooter #forward");

  EventUtils.sendString(username);
  if (server) {
    EventUtils.synthesizeKey("KEY_Tab", {}, window);
    EventUtils.sendString(server);
  }

  await BrowserTestUtils.waitForAttributeRemoval("disabled", forward);

  EventUtils.synthesizeMouseAtCenter(forward, {}, window);

  if (!shouldContinue) {
    return;
  }
  await BrowserTestUtils.waitForMutationCondition(
    remoteAccountFormSubview,
    {
      attributes: true,
      attributeFilter: ["hidden"],
    },
    () => BrowserTestUtils.isHidden(remoteAccountFormSubview)
  );
}
