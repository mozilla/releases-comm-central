/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  PluralForm: "resource://gre/modules/PluralForm.jsm",
  Downloads: "resource://gre/modules/Downloads.jsm",
  DownloadsCommon: "resource:///modules/DownloadsCommon.jsm",
  PlacesUtils: "resource://gre/modules/PlacesUtils.jsm",
  FileUtils: "resource://gre/modules/FileUtils.jsm",
});

var gDownloadTree;
var gDownloadTreeView;
var gDownloadList;
var gDownloadStatus;
var gDownloadListener;
var gSearchBox;

function dmStartup()
{
  Downloads.getList(Downloads.PUBLIC).then(dmAsyncStartup);
}

function dmAsyncStartup(aList)
{
  gDownloadList = aList;

  gDownloadTree = document.getElementById("downloadTree");
  gDownloadStatus = document.getElementById("statusbar-display");
  gSearchBox = document.getElementById("search-box");

  // Insert as first controller on the whole window
  window.controllers.insertControllerAt(0, dlTreeController);

  // We need to keep the view object around globally to access "local"
  // non-nsITreeView methods
  gDownloadTreeView = new DownloadTreeView();
  gDownloadTree.view = gDownloadTreeView;

  // The DownloadProgressListener (DownloadProgressListener.js) handles
  // progress notifications.
  gDownloadListener = new DownloadProgressListener();
  gDownloadList.addView(gDownloadListener);

  // correct keybinding command attributes which don't do our business yet
  var key = document.getElementById("key_delete");
  if (key.hasAttribute("command"))
    key.setAttribute("command", "cmd_stop");
  key = document.getElementById("key_delete2");
  if (key.hasAttribute("command"))
    key.setAttribute("command", "cmd_stop");

  gDownloadTree.focus();

  if (gDownloadTree.view.rowCount > 0)
    gDownloadTree.view.selection.select(0);
}

function dmShutdown()
{
  gDownloadList.removeView(gDownloadListener);
  window.controllers.removeController(dlTreeController);
}

function searchDownloads(aInput)
{
  gDownloadTreeView.searchView(aInput);
}

function sortDownloads(aEventTarget)
{
  var column = aEventTarget;
  var colID = column.id;
  var sortDirection = null;

  // If the target is a menuitem, handle it and forward to a column
  if (/^menu_SortBy/.test(colID)) {
    colID = colID.replace(/^menu_SortBy/, "");
    column = document.getElementById(colID);
    var sortedColumn = gDownloadTree.columns.getSortedColumn();
    if (sortedColumn && sortedColumn.id == colID)
      sortDirection = sortedColumn.element.getAttribute("sortDirection");
    else
      sortDirection = "ascending";
  }
  else if (colID == "menu_Unsorted") {
    // calling .sortView() with an "unsorted" colID returns us to original order
    colID = "unsorted";
    column = null;
    sortDirection = "ascending";
  }
  else if (colID == "menu_SortAscending" || colID == "menu_SortDescending") {
    sortDirection = colID.replace(/^menu_Sort/, "").toLowerCase();
    var sortedColumn = gDownloadTree.columns.getSortedColumn();
    if (sortedColumn) {
      colID = sortedColumn.id;
      column = sortedColumn.element;
    }
  }

  // Abort if this is still no column
  if (column && column.localName != "treecol")
    return;

  // Abort on cyler columns, we don't sort them
  if (column && column.getAttribute("cycler") == "true")
    return;

  if (!sortDirection) {
    // If not set above already, toggle the current direction
    sortDirection = column.getAttribute("sortDirection") == "ascending" ?
                    "descending" : "ascending";
  }

  // Clear attributes on all columns, we're setting them again after sorting
  for (let node = document.getElementById("Name"); node; node = node.nextSibling) {
    node.removeAttribute("sortActive");
    node.removeAttribute("sortDirection");
  }

  // Actually sort the tree view
  gDownloadTreeView.sortView(colID, sortDirection);

  if (column) {
    // Set attributes to the sorting we did
    column.setAttribute("sortActive", "true");
    column.setAttribute("sortDirection", sortDirection);
  }
}

async function removeDownload(aDownload)
{
  // Remove the associated history element first, if any, so that the views
  // that combine history and session downloads won't resurrect the history
  // download into the view just before it is deleted permanently.
  try {
    await PlacesUtils.history.remove(aDownload.source.url);
  } catch (ex) {
    Cu.reportError(ex);
  }
  let list = await Downloads.getList(Downloads.ALL);
  await list.remove(aDownload);
  await aDownload.finalize(true);
}

function cancelDownload(aDownload)
{
  // This is the correct way to avoid race conditions when cancelling.
  aDownload.cancel().catch(() => {});
  aDownload.removePartialData().catch(Cu.reportError);
}

