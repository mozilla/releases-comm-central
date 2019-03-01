/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../toolkit/mozapps/extensions/content/extensions.js */

var {ExtensionSupport} = ChromeUtils.import("resource:///modules/ExtensionSupport.jsm");
var {BrowserUtils} = ChromeUtils.import("resource://gre/modules/BrowserUtils.jsm");

gStrings.mailExt =
  Services.strings.createBundle("chrome://messenger/locale/extensionsOverlay.properties");

(function() {
  window.isCorrectlySigned = function() { return true; };

  let contentStylesheet = document.createProcessingInstruction(
    "xml-stylesheet",
    'href="chrome://messenger/content/extensionsOverlay.css" type="text/css"');
  document.insertBefore(contentStylesheet, document.documentElement);

  // Add navigation buttons for back and forward on the addons page.
  let hbox = document.createElement("hbox");
  hbox.setAttribute("id", "nav-header");
  hbox.setAttribute("align", "center");
  hbox.setAttribute("pack", "center");

  let backButton = document.createElement("toolbarbutton");
  backButton.setAttribute("id", "back-btn");
  backButton.setAttribute("class", "nav-button");
  backButton.setAttribute("command", "cmd_back");
  backButton.setAttribute("tooltiptext", gStrings.mailExt.GetStringFromName("cmdBackTooltip"));
  backButton.setAttribute("disabled", "true");

  let forwardButton = document.createElement("toolbarbutton");
  forwardButton.setAttribute("id", "forward-btn");
  forwardButton.setAttribute("class", "nav-button");
  forwardButton.setAttribute("command", "cmd_forward");
  forwardButton.setAttribute("tooltiptext", gStrings.mailExt.GetStringFromName("cmdForwardTooltip"));
  forwardButton.setAttribute("disabled", "true");
  hbox.appendChild(backButton);
  hbox.appendChild(forwardButton);

  document.getElementById("category-box")
          .insertBefore(hbox, document.getElementById("categories"));

  // Fix the "Search on addons.mozilla.org" placeholder text in the searchbox.
  let textbox = document.getElementById("header-search");
  let placeholder = textbox.getAttribute("placeholder");
  placeholder = placeholder.replace("addons.mozilla.org", "addons.thunderbird.net");
  textbox.setAttribute("placeholder", placeholder);

  // Tell the world about legacy extensions.
  let alertContainer = document.createElement("vbox");
  alertContainer.id = "tb-legacy-extensions-notice";
  alertContainer.className = "alert-container";

  let alert = document.createElement("vbox");
  alert.className = "alert";

  let description = document.createElement("description");
  let messageString = gStrings.mailExt.GetStringFromName("legacyInfo") + " ";
  messageString = messageString.replace("#1", gStrings.brandShortName);
  messageString = messageString.replace("#2", Services.appinfo.version);
  description.textContent = messageString;

  let label = document.createElement("label");
  label.className = "text-link plain";
  label.href = "https://support.mozilla.org/kb/unable-install-add-on-extension-theme-thunderbird";
  label.value = gStrings.mailExt.GetStringFromName("legacyLearnMore");

  description.appendChild(label);
  alert.appendChild(description);
  alertContainer.appendChild(alert);

  gListView.node.insertBefore(alertContainer, document.getElementById("legacy-extensions-notice"));
})();

window._oldSortElements = window.sortElements;
window.sortElements = function(aElements, aSortBy, aAscending) {
  if (aSortBy.length != 2 || aSortBy[0] != "uiState" || aSortBy[1] != "name") {
    window._oldSortElements(aElements, aSortBy, aAscending);
  }

  let getUIState = function(addon) {
    if (addon.pendingOperations == AddonManager.PENDING_DISABLE) {
      return "pendingDisable";
    }
    if (ExtensionSupport.loadedLegacyExtensions.has(addon.id) && addon.userDisabled) {
      return "pendingDisable";
    }
    if (addon.pendingOperations == AddonManager.PENDING_UNINSTALL) {
      return "pendingUninstall";
    }
    if (!addon.isActive &&
        (addon.pendingOperations != AddonManager.PENDING_ENABLE &&
         addon.pendingOperations != AddonManager.PENDING_INSTALL)) {
      return "disabled";
    }
    return "enabled";
  };

  aElements.sort((a, b) => {
    const UISTATE_ORDER = ["enabled", "askToActivate", "pendingDisable", "pendingUninstall", "disabled"];

    let aState = UISTATE_ORDER.indexOf(getUIState(a.mAddon));
    let bState = UISTATE_ORDER.indexOf(getUIState(b.mAddon));
    if (aState < bState) {
      return -1;
    }
    if (aState > bState) {
      return 1;
    }
    if (a.mAddon.name < b.mAddon.name) {
      return -1;
    }
    if (a.mAddon.name > b.mAddon.name) {
      return 1;
    }
    return 0;
  });
};
if (window.gViewController.currentViewObj == window.gListView) {
  window.sortList(window.gListView._listBox, ["uiState", "name"], true);
}

