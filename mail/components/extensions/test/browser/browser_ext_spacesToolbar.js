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
async function test_spaceToolbar(background, selectedTheme, manifestIcons) {
  let manifest = {
    manifest_version: 2,
    applications: {
      gecko: {
        id: "spaces_toolbar@mochi.test",
      },
    },
    permissions: ["tabs"],
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

    if (test.action && test.buttonId && test.url) {
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

    // Test addButton().
    browser.test.log("addButton(): Without id.");
    await browser.test.assertThrows(
      () => browser.spacesToolbar.addButton(),
      /Incorrect argument types for spacesToolbar.addButton./,
      "addButton() without id should throw."
    );

    browser.test.log("addButton(): Without properties.");
    await browser.test.assertThrows(
      () => browser.spacesToolbar.addButton("button_1"),
      /Incorrect argument types for spacesToolbar.addButton./,
      "addButton() without properties should throw."
    );

    browser.test.log("addButton(): With empty properties.");
    await browser.test.assertRejects(
      browser.spacesToolbar.addButton("button_1", {}),
      /Failed to add button to the spaces toolbar: Invalid url./,
      "addButton() without a url should throw."
    );

    browser.test.log("addButton(): With invalid url.");
    await browser.test.assertRejects(
      browser.spacesToolbar.addButton("button_1", {
        url: "invalid://url",
      }),
      /Failed to add button to the spaces toolbar: Invalid url./,
      "addButton() with an invalid url should throw."
    );

    browser.test.log("addButton(): With url only.");
    await browser.spacesToolbar.addButton("button_1", {
      url: "https://test.invalid",
    });
    let expected_button_1 = {
      id: "button_1",
      title: "Generated extension",
      url: "https://test.invalid",
      icons: {
        default: `url("${extensionIcon}")`,
      },
    };
    await window.sendMessage("checkUI", [expected_button_1]);

    browser.test.log("addButton(): With url only, but existing id.");
    await browser.test.assertRejects(
      browser.spacesToolbar.addButton("button_1", {
        url: "https://test.invalid",
      }),
      /Failed to add button to the spaces toolbar: The id button_1 is already used by this extension./,
      "addButton() with existing id should throw."
    );

    browser.test.log("addButton(): With most properties.");
    await browser.spacesToolbar.addButton("button_2", {
      title: "Google",
      url: "/local/file.html",
      defaultIcons: "default.png",
      badgeText: "12",
      badgeBackgroundColor: [50, 100, 150, 255],
    });
    let expected_button_2 = {
      id: "button_2",
      title: "Google",
      url: browser.runtime.getURL("/local/file.html"),
      icons: {
        default: `url("${browser.runtime.getURL("default.png")}")`,
      },
      badgeText: "12",
      badgeBackgroundColor: "rgb(50, 100, 150)",
    };
    await window.sendMessage("checkUI", [expected_button_1, expected_button_2]);

    // Test updateButton().
    browser.test.log("updateButton(): Without id.");
    await browser.test.assertThrows(
      () => browser.spacesToolbar.updateButton(),
      /Incorrect argument types for spacesToolbar.updateButton./,
      "updateButton() without id should throw."
    );

    browser.test.log("updateButton(): Without properties.");
    await browser.test.assertThrows(
      () => browser.spacesToolbar.updateButton("InvalidId"),
      /Incorrect argument types for spacesToolbar.updateButton./,
      "updateButton() without properties should throw."
    );

    browser.test.log("updateButton(): With empty properties but invalid id.");
    await browser.test.assertRejects(
      browser.spacesToolbar.updateButton("InvalidId", {}),
      /Failed to update button in the spaces toolbar: A button with id InvalidId does not exist for this extension./,
      "updateButton() with invalid id should throw."
    );

    browser.test.log("updateButton(): With empty properties.");
    await browser.spacesToolbar.updateButton("button_1", {});
    await window.sendMessage("checkUI", [expected_button_1, expected_button_2]);

    browser.test.log("updateButton(): Updating the badge.");
    await browser.spacesToolbar.updateButton("button_2", {
      badgeText: "ok",
      badgeBackgroundColor: "green",
    });
    expected_button_2.badgeText = "ok";
    expected_button_2.badgeBackgroundColor = "rgb(0, 128, 0)";
    await window.sendMessage("checkUI", [expected_button_1, expected_button_2]);

    browser.test.log("updateButton(): Removing the badge.");
    await browser.spacesToolbar.updateButton("button_2", {
      badgeText: "",
    });
    delete expected_button_2.badgeText;
    delete expected_button_2.badgeBackgroundColor;
    await window.sendMessage("checkUI", [expected_button_1, expected_button_2]);

    browser.test.log("updateButton(): Changing the title.");
    await browser.spacesToolbar.updateButton("button_2", {
      title: "Some other title",
    });
    expected_button_2.title = "Some other title";
    await window.sendMessage("checkUI", [expected_button_1, expected_button_2]);

    browser.test.log("updateButton(): Removing the title.");
    await browser.spacesToolbar.updateButton("button_2", {
      title: "",
    });
    expected_button_2.title = "Generated extension";
    await window.sendMessage("checkUI", [expected_button_1, expected_button_2]);

    browser.test.log("updateButton(): Settings an invalid url.");
    await browser.test.assertRejects(
      browser.spacesToolbar.updateButton("button_2", {
        url: "invalid://url",
      }),
      /Failed to update button in the spaces toolbar: Invalid url./,
      "updateButton() with invalid url should throw."
    );

    await browser.spacesToolbar.updateButton("button_2", {
      title: "Bing",
      url: "https://test.more.invalid",
    });
    expected_button_2.title = "Bing";
    expected_button_2.url = "https://test.more.invalid";
    await window.sendMessage("checkUI", [expected_button_1, expected_button_2]);

    // Test removeButton().
    browser.test.log("removeButton(): Removing without id.");
    await browser.test.assertThrows(
      () => browser.spacesToolbar.removeButton(),
      /Incorrect argument types for spacesToolbar.removeButton./,
      "removeButton() without id should throw."
    );

    browser.test.log("removeButton(): Removing with invalid id.");
    await browser.test.assertRejects(
      browser.spacesToolbar.removeButton("InvalidId"),
      /Failed to remove button from the spaces toolbar: A button with id InvalidId does not exist for this extension./,
      "removeButton() with invalid id should throw."
    );

    browser.test.log("removeButton(): Removing button_1.");
    await browser.spacesToolbar.removeButton("button_1");
    await window.sendMessage("checkUI", [expected_button_2]);

    browser.test.notifyPass();
  }
  await test_spaceToolbar(background, "default");
  await test_spaceToolbar(background, "default", { 16: "manifest.png" });
});

