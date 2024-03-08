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

// This test uses a command from the menus API to open the popup.
add_task(async function test_popup_open_with_menu_command() {
  info("3-pane tab");
  {
    const testConfig = {
      actionType: "message_display_action",
      testType: "open-with-menu-command",
      window: tabmail.currentAboutMessage,
    };

    await run_popup_test({
      ...testConfig,
    });
    await run_popup_test({
      ...testConfig,
      use_default_popup: true,
    });
    await run_popup_test({
      ...testConfig,
      disable_button: true,
    });
  }

  info("Message tab");
  {
    await openMessageInTab(messages.getNext());
    const testConfig = {
      actionType: "message_display_action",
      testType: "open-with-menu-command",
      window: tabmail.currentAboutMessage,
    };

    await run_popup_test({
      ...testConfig,
    });
    await run_popup_test({
      ...testConfig,
      use_default_popup: true,
    });
    await run_popup_test({
      ...testConfig,
      disable_button: true,
    });

    document.getElementById("tabmail").closeTab();
  }

  info("Message window");
  {
    const messageWindow = await openMessageInWindow(messages.getNext());
    const testConfig = {
      actionType: "message_display_action",
      testType: "open-with-menu-command",
      window: messageWindow.messageBrowser.contentWindow,
    };

    await run_popup_test({
      ...testConfig,
    });
    await run_popup_test({
      ...testConfig,
      use_default_popup: true,
    });
    await run_popup_test({
      ...testConfig,
      disable_button: true,
    });

    messageWindow.close();
  }
});

add_task(async function test_theme_icons() {
  const extension = ExtensionTestUtils.loadExtension({
    manifest: {
      applications: {
        gecko: {
          id: "message_display_action@mochi.test",
        },
      },
      message_display_action: {
        default_title: "default",
        default_icon: "default.png",
        theme_icons: [
          {
            dark: "dark.png",
            light: "light.png",
            size: 16,
          },
          {
            dark: "dark.png",
            light: "light.png",
            size: 32,
          },
        ],
      },
    },
  });

  await extension.startup();

  const aboutMessage = tabmail.currentAboutMessage;
  const uuid = extension.uuid;
  const button = aboutMessage.document.getElementById(
    "message_display_action_mochi_test-messageDisplayAction-toolbarbutton"
  );

  const dark_theme = await AddonManager.getAddonByID(
    "thunderbird-compact-dark@mozilla.org"
  );
  await Promise.all([
    BrowserTestUtils.waitForEvent(window, "windowlwthemeupdate"),
    dark_theme.enable(),
  ]);
  await new Promise(resolve => requestAnimationFrame(resolve));
  Assert.equal(
    aboutMessage.getComputedStyle(button).listStyleImage,
    `image-set(url("moz-extension://${uuid}/light.png") 1dppx, url("moz-extension://${uuid}/light.png") 2dppx)`,
    `Dark theme should use light icon.`
  );

  const light_theme = await AddonManager.getAddonByID(
    "thunderbird-compact-light@mozilla.org"
  );
  await Promise.all([
    BrowserTestUtils.waitForEvent(window, "windowlwthemeupdate"),
    light_theme.enable(),
  ]);
  await new Promise(resolve => requestAnimationFrame(resolve));
  Assert.equal(
    aboutMessage.getComputedStyle(button).listStyleImage,
    `image-set(url("moz-extension://${uuid}/dark.png") 1dppx, url("moz-extension://${uuid}/dark.png") 2dppx)`,
    `Light theme should use dark icon.`
  );

  // Disabling a theme will enable the default theme.
  await Promise.all([
    BrowserTestUtils.waitForEvent(window, "windowlwthemeupdate"),
    light_theme.disable(),
  ]);
  await new Promise(resolve => requestAnimationFrame(resolve));
  Assert.equal(
    aboutMessage.getComputedStyle(button).listStyleImage,
    `image-set(url("moz-extension://${uuid}/default.png") 1dppx, url("moz-extension://${uuid}/default.png") 2dppx)`,
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
        toolbar: "header-view-toolbar",
      },
      {
        name: "addon2",
        toolbar: "header-view-toolbar",
      },
    ],
    tabmail.currentAboutMessage,
    "message_display_action"
  );

  info("Message tab");
  await openMessageInTab(messages.getNext());
  await run_action_button_order_test(
    [
      {
        name: "addon1",
        toolbar: "header-view-toolbar",
      },
      {
        name: "addon2",
        toolbar: "header-view-toolbar",
      },
    ],
    tabmail.currentAboutMessage,
    "message_display_action"
  );
  tabmail.closeTab();

  info("Message window");
  const messageWindow = await openMessageInWindow(messages.getNext());
  await run_action_button_order_test(
    [
      {
        name: "addon1",
        toolbar: "header-view-toolbar",
      },
      {
        name: "addon2",
        toolbar: "header-view-toolbar",
      },
    ],
    messageWindow.messageBrowser.contentWindow,
    "message_display_action"
  );
  messageWindow.close();
});

add_task(async function test_upgrade() {
  // Add a message_display_action, to make sure the currentSet has been initialized.
  const extension1 = ExtensionTestUtils.loadExtension({
    useAddonManager: "permanent",
    manifest: {
      manifest_version: 2,
      version: "1.0",
      name: "Extension1",
      applications: { gecko: { id: "Extension1@mochi.test" } },
      message_display_action: {
        default_title: "Extension1",
      },
    },
    background() {
      browser.test.sendMessage("Extension1 ready");
    },
  });
  await extension1.startup();
  await extension1.awaitMessage("Extension1 ready");

  // Add extension without a message_display_action.
  const extension2 = ExtensionTestUtils.loadExtension({
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

  // Update the extension, now including a message_display_action.
  const updatedExtension2 = ExtensionTestUtils.loadExtension({
    useAddonManager: "permanent",
    manifest: {
      manifest_version: 2,
      version: "2.0",
      name: "Extension2",
      applications: { gecko: { id: "Extension2@mochi.test" } },
      message_display_action: {
        default_title: "Extension2",
      },
    },
    background() {
      browser.test.sendMessage("Extension2 updated");
    },
  });
  await updatedExtension2.startup();
  await updatedExtension2.awaitMessage("Extension2 updated");

  const aboutMessage = tabmail.currentAboutMessage;
  const button = aboutMessage.document.getElementById(
    "extension2_mochi_test-messageDisplayAction-toolbarbutton"
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
  const files = {
    "background.js": async () => {
      await window.sendMessage("checkState", "icon1.png");

      // TODO: Figure out why this isn't working properly.
      // await browser.messageDisplayAction.setIcon({ path: "icon2.png" });
      // await window.sendMessage("checkState", "icon2.png");

      // await browser.messageDisplayAction.setIcon({ path: { 16: "icon3.png" } });
      // await window.sendMessage("checkState", "icon3.png");

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };

  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      applications: {
        gecko: {
          id: "message_display_action@mochi.test",
        },
      },
      message_display_action: {
        default_title: "default",
        default_icon: { 16: "icon1.png" },
      },
      background: { scripts: ["utils.js", "background.js"] },
    },
  });

  const aboutMessage = tabmail.currentAboutMessage;
  extension.onMessage("checkState", async expected => {
    const uuid = extension.uuid;
    const button = aboutMessage.document.getElementById(
      "message_display_action_mochi_test-messageDisplayAction-toolbarbutton"
    );

    Assert.equal(
      aboutMessage.getComputedStyle(button).listStyleImage,
      makeIconSet(`url("moz-extension://${uuid}/${expected}")`),
      `Icon path should be correct.`
    );
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
