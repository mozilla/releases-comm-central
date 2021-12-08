/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");

/**
 * An object to represent a source profile to import from.
 * @typedef {Object} SourceProfile
 * @property {string} [name] - The profile name.
 * @property {nsIFile} dir - The profile location.
 */

/**
 * The base controller for an importing process.
 */
class ImporterController {
  /**
   * @param {string} elementId - The root element id.
   * @param {string} paneIdPrefix - The prefix of subpane id.
   */
  constructor(elementId, paneIdPrefix) {
    this._el = document.getElementById(elementId);
    this._paneIdPrefix = paneIdPrefix;
  }

  /**
   * Show a specific pane, hide all the others.
   * @param {string} id - The pane id to show.
   */
  showPane(id) {
    this._currentPane = id;
    id = `${this._paneIdPrefix}-${id}`;
    for (let pane of this._el.querySelectorAll(":scope > section")) {
      pane.hidden = pane.id != id;
    }
  }
}

/**
 * Control the #tabPane-app element, to support importing from an application.
 */
class ProfileImporterController extends ImporterController {
  constructor() {
    super("tabPane-app", "app");
    this._showSources();
  }

  /**
   * A map from button id to the importer module name.
   */
  _sourceModules = {
    Thunderbird: "ThunderbirdProfileImporter",
  };

  /**
   * Show the previous pane.
   */
  back() {
    switch (this._currentPane) {
      case "sources":
        window.close();
        break;
      case "profiles":
        this._showSources();
        break;
      case "items":
        this._skipProfilesPane
          ? this._showSources()
          : this.showPane("profiles");
        break;
    }
  }

  /**
   * Show the next pane.
   */
  next() {
    switch (this._currentPane) {
      case "sources":
        this._onSelectSource();
        break;
      case "profiles":
        this._onSelectProfile();
        break;
      case "items":
        this._onSelectItems();
        break;
    }
  }

  /**
   * Show the sources pane.
   */
  async _showSources() {
    this.showPane("sources");
    document.getElementById(
      "profileBackButton"
    ).textContent = await document.l10n.formatValue("button-cancel");
  }

  /**
   * Handler for the Continue button on the sources pane.
   */
  async _onSelectSource() {
    this._sourceAppName = [
      ...document.querySelectorAll("input[name=appSource]"),
    ].find(el => el.checked)?.value;
    let sourceModule = this._sourceModules[this._sourceAppName];
    if (!sourceModule) {
      return;
    }

    let module = ChromeUtils.import(`resource:///modules/${sourceModule}.jsm`);
    this._importer = new module[sourceModule]();

    let sourceProfiles = this._importer.sourceProfiles;
    if (sourceProfiles.length > 1 || this._importer.useFilePicker) {
      this._skipProfilesPane = false;
      // Let the user pick a profile if there are multiple options.
      this._showProfiles(sourceProfiles, this._importer.useFilePicker);
    } else if (sourceProfiles.length == 1) {
      this._skipProfilesPane = true;
      // Let the user pick what to import.
      this._showItems(sourceProfiles[0]);
    } else {
      importDialog.showError("No profile found.");
    }

    document.getElementById(
      "profileBackButton"
    ).textContent = await document.l10n.formatValue("button-back");
  }

  /**
   * Show the profiles pane, with a list of profiles and optional file pickers.
   * @param {SourceProfile[]} profiles - An array of profiles.
   * @param {boolean} useFilePicker - Whether to render file pickers.
   */
  async _showProfiles(profiles, useFilePicker) {
    document.getElementById(
      "profilesPaneTitle"
    ).textContent = await document.l10n.formatValue("profiles-pane-title", {
      app: this._sourceAppName,
    });
    let elProfileList = document.getElementById("profileList");
    elProfileList.hidden = !profiles.length;
    elProfileList.innerHTML = "";
    document.getElementById("filePickerList").hidden = !useFilePicker;

    for (let profile of profiles) {
      let item = document.createElement("div");
      item.className = "content-blocking-category";

      let label = document.createElement("label");
      label.className = "toggle-container-with-text";

      let input = document.createElement("input");
      input.type = "radio";
      input.name = "appProfile";
      input.value = profile.dir.path;
      label.append(input);

      let name = document.createElement("div");
      name.className = "strong";
      name.textContent = "Profile";
      if (profile.name) {
        name.textContent += ": " + profile.name;
      }
      label.append(name);

      let path = document.createElement("p");
      path.className = "result-indent";
      path.textContent = profile.dir.path;
      label.append(path);

      item.append(label);

      elProfileList.append(item);
    }
    document.querySelector("input[name=appProfile]").checked = true;

    this.showPane("profiles");
  }