function openDownload(aDownload)
{
  let file = new FileUtils.File(aDownload.target.path);
  DownloadsCommon.openDownloadedFile(file, null, window);
}

function showDownload(aDownload)
{
  let file;

  if (aDownload.succeeded &&
      aDownload.target.exists) {
    file = new FileUtils.File(aDownload.target.path);
  } else {
    file = new FileUtils.File(aDownload.target.partFilePath);
  }
  DownloadsCommon.showDownloadedFile(file);
}

function showProperties(aDownload)
{
  openDialog("chrome://communicator/content/downloads/progressDialog.xul",
             null, "chrome,titlebar,centerscreen,minimizable=yes,dialog=no",
             { wrappedJSObject: aDownload }, true);
}

function onTreeSelect(aEvent)
{
  var selectionCount = gDownloadTreeView.selection.count;
  if (selectionCount == 1) {
    var selItemData = gDownloadTreeView.getRowData(gDownloadTree.currentIndex);
    gDownloadStatus.label = selItemData.target.path;
  } else {
    gDownloadStatus.label = "";
  }

  window.updateCommands("tree-select");
}

function onUpdateViewColumns(aMenuItem)
{
  while (aMenuItem) {
    // Each menuitem should be checked if its column is not hidden.
    var colID = aMenuItem.id.replace(/^menu_Toggle/, "");
    var column = document.getElementById(colID);
    aMenuItem.setAttribute("checked", !column.hidden);
    aMenuItem = aMenuItem.nextSibling;
  }
}

function toggleColumn(aMenuItem)
{
  var colID = aMenuItem.id.replace(/^menu_Toggle/, "");
  var column = document.getElementById(colID);
  column.setAttribute("hidden", !column.hidden);
}

function onUpdateViewSort(aMenuItem)
{
  var unsorted = true;
  var ascending = true;
  while (aMenuItem) {
    switch (aMenuItem.id) {
      case "": // separator
        break;
      case "menu_Unsorted":
        if (unsorted) // this would work even if Unsorted was last
          aMenuItem.setAttribute("checked", "true");
        break;
      case "menu_SortAscending":
        aMenuItem.setAttribute("disabled", unsorted);
        if (!unsorted && ascending)
          aMenuItem.setAttribute("checked", "true");
        break;
      case "menu_SortDescending":
        aMenuItem.setAttribute("disabled", unsorted);
        if (!unsorted && !ascending)
          aMenuItem.setAttribute("checked", "true");
        break;
      default:
        var colID = aMenuItem.id.replace(/^menu_SortBy/, "");
        var column = document.getElementById(colID);
        var direction = column.getAttribute("sortDirection");
        if (column.getAttribute("sortActive") == "true" && direction) {
          // We've found a sorted column. Remember its direction.
          ascending = direction == "ascending";
          unsorted = false;
          aMenuItem.setAttribute("checked", "true");
        }
    }
    aMenuItem = aMenuItem.nextSibling;
  }
}

// This is called by the progress listener.
var gLastComputedMean = -1;
var gLastActiveDownloads = 0;
function onUpdateProgress()
{
  var dls = gDownloadTreeView.getActiveDownloads();
  var numActiveDownloads = dls.length;

  // Use the default title and reset "last" values if there's no downloads
  if (numActiveDownloads == 0) {
    document.title = document.documentElement.getAttribute("statictitle");
    gLastComputedMean = -1;
    gLastActiveDownloads = 0;

    return;
  }

  // Establish the mean transfer speed and amount downloaded.
  var mean = 0;
  var base = 0;
  for (var dl of dls) {
    if (dl.totalBytes > 0) {
      mean += dl.currentBytes;
      base += dl.totalBytes;
    }
  }

  // Calculate the percent transferred, unless we don't have a total file size
  var dlbundle = document.getElementById("dmBundle");
  if (base != 0)
    mean = Math.floor((mean / base) * 100);

  // Update title of window
  if (mean != gLastComputedMean || gLastActiveDownloads != numActiveDownloads) {
    gLastComputedMean = mean;
    gLastActiveDownloads = numActiveDownloads;

    var title;
    if (base == 0)
      title = dlbundle.getFormattedString("downloadsTitleFiles",
                                          [numActiveDownloads]);
    else
      title = dlbundle.getFormattedString("downloadsTitlePercent",
                                          [numActiveDownloads, mean]);

    // Get the correct plural form and insert number of downloads and percent
    title = PluralForm.get(numActiveDownloads, title);

    document.title = title;
  }
}

