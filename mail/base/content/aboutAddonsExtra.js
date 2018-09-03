/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals AddonManager, Services, gDetailView, gStrings */

const { ExtensionSupport } = ChromeUtils.import("resource:///modules/extensionSupport.jsm", null);

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
  backButton.setAttribute("class", "nav-button header-button");
  backButton.setAttribute("command", "cmd_back");
  backButton.setAttribute("tooltiptext", gStrings.mailExt.GetStringFromName("cmdBackTooltip"));
  backButton.setAttribute("disabled", "true");

  let forwardButton = document.createElement("toolbarbutton");
  forwardButton.setAttribute("id", "forward-btn");
  forwardButton.setAttribute("class", "nav-button header-button");
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

  let pending = this._addon.pendingOperations;

  let warningContainer = document.getElementById("warning-container");
  let warning = document.getElementById("detail-warning");
  let warningLink = document.getElementById("detail-warning-link");
  let restartButton = document.getElementById("restart-btn");
  let undoButton = document.getElementById("undo-btn");

  if (ExtensionSupport.loadedLegacyExtensions.has(this._addon.id)) {
    this.node.setAttribute("active", "true");
    this.node.removeAttribute("pending");
  }

  if (ExtensionSupport.loadedLegacyExtensions.has(this._addon.id) &&
      (this._addon.userDisabled || pending & AddonManager.PENDING_UNINSTALL)) {
    this.node.setAttribute("notification", "warning");

    let stringName = this._addon.userDisabled ? "warnLegacyDisable" : "warnLegacyUninstall";
    warning.textContent = gStrings.mailExt.formatStringFromName(
      stringName, [this._addon.name, gStrings.brandShortName], 2
    );

    warningLink.hidden = true;

    if (!restartButton) {
      restartButton = document.createElement("button");
      restartButton.id = "restart-btn";
      restartButton.className = "button-link restart-btn";
      restartButton.setAttribute("label", gStrings.mailExt.GetStringFromName("warnLegacyRestartButton"));
      restartButton.setAttribute("oncommand", "BrowserUtils.restartApplication()");
      warningContainer.insertBefore(restartButton, warningContainer.lastElementChild);
    }
    restartButton.hidden = false;

    if (!undoButton) {
      undoButton = document.createElement("button");
      undoButton.id = "undo-btn";
      undoButton.className = "button-link undo-btn";
      undoButton.setAttribute("label", gStrings.mailExt.GetStringFromName("warnLegacyUndoButton"));
      warningContainer.insertBefore(undoButton, warningContainer.lastElementChild);
    }
    if (this._addon.userDisabled) {
      undoButton.setAttribute("oncommand", "gDetailView._addon.enable()");
    } else {
      undoButton.setAttribute("oncommand", "gDetailView._addon.cancelUninstall()");
    }
    undoButton.hidden = false;
  } else if (restartButton) { // If one exists, so does the other.
    restartButton.hidden = true;
    undoButton.hidden = true;
  }
};
