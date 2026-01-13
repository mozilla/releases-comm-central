/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

requestLongerTimeout(2);

// Load subscript shared with all spaces tests.
Services.scriptloader.loadSubScript(
  new URL("head_spaces.js", gTestPath).href,
  this
);

add_setup(async () => {
  // Reduce animations to prevent intermittent fails due to late theme changes.
  Services.prefs.setIntPref("ui.prefersReducedMotion", 1);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("ui.prefersReducedMotion");
  });
});

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
      `Failed to create space with name space_1: Invalid URL: invalid://url`,
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
      browser.spaces.update(1234, "invalid://url"),
      /Failed to update space with id 1234: Unknown id./,
      "update() with invalid id should throw."
    );

    browser.test.log("update(): Without properties.");
    await browser.test.assertThrows(
      () => browser.spaces.update(space_1.id),
      /Incorrect argument types for spaces.update./,
      "update() without properties should throw."
    );

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
      `Failed to update space with id ${space_2.id}: Invalid URL: invalid://url`,
      "update() with invalid default url should throw."
    );

    await browser.spaces.update(space_2.id, {
      url: "https://test.other.invalid",
    });
    expected_space_2.url = "https://test.other.invalid";
    await window.sendMessage("checkUI", [expected_space_1, expected_space_2]);

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
    const DEFAULT_ICON = "default.png";
    const LIGHT_THEME_ICON = "dark.png";
    const DARK_THEME_ICON = "light.png";

    const manifest = browser.runtime.getManifest();
    const propertyClearValue = manifest.manifest_version == 2 ? "" : null;
    const extensionIcon = manifest.icons
      ? browser.runtime.getURL(manifest.icons[16])
      : "chrome://messenger/content/extension.svg";

    // Test 1: Setting defaultIcons and themeIcons.
    browser.test.log("create(): Setting defaultIcons and themeIcons.");
    const space_1 = await browser.spaces.create(
      "space_1",
      {
        url: "https://test.invalid",
      },
      {
        title: "Google",
        defaultIcons: DEFAULT_ICON,
        themeIcons: [
          {
            dark: DARK_THEME_ICON,
            light: LIGHT_THEME_ICON,
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
        default: `url("${browser.runtime.getURL(DEFAULT_ICON)}")`,
        dark: `url("${browser.runtime.getURL(LIGHT_THEME_ICON)}")`,
        light: `url("${browser.runtime.getURL(DARK_THEME_ICON)}")`,
      },
    };
    await window.sendMessage("checkUI", [expected_space_1]);

    // Clearing defaultIcons.
    await browser.spaces.update(space_1.id, {
      defaultIcons: propertyClearValue,
    });
    expected_space_1.icons = {
      default: null,
      dark: `url("${browser.runtime.getURL(LIGHT_THEME_ICON)}")`,
      light: `url("${browser.runtime.getURL(DARK_THEME_ICON)}")`,
    };
    await window.sendMessage("checkUI", [expected_space_1]);

    // Setting other defaultIcons.
    await browser.spaces.update(space_1.id, {
      defaultIcons: "other.png",
    });
    expected_space_1.icons = {
      default: `url("${browser.runtime.getURL("other.png")}")`,
      dark: `url("${browser.runtime.getURL(LIGHT_THEME_ICON)}")`,
      light: `url("${browser.runtime.getURL(DARK_THEME_ICON)}")`,
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
      dark: `url("${browser.runtime.getURL("light2.png")}")`,
      light: `url("${browser.runtime.getURL("dark2.png")}")`,
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
        dark: `url("${browser.runtime.getURL("light2.png")}")`,
        light: `url("${browser.runtime.getURL("dark2.png")}")`,
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
      dark: `url("${browser.runtime.getURL("light3.png")}")`,
      light: `url("${browser.runtime.getURL("dark3.png")}")`,
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
      {
        url: "https://duckduckgo.com",
      },
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

  const darkBuiltInTheme = await AddonManager.getAddonByID(
    "thunderbird-compact-dark@mozilla.org"
  );
  const lightBuiltInTheme = await AddonManager.getAddonByID(
    "thunderbird-compact-light@mozilla.org"
  );

  // Manifest V2 and V3 have a different schema for the SpaceButtonProperties,
  // test them both.
  for (const manifestVersion of [2, 3]) {
    // Test with and without icons defined in the manifest.
    for (const manifestIcons of [null, { 16: "manifest16.png" }]) {
      const darkCustomTheme = makeDarkTheme();
      await darkCustomTheme.startup();
      await test_space(background, {
        selectedTheme: "light",
        manifestIcons,
        manifestVersion,
      });
      await darkCustomTheme.unload();

      const lightCustomTheme = makeLightTheme();
      await lightCustomTheme.startup();
      await test_space(background, {
        selectedTheme: "dark",
        manifestIcons,
        manifestVersion,
      });
      await lightCustomTheme.unload();

      await darkBuiltInTheme.enable();
      await test_space(background, {
        selectedTheme: "light",
        manifestIcons,
        manifestVersion,
      });

      await lightBuiltInTheme.enable();
      await test_space(background, {
        selectedTheme: "light",
        manifestIcons,
        manifestVersion,
      });

      // Disabling a theme will enable the default theme.
      await lightBuiltInTheme.disable();
      await test_space(background, {
        selectedTheme: "light",
        manifestIcons,
        manifestVersion,
      });
    }
  }
});

add_task(async function test_open_programmatically_with_cookieStoreId() {
  async function background() {
    await window.sendMessage("checkTabs", { openSpacesUrls: [] });

    // Add spaces.
    const url1 = `http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content.html`;
    const space_1 = await browser.spaces.create("space_1", { url: url1 });
    const url2 = `http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content_body.html`;
    const space_2 = await browser.spaces.create("space_2", {
      url: url2,
      cookieStoreId: "firefox-container-1",
    });
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
    // Verify cookieStoreIds.
    const [spaceTab1] = await browser.tabs.query({ spaceId: space_1.id });
    browser.test.assertEq(
      "firefox-default",
      spaceTab1.cookieStoreId,
      `The cookieStoreId for space_1 should be correct.`
    );
    // Verify tab properties.
    await window.sendMessage("checkTabs", {
      spaceName: "space_1",
      openSpacesUrls: [url1],
    });

    // Open space #2.
    await openSpace(space_2, url2);
    // Verify cookieStoreIds.
    const [spaceTab2] = await browser.tabs.query({ spaceId: space_2.id });
    browser.test.assertEq(
      "firefox-container-1",
      spaceTab2.cookieStoreId,
      `The cookieStoreId for space_2 should be correct.`
    );
    // Verify tab properties.
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
  await test_space(background, {
    selectedTheme: "default",
    permissions: ["tabs", "cookies", "contextualIdentities"],
    useAddonManager: "temporary",
  });
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
