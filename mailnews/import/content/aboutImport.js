/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozElements */

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  MailServices: "resource:///modules/MailServices.jsm",
  MailUtils: "resource:///modules/MailUtils.jsm",
  AddrBookFileImporter: "resource:///modules/AddrBookFileImporter.jsm",
  CalendarFileImporter: "resource:///modules/CalendarFileImporter.jsm",
  ProfileExporter: "resource:///modules/ProfileExporter.jsm",
  cal: "resource:///modules/calendar/calUtils.jsm",
});

/**
 * An object to represent a source profile to import from.
 *
 * @typedef {object} SourceProfile
 * @property {string} [name] - The profile name.
 * @property {nsIFile} dir - The profile location.
 */

/**
 * @typedef {object} Step
 * @property {Function} returnTo - Function that resets to this step. Should end
 *  up calling |updateSteps()| with this step again.
 */

const Steps = {
  _pastSteps: [],
  /**
   * Toggle visibility of the navigation steps.
   *
   * @param {boolean} visible - If the navigation steps should be shown.
   */
  toggle(visible) {
    document.getElementById("stepNav").hidden = !visible;
  },
  /**
   * Update the currently displayed steps by adding a new step and updating the
   * forecast of remaining steps.
   *
   * @param {Step} currentStep
   * @param {number} plannedSteps - Amount of steps to follow this step,
   *  including summary.
   */
  updateSteps(currentStep, plannedSteps) {
    this._pastSteps.push(currentStep);
    let confirm = document.getElementById("navConfirm");
    const isConfirmStep = plannedSteps === 0;
    confirm.classList.toggle("current", isConfirmStep);
    confirm.toggleAttribute("disabled", isConfirmStep);
    confirm.removeAttribute("aria-current");
    document.getElementById("stepNav").replaceChildren(
      ...this._pastSteps.map((step, index) => {
        const li = document.createElement("li");
        const button = document.createElement("button");
        if (step === currentStep) {
          if (isConfirmStep) {
            confirm.setAttribute("aria-current", "step");
            return confirm;
          }
          li.classList.add("current");
          li.setAttribute("aria-current", "step");
          button.setAttribute("disabled", "disabled");
        } else {
          li.classList.add("completed");
          button.addEventListener("click", () => {
            this.backTo(index);
          });
        }
        document.l10n.setAttributes(button, "step-count", {
          number: index + 1,
        });
        li.append(button);
        //TODO tooltips
        return li;
      }),
      ...new Array(Math.max(plannedSteps - 1, 0))
        .fill(null)
        .map((item, index) => {
          const li = document.createElement("li");
          const button = document.createElement("button");
          document.l10n.setAttributes(button, "step-count", {
            number: this._pastSteps.length + index + 1,
          });
          button.setAttribute("disabled", "disabled");
          li.append(button);
          //TODO tooltips
          return li;
        }),
      isConfirmStep ? "" : confirm
    );
  },
  /**
   * Return to a previous step.
   *
   * @param {number} [stepIndex=-1] - The absolute index of the step to return
   *  to. By default goes back one step.
   * @returns {boolean} if a previous step was recalled.
   */
  backTo(stepIndex = -1) {
    if (!this._pastSteps.length || stepIndex >= this._pastSteps.length) {
      return false;
    }
    if (stepIndex < 0) {
      // Make relative step index absolute
      stepIndex = this._pastSteps.length + stepIndex - 1;
    }
    let targetStep = this._pastSteps[stepIndex];
    this._pastSteps = this._pastSteps.slice(0, stepIndex);
    targetStep.returnTo();
    return true;
  },
  /**
   * If any previous steps have been recorded.
   *
   * @returns {boolean} If there are steps preceding the current state.
   */
  hasStepHistory() {
    return this._pastSteps.length > 0;
  },
  /**
   * Reset step state.
   */
  reset() {
    this._pastSteps = [];
  },
};

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
   * @param {string} paneIdPrefix - The prefix of sub pane id.
   */
  constructor(elementId, paneIdPrefix) {
    this._el = document.getElementById(elementId);
    this._paneIdPrefix = paneIdPrefix;
  }

  /**
   * Show a specific pane, hide all the others.
   *
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
  back() {
    ImporterController.notificationBox.removeAllNotifications();
    Steps.backTo();
  }

  /**
   * Show the next pane.
   */
  next() {
    if (this._restartOnOk) {
      window.close();
      MailUtils.restartApplication();
      return;
    }
    ImporterController.notificationBox.removeAllNotifications();
  }

  /**
   * Show the first pane.
   */
  reset() {
    this._el.classList.remove(
      "restart-only",
      "progress",
      "complete",
      "final-step"
    );
    this._toggleBackButton(true);
  }

  /**
   * Show the progress bar.
   *
   * @param {string} progressL10nId - Fluent ID to use for the progress
   *  description. Should have a |progressPercent| variable expecting the
   *  current progress like "50%".
   */
  showProgress(progressL10nId) {
    this._progressL10nId = progressL10nId;
    this.updateProgress(0);
    this._el.classList.add("progress");
    this._toggleBackButton(false);
    this._inProgress = true;
  }

  /**
   * Update the progress bar.
   *
   * @param {number} value - A number between 0 and 1 to represent the progress.
   */
  updateProgress(value) {
    this._el.querySelector(".progressPaneProgressBar").value = value;
    document.l10n.setAttributes(
      this._el.querySelector(".progressPaneDesc"),
      this._progressL10nId,
      {
        progressPercent: ImporterController.percentFormatter.format(value),
      }
    );
  }

  /**
   * Show the finish text.
   *
   * @param {boolean} [restartNeeded=false] - Whether restart is needed to
   *  finish the importing.
   */
  finish(restartNeeded = false) {
    this._restartOnOk = restartNeeded;
    this._el.classList.toggle("restart-required", restartNeeded);
    this._el.classList.add("complete");
    document.l10n.setAttributes(
      this._el.querySelector(".progressPaneDesc"),
      "progress-pane-finished-desc2"
    );
    this._inProgress = false;
  }

  /**
   * Show the error pane, with an error message.
   *
   * @param {string} msgId - The error message fluent id.
   */
  showError(msgId) {
    if (this._inProgress) {
      this._toggleBackButton(true);
      this._el.classList.remove("progress");
      this._restartOnOk = false;
      this._inProgress = false;
    }
    ImporterController.notificationBox.removeAllNotifications();
    let notification = ImporterController.notificationBox.appendNotification(
      "error",
      {
        label: {
          "l10n-id": msgId,
        },
        priority: ImporterController.notificationBox.PRIORITY_CRITICAL_HIGH,
      },
      null
    );
    notification.removeAttribute("dismissable");
  }

  /**
   * Disable/enable the back button.
   *
   * @param {boolean} enable - If the back button should be enabled
   */
  _toggleBackButton(enable) {
    if (this._el.querySelector(".buttons-container")) {
      this._el.querySelector(".back").disabled = !enable;
    }
  }
}

