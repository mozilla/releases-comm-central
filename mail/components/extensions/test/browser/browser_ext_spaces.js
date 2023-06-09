/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

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
  let manifest = {
    manifest_version: 3,
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

  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": background,
      "utils.js": await getUtilsJS(),
    },
    manifest,
  });

  extension.onMessage("checkTabs", async test => {
    let tabmail = document.getElementById("tabmail");

    if (test.action && test.spaceName && test.url) {
      let tabPromise =
        test.action == "switch"
          ? BrowserTestUtils.waitForEvent(tabmail.tabContainer, "TabSelect")
          : contentTabOpenPromise(tabmail, test.url);
      let button = window.document.getElementById(
        `spaces_toolbar_mochi_test-spacesButton-${test.spaceName}`
      );
      button.click();
      await tabPromise;
    }

    let tabs = tabmail.tabInfo.filter(tabInfo => !!tabInfo.spaceButtonId);
    Assert.equal(
      test.openSpacesUrls.length,
      tabs.length,
      `Should have found the correct number of open add-on spaces tabs.`
    );
    for (let expectedUrl of test.openSpacesUrls) {
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
    let addonButtons = document.querySelectorAll(".spaces-addon-button");
    Assert.equal(
      expected.length,
      addonButtons.length,
      `Should have found the correct number of buttons.`
    );

    for (let {
      name,
      url,
      title,
      icons,
      badgeText,
      badgeBackgroundColor,
    } of expected) {
      // Check button.
      let button = window.document.getElementById(
        `spaces_toolbar_mochi_test-spacesButton-${name}`
      );
      Assert.ok(button, `Button for space ${name} should exist.`);
      Assert.equal(
        title,
        button.title,
        `Title of button for space ${name} should be correct.`
      );

      // Check button icon.
      let imgStyles = window.getComputedStyle(button.querySelector("img"));
      Assert.equal(
        icons[config.selectedTheme],
        imgStyles.content,
        `Icon for button of space ${name} with theme ${config.selectedTheme} should be correct.`
      );

      // Check badge.
      let badge = button.querySelector(".spaces-badge-container");
      let badgeStyles = window.getComputedStyle(badge);
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

      let collapseButton = document.getElementById("collapseButton");
      let revealButton = document.getElementById("spacesToolbarReveal");
      let pinnedButton = document.getElementById("spacesPinnedButton");
      let pinnedPopup = document.getElementById("spacesButtonMenuPopup");

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
      let menuitem = window.document.getElementById(
        `spaces_toolbar_mochi_test-spacesButton-${name}-menuitem`
      );
      Assert.ok(menuitem, `Menuitem for id ${name} should exist.`);
      Assert.equal(
        title,
        menuitem.label,
        `Label of menuitem of space ${name} should be correct.`
      );

      // Check menuitem icon.
      let menuitemStyles = window.getComputedStyle(menuitem);
      Assert.equal(
        icons[config.selectedTheme],
        menuitemStyles.listStyleImage,
        `Icon of menuitem for space ${name} with theme ${config.selectedTheme} should be correct.`
      );

      pinnedPopup.hidePopup();
      revealButton.click();
      Assert.ok(revealButton.hidden, "The status bar toggle button is hidden");
      Assert.ok(pinnedButton.hidden, "The pinned titlebar button is hidden");

      //Check space and url.
      let space = window.gSpacesToolbar.spaces.find(
        space => space.name == `spaces_toolbar_mochi_test-spacesButton-${name}`
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
    let manifest = browser.runtime.getManifest();
    let extensionIcon = manifest.icons
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
    let space_1 = await browser.spaces.create(
      "space_1",
      "https://test.invalid"
    );
    let expected_space_1 = {
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
    let space_2 = await browser.spaces.create("space_2", "/local/file.html", {
      title: "Google",
      defaultIcons: "default.png",
      badgeText: "12",
      badgeBackgroundColor: [50, 100, 150, 255],
    });
    let expected_space_2 = {
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
      badgeText: "",
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
      title: "",
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
  await test_space(background, { selectedTheme: "default" });
  await test_space(background, {
    selectedTheme: "default",
    manifestIcons: { 16: "manifest.png" },
  });
});

add_task(async function test_open_reload_close() {
  async function background() {
    await window.sendMessage("checkTabs", { openSpacesUrls: [] });

    // Add spaces.
    let url1 = `http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content.html`;
    let space_1 = await browser.spaces.create("space_1", url1);
    let url2 = `http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content_body.html`;
    let space_2 = await browser.spaces.create("space_2", url2);

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
    let manifest = browser.runtime.getManifest();
    let extensionIcon = manifest.icons
      ? browser.runtime.getURL(manifest.icons[16])
      : "chrome://messenger/content/extension.svg";

    // Test 1: Setting defaultIcons and themeIcons.
    browser.test.log("create(): Setting defaultIcons and themeIcons.");
    let space_1 = await browser.spaces.create(
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
    let expected_space_1 = {
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
      defaultIcons: "",
    });
    expected_space_1.icons = {
      default: `url("${browser.runtime.getURL("dark.png")}")`,
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
    let space_2 = await browser.spaces.create(
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
    let expected_space_2 = {
      name: "space_2",
      title: "Wikipedia",
      url: "https://test.other.invalid",
      icons: {
        default: `url("${browser.runtime.getURL("dark2.png")}")`,
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
    let space_3 = await browser.spaces.create(
      "space_3",
      "https://test.more.invalid",
      {
        title: "Bing",
        defaultIcons: "default.png",
      }
    );
    let expected_space_3 = {
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
      defaultIcons: "",
      themeIcons: [
        {
          dark: "dark3.png",
          light: "light3.png",
          size: 16,
        },
      ],
    });
    expected_space_3.icons = {
      default: `url("${browser.runtime.getURL("dark3.png")}")`,
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
    let space_4 = await browser.spaces.create(
      "space_4",
      "https://duckduckgo.com",
      {
        title: "DuckDuckGo",
      }
    );
    let expected_space_4 = {
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
      defaultIcons: "",
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

  // Test with and without icons defined in the manifest.
  for (let manifestIcons of [null, { 16: "manifest16.png" }]) {
    let dark_theme = await AddonManager.getAddonByID(
      "thunderbird-compact-dark@mozilla.org"
    );
    await dark_theme.enable();
    await test_space(background, { selectedTheme: "light", manifestIcons });

    let light_theme = await AddonManager.getAddonByID(
      "thunderbird-compact-light@mozilla.org"
    );
    await light_theme.enable();
    await test_space(background, { selectedTheme: "dark", manifestIcons });

    // Disabling a theme will enable the default theme.
    await light_theme.disable();
    await test_space(background, { selectedTheme: "default", manifestIcons });
  }
});

add_task(async function test_open_programmatically() {
  async function background() {
    await window.sendMessage("checkTabs", { openSpacesUrls: [] });

    // Add spaces.
    let url1 = `http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content.html`;
    let space_1 = await browser.spaces.create("space_1", url1);
    let url2 = `http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content_body.html`;
    let space_2 = await browser.spaces.create("space_2", url2);
    await window.sendMessage("checkTabs", { openSpacesUrls: [] });

    async function openSpace(space, url) {
      let loadPromise = new Promise(resolve => {
        let urlSeen = false;
        let listener = (tabId, changeInfo) => {
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
      let tab = await browser.spaces.open(space.id);
      await loadPromise;

      browser.test.assertEq(
        space.id,
        tab.spaceId,
        "The opened tab should belong to the correct space"
      );

      let queriedTabs = await browser.tabs.query({ spaceId: space.id });
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
      let spaces =
        queryInfo === null
          ? await browser.spaces.query()
          : await browser.spaces.query(queryInfo);
      verify(`Query ${JSON.stringify(queryInfo)}`, expected, spaces);
    }

    let builtIn = [
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
    let [{ other_1, other_11, permissions }] = await window.sendMessage(
      "getConfig"
    );
    let hasManagement = permissions && permissions.includes("management");

    // Verify space_1 from other extension.
    let expected_other_1 = {
      name: "space_1",
      isBuiltIn: false,
      isSelfOwned: true,
    };
    if (hasManagement) {
      expected_other_1.extensionId = "spaces_toolbar_other@mochi.test";
    }
    verify("Check space_1 from other extension", other_1, expected_other_1);

    // Verify space_11 from other extension.
    let expected_other_11 = {
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
    let url1 = `http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content.html`;
    let space_1 = await browser.spaces.create("space_1", url1);
    let url2 = `http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content_body.html`;
    let space_2 = await browser.spaces.create("space_2", url2);

    // Verify returned space_1
    let expected_space_1 = {
      name: "space_1",
      isBuiltIn: false,
      isSelfOwned: true,
    };
    if (hasManagement) {
      expected_space_1.extensionId = "spaces_toolbar@mochi.test";
    }
    verify("Check space_1", space_1, expected_space_1);

    // Verify returned space_2
    let expected_space_2 = {
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

    await query({ id: space_1.id }, [space_1]);
    await query({ id: other_1.id }, [other_1]);
    await query({ id: space_2.id }, [space_2]);
    await query({ id: other_11.id }, [other_11]);
    await query({ name: "space_1" }, [other_1, space_1]);
    await query({ name: "space_2" }, [space_2]);
    await query({ name: "space_11" }, [other_11]);

    browser.test.notifyPass();
  }

  let otherExtension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        let url = `http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content.html`;
        let other_1 = await browser.spaces.create("space_1", url);
        let other_11 = await browser.spaces.create("space_11", url);
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
  let { other_1, other_11 } = await otherExtension.awaitMessage("Done");

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
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const checkSpace = async (spaceId, spaceName) => {
          let spaces = await browser.spaces.query({ id: spaceId });
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

        let mailTabs = await browser.tabs.query({ type: "mail" });
        browser.test.assertEq(
          mailTabs.length,
          1,
          "Should find a single mail tab"
        );
        await checkSpace(mailTabs[0].spaceId, "mail");

        // Test all other spaces.

        let builtInSpaces = [
          "addressbook",
          "calendar",
          "tasks",
          "chat",
          "settings",
        ];

        for (let spaceName of builtInSpaces) {
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
