/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

add_task(async function accountHubOpensOnFirstRun() {
  await BrowserTestUtils.waitForMutationCondition(
    document.body,
    {
      childList: true,
      subtree: true,
    },
    () => document.querySelector("account-hub-container")
  );
  const accountHubContainer = document.querySelector("account-hub-container");
  const dialog = accountHubContainer.shadowRoot.querySelector("dialog");

  if (!dialog.open) {
    await BrowserTestUtils.waitForAttribute("open", dialog);
  }

  Assert.ok(
    BrowserTestUtils.isVisible(dialog),
    "Account hub dialog should be visible"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(dialog.querySelector("email-auto-form")),
    "Email step should be visible"
  );
});
