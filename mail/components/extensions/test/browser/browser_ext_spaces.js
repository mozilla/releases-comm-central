/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_setup(() => {
  // Reduce animations to prevent intermittent fails due to late theme changes.
  Services.prefs.setIntPref("ui.prefersReducedMotion", 1);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("ui.prefersReducedMotion");
  });
});

/**
 * Helper Function, creates a test extension to verify expected button states.
 *
 * @param {Function} background - The background script executed by the test.
 * @param {object} config - Additional config data for the test. Tests can
 *   include arbitrary data, but the following have a dedicated purpose:
 *   @param {string} selectedTheme - The selected theme (default, light or dark),
 *     used to select the expected button/menuitem icon.
 *   @param {?object} manifestIcons - The icons entry of the extension manifest.
 *   @param {?object} permissions - Permissions assigned to the extension.
 */
async function test_space(background, config = {}) {
  const manifest_version = config.manifestVersion || 3;
  const manifest = {
    manifest_version,
    browser_specific_settings: {
      gecko: {
        id: "spaces_toolbar@mochi.test",
      },
    },
    permissions: ["tabs"],
    background: { scripts: ["utils.js", "background.js"] },
  };

  if (config.manifestIcons) {
    manifest.icons = config.manifestIcons;
  }

  if (config.permissions) {
    manifest.permissions = config.permissions;
  }

  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": background,
      "utils.js": await getUtilsJS(),
    },
    manifest,
  });

  extension.onMessage("checkTabs", async test => {
    const tabmail = document.getElementById("tabmail");

    if (test.action && test.spaceName && test.url) {
      const tabPromise =
        test.action == "switch"
          ? BrowserTestUtils.waitForEvent(tabmail.tabContainer, "TabSelect")
          : contentTabOpenPromise(tabmail, test.url);
      const button = window.document.getElementById(
        `spaces_toolbar_mochi_test-spacesButton-${test.spaceName}`
      );
      button.click();
      await tabPromise;
    }

    const tabs = tabmail.tabInfo.filter(tabInfo => !!tabInfo.spaceButtonId);
    Assert.equal(
      test.openSpacesUrls.length,
      tabs.length,
      `Should have found the correct number of open add-on spaces tabs.`
    );
    for (const expectedUrl of test.openSpacesUrls) {
      Assert.ok(
        tabmail.tabInfo.find(
          tabInfo =>
            !!tabInfo.spaceButtonId &&
            tabInfo.browser.currentURI.spec == expectedUrl
        ),
        `Should have found a spaces tab with the expected url.`
      );
    }
    extension.sendMessage();
  });

  extension.onMessage("checkUI", async expected => {
    const addonButtons = document.querySelectorAll(".spaces-addon-button");
    Assert.equal(
      expected.length,
      addonButtons.length,
      `Should have found the correct number of buttons.`
    );

    for (const {
      name,
      url,
      title,
      icons,
      badgeText,
      badgeBackgroundColor,
    } of expected) {
      // Fill in the fallback value for the default icon if it's been declared
      // unset in the fixture only if we're also checking the default theme. We
      // can't always fall back to it, because the default icon - if it's set -
      // will be used as 2x icon for all variants because its size gets set as
      // 19px by the extension icon handling, so it always has the best
      // resolution for 2x. So we need to be able to differentiate between a
      // default icon being set and unset to expect the correct 2x icon.
      if (config.selectedTheme === "default" && !icons.default) {
        icons.default = icons.dark;
      }
      // Check button.
      const button = window.document.getElementById(
        `spaces_toolbar_mochi_test-spacesButton-${name}`
      );
      Assert.ok(button, `Button for space ${name} should exist.`);
      Assert.equal(
        title,
        button.title,
        `Title of button for space ${name} should be correct.`
      );

      // Check button icon.
      const imgStyles = window.getComputedStyle(button.querySelector("img"));
      Assert.equal(
        imgStyles.content,
        makeIconSet(
          icons[config.selectedTheme],
          icons.default || icons[config.selectedTheme]
        ),
        `Icon for button of space ${name} with theme ${config.selectedTheme} should be correct.`
      );

      // Check badge.
      const badge = button.querySelector(".spaces-badge-container");
      const badgeStyles = window.getComputedStyle(badge);
      if (badgeText) {
        Assert.equal(
          "block",
          badgeStyles.display,
          `Button of space ${name} should have a badge.`
        );
        Assert.equal(
          badgeText,
          badge.textContent,
          `Badge of button of space ${name} should have the correct content.`
        );
        if (badgeBackgroundColor) {
          Assert.equal(
            badgeBackgroundColor,
            badgeStyles.backgroundColor,
            `Badge of button of space ${name} should have the correct backgroundColor.`
          );
        }
      } else {
        Assert.equal(
          "none",
          badgeStyles.display,
          `Button of space ${name} should not have a badge.`
        );
      }

      const collapseButton = document.getElementById("collapseButton");
      const revealButton = document.getElementById("spacesToolbarReveal");
      const pinnedButton = document.getElementById("spacesPinnedButton");
      const pinnedPopup = document.getElementById("spacesButtonMenuPopup");

      Assert.ok(revealButton.hidden, "The status bar toggle button is hidden");
      Assert.ok(pinnedButton.hidden, "The pinned titlebar button is hidden");
      collapseButton.click();
      Assert.ok(
        !revealButton.hidden,
        "The status bar toggle button is not hidden"
      );
      Assert.ok(
        !pinnedButton.hidden,
        "The pinned titlebar button is not hidden"
      );
      pinnedPopup.openPopup();

      // Check menuitem.
      const menuitem = window.document.getElementById(
        `spaces_toolbar_mochi_test-spacesButton-${name}-menuitem`
      );
      Assert.ok(menuitem, `Menuitem for id ${name} should exist.`);
      Assert.equal(
        title,
        menuitem.label,
        `Label of menuitem of space ${name} should be correct.`
      );

      // Check menuitem icon.
      const menuitemStyles = window.getComputedStyle(menuitem);
      Assert.equal(
        menuitemStyles.listStyleImage,
        makeIconSet(
          icons[config.selectedTheme],
          icons.default || icons[config.selectedTheme]
        ),
        `Icon of menuitem for space ${name} with theme ${config.selectedTheme} should be correct.`
      );

      await closeMenuPopup(pinnedPopup);
      revealButton.click();
      Assert.ok(revealButton.hidden, "The status bar toggle button is hidden");
      Assert.ok(pinnedButton.hidden, "The pinned titlebar button is hidden");

      //Check space and url.
      const space = window.gSpacesToolbar.spaces.find(
        s => s.name == `spaces_toolbar_mochi_test-spacesButton-${name}`
      );
      Assert.ok(space, "The space of this button should exists");
      Assert.equal(
        url,
        space.url,
        "The stored url of the space should be correct"
      );
    }
    extension.sendMessage();
  });

  extension.onMessage("getConfig", async () => {
    extension.sendMessage(config);
  });

  await extension.startup();
  await extension.awaitFinish();
  await extension.unload();
}

