/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  DownloadUtils: "resource://gre/modules/DownloadUtils.jsm",
  DownloadsCommon: "resource:///modules/DownloadsCommon.jsm",
  DownloadHistory: "resource://gre/modules/DownloadHistory.jsm",
});

function DownloadTreeView() {
  this._dlList = [];
  this._searchTerms = [];
  this.dateTimeFormatter =
    new Services.intl.DateTimeFormat(undefined,
                                     {dateStyle: "short",
                                      timeStyle: "long"});
}

DownloadTreeView.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsITreeView]),

  // ***** nsITreeView attributes and methods *****
  get rowCount() {
    return this._dlList.length;
  },

  selection: null,

  getRowProperties: function(aRow) {
    let dl = this._dlList[aRow];
    // (in)active
    let properties = dl.isActive ? "active": "inactive";
    // resumable
    if (dl.hasPartialData)
      properties += " resumable";

    // Download states
    let state = DownloadsCommon.stateOfDownload(dl);
    switch (state) {
      case DownloadsCommon.DOWNLOAD_PAUSED:
        properties += " paused";
        break;
      case DownloadsCommon.DOWNLOAD_DOWNLOADING:
        properties += " downloading";
        break;
      case DownloadsCommon.DOWNLOAD_FINISHED:
        properties += " finished";
        break;
      case DownloadsCommon.DOWNLOAD_FAILED:
        properties += " failed";
        break;
      case DownloadsCommon.DOWNLOAD_CANCELED:
        properties += " canceled";
        break;
      case DownloadsCommon.DOWNLOAD_BLOCKED_PARENTAL: // Parental Controls
      case DownloadsCommon.DOWNLOAD_BLOCKED_POLICY:   // Security Zone Policy
      case DownloadsCommon.DOWNLOAD_DIRTY:            // possible virus/spyware
        properties += " blocked";
        break;
    }

    return properties;
  },
  getCellProperties: function(aRow, aColumn) {
    // Append all row properties to the cell
    return this.getRowProperties(aRow);
  },
  getColumnProperties: function(aColumn) { return ""; },
  isContainer: function(aRow) { return false; },
  isContainerOpen: function(aRow) { return false; },
  isContainerEmpty: function(aRow) { return false; },
  isSeparator: function(aRow) { return false; },
  isSorted: function() { return false; },
  canDrop: function(aIdx, aOrientation) { return false; },
  drop: function(aIdx, aOrientation) { },
  getParentIndex: function(aRow) { return -1; },
  hasNextSibling: function(aRow, aAfterIdx) { return false; },
  getLevel: function(aRow) { return 0; },

  getImageSrc: function(aRow, aColumn) {
    if (aColumn.id == "Name")
      return "moz-icon://" + this._dlList[aRow].target.path + "?size=16";
    return "";
  },

  getProgressMode: function(aRow, aColumn) {
    if (aColumn.id == "Progress")
      return this._dlList[aRow].progressMode;
    return Ci.nsITreeView.PROGRESS_NONE;
  },

  getCellValue: function(aRow, aColumn) {
    if (aColumn.id == "Progress")
      return this._dlList[aRow].progress;
    return "";
  },

  getCellText: function(aRow, aColumn) {
    let dl = this._dlList[aRow];
    switch (aColumn.id) {
      case "Name":
        return dl.displayName;
      case "Status":
        return DownloadsCommon.stateOfDownloadText(dl);
      case "Progress":
        if (dl.isActive)
          return dl.progress;
        return DownloadsCommon.stateOfDownloadText(dl);
      case "ProgressPercent":
        return dl.succeeded ? 100 : dl.progress;
      case "TimeRemaining":
        return DownloadsCommon.getTimeRemaining(dl);
      case "Transferred":
        return DownloadsCommon.getTransferredBytes(dl);
      case "TransferRate":
        let state = DownloadsCommon.stateOfDownload(dl);
        switch (state) {
          case DownloadsCommon.DOWNLOAD_DOWNLOADING:
            let [rate, unit] = DownloadUtils.convertByteUnits(dl.speed);
            return this._dlbundle.getFormattedString("speedFormat", [rate, unit]);
          case DownloadsCommon.DOWNLOAD_PAUSED:
            return this._dlbundle.getString("statePaused");
          case DownloadsCommon.DOWNLOAD_NOTSTARTED:
            return this._dlbundle.getString("stateNotStarted");
        }
        return "";
      case "TimeElapsed":
        // With no end time persisted in the downloads backend this is
        // utterly useless unless the download is progressing.
        if (DownloadsCommon.stateOfDownload(dl) ==
              DownloadsCommon.DOWNLOAD_DOWNLOADING && dl.startTime) {
          let seconds = (Date.now() - dl.startTime) / 1000;
          let [time1, unit1, time2, unit2] =
            DownloadUtils.convertTimeUnits(seconds);
          if (seconds < 3600 || time2 == 0) {
            return this._dlbundle.getFormattedString("timeSingle", [time1, unit1]);
          }
          return this._dlbundle.getFormattedString("timeDouble", [time1, unit1, time2, unit2]);
        }
        return "";
      case "StartTime":
        if (dl.startTime) {
          return this.dateTimeFormatter.format(dl.startTime);
        }
        return "";
      case "EndTime":
        // This might end with an exception if it is an unsupported uri
        // scheme.
        let metaData = DownloadHistory.getPlacesMetaDataFor(dl.source.url);

        if (metaData.endTime) {
          return this.dateTimeFormatter.format(metaData.endTime);
        }
        return "";
      case "Source":
        return dl.source.url;
    }
    return "";
  },

  setTree: function(aTree) {
    this._tree = aTree;
    this._dlbundle = document.getElementById("dmBundle");
  },

  toggleOpenState: function(aRow) { },
  cycleHeader: function(aColumn) { },
  selectionChanged: function() { },
  cycleCell: function(aRow, aColumn) {
    var dl = this._dlList[aRow];
    switch (aColumn.id) {
      case "ActionPlay":
        if (dl.stopped) {
          if (!dl.succeeded)
            dl.start();
        } else {
          if (dl.hasPartialData)
            dl.cancel();
        }
        break;
      case "ActionStop":
        if (dl.isActive)
          cancelDownload(dl);
        else
          removeDownload(dl);
        break;
    }
  },
  isEditable: function(aRow, aColumn) { return false; },
  isSelectable: function(aRow, aColumn) { return false; },
  setCellValue: function(aRow, aColumn, aText) { },
  setCellText: function(aRow, aColumn, aText) { },

  // ***** local public methods *****

  addDownload: function(aDownload) {
    aDownload.progressMode = Ci.nsITreeView.PROGRESS_NONE;
    aDownload.lastSec = Infinity;
    let state = DownloadsCommon.stateOfDownload(aDownload);
    switch (state) {
      case DownloadsCommon.DOWNLOAD_DOWNLOADING:
        aDownload.endTime = Date.now();
        // At this point, we know if we are an indeterminate download or not.
        aDownload.progressMode = aDownload.hasProgress ?
                                               Ci.nsITreeView.PROGRESS_UNDETERMINED :
                                               Ci.nsITreeView.PROGRESS_NORMAL;
      case DownloadsCommon.DOWNLOAD_NOTSTARTED:
      case DownloadsCommon.DOWNLOAD_PAUSED:
        aDownload.isActive = 1;
        break;
      default:
        aDownload.isActive = 0;
        break;
    }

    // prepend in natural sorting
    aDownload.listIndex = this._lastListIndex--;

    // Prepend data to the download list
    this._dlList.unshift(aDownload);

    // Tell the tree we added 1 row at index 0
    this._tree.rowCountChanged(0, 1);

    // Data has changed, so re-sorting might be needed
    this.sortView("", "", aDownload, 0);

    window.updateCommands("tree-select");
  },

  updateDownload: function(aDownload) {
    var row = this._dlList.indexOf(aDownload);
    if (row == -1) {
      // No download row found to update, but as it's obviously going on,
      // add it to the list now (can happen with very fast, e.g. local dls)
      this.onDownloadAdded(aDownload);
      return;
    }
    let state = DownloadsCommon.stateOfDownload(aDownload);
    switch (state) {
      case DownloadsCommon.DOWNLOAD_DOWNLOADING:
        // At this point, we know if we are an indeterminate download or not.
        aDownload.progressMode = aDownload.hasProgress ?
          Ci.nsITreeView.PROGRESS_NORMAL : Ci.nsITreeView.PROGRESS_UNDETERMINED;
      case DownloadsCommon.DOWNLOAD_NOTSTARTED:
      case DownloadsCommon.DOWNLOAD_PAUSED:
        aDownload.isActive = 1;
        break;
      default:
        aDownload.isActive = 0;
        aDownload.progressMode = Ci.nsITreeView.PROGRESS_NONE;
        // This preference may not be set, so defaulting to two.
        var flashCount = 2;
        try {
          flashCount = Services.prefs.getIntPref(PREF_FLASH_COUNT);
        } catch (e) { }
        getAttentionWithCycleCount(flashCount);
        break;
    }

    // Repaint the tree row
    this._tree.invalidateRow(row);

    // Data has changed, so re-sorting might be needed
    this.sortView("", "", aDownload, row);

    window.updateCommands("tree-select");
  },

  removeDownload: function(aDownload) {
    var row = this._dlList.indexOf(aDownload);
    // Make sure we have an item to remove
    if (row == -1)
      return;

    var index = this.selection.currentIndex;
    var wasSingleSelection = this.selection.count == 1;

    // Remove data from the download list
    this._dlList.splice(row, 1);

    // Tell the tree we removed 1 row at the given row index
    this._tree.rowCountChanged(row, -1);

    // Update selection if only removed download was selected
    if (wasSingleSelection && this.selection.count == 0) {
      index = Math.min(index, this.rowCount - 1);
      if (index >= 0)
        this.selection.select(index);
    }

    window.updateCommands("tree-select");
  },

  searchView: function(aInput) {
    // Stringify the previous search
    var prevSearch = this._searchTerms.join(" ");

    // Array of space-separated lower-case search terms
    this._searchTerms = aInput.trim().toLowerCase().split(/\s+/);

    // Don't rebuild the download list if the search didn't change
    if (this._searchTerms.join(" ") == prevSearch)
      return;

    // Cache the current selection
    this._cacheSelection();

    // Rebuild the tree with set search terms
    //this.initTree();

    // Restore the selection
    this._restoreSelection();
  },

  sortView: function(aColumnID, aDirection, aDownload, aRow) {
    var sortAscending = aDirection != "descending";

    if (aColumnID == "" && aDirection == "") {
      // Re-sort in already selected/cached order
      var sortedColumn = this._tree.columns.getSortedColumn();
      if (sortedColumn) {
        aColumnID = sortedColumn.id;
        sortAscending = sortedColumn.element.getAttribute("sortDirection") != "descending";
      }
      // no need for else, use default case of switch, sortAscending is true
    }

    // Compare function for two _dlList items
    var compfunc = function(a, b) {
      // Active downloads are always at the beginning
      // i.e. 0 for .isActive is larger (!) than 1
      if (a.isActive < b.isActive)
        return 1;
      if (a.isActive > b.isActive)
        return -1;
      // Same active/inactive state, sort normally
      var comp_a = null;
      var comp_b = null;
      switch (aColumnID) {
        case "Name":
          comp_a = a.displayName.toLowerCase();
          comp_b = b.displayName.toLowerCase();
          break;
        case "Status":
          comp_a = DownloadsCommon.stateOfDownload(a);
          comp_b = DownloadsCommon.stateOfDownload(b);
          break;
        case "Progress":
        case "ProgressPercent":
          // Use original sorting for inactive entries
          // Use only one isActive to be sure we do the same
          comp_a = a.isActive ? a.progress : a.listIndex;
          comp_b = a.isActive ? b.progress : b.listIndex;
          break;
        case "TimeRemaining":
          comp_a = a.isActive ? a.lastSec : a.listIndex;
          comp_b = a.isActive ? b.lastSec : b.listIndex;
          break;
        case "Transferred":
          comp_a = a.currentBytes;
          comp_b = b.currentBytes;
          break;
        case "TransferRate":
          comp_a = a.isActive ? a.speed : a.listIndex;
          comp_b = a.isActive ? b.speed : b.listIndex;
          break;
        case "TimeElapsed":
          comp_a = (a.endTime && a.startTime && (a.endTime > a.startTime))
                   ? a.endTime - a.startTime
                   : 0;
          comp_b = (b.endTime && b.startTime && (b.endTime > b.startTime))
                   ? b.endTime - b.startTime
                   : 0;
          break;
        case "StartTime":
          comp_a = a.startTime;
          comp_b = b.startTime;
          break;
        case "EndTime":
          comp_a = a.endTime;
          comp_b = b.endTime;
          break;
        case "Source":
          comp_a = a.source.url;
          comp_b = b.source.url;
          break;
        case "unsorted": // Special case for reverting to original order
        default:
          comp_a = a.listIndex;
          comp_b = b.listIndex;
      }
      if (comp_a > comp_b)
        return sortAscending ? 1 : -1;
      if (comp_a < comp_b)
        return sortAscending ? -1 : 1;
      return 0;
    }

    // Cache the current selection
    this._cacheSelection();

    // Do the actual sorting of the array
    this._dlList.sort(compfunc);

    var row = this._dlList.indexOf(aDownload);
    if (row == -1)
      // Repaint the tree
      this._tree.invalidate();
    else if (row == aRow)
      // No effect
      this._selectionCache = null;
    else if (row < aRow)
      // Download moved up from aRow to row
      this._tree.invalidateRange(row, aRow);
    else
      // Download moved down from aRow to row
      this._tree.invalidateRange(aRow, row)

    // Restore the selection
    this._restoreSelection();
  },

  getRowData: function(aRow) {
    return this._dlList[aRow];
  },

  getActiveDownloads: function() {
    return this._dlList.filter(dld => !dld.stopped);
  },

  // ***** local member vars *****

  _tree: null,
  _dlBundle: null,
  _lastListIndex: 0,
  _selectionCache: null,

  // ***** local helper functions *****

  // Cache IDs of selected downloads for later restoration
  _cacheSelection: function() {
    // Abort if there's already something cached
    if (this._selectionCache)
      return;

    this._selectionCache = [];
    if (this.selection.count < 1)
      return;

    // Walk all selected rows and cache their download IDs
    var start = {};
    var end = {};
    var numRanges = this.selection.getRangeCount();
    for (let rg = 0; rg < numRanges; rg++){
      this.selection.getRangeAt(rg, start, end);
      for (let row = start.value; row <= end.value; row++){
        this._selectionCache.push(this._dlList[row]);
      }
    }
  },

  // Restore selection from cached IDs (as possible)
  _restoreSelection: function() {
    // Abort if the cache is empty
    if (!this._selectionCache)
      return;

    this.selection.clearSelection();
    for (let dl of this._selectionCache) {
      // Find out what row this is now and if possible, add it to the selection
      var row = this._dlList.indexOf(dl);
      if (row != -1)
        this.selection.rangedSelect(row, row, true);
    }
    // Work done, clear the cache
    this._selectionCache = null;
  },
};
