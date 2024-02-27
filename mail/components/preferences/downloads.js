/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from preferences.js */

var { Downloads } = ChromeUtils.importESModule(
  "resource://gre/modules/Downloads.sys.mjs"
);
var { FileUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/FileUtils.sys.mjs"
);

Preferences.addAll([
  { id: "browser.download.useDownloadDir", type: "bool" },
  { id: "browser.download.folderList", type: "int" },
  { id: "browser.download.downloadDir", type: "file" },
  { id: "browser.download.dir", type: "file" },
  { id: "pref.downloads.disable_button.edit_actions", type: "bool" },
]);

var gDownloadDirSection = {
  async chooseFolder() {
    var fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    var bundlePreferences = document.getElementById("bundlePreferences");
    var title = bundlePreferences.getString("chooseAttachmentsFolderTitle");
    fp.init(window, title, Ci.nsIFilePicker.modeGetFolder);

    var customDirPref = Preferences.get("browser.download.dir");
    if (customDirPref.value) {
      fp.displayDirectory = customDirPref.value;
    }
    fp.appendFilters(Ci.nsIFilePicker.filterAll);

    const rv = await new Promise(resolve => fp.open(resolve));
    if (rv != Ci.nsIFilePicker.returnOK || !fp.file) {
      return;
    }

    const file = fp.file.QueryInterface(Ci.nsIFile);
    const currentDirPref = Preferences.get("browser.download.downloadDir");
    customDirPref.value = currentDirPref.value = file;
    const folderListPref = Preferences.get("browser.download.folderList");
    folderListPref.value = await this._fileToIndex(file);
  },

  onReadUseDownloadDir() {
    this.readDownloadDirPref();
    var downloadFolder = document.getElementById("downloadFolder");
    var chooseFolder = document.getElementById("chooseFolder");
    var preference = Preferences.get("browser.download.useDownloadDir");
    var dirPreference = Preferences.get("browser.download.dir");
    downloadFolder.disabled = !preference.value || dirPreference.locked;
    chooseFolder.disabled = !preference.value || dirPreference.locked;
    return undefined;
  },

  async _fileToIndex(aFile) {
    if (!aFile || aFile.equals(await this._getDownloadsFolder("Desktop"))) {
      return 0;
    } else if (aFile.equals(await this._getDownloadsFolder("Downloads"))) {
      return 1;
    }
    return 2;
  },

  async _indexToFile(aIndex) {
    switch (aIndex) {
      case 0:
        return this._getDownloadsFolder("Desktop");
      case 1:
        return this._getDownloadsFolder("Downloads");
    }
    var customDirPref = Preferences.get("browser.download.dir");
    return customDirPref.value;
  },

  async _getDownloadsFolder(aFolder) {
    switch (aFolder) {
      case "Desktop":
        return Services.dirsvc.get("Desk", Ci.nsIFile);
      case "Downloads": {
        const downloadsDir = await Downloads.getSystemDownloadsDirectory();
        return new FileUtils.File(downloadsDir);
      }
    }
    throw new Error(
      "ASSERTION FAILED: folder type should be 'Desktop' or 'Downloads'"
    );
  },

  async readDownloadDirPref() {
    var folderListPref = Preferences.get("browser.download.folderList");
    var bundlePreferences = document.getElementById("bundlePreferences");
    var downloadFolder = document.getElementById("downloadFolder");

    var customDirPref = Preferences.get("browser.download.dir");
    var customIndex = customDirPref.value
      ? await this._fileToIndex(customDirPref.value)
      : 0;
    if (customIndex == 0) {
      downloadFolder.value = bundlePreferences.getString("desktopFolderName");
    } else if (customIndex == 1) {
      downloadFolder.value = bundlePreferences.getString(
        "myDownloadsFolderName"
      );
    } else {
      downloadFolder.value = customDirPref.value
        ? customDirPref.value.path
        : "";
    }

    var currentDirPref = Preferences.get("browser.download.downloadDir");
    var downloadDir =
      currentDirPref.value || (await this._indexToFile(folderListPref.value));
    if (downloadDir) {
      const urlSpec = Services.io
        .getProtocolHandler("file")
        .QueryInterface(Ci.nsIFileProtocolHandler)
        .getURLSpecFromDir(downloadDir);

      downloadFolder.style.backgroundImage =
        "url(moz-icon://" + urlSpec + "?size=16)";
    }

    return undefined;
  },
};

Preferences.get("browser.download.dir").on(
  "change",
  gDownloadDirSection.readDownloadDirPref.bind(gDownloadDirSection)
);