add_task(async function test_open_reload_close() {
  async function background() {
    await window.sendMessage("checkTabs", { openSpacesUrls: [] });

    // Add buttons.
    let url1 = `http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content.html`;
    await browser.spacesToolbar.addButton("button_1", {
      url: url1,
    });
    let url2 = `http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content_body.html`;
    await browser.spacesToolbar.addButton("button_2", {
      url: url2,
    });

    // Open spaces.
    await window.sendMessage("checkTabs", {
      action: "open",
      url: url1,
      buttonId: "button_1",
      openSpacesUrls: [url1],
    });
    await window.sendMessage("checkTabs", {
      action: "open",
      url: url2,
      buttonId: "button_2",
      openSpacesUrls: [url1, url2],
    });

    // Switch to open spaces tab.
    await window.sendMessage("checkTabs", {
      action: "switch",
      url: url1,
      buttonId: "button_1",
      openSpacesUrls: [url1, url2],
    });
    await window.sendMessage("checkTabs", {
      action: "switch",
      url: url2,
      buttonId: "button_2",
      openSpacesUrls: [url1, url2],
    });

    // TODO: Add test for tab reloading, once this has been implemented.

    // Remove buttons and check that related spaces tab are closed.
    await browser.spacesToolbar.removeButton("button_1");
    await window.sendMessage("checkTabs", { openSpacesUrls: [url2] });
    await browser.spacesToolbar.removeButton("button_2");
    await window.sendMessage("checkTabs", { openSpacesUrls: [] });

    browser.test.notifyPass();
  }
  await test_spaceToolbar(background, "default");
});