function handlePaste() {
  let trans = Cc["@mozilla.org/widget/transferable;1"]
                .createInstance(Ci.nsITransferable);
  trans.init(null);

  let flavors = ["text/x-moz-url", "text/unicode"];
  flavors.forEach(trans.addDataFlavor);

  Services.clipboard.getData(trans, Services.clipboard.kGlobalClipboard);

  // Getting the data or creating the nsIURI might fail
  try {
    let data = {};
    trans.getAnyTransferData({}, data, {});
    let [url, name] = data.value.QueryInterface(Ci
                                .nsISupportsString).data.split("\n");

    if (!url)
      return;

    DownloadURL(url, name || url, document);
  } catch (ex) {}
}

var dlTreeController = {
  supportsCommand: function(aCommand)
  {
    switch (aCommand) {
      case "cmd_play":
      case "cmd_pause":
      case "cmd_resume":
      case "cmd_retry":
      case "cmd_cancel":
      case "cmd_remove":
      case "cmd_stop":
      case "cmd_open":
      case "cmd_show":
      case "cmd_openReferrer":
      case "cmd_copyLocation":
      case "cmd_properties":
      case "cmd_paste":
      case "cmd_selectAll":
      case "cmd_clearList":
        return true;
    }
    return false;
  },

  isCommandEnabled: function(aCommand)
  {
    var selectionCount = 0;
    if (gDownloadTreeView && gDownloadTreeView.selection)
      selectionCount = gDownloadTreeView.selection.count;

    var selItemData = [];
    if (selectionCount) {
      // walk all selected rows
      let start = {};
      let end = {};
      let numRanges = gDownloadTreeView.selection.getRangeCount();
      for (let rg = 0; rg < numRanges; rg++) {
        gDownloadTreeView.selection.getRangeAt(rg, start, end);
        for (let row = start.value; row <= end.value; row++)
          selItemData.push(gDownloadTreeView.getRowData(row));
      }
    }

    switch (aCommand) {
      case "cmd_play":
        if (!selectionCount)
          return false;
        for (let dldata of selItemData) {
          if (dldata.succeeded || (!dldata.stopped && !dldata.hasPartialData))
            return false;
        }
        return true;
      case "cmd_pause":
        if (!selectionCount)
          return false;
        for (let dldata of selItemData) {
          if (dldata.stopped || !dldata.hasPartialData)
            return false;
        }
        return true;
      case "cmd_resume":
        if (!selectionCount)
          return false;
        for (let dldata of selItemData) {
          if (!dldata.stopped || !dldata.hasPartialData)
            return false;
        }
        return true;
      case "cmd_open":
        return selectionCount == 1 &&
               selItemData[0].succeeded &&
               selItemData[0].target.exists;
      case "cmd_show":
        // target.exists is only set if the download finished and the target
        // is still located there.
        // For simplicity we just assume the target is there if the download
        // has not succeeded e.g. is still in progress. This might be wrong
        // but showDownload will deal with it.
        return selectionCount == 1 &&
               ((selItemData[0].succeeded &&
                 selItemData[0].target.exists) ||
                 !selItemData[0].succeeded);
      case "cmd_cancel":
        if (!selectionCount)
          return false;
        for (let dldata of selItemData) {
          if (dldata.stopped && !dldata.hasPartialData)
            return false;
        }
        return true;
      case "cmd_retry":
        if (!selectionCount)
          return false;
        for (let dldata of selItemData) {
          if (dldata.succeeded || !dldata.stopped || dldata.hasPartialData)
            return false;
        }
        return true;
      case "cmd_remove":
        if (!selectionCount)
          return false;
        for (let dldata of selItemData) {
          if (!dldata.stopped)
            return false;
        }
        return true;
      case "cmd_openReferrer":
        return selectionCount == 1 && !!selItemData[0].source.referrer;
      case "cmd_stop":
      case "cmd_copyLocation":
        return selectionCount > 0;
      case "cmd_properties":
        return selectionCount == 1;
      case "cmd_selectAll":
        return gDownloadTreeView.rowCount != selectionCount;
      case "cmd_clearList":
        // Since active downloads always sort before removable downloads,
        // we only need to check that the last download has stopped.
        return gDownloadTreeView.rowCount &&
               !gDownloadTreeView.getRowData(gDownloadTreeView.rowCount - 1).isActive;
      case "cmd_paste":
        return true;
      default:
        return false;
    }
  },

  doCommand: function(aCommand) {
    var selectionCount = 0;
    if (gDownloadTreeView && gDownloadTreeView.selection)
      selectionCount = gDownloadTreeView.selection.count;

    var selItemData = [];
    if (selectionCount) {
      // walk all selected rows
      let start = {};
      let end = {};
      let numRanges = gDownloadTreeView.selection.getRangeCount();
      for (let rg = 0; rg < numRanges; rg++) {
        gDownloadTreeView.selection.getRangeAt(rg, start, end);
        for (let row = start.value; row <= end.value; row++)
          selItemData.push(gDownloadTreeView.getRowData(row));
      }
    }

    switch (aCommand) {
      case "cmd_play":
        for (let dldata of selItemData) {
          if (!dldata.stopped)
            dldata.cancel();
          else if (!dldata.succeeded)
            dldata.start();
        }
        break;
      case "cmd_pause":
        for (let dldata of selItemData)
          dldata.cancel();
        break;
      case "cmd_resume":
      case "cmd_retry":
        for (let dldata of selItemData) {
         // Errors when retrying are already reported as download failures.
         dldata.start();
        }
        break;
      case "cmd_cancel":
        for (let dldata of selItemData)
          cancelDownload(dldata);
        break;
      case "cmd_remove":
        for (let dldata of selItemData)
          removeDownload(dldata).catch(Cu.reportError);
        break;
      case "cmd_stop":
        for (let dldata of selItemData) {
          if (dldata.isActive)
            cancelDownload(dldata);
          else
            gDownloadList.remove(dldata);
        }
        break;
      case "cmd_open":
        openDownload(selItemData[0]);
        break;
      case "cmd_show":
        showDownload(selItemData[0]);
        break;
      case "cmd_openReferrer":
        openUILink(selItemData[0].source.referrer);
        break;
      case "cmd_copyLocation":
        var clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"]
                          .getService(Ci.nsIClipboardHelper);
        var uris = [];
        for (let dldata of selItemData)
          uris.push(dldata.source.url);
          clipboard.copyString(uris.join("\n"), document);
        break;
      case "cmd_properties":
        showProperties(selItemData[0]);
        break;
      case "cmd_selectAll":
        gDownloadTreeView.selection.selectAll();
        break;
      case "cmd_clearList":
        // Remove each download starting from the end until we hit a download
        // that is in progress
        for (let idx = gDownloadTreeView.rowCount - 1; idx >= 0; idx--) {
          let dldata = gDownloadTreeView.getRowData(idx);
          if (!dldata.isActive) {
            gDownloadList.remove(dldata);
          }
        }

        if (!gSearchBox.value)
          break;

        // Clear the input as if the user did it and move focus to the list
        gSearchBox.value = "";
        searchDownloads("");
        gDownloadTree.focus();
        break;
      case "cmd_paste":
        handlePaste();
        break;
    }
  },

  onEvent: function(aEvent){
    switch (aEvent) {
    case "tree-select":
      this.onCommandUpdate();
    }
  },

  onCommandUpdate: function() {
    var cmds = ["cmd_play", "cmd_pause", "cmd_resume", "cmd_retry",
                "cmd_cancel", "cmd_remove", "cmd_stop", "cmd_open", "cmd_show",
                "cmd_openReferrer", "cmd_copyLocation", "cmd_properties",
                "cmd_selectAll", "cmd_clearList"];
    for (let command in cmds)
      goUpdateCommand(cmds[command]);
  }
};