add_task(async function test_add_update_remove() {
  async function background() {
    const manifest = browser.runtime.getManifest();
    const propertyClearValue = manifest.manifest_version == 2 ? "" : null;

    const extensionIcon = manifest.icons
      ? browser.runtime.getURL(manifest.icons[16])
      : "chrome://messenger/content/extension.svg";

    await window.sendMessage("checkUI", []);

    // Test create().
    browser.test.log("create(): Without id.");
    await browser.test.assertThrows(
      () => browser.spaces.create(),
      /Incorrect argument types for spaces.create./,
      "create() without name should throw."
    );

    browser.test.log("create(): Without default url.");
    await browser.test.assertThrows(
      () => browser.spaces.create("space_1"),
      /Incorrect argument types for spaces.create./,
      "create() without default url should throw."
    );

    browser.test.log("create(): With invalid default url.");
    await browser.test.assertRejects(
      browser.spaces.create("space_1", "invalid://url"),
      /Failed to create space with name space_1: Invalid default url./,
      "create() with an invalid default url should throw."
    );

    browser.test.log("create(): With default url only.");
    const space_1 = await browser.spaces.create(
      "space_1",
      "https://test.invalid"
    );
    const expected_space_1 = {
      name: "space_1",
      title: "Generated extension",
      url: "https://test.invalid",
      icons: {
        default: `url("${extensionIcon}")`,
      },
    };
    await window.sendMessage("checkUI", [expected_space_1]);

    browser.test.log("create(): With default url only, but existing id.");
    await browser.test.assertRejects(
      browser.spaces.create("space_1", "https://test.invalid"),
      /Failed to create space with name space_1: Space already exists for this extension./,
      "create() with existing id should throw."
    );

    browser.test.log("create(): With most properties.");
    const space_2 = await browser.spaces.create("space_2", "/local/file.html", {
      title: "Google",
      defaultIcons: "default.png",
      badgeText: "12",
      badgeBackgroundColor: [50, 100, 150, 255],
    });
    const expected_space_2 = {
      name: "space_2",
      title: "Google",
      url: browser.runtime.getURL("/local/file.html"),
      icons: {
        default: `url("${browser.runtime.getURL("default.png")}")`,
      },
      badgeText: "12",
      badgeBackgroundColor: "rgb(50, 100, 150)",
    };
    await window.sendMessage("checkUI", [expected_space_1, expected_space_2]);

    // Test update().
    browser.test.log("update(): Without id.");
    await browser.test.assertThrows(
      () => browser.spaces.update(),
      /Incorrect argument types for spaces.update./,
      "update() without id should throw."
    );

    browser.test.log("update(): With invalid id.");
    await browser.test.assertRejects(
      browser.spaces.update(1234),
      /Failed to update space with id 1234: Unknown id./,
      "update() with invalid id should throw."
    );

    browser.test.log("update(): Without properties.");
    await browser.spaces.update(space_1.id);
    await window.sendMessage("checkUI", [expected_space_1, expected_space_2]);

    browser.test.log("update(): Updating the badge.");
    await browser.spaces.update(space_2.id, {
      badgeText: "ok",
      badgeBackgroundColor: "green",
    });
    expected_space_2.badgeText = "ok";
    expected_space_2.badgeBackgroundColor = "rgb(0, 128, 0)";
    await window.sendMessage("checkUI", [expected_space_1, expected_space_2]);

    browser.test.log("update(): Removing the badge.");
    await browser.spaces.update(space_2.id, {
      badgeText: propertyClearValue,
    });
    delete expected_space_2.badgeText;
    delete expected_space_2.badgeBackgroundColor;
    await window.sendMessage("checkUI", [expected_space_1, expected_space_2]);

    browser.test.log("update(): Changing the title.");
    await browser.spaces.update(space_2.id, {
      title: "Some other title",
    });
    expected_space_2.title = "Some other title";
    await window.sendMessage("checkUI", [expected_space_1, expected_space_2]);

    browser.test.log("update(): Removing the title.");
    await browser.spaces.update(space_2.id, {
      title: propertyClearValue,
    });
    expected_space_2.title = "Generated extension";
    await window.sendMessage("checkUI", [expected_space_1, expected_space_2]);

    browser.test.log("update(): Setting invalid default url.");
    await browser.test.assertRejects(
      browser.spaces.update(space_2.id, "invalid://url"),
      `Failed to update space with id ${space_2.id}: Invalid default url.`,
      "update() with invalid default url should throw."
    );

    await browser.spaces.update(space_2.id, "https://test.more.invalid", {
      title: "Bing",
    });
    expected_space_2.title = "Bing";
    expected_space_2.url = "https://test.more.invalid";
    await window.sendMessage("checkUI", [expected_space_1, expected_space_2]);

    // Test remove().
    browser.test.log("remove(): Removing without id.");
    await browser.test.assertThrows(
      () => browser.spaces.remove(),
      /Incorrect argument types for spaces.remove./,
      "remove() without id should throw."
    );

    browser.test.log("remove(): Removing with invalid id.");
    await browser.test.assertRejects(
      browser.spaces.remove(1234),
      /Failed to remove space with id 1234: Unknown id./,
      "remove() with invalid id should throw."
    );

    browser.test.log("remove(): Removing space_1.");
    await browser.spaces.remove(space_1.id);
    await window.sendMessage("checkUI", [expected_space_2]);

    browser.test.notifyPass();
  }
  // Manifest V2 and V3 have a different schema for the SpaceButtonProperties,
  // test them both.
  for (const manifestVersion of [2, 3]) {
    await test_space(background, {
      manifestVersion,
      selectedTheme: "default",
    });
    await test_space(background, {
      manifestVersion,
      selectedTheme: "default",
      manifestIcons: { 16: "manifest.png" },
    });
  }
});

