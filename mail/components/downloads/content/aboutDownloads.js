/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals goUpdateCommand */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  Downloads: "resource://gre/modules/Downloads.sys.mjs",
  DownloadUtils: "resource://gre/modules/DownloadUtils.sys.mjs",
});

window.addEventListener("load", event => {
  DownloadsView.init();
});

var DownloadsView = {
  init() {
    window.controllers.insertControllerAt(0, this);
    this.listElement = document.getElementById("msgDownloadsRichListBox");

    this.items = new Map();

    Downloads.getList(Downloads.ALL)
      .then(list => list.addView(this))
      .catch(console.error);

    window.addEventListener("unload", aEvent => {
      Downloads.getList(Downloads.ALL)
        .then(list => list.removeView(this))
        .catch(console.error);
      window.controllers.removeController(this);
    });
  },

  insertOrMoveItem(aItem) {
    const compare = (a, b) => {
      // active downloads always before stopped downloads
      if (a.stopped != b.stopped) {
        return b.stopped ? -1 : 1;
      }
      // most recent downloads first
      return b.startTime - a.startTime;
    };

    let at = this.listElement.firstElementChild;
    while (at && compare(aItem.download, at.download) > 0) {
      at = at.nextElementSibling;
    }
    this.listElement.insertBefore(aItem.element, at);
  },

  onDownloadAdded(aDownload) {
    const isPurgedFromDisk = download => {
      if (!download.succeeded) {
        return false;
      }
      const targetFile = Cc["@mozilla.org/file/local;1"].createInstance(
        Ci.nsIFile
      );
      targetFile.initWithPath(download.target.path);
      return !targetFile.exists();
    };
    if (isPurgedFromDisk(aDownload)) {
      Downloads.getList(Downloads.ALL).then(list => list.remove(aDownload));
      return;
    }

    const item = new DownloadItem(aDownload);
    this.items.set(aDownload, item);
    this.insertOrMoveItem(item);
  },

  onDownloadChanged(aDownload) {
    const item = this.items.get(aDownload);
    if (!item) {
      console.error("No DownloadItem found for download");
      return;
    }

    if (item.stateChanged) {
      this.insertOrMoveItem(item);
    }

    item.onDownloadChanged();
  },

  onDownloadRemoved(aDownload) {
    const item = this.items.get(aDownload);
    if (!item) {
      console.error("No DownloadItem found for download");
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
      .catch(console.error);
  },

  searchDownloads() {
    const searchString = document
      .getElementById("searchBox")
      .value.toLowerCase();
    for (let i = 0; i < this.listElement.itemCount; i++) {
      const downloadElem = this.listElement.getItemAtIndex(i);
      downloadElem.collapsed = !downloadElem.downloadItem.fileName
        .toLowerCase()
        .includes(searchString);
    }
    this.listElement.clearSelection();
  },

  supportsCommand(aCommand) {
    return (
      this.commands.includes(aCommand) ||
      DownloadItem.prototype.supportsCommand(aCommand)
    );
  },

  isCommandEnabled(aCommand) {
    switch (aCommand) {
      case "msgDownloadsCmd_clearDownloads":
      case "msgDownloadsCmd_searchDownloads":
        // We could disable these if there are no downloads in the list, but
        // updating the commands when new items become available is tricky.
        return true;
    }

    const element = this.listElement.selectedItem;
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

    for (const element of this.listElement.selectedItems) {
      element.downloadItem.doCommand(aCommand);
    }
  },

  onEvent() {},

  updateCommands() {
    this.commands.forEach(goUpdateCommand);
    DownloadItem.prototype.commands.forEach(goUpdateCommand);
  },

  commands: [
    "msgDownloadsCmd_clearDownloads",
    "msgDownloadsCmd_searchDownloads",
  ],
};

function DownloadItem(aDownload) {
  this._download = aDownload;
  this._updateFromDownload();

  if (aDownload._unknownProperties && aDownload._unknownProperties.sender) {
    this._sender = aDownload._unknownProperties.sender;
  } else {
    this._sender = "";
  }
  this._fileName = this._htmlEscape(PathUtils.filename(aDownload.target.path));
  this._iconUrl = "moz-icon://" + this._fileName + "?size=32";
  this._startDate = this._htmlEscape(
    DownloadUtils.getReadableDates(aDownload.startTime)[0]
  );
  this._filePath = aDownload.target.path;
}

var kDownloadStatePropertyNames = [
  "stopped",
  "succeeded",
  "canceled",
  "error",
  "startTime",
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
    for (const name of kDownloadStatePropertyNames) {
      this._state[name] = this._download[name];
    }
  },

  get stateChanged() {
    for (const name of kDownloadStatePropertyNames) {
      if (this._state[name] != this._download[name]) {
        return true;
      }
    }
    return false;
  },

  get download() {
    return this._download;
  },

  get element() {
    if (!this._element) {
      this._element = this.createXULElement();
    }

    return this._element;
  },

  createXULElement() {
    const element = document.createXULElement("richlistitem");
    element.classList.add("download");
    element.setAttribute("align", "center");

    const image = document.createElement("img");
    image.setAttribute("alt", "");
    // Allow the given src to be invalid.
    image.classList.add("fileTypeIcon", "invisible-on-broken");

    const vbox = document.createXULElement("vbox");
    vbox.setAttribute("pack", "center");
    vbox.setAttribute("flex", "1");

    const hbox = document.createXULElement("hbox");
    const hbox2 = document.createXULElement("hbox");

    const sender = document.createXULElement("description");
    sender.classList.add("sender");

    const fileName = document.createXULElement("description");
    fileName.setAttribute("crop", "center");
    fileName.classList.add("fileName");

    const size = document.createXULElement("description");
    size.classList.add("size");

    const startDate = document.createXULElement("description");
    startDate.setAttribute("crop", "end");
    startDate.classList.add("startDate");

    hbox.appendChild(fileName);
    hbox.appendChild(size);
    hbox2.appendChild(sender);
    hbox2.appendChild(startDate);

    vbox.appendChild(hbox);
    vbox.appendChild(hbox2);

    const vbox2 = document.createXULElement("vbox");

    const downloadButton = document.createXULElement("button");
    downloadButton.classList.add("downloadButton", "downloadIconShow");

    vbox2.appendChild(downloadButton);

    element.appendChild(image);
    element.appendChild(vbox2);
    element.appendChild(vbox);

    // launch the download if double clicked
    vbox.addEventListener("dblclick", aEvent => this.launch());

    // Show the downloaded file in folder if the folder icon is clicked.
    downloadButton.addEventListener("click", aEvent => this.show());

    // set download as an expando property for the context menu
    element.download = this.download;
    element.downloadItem = this;

    this.updateElement(element);

    return element;
  },

  updateElement(element) {
    const fileTypeIcon = element.querySelector(".fileTypeIcon");
    fileTypeIcon.setAttribute("src", this.iconUrl);

    const size = element.querySelector(".size");
    size.setAttribute("value", this.size);
    size.setAttribute("tooltiptext", this.size);

    const fileName = element.querySelector(".fileName");
    fileName.setAttribute("value", this.fileName);
    fileName.setAttribute("tooltiptext", this.fileName);

    const sender = element.querySelector(".sender");
    sender.setAttribute("value", this.sender);
    sender.setAttribute("tooltiptext", this.sender);

    const startDate = element.querySelector(".startDate");
    startDate.setAttribute("value", this.startDate);
    startDate.setAttribute("tooltiptext", this.startDate);
  },

  launch() {
    if (this.download.succeeded) {
      this.download.launch().catch(console.error);
    }
  },

  remove() {
    Downloads.getList(Downloads.ALL)
      .then(list => list.remove(this.download))
      .then(() => this.download.finalize(true))
      .catch(console.error);
  },

  show() {
    if (this.download.succeeded) {
      const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      file.initWithPath(this._filePath);
      file.reveal();
    }
  },

  onDownloadChanged() {
    this._updateFromDownload();
    this.updateElement(this.element);
  },

  get fileName() {
    return this._fileName;
  },

  get iconUrl() {
    return this._iconUrl;
  },

  get sender() {
    return this._sender;
  },

  get size() {
    let bytes;
    if (this.download.succeeded || this.download.hasProgress) {
      bytes = this.download.target.size;
    } else {
      bytes = this.download.currentBytes;
    }
    return DownloadUtils.convertByteUnits(bytes).join("");
  },

  get startDate() {
    return this._startDate;
  },

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
    "msgDownloadsCmd_show",
  ],
};
