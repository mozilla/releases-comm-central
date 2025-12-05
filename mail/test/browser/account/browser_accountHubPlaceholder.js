/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["mail.accounthub.enabled", true],
      ["ui.prefersReducedMotion", 1],
      [
        "mailnews.auto_config_url",
        "http://mochi.test:8888/browser/comm/mail/test/browser/account/xml/",
      ],
    ],
  });

  registerCleanupFunction(async function () {
    await SpecialPowers.popPrefEnv();
  });
});

add_task(async function test_account_hub_show_placeholder() {
  // Open the Account Hub directly with its function, no need to test menus.
  await window.openAccountHub();
  const dialog = await subtest_wait_for_account_hub_dialog();
  // Assert the placeholder is not shown.
  const placeholder = document
    .querySelector("account-hub-container")
    .shadowRoot.querySelector("#accountHubPlaceholder");
  ok(
    placeholder.hidden,
    "The placeholder should be hidden when the dialog is open."
  );
  // Click on the minimize button.
  const minimizeButton = dialog
    .querySelector("email-auto-form")
    .shadowRoot.querySelector("account-hub-header")
    .shadowRoot.querySelector("#minimizeButton");
  EventUtils.synthesizeMouseAtCenter(minimizeButton, {});
  ok(!dialog.open, "The dialog should be closed.");
  // Assert the placeholder is shown.
  ok(
    !placeholder.hidden,
    "The placeholder should be shown when the dialog is minimized."
  );

  // Ensures the dialog doesn't close when pressing Escape.
  EventUtils.synthesizeKey("KEY_Escape", {});
  ok(!placeholder.hidden, "The placeholder should still be visible.");
  ok(!dialog.open, "The dialog should still be closed.");

  // Click on the placeholder to close it.
  EventUtils.synthesizeMouseAtCenter(placeholder, {});
  // Assert the Account Hub is shown again.
  ok(
    dialog.open,
    "The dialog should open again after clicking the placeholder."
  );
  ok(
    placeholder.hidden,
    "The placeholder should be hidden when the dialog is open again."
  );

  await subtest_close_account_hub_dialog(
    dialog,
    dialog.querySelector("email-auto-form")
  );
});

add_task(async function test_account_hub_placeholder_switch_subview() {
  const emailUser = {
    name: "John Doe",
    email: "user@test.test",
  };

  // Open the Account Hub directly with its function, no need to test menus.
  await window.openAccountHub();
  const dialog = await subtest_wait_for_account_hub_dialog();
  const placeholder = document
    .querySelector("account-hub-container")
    .shadowRoot.querySelector("#accountHubPlaceholder");

  // Compile the initial fields.
  const emailTemplate = dialog.querySelector("email-auto-form");
  const nameInput = emailTemplate.querySelector("#realName");
  const emailInput = emailTemplate.querySelector("#email");

  // Ensure fields are empty.
  nameInput.value = "";
  emailInput.value = "";

  EventUtils.synthesizeMouseAtCenter(nameInput, {});
  let inputEvent = BrowserTestUtils.waitForEvent(
    nameInput,
    "input",
    false,
    event => event.target.value === emailUser.name
  );
  EventUtils.sendString(emailUser.name, window);
  await inputEvent;

  EventUtils.synthesizeMouseAtCenter(emailInput, {});
  inputEvent = BrowserTestUtils.waitForEvent(
    emailInput,
    "input",
    false,
    event => event.target.value === emailUser.email
  );
  EventUtils.sendString(emailUser.email, window);
  await inputEvent;

  const footerForward = dialog.querySelector("#emailFooter #forward");
  const configFoundTemplate = dialog.querySelector("email-config-found");

  // Click on the minimize button.
  const minimizeButton = dialog
    .querySelector("email-auto-form")
    .shadowRoot.querySelector("account-hub-header")
    .shadowRoot.querySelector("#minimizeButton");
  EventUtils.synthesizeMouseAtCenter(minimizeButton, {});
  ok(!dialog.open, "The dialog should be closed.");
  // Assert the placeholder is shown.
  ok(
    !placeholder.hidden,
    "The placeholder should be shown when the dialog is minimized."
  );

  // Force a fake click on the forward button since the view is currently
  // hidden. We do this to simulate the switch to a different subview when the
  // dialog is hidden.
  footerForward.click();

  await TestUtils.waitForCondition(
    () => dialog.open,
    "The dialog should be reopened."
  );
  ok(
    placeholder.hidden,
    "The placeholder should be hidden when the dialog is open again."
  );
  ok(
    BrowserTestUtils.isVisible(configFoundTemplate),
    "The config view should be visible."
  );

  await subtest_close_account_hub_dialog(
    dialog,
    dialog.querySelector("email-config-found")
  );
});

add_task(async function test_account_hub_placeholder_reopen() {
  const emailUser = {
    name: "John Doe",
    email: "user@test.test",
  };

  // Open the Account Hub directly with its function, no need to test menus.
  await window.openAccountHub();
  const dialog = await subtest_wait_for_account_hub_dialog();
  const placeholder = document
    .querySelector("account-hub-container")
    .shadowRoot.querySelector("#accountHubPlaceholder");

  await subtest_fill_initial_config_fields(dialog, emailUser);
  const configFoundTemplate = dialog.querySelector("email-config-found");
  ok(
    BrowserTestUtils.isVisible(configFoundTemplate),
    "The config view should be visible."
  );

  // Click on the minimize button.
  const minimizeButton = configFoundTemplate.shadowRoot
    .querySelector("account-hub-header")
    .shadowRoot.querySelector("#minimizeButton");

  EventUtils.synthesizeMouseAtCenter(minimizeButton, {});
  ok(!dialog.open, "The dialog should be closed.");
  // Assert the placeholder is shown.
  ok(
    !placeholder.hidden,
    "The placeholder should be shown when the dialog is minimized."
  );

  // Try to open the Account Hub again on the address book view while minimized.
  info("Reopen the Account Hub on the address book view.");
  await window.openAccountHub("ADDRESS_BOOK");
  // Assert the Account Hub is shown again.
  ok(
    dialog.open,
    "The dialog should open again after clicking the placeholder."
  );
  ok(
    placeholder.hidden,
    "The placeholder should be hidden when the dialog is open again."
  );
  ok(
    BrowserTestUtils.isVisible(configFoundTemplate),
    "The config view should still be visible and the view should be the same."
  );

  await subtest_close_account_hub_dialog(
    dialog,
    dialog.querySelector("email-config-found")
  );
});
