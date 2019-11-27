/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../toolkit/mozapps/extensions/content/aboutaddons.js */

var { ExtensionSupport } = ChromeUtils.import(
  "resource:///modules/ExtensionSupport.jsm"
);
var { BrowserUtils } = ChromeUtils.import(
  "resource://gre/modules/BrowserUtils.jsm"
);

var mailExtBundle = Services.strings.createBundle(
  "chrome://messenger/locale/extensionsOverlay.properties"
);
var extensionsNeedingRestart = new Set();

const THUNDERBIRD_THEME_PREVIEWS = new Map([
  [
    "thunderbird-compact-light@mozilla.org",
    "chrome://mozapps/content/extensions/firefox-compact-light.svg",
  ],
  [
    "thunderbird-compact-dark@mozilla.org",
    "chrome://mozapps/content/extensions/firefox-compact-dark.svg",
  ],
]);

/* This file runs in both the outer window, which controls the categories list, search bar, etc.,
 * and the inner window which is the list of add-ons or the detail view. */
(async function() {
  if (window.location.href == "about:addons") {
    let contentStylesheet = document.createProcessingInstruction(
      "xml-stylesheet",
      'href="chrome://messenger/content/aboutAddonsExtra.css" type="text/css"'
    );
    document.insertBefore(contentStylesheet, document.documentElement);

    // Fix the "Search on addons.mozilla.org" placeholder text in the searchbox.
    let browser = document.getElementById("html-view-browser");
    let textbox = browser.contentDocument.getElementById("search-addons");
    let placeholder = textbox.getAttribute("placeholder");
    placeholder = placeholder.replace(
      "addons.mozilla.org",
      "addons.thunderbird.net"
    );
    textbox.setAttribute("placeholder", placeholder);
    return;
  }

  window.isCorrectlySigned = function() {
    return true;
  };

  delete window.browserBundle;
  window.browserBundle = Services.strings.createBundle(
    "chrome://messenger/locale/addons.properties"
  );

  let _getScreenshotUrlForAddon = getScreenshotUrlForAddon;
  getScreenshotUrlForAddon = function(addon) {
    if (THUNDERBIRD_THEME_PREVIEWS.has(addon.id)) {
      return THUNDERBIRD_THEME_PREVIEWS.get(addon.id);
    }
    return _getScreenshotUrlForAddon(addon);
  };

  let _getAddonMessageInfo = getAddonMessageInfo;
  getAddonMessageInfo = async function(addon) {
    let result = await _getAddonMessageInfo(addon);
    if (!result.message) {
      let { stringName } = getTrueState(addon, "gDetailView._addon");
      if (stringName) {
        result.message = mailExtBundle.formatStringFromName(stringName, [
          addon.name,
          brandBundle.GetStringFromName("brandShortName"),
        ]);
        result.type = "success";
        extensionsNeedingRestart.add(addon.id);
      } else {
        extensionsNeedingRestart.delete(addon.id);
      }
      setRestartBar();
    }
    return result;
  };

  let listener = {
    onUninstalling(addon) {
      if (ExtensionSupport.loadedLegacyExtensions.hasAnyState(addon.id)) {
        extensionsNeedingRestart.add(addon.id);
        setRestartBar();
      }
    },
    onUninstalled(addon) {
      if (ExtensionSupport.loadedLegacyExtensions.hasAnyState(addon.id)) {
        extensionsNeedingRestart.add(addon.id);
        setRestartBar();
      }
    },
  };
  AddonManager.addAddonListener(listener);
  window.addEventListener("unload", () =>
    AddonManager.removeAddonListener(listener)
  );

  // If a legacy extension has been removed, it needs a restart but is not in the list
  // - show the restart bar anyway.
  let removed = await ExtensionSupport.loadedLegacyExtensions.listRemoved();
  for (let removedExtension of removed) {
    extensionsNeedingRestart.add(removedExtension.id);
  }
  setRestartBar();
})();

function setRestartBar() {
  let list = document.querySelector("addon-list");
  if (!list || list.type != "extension") {
    return;
  }

  let restartBar = document.getElementById("restartBar");
  if (extensionsNeedingRestart.size == 0) {
    if (restartBar) {
      restartBar.remove();
    }
    return;
  }
  if (restartBar) {
    return;
  }

  restartBar = document.createElement("message-bar");
  restartBar.id = "restartBar";
  restartBar.setAttribute("type", "warning");

  const message = document.createElement("span");
  message.textContent = mailExtBundle.formatStringFromName(
    "globalRestartMessage",
    [brandBundle.GetStringFromName("brandShortName")]
  );

  const restart = document.createElement("button");
  restart.textContent = mailExtBundle.GetStringFromName("globalRestartButton");
  restart.addEventListener("click", () => {
    BrowserUtils.restartApplication();
  });

  restartBar.append(message, restart);
  list.pendingUninstallStack.append(restartBar);
}

/**
 * The true status of legacy extensions, which AddonManager doesn't know
 * about because it thinks all extensions are restartless.
 *
 * @return An object of three properties:
 *         stringName: a string to display to the user, from extensionsOverlay.properties.
 *         undoFunction: function to call, should the user want to return to the previous state.
 *         version: the current version of the extension.
 */
function getTrueState(addon) {
  let state = ExtensionSupport.loadedLegacyExtensions.get(addon.id);
  let returnObject = {};

  if (!state) {
    return returnObject;
  }

  if (
    addon.pendingOperations & AddonManager.PENDING_UNINSTALL &&
    ExtensionSupport.loadedLegacyExtensions.has(addon.id)
  ) {
    returnObject.stringName = "warnLegacyUninstall";
    returnObject.undoFunction = addon.cancelUninstall;
  } else if (state.pendingOperation == "install") {
    returnObject.stringName = "warnLegacyInstall";
    returnObject.undoFunction = addon.uninstall;
  } else if (addon.userDisabled) {
    returnObject.stringName = "warnLegacyDisable";
    returnObject.undoFunction = addon.enable;
  } else if (state.pendingOperation == "enable") {
    returnObject.stringName = "warnLegacyEnable";
    returnObject.undoFunction = addon.disable;
  } else if (state.pendingOperation == "upgrade") {
    returnObject.stringName = "warnLegacyUpgrade";
    returnObject.version = state.version;
  } else if (state.pendingOperation == "downgrade") {
    returnObject.stringName = "warnLegacyDowngrade";
    returnObject.version = state.version;
  }

  return returnObject;
}
