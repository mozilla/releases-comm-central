/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const PREF_NAME = "mailnews.auto_config_url";
const PREF_VALUE = Services.prefs.getCharPref(PREF_NAME);

add_setup(async () => {
  // Set the pref to load a local autoconfig file.
  const url =
    "http://mochi.test:8888/browser/comm/mail/test/browser/account/xml/";
  await SpecialPowers.pushPrefEnv({
    set: [[PREF_NAME, url]],
  });
});

add_task(async function test_account_hub_first_run() {
  const dialog = await subtest_open_account_hub_dialog();
  Assert.ok(
    dialog.classList.contains("account-hub-first-run"),
    "Should have the first run class"
  );
  Assert.ok(
    window.AccountHubController.isFirstRun,
    "Should have first run correctly set"
  );

  await SpecialPowers.pushPrefEnv({
    set: [["mail.provider.suppress_dialog_on_startup", true]],
  });

  Assert.ok(
    dialog.classList.contains("account-hub-first-run"),
    "Should still have have the first run class after update before reopening"
  );
  Assert.equal(
    window.AccountHubController.isFirstRun,
    true,
    "Should still have first run true after update before reopening"
  );

  let closeEvent = BrowserTestUtils.waitForEvent(dialog, "close");
  EventUtils.synthesizeKey("KEY_Escape", {});
  await closeEvent;

  await subtest_open_account_hub_dialog();

  Assert.ok(
    !dialog.classList.contains("account-hub-first-run"),
    "Should not have the first run class"
  );
  Assert.ok(
    !window.AccountHubController.isFirstRun,
    "Should have first run correctly set after reopen"
  );

  closeEvent = BrowserTestUtils.waitForEvent(dialog, "close");
  EventUtils.synthesizeMouseAtCenter(
    dialog
      .querySelector("email-auto-form")
      .shadowRoot.querySelector("account-hub-header")
      .shadowRoot.querySelector("#closeButton"),
    {}
  );
  await closeEvent;
  Assert.ok(
    !dialog.open,
    "The dialog element should close when clicking on the close button"
  );

  await SpecialPowers.popPrefEnv();
});
