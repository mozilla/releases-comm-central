/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  Services: "resource://gre/modules/Services.jsm",
  MailServices: "resource:///modules/MailServices.jsm",
  MailUtils: "resource:///modules/MailUtils.jsm",
  AddrBookFileImporter: "resource:///modules/AddrBookFileImporter.jsm",
});

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
  _logger = console.createInstance({
    prefix: "mail.import",
    maxLogLevel: "Warn",
    maxLogLevelPref: "mail.import.loglevel",
  });

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

  /**
   * Show the previous pane.
   */
  back() {}

  /**
   * Show the next pane.
   */
  next() {}

  /**
   * Show the first pane.
   */
  reset() {}
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
   * A map from radio input value to the importer module name.
   */
  _sourceModules = {
    Thunderbird: "ThunderbirdProfileImporter",
    Seamonkey: "SeamonkeyProfileImporter",
    Outlook: "OutlookProfileImporter",
    Becky: "BeckyProfileImporter",
    AppleMail: "AppleMailProfileImporter",
  };

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

  reset() {
    this._showSources();
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
    let checkedInput = [
      ...document.querySelectorAll("input[name=appSource]"),
    ].find(el => el.checked);
    this._sourceAppName = checkedInput.parentElement.innerText;
    let sourceModule = this._sourceModules[checkedInput.value];

    let module = ChromeUtils.import(`resource:///modules/${sourceModule}.jsm`);
    this._importer = new module[sourceModule]();

    let sourceProfiles = await this._importer.getSourceProfiles();
    if (sourceProfiles.length > 1 || this._importer.USE_FILE_PICKER) {
      this._skipProfilesPane = false;
      // Let the user pick a profile if there are multiple options.
      this._showProfiles(sourceProfiles, this._importer.USE_FILE_PICKER);
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
    this._sourceProfiles = profiles;
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
    let index = [
      ...document.querySelectorAll("input[name=appProfile]"),
    ].findIndex(el => el.checked);
    if (this._sourceProfiles[index]) {
      this._showItems(this._sourceProfiles[index]);
    } else {
      this._openFilePicker(
        index == this._sourceProfiles.length ? "dir" : "zip"
      );
    }
  }

  /**
   * Open a filepicker to select a folder or a zip file.
   * @param {'dir' | 'zip'} type - Whether to pick a folder or a zip file.
   */
  async _openFilePicker(type) {
    let filePicker = Cc["@mozilla.org/filepicker;1"].createInstance(
      Ci.nsIFilePicker
    );
    let [
      filePickerTitleDir,
      filePickerTitleZip,
    ] = await document.l10n.formatValues([
      "profile-file-picker-dir",
      "profile-file-picker-zip",
    ]);
    if (type == "zip") {
      filePicker.init(window, filePickerTitleZip, filePicker.modeOpen);
      filePicker.appendFilter("", "*.zip");
    } else {
      filePicker.init(window, filePickerTitleDir, filePicker.modeGetFolder);
    }
    let rv = await new Promise(resolve => filePicker.open(resolve));
    if (rv != Ci.nsIFilePicker.returnOK) {
      return;
    }
    let selectedFile = filePicker.file;
    if (!selectedFile.isDirectory()) {
      if (selectedFile.fileSize > 2147483647) {
        // nsIZipReader only supports zip file less than 2GB.
        importDialog.showError(
          await document.l10n.formatValue("error-message-zip-file-too-big")
        );
        return;
      }
      this._importingFromZip = true;
    }
    this._showItems({ dir: selectedFile });
  }

  /**
   * Show the items pane, with a list of items to import.
   * @param {SourceProfile} profile - The profile to import from.
   */
  _showItems(profile) {
    this._sourceProfile = profile;
    document.getElementById("appSourceProfilePath").textContent =
      profile.dir.path;
    this._setItemsChecked(this._importer.SUPPORTED_ITEMS);
    this.showPane("items");
  }

  /** A map from checkbox id to ImportItems field */
  _itemCheckboxes = {
    checkAccounts: "accounts",
    checkAddressBooks: "addressBooks",
    checkCalendars: "calendars",
    checkMailMessages: "mailMessages",
  };

  /**
   * Set checkbox states according to an ImportItems object.
   * @param {ImportItems} items.
   */
  _setItemsChecked(items) {
    for (let [id, field] of Object.entries(this._itemCheckboxes)) {
      let supported = items[field];
      let checkbox = document.getElementById(id);
      checkbox.checked = supported;
      checkbox.disabled = !supported;
    }
  }

  /**
   * Construct an ImportItems object from the checkbox states.
   * @returns {ImportItems}
   */
  _getItemsChecked() {
    let items = {};
    for (let id in this._itemCheckboxes) {
      items[this._itemCheckboxes[id]] = document.getElementById(id).checked;
    }
    return items;
  }

  /**
   * Extract the zip file to a tmp dir, set _sourceProfile.dir to the tmp dir.
   */
  async _extractZipFile() {
    // Extract the zip file to a tmp dir.
    let targetDir = Services.dirsvc.get("TmpD", Ci.nsIFile);
    targetDir.append("tmp-profile");
    targetDir.createUnique(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
    let ZipReader = Components.Constructor(
      "@mozilla.org/libjar/zip-reader;1",
      "nsIZipReader",
      "open"
    );
    let zip = ZipReader(this._sourceProfile.dir);
    for (let entry of zip.findEntries(null)) {
      let parts = entry.split("/");
      if (
        this._importer.IGNORE_DIRS.includes(parts[1]) ||
        entry.endsWith("/")
      ) {
        continue;
      }
      // Folders can not be unzipped recursively, have to iterate and
      // extract all file entires one by one.
      let target = targetDir.clone();
      for (let part of parts.slice(1)) {
        // Drop the root folder name in the zip file.
        target.append(part);
      }
      if (!target.parent.exists()) {
        target.parent.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
      }
      try {
        this._logger.debug(`Extracting ${entry} to ${target.path}`);
        zip.extract(entry, target);
        this._extractedFileCount++;
        if (this._extractedFileCount % 10 == 0) {
          let progress = Math.min((this._extractedFileCount / 200) * 0.2, 0.2);
          importDialog.updateProgress(progress);
          await new Promise(resolve => setTimeout(resolve));
        }
      } catch (e) {
        this._logger.error(e);
      }
    }
    // Use the tmp dir as source profile dir.
    this._sourceProfile = { dir: targetDir };
    importDialog.updateProgress(0.2);
  }

  /**
   * Handler for the Continue button on the items pane.
   */
  async _onSelectItems() {
    importDialog.showProgress(this, true);
    if (this._importingFromZip) {
      this._extractedFileCount = 0;
      try {
        await this._extractZipFile();
      } catch (e) {
        importDialog.showError(
          await document.l10n.formatValue(
            "error-message-extract-zip-file-failed"
          )
        );
        throw e;
      }
    }
    this._importer.onProgress = (current, total) => {
      importDialog.updateProgress(
        this._importingFromZip ? 0.2 + (0.8 * current) / total : current / total
      );
    };
    try {
      await this._importer.startImport(
        this._sourceProfile.dir,
        this._getItemsChecked()
      );
    } catch (e) {
      importDialog.showError(
        await document.l10n.formatValue("error-message-failed")
      );
      throw e;
    } finally {
      if (this._importingFromZip) {
        IOUtils.remove(this._sourceProfile.dir.path, { recursive: true });
      }
    }
  }
}

/**
 * Control the #tabPane-addressBook element, to support importing from an
 * address book file.
 */
class AddrBookImporterController extends ImporterController {
  constructor() {
    super("tabPane-addressBook", "addr-book");
    this._showSources();
  }

  back() {
    switch (this._currentPane) {
      case "sources":
        window.close();
        break;
      case "csvFieldMap":
        this._showSources();
        break;
      case "directories":
        if (this._csvFieldMapShown) {
          this._showCsvFieldMap();
        } else {
          this._showSources();
        }
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
      case "csvFieldMap":
        this._onSubmitCsvFieldMap();
        break;
      case "directories":
        this._onSelectDirectory();
        break;
    }
  }

  reset() {
    this._showSources();
  }

  /**
   * Show the sources pane.
   */
  async _showSources() {
    this.showPane("sources");
    document.getElementById(
      "addrBookBackButton"
    ).textContent = await document.l10n.formatValue("button-cancel");
  }

  /**
   * Handler for the Continue button on the sources pane.
   */
  async _onSelectSource() {
    this._fileType = [
      ...document.querySelectorAll("input[name=addrBookSource]"),
    ].find(el => el.checked).value;
    this._importer = new AddrBookFileImporter(this._fileType);

    let filePicker = Cc["@mozilla.org/filepicker;1"].createInstance(
      Ci.nsIFilePicker
    );
    let [filePickerTitle, backButtonText] = await document.l10n.formatValues([
      "addr-book-file-picker",
      "button-back",
    ]);
    filePicker.init(window, filePickerTitle, filePicker.modeOpen);
    let filter = {
      csv: "*.csv; *.tsv; *.tab",
      ldif: "*.ldif",
      vcard: "*.vcf",
      sqlite: "*.sqlite",
      mab: "*.mab",
    }[this._fileType];
    if (filter) {
      filePicker.appendFilter("", filter);
    }
    filePicker.appendFilters(Ci.nsIFilePicker.filterAll);
    let rv = await new Promise(resolve => filePicker.open(resolve));
    if (rv != Ci.nsIFilePicker.returnOK) {
      return;
    }

    this._sourceFile = filePicker.file;
    document.getElementById("addrBookSourcePath").textContent =
      filePicker.file.path;
    document.getElementById("addrBookBackButton").textContent = backButtonText;

    if (this._fileType == "csv") {
      let unmatchedRows = await this._importer.parseCsvFile(filePicker.file);
      if (unmatchedRows.length) {
        document.getElementById("csvFieldMap").data = unmatchedRows;
        this._csvFieldMapShown = true;
        this._showCsvFieldMap();
        return;
      }
    }
    this._csvFieldMapShown = false;
    this._showDirectories();
  }

  /**
   * Show the csvFieldMap pane, user can map source CSV fields to address book
   * fields.
   */
  _showCsvFieldMap() {
    this.showPane("csvFieldMap");
  }

  /**
   * Handler for the Continue button on the csvFieldMap pane.
   */
  async _onSubmitCsvFieldMap() {
    this._importer.setCsvFields(document.getElementById("csvFieldMap").value);
    this._showDirectories();
  }

  /**
   * Show the directories pane, with a list of existing directories and an
   * option to create a new directory.
   */
  async _showDirectories() {
    let elList = document.getElementById("directoryList");
    elList.innerHTML = "";
    this._directories = MailServices.ab.directories.filter(
      dir => dir.dirType == Ci.nsIAbManager.JS_DIRECTORY_TYPE
    );
    for (let directory of this._directories) {
      let item = document.createElement("div");
      item.className = "content-blocking-category";

      let label = document.createElement("label");
      label.className = "toggle-container-with-text";

      let input = document.createElement("input");
      input.type = "radio";
      input.name = "addrBookDirectory";
      input.value = directory.dirPrefId;
      label.append(input);

      let name = document.createElement("div");
      name.className = "strong";
      name.textContent = directory.dirName;
      label.append(name);

      item.append(label);
      elList.append(item);
    }
    document.querySelector("input[name=addrBookDirectory]").checked = true;

    this.showPane("directories");
  }

  /**
   * Handler for the Continue button on the directories pane.
   */
  async _onSelectDirectory() {
    let index = [
      ...document.querySelectorAll("input[name=addrBookDirectory]"),
    ].findIndex(el => el.checked);
    let targetDirectory = this._directories[index];
    if (!targetDirectory) {
      // User selected to create a new address book and import into it. Create
      // one based on the file name.
      let sourceFileName = this._sourceFile.leafName;
      let dirId = MailServices.ab.newAddressBook(
        sourceFileName.slice(
          0,
          sourceFileName.lastIndexOf(".") == -1
            ? Infinity
            : sourceFileName.lastIndexOf(".")
        ),
        "",
        Ci.nsIAbManager.JS_DIRECTORY_TYPE
      );
      targetDirectory = MailServices.ab.getDirectoryFromId(dirId);
    }

    importDialog.showProgress(this);
    this._importer.onProgress = (current, total) => {
      importDialog.updateProgress(current / total);
    };
    try {
      await this._importer.startImport(this._sourceFile, targetDirectory);
    } catch (e) {
      importDialog.showError(
        await document.l10n.formatValue("error-message-failed")
      );
      throw e;
    }
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
  _disableCancel(disabled) {
    this._btnCancel.disabled = disabled;
  },

  /**
   * Toggle the disabled status of the accept button.
   * @param {boolean} disabled - Whether to disable the accept button.
   */
  _disableAccept(disabled) {
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
   * @param {ImporterController} importerController - An instance of the
   *   controller.
   * @param {boolean} restartOnOk - Whether a restart is needed after importing.
   */
  showProgress(importerController, restartOnOk) {
    this._showPane("progress");
    this._importerController = importerController;
    this._restartOnOk = restartOnOk;
    this._disableCancel(true);
    this._disableAccept(true);
  },

  async updateProgress(value) {
    document.getElementById("importDialogProgressBar").value = value;
    if (value >= 1) {
      let [restartDesc, finishedDesc] = await document.l10n.formatValues([
        "progress-pane-restart-desc",
        "progress-pane-finished-desc",
      ]);
      document.getElementById("progressPaneDesc").textContent = this
        ._restartOnOk
        ? restartDesc
        : finishedDesc;
      this._disableAccept(false);
    }
  },

  /**
   * Show the error pane, with an error message.
   * @param {string} msg - The error message.
   */
  showError(msg) {
    this._showPane("error");
    document.getElementById("dialogError").textContent = msg;
    this._disableCancel(false);
    this._disableAccept(false);
    this._restartOnOk = false;
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
  onAccept() {
    if (this._restartOnOk) {
      MailUtils.restartApplication();
    } else {
      this._el.close();
      this._importerController?.reset();
    }
  },
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
let addrBookController;

document.addEventListener("DOMContentLoaded", () => {
  profileController = new ProfileImporterController();
  addrBookController = new AddrBookImporterController();
  importDialog.init();

  for (let tab of document.querySelectorAll("[id^=tab-]")) {
    tab.onclick = () => showTab(tab.id);
  }
  showTab("tab-app");
});