XPCOMUtils.defineLazyGetter(
  ImporterController,
  "percentFormatter",
  () =>
    new Intl.NumberFormat(undefined, {
      style: "percent",
    })
);
XPCOMUtils.defineLazyGetter(
  ImporterController,
  "notificationBox",
  () =>
    new MozElements.NotificationBox(element => {
      element.setAttribute("notificationside", "bottom");
      document.getElementById("errorNotifications").append(element);
    })
);

/**
 * Control the #tabPane-app element, to support importing from an application.
 */
class ProfileImporterController extends ImporterController {
  constructor() {
    super("tabPane-app", "app");
    document.getElementById("appItemsList").addEventListener(
      "input",
      () => {
        let state = this._getItemsChecked(true);
        document.getElementById("profileNextButton").disabled = Object.values(
          state
        ).every(isChecked => !isChecked);
      },
      {
        capture: true,
        passive: true,
      }
    );
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

  /**
   * Maps app radio input values to their respective representations in l10n
   * ids.
   */
  _sourceL10nIds = {
    Thunderbird: "thunderbird",
    Seamonkey: "seamonkey",
    Outlook: "outlook",
    Becky: "becky",
    AppleMail: "apple-mail",
  };
  _sourceAppName = "thunderbird";

  next() {
    super.next();
    switch (this._currentPane) {
      case "profiles":
        this._onSelectProfile();
        break;
      case "items":
        this._onSelectItems();
        break;
      case "summary":
        window.close();
        break;
    }
  }

  /**
   * Handler for the Continue button on the sources pane.
   *
   * @param {string} source - Profile source to import.
   */
  async _onSelectSource(source) {
    this._sourceAppName = this._sourceL10nIds[source];
    let sourceModule = this._sourceModules[source];

    let module = ChromeUtils.import(`resource:///modules/${sourceModule}.jsm`);
    this._importer = new module[sourceModule]();

    let sourceProfiles = await this._importer.getSourceProfiles();
    if (sourceProfiles.length > 1 || this._importer.USE_FILE_PICKER) {
      // Let the user pick a profile if there are multiple options.
      this._showProfiles(sourceProfiles, this._importer.USE_FILE_PICKER);
    } else if (sourceProfiles.length == 1) {
      // Let the user pick what to import.
      this._showItems(sourceProfiles[0]);
    } else {
      this.showError("error-message-no-profile");
      throw new Error("No profile found, do not advance to app flow.");
    }
  }

  /**
   * Show the profiles pane, with a list of profiles and optional file pickers.
   *
   * @param {SourceProfile[]} profiles - An array of profiles.
   * @param {boolean} useFilePicker - Whether to render file pickers.
   */
  _showProfiles(profiles, useFilePicker) {
    Steps.updateSteps(
      {
        returnTo: () => {
          this.reset();
          this._showProfiles(profiles, useFilePicker);
        },
      },
      2
    );
    this._sourceProfiles = profiles;
    document.l10n.setAttributes(
      document.getElementById("profilesPaneTitle"),
      `from-app-${this._sourceAppName}`
    );
    document.l10n.setAttributes(
      document.getElementById("profilesPaneSubtitle"),
      `profiles-pane-title-${this._sourceAppName}`
    );
    let elProfileList = document.getElementById("profileList");
    elProfileList.hidden = !profiles.length;
    elProfileList.innerHTML = "";
    document.getElementById("filePickerList").hidden = !useFilePicker;

    for (let profile of profiles) {
      let label = document.createElement("label");
      label.className = "toggle-container-with-text";

      let input = document.createElement("input");
      input.type = "radio";
      input.name = "appProfile";
      input.value = profile.dir.path;
      label.append(input);

      let name = document.createElement("p");
      if (profile.name) {
        document.l10n.setAttributes(name, "profile-source-named", {
          profileName: profile.name,
        });
      } else {
        document.l10n.setAttributes(name, "profile-source");
      }
      label.append(name);

      let profileDetails = document.createElement("dl");
      profileDetails.className = "result-indent tip-caption";
      let profilePathLabel = document.createElement("dt");
      document.l10n.setAttributes(profilePathLabel, "items-pane-directory");
      let profilePath = document.createElement("dd");
      profilePath.textContent = profile.dir.path;
      profileDetails.append(profilePathLabel, profilePath);
      label.append(profileDetails);

      elProfileList.append(label);
    }
    document.querySelector("input[name=appProfile]").checked = true;
    document.getElementById("profileNextButton").disabled = false;

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
   * Open a file picker to select a folder or a zip file.
   *
   * @param {'dir' | 'zip'} type - Whether to pick a folder or a zip file.
   */
  async _openFilePicker(type) {
    let filePicker = Cc["@mozilla.org/filepicker;1"].createInstance(
      Ci.nsIFilePicker
    );
    let [filePickerTitleDir, filePickerTitleZip] =
      await document.l10n.formatValues([
        "profile-file-picker-directory",
        "profile-file-picker-archive-title",
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
        this.showError("error-message-zip-file-too-big2");
        return;
      }
      this._importingFromZip = true;
    }
    this._showItems({ dir: selectedFile });
  }

  /**
   * Show the items pane, with a list of items to import.
   *
   * @param {SourceProfile} profile - The profile to import from.
   */
  _showItems(profile) {
    Steps.updateSteps(
      {
        returnTo: () => {
          this.reset();
          this._showItems(profile);
        },
      },
      1
    );
    this._el.classList.remove("final-step", "progress");
    this._sourceProfile = profile;
    document.l10n.setAttributes(
      this._el.querySelector("#app-items h1"),
      `from-app-${this._sourceAppName}`
    );
    document.getElementById("appSourceProfilePath").textContent =
      profile.dir.path;
    document.getElementById("appSourceProfilePath").textContent =
      this._sourceProfile.dir.path;
    document.getElementById("appSourceProfileNameWrapper").hidden =
      !this._sourceProfile.name;
    if (this._sourceProfile.name) {
      document.getElementById("appSourceProfileName").textContent =
        this._sourceProfile.name;
    }
    this._setItemsChecked(this._importer.SUPPORTED_ITEMS);
    document.getElementById("profileNextButton").disabled = Object.values(
      this._importer.SUPPORTED_ITEMS
    ).every(isChecked => !isChecked);

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
   * Map of fluent IDs from ImportItems if they differ.
   *
   * @type {Object<string>}
   */
  _importItemFluentId = {
    addressBooks: "address-books",
    mailMessages: "mail-messages",
  };

  /**
   * Set checkbox states according to an ImportItems object.
   *
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
   *
   * @param {boolean} [onlySupported=false] - Only return supported ImportItems.
   * @returns {ImportItems}
   */
  _getItemsChecked(onlySupported = false) {
    let items = {};
    for (let id in this._itemCheckboxes) {
      let checkbox = document.getElementById(id);
      if (!onlySupported || !checkbox.disabled) {
        items[this._itemCheckboxes[id]] = checkbox.checked;
      }
    }
    return items;
  }

  /**
   * Handler for the Continue button on the items pane.
   */
  _onSelectItems() {
    let checkedItems = this._getItemsChecked(true);
    if (Object.values(checkedItems).some(isChecked => isChecked)) {
      this._showSummary();
    }
  }

  _showSummary() {
    Steps.updateSteps({}, 0);
    this._el.classList.add("final-step");
    document.l10n.setAttributes(
      this._el.querySelector("#app-summary h1"),
      `from-app-${this._sourceAppName}`
    );
    document.getElementById("appSummaryProfilePath").textContent =
      this._sourceProfile.dir.path;
    document.getElementById("appSummaryProfileNameWrapper").hidden =
      !this._sourceProfile.name;
    if (this._sourceProfile.name) {
      document.getElementById("appSummaryProfileName").textContent =
        this._sourceProfile.name;
    }
    document.getElementById("appSummaryItems").replaceChildren(
      ...Object.entries(this._getItemsChecked(true))
        .filter(([item, checked]) => checked)
        .map(([item]) => {
          let li = document.createElement("li");
          let fluentId = this._importItemFluentId[item] ?? item;
          document.l10n.setAttributes(li, `items-pane-checkbox-${fluentId}`);
          return li;
        })
    );
    this.showPane("summary");
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
      // extract all file entries one by one.
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
          this.updateProgress(progress);
          await new Promise(resolve => setTimeout(resolve));
        }
      } catch (e) {
        this._logger.error(e);
      }
    }
    // Use the tmp dir as source profile dir.
    this._sourceProfile = { dir: targetDir };
    this.updateProgress(0.2);
  }

