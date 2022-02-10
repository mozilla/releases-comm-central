/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { AddonManager } = ChromeUtils.import(
  "resource://gre/modules/AddonManager.jsm"
);

// This test clicks on the action button to open the popup.
add_task(async function test_popup_open_with_click() {
  await run_popup_test({
    actionType: "browser_action",
    testType: "open-with-mouse-click",
    window,
  });

  await run_popup_test({
    actionType: "browser_action",
    testType: "open-with-mouse-click",
    use_default_popup: true,
    window,
  });

  Services.xulStore.removeDocument(
    "chrome://messenger/content/messenger.xhtml"
  );
});

// This test uses a command from the menus API to open the popup.
add_task(async function test_popup_open_with_menu_command() {
  await run_popup_test({
    actionType: "browser_action",
    testType: "open-with-menu-command",
    use_default_popup: true,
    window,
  });

  await run_popup_test({
    actionType: "browser_action",
    testType: "open-with-menu-command",
    window,
  });
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
