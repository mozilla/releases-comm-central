/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
ChromeUtils.import("resource://gre/modules/DownloadUtils.jsm");

const nsITreeView = Ci.nsITreeView;
// const nsIDownloadManager is already defined in downloadmanager.js

function DownloadTreeView() {
  this._dlList = [];
  this._searchTerms = [];
}

DownloadTreeView.prototype = {
  QueryInterface: XPCOMUtils.generateQI([nsITreeView]),

  // ***** nsITreeView attributes and methods *****
  get rowCount() {
    return this._dlList.length;
  },

  selection: null,

  getRowProperties: function(aRow) {
    var dl = this._dlList[aRow];
    // (in)active
    var properties = dl.isActive ? "active": "inactive";
    // resumable
    if (dl.hasPartialData)
      properties += " resumable";
    // Download states
    switch (dl.state) {
      case nsIDownloadManager.DOWNLOAD_PAUSED:
        properties += " paused";
        break;
      case nsIDownloadManager.DOWNLOAD_DOWNLOADING:
        properties += " downloading";
        break;
      case nsIDownloadManager.DOWNLOAD_FINISHED:
        properties += " finished";
        break;
      case nsIDownloadManager.DOWNLOAD_FAILED:
        properties += " failed";
        break;
      case nsIDownloadManager.DOWNLOAD_CANCELED:
        properties += " canceled";
        break;
      case nsIDownloadManager.DOWNLOAD_BLOCKED_PARENTAL: // Parental Controls
      case nsIDownloadManager.DOWNLOAD_BLOCKED_POLICY:   // Security Zone Policy
      case nsIDownloadManager.DOWNLOAD_DIRTY:            // possible virus/spyware
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
    return nsITreeView.PROGRESS_NONE;
  },

  getCellValue: function(aRow, aColumn) {
    if (aColumn.id == "Progress")
      return this._dlList[aRow].progress;
    return "";
  },

  getCellText: function(aRow, aColumn) {
    var dl = this._dlList[aRow];
    switch (aColumn.id) {
      case "Name":
        return dl.displayName;
      case "Status":
        switch (dl.state) {
          case nsIDownloadManager.DOWNLOAD_PAUSED:
            return this._dlbundle.getString("paused");
          case nsIDownloadManager.DOWNLOAD_DOWNLOADING:
            return this._dlbundle.getString("downloading");
          case nsIDownloadManager.DOWNLOAD_FINISHED:
            return this._dlbundle.getString("finished");
          case nsIDownloadManager.DOWNLOAD_FAILED:
            return this._dlbundle.getString("failed");
          case nsIDownloadManager.DOWNLOAD_CANCELED:
            return this._dlbundle.getString("canceled");
          case nsIDownloadManager.DOWNLOAD_BLOCKED_PARENTAL: // Parental Controls
          case nsIDownloadManager.DOWNLOAD_BLOCKED_POLICY:   // Security Zone Policy
          case nsIDownloadManager.DOWNLOAD_DIRTY:            // possible virus/spyware
            return this._dlbundle.getString("blocked");
        }
        return this._dlbundle.getString("notStarted");
      case "Progress":
        if (dl.isActive)
          return dl.progress;
        switch (dl.state) {
          case nsIDownloadManager.DOWNLOAD_FINISHED:
            return this._dlbundle.getString("finished");
          case nsIDownloadManager.DOWNLOAD_FAILED:
            return this._dlbundle.getString("failed");
          case nsIDownloadManager.DOWNLOAD_CANCELED:
            return this._dlbundle.getString("canceled");
          case nsIDownloadManager.DOWNLOAD_BLOCKED_PARENTAL: // Parental Controls
          case nsIDownloadManager.DOWNLOAD_BLOCKED_POLICY:   // Security Zone Policy
          case nsIDownloadManager.DOWNLOAD_DIRTY:            // possible virus/spyware
            return this._dlbundle.getString("blocked");
        }
        return this._dlbundle.getString("notStarted");
      case "ProgressPercent":
        return dl.succeeded ? 100 : dl.progress;
      case "TimeRemaining":
        if (!dl.stopped) {
          var lastSec = (dl.lastSec == null) ? Infinity : dl.lastSec;
          // Calculate the time remaining if we have valid values
          var seconds = (dl.speed > 0) && (dl.totalBytes > 0)
                        ? (dl.totalBytes - dl.currentBytes) / dl.speed
                        : -1;
          var [timeLeft, newLast] = DownloadUtils.getTimeLeft(seconds, lastSec);
          this._dlList[aRow].lastSec = newLast;
          return timeLeft;
        }
        return "";
      case "Transferred":
        if (dl.succeeded)
          return DownloadUtils.getTransferTotal(dl.totalBytes, -1);
        if (dl.stopped && !dl.currentBytes)
          return "";
        return DownloadUtils.getTransferTotal(dl.currentBytes, dl.totalBytes);
      case "TransferRate":
        switch (dl.state) {
          case nsIDownloadManager.DOWNLOAD_DOWNLOADING:
            var [rate, unit] = DownloadUtils.convertByteUnits(dl.speed);
            return this._dlbundle.getFormattedString("speedFormat", [rate, unit]);
          case nsIDownloadManager.DOWNLOAD_PAUSED:
            return this._dlbundle.getString("paused");
          case nsIDownloadManager.DOWNLOAD_NOTSTARTED:
          case nsIDownloadManager.DOWNLOAD_QUEUED:
            return this._dlbundle.getString("notStarted");
        }
        return "";
      case "TimeElapsed":
        if (dl.endTime && dl.startTime && (dl.endTime > dl.startTime)) {
          var seconds = (dl.endTime - dl.startTime) / 1000;
          var [time1, unit1, time2, unit2] =
            DownloadUtils.convertTimeUnits(seconds);
          if (seconds < 3600 || time2 == 0)
            return this._dlbundle.getFormattedString("timeSingle", [time1, unit1]);
          return this._dlbundle.getFormattedString("timeDouble", [time1, unit1, time2, unit2]);
        }
        return "";
      case "StartTime":
        if (dl.startTime)
          return this._convertTimeToString(dl.startTime);
        return "";
      case "EndTime":
        if (dl.endTime)
          return this._convertTimeToString(dl.endTime);
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
  performAction: function(aAction) { },
  performActionOnRow: function(aAction, aRow) { },
  performActionOnCell: function(aAction, aRow, aColumn) { },

  // ***** local public methods *****

  addDownload: function(aDownload) {
    aDownload.progressMode = nsITreeView.PROGRESS_NONE;
    aDownload.lastSec = Infinity;
    switch (aDownload.state) {
      case nsIDownloadManager.DOWNLOAD_DOWNLOADING:
        aDownload.endTime = Date.now();
        // At this point, we know if we are an indeterminate download or not.
        aDownload.progressMode = aDownload.hasProgress ?
                                               nsITreeView.PROGRESS_UNDETERMINED :
                                               nsITreeView.PROGRESS_NORMAL;
      case nsIDownloadManager.DOWNLOAD_NOTSTARTED:
      case nsIDownloadManager.DOWNLOAD_PAUSED:
      case nsIDownloadManager.DOWNLOAD_QUEUED:
      case nsIDownloadManager.DOWNLOAD_SCANNING:
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
    switch (aDownload.state) {
      case nsIDownloadManager.DOWNLOAD_DOWNLOADING:
        // At this point, we know if we are an indeterminate download or not.
        aDownload.progressMode = aDownload.hasProgress ?
          nsITreeView.PROGRESS_NORMAL : nsITreeView.PROGRESS_UNDETERMINED;
      case nsIDownloadManager.DOWNLOAD_NOTSTARTED:
      case nsIDownloadManager.DOWNLOAD_PAUSED:
      case nsIDownloadManager.DOWNLOAD_QUEUED:
      case nsIDownloadManager.DOWNLOAD_SCANNING:
        aDownload.isActive = 1;
        break;
      default:
        aDownload.isActive = 0;
        aDownload.progressMode = nsITreeView.PROGRESS_NONE;
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
          comp_a = a.state;
          comp_b = b.state;
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

    // Walk all selected rows and cache theior download IDs
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

  _convertTimeToString: function(aTime) {
    const MS_PER_MINUTE = 60000;
    const MS_PER_DAY = 86400000;
    let timeMs = aTime / 1000; // PRTime is in microseconds

    // Date is calculated starting from midnight, so the modulo with a day are
    // milliseconds from today's midnight.
    // getTimezoneOffset corrects that based on local time, notice midnight
    // can have a different offset during DST-change days.
    let dateObj = new Date();
    let now = dateObj.getTime() - dateObj.getTimezoneOffset() * MS_PER_MINUTE;
    let midnight = now - (now % MS_PER_DAY);
    midnight += new Date(midnight).getTimezoneOffset() * MS_PER_MINUTE;

    let timeObj = new Date(timeMs);
    return timeMs >= midnight ? this._todayFormatter.format(timeObj)
                              : this._dateFormatter.format(timeObj);
  },

  // We use a different formatter for times within the current day,
  // so we cache both a "today" formatter and a general date formatter.
  __todayFormatter: null,
  get _todayFormatter() {
    if (!this.__todayFormatter) {
      const dtOptions = { timeStyle: "short" };
      this.__todayFormatter = new Services.intl.DateTimeFormat(undefined, dtOptions);
    }
    return this.__todayFormatter;
  },

  __dateFormatter: null,
  get _dateFormatter() {
    if (!this.__dateFormatter) {
      const dtOptions = { dateStyle: "short", timeStyle: "short" };
      this.__dateFormatter = new Services.intl.DateTimeFormat(undefined, dtOptions);
    }
    return this.__dateFormatter;
  },

};