gDetailView._oldDetailUpdateState = gDetailView.updateState;
gDetailView.updateState = function() {
  this._oldDetailUpdateState();

  let restartButton = document.getElementById("restart-btn");
  let undoButton = document.getElementById("undo-btn");

  if (ExtensionSupport.loadedLegacyExtensions.has(this._addon.id)) {
    this.node.setAttribute("active", "true");
  }

  if (ExtensionSupport.loadedLegacyExtensions.hasAnyState(this._addon.id, true)) {
    let { stringName, undoCommand, version } = getTrueState(this._addon, "gDetailView._addon");

    if (stringName) {
      this.node.setAttribute("notification", "warning");
      this.node.removeAttribute("pending");

      let warningContainer = document.getElementById("warning-container");
      let warning = document.getElementById("detail-warning");
      document.getElementById("detail-warning-link").hidden = true;
      warning.textContent = gStrings.mailExt.formatStringFromName(
        stringName, [this._addon.name, gStrings.brandShortName], 2
      );

      if (version) {
        document.getElementById("detail-version").value = version;
      }

      if (!restartButton) {
        restartButton = document.createElement("button");
        restartButton.id = "restart-btn";
        restartButton.className = "button-link restart-btn";
        restartButton.setAttribute(
          "label", gStrings.mailExt.GetStringFromName("warnLegacyRestartButton")
        );
        restartButton.setAttribute("oncommand", "BrowserUtils.restartApplication()");
        warningContainer.insertBefore(restartButton, warningContainer.lastElementChild);
      }
      restartButton.hidden = false;
      if (undoCommand) {
        if (!undoButton) {
          undoButton = document.createElement("button");
          undoButton.className = "button-link undo-btn";
          undoButton.setAttribute(
            "label", gStrings.mailExt.GetStringFromName("warnLegacyUndoButton")
          );
          // We shouldn't really attach non-anonymous content to anonymous content, but we can.
          warningContainer.insertBefore(undoButton, warningContainer.lastElementChild);
        }
        undoButton.setAttribute("oncommand", undoCommand);
        undoButton.hidden = false;
      } else if (undoButton) {
        undoButton.hidden = true;
      }
      return;
    }
  }

  if (restartButton) {
    restartButton.hidden = true;
  }
  if (undoButton) {
    undoButton.hidden = true;
  }
};

/**
 * Update the UI when things change.
 */
function statusChangedObserver(subject, topic, data) {
  let { id } = subject.wrappedJSObject;

  if (gViewController.currentViewObj == gListView) {
    let listItem = gListView.getListItemForID(id);
    if (listItem) {
      setTimeout(() => listItem._updateState());
    }
  } else if (gViewController.currentViewObj == gDetailView) {
    setTimeout(() => gDetailView.updateState());
  }
}
Services.obs.addObserver(statusChangedObserver, "legacy-addon-status-changed");
window.addEventListener("unload", () => {
  Services.obs.removeObserver(statusChangedObserver, "legacy-addon-status-changed");
});

/**
 * The true status of legacy extensions, which AddonManager doesn't know
 * about because it thinks all extensions are restartless.
 *
 * @return An object of three properties:
 *         stringName: a string to display to the user, from extensionsOverlay.properties.
 *         undoCommand: code to run, should the user want to return to the previous state.
 *         version: the current version of the extension.
 */
function getTrueState(addon, addonRef) {
  let state = ExtensionSupport.loadedLegacyExtensions.get(addon.id);
  let returnObject = {};

  if (addon.pendingOperations & AddonManager.PENDING_UNINSTALL &&
      ExtensionSupport.loadedLegacyExtensions.has(addon.id)) {
    returnObject.stringName = "warnLegacyUninstall";
    returnObject.undoCommand = `${addonRef}.cancelUninstall()`;
  } else if (state.pendingOperation == "install") {
    returnObject.stringName = "warnLegacyInstall";
    returnObject.undoCommand = `${addonRef}.uninstall()`;
  } else if (addon.userDisabled) {
    returnObject.stringName = "warnLegacyDisable";
    returnObject.undoCommand = `${addonRef}.enable()`;
  } else if (state.pendingOperation == "enable") {
    returnObject.stringName = "warnLegacyEnable";
    returnObject.undoCommand = `${addonRef}.disable()`;
  } else if (state.pendingOperation == "upgrade") {
    returnObject.stringName = "warnLegacyUpgrade";
    returnObject.version = state.version;
  } else if (state.pendingOperation == "downgrade") {
    returnObject.stringName = "warnLegacyDowngrade";
    returnObject.version = state.version;
  }

  return returnObject;
}