add_task(async function test_open_reload_close() {
  async function background() {
    await window.sendMessage("checkTabs", { openSpacesUrls: [] });

    // Add spaces.
    const url1 = `http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content.html`;
    const space_1 = await browser.spaces.create("space_1", url1);
    const url2 = `http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content_body.html`;
    const space_2 = await browser.spaces.create("space_2", url2);

    // Open spaces.
    await window.sendMessage("checkTabs", {
      action: "open",
      url: url1,
      spaceName: "space_1",
      openSpacesUrls: [url1],
    });
    await window.sendMessage("checkTabs", {
      action: "open",
      url: url2,
      spaceName: "space_2",
      openSpacesUrls: [url1, url2],
    });

    // Switch to open spaces tab.
    await window.sendMessage("checkTabs", {
      action: "switch",
      url: url1,
      spaceName: "space_1",
      openSpacesUrls: [url1, url2],
    });
    await window.sendMessage("checkTabs", {
      action: "switch",
      url: url2,
      spaceName: "space_2",
      openSpacesUrls: [url1, url2],
    });

    // TODO: Add test for tab reloading, once this has been implemented.

    // Remove spaces and check that related spaces tab are closed.
    await browser.spaces.remove(space_1.id);
    await window.sendMessage("checkTabs", { openSpacesUrls: [url2] });
    await browser.spaces.remove(space_2.id);
    await window.sendMessage("checkTabs", { openSpacesUrls: [] });

    browser.test.notifyPass();
  }
  await test_space(background, { selectedTheme: "default" });
});

