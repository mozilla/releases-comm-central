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
  CalendarFileImporter: "resource:///modules/CalendarFileImporter.jsm",
  ProfileExporter: "resource:///modules/ProfileExporter.jsm",
  cal: "resource:///modules/calendar/calUtils.jsm",
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
    this._showProfiles([], false);
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

  _sourceAppName = "Thunderbird"; //TODO app brand name!

  back() {
    switch (this._currentPane) {
      case "profiles":
        showTab("tab-start");
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
      case "profiles":
        this._onSelectProfile();
        break;
      case "items":
        this._onSelectItems();
        break;
    }
  }

  reset() {
    this._showProfiles([], false);
  }

  /**
   * Handler for the Continue button on the sources pane.
   *
   * @param {string} source - Profile source to import.
   * @param {string} sourceName - Name of the app to import from.
   */
  async _onSelectSource(source, sourceName) {
    this._sourceAppName = sourceName;
    let sourceModule = this._sourceModules[source];

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
      progressDialog.showError("No profile found.");
    }
  }

  /**
   * Show the profiles pane, with a list of profiles and optional file pickers.
   * @param {SourceProfile[]} profiles - An array of profiles.
   * @param {boolean} useFilePicker - Whether to render file pickers.
   */
  _showProfiles(profiles, useFilePicker) {
    this._sourceProfiles = profiles;
    document.l10n.setAttributes(
      document.getElementById("profilesPaneTitle"),
      "profiles-pane-title",
      {
        app: this._sourceAppName,
      }
    );
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
        progressDialog.showError(
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
          progressDialog.updateProgress(progress);
          await new Promise(resolve => setTimeout(resolve));
        }
      } catch (e) {
        this._logger.error(e);
      }
    }
    // Use the tmp dir as source profile dir.
    this._sourceProfile = { dir: targetDir };
    progressDialog.updateProgress(0.2);
  }

  /**
   * Handler for the Continue button on the items pane.
   */
  async _onSelectItems() {
    progressDialog.showProgress(this);
    if (this._importingFromZip) {
      this._extractedFileCount = 0;
      try {
        await this._extractZipFile();
      } catch (e) {
        progressDialog.showError(
          await document.l10n.formatValue(
            "error-message-extract-zip-file-failed"
          )
        );
        throw e;
      }
    }
    this._importer.onProgress = (current, total) => {
      progressDialog.updateProgress(
        this._importingFromZip ? 0.2 + (0.8 * current) / total : current / total
      );
    };
    try {
      progressDialog.finish(
        await this._importer.startImport(
          this._sourceProfile.dir,
          this._getItemsChecked()
        )
      );
    } catch (e) {
      progressDialog.showError(
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
        showTab("tab-start");
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
  _showSources() {
    this.showPane("sources");
  }

  /**
   * Handler for the Continue button on the sources pane.
   */
  async _onSelectSource() {
    this._fileType = document.querySelector(
      "input[name=addrBookSource]:checked"
    );
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

    progressDialog.showProgress(this);
    this._importer.onProgress = (current, total) => {
      progressDialog.updateProgress(current / total);
    };
    try {
      progressDialog.finish(
        await this._importer.startImport(this._sourceFile, targetDirectory)
      );
    } catch (e) {
      progressDialog.showError(
        await document.l10n.formatValue("error-message-failed")
      );
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
    this._showSources();
  }

  back() {
    switch (this._currentPane) {
      case "sources":
        showTab("tab-start");
        break;
      case "items":
        this._showSources();
        break;
      case "calendars":
        this.showPane("items");
        break;
    }
  }

  next() {
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
    }
  }

  reset() {
    this._showSources();
  }

  /**
   * When filter changes, re-render the item list.
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
    filePicker.init(window, "import", filePicker.modeOpen);
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
    let elItemList = document.getElementById("calendar-item-list");
    document.getElementById("calendarItemsTools").hidden = true;
    document.l10n.setAttributes(elItemList, "calendar-items-loading");
    this.showPane("items");

    // Give the UI a chance to render.
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      this._items = await this._importer.parseIcsFile(this._sourceFile);
    } catch (e) {
      progressDialog.importerController = this;
      progressDialog.showError(
        await document.l10n.formatValue("error-failed-to-parse-ics-file")
      );
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
    let elList = document.getElementById("calendarList");
    elList.innerHTML = "";

    this._calendars = this._importer.getTargetCalendars();
    for (let calendar of this._calendars) {
      let item = document.createElement("div");
      item.className = "content-blocking-category";

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

      item.append(label);
      elList.append(item);
    }
    document.querySelector("input[name=targetCalendar]").checked = true;

    this.showPane("calendars");
  }

  /**
   * Handler for the Continue button on the calendars pane.
   */
  async _onSelectCalendar() {
    let index = [
      ...document.querySelectorAll("input[name=targetCalendar]"),
    ].findIndex(el => el.checked);
    let targetCalendar = this._calendars[index];
    if (!targetCalendar) {
      // Create a new calendar.
      targetCalendar = cal.manager.createCalendar(
        "storage",
        Services.io.newURI("moz-storage-calendar://")
      );
      let sourceFileName = this._sourceFile.leafName;
      targetCalendar.name = sourceFileName.slice(
        0,
        sourceFileName.lastIndexOf(".") == -1
          ? Infinity
          : sourceFileName.lastIndexOf(".")
      );
      cal.manager.registerCalendar(targetCalendar);
    }
    progressDialog.showProgress(this);
    this._importer.onProgress = (current, total) => {
      progressDialog.updateProgress(current / total);
    };
    try {
      await this._importer.startImport(
        [...this._selectedItems],
        targetCalendar
      );
      progressDialog.finish();
    } catch (e) {
      progressDialog.showError(
        await document.l10n.formatValue("error-message-failed")
      );
      throw e;
    }
  }
}

/**
 * Control the #tabPane-export element, to support exporting the current profile
 * to a zip file.
 */
class ExportController {
  back() {
    window.close();
  }

  async next() {
    let [
      filePickerTitle,
      brandName,
      progressPaneTitle,
      errorMsg,
    ] = await document.l10n.formatValues([
      "export-file-picker",
      "export-brand-name",
      "progress-pane-exporting",
      "error-export-failed",
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
    progressDialog.showProgress(null, progressPaneTitle);
    exporter.onProgress = (current, total) => {
      progressDialog.updateProgress(current / total);
    };
    try {
      await exporter.startExport(filePicker.file);
      progressDialog.finish();
    } catch (e) {
      progressDialog.showError(errorMsg);
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
    this._showSources();
  }

  back() {
    switch (this._currentPane) {
      case "sources":
        window.close();
        break;
      case "file":
        this._showSources();
        break;
    }
  }

  next() {
    switch (this._currentPane) {
      case "sources":
        this._onSelectSource();
        break;
      case "file":
        this._onSelectFile();
        break;
    }
  }

  reset() {
    this._showSources();
  }

  /**
   * Show the sources pane.
   */
  _showSources() {
    this.showPane("sources");
    document.l10n.setAttributes(
      document.getElementById("startBackButton"),
      "button-cancel"
    );
  }

  /**
   * Handler for the Continue button on the sources pane.
   */
  _onSelectSource() {
    let checkedInput = document.querySelector("input[name=appSource]:checked");

    switch (checkedInput.value) {
      case "file":
        this._showFile();
        break;
      default:
        profileController._onSelectSource(
          checkedInput.value,
          checkedInput.parentElement.textContent
        );
        showTab("tab-app");
        // Don't change back button text, since we switch to app flow.
        return;
    }

    document.l10n.setAttributes(
      document.getElementById("startBackButton"),
      "button-back"
    );
  }

  _showFile() {
    this.showPane("file");
  }

  async _onSelectFile() {
    let checkedInput = document.querySelector("input[name=startFile]:checked");
    switch (checkedInput.value) {
      case "profile":
        // Go to the import profile from zip file step in profile flow for TB.
        await profileController._onSelectSource(
          "Thunderbird",
          document.querySelector("[data-l10n-id=app-name-thunderbird]")
            .textContent
        );
        document.getElementById("appFilePickerZip").checked = true;
        await profileController._onSelectProfile();
        showTab("tab-app");
        break;
      case "calendar":
        showTab("tab-calendar");
        break;
      case "addressbook":
        showTab("tab-addressBook");
        break;
    }
  }
}

/**
 * Control the #progressDialog element, to show importing progress and result.
 */
let progressDialog = {
  /**
   * Init internal variables and event bindings.
   */
  init() {
    this._el = document.getElementById("progressDialog");
    this._elFooter = this._el.querySelector("footer");
    this._btnCancel = this._el.querySelector("#progressDialogCancel");
    this._btnAccept = this._el.querySelector("#progressDialogAccept");
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
   * @param {string} [title] - Pane title.
   */
  showProgress(importerController, title) {
    if (title) {
      document.getElementById("progressPaneTitle").textContent = title;
    } else {
      document.l10n.setAttributes(
        document.getElementById("progressPaneTitle"),
        "progress-pane-importing"
      );
    }
    this._showPane("progress");
    this.importerController = importerController;
    this._disableCancel(true);
    this._disableAccept(true);
  },

  /**
   * Update the progress bar.
   * @param {number} value - A number between 0 and 1 to represent the progress.
   */
  updateProgress(value) {
    document.getElementById("progressDialogProgressBar").value = value;
    if (value >= 1) {
      this._disableAccept(false);
    }
  },

  /**
   * Show the finish text.
   * @param {boolean} restartNeeded - Whether restart is needed to finish the
   *   importing.
   */
  async finish(restartNeeded) {
    this._restartOnOk = restartNeeded;
    let [restartDesc, finishedDesc] = await document.l10n.formatValues([
      "progress-pane-restart-desc",
      "progress-pane-finished-desc",
    ]);
    document.getElementById("progressPaneDesc").textContent = restartNeeded
      ? restartDesc
      : finishedDesc;
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
      this.importerController?.reset();
    }
  },
};

/**
 * Show a specific importing tab.
 * @param {"tab-app"|"tab-addressBook"|"tab-calendar"|"tab-export"|"tab-start"} tabId - Tab to show.
 */
function showTab(tabId) {
  let selectedPaneId = `tabPane-${tabId.split("-")[1]}`;
  for (let tabPane of document.querySelectorAll("[id^=tabPane-]")) {
    tabPane.hidden = tabPane.id != selectedPaneId;
  }
  for (let el of document.querySelectorAll("[id^=tab-]")) {
    el.classList.toggle("is-selected", el.id == tabId);
  }
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
  progressDialog.init();
  showTab("tab-start");
});
