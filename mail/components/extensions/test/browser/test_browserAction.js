/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let account;
let messages;

add_setup(async () => {
  account = createAccount();
  let rootFolder = account.incomingServer.rootFolder;
  let subFolders = rootFolder.subFolders;
  createMessages(subFolders[0], 10);
  messages = subFolders[0].messages;
});

// This test uses a command from the menus API to open the popup.
add_task(async function test_popup_open_with_menu_command_mv2() {
  info("3-pane tab");
  let testConfig = {
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
    let messageWindow = await openMessageInWindow(messages.getNext());
    let testConfig = {
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
  let testConfig = {
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
    let messageWindow = await openMessageInWindow(messages.getNext());
    let testConfig = {
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
  let extension = ExtensionTestUtils.loadExtension({
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

  let unifiedToolbarUpdate = TestUtils.topicObserved(
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

  let uuid = extension.uuid;
  let icon = document.querySelector(
    `#unifiedToolbarContent [extension="browser_action_properties@mochi.test"] .button-icon`
  );

  let dark_theme = await AddonManager.getAddonByID(
    "thunderbird-compact-dark@mozilla.org"
  );
  await dark_theme.enable();
  Assert.equal(
    window.getComputedStyle(icon).content,
    `url("moz-extension://${uuid}/light.png")`,
    `Dark theme should use light icon.`
  );

  let light_theme = await AddonManager.getAddonByID(
    "thunderbird-compact-light@mozilla.org"
  );
  await light_theme.enable();
  Assert.equal(
    window.getComputedStyle(icon).content,
    `url("moz-extension://${uuid}/dark.png")`,
    `Light theme should use dark icon.`
  );

  // Disabling a theme will enable the default theme.
  await light_theme.disable();
  Assert.equal(
    window.getComputedStyle(icon).content,
    `url("moz-extension://${uuid}/default.png")`,
    `Default theme should use default icon.`
  );
  await extension.unload();
});

add_task(async function test_theme_icons_messagewindow() {
  let messageWindow = await openMessageInWindow(messages.getNext());
  let extension = ExtensionTestUtils.loadExtension({
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

  let uuid = extension.uuid;
  let button = messageWindow.document.getElementById(
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
  let messageWindow = await openMessageInWindow(messages.getNext());
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

  let button = document.querySelector(
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
    let uuid = extension.uuid;
    let icon = document.querySelector(
      `.unified-toolbar [extension="browser_action@mochi.test"] .button-icon`
    );

    Assert.equal(
      window.getComputedStyle(icon).content,
      `url("moz-extension://${uuid}/${expected}")`,
      `Icon path should be correct.`
    );
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function test_allowedSpaces() {
  let tabmail = document.getElementById("tabmail");
  let unifiedToolbar = document.querySelector("unified-toolbar");

  function buttonInUnifiedToolbar() {
    let button = unifiedToolbar.querySelector(
      '[item-id="ext-browser_action_spaces@mochi.test"]'
    );
    if (!button) {
      return false;
    }
    return BrowserTestUtils.is_visible(button);
  }

  let extension = ExtensionTestUtils.loadExtension({
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

  let mailSpace = window.gSpacesToolbar.spaces.find(
    space => space.name == "mail"
  );
  window.gSpacesToolbar.openSpace(tabmail, mailSpace);

  let unifiedToolbarUpdate = TestUtils.topicObserved(
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
  let tabmail = document.getElementById("tabmail");
  let unifiedToolbar = document.querySelector("unified-toolbar");

  function buttonInUnifiedToolbar() {
    let button = unifiedToolbar.querySelector(
      '[item-id="ext-browser_action_all_spaces@mochi.test"]'
    );
    if (!button) {
      return false;
    }
    return BrowserTestUtils.is_visible(button);
  }

  let extension = ExtensionTestUtils.loadExtension({
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

  let mailSpace = window.gSpacesToolbar.spaces.find(
    space => space.name == "mail"
  );
  window.gSpacesToolbar.openSpace(tabmail, mailSpace);

  let unifiedToolbarUpdate = TestUtils.topicObserved(
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
  let tabmail = document.getElementById("tabmail");
  let unifiedToolbar = document.querySelector("unified-toolbar");

  function buttonInUnifiedToolbar() {
    let button = unifiedToolbar.querySelector(
      '[item-id="ext-browser_action_default_spaces@mochi.test"]'
    );
    if (!button) {
      return false;
    }
    return BrowserTestUtils.is_visible(button);
  }

  let extension = ExtensionTestUtils.loadExtension({
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

  let mailSpace = window.gSpacesToolbar.spaces.find(
    space => space.name == "mail"
  );
  window.gSpacesToolbar.openSpace(tabmail, mailSpace);

  let unifiedToolbarUpdate = TestUtils.topicObserved(
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
  let tabmail = document.getElementById("tabmail");
  let unifiedToolbar = document.querySelector("unified-toolbar");

  function buttonInUnifiedToolbar() {
    let button = unifiedToolbar.querySelector(
      '[item-id="ext-browser_action_spaces@mochi.test"]'
    );
    if (!button) {
      return false;
    }
    return BrowserTestUtils.is_visible(button);
  }

  async function closeSpaceTab() {
    let toolbarMutation = BrowserTestUtils.waitForMutationCondition(
      unifiedToolbar,
      { childList: true },
      () => true
    );
    tabmail.closeTab();
    await toolbarMutation;
  }

  async function ensureActiveMailSpace() {
    let mailSpace = window.gSpacesToolbar.spaces.find(
      space => space.name == "mail"
    );
    if (window.gSpacesToolbar.currentSpace != mailSpace) {
      let toolbarMutation = BrowserTestUtils.waitForMutationCondition(
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

    let unifiedToolbarUpdate = TestUtils.topicObserved(
      "unified-toolbar-state-change"
    );
    await extension.startup();
    await unifiedToolbarUpdate;

    // Test mail space.
    {
      let expected = expectedSpaces.includes("mail");
      Assert.equal(
        buttonInUnifiedToolbar(),
        expected,
        `Button should${expected ? " " : " not "}be in the mail space toolbar`
      );
    }

    // Test calendar space.
    {
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

      let expected = expectedSpaces.includes("calendar");
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
      let toolbarMutation = BrowserTestUtils.waitForMutationCondition(
        unifiedToolbar,
        { childList: true },
        () => true
      );
      tabmail.openTab("contentTab", { url: "about:blank" });
      await toolbarMutation;

      let expected = expectedSpaces.includes("default");
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
      let expected = expectedSpaces.includes("mail");
      Assert.equal(
        buttonInUnifiedToolbar(),
        expected,
        `Button should${expected ? " " : " not "}be in the mail space toolbar`
      );
    }
  }

  // Install extension and test that the button is shown in the default space and
  // in the calendar space.
  let extension1 = ExtensionTestUtils.loadExtension({
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
  let extension2 = ExtensionTestUtils.loadExtension({
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
  let extension3 = ExtensionTestUtils.loadExtension({
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