add_task(async function test_icons() {
  async function background() {
    let manifest = browser.runtime.getManifest();
    let extensionIcon = manifest.icons
      ? browser.runtime.getURL(manifest.icons[16])
      : "chrome://messenger/content/extension.svg";

    // Test 1: Setting defaultIcons and themeIcons.
    browser.test.log("addButton(): Setting defaultIcons and themeIcons.");
    await browser.spacesToolbar.addButton("button_1", {
      title: "Google",
      url: "https://test.invalid",
      defaultIcons: "default.png",
      themeIcons: [
        {
          dark: "dark.png",
          light: "light.png",
          size: 16,
        },
      ],
    });
    let expected_button_1 = {
      id: "button_1",
      title: "Google",
      url: "https://test.invalid",
      icons: {
        default: `url("${browser.runtime.getURL("default.png")}")`,
        dark: `url("${browser.runtime.getURL("dark.png")}")`,
        light: `url("${browser.runtime.getURL("light.png")}")`,
      },
    };
    await window.sendMessage("checkUI", [expected_button_1]);

    // Clearing defaultIcons.
    await browser.spacesToolbar.updateButton("button_1", {
      defaultIcons: "",
    });
    expected_button_1.icons = {
      default: `url("${browser.runtime.getURL("dark.png")}")`,
      dark: `url("${browser.runtime.getURL("dark.png")}")`,
      light: `url("${browser.runtime.getURL("light.png")}")`,
    };
    await window.sendMessage("checkUI", [expected_button_1]);

    // Setting other defaultIcons.
    await browser.spacesToolbar.updateButton("button_1", {
      defaultIcons: "other.png",
    });
    expected_button_1.icons = {
      default: `url("${browser.runtime.getURL("other.png")}")`,
      dark: `url("${browser.runtime.getURL("dark.png")}")`,
      light: `url("${browser.runtime.getURL("light.png")}")`,
    };
    await window.sendMessage("checkUI", [expected_button_1]);

    // Clearing themeIcons.
    await browser.spacesToolbar.updateButton("button_1", {
      themeIcons: [],
    });
    expected_button_1.icons = {
      default: `url("${browser.runtime.getURL("other.png")}")`,
      dark: `url("${browser.runtime.getURL("other.png")}")`,
      light: `url("${browser.runtime.getURL("other.png")}")`,
    };
    await window.sendMessage("checkUI", [expected_button_1]);

    // Setting other themeIcons.
    await browser.spacesToolbar.updateButton("button_1", {
      themeIcons: [
        {
          dark: "dark2.png",
          light: "light2.png",
          size: 16,
        },
      ],
    });
    expected_button_1.icons = {
      default: `url("${browser.runtime.getURL("other.png")}")`,
      dark: `url("${browser.runtime.getURL("dark2.png")}")`,
      light: `url("${browser.runtime.getURL("light2.png")}")`,
    };
    await window.sendMessage("checkUI", [expected_button_1]);

    // Test 2: Setting themeIcons only.
    browser.test.log("addButton(): Setting themeIcons only.");
    await browser.spacesToolbar.addButton("button_2", {
      title: "Wikipedia",
      url: "https://test.other.invalid",
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
    let expected_button_2 = {
      id: "button_2",
      title: "Wikipedia",
      url: "https://test.other.invalid",
      icons: {
        default: `url("${browser.runtime.getURL("dark2.png")}")`,
        dark: `url("${browser.runtime.getURL("dark2.png")}")`,
        light: `url("${browser.runtime.getURL("light2.png")}")`,
      },
    };
    await window.sendMessage("checkUI", [expected_button_1, expected_button_2]);

    // Clearing themeIcons.
    await browser.spacesToolbar.updateButton("button_2", {
      themeIcons: [],
    });
    expected_button_2.icons = {
      default: `url("${extensionIcon}")`,
      dark: `url("${extensionIcon}")`,
      light: `url("${extensionIcon}")`,
    };
    await window.sendMessage("checkUI", [expected_button_1, expected_button_2]);

    // Test 3: Setting defaultIcons only.
    browser.test.log("addButton(): Setting defaultIcons only.");
    await browser.spacesToolbar.addButton("button_3", {
      title: "Bing",
      url: "https://test.more.invalid",
      defaultIcons: "default.png",
    });
    let expected_button_3 = {
      id: "button_3",
      title: "Bing",
      url: "https://test.more.invalid",
      icons: {
        default: `url("${browser.runtime.getURL("default.png")}")`,
        dark: `url("${browser.runtime.getURL("default.png")}")`,
        light: `url("${browser.runtime.getURL("default.png")}")`,
      },
    };
    await window.sendMessage("checkUI", [
      expected_button_1,
      expected_button_2,
      expected_button_3,
    ]);

    // Clearing defaultIcons and setting themeIcons.
    await browser.spacesToolbar.updateButton("button_3", {
      defaultIcons: "",
      themeIcons: [
        {
          dark: "dark3.png",
          light: "light3.png",
          size: 16,
        },
      ],
    });
    expected_button_3.icons = {
      default: `url("${browser.runtime.getURL("dark3.png")}")`,
      dark: `url("${browser.runtime.getURL("dark3.png")}")`,
      light: `url("${browser.runtime.getURL("light3.png")}")`,
    };
    await window.sendMessage("checkUI", [
      expected_button_1,
      expected_button_2,
      expected_button_3,
    ]);

    // Test 4: Setting no icons.
    browser.test.log("addButton(): Setting no icons.");
    await browser.spacesToolbar.addButton("button_4", {
      title: "DuckDuckGo",
      url: "https://duckduckgo.com",
    });
    let expected_button_4 = {
      id: "button_4",
      title: "DuckDuckGo",
      url: "https://duckduckgo.com",
      icons: {
        default: `url("${extensionIcon}")`,
        dark: `url("${extensionIcon}")`,
        light: `url("${extensionIcon}")`,
      },
    };
    await window.sendMessage("checkUI", [
      expected_button_1,
      expected_button_2,
      expected_button_3,
      expected_button_4,
    ]);

    // Setting and clearing default icons.
    await browser.spacesToolbar.updateButton("button_4", {
      defaultIcons: "default.png",
    });
    expected_button_4.icons = {
      default: `url("${browser.runtime.getURL("default.png")}")`,
      dark: `url("${browser.runtime.getURL("default.png")}")`,
      light: `url("${browser.runtime.getURL("default.png")}")`,
    };
    await window.sendMessage("checkUI", [
      expected_button_1,
      expected_button_2,
      expected_button_3,
      expected_button_4,
    ]);
    await browser.spacesToolbar.updateButton("button_4", {
      defaultIcons: "",
    });
    expected_button_4.icons = {
      default: `url("${extensionIcon}")`,
      dark: `url("${extensionIcon}")`,
      light: `url("${extensionIcon}")`,
    };
    await window.sendMessage("checkUI", [
      expected_button_1,
      expected_button_2,
      expected_button_3,
      expected_button_4,
    ]);

    browser.test.notifyPass();
  }

  // Test with and without icons defined in the manifest.
  for (let manifestIcons of [null, { 16: "manifest16.png" }]) {
    let dark_theme = await AddonManager.getAddonByID(
      "thunderbird-compact-dark@mozilla.org"
    );
    await dark_theme.enable();
    await test_spaceToolbar(background, "light", manifestIcons);

    let light_theme = await AddonManager.getAddonByID(
      "thunderbird-compact-light@mozilla.org"
    );
    await light_theme.enable();
    await test_spaceToolbar(background, "dark", manifestIcons);

    // Disabling a theme will enable the default theme.
    await light_theme.disable();
    await test_spaceToolbar(background, "default", manifestIcons);
  }
});

add_task(async function test_open_programmatically() {
  async function background() {
    await window.sendMessage("checkTabs", { openSpacesUrls: [] });

    // Add buttons.
    let url1 = `http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content.html`;
    await browser.spacesToolbar.addButton("button_1", {
      url: url1,
    });
    let url2 = `http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content_body.html`;
    await browser.spacesToolbar.addButton("button_2", {
      url: url2,
    });

    async function clickSpaceButton(buttonId, url) {
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
      let tab = await browser.spacesToolbar.clickButton(buttonId);
      await loadPromise;

      let queriedTabs = await browser.tabs.query({ spaceId: tab.spaceId });
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
    await clickSpaceButton("button_1", url1);
    await window.sendMessage("checkTabs", {
      buttonId: "button_1",
      openSpacesUrls: [url1],
    });

    // Open space #2.
    await clickSpaceButton("button_2", url2);
    await window.sendMessage("checkTabs", {
      buttonId: "button_2",
      openSpacesUrls: [url1, url2],
    });

    // Switch to open space tab.
    await window.sendMessage("checkTabs", {
      action: "switch",
      url: url1,
      buttonId: "button_1",
      openSpacesUrls: [url1, url2],
    });

    await window.sendMessage("checkTabs", {
      action: "switch",
      url: url2,
      buttonId: "button_2",
      openSpacesUrls: [url1, url2],
    });

    // Remove spaces and check that related spaces tab are closed.
    await browser.spacesToolbar.removeButton("button_1");
    await window.sendMessage("checkTabs", { openSpacesUrls: [url2] });
    await browser.spacesToolbar.removeButton("button_2");
    await window.sendMessage("checkTabs", { openSpacesUrls: [] });

    browser.test.notifyPass();
  }
  await test_spaceToolbar(background, "default");
});
