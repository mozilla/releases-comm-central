/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let account;
let subFolders;

add_setup(async () => {
  account = createAccount();
  const rootFolder = account.incomingServer.rootFolder;
  subFolders = rootFolder.subFolders;
  createMessages(subFolders[0], 10);
  await TestUtils.waitForCondition(
    () => subFolders[0].messages.hasMoreElements(),
    "Messages should be added to folder"
  );
});

function getMessage() {
  const messages = subFolders[0].messages;
  ok(messages.hasMoreElements(), "Should have messages to iterate to");
  return messages.getNext();
}

async function subtest_popup_open_with_click_MV3_event_pages(
  terminateBackground
) {
  info("3-pane tab");
  const testConfig = {
    actionType: "action",
    manifest_version: 3,
    terminateBackground,
    testType: "open-with-mouse-click",
    window,
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

  info("Message window");
  {
    const messageWindow = await openMessageInWindow(getMessage());
    const testConfig = {
      actionType: "action",
      manifest_version: 3,
      terminateBackground,
      testType: "open-with-mouse-click",
      default_windows: ["messageDisplay"],
      window: messageWindow,
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
    messageWindow.close();
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