var gDownloadDNDObserver = {
  onDragStart: function (aEvent)
  {
    if (!gDownloadTreeView ||
        !gDownloadTreeView.selection ||
        !gDownloadTreeView.selection.count)
      return;

    var selItemData = gDownloadTreeView.getRowData(gDownloadTree.currentIndex);
    var file = new FileUtils.File(selItemData.target.path);

    if (!file.exists())
      return;

    var url = Services.io.newFileURI(file).spec;
    var dt = aEvent.dataTransfer;
    dt.mozSetDataAt("application/x-moz-file", file, 0);
    dt.setData("text/uri-list", url + "\r\n");
    dt.setData("text/plain", url + "\n");
    dt.effectAllowed = "copyMove";
    if (gDownloadTreeView.selection.count == 1)
      dt.setDragImage(gDownloadStatus, 16, 16);
  },

  onDragOver: function (aEvent)
  {
    if (disallowDrop(aEvent))
      return;

    var types = aEvent.dataTransfer.types;
    if (types.includes("text/uri-list") ||
        types.includes("text/x-moz-url") ||
        types.includes("text/plain"))
      aEvent.preventDefault();
    aEvent.stopPropagation();
  },

  onDrop: function(aEvent)
  {
    if (disallowDrop(aEvent))
      return;

    var dt = aEvent.dataTransfer;
    var url = dt.getData("URL");
    var name;
    if (!url) {
      url = dt.getData("text/x-moz-url") || dt.getData("text/plain");
      [url, name] = url.split("\n");
    }
    if (url) {
      let doc = dt.mozSourceNode ? dt.mozSourceNode.ownerDocument : document;
      saveURL(url, name || url, null, true, true, null, doc);
    }
  }
};

function disallowDrop(aEvent)
{
  var dt = aEvent.dataTransfer;
  var file = dt.mozGetDataAt("application/x-moz-file", 0);
  // If this is a local file, Don't try to download it again.
  return file && file instanceof Ci.nsIFile;
}
