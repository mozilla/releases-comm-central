/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { AddonManager } = ChromeUtils.import(
  "resource://gre/modules/AddonManager.jsm"
);
const { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);

let account;

add_task(async () => {
  account = createAccount();
  addIdentity(account);
});

// This test clicks on the action button to open the popup.
add_task(async function test_popup_open_with_click() {
  let composeWindow = await openComposeWindow(account);
  await focusWindow(composeWindow);

  await run_popup_test({
    actionType: "compose_action",
    testType: "open-with-mouse-click",
    window: composeWindow,
  });

  await run_popup_test({
    actionType: "compose_action",
    testType: "open-with-mouse-click",
    use_default_popup: true,
    window: composeWindow,
  });

  await run_popup_test({
    actionType: "compose_action",
    testType: "open-with-mouse-click",
    default_area: "formattoolbar",
    window: composeWindow,
  });

  await run_popup_test({
    actionType: "compose_action",
    testType: "open-with-mouse-click",
    default_area: "formattoolbar",
    use_default_popup: true,
    window: composeWindow,
  });

  composeWindow.close();
  Services.xulStore.removeDocument(
    "chrome://messenger/content/messengercompose/messengercompose.xhtml"
  );
});

// This test uses a command from the menus API to open the popup.
add_task(async function test_popup_open_with_menu_command() {
  let composeWindow = await openComposeWindow(account);
  await focusWindow(composeWindow);

  await run_popup_test({
    actionType: "compose_action",
    testType: "open-with-menu-command",
    use_default_popup: true,
    default_area: "maintoolbar",
    window: composeWindow,
  });

  await run_popup_test({
    actionType: "compose_action",
    testType: "open-with-menu-command",
    use_default_popup: true,
    default_area: "formattoolbar",
    window: composeWindow,
  });

  await run_popup_test({
    actionType: "compose_action",
    testType: "open-with-menu-command",
    default_area: "maintoolbar",
    window: composeWindow,
  });

  await run_popup_test({
    actionType: "compose_action",
    testType: "open-with-menu-command",
    default_area: "formattoolbar",
    window: composeWindow,
  });

  composeWindow.close();
});

add_task(async function test_theme_icons() {
  let extension = ExtensionTestUtils.loadExtension({
    manifest: {
      applications: {
        gecko: {
          id: "compose_action@mochi.test",
        },
      },
      compose_action: {
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

  let composeWindow = await openComposeWindow(account);
  await focusWindow(composeWindow);

  let uuid = extension.uuid;
  let button = composeWindow.document.getElementById(
    "compose_action_mochi_test-composeAction-toolbarbutton"
  );

  let dark_theme = await AddonManager.getAddonByID(
    "thunderbird-compact-dark@mozilla.org"
  );
  await dark_theme.enable();
  Assert.equal(
    composeWindow.getComputedStyle(button).listStyleImage,
    `url("moz-extension://${uuid}/light.png")`,
    `Dark theme should use light icon.`
  );

  let light_theme = await AddonManager.getAddonByID(
    "thunderbird-compact-light@mozilla.org"
  );
  await light_theme.enable();
  Assert.equal(
    composeWindow.getComputedStyle(button).listStyleImage,
    `url("moz-extension://${uuid}/dark.png")`,
    `Light theme should use dark icon.`
  );

  // Disabling a theme will enable the default theme.
  await light_theme.disable();
  Assert.equal(
    composeWindow.getComputedStyle(button).listStyleImage,
    `url("moz-extension://${uuid}/default.png")`,
    `Default theme should use default icon.`
  );

  composeWindow.close();
  await extension.unload();
});
