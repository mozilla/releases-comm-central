/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var Cu = Components.utils;
var Cc = Components.classes;
var Ci = Components.interfaces;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "Downloads", "resource://gre/modules/Downloads.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "DownloadUtils", "resource://gre/modules/DownloadUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "OS", "resource://gre/modules/osfile.jsm");

var DownloadsView = {
  init() {
    window.controllers.insertControllerAt(0, this);
    this.listElement = document.getElementById("msgDownloadsRichListBox");

    this.items = new Map();

    Downloads.getList(Downloads.ALL)
             .then(list => list.addView(this))
             .then(null, Cu.reportError);

    window.addEventListener("unload", aEvent => {
      Downloads.getList(Downloads.ALL)
               .then(list => list.removeView(this))
               .then(null, Cu.reportError);
      window.controllers.removeController(this);
    });
  },

  insertOrMoveItem(aItem) {
    let compare = (a, b) => {
      // active downloads always before stopped downloads
      if (a.stopped != b.stopped) {
        return b.stopped ? -1 : 1
      }
      // most recent downloads first
      return b.startTime - a.startTime;
    };

    let at = this.listElement.firstChild;
    while (at && compare(aItem.download, at.download) > 0) {
      at = at.nextElementSibling;
    }
    this.listElement.insertBefore(aItem.element, at);
  },

  onDownloadAdded(aDownload) {
    let isPurgedFromDisk = download => {
      if (!download.succeeded) {
        return false;
      }
      let targetFile = Cc["@mozilla.org/file/local;1"]
                         .createInstance(Ci.nsIFile);
      targetFile.initWithPath(download.target.path);
      return !targetFile.exists();
    }
    if (isPurgedFromDisk(aDownload)) {
      Downloads.getList(Downloads.ALL)
               .then(list => list.remove(aDownload))
      return;
    }

    let item = new DownloadItem(aDownload);
    this.items.set(aDownload, item);
    this.insertOrMoveItem(item);
  },

  onDownloadChanged(aDownload) {
    let item = this.items.get(aDownload);
    if (!item) {
      Cu.reportError("No DownloadItem found for download");
      return;
    }

    if (item.stateChanged) {
      this.insertOrMoveItem(item);
    }

    item.onDownloadChanged();
  },

  onDownloadRemoved(aDownload) {
    let item = this.items.get(aDownload);
    if (!item) {
      Cu.reportError("No DownloadItem found for download");
      return;
    }

    this.items.delete(aDownload);
    this.listElement.removeChild(item.element);
  },

  onDownloadContextMenu() {
    this.updateCommands();
  },

  clearDownloads() {
    Downloads.getList(Downloads.ALL)
             .then(list => list.removeFinished())
             .then(null, Cu.reportError);
  },

  searchDownloads() {
    let searchString = document.getElementById("searchBox").value;
    for (let i = 0; i < this.listElement.itemCount; i++) {
      let downloadElem = this.listElement.getItemAtIndex(i);
      downloadElem.collapsed =
        !downloadElem.downloadItem.fileName.includes(searchString);
    }
    this.listElement.clearSelection();
  },

  supportsCommand(aCommand) {
    return (this.commands.includes(aCommand) ||
            (DownloadItem.prototype.supportsCommand(aCommand)));
  },

  isCommandEnabled(aCommand) {
    switch (aCommand) {
      case "msgDownloadsCmd_clearDownloads":
      case "msgDownloadsCmd_searchDownloads":
        // We could disable these if there are no downloads in the list, but
        // updating the commands when new items become available is tricky.
        return true;
    }

    let element = this.listElement.selectedItem;
    if (element) {
      return element.downloadItem.isCommandEnabled(aCommand);
    }

    return false;
  },

  doCommand(aCommand) {
    switch (aCommand) {
      case "msgDownloadsCmd_clearDownloads":
        this.clearDownloads();
        return;
      case "msgDownloadsCmd_searchDownloads":
        this.searchDownloads();
        return;
    }

    if (this.listElement.selectedCount == 0) {
      return;
    }

    for (let element of this.listElement.selectedItems) {
      element.downloadItem.doCommand(aCommand);
    }
  },

  onEvent() { },

  updateCommands() {
    this.commands.forEach(goUpdateCommand);
    DownloadItem.prototype.commands.forEach(goUpdateCommand);
  },

  commands: [
    "msgDownloadsCmd_clearDownloads",
    "msgDownloadsCmd_searchDownloads"
  ]
};