  async startImport() {
    this.showProgress("progress-pane-importing2");
    if (this._importingFromZip) {
      this._extractedFileCount = 0;
      try {
        await this._extractZipFile();
      } catch (e) {
        this.showError("error-message-extract-zip-file-failed2");
        throw e;
      }
    }
    this._importer.onProgress = (current, total) => {
      this.updateProgress(
        this._importingFromZip ? 0.2 + (0.8 * current) / total : current / total
      );
    };
    try {
      this.finish(
        await this._importer.startImport(
          this._sourceProfile.dir,
          this._getItemsChecked()
        )
      );
    } catch (e) {
      this.showError("error-message-failed");
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
  }

  /**
   * Show the next pane.
   */
  next() {
    super.next();
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
      case "summary":
        window.close();
        break;
    }
  }

  showInitialStep() {
    this._showSources();
  }

  /**
   * Show the sources pane.
   */
  _showSources() {
    document.getElementById("addrBookBackButton").hidden =
      !Steps.hasStepHistory();
    Steps.updateSteps(
      {
        returnTo: () => {
          this.reset();
          this._showSources();
        },
      },
      2
    );
    this.showPane("sources");
  }

  /**
   * Handler for the Continue button on the sources pane.
   */
  async _onSelectSource() {
    this._fileType = document.querySelector(
      "input[name=addrBookSource]:checked"
    ).value;
    this._importer = new AddrBookFileImporter(this._fileType);

    let filePicker = Cc["@mozilla.org/filepicker;1"].createInstance(
      Ci.nsIFilePicker
    );
    let [filePickerTitle] = await document.l10n.formatValues([
      "addr-book-file-picker",
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

    if (this._fileType == "csv") {
      let unmatchedRows = await this._importer.parseCsvFile(filePicker.file);
      if (unmatchedRows.length) {
        document.getElementById("csvFieldMap").data = unmatchedRows;
        this._showCsvFieldMap();
        return;
      }
    }
    this._showDirectories();
  }

  /**
   * Show the csvFieldMap pane, user can map source CSV fields to address book
   * fields.
   */
  _showCsvFieldMap() {
    Steps.updateSteps(
      {
        returnTo: () => {
          this.reset();
          this._showCsvFieldMap();
        },
      },
      2
    );
    document.getElementById("addrBookBackButton").hidden = false;
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
    Steps.updateSteps(
      {
        returnTo: () => {
          this.reset();
          this._showDirectories();
        },
      },
      1
    );
    document.getElementById("addrBookBackButton").hidden = false;
    this._el.classList.remove("final-step", "progress");
    let sourceFileName = this._sourceFile.leafName;
    this._fallbackABName = sourceFileName.slice(
      0,
      sourceFileName.lastIndexOf(".") == -1
        ? Infinity
        : sourceFileName.lastIndexOf(".")
    );
    document.l10n.setAttributes(
      document.getElementById("newDirectoryLabel"),
      "addr-book-import-into-new-directory2",
      {
        addressBookName: this._fallbackABName,
      }
    );
    let elList = document.getElementById("directoryList");
    elList.innerHTML = "";
    this._directories = MailServices.ab.directories.filter(
      dir => dir.dirType == Ci.nsIAbManager.JS_DIRECTORY_TYPE
    );
    for (let directory of this._directories) {
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

      elList.append(label);
    }
    document.querySelector("input[name=addrBookDirectory]").checked = true;

    this.showPane("directories");
  }

  /**
   * Handler for the Continue button on the directories pane.
   */
  _onSelectDirectory() {
    let index = [
      ...document.querySelectorAll("input[name=addrBookDirectory]"),
    ].findIndex(el => el.checked);
    this._selectedAddressBook = this._directories[index];
    this._showSummary();
  }

  _showSummary() {
    Steps.updateSteps({}, 0);
    this._el.classList.add("final-step");
    document.getElementById("addrBookSummaryPath").textContent =
      this._sourceFile.path;
    let targetAddressBook = this._selectedAddressBook?.dirName;
    let newAddressBook = false;
    if (!targetAddressBook) {
      targetAddressBook = this._fallbackABName;
      newAddressBook = true;
    }
    let description = this._el.querySelector("#addr-book-summary .description");
    description.hidden = !newAddressBook;
    if (newAddressBook) {
      document.l10n.setAttributes(
        description,
        "addr-book-summary-description",
        {
          addressBookName: targetAddressBook,
        }
      );
    }
    document.l10n.setAttributes(
      document.getElementById("addrBookSummarySubtitle"),
      "addr-book-summary-title",
      {
        addressBookName: targetAddressBook,
      }
    );
    this.showPane("summary");
  }

  async startImport() {
    let targetDirectory = this._selectedAddressBook;
    if (!targetDirectory) {
      // User selected to create a new address book and import into it. Create
      // one based on the file name.
      let dirId = MailServices.ab.newAddressBook(
        this._fallbackABName,
        "",
        Ci.nsIAbManager.JS_DIRECTORY_TYPE
      );
      targetDirectory = MailServices.ab.getDirectoryFromId(dirId);
    }

    this.showProgress("progress-pane-importing2");
    this._importer.onProgress = (current, total) => {
      this.updateProgress(current / total);
    };
    try {
      this.finish(
        await this._importer.startImport(this._sourceFile, targetDirectory)
      );
    } catch (e) {
      this.showError("error-message-failed");
      throw e;
    }
  }
}

/**
 * Control the #tabPane-calendar element, to support importing from a calendar
 * file.
 */
class CalendarImporterController extends ImporterController {
  constructor() {
    super("tabPane-calendar", "calendar");
  }

  next() {
    super.next();
    switch (this._currentPane) {
      case "sources":
        this._onSelectSource();
        break;
      case "items":
        this._onSelectItems();
        break;
      case "calendars":
        this._onSelectCalendar();
        break;
      case "summary":
        window.close();
        break;
    }
  }

  showInitialStep() {
    this._showSources();
  }

  /**
   * When filter changes, re-render the item list.
   *
   * @param {HTMLInputElement} filterInput - The filter input.
   */
  onFilterChange(filterInput) {
    let term = filterInput.value.toLowerCase();
    this._filteredItems = [];
    for (let item of this._items) {
      let element = this._itemElements[item.id];
      if (item.title.toLowerCase().includes(term)) {
        element.hidden = false;
        this._filteredItems.push(item);
      } else {
        element.hidden = true;
      }
    }
  }

  /**
   * Select or deselect all visible items.
   *
   * @param {boolean} selected - Select all if true, otherwise deselect all.
   */
  selectAllItems(selected) {
    for (let item of this._filteredItems) {
      let element = this._itemElements[item.id];
      element.querySelector("input").checked = selected;
      if (selected) {
        this._selectedItems.add(item);
      } else {
        this._selectedItems.delete(item);
      }
    }
    document.getElementById("calendarNextButton").disabled =
      this._selectedItems.size == 0;
  }

  /**
   * Show the sources pane.
   */
  _showSources() {
    document.getElementById("calendarBackButton").hidden =
      !Steps.hasStepHistory();
    Steps.updateSteps(
      {
        returnTo: () => {
          this.reset();
          this._showSources();
        },
      },
      3
    );
    this.showPane("sources");
  }

  /**
   * Handler for the Continue button on the sources pane.
   */
  async _onSelectSource() {
    let filePicker = Cc["@mozilla.org/filepicker;1"].createInstance(
      Ci.nsIFilePicker
    );
    filePicker.appendFilter("", "*.ics");
    filePicker.appendFilters(Ci.nsIFilePicker.filterAll);
    filePicker.init(
      window,
      await document.l10n.formatValue("file-calendar-description"),
      filePicker.modeOpen
    );
    let rv = await new Promise(resolve => filePicker.open(resolve));
    if (rv != Ci.nsIFilePicker.returnOK) {
      return;
    }

    this._sourceFile = filePicker.file;
    this._importer = new CalendarFileImporter();

    document.getElementById("calendarSourcePath").textContent =
      filePicker.file.path;

    this._showItems();
  }

  /**
   * Show the sources pane.
   */
  async _showItems() {
    Steps.updateSteps(
      {
        returnTo: () => {
          this.reset();
          this._showItems();
        },
      },
      2
    );
    document.getElementById("calendarBackButton").hidden = false;
    let elItemList = document.getElementById("calendar-item-list");
    document.getElementById("calendarItemsTools").hidden = true;
    document.l10n.setAttributes(elItemList, "calendar-items-loading");
    this.showPane("items");

    // Give the UI a chance to render.
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      this._items = await this._importer.parseIcsFile(this._sourceFile);
    } catch (e) {
      this.showError("error-failed-to-parse-ics-file");
      throw e;
    }

    document.getElementById("calendarItemsTools").hidden =
      this._items.length < 2;
    elItemList.innerHTML = "";
    this._filteredItems = this._items;
    this._selectedItems = new Set(this._items);
    this._itemElements = {};

    for (let item of this._items) {
      let wrapper = document.createElement("div");
      wrapper.className = "calendar-item-wrapper";
      elItemList.appendChild(wrapper);
      this._itemElements[item.id] = wrapper;

      let summary = document.createXULElement("calendar-item-summary");
      wrapper.appendChild(summary);
      summary.item = item;
      summary.updateItemDetails();

      let input = document.createElement("input");
      input.type = "checkbox";
      input.checked = true;
      wrapper.appendChild(input);

      wrapper.addEventListener("click", e => {
        if (e.target != input) {
          input.checked = !input.checked;
        }
        if (input.checked) {
          this._selectedItems.add(item);
        } else {
          this._selectedItems.delete(item);
        }
        document.getElementById("calendarNextButton").disabled =
          this._selectedItems.size == 0;
      });
    }
  }

  /**
   * Handler for the Continue button on the items pane.
   */
  _onSelectItems() {
    this._showCalendars();
  }

  /**
   * Show the calendars pane, with a list of existing writable calendars and an
   * option to create a new calendar.
   */
  _showCalendars() {
    Steps.updateSteps(
      {
        returnTo: () => {
          this.reset();
          this._showCalendars();
        },
      },
      1
    );
    this._el.classList.remove("final-step", "progress");
    document.getElementById("calendarCalPath").textContent =
      this._sourceFile.path;
    let elList = document.getElementById("calendarList");
    elList.innerHTML = "";

    let sourceFileName = this._sourceFile.leafName;
    this._fallbackCalendarName = sourceFileName.slice(
      0,
      sourceFileName.lastIndexOf(".") == -1
        ? Infinity
        : sourceFileName.lastIndexOf(".")
    );

    document.l10n.setAttributes(
      document.getElementById("newCalendarLabel"),
      "calendar-import-into-new-calendar2",
      {
        targetCalendar: this._fallbackCalendarName,
      }
    );

    this._calendars = this._importer.getTargetCalendars();
    for (let calendar of this._calendars) {
      let label = document.createElement("label");
      label.className = "toggle-container-with-text";

      let input = document.createElement("input");
      input.type = "radio";
      input.name = "targetCalendar";
      input.value = calendar.id;
      label.append(input);

      let name = document.createElement("div");
      name.className = "strong";
      name.textContent = calendar.name;
      label.append(name);

      elList.append(label);
    }
    document.querySelector("input[name=targetCalendar]").checked = true;

    this.showPane("calendars");
  }

  _onSelectCalendar() {
    let index = [
      ...document.querySelectorAll("input[name=targetCalendar]"),
    ].findIndex(el => el.checked);
    this._selectedCalendar = this._calendars[index];
    this._showSummary();
  }

  _showSummary() {
    Steps.updateSteps({}, 0);
    this._el.classList.add("final-step");
    document.getElementById("calendarSummaryPath").textContent =
      this._sourceFile.path;
    let targetCalendar = this._selectedCalendar?.name;
    let newCalendar = false;
    if (!targetCalendar) {
      targetCalendar = this._fallbackCalendarName;
      newCalendar = true;
    }
    let description = this._el.querySelector("#calendar-summary .description");
    description.hidden = !newCalendar;
    if (newCalendar) {
      document.l10n.setAttributes(description, "calendar-summary-description", {
        targetCalendar,
      });
    }
    document.l10n.setAttributes(
      document.getElementById("calendarSummarySubtitle"),
      "calendar-summary-title",
      {
        itemCount: this._selectedItems.size,
        targetCalendar,
      }
    );
    this.showPane("summary");
  }

  /**
   * Handler for the Continue button on the calendars pane.
   */
  async startImport() {
    let targetCalendar = this._selectedCalendar;
    if (!targetCalendar) {
      // Create a new calendar.
      targetCalendar = cal.manager.createCalendar(
        "storage",
        Services.io.newURI("moz-storage-calendar://")
      );
      targetCalendar.name = this._fallbackCalendarName;
      cal.manager.registerCalendar(targetCalendar);
    }
    this.showProgress("progress-pane-importing2");
    this._importer.onProgress = (current, total) => {
      this.updateProgress(current / total);
    };
    try {
      await this._importer.startImport(
        [...this._selectedItems],
        targetCalendar
      );
      this.finish();
    } catch (e) {
      this.showError("error-message-failed");
      throw e;
    }
  }
}

/**
 * Control the #tabPane-export element, to support exporting the current profile
 * to a zip file.
 */
class ExportController extends ImporterController {
  constructor() {
    super("tabPane-export", "");
  }