add_task(async function test_icons() {
  async function background() {
    const manifest = browser.runtime.getManifest();
    const propertyClearValue = manifest.manifest_version == 2 ? "" : null;
    const extensionIcon = manifest.icons
      ? browser.runtime.getURL(manifest.icons[16])
      : "chrome://messenger/content/extension.svg";

    // Test 1: Setting defaultIcons and themeIcons.
    browser.test.log("create(): Setting defaultIcons and themeIcons.");
    const space_1 = await browser.spaces.create(
      "space_1",
      "https://test.invalid",
      {
        title: "Google",
        defaultIcons: "default.png",
        themeIcons: [
          {
            dark: "dark.png",
            light: "light.png",
            size: 16,
          },
        ],
      }
    );
    const expected_space_1 = {
      name: "space_1",
      title: "Google",
      url: "https://test.invalid",
      icons: {
        default: `url("${browser.runtime.getURL("default.png")}")`,
        dark: `url("${browser.runtime.getURL("dark.png")}")`,
        light: `url("${browser.runtime.getURL("light.png")}")`,
      },
    };
    await window.sendMessage("checkUI", [expected_space_1]);

    // Clearing defaultIcons.
    await browser.spaces.update(space_1.id, {
      defaultIcons: propertyClearValue,
    });
    expected_space_1.icons = {
      default: null,
      dark: `url("${browser.runtime.getURL("dark.png")}")`,
      light: `url("${browser.runtime.getURL("light.png")}")`,
    };
    await window.sendMessage("checkUI", [expected_space_1]);

    // Setting other defaultIcons.
    await browser.spaces.update(space_1.id, {
      defaultIcons: "other.png",
    });
    expected_space_1.icons = {
      default: `url("${browser.runtime.getURL("other.png")}")`,
      dark: `url("${browser.runtime.getURL("dark.png")}")`,
      light: `url("${browser.runtime.getURL("light.png")}")`,
    };
    await window.sendMessage("checkUI", [expected_space_1]);

    // Clearing themeIcons.
    await browser.spaces.update(space_1.id, {
      themeIcons: [],
    });
    expected_space_1.icons = {
      default: `url("${browser.runtime.getURL("other.png")}")`,
      dark: `url("${browser.runtime.getURL("other.png")}")`,
      light: `url("${browser.runtime.getURL("other.png")}")`,
    };
    await window.sendMessage("checkUI", [expected_space_1]);

    // Setting other themeIcons.
    await browser.spaces.update(space_1.id, {
      themeIcons: [
        {
          dark: "dark2.png",
          light: "light2.png",
          size: 16,
        },
      ],
    });
    expected_space_1.icons = {
      default: `url("${browser.runtime.getURL("other.png")}")`,
      dark: `url("${browser.runtime.getURL("dark2.png")}")`,
      light: `url("${browser.runtime.getURL("light2.png")}")`,
    };
    await window.sendMessage("checkUI", [expected_space_1]);

    // Test 2: Setting themeIcons only.
    browser.test.log("create(): Setting themeIcons only.");
    const space_2 = await browser.spaces.create(
      "space_2",
      "https://test.other.invalid",
      {
        title: "Wikipedia",
        themeIcons: [
          {
            dark: "dark2.png",
            light: "light2.png",
            size: 16,
          },
        ],
      }
    );
    // Not specifying defaultIcons but only themeIcons should always use the
    // theme icons, even for the default theme (and not the extension icon).
    const expected_space_2 = {
      name: "space_2",
      title: "Wikipedia",
      url: "https://test.other.invalid",
      icons: {
        default: null,
        dark: `url("${browser.runtime.getURL("dark2.png")}")`,
        light: `url("${browser.runtime.getURL("light2.png")}")`,
      },
    };
    await window.sendMessage("checkUI", [expected_space_1, expected_space_2]);

    // Clearing themeIcons.
    await browser.spaces.update(space_2.id, {
      themeIcons: [],
    });
    expected_space_2.icons = {
      default: `url("${extensionIcon}")`,
      dark: `url("${extensionIcon}")`,
      light: `url("${extensionIcon}")`,
    };
    await window.sendMessage("checkUI", [expected_space_1, expected_space_2]);

    // Test 3: Setting defaultIcons only.
    browser.test.log("create(): Setting defaultIcons only.");
    const space_3 = await browser.spaces.create(
      "space_3",
      "https://test.more.invalid",
      {
        title: "Bing",
        defaultIcons: "default.png",
      }
    );
    const expected_space_3 = {
      name: "space_3",
      title: "Bing",
      url: "https://test.more.invalid",
      icons: {
        default: `url("${browser.runtime.getURL("default.png")}")`,
        dark: `url("${browser.runtime.getURL("default.png")}")`,
        light: `url("${browser.runtime.getURL("default.png")}")`,
      },
    };
    await window.sendMessage("checkUI", [
      expected_space_1,
      expected_space_2,
      expected_space_3,
    ]);

    // Clearing defaultIcons and setting themeIcons.
    await browser.spaces.update(space_3.id, {
      defaultIcons: propertyClearValue,
      themeIcons: [
        {
          dark: "dark3.png",
          light: "light3.png",
          size: 16,
        },
      ],
    });
    expected_space_3.icons = {
      default: null,
      dark: `url("${browser.runtime.getURL("dark3.png")}")`,
      light: `url("${browser.runtime.getURL("light3.png")}")`,
    };
    await window.sendMessage("checkUI", [
      expected_space_1,
      expected_space_2,
      expected_space_3,
    ]);

    // Test 4: Setting no icons.
    browser.test.log("create(): Setting no icons.");
    const space_4 = await browser.spaces.create(
      "space_4",
      "https://duckduckgo.com",
      {
        title: "DuckDuckGo",
      }
    );
    const expected_space_4 = {
      name: "space_4",
      title: "DuckDuckGo",
      url: "https://duckduckgo.com",
      icons: {
        default: `url("${extensionIcon}")`,
        dark: `url("${extensionIcon}")`,
        light: `url("${extensionIcon}")`,
      },
    };
    await window.sendMessage("checkUI", [
      expected_space_1,
      expected_space_2,
      expected_space_3,
      expected_space_4,
    ]);

    // Setting and clearing default icons.
    await browser.spaces.update(space_4.id, {
      defaultIcons: "default.png",
    });
    expected_space_4.icons = {
      default: `url("${browser.runtime.getURL("default.png")}")`,
      dark: `url("${browser.runtime.getURL("default.png")}")`,
      light: `url("${browser.runtime.getURL("default.png")}")`,
    };
    await window.sendMessage("checkUI", [
      expected_space_1,
      expected_space_2,
      expected_space_3,
      expected_space_4,
    ]);
    await browser.spaces.update(space_4.id, {
      defaultIcons: propertyClearValue,
    });
    expected_space_4.icons = {
      default: `url("${extensionIcon}")`,
      dark: `url("${extensionIcon}")`,
      light: `url("${extensionIcon}")`,
    };
    await window.sendMessage("checkUI", [
      expected_space_1,
      expected_space_2,
      expected_space_3,
      expected_space_4,
    ]);

    browser.test.notifyPass();
  }

  // Manifest V2 and V3 have a different schema for the SpaceButtonProperties,
  // test them both.
  for (const manifestVersion of [2, 3]) {
    // Test with and without icons defined in the manifest.
    for (const manifestIcons of [null, { 16: "manifest16.png" }]) {
      const dark_theme = await AddonManager.getAddonByID(
        "thunderbird-compact-dark@mozilla.org"
      );
      await dark_theme.enable();
      await test_space(background, {
        selectedTheme: "light",
        manifestIcons,
        manifestVersion,
      });

      const light_theme = await AddonManager.getAddonByID(
        "thunderbird-compact-light@mozilla.org"
      );
      await light_theme.enable();
      await test_space(background, {
        selectedTheme: "dark",
        manifestIcons,
        manifestVersion,
      });

      // Disabling a theme will enable the default theme.
      await light_theme.disable();
      await test_space(background, {
        selectedTheme: "default",
        manifestIcons,
        manifestVersion,
      });
    }
  }
});

