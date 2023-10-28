/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let account;
let messages;
const tabmail = document.getElementById("tabmail");

add_setup(async () => {
  account = createAccount();
  const rootFolder = account.incomingServer.rootFolder;
  const subFolders = rootFolder.subFolders;
  createMessages(subFolders[0], 10);
  messages = subFolders[0].messages;

  const about3Pane = tabmail.currentAbout3Pane;
  about3Pane.restoreState({
    folderPaneVisible: true,
    folderURI: subFolders[0],
    messagePaneVisible: true,
  });
  about3Pane.threadTree.selectedIndex = 0;
  await awaitBrowserLoaded(
    about3Pane.messageBrowser.contentWindow.getMessagePaneBrowser()
  );
});

async function subtest_popup_open_with_click_MV3_event_pages(
  terminateBackground
) {
  info("3-pane tab");
  {
    const testConfig = {
      manifest_version: 3,
      terminateBackground,
      actionType: "message_display_action",
      testType: "open-with-mouse-click",
      window: tabmail.currentAboutMessage,
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
  }

  info("Message tab");
  {
    await openMessageInTab(messages.getNext());
    const testConfig = {
      manifest_version: 3,
      terminateBackground,
      actionType: "message_display_action",
      testType: "open-with-mouse-click",
      window: tabmail.currentAboutMessage,
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

    tabmail.closeTab();
  }

  info("Message window");
  {
    const messageWindow = await openMessageInWindow(messages.getNext());
    const testConfig = {
      manifest_version: 3,
      terminateBackground,
      actionType: "message_display_action",
      testType: "open-with-mouse-click",
      window: messageWindow.messageBrowser.contentWindow,
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