  back() {
    window.close();
  }

  async next() {
    super.next();
    let [filePickerTitle, brandName] = await document.l10n.formatValues([
      "export-file-picker2",
      "export-brand-name",
    ]);
    let filePicker = Cc["@mozilla.org/filepicker;1"].createInstance(
      Ci.nsIFilePicker
    );
    filePicker.init(window, filePickerTitle, Ci.nsIFilePicker.modeSave);
    filePicker.defaultString = `${brandName}_profile_backup.zip`;
    filePicker.defaultExtension = "zip";
    filePicker.appendFilter("", "*.zip");
    let rv = await new Promise(resolve => filePicker.open(resolve));
    if (
      ![Ci.nsIFilePicker.returnOK, Ci.nsIFilePicker.returnReplace].includes(rv)
    ) {
      return;
    }

    let exporter = new ProfileExporter();
    this.showProgress("progress-pane-exporting2");
    exporter.onProgress = (current, total) => {
      this.updateProgress(current / total);
    };
    try {
      await exporter.startExport(filePicker.file);
      this.finish();
    } catch (e) {
      this.showError("error-export-failed");
      throw e;
    }
  }

  openProfileFolder() {
    Services.dirsvc.get("ProfD", Ci.nsIFile).reveal();
  }
}

class StartController extends ImporterController {
  constructor() {
    super("tabPane-start", "start");
  }