add_task(async function test_open_programmatically() {
  async function background() {
    await window.sendMessage("checkTabs", { openSpacesUrls: [] });

    // Add spaces.
    const url1 = `http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content.html`;
    const space_1 = await browser.spaces.create("space_1", url1);
    const url2 = `http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content_body.html`;
    const space_2 = await browser.spaces.create("space_2", url2);
    await window.sendMessage("checkTabs", { openSpacesUrls: [] });

    async function openSpace(space, url) {
      const loadPromise = new Promise(resolve => {
        let urlSeen = false;
        const listener = (tabId, changeInfo) => {
          if (changeInfo.url && changeInfo.url == url) {
            urlSeen = true;
          }
          if (changeInfo.status == "complete" && urlSeen) {
            browser.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        browser.tabs.onUpdated.addListener(listener);
      });
      const tab = await browser.spaces.open(space.id);
      await loadPromise;

      browser.test.assertEq(
        space.id,
        tab.spaceId,
        "The opened tab should belong to the correct space"
      );

      const queriedTabs = await browser.tabs.query({ spaceId: space.id });
      browser.test.assertEq(
        1,
        queriedTabs.length,
        "browser.tabs.query() should find exactly one tab belonging to the opened space"
      );
      browser.test.assertEq(
        tab.id,
        queriedTabs[0].id,
        "browser.tabs.query() should find the correct tab belonging to the opened space"
      );
    }

    // Open space #1.
    await openSpace(space_1, url1);
    await window.sendMessage("checkTabs", {
      spaceName: "space_1",
      openSpacesUrls: [url1],
    });

    // Open space #2.
    await openSpace(space_2, url2);
    await window.sendMessage("checkTabs", {
      spaceName: "space_2",
      openSpacesUrls: [url1, url2],
    });

    // Switch to open space tab.
    await window.sendMessage("checkTabs", {
      action: "switch",
      url: url1,
      spaceName: "space_1",
      openSpacesUrls: [url1, url2],
    });

    await window.sendMessage("checkTabs", {
      action: "switch",
      url: url2,
      spaceName: "space_2",
      openSpacesUrls: [url1, url2],
    });

    // Remove spaces and check that related spaces tab are closed.
    await browser.spaces.remove(space_1.id);
    await window.sendMessage("checkTabs", { openSpacesUrls: [url2] });
    await browser.spaces.remove(space_2.id);
    await window.sendMessage("checkTabs", { openSpacesUrls: [] });

    browser.test.notifyPass();
  }
  await test_space(background, { selectedTheme: "default" });
});

// Load a second extension parallel to the standard space test, which creates
// two additional spaces.
async function test_query({ permissions }) {
  async function query_background() {
    function verify(description, expected, spaces) {
      browser.test.assertEq(
        expected.length,
        spaces.length,
        `${description}: Should find the correct number of spaces`
      );
      window.assertDeepEqual(
        spaces,
        expected,
        `${description}: Should find the correct spaces`
      );
    }

    async function query(queryInfo, expected) {
      const spaces =
        queryInfo === null
          ? await browser.spaces.query()
          : await browser.spaces.query(queryInfo);
      verify(`Query ${JSON.stringify(queryInfo)}`, expected, spaces);
    }

    const builtIn = [
      {
        id: 1,
        name: "mail",
        isBuiltIn: true,
        isSelfOwned: false,
      },
      {
        id: 2,
        isBuiltIn: true,
        isSelfOwned: false,
        name: "addressbook",
      },
      {
        id: 3,
        isBuiltIn: true,
        isSelfOwned: false,
        name: "calendar",
      },
      {
        id: 4,
        isBuiltIn: true,
        isSelfOwned: false,
        name: "tasks",
      },
      {
        id: 5,
        isBuiltIn: true,
        isSelfOwned: false,
        name: "chat",
      },
      {
        id: 6,
        isBuiltIn: true,
        isSelfOwned: false,
        name: "settings",
      },
    ];

    await window.sendMessage("checkTabs", { openSpacesUrls: [] });
    const [{ other_1, other_11, permissions: perms }] =
      await window.sendMessage("getConfig");
    const hasManagement = perms && perms.includes("management");

    // Verify space_1 from other extension.
    const expected_other_1 = {
      name: "space_1",
      isBuiltIn: false,
      isSelfOwned: true,
    };
    if (hasManagement) {
      expected_other_1.extensionId = "spaces_toolbar_other@mochi.test";
    }
    verify("Check space_1 from other extension", other_1, expected_other_1);

    // Verify space_11 from other extension.
    const expected_other_11 = {
      name: "space_11",
      isBuiltIn: false,
      isSelfOwned: true,
    };
    if (hasManagement) {
      expected_other_11.extensionId = "spaces_toolbar_other@mochi.test";
    }
    verify("Check space_11 from other extension", other_11, expected_other_11);

    // Manipulate isSelfOwned, because we got those from the other extension.
    other_1.isSelfOwned = false;
    other_11.isSelfOwned = false;

    await query(null, [...builtIn, other_1, other_11]);
    await query({}, [...builtIn, other_1, other_11]);
    await query({ isSelfOwned: false }, [...builtIn, other_1, other_11]);
    await query({ isBuiltIn: true }, [...builtIn]);
    await query({ isBuiltIn: false }, [other_1, other_11]);
    await query({ isSelfOwned: true }, []);
    await query(
      { extensionId: "spaces_toolbar_other@mochi.test" },
      hasManagement ? [other_1, other_11] : []
    );

    // Add spaces.
    const url1 = `http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content.html`;
    const space_1 = await browser.spaces.create("space_1", url1);
    const url2 = `http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content_body.html`;
    const space_2 = await browser.spaces.create("space_2", url2);

    // Verify returned space_1
    const expected_space_1 = {
      name: "space_1",
      isBuiltIn: false,
      isSelfOwned: true,
    };
    if (hasManagement) {
      expected_space_1.extensionId = "spaces_toolbar@mochi.test";
    }
    verify("Check space_1", space_1, expected_space_1);

    // Verify returned space_2
    const expected_space_2 = {
      name: "space_2",
      isBuiltIn: false,
      isSelfOwned: true,
    };
    if (hasManagement) {
      expected_space_2.extensionId = "spaces_toolbar@mochi.test";
    }
    verify("Check space_2", space_2, expected_space_2);

    await query(null, [...builtIn, other_1, other_11, space_1, space_2]);
    await query({ isSelfOwned: false }, [...builtIn, other_1, other_11]);
    await query({ isBuiltIn: true }, [...builtIn]);
    await query({ isBuiltIn: false }, [other_1, other_11, space_1, space_2]);
    await query({ isSelfOwned: true }, [space_1, space_2]);
    await query(
      { extensionId: "spaces_toolbar_other@mochi.test" },
      hasManagement ? [other_1, other_11] : []
    );
    await query(
      { extensionId: "spaces_toolbar@mochi.test" },
      hasManagement ? [space_1, space_2] : []
    );

    await query({ spaceId: space_1.id }, [space_1]);
    await query({ spaceId: other_1.id }, [other_1]);
    await query({ spaceId: space_2.id }, [space_2]);
    await query({ spaceId: other_11.id }, [other_11]);
    await query({ name: "space_1" }, [other_1, space_1]);
    await query({ name: "space_2" }, [space_2]);
    await query({ name: "space_11" }, [other_11]);

    browser.test.notifyPass();
  }

  const otherExtension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const url = `http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content.html`;
        const other_1 = await browser.spaces.create("space_1", url);
        const other_11 = await browser.spaces.create("space_11", url);
        browser.test.sendMessage("Done", { other_1, other_11 });
        browser.test.notifyPass();
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 3,
      browser_specific_settings: {
        gecko: {
          id: "spaces_toolbar_other@mochi.test",
        },
      },
      permissions,
      background: { scripts: ["utils.js", "background.js"] },
    },
  });

  await otherExtension.startup();
  const { other_1, other_11 } = await otherExtension.awaitMessage("Done");

  await test_space(query_background, {
    selectedTheme: "default",
    other_1,
    other_11,
    permissions,
  });

  await otherExtension.awaitFinish();
  await otherExtension.unload();
}

