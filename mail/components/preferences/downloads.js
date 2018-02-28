/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var gDownloadDirSection = {
  chooseFolder: function ()
  {
    const nsIFilePicker = Ci.nsIFilePicker;
    var fp = Cc["@mozilla.org/filepicker;1"]
               .createInstance(nsIFilePicker);
    var bundlePreferences = document.getElementById("bundlePreferences");
    var title = bundlePreferences.getString("chooseAttachmentsFolderTitle");
    fp.init(window, title, nsIFilePicker.modeGetFolder);

    const nsIFile = Ci.nsIFile;
    var customDirPref = document.getElementById("browser.download.dir");
    if (customDirPref.value)
      fp.displayDirectory = customDirPref.value;
    fp.appendFilters(nsIFilePicker.filterAll);
    fp.open(rv => {
      if (rv != nsIFilePicker.returnOK || !fp.file) {
        return;
      }

      let file = fp.file.QueryInterface(nsIFile);
      let currentDirPref = document.getElementById("browser.download.downloadDir");
      customDirPref.value = currentDirPref.value = file;
      let folderListPref = document.getElementById("browser.download.folderList");
      folderListPref.value = this._fileToIndex(file);
    });
  },

  onReadUseDownloadDir: function ()
  {
    var downloadFolder = document.getElementById("downloadFolder");
    var chooseFolder = document.getElementById("chooseFolder");
    var preference = document.getElementById("browser.download.useDownloadDir");
    downloadFolder.disabled = !preference.value;
    chooseFolder.disabled = !preference.value;
    return undefined;
  },

  _fileToIndex: function (aFile)
  {
    if (!aFile || aFile.equals(this._getDownloadsFolder("Desktop")))
      return 0;
    else if (aFile.equals(this._getDownloadsFolder("Downloads")))
      return 1;
    return 2;
  },

  _indexToFile: function (aIndex)
  {
    switch (aIndex) {
    case 0:
      return this._getDownloadsFolder("Desktop");
    case 1:
      return this._getDownloadsFolder("Downloads");
    }
    var customDirPref = document.getElementById("browser.download.dir");
    return customDirPref.value;
  },

  _getSpecialFolderKey: function (aFolderType)
  {
    if (aFolderType == "Desktop")
      return "Desk";

    if (aFolderType != "Downloads")
      throw "ASSERTION FAILED: folder type should be 'Desktop' or 'Downloads'";

    if (AppConstants.platform == "win")
      return "Pers";

    if (AppConstants.platform == "macosx")
      return "UsrDocs";

    return "Home";
  },

  _getDownloadsFolder: function (aFolder)
  {
    let dir = Services.dirsvc.get(this._getSpecialFolderKey(aFolder),
                                  Ci.nsIFile);
    if (aFolder != "Desktop")
      dir.append("My Downloads");

    return dir;
  },

  readDownloadDirPref: function ()
  {
    var folderListPref = document.getElementById("browser.download.folderList");
    var bundlePreferences = document.getElementById("bundlePreferences");
    var downloadFolder = document.getElementById("downloadFolder");

    var customDirPref = document.getElementById("browser.download.dir");
    var customIndex = customDirPref.value ? this._fileToIndex(customDirPref.value) : 0;
    if (folderListPref.value == 0 || customIndex == 0)
      downloadFolder.label = bundlePreferences.getString("desktopFolderName");
    else if (folderListPref.value == 1 || customIndex == 1)
      downloadFolder.label = bundlePreferences.getString("myDownloadsFolderName");
    else
      downloadFolder.label = customDirPref.value ? customDirPref.value.path : "";

    var currentDirPref = document.getElementById("browser.download.downloadDir");
    var downloadDir = currentDirPref.value || this._indexToFile(folderListPref.value);
    let urlSpec = Services.io.getProtocolHandler("file")
      .QueryInterface(Ci.nsIFileProtocolHandler)
      .getURLSpecFromFile(downloadDir);

    downloadFolder.image = "moz-icon://" + urlSpec + "?size=16";

    return undefined;
  },

  writeFolderList: function ()
  {
    var currentDirPref = document.getElementById("browser.download.downloadDir");
    return this._fileToIndex(currentDirPref.value);
  }
};
