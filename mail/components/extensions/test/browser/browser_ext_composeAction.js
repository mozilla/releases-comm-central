/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let account;

add_setup(async () => {
  account = createAccount();
  addIdentity(account);
});

// This test uses a command from the menus API to open the popup.
add_task(async function test_popup_open_with_menu_command() {
  const composeWindow = await openComposeWindow(account);
  await focusWindow(composeWindow);

  for (const area of ["maintoolbar", "formattoolbar"]) {
    const testConfig = {
      actionType: "compose_action",
      testType: "open-with-menu-command",
      default_area: area,
      window: composeWindow,
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

  composeWindow.close();
});

add_task(async function test_theme_icons() {
  const extension = ExtensionTestUtils.loadExtension({
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

  const composeWindow = await openComposeWindow(account);
  await focusWindow(composeWindow);

  const uuid = extension.uuid;
  const button = composeWindow.document.getElementById(
    "compose_action_mochi_test-composeAction-toolbarbutton"
  );
  const defaultIcon = `url("moz-extension://${uuid}/default.png")`;

  const dark_theme = await AddonManager.getAddonByID(
    "thunderbird-compact-dark@mozilla.org"
  );
  await Promise.all([
    BrowserTestUtils.waitForEvent(composeWindow, "windowlwthemeupdate"),
    dark_theme.enable(),
  ]);
  await new Promise(resolve => requestAnimationFrame(resolve));
  Assert.equal(
    composeWindow.getComputedStyle(button).listStyleImage,
    makeIconSet(`url("moz-extension://${uuid}/light.png")`, defaultIcon),
    `Dark theme should use light icon.`
  );

  const light_theme = await AddonManager.getAddonByID(
    "thunderbird-compact-light@mozilla.org"
  );
  await Promise.all([
    BrowserTestUtils.waitForEvent(composeWindow, "windowlwthemeupdate"),
    light_theme.enable(),
  ]);
  Assert.equal(
    composeWindow.getComputedStyle(button).listStyleImage,
    makeIconSet(`url("moz-extension://${uuid}/dark.png")`, defaultIcon),
    `Light theme should use dark icon.`
  );

  // Disabling a theme will enable the default theme.
  await Promise.all([
    BrowserTestUtils.waitForEvent(composeWindow, "windowlwthemeupdate"),
    light_theme.disable(),
  ]);
  Assert.equal(
    composeWindow.getComputedStyle(button).listStyleImage,
    makeIconSet(defaultIcon),
    `Default theme should use default icon.`
  );

  composeWindow.close();
  await extension.unload();
});

add_task(async function test_button_order() {
  const composeWindow = await openComposeWindow(account);
  await focusWindow(composeWindow);

  await run_action_button_order_test(
    [
      {
        name: "addon1",
        area: "maintoolbar",
        toolbar: "composeToolbar2",
      },
      {
        name: "addon2",
        area: "formattoolbar",
        toolbar: "FormatToolbar",
      },
      {
        name: "addon3",
        area: "maintoolbar",
        toolbar: "composeToolbar2",
      },
      {
        name: "addon4",
        area: "formattoolbar",
        toolbar: "FormatToolbar",
      },
    ],
    composeWindow,
    "compose_action"
  );

  composeWindow.close();
});

add_task(async function test_upgrade() {
  const composeWindow = await openComposeWindow(account);
  await focusWindow(composeWindow);

  // Add a compose_action, to make sure the currentSet has been initialized.
  const extension1 = ExtensionTestUtils.loadExtension({
    useAddonManager: "permanent",
    manifest: {
      manifest_version: 2,
      version: "1.0",
      name: "Extension1",
      applications: { gecko: { id: "Extension1@mochi.test" } },
      compose_action: {
        default_title: "Extension1",
      },
    },
    background() {
      browser.test.sendMessage("Extension1 ready");
    },
  });
  await extension1.startup();
  await extension1.awaitMessage("Extension1 ready");

  // Add extension without a compose_action.
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

  // Update the extension, now including a compose_action.
  const updatedExtension2 = ExtensionTestUtils.loadExtension({
    useAddonManager: "permanent",
    manifest: {
      manifest_version: 2,
      version: "2.0",
      name: "Extension2",
      applications: { gecko: { id: "Extension2@mochi.test" } },
      compose_action: {
        default_title: "Extension2",
      },
    },
    background() {
      browser.test.sendMessage("Extension2 updated");
    },
  });
  await updatedExtension2.startup();
  await updatedExtension2.awaitMessage("Extension2 updated");

  const button = composeWindow.document.getElementById(
    "extension2_mochi_test-composeAction-toolbarbutton"
  );

  Assert.ok(button, "Button should exist");

  await extension1.unload();
  await extension2.unload();
  await updatedExtension2.unload();

  composeWindow.close();
});

add_task(async function test_iconPath() {
  const composeWindow = await openComposeWindow(account);
  await focusWindow(composeWindow);

  // String values for the default_icon manifest entry have been tested in the
  // theme_icons test already. Here we test imagePath objects for the manifest key
  // and string values as well as objects for the setIcons() function.
  const files = {
    "background.js": async () => {
      await window.sendMessage("checkState", "icon1.png");

      await browser.composeAction.setIcon({ path: "icon2.png" });
      await window.sendMessage("checkState", "icon2.png");

      await browser.composeAction.setIcon({ path: { 16: "icon3.png" } });
      await window.sendMessage("checkState", "icon3.png");

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };

  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      applications: {
        gecko: {
          id: "compose_action@mochi.test",
        },
      },
      compose_action: {
        default_title: "default",
        default_icon: { 16: "icon1.png" },
      },
      background: { scripts: ["utils.js", "background.js"] },
    },
  });

  extension.onMessage("checkState", async expected => {
    const uuid = extension.uuid;
    const button = composeWindow.document.getElementById(
      "compose_action_mochi_test-composeAction-toolbarbutton"
    );

    Assert.equal(
      window.getComputedStyle(button).listStyleImage,
      makeIconSet(`url("moz-extension://${uuid}/${expected}")`),
      `Icon path should be correct.`
    );
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  composeWindow.close();
});
