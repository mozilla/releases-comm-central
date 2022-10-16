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

add_task(async function test_upgrade() {
  // Add a browser_action, to make sure the currentSet has been initialized.
  let extension1 = ExtensionTestUtils.loadExtension({
    useAddonManager: "permanent",
    manifest: {
      manifest_version: 2,
      version: "1.0",
      name: "Extension1",
      applications: { gecko: { id: "Extension1@mochi.test" } },
      browser_action: {
        default_title: "Extension1",
      },
    },
    background() {
      browser.test.sendMessage("Extension1 ready");
    },
  });
  await extension1.startup();
  await extension1.awaitMessage("Extension1 ready");

  // Add extension without a browser_action.
  let extension2 = ExtensionTestUtils.loadExtension({
    useAddonManager: "permanent",
    manifest: {
      manifest_version: 2,
      version: "1.0",
      name: "Extension2",
      applications: { gecko: { id: "Extension2@mochi.test" } },
    },
    background() {
      browser.test.sendMessage("Extension2 ready");
    },
  });
  await extension2.startup();
  await extension2.awaitMessage("Extension2 ready");

  // Update the extension, now including a browser_action.
  let updatedExtension2 = ExtensionTestUtils.loadExtension({
    useAddonManager: "permanent",
    manifest: {
      manifest_version: 2,
      version: "2.0",
      name: "Extension2",
      applications: { gecko: { id: "Extension2@mochi.test" } },
      browser_action: {
        default_title: "Extension2",
      },
    },
    background() {
      browser.test.sendMessage("Extension2 updated");
    },
  });
  await updatedExtension2.startup();
  await updatedExtension2.awaitMessage("Extension2 updated");

  let button = document.getElementById(
    "extension2_mochi_test-browserAction-toolbarbutton"
  );

  Assert.ok(button, "Button should exist");

  await extension1.unload();
  await extension2.unload();
  await updatedExtension2.unload();
});

add_task(async function test_iconPath() {
  // String values for the default_icon manifest entry have been tested in the
  // theme_icons test already. Here we test imagePath objects for the manifest key
  // and string values as well as objects for the setIcons() function.
  let files = {
    "background.js": async () => {
      await window.sendMessage("checkState", "icon1.png");

      await browser.browserAction.setIcon({ path: "icon2.png" });
      await window.sendMessage("checkState", "icon2.png");

      await browser.browserAction.setIcon({ path: { 16: "icon3.png" } });
      await window.sendMessage("checkState", "icon3.png");

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };

  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      applications: {
        gecko: {
          id: "browser_action@mochi.test",
        },
      },
      browser_action: {
        default_title: "default",
        default_icon: { 16: "icon1.png" },
      },
      background: { scripts: ["utils.js", "background.js"] },
    },
  });

  extension.onMessage("checkState", async expected => {
    let uuid = extension.uuid;
    let button = document.getElementById(
      "browser_action_mochi_test-browserAction-toolbarbutton"
    );

    Assert.equal(
      window.getComputedStyle(button).listStyleImage,
      `url("moz-extension://${uuid}/${expected}")`,
      `Icon path should be correct.`
    );
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