  next() {
    super.next();
    switch (this._currentPane) {
      case "sources":
        this._onSelectSource();
        break;
      case "file":
        this._onSelectFile();
        break;
    }
  }

  showInitialStep() {
    this._showSources();
  }

  /**
   * Show the sources pane.
   */
  _showSources() {
    Steps.updateSteps(
      {
        returnTo: () => {
          this.reset();
          showTab("tab-start");
          //showTab will always call showInitialStep
        },
      },
      3
    );
    document.getElementById("startBackButton").hidden = true;
    this.showPane("sources");
  }

  /**
   * Handler for the Continue button on the sources pane.
   */
  async _onSelectSource() {
    let checkedInput = document.querySelector("input[name=appSource]:checked");

    switch (checkedInput.value) {
      case "file":
        this._showFile();
        break;
      default:
        await profileController._onSelectSource(checkedInput.value);
        showTab("tab-app");
        // Don't change back button state, since we switch to app flow.
        return;
    }

    document.getElementById("startBackButton").hidden = false;
  }

  _showFile() {
    Steps.updateSteps(
      {
        returnTo: () => {
          this.reset();
          showTab("tab-start");
          this._showFile();
        },
      },
      3
    );
    this.showPane("file");
  }

  async _onSelectFile() {
    let checkedInput = document.querySelector("input[name=startFile]:checked");
    switch (checkedInput.value) {
      case "profile":
        // Go to the import profile from zip file step in profile flow for TB.
        profileController.reset();
        await profileController._onSelectSource("Thunderbird");
        document.getElementById("appFilePickerZip").checked = true;
        await profileController._onSelectProfile();
        showTab("tab-app");
        break;
      case "calendar":
        calendarController.reset();
        showTab("tab-calendar");
        calendarController.showInitialStep();
        await calendarController._onSelectSource();
        break;
      case "addressbook":
        addrBookController.reset();
        showTab("tab-addressBook");
        addrBookController.showInitialStep();
        break;
    }
  }
}

/**
 * Show a specific importing tab.
 *
 * @param {"tab-app"|"tab-addressBook"|"tab-calendar"|"tab-export"|"tab-start"} tabId -
 *  Tab to show.
 * @param {boolean} [reset=false] - If the state should be reset as if this was
 *  the initial tab shown.
 */
function showTab(tabId, reset = false) {
  if (reset) {
    Steps.reset();
    restart();
  }
  let selectedPaneId = `tabPane-${tabId.split("-")[1]}`;
  let isExport = tabId === "tab-export";
  document.getElementById("importDocs").hidden = isExport;
  document.getElementById("exportDocs").hidden = !isExport;
  Steps.toggle(!isExport);
  document.l10n.setAttributes(
    document.querySelector("title"),
    isExport ? "export-page-title" : "import-page-title"
  );
  document.querySelector("link[rel=icon]").href = isExport
    ? "chrome://messenger/skin/icons/new/compact/export.svg"
    : "chrome://messenger/skin/icons/new/compact/import.svg";
  location.hash = isExport ? "export" : "";
  for (let tabPane of document.querySelectorAll("[id^=tabPane-]")) {
    tabPane.hidden = tabPane.id != selectedPaneId;
  }
  for (let el of document.querySelectorAll("[id^=tab-]")) {
    el.classList.toggle("is-selected", el.id == tabId);
  }
  if (!Steps.hasStepHistory()) {
    switch (tabId) {
      case "tab-start":
        startController.showInitialStep();
        break;
      case "tab-addressBook":
        addrBookController.showInitialStep();
        break;
      case "tab-calendar":
        calendarController.showInitialStep();
        break;
      default:
    }
  }
}

/**
 * Restart the import wizard. Resets all previous choices.
 */
function restart() {
  startController.reset();
  profileController.reset();
  addrBookController.reset();
  calendarController.reset();
  Steps.backTo(0);
}

let profileController;
let addrBookController;
let calendarController;
let exportController;
let startController;

document.addEventListener("DOMContentLoaded", () => {
  profileController = new ProfileImporterController();
  addrBookController = new AddrBookImporterController();
  calendarController = new CalendarImporterController();
  exportController = new ExportController();
  startController = new StartController();
  showTab(location.hash === "#export" ? "tab-export" : "tab-start", true);
});