add_task(async function test_query_no_management_permission() {
  await test_query({ permissions: [] });
});

add_task(async function test_query_management_permission() {
  await test_query({ permissions: ["management"] });
});

// Test built-in spaces to make sure the space definition of the spaceTracker in
// ext-mails.js is matching the actual space definition in spacesToolbar.js
add_task(async function test_builtIn_spaces() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const checkSpace = async (spaceId, spaceName) => {
          const spaces = await browser.spaces.query({ id: spaceId });
          browser.test.assertEq(spaces.length, 1, "Should find a single space");
          browser.test.assertEq(
            spaces[0].isBuiltIn,
            true,
            "Should find a built-in space"
          );
          browser.test.assertEq(
            spaces[0].name,
            spaceName,
            "Should find the correct space"
          );
        };

        // Test the already open mail space.

        const mailTabs = await browser.tabs.query({ type: "mail" });
        browser.test.assertEq(
          mailTabs.length,
          1,
          "Should find a single mail tab"
        );
        await checkSpace(mailTabs[0].spaceId, "mail");

        // Test all other spaces.

        const builtInSpaces = [
          "addressbook",
          "calendar",
          "tasks",
          "chat",
          "settings",
        ];

        for (const spaceName of builtInSpaces) {
          await new Promise(resolve => {
            const listener = async tab => {
              await checkSpace(tab.spaceId, spaceName);
              browser.tabs.remove(tab.id);
              browser.tabs.onCreated.removeListener(listener);
              resolve();
            };
            browser.tabs.onCreated.addListener(listener);
            browser.test.sendMessage("openSpace", spaceName);
          });
        }

        browser.test.notifyPass();
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 2,
      browser_specific_settings: {
        gecko: {
          id: "built-in-spaces@mochi.test",
        },
      },
      background: { scripts: ["utils.js", "background.js"] },
    },
  });

  extension.onMessage("openSpace", async spaceName => {
    window.gSpacesToolbar.openSpace(
      window.document.getElementById("tabmail"),
      window.gSpacesToolbar.spaces.find(space => space.name == spaceName)
    );
  });

  await extension.startup();
  await extension.awaitFinish();
  await extension.unload();
});
