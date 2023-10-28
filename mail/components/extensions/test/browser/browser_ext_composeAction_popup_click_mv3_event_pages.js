/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let account;

add_setup(async () => {
  account = createAccount();
  addIdentity(account);
});

async function subtest_popup_open_with_click_MV3_event_pages(
  terminateBackground
) {
  for (const area of [null, "formattoolbar"]) {
    const composeWindow = await openComposeWindow(account);
    await focusWindow(composeWindow);
    const testConfig = {
      manifest_version: 3,
      terminateBackground,
      actionType: "compose_action",
      testType: "open-with-mouse-click",
      window: composeWindow,
      default_area: area,
    };

    await run_popup_test({
      ...testConfig,
    });
    await run_popup_test({
      ...testConfig,
      disable_button: true,
    });
    await run_popup_test({
      ...testConfig,
      use_default_popup: true,
    });

    composeWindow.close();
    Services.xulStore.removeDocument(
      "chrome://messenger/content/messengercompose/messengercompose.xhtml"
    );
  }
}
// This MV3 test clicks on the action button to open the popup.
add_task(async function test_event_pages_without_background_termination() {
  await subtest_popup_open_with_click_MV3_event_pages(false);
});
// This MV3 test clicks on the action button to open the popup (background termination).
add_task(async function test_event_pages_with_background_termination() {
  await subtest_popup_open_with_click_MV3_event_pages(true);
});
