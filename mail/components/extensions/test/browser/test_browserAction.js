/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let account;
let messages;

add_setup(async () => {
  account = createAccount();
  const rootFolder = account.incomingServer.rootFolder;
  const subFolders = rootFolder.subFolders;
  createMessages(subFolders[0], 10);
  messages = subFolders[0].messages;
});

// This test uses a command from the menus API to open the popup.
add_task(async function test_popup_open_with_menu_command_mv2() {
  info("3-pane tab");
  const testConfig = {
    actionType: "browser_action",
    testType: "open-with-menu-command",
    window,
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

  info("Message window");
  {
    const messageWindow = await openMessageInWindow(messages.getNext());
    const testConfig = {
      actionType: "browser_action",
      testType: "open-with-menu-command",
      default_windows: ["messageDisplay"],
      window: messageWindow,
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

add_task(async function test_popup_open_with_menu_command_mv3() {
  info("3-pane tab");
  const testConfig = {
    manifest_version: 3,
    actionType: "action",
    testType: "open-with-menu-command",
    window,
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

  info("Message window");
  {
    const messageWindow = await openMessageInWindow(messages.getNext());
    const testConfig = {
      manifest_version: 3,
      actionType: "action",
      testType: "open-with-menu-command",
      default_windows: ["messageDisplay"],
      window: messageWindow,
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
    useAddonManager: "temporary",
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

  const unifiedToolbarUpdate = TestUtils.topicObserved(
    "unified-toolbar-state-change"
  );
  await extension.startup();
  await unifiedToolbarUpdate;
  await TestUtils.waitForCondition(
    () =>
      document.querySelector(
        `#unifiedToolbarContent [extension="browser_action_properties@mochi.test"]`
      ),
    "Button added to unified toolbar"
  );

  const uuid = extension.uuid;
  const icon = document.querySelector(
    `#unifiedToolbarContent [extension="browser_action_properties@mochi.test"] .button-icon`
  );
  const defaultIcon = `url("moz-extension://${uuid}/default.png")`;

  const dark_theme = await AddonManager.getAddonByID(
    "thunderbird-compact-dark@mozilla.org"
  );
  await Promise.all([
    BrowserTestUtils.waitForEvent(window, "windowlwthemeupdate"),
    dark_theme.enable(),
  ]);
  await new Promise(resolve => requestAnimationFrame(resolve));
  Assert.equal(
    window.getComputedStyle(icon).content,
    makeIconSet(`url("moz-extension://${uuid}/light.png")`, defaultIcon),
    `Dark theme should use light icon.`
  );

  const light_theme = await AddonManager.getAddonByID(
    "thunderbird-compact-light@mozilla.org"
  );
  await Promise.all([
    BrowserTestUtils.waitForEvent(window, "windowlwthemeupdate"),
    light_theme.enable(),
  ]);
  Assert.equal(
    window.getComputedStyle(icon).content,
    makeIconSet(`url("moz-extension://${uuid}/dark.png")`, defaultIcon),
    `Light theme should use dark icon.`
  );

  // Disabling a theme will enable the default theme.
  await Promise.all([
    BrowserTestUtils.waitForEvent(window, "windowlwthemeupdate"),
    light_theme.disable(),
  ]);
  Assert.equal(
    window.getComputedStyle(icon).content,
    makeIconSet(defaultIcon),
    `Default theme should use default icon.`
  );
  await extension.unload();
});

add_task(async function test_theme_icons_messagewindow() {
  const messageWindow = await openMessageInWindow(messages.getNext());
  const extension = ExtensionTestUtils.loadExtension({
    useAddonManager: "temporary",
    manifest: {
      applications: {
        gecko: {
          id: "browser_action_properties@mochi.test",
        },
      },
      browser_action: {
        default_title: "default",
        default_icon: "default.png",
        default_windows: ["messageDisplay"],
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

  const uuid = extension.uuid;
  const button = messageWindow.document.getElementById(
    "browser_action_properties_mochi_test-browserAction-toolbarbutton"
  );
  const defaultIcon = `url("moz-extension://${uuid}/default.png")`;

  const dark_theme = await AddonManager.getAddonByID(
    "thunderbird-compact-dark@mozilla.org"
  );
  await Promise.all([
    BrowserTestUtils.waitForEvent(messageWindow, "windowlwthemeupdate"),
    dark_theme.enable(),
  ]);
  await new Promise(resolve => requestAnimationFrame(resolve));
  Assert.equal(
    messageWindow.getComputedStyle(button).listStyleImage,
    makeIconSet(`url("moz-extension://${uuid}/light.png")`, defaultIcon),
    `Dark theme should use light icon.`
  );

  const light_theme = await AddonManager.getAddonByID(
    "thunderbird-compact-light@mozilla.org"
  );
  await Promise.all([
    BrowserTestUtils.waitForEvent(messageWindow, "windowlwthemeupdate"),
    light_theme.enable(),
  ]);
  Assert.equal(
    messageWindow.getComputedStyle(button).listStyleImage,
    makeIconSet(`url("moz-extension://${uuid}/dark.png")`, defaultIcon),
    `Light theme should use dark icon.`
  );

  // Disabling a theme will enable the default theme.
  await Promise.all([
    BrowserTestUtils.waitForEvent(messageWindow, "windowlwthemeupdate"),
    light_theme.disable(),
  ]);
  Assert.equal(
    messageWindow.getComputedStyle(button).listStyleImage,
    makeIconSet(defaultIcon),
    `Default theme should use default icon.`
  );

  await extension.unload();
  messageWindow.close();
});

add_task(async function test_button_order() {
  info("3-pane tab");
  await run_action_button_order_test(
    [
      {
        name: "addon1",
        toolbar: "unified-toolbar",
      },
      {
        name: "addon2",
        toolbar: "unified-toolbar",
      },
      {
        name: "addon3",
        toolbar: "unified-toolbar",
      },
      {
        name: "addon4",
        toolbar: "unified-toolbar",
      },
    ],
    window,
    "browser_action"
  );

  info("Message window");
  const messageWindow = await openMessageInWindow(messages.getNext());
  await run_action_button_order_test(
    [
      {
        name: "addon1",
        toolbar: "mail-bar3",
        default_windows: ["messageDisplay"],
      },
      {
        name: "addon2",
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
  const extension1 = ExtensionTestUtils.loadExtension({
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

  // Update the extension, now including a browser_action.
  const updatedExtension2 = ExtensionTestUtils.loadExtension({
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

  const button = document.querySelector(
    `.unified-toolbar [extension="Extension2@mochi.test"]`
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

      await browser.browserAction.setIcon({ path: "icon2.png" });
      await window.sendMessage("checkState", "icon2.png");

      await browser.browserAction.setIcon({ path: { 16: "icon3.png" } });
      await window.sendMessage("checkState", "icon3.png");

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };

  const extension = ExtensionTestUtils.loadExtension({
    files,
    useAddonManager: "temporary",
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
    const uuid = extension.uuid;
    const icon = document.querySelector(
      `.unified-toolbar [extension="browser_action@mochi.test"] .button-icon`
    );

    const expectedPath = `url("moz-extension://${uuid}/${expected}")`;
    Assert.equal(
      window.getComputedStyle(icon).content,
      `image-set(${expectedPath} 1dppx, ${expectedPath} 2dppx)`,
      `Icon path should be correct.`
    );
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function test_allowedSpaces() {
  const tabmail = document.getElementById("tabmail");
  const unifiedToolbar = document.querySelector("unified-toolbar");

  function buttonInUnifiedToolbar() {
    const button = unifiedToolbar.querySelector(
      '[item-id="ext-browser_action_spaces@mochi.test"]'
    );
    if (!button) {
      return false;
    }
    return BrowserTestUtils.is_visible(button);
  }

  const extension = ExtensionTestUtils.loadExtension({
    useAddonManager: "temporary",
    manifest: {
      applications: {
        gecko: {
          id: "browser_action_spaces@mochi.test",
        },
      },
      browser_action: {
        allowed_spaces: ["calendar", "default"],
      },
    },
  });

  const mailSpace = window.gSpacesToolbar.spaces.find(
    space => space.name == "mail"
  );
  window.gSpacesToolbar.openSpace(tabmail, mailSpace);

  const unifiedToolbarUpdate = TestUtils.topicObserved(
    "unified-toolbar-state-change"
  );

  await extension.startup();
  await unifiedToolbarUpdate;

  ok(
    !buttonInUnifiedToolbar(),
    "Button shouldn't be in the mail space toolbar"
  );

  let toolbarMutation = BrowserTestUtils.waitForMutationCondition(
    unifiedToolbar,
    { childList: true },
    () => true
  );
  window.gSpacesToolbar.openSpace(
    tabmail,
    window.gSpacesToolbar.spaces.find(space => space.name == "calendar")
  );
  await toolbarMutation;

  ok(
    buttonInUnifiedToolbar(),
    "Button should be in the calendar space toolbar"
  );

  tabmail.closeTab();
  toolbarMutation = BrowserTestUtils.waitForMutationCondition(
    unifiedToolbar,
    { childList: true },
    () => true
  );
  tabmail.openTab("contentTab", { url: "about:blank" });
  await toolbarMutation;

  ok(buttonInUnifiedToolbar(), "Button should be in the default space toolbar");

  tabmail.closeTab();
  toolbarMutation = BrowserTestUtils.waitForMutationCondition(
    unifiedToolbar,
    { childList: true },
    () => true
  );
  window.gSpacesToolbar.openSpace(tabmail, mailSpace);
  await toolbarMutation;

  ok(
    !buttonInUnifiedToolbar(),
    "Button should be hidden again in the mail space toolbar"
  );

  await extension.unload();
});

add_task(async function test_allowedInAllSpaces() {
  const tabmail = document.getElementById("tabmail");
  const unifiedToolbar = document.querySelector("unified-toolbar");

  function buttonInUnifiedToolbar() {
    const button = unifiedToolbar.querySelector(
      '[item-id="ext-browser_action_all_spaces@mochi.test"]'
    );
    if (!button) {
      return false;
    }
    return BrowserTestUtils.is_visible(button);
  }

  const extension = ExtensionTestUtils.loadExtension({
    useAddonManager: "temporary",
    manifest: {
      applications: {
        gecko: {
          id: "browser_action_all_spaces@mochi.test",
        },
      },
      browser_action: {
        allowed_spaces: [],
      },
    },
  });

  const mailSpace = window.gSpacesToolbar.spaces.find(
    space => space.name == "mail"
  );
  window.gSpacesToolbar.openSpace(tabmail, mailSpace);

  const unifiedToolbarUpdate = TestUtils.topicObserved(
    "unified-toolbar-state-change"
  );

  await extension.startup();
  await unifiedToolbarUpdate;

  ok(buttonInUnifiedToolbar(), "Button should be in the mail space toolbar");

  let toolbarMutation = BrowserTestUtils.waitForMutationCondition(
    unifiedToolbar,
    { childList: true },
    () => true
  );
  window.gSpacesToolbar.openSpace(
    tabmail,
    window.gSpacesToolbar.spaces.find(space => space.name == "calendar")
  );
  await toolbarMutation;

  ok(
    buttonInUnifiedToolbar(),
    "Button should be in the calendar space toolbar"
  );

  tabmail.closeTab();
  toolbarMutation = BrowserTestUtils.waitForMutationCondition(
    unifiedToolbar,
    { childList: true },
    () => true
  );
  tabmail.openTab("contentTab", { url: "about:blank" });
  await toolbarMutation;

  ok(buttonInUnifiedToolbar(), "Button should be in the default space toolbar");

  tabmail.closeTab();
  toolbarMutation = BrowserTestUtils.waitForMutationCondition(
    unifiedToolbar,
    { childList: true },
    () => true
  );
  window.gSpacesToolbar.openSpace(tabmail, mailSpace);
  await toolbarMutation;

  ok(
    buttonInUnifiedToolbar(),
    "Button should still be in the mail space toolbar"
  );

  await extension.unload();
});

add_task(async function test_allowedSpacesDefault() {
  const tabmail = document.getElementById("tabmail");
  const unifiedToolbar = document.querySelector("unified-toolbar");

  function buttonInUnifiedToolbar() {
    const button = unifiedToolbar.querySelector(
      '[item-id="ext-browser_action_default_spaces@mochi.test"]'
    );
    if (!button) {
      return false;
    }
    return BrowserTestUtils.is_visible(button);
  }

  const extension = ExtensionTestUtils.loadExtension({
    useAddonManager: "temporary",
    manifest: {
      applications: {
        gecko: {
          id: "browser_action_default_spaces@mochi.test",
        },
      },
      browser_action: {
        default_title: "Test Action",
      },
    },
  });

  const mailSpace = window.gSpacesToolbar.spaces.find(
    space => space.name == "mail"
  );
  window.gSpacesToolbar.openSpace(tabmail, mailSpace);

  const unifiedToolbarUpdate = TestUtils.topicObserved(
    "unified-toolbar-state-change"
  );

  await extension.startup();
  await unifiedToolbarUpdate;

  ok(buttonInUnifiedToolbar(), "Button should be in the mail space toolbar");

  let toolbarMutation = BrowserTestUtils.waitForMutationCondition(
    unifiedToolbar,
    { childList: true },
    () => true
  );
  window.gSpacesToolbar.openSpace(
    tabmail,
    window.gSpacesToolbar.spaces.find(space => space.name == "calendar")
  );
  await toolbarMutation;

  ok(
    !buttonInUnifiedToolbar(),
    "Button should not be in the calendar space toolbar"
  );

  tabmail.closeTab();
  toolbarMutation = BrowserTestUtils.waitForMutationCondition(
    unifiedToolbar,
    { childList: true },
    () => true
  );
  tabmail.openTab("contentTab", { url: "about:blank" });
  await toolbarMutation;

  ok(
    !buttonInUnifiedToolbar(),
    "Button should not be in the default space toolbar"
  );

  tabmail.closeTab();
  toolbarMutation = BrowserTestUtils.waitForMutationCondition(
    unifiedToolbar,
    { childList: true },
    () => true
  );
  window.gSpacesToolbar.openSpace(tabmail, mailSpace);
  await toolbarMutation;

  ok(
    buttonInUnifiedToolbar(),
    "Button should still be in the mail space toolbar again"
  );

  await extension.unload();
});

add_task(async function test_update_allowedSpaces() {
  const tabmail = document.getElementById("tabmail");
  const unifiedToolbar = document.querySelector("unified-toolbar");

  function buttonInUnifiedToolbar() {
    const button = unifiedToolbar.querySelector(
      '[item-id="ext-browser_action_spaces@mochi.test"]'
    );
    if (!button) {
      return false;
    }
    return BrowserTestUtils.is_visible(button);
  }

  async function closeSpaceTab() {
    const toolbarMutation = BrowserTestUtils.waitForMutationCondition(
      unifiedToolbar,
      { childList: true },
      () => true
    );
    tabmail.closeTab();
    await toolbarMutation;
  }

  async function ensureActiveMailSpace() {
    const mailSpace = window.gSpacesToolbar.spaces.find(
      space => space.name == "mail"
    );
    if (window.gSpacesToolbar.currentSpace != mailSpace) {
      const toolbarMutation = BrowserTestUtils.waitForMutationCondition(
        unifiedToolbar,
        { childList: true },
        () => true
      );
      window.gSpacesToolbar.openSpace(tabmail, mailSpace);
      await toolbarMutation;
    }
  }

  async function checkUnifiedToolbar(extension, expectedSpaces) {
    // Make sure the mail space is open.
    await ensureActiveMailSpace();

    const unifiedToolbarUpdate = TestUtils.topicObserved(
      "unified-toolbar-state-change"
    );
    await extension.startup();
    await unifiedToolbarUpdate;

    // Test mail space.
    {
      const expected = expectedSpaces.includes("mail");
      Assert.equal(
        buttonInUnifiedToolbar(),
        expected,
        `Button should${expected ? " " : " not "}be in the mail space toolbar`
      );
    }

    // Test calendar space.
    {
      const toolbarMutation = BrowserTestUtils.waitForMutationCondition(
        unifiedToolbar,
        { childList: true },
        () => true
      );
      window.gSpacesToolbar.openSpace(
        tabmail,
        window.gSpacesToolbar.spaces.find(space => space.name == "calendar")
      );
      await toolbarMutation;

      const expected = expectedSpaces.includes("calendar");
      Assert.equal(
        buttonInUnifiedToolbar(),
        expected,
        `Button should${
          expected ? " " : " not "
        }be in the calendar space toolbar`
      );
      await closeSpaceTab();
    }

    // Test default space.
    {
      const toolbarMutation = BrowserTestUtils.waitForMutationCondition(
        unifiedToolbar,
        { childList: true },
        () => true
      );
      tabmail.openTab("contentTab", { url: "about:blank" });
      await toolbarMutation;

      const expected = expectedSpaces.includes("default");
      Assert.equal(
        buttonInUnifiedToolbar(),
        expected,
        `Button should${
          expected ? " " : " not "
        }be in the default space toolbar`
      );
      await closeSpaceTab();
    }

    // Test mail space again.
    {
      await ensureActiveMailSpace();
      const expected = expectedSpaces.includes("mail");
      Assert.equal(
        buttonInUnifiedToolbar(),
        expected,
        `Button should${expected ? " " : " not "}be in the mail space toolbar`
      );
    }
  }

  // Install extension and test that the button is shown in the default space and
  // in the calendar space.
  const extension1 = ExtensionTestUtils.loadExtension({
    useAddonManager: "permanent",
    manifest: {
      applications: {
        gecko: {
          id: "browser_action_spaces@mochi.test",
        },
      },
      browser_action: {
        allowed_spaces: ["calendar", "default"],
      },
    },
  });
  await checkUnifiedToolbar(extension1, ["calendar", "default"]);

  // Update extension by installing a newer version on top. Verify that it is now
  // also shown in the mail space.
  const extension2 = ExtensionTestUtils.loadExtension({
    useAddonManager: "permanent",
    manifest: {
      applications: {
        gecko: {
          id: "browser_action_spaces@mochi.test",
        },
      },
      browser_action: {
        allowed_spaces: ["mail", "calendar", "default"],
      },
    },
  });
  await checkUnifiedToolbar(extension2, ["mail", "calendar", "default"]);

  // Update extension by installing a newer version on top. Verify that it is now
  // no longer shown in the calendar space.
  const extension3 = ExtensionTestUtils.loadExtension({
    useAddonManager: "permanent",
    manifest: {
      applications: {
        gecko: {
          id: "browser_action_spaces@mochi.test",
        },
      },
      browser_action: {
        allowed_spaces: ["mail", "default"],
      },
    },
  });
  await checkUnifiedToolbar(extension3, ["mail", "default"]);

  await extension1.unload();
  await extension2.unload();
  await extension3.unload();
});
