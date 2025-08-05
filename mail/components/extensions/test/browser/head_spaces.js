/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* globals getUtilsJS, contentTabOpenPromise, makeIconSet, closeMenuPopup */

/**
 * Helper Function, creates a test extension to verify expected button states.
 *
 * @param {Function} background - The background script executed by the test.
 * @param {object} config - Additional config data for the test. Tests can
 *   include arbitrary data, but the following have a dedicated purpose:
 *   @param {?string} config.selectedTheme - The selected theme (default, light or dark),
 *     used to select the expected button/menuitem icon.
 *   @param {?object} config.manifestIcons - The icons entry of the extension manifest.
 *   @param {?object} config.permissions - Permissions assigned to the extension.
 */
async function test_space(background, config = {}) {
  const loadData = {
    files: {
      "background.js": background,
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: config.manifestVersion || 3,
      browser_specific_settings: {
        gecko: {
          id: "spaces_toolbar@mochi.test",
        },
      },
      permissions: ["tabs"],
      background: { scripts: ["utils.js", "background.js"] },
    },
  };

  if (config.manifestIcons) {
    loadData.manifest.icons = config.manifestIcons;
  }

  if (config.permissions) {
    loadData.manifest.permissions = config.permissions;
  }

  if (config.useAddonManager) {
    loadData.useAddonManager = config.useAddonManager;
  }

  const extension = ExtensionTestUtils.loadExtension(loadData);

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
      const tab = tabmail.tabInfo.find(
        tabInfo =>
          !!tabInfo.spaceButtonId &&
          tabInfo.browser.currentURI.spec == expectedUrl
      );
      Assert.ok(tab, `Should have found a spaces tab with the expected url.`);
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
        menuitemStyles
          .getPropertyValue("--menuitem-icon")
          .replaceAll(/\s+/g, ""),
        makeIconSet(
          icons[config.selectedTheme],
          icons.default || icons[config.selectedTheme]
        ).replaceAll(/\s+/g, ""),
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
        space.tabProperties.url,
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
