/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://gre/modules/Downloads.jsm");

var gDownloadDirSection = {
  async chooseFolder() {
    var fp = Cc["@mozilla.org/filepicker;1"]
               .createInstance(Ci.nsIFilePicker);
    var bundlePreferences = document.getElementById("bundlePreferences");
    var title = bundlePreferences.getString("chooseAttachmentsFolderTitle");
    fp.init(window, title, Ci.nsIFilePicker.modeGetFolder);

    var customDirPref = document.getElementById("browser.download.dir");
    if (customDirPref.value)
      fp.displayDirectory = customDirPref.value;
    fp.appendFilters(Ci.nsIFilePicker.filterAll);

    let rv = await new Promise(resolve => fp.open(resolve));
    if (rv != Ci.nsIFilePicker.returnOK || !fp.file) {
      return;
    }

    let file = fp.file.QueryInterface(Ci.nsIFile);
    let currentDirPref = document.getElementById("browser.download.downloadDir");
    customDirPref.value = currentDirPref.value = file;
    let folderListPref = document.getElementById("browser.download.folderList");
    folderListPref.value = await this._fileToIndex(file);
  },

  onReadUseDownloadDir() {
    this.readDownloadDirPref();
    var downloadFolder = document.getElementById("downloadFolder");
    var chooseFolder = document.getElementById("chooseFolder");
    var preference = document.getElementById("browser.download.useDownloadDir");
    downloadFolder.disabled = !preference.value;
    chooseFolder.disabled = !preference.value;
    return undefined;
  },

  async _fileToIndex(aFile) {
    if (!aFile || aFile.equals(await this._getDownloadsFolder("Desktop")))
      return 0;
    else if (aFile.equals(await this._getDownloadsFolder("Downloads")))
      return 1;
    return 2;
  },

  async _indexToFile(aIndex) {
    switch (aIndex) {
    case 0:
      return this._getDownloadsFolder("Desktop");
    case 1:
      return this._getDownloadsFolder("Downloads");
    }
    var customDirPref = document.getElementById("browser.download.dir");
    return customDirPref.value;
  },

  async _getDownloadsFolder(aFolder) {
    switch (aFolder) {
      case "Desktop":
        return Services.dirsvc.get("Desk", Ci.nsIFile);
      case "Downloads":
        let downloadsDir = await Downloads.getSystemDownloadsDirectory();
        return new FileUtils.File(downloadsDir);
    }
    throw new Error("ASSERTION FAILED: folder type should be 'Desktop' or 'Downloads'");
  },

  async readDownloadDirPref() {
    var folderListPref = document.getElementById("browser.download.folderList");
    var bundlePreferences = document.getElementById("bundlePreferences");
    var downloadFolder = document.getElementById("downloadFolder");

    var customDirPref = document.getElementById("browser.download.dir");
    var customIndex = customDirPref.value ? await this._fileToIndex(customDirPref.value) : 0;
    if (customIndex == 0)
      downloadFolder.value = bundlePreferences.getString("desktopFolderName");
    else if (customIndex == 1)
      downloadFolder.value = bundlePreferences.getString("myDownloadsFolderName");
    else
      downloadFolder.value = customDirPref.value ? customDirPref.value.path : "";

    var currentDirPref = document.getElementById("browser.download.downloadDir");
    var downloadDir = currentDirPref.value || await this._indexToFile(folderListPref.value);
    let urlSpec = Services.io.getProtocolHandler("file")
      .QueryInterface(Ci.nsIFileProtocolHandler)
      .getURLSpecFromFile(downloadDir);

    downloadFolder.style.backgroundImage = "url(moz-icon://" + urlSpec + "?size=16)";

    return undefined;
  },

  async writeFolderList() {
    var currentDirPref = document.getElementById("browser.download.downloadDir");
    return await this._fileToIndex(currentDirPref.value);
  },
};
