/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Helper Function, creates a test extension to verify expected button states.
 *
 * @param {Function} background - The background script executed by the test.
 * @param {string} selectedTheme - The selected theme (default, light or dark),
 *   used to select the expected button/menuitem icon.
 * @param {?object} manifestIcons - The icons entry of the extension manifest.
 */
async function test_space(background, selectedTheme, manifestIcons) {
  let manifest = {
    manifest_version: 3,
    browser_specific_settings: {
      gecko: {
        id: "spaces_toolbar@mochi.test",
      },
    },
    background: { scripts: ["utils.js", "background.js"] },
  };

  if (manifestIcons) {
    manifest.icons = manifestIcons;
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

    if (test.buttonId && test.url) {
      let tabPromise =
        test.action == "switch"
          ? BrowserTestUtils.waitForEvent(tabmail.tabContainer, "TabSelect")
          : contentTabOpenPromise(tabmail, test.url);
      let button = window.document.getElementById(
        `spaces_toolbar_mochi_test-spacesButton-${test.buttonId}`
      );
      button.click();
      await tabPromise;
    }

    let tabs = tabmail.tabInfo.filter(tabInfo => !!tabInfo.spaceId);
    Assert.equal(
      test.openSpacesUrls.length,
      tabs.length,
      `Should have found the correct number of open add-on spaces tabs.`
    );
    for (let expectedUrl of test.openSpacesUrls) {
      Assert.ok(
        tabmail.tabInfo.find(
          tabInfo =>
            !!tabInfo.spaceId && tabInfo.browser.currentURI.spec == expectedUrl
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
      id,
      url,
      title,
      icons,
      badgeText,
      badgeBackgroundColor,
    } of expected) {
      // Check button.
      let button = window.document.getElementById(
        `spaces_toolbar_mochi_test-spacesButton-${id}`
      );
      Assert.ok(button, `Button for id ${id} should exist.`);
      Assert.equal(
        title,
        button.title,
        `Title of button  ${id} should be correct.`
      );

      // Check button icon.
      let imgStyles = window.getComputedStyle(button.querySelector("img"));
      Assert.equal(
        icons[selectedTheme],
        imgStyles.content,
        `Icon of button ${id} with theme ${selectedTheme} should be correct.`
      );

      // Check badge.
      let badge = button.querySelector(".spaces-badge-container");
      let badgeStyles = window.getComputedStyle(badge);
      if (badgeText) {
        Assert.equal(
          "block",
          badgeStyles.display,
          `Button ${id} should have a badge.`
        );
        Assert.equal(
          badgeText,
          badge.textContent,
          `Badge of button ${id} should have the correct content.`
        );
        if (badgeBackgroundColor) {
          Assert.equal(
            badgeBackgroundColor,
            badgeStyles.backgroundColor,
            `Badge of button ${id} should have the correct backgroundColor.`
          );
        }
      } else {
        Assert.equal(
          "none",
          badgeStyles.display,
          `Button ${id} should not have a badge.`
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
        `spaces_toolbar_mochi_test-spacesButton-${id}-menuitem`
      );
      Assert.ok(menuitem, `Menuitem for id ${id} should exist.`);
      Assert.equal(
        title,
        menuitem.label,
        `Label of menuitem ${id} should be correct.`
      );

      // Check menuitem icon.
      let menuitemStyles = window.getComputedStyle(menuitem);
      Assert.equal(
        icons[selectedTheme],
        menuitemStyles.listStyleImage,
        `Icon of menuitem ${id} with theme ${selectedTheme} should be correct.`
      );

      pinnedPopup.hidePopup();
      revealButton.click();
      Assert.ok(revealButton.hidden, "The status bar toggle button is hidden");
      Assert.ok(pinnedButton.hidden, "The pinned titlebar button is hidden");

      //Check space and url.
      let space = window.gSpacesToolbar.spaces.find(
        space => space.name == `spaces_toolbar_mochi_test-spacesButton-${id}`
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

    // Test create().
    browser.test.log("create(): Without id.");
    await browser.test.assertThrows(
      () => browser.spaces.create(),
      /Incorrect argument types for spaces.create./,
      "create() without id should throw."
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
      /Failed to create new space: Invalid default url./,
      "create() with an invalid default url should throw."
    );

    browser.test.log("create(): With default url only.");
    await browser.spaces.create("space_1", "https://test.invalid");
    let expected_space_1 = {
      id: "space_1",
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
      /Failed to create new space: The id space_1 is already used by this extension./,
      "create() with existing id should throw."
    );

    browser.test.log("create(): With most properties.");
    await browser.spaces.create("space_2", "/local/file.html", {
      title: "Google",
      defaultIcons: "default.png",
      badgeText: "12",
      badgeBackgroundColor: [50, 100, 150, 255],
    });
    let expected_space_2 = {
      id: "space_2",
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
      browser.spaces.update("InvalidId"),
      /Failed to update space: A space with id InvalidId does not exist for this extension./,
      "update() with invalid id should throw."
    );

    browser.test.log("update(): Without properties.");
    await browser.spaces.update("space_1");
    await window.sendMessage("checkUI", [expected_space_1, expected_space_2]);

    browser.test.log("update(): Updating the badge.");
    await browser.spaces.update("space_2", {
      badgeText: "ok",
      badgeBackgroundColor: "green",
    });
    expected_space_2.badgeText = "ok";
    expected_space_2.badgeBackgroundColor = "rgb(0, 128, 0)";
    await window.sendMessage("checkUI", [expected_space_1, expected_space_2]);

    browser.test.log("update(): Removing the badge.");
    await browser.spaces.update("space_2", {
      badgeText: "",
    });
    delete expected_space_2.badgeText;
    delete expected_space_2.badgeBackgroundColor;
    await window.sendMessage("checkUI", [expected_space_1, expected_space_2]);

    browser.test.log("update(): Changing the title.");
    await browser.spaces.update("space_2", {
      title: "Some other title",
    });
    expected_space_2.title = "Some other title";
    await window.sendMessage("checkUI", [expected_space_1, expected_space_2]);

    browser.test.log("update(): Removing the title.");
    await browser.spaces.update("space_2", {
      title: "",
    });
    expected_space_2.title = "Generated extension";
    await window.sendMessage("checkUI", [expected_space_1, expected_space_2]);

    browser.test.log("update(): Setting invalid default url.");
    await browser.test.assertRejects(
      browser.spaces.update("space_2", "invalid://url"),
      /Failed to update space: Invalid default url./,
      "update() with invalid default url should throw."
    );

    await browser.spaces.update("space_2", "https://test.more.invalid", {
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
      browser.spaces.remove("InvalidId"),
      /Failed to remove space: A space with id InvalidId does not exist for this extension./,
      "remove() with invalid id should throw."
    );

    browser.test.log("remove(): Removing space_1.");
    await browser.spaces.remove("space_1");
    await window.sendMessage("checkUI", [expected_space_2]);

    browser.test.notifyPass();
  }
  await test_space(background, "default");
  await test_space(background, "default", { 16: "manifest.png" });
});

add_task(async function test_open_reload_close() {
  async function background() {
    await window.sendMessage("checkTabs", { openSpacesUrls: [] });

    // Add spaces.
    let url1 = `http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content.html`;
    await browser.spaces.create("space_1", url1);
    let url2 = `http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content_body.html`;
    await browser.spaces.create("space_2", url2);

    // Open spaces.
    await window.sendMessage("checkTabs", {
      action: "open",
      url: url1,
      buttonId: "space_1",
      openSpacesUrls: [url1],
    });
    await window.sendMessage("checkTabs", {
      action: "open",
      url: url2,
      buttonId: "space_2",
      openSpacesUrls: [url1, url2],
    });

    // Switch to open spaces tab.
    await window.sendMessage("checkTabs", {
      action: "switch",
      url: url1,
      buttonId: "space_1",
      openSpacesUrls: [url1, url2],
    });
    await window.sendMessage("checkTabs", {
      action: "switch",
      url: url2,
      buttonId: "space_2",
      openSpacesUrls: [url1, url2],
    });

    // TODO: Add test for tab reloading, once this has been implemented.

    // Remove spaces and check that related spaces tab are closed.
    await browser.spaces.remove("space_1");
    await window.sendMessage("checkTabs", { openSpacesUrls: [url2] });
    await browser.spaces.remove("space_2");
    await window.sendMessage("checkTabs", { openSpacesUrls: [] });

    browser.test.notifyPass();
  }
  await test_space(background, "default");
});

add_task(async function test_icons() {
  async function background() {
    let manifest = browser.runtime.getManifest();
    let extensionIcon = manifest.icons
      ? browser.runtime.getURL(manifest.icons[16])
      : "chrome://messenger/content/extension.svg";

    // Test 1: Setting defaultIcons and themeIcons.
    browser.test.log("create(): Setting defaultIcons and themeIcons.");
    await browser.spaces.create("space_1", "https://test.invalid", {
      title: "Google",
      defaultIcons: "default.png",
      themeIcons: [
        {
          dark: "dark.png",
          light: "light.png",
          size: 16,
        },
      ],
    });
    let expected_space_1 = {
      id: "space_1",
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
    await browser.spaces.update("space_1", {
      defaultIcons: "",
    });
    expected_space_1.icons = {
      default: `url("${browser.runtime.getURL("dark.png")}")`,
      dark: `url("${browser.runtime.getURL("dark.png")}")`,
      light: `url("${browser.runtime.getURL("light.png")}")`,
    };
    await window.sendMessage("checkUI", [expected_space_1]);

    // Setting other defaultIcons.
    await browser.spaces.update("space_1", {
      defaultIcons: "other.png",
    });
    expected_space_1.icons = {
      default: `url("${browser.runtime.getURL("other.png")}")`,
      dark: `url("${browser.runtime.getURL("dark.png")}")`,
      light: `url("${browser.runtime.getURL("light.png")}")`,
    };
    await window.sendMessage("checkUI", [expected_space_1]);

    // Clearing themeIcons.
    await browser.spaces.update("space_1", {
      themeIcons: [],
    });
    expected_space_1.icons = {
      default: `url("${browser.runtime.getURL("other.png")}")`,
      dark: `url("${browser.runtime.getURL("other.png")}")`,
      light: `url("${browser.runtime.getURL("other.png")}")`,
    };
    await window.sendMessage("checkUI", [expected_space_1]);

    // Setting other themeIcons.
    await browser.spaces.update("space_1", {
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
    await browser.spaces.create("space_2", "https://test.other.invalid", {
      title: "Wikipedia",
      themeIcons: [
        {
          dark: "dark2.png",
          light: "light2.png",
          size: 16,
        },
      ],
    });
    // Not specifying defaultIcons but only themeIcons should always use the
    // theme icons, even for the default theme (and not the extension icon).
    let expected_space_2 = {
      id: "space_2",
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
    await browser.spaces.update("space_2", {
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
    await browser.spaces.create("space_3", "https://test.more.invalid", {
      title: "Bing",
      defaultIcons: "default.png",
    });
    let expected_space_3 = {
      id: "space_3",
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
    await browser.spaces.update("space_3", {
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
    await browser.spaces.create("space_4", "https://duckduckgo.com", {
      title: "DuckDuckGo",
    });
    let expected_space_4 = {
      id: "space_4",
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
    await browser.spaces.update("space_4", {
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
    await browser.spaces.update("space_4", {
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
    await test_space(background, "light", manifestIcons);

    let light_theme = await AddonManager.getAddonByID(
      "thunderbird-compact-light@mozilla.org"
    );
    await light_theme.enable();
    await test_space(background, "dark", manifestIcons);

    // Disabling a theme will enable the default theme.
    await light_theme.disable();
    await test_space(background, "default", manifestIcons);
  }
});
