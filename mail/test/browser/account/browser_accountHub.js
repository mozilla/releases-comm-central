/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// TODO: Defer this for when the account hub replaces the account setup tab.
// add_task(async function test_account_hub_opening_at_startup() {});

add_task(async function test_account_hub_opening() {
  // TODO: Use an actual button once it's implemented in the UI.
  // Open the dialog.
  await window.openAccountHub();

  const hub = document.querySelector("account-hub-container");
  await TestUtils.waitForCondition(
    () => hub.modal,
    "The dialog element was created"
  );

  const dialog = hub.shadowRoot.querySelector(".account-hub-dialog");
  Assert.ok(dialog.open, "The dialog element was opened");

  EventUtils.synthesizeKey("VK_ESCAPE", {}, window);
  await TestUtils.waitForCondition(
    () => !dialog.open,
    "The dialog element was closed"
  );

  // Open the dialog again.
  await window.openAccountHub();
  Assert.ok(dialog.open, "The dialog element was opened");

  EventUtils.synthesizeMouseAtCenter(
    hub.shadowRoot.querySelector("#closeButton"),
    {},
    window
  );
  await TestUtils.waitForCondition(
    () => !dialog.open,
    "The dialog element was closed"
  );
});
