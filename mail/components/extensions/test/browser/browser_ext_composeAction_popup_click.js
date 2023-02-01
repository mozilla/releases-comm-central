/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let account;

add_setup(async () => {
  account = createAccount();
  addIdentity(account);
});

// This test clicks on the action button to open the popup.
add_task(async function test_popup_open_with_click() {
  for (let area of [null, "formattoolbar"]) {
    let composeWindow = await openComposeWindow(account);
    await focusWindow(composeWindow);

    await run_popup_test({
      actionType: "compose_action",
      testType: "open-with-mouse-click",
      window: composeWindow,
      default_area: area,
    });

    await run_popup_test({
      actionType: "compose_action",
      testType: "open-with-mouse-click",
      window: composeWindow,
      default_area: area,
      disable_button: true,
    });

    await run_popup_test({
      actionType: "compose_action",
      testType: "open-with-mouse-click",
      window: composeWindow,
      default_area: area,
      use_default_popup: true,
    });

    composeWindow.close();
    Services.xulStore.removeDocument(
      "chrome://messenger/content/messengercompose/messengercompose.xhtml"
    );
  }
});
