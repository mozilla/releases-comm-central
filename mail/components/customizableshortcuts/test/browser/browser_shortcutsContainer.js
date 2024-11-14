/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Test that the shortcuts container opens up properly and closes as it should.

add_task(async function test_customizable_shortcuts_opening() {
  // TODO: Use an actual button once it's implemented in the UI.
  // Open the dialog.
  await window.openCustomizableShortcuts();

  const container = document.querySelector("shortcuts-container");
  await BrowserTestUtils.waitForMutationCondition(
    container,
    { childList: true },
    () => !!container.modal
  );
  Assert.ok(container.modal, "The dialog element was created");

  const dialog = container.shadowRoot.querySelector("dialog");
  Assert.ok(dialog.open, "The dialog element was opened");

  EventUtils.synthesizeKey("KEY_Escape", {}, window);
  await BrowserTestUtils.waitForEvent(dialog, "close");
  Assert.ok(!dialog.open, "The dialog element was closed");

  // Open the dialog again.
  await window.openCustomizableShortcuts();
  Assert.ok(dialog.open, "The dialog element was opened");

  EventUtils.synthesizeMouseAtCenter(
    container.shadowRoot.querySelector("#close"),
    {},
    window
  );
  await BrowserTestUtils.waitForEvent(dialog, "close");
  Assert.ok(!dialog.open, "The dialog element was closed");
});
