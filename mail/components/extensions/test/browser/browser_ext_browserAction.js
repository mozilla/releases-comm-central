/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { AddonManager } = ChromeUtils.import(
  "resource://gre/modules/AddonManager.jsm"
);

let account;
let messages;

add_task(async () => {
  account = createAccount();
  let rootFolder = account.incomingServer.rootFolder;
  let subFolders = rootFolder.subFolders;
  createMessages(subFolders[0], 10);
  messages = subFolders[0].messages;

  // This tests selects a folder, so make sure the folder pane is visible.
  if (
    document.getElementById("folderpane_splitter").getAttribute("state") ==
    "collapsed"
  ) {
    window.MsgToggleFolderPane();
  }
  if (window.IsMessagePaneCollapsed()) {
    window.MsgToggleMessagePane();
  }

  window.gFolderTreeView.selectFolder(subFolders[0]);
  window.gFolderDisplay.selectViewIndex(0);
  await BrowserTestUtils.browserLoaded(window.getMessagePaneBrowser());
});

// This test clicks on the action button to open the popup.
add_task(async function test_popup_open_with_click() {
  info("3-pane tab");
  await run_popup_test({
    actionType: "browser_action",
    testType: "open-with-mouse-click",
    window,
  });

  await run_popup_test({
    actionType: "browser_action",
    testType: "open-with-mouse-click",
    disable_button: true,
    window,
  });

  await run_popup_test({
    actionType: "browser_action",
    testType: "open-with-mouse-click",
    use_default_popup: true,
    window,
  });

  await run_popup_test({
    actionType: "browser_action",
    testType: "open-with-mouse-click",
    default_area: "tabstoolbar",
    window,
  });

  await run_popup_test({
    actionType: "browser_action",
    testType: "open-with-mouse-click",
    disable_button: true,
    default_area: "tabstoolbar",
    window,
  });

  await run_popup_test({
    actionType: "browser_action",
    testType: "open-with-mouse-click",
    use_default_popup: true,
    default_area: "tabstoolbar",
    window,
  });

  info("Message window");
  let messageWindow = await openMessageInWindow(messages.getNext());
  await run_popup_test({
    actionType: "browser_action",
    testType: "open-with-mouse-click",
    default_windows: ["messageDisplay"],
    window: messageWindow,
  });

  await run_popup_test({
    actionType: "browser_action",
    testType: "open-with-mouse-click",
    default_windows: ["messageDisplay"],
    disable_button: true,
    window: messageWindow,
  });

  await run_popup_test({
    actionType: "browser_action",
    testType: "open-with-mouse-click",
    default_windows: ["messageDisplay"],
    use_default_popup: true,
    window: messageWindow,
  });
  messageWindow.close();
});

// This test uses a command from the menus API to open the popup.
add_task(async function test_popup_open_with_menu_command() {
  info("3-pane tab");
  await run_popup_test({
    actionType: "browser_action",
    testType: "open-with-menu-command",
    use_default_popup: true,
    window,
  });

  await run_popup_test({
    actionType: "browser_action",
    testType: "open-with-menu-command",
    disable_button: true,
    window,
  });

  await run_popup_test({
    actionType: "browser_action",
    testType: "open-with-menu-command",
    window,
  });

  await run_popup_test({
    actionType: "browser_action",
    testType: "open-with-menu-command",
    default_area: "tabstoolbar",
    use_default_popup: true,
    window,
  });

  await run_popup_test({
    actionType: "browser_action",
    testType: "open-with-menu-command",
    default_area: "tabstoolbar",
    disable_button: true,
    window,
  });

  await run_popup_test({
    actionType: "browser_action",
    testType: "open-with-menu-command",
    default_area: "tabstoolbar",
    window,
  });

  info("Message window");
  let messageWindow = await openMessageInWindow(messages.getNext());
  await run_popup_test({
    actionType: "browser_action",
    testType: "open-with-menu-command",
    use_default_popup: true,
    default_windows: ["messageDisplay"],
    window: messageWindow,
  });

  await run_popup_test({
    actionType: "browser_action",
    testType: "open-with-menu-command",
    disable_button: true,
    default_windows: ["messageDisplay"],
    window: messageWindow,
  });

  await run_popup_test({
    actionType: "browser_action",
    testType: "open-with-menu-command",
    default_windows: ["messageDisplay"],
    window: messageWindow,
  });
  messageWindow.close();
});

add_task(async function test_theme_icons() {
  let extension = ExtensionTestUtils.loadExtension({
    manifest: {
      applications: {
        gecko: {
          id: "browser_action_properties@mochi.test",
        },
      },
      browser_action: {
        default_title: "default",
        default_icon: "default.png",
        theme_icons: [
          {
            dark: "dark.png",
            light: "light.png",
            size: 16,
          },
        ],
      },
    },
  });

  await extension.startup();

  let uuid = extension.uuid;
  let button = document.getElementById(
    "browser_action_properties_mochi_test-browserAction-toolbarbutton"
  );

  let dark_theme = await AddonManager.getAddonByID(
    "thunderbird-compact-dark@mozilla.org"
  );
  await dark_theme.enable();
  Assert.equal(
    window.getComputedStyle(button).listStyleImage,
    `url("moz-extension://${uuid}/light.png")`,
    `Dark theme should use light icon.`
  );

  let light_theme = await AddonManager.getAddonByID(
    "thunderbird-compact-light@mozilla.org"
  );
  await light_theme.enable();
  Assert.equal(
    window.getComputedStyle(button).listStyleImage,
    `url("moz-extension://${uuid}/dark.png")`,
    `Light theme should use dark icon.`
  );

  // Disabling a theme will enable the default theme.
  await light_theme.disable();
  Assert.equal(
    window.getComputedStyle(button).listStyleImage,
    `url("moz-extension://${uuid}/default.png")`,
    `Default theme should use default icon.`
  );

  await extension.unload();
});

add_task(async function test_button_order() {
  info("3-pane tab");
  await run_action_button_order_test(
    [
      {
        name: "addon1",
        area: "maintoolbar",
        toolbar: "mail-bar3",
      },
      {
        name: "addon2",
        area: "tabstoolbar",
        toolbar: "tabbar-toolbar",
      },
      {
        name: "addon3",
        area: "maintoolbar",
        toolbar: "mail-bar3",
      },
      {
        name: "addon4",
        area: "tabstoolbar",
        toolbar: "tabbar-toolbar",
      },
    ],
    window,
    "browser_action"
  );

  info("Message window");
  let messageWindow = await openMessageInWindow(messages.getNext());
  await run_action_button_order_test(
    [
      {
        name: "addon1",
        area: "maintoolbar",
        toolbar: "mail-bar3",
        default_windows: ["messageDisplay"],
      },
      {
        name: "addon2",
        area: "maintoolbar",
        toolbar: "mail-bar3",
        default_windows: ["messageDisplay"],
      },
    ],
    messageWindow,
    "browser_action"
  );
  messageWindow.close();
});