  /**
   * Handler for the Continue button on the profiles pane.
   */
  _onSelectProfile() {
    this._sourceProfilePath = [
      ...document.querySelectorAll("input[name=appProfile]"),
    ].find(el => el.checked)?.value;
    this._showItems();
  }

  /**
   * Show the items pane, with a list of items to import.
   * @param {SourceProfile} profile - The profile to import from.
   */
  _showItems(profile) {
    document.getElementById(
      "appSourceProfilePath"
    ).textContent = this._sourceProfilePath;
    this.showPane("items");
  }

  /**
   * Handler for the Continue button on the items pane.
   */
  _onSelectItems() {
    this._importer.startImport(this._sourceProfilePath);
    importDialog.showProgress();
  }
}

/**
 * Control the #importDialog element, to show importing progress and result.
 */
let importDialog = {
  /**
   * Init internal variables and event bindings.
   */
  init() {
    this._el = document.getElementById("importDialog");
    this._elFooter = this._el.querySelector("footer");
    this._btnCancel = this._el.querySelector("#importDialogCancel");
    this._btnAccept = this._el.querySelector("#importDialogAccept");
  },

  /**
   * Toggle the disabled status of the cancel button.
   * @param {boolean} disabled - Whether to disable the cancel button.
   */
  disableCancel(disabled) {
    this._btnCancel.disabled = disabled;
  },

  /**
   * Toggle the disabled status of the accept button.
   * @param {boolean} disabled - Whether to disable the accept button.
   */
  disableAccept(disabled) {
    this._btnAccept.disabled = disabled;
  },

  /**
   * Show a specific pane, hide all the others.
   * @param {string} id - The pane id to show.
   */
  _showPane(id) {
    this._currentPane = id;
    id = `dialogPane-${id}`;
    for (let pane of this._el.querySelectorAll(":scope > section")) {
      pane.hidden = pane.id != id;
    }
    if (!this._el.open) {
      this._el.showModal();
    }
  },

  /**
   * Show the progress pane.
   */
  showProgress() {
    this._showPane("progress");
  },

  /**
   * Show the error pane, with an error message.
   * @param {string} msg - The error message.
   */
  showError(msg) {
    this._showPane("error");
    document.getElementById("dialogError").textContent = msg;
  },

  /**
   * The click handler of the cancel button.
   */
  onCancel() {
    this._el.close();
  },

  /**
   * The click handler of the accept button.
   */
  onAccept() {},
};

/**
 * Show a specific importing tab.
 * @param {string} tabId - One of ["tab-app", "tab-addressBook"].
 */
function showTab(tabId) {
  let selectedPaneId = `tabPane-${tabId.split("-")[1]}`;
  for (let tabPane of document.querySelectorAll("[id^=tabPane-]")) {
    tabPane.hidden = tabPane.id != selectedPaneId;
  }
  for (let el of document.querySelectorAll("[id^=tab-]")) {
    if (el.id == tabId) {
      el.classList.add("is-selected");
    } else {
      el.classList.remove("is-selected");
    }
  }
}

let profileController;

document.addEventListener("DOMContentLoaded", () => {
  profileController = new ProfileImporterController();
  importDialog.init();

  for (let tab of document.querySelectorAll("[id^=tab-]")) {
    tab.onclick = () => showTab(tab.id);
  }
  showTab("tab-app");
});