function DownloadItem(aDownload) {
  this._download = aDownload;
  this._updateFromDownload();

  if (aDownload._unknownProperties && aDownload._unknownProperties.sender) {
    this._sender = aDownload._unknownProperties.sender;
  } else {
    this._sender = "";
  }
  this._fileName = this._htmlEscape(OS.Path.basename(aDownload.target.path));
  this._iconUrl = "moz-icon://" + this._fileName + "?size=32";
  this._startDate = this._htmlEscape(DownloadUtils.getReadableDates(aDownload.startTime)[0]);
  this._filePath = aDownload.target.path;
}

var kDownloadStatePropertyNames = [
  "stopped",
  "succeeded",
  "canceled",
  "error",
  "startTime"
];

DownloadItem.prototype = {
  _htmlEscape(s) {
    s = s.replace(/&/g, "&amp;");
    s = s.replace(/>/g, "&gt;");
    s = s.replace(/</g, "&lt;");
    s = s.replace(/"/g, "&quot;");
    s = s.replace(/'/g, "&apos;");
    return s;
  },

  _updateFromDownload() {
    this._state = {};
    for (let name of kDownloadStatePropertyNames) {
      this._state[name] = this._download[name];
    }
  },

  get stateChanged() {
    for (let name of kDownloadStatePropertyNames) {
      if (this._state[name] != this._download[name]) {
        return true;
      }
    }
    return false;
  },

  get download() { return this._download; },

  get element() {
    if (!this._element) {
      this._element = this.createElement();
    }

    return this._element;
  },

  createElement() {
    let element = document.createElement("richlistitem");
    element.classList.add("download");

    // launch the download if double clicked
    element.addEventListener("dblclick", aEvent => this.launch());

    // set download as an expando property for the context menu
    element.download = this.download;
    element.downloadItem = this;

    this.updateElement(element);

    return element;
  },

  updateElement(aElement) {
    aElement.setAttribute("image", this.iconUrl);
    aElement.setAttribute("size", this.size);
    aElement.setAttribute("displayName", this.fileName);
    aElement.setAttribute("sender", this.sender);
    aElement.setAttribute("startDate", this.startDate);
  },

  launch() {
    if (this.download.succeeded) {
      this.download.launch().then(null, Cu.reportError);
    }
  },

  remove() {
    Downloads.getList(Downloads.ALL)
             .then(list => list.remove(this.download))
             .then(() => this.download.finalize(true))
             .then(null, Cu.reportError);
  },

  show() {
    if (this.download.succeeded) {
      let file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      file.initWithPath(this._filePath);
      file.reveal();
    }
  },

  onDownloadChanged() {
    this._updateFromDownload();
    this.updateElement(this.element);
  },

  get fileName() { return this._fileName; },

  get iconUrl() { return this._iconUrl; },

  get sender() { return this._sender; },

  get size() {
    let bytes;
    if (this.download.succeeded || this.download.hasProgress) {
      bytes = this.download.target.size;
    } else {
      bytes = this.download.currentBytes;
    }
    return DownloadUtils.convertByteUnits(bytes).join("");
  },

  get startDate() { return this._startDate; },

  supportsCommand(aCommand) {
    return this.commands.includes(aCommand);
  },

  isCommandEnabled(aCommand) {
    switch (aCommand) {
      case "msgDownloadsCmd_open":
      case "msgDownloadsCmd_show":
        return this.download.succeeded;
      case "msgDownloadsCmd_remove":
        return true;
    }
    return false;
  },

  doCommand(aCommand) {
    switch (aCommand) {
      case "msgDownloadsCmd_open":
        this.launch();
        break;
      case "msgDownloadsCmd_show":
        this.show();
        break;
      case "msgDownloadsCmd_remove":
        this.remove();
        break;
    }
  },

  commands: [
    "msgDownloadsCmd_remove",
    "msgDownloadsCmd_open",
    "msgDownloadsCmd_show"
  ]
};
