/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource:///modules/mailServices.js");

var gEditButton;
var gDeleteButton;
var gReorderUpButton;
var gReorderDownButton;
var gRunFiltersFolderPickerLabel;
var gRunFiltersFolderPicker;
var gRunFiltersButton;
var gFilterBundle;
var gFilterListMsgWindow = null;
var gFilterTree;
var gStatusBar;
var gStatusText;
var gCurrentFolder;

var gStatusFeedback = {
	showStatusString: function(status)
  {
    gStatusText.setAttribute("value", status);
  },
	startMeteors: function()
  {
    // change run button to be a stop button
    gRunFiltersButton.setAttribute("label", gRunFiltersButton.getAttribute("stoplabel"));
    gRunFiltersButton.setAttribute("accesskey", gRunFiltersButton.getAttribute("stopaccesskey"));
    gStatusBar.setAttribute("mode", "undetermined");
  },
	stopMeteors: function() 
  {
    try {
      // change run button to be a stop button
      gRunFiltersButton.setAttribute("label", gRunFiltersButton.getAttribute("runlabel"));
      gRunFiltersButton.setAttribute("accesskey", gRunFiltersButton.getAttribute("runaccesskey"));
      gStatusBar.setAttribute("mode", "normal");
    }
    catch (ex) {
      // can get here if closing window when running filters
    }
  },
  showProgress: function(percentage)
  {
  },
  closeWindow: function()
  {
  }
};

var gFilterTreeView = {
  mTree: null,
  get tree() {
    return this.mTree;
  },
  mFilterList: null,
  get filterList() {
    return this.mFilterList;
  },
  set filterList(val) {
    if (this.mTree)
      this.mTree.beginUpdateBatch();
    if (this.selection) {
      this.selection.clearSelection();
      this.selection.currentIndex = -1;
    }
    this.mFilterList = val;
    if (this.mTree) {
      this.mTree.scrollToRow(0);
      this.mTree.endUpdateBatch();
    }
  },
  /* nsITreeView methods */
  get rowCount() {
    return this.mFilterList ? this.mFilterList.filterCount : 0;
  },
  selection: null,
  getRowProperties: function getRowProperties(row) {
    return this.mFilterList.getFilterAt(row).enabled ? "Enabled-true" : "";
  },
  getCellProperties: function getCellProperties(row, col) {
    return this.mFilterList.getFilterAt(row).enabled ? "Enabled-true" : "";
  },
  getColumnProperties: function getColumnProperties(col) { return ""; },
  isContainer: function isContainer(index) { return false; },
  isContainerOpen: function isContainerOpen(index) { return false; },
  isContainerEmpty: function isContainerEmpty(index) { return false; },
  isSeparator: function isSeparator(index) { return false; },
  isSorted: function isSorted() { return false; },
  canDrop: function canDrop(index, orientation) { return false; },
  drop: function drop(index, orientation) {},
  getParentIndex: function getParentIndex(index) { return -1; },
  hasNextSibling: function hasNextSibling(rowIndex, afterIndex) { return false; },
  getLevel: function getLevel(index) { return 0; },
  getImageSrc: function getImageSrc(row, col) { return null; },
  getProgressMode: function getProgressMode(row, col) { return 0; },
  getCellValue: function getCellValue(row, col) { return null; },
  getCellText: function getCellText(row, col) {
    return this.mFilterList.getFilterAt(row).filterName;
  },
  setTree: function setTree(tree) {
    this.mTree = tree;
  },
  toggleOpenState: function toggleOpenState(index) {},
  cycleHeader: function cycleHeader(col) {},
  selectionChanged: function selectionChanged() {},
  cycleCell: function cycleCell(row, col) {
    if (toggleFilter(row))
      this.mTree.invalidateCell(row, col);
  },
  isEditable: function isEditable(row, col) { return false; }, // XXX Fix me!
  isSelectable: function isSelectable(row, col) { return false; },
  setCellValue: function setCellValue(row, col, value) {},
  setCellText: function setCellText(row, col, value) { /* XXX Write me */ },
  performAction: function performAction(action) {},
  performActionOnRow: function performActionOnRow(action, row) {},
  performActionOnCell: function performActionOnCell(action, row, col) {}
}

const nsMsgFilterMotion = Components.interfaces.nsMsgFilterMotion;

function onLoad()
{
    setHelpFileURI("chrome://communicator/locale/help/suitehelp.rdf");
    gFilterListMsgWindow = Components.classes["@mozilla.org/messenger/msgwindow;1"].createInstance(Components.interfaces.nsIMsgWindow);
    gFilterListMsgWindow.domWindow = window; 
    gFilterListMsgWindow.rootDocShell.appType = Components.interfaces.nsIDocShell.APP_TYPE_MAIL;   
    gFilterListMsgWindow.statusFeedback = gStatusFeedback;

    gFilterBundle = document.getElementById("bundle_filter");
    gFilterTree = document.getElementById("filterTree");

    gEditButton = document.getElementById("editButton");
    gDeleteButton = document.getElementById("deleteButton");
    gReorderUpButton = document.getElementById("reorderUpButton");
    gReorderDownButton = document.getElementById("reorderDownButton");
    gRunFiltersFolderPickerLabel = document.getElementById("folderPickerPrefix");
    gRunFiltersFolderPicker = document.getElementById("runFiltersFolder");
    gRunFiltersButton = document.getElementById("runFiltersButton");
    gStatusBar = document.getElementById("statusbar-icon");
    gStatusText = document.getElementById("statusText");

    gFilterTree.view = gFilterTreeView;

    // Get the folder where filters should be defined, if that server
    // can accept filters.
    var firstItem = getFilterFolderForSelection();

    // if the selected server cannot have filters, get the default server
    // if the default server cannot have filters, check all accounts
    // and get a server that can have filters.
    if (!firstItem) {
      var server = getServerThatCanHaveFilters();
      if (server)
        firstItem = server.rootFolder;
    }

    if (firstItem)
      selectFolder(firstItem);
    else
      updateButtons();

    // Focus the list.
    gFilterTree.focus();

    Services.obs.addObserver(onFilterClose,
                             "quit-application-requested", false);

    top.controllers.insertControllerAt(0, gFilterController);
}

/**
 * Called when a user selects a folder in the list, so we can update the
 * filters that are displayed
 *
 * @param aFolder  the nsIMsgFolder that was selected
 */
function onFolderSelect(aFolder)
{
    if (!aFolder || aFolder == gCurrentFolder)
      return;

    // Save the current filters to disk before switching because
    // the dialog may be closed and we'll lose current filters.
    var filterList = currentFilterList();
    if (filterList)
      filterList.saveToDefaultFile();

    selectFolder(aFolder);
}

function CanRunFiltersAfterTheFact(aServer)
{
  // filter after the fact is implement using search
  // so if you can't search, you can't filter after the fact
  return aServer.canSearchMessages;
}

// roots the tree at the specified folder
function setFolder(msgFolder)
{
  if (msgFolder == gCurrentFolder)
    return;

  gCurrentFolder = msgFolder;

  // Calling getFilterList will detect any errors in rules.dat,
  // backup the file, and alert the user
  gFilterTreeView.filterList = msgFolder.getEditableFilterList(gFilterListMsgWindow);

  // Select the first item in the list, if there is one.
  if (gFilterTreeView.rowCount)
    gFilterTreeView.selection.select(0);

  // This will get the deferred to account root folder, if server is deferred.
  // We intentionally do this after setting gCurrentFolder, as we want
  // that to refer to the rootFolder for the actual server, not the
  // deferred-to server, as gCurrentFolder is really a proxy for the
  // server whose filters we are editing. But below here we are managing
  // where the filters will get applied, which is on the deferred-to server.
  msgFolder = msgFolder.server.rootMsgFolder;

  // root the folder picker to this server
  var runMenu = document.getElementById("runFiltersPopup");
  runMenu._teardown();
  runMenu._parentFolder = msgFolder;
  runMenu._ensureInitialized();

  var canFilterAfterTheFact = CanRunFiltersAfterTheFact(msgFolder.server);
  gRunFiltersButton.hidden = !canFilterAfterTheFact;
  gRunFiltersFolderPicker.hidden = !canFilterAfterTheFact;
  gRunFiltersFolderPickerLabel.hidden = !canFilterAfterTheFact;

  if (canFilterAfterTheFact) {
    // Get the first folder for this server. INBOX for
    // IMAP and POP3 accounts and 1st news group for news.
    gRunFiltersFolderPicker.selectedIndex = 0;
    runMenu.selectFolder(getFirstFolder(msgFolder));
  }

  updateButtons();
}

function toggleFilter(index)
{
    var filter = getFilter(index);
    if (filter.unparseable)
    {
      Services.prompt.alert(window, null,
                            gFilterBundle.getString("cannotEnableFilter"));
      return false;
    }
    filter.enabled = !filter.enabled;
    return true;
}

// sets up the menulist and the gFilterTree
function selectFolder(aFolder)
{
  // update the server menu
  var serverMenu = document.getElementById("serverMenuPopup");
  serverMenu.selectFolder(aFolder);
  setFolder(aFolder);
}

function getFilter(index)
{
  return gFilterTreeView.filterList.getFilterAt(index);
}

function currentFilter()
{
  var currentIndex = gFilterTree.currentIndex;
  return currentIndex == -1 ? null : getFilter(currentIndex);
}

function currentFilterList()
{
  return gFilterTreeView.filterList;
}

function onFilterSelect(event)
{
    updateButtons();
}

function onEditFilter() 
{
  var selectedFilter = currentFilter();
  var curFilterList = currentFilterList();
  var args = {filter: selectedFilter, filterList: curFilterList};

  window.openDialog("chrome://messenger/content/FilterEditor.xul", "FilterEditor", "chrome,modal,titlebar,resizable,centerscreen", args);

  // The focus change will cause a repaint of the row updating any name change
}

function onNewFilter(emailAddress)
{
  var curFilterList = currentFilterList();
  var position = Math.max(gFilterTree.currentIndex, 0);
  var args = {filterList: curFilterList,
              filterPosition: position, refresh: false};
  
  window.openDialog("chrome://messenger/content/FilterEditor.xul", "FilterEditor", "chrome,modal,titlebar,resizable,centerscreen", args);

  if (args.refresh)
  {
    gFilterTreeView.tree.rowCountChanged(position, 1);
    gFilterTree.view.selection.select(position);
    gFilterTree.treeBoxObject.ensureRowIsVisible(position);
  }
}

function onDeleteFilter()
{
  var filterList = currentFilterList();
  if (!filterList)
    return;

  var sel = gFilterTree.view.selection;
  var selCount = sel.getRangeCount();
  if (!selCount || 
      Services.prompt.confirmEx(window, null, 
                        gFilterBundle.getString("deleteFilterConfirmation"),
                        Services.prompt.STD_YES_NO_BUTTONS,
                        '', '', '', '', {}))
    return;

  for (var i = selCount - 1; i >= 0; --i) {
    var start = {}, end = {};
    sel.getRangeAt(i, start, end);
    for (var j = end.value; j >= start.value; --j) {
      var curFilter = getFilter(j);
      if (curFilter)
        filterList.removeFilter(curFilter);
    }
    gFilterTreeView.tree.rowCountChanged(start.value, start.value - end.value - 1);
  }
}

function onUp(event)
{
    moveCurrentFilter(nsMsgFilterMotion.up);
}

function onDown(event)
{
    moveCurrentFilter(nsMsgFilterMotion.down);
}

function viewLog()
{
  var filterList = currentFilterList();
  var args = {filterList: filterList};

  window.openDialog("chrome://messenger/content/viewLog.xul", "FilterLog", "chrome,modal,titlebar,resizable,centerscreen", args);
}

function onFilterUnload()
{
  // make sure to save the filter to disk
  var filterList = currentFilterList();
  if (filterList) 
    filterList.saveToDefaultFile();

  Services.obs.removeObserver(onFilterClose, "quit-application-requested");
  top.controllers.removeController(gFilterController);
}

function onFilterClose(aCancelQuit, aTopic, aData)
{
  if (aTopic == "quit-application-requested" &&
      aCancelQuit instanceof Components.interfaces.nsISupportsPRBool &&
      aCancelQuit.data)
    return false;

  if (gRunFiltersButton.getAttribute("label") == gRunFiltersButton.getAttribute("stoplabel")) {
    var promptTitle = gFilterBundle.getString("promptTitle");
    var promptMsg = gFilterBundle.getString("promptMsg");;
    var stopButtonLabel = gFilterBundle.getString("stopButtonLabel");
    var continueButtonLabel = gFilterBundle.getString("continueButtonLabel");

    if (Services.prompt.confirmEx(window, promptTitle, promptMsg,
        (Services.prompt.BUTTON_TITLE_IS_STRING *
         Services.prompt.BUTTON_POS_0) +
        (Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_1),
        continueButtonLabel, stopButtonLabel, null, null, {value:0}) == 0) {
      if (aTopic == "quit-application-requested")
        aCancelQuit.data = true;
      return false;
    }
    gFilterListMsgWindow.StopUrls();
  }

  return true;
}

function runSelectedFilters()
{
  // if run button has "stop" label, do stop.
  if (gRunFiltersButton.getAttribute("label") == gRunFiltersButton.getAttribute("stoplabel")) {
    gFilterListMsgWindow.StopUrls();
    return;
  }
  
  var msgFolder = gRunFiltersFolderPicker._folder || gRunFiltersFolderPicker.selectedItem._folder;
  var filterList = MailServices.filters.getTempFilterList(msgFolder);
  var folders = Components.classes["@mozilla.org/array;1"]
                          .createInstance(Components.interfaces.nsIMutableArray);
  folders.appendElement(msgFolder, false);

  // make sure the tmp filter list uses the real filter list log stream
  filterList.logStream = currentFilterList().logStream;
  filterList.loggingEnabled = currentFilterList().loggingEnabled;
  var index = 0, sel = gFilterTree.view.selection;
  for (var i = 0; i < sel.getRangeCount(); i++) {
    var start = {}, end = {};
    sel.getRangeAt(i, start, end);
    for (var j = start.value; j <= end.value; j++) {
      var curFilter = getFilter(j);
      if (curFilter)
        filterList.insertFilterAt(index++, curFilter);
    }
  }

  MailServices.filters.applyFiltersToFolders(filterList, folders, gFilterListMsgWindow);
}

function moveCurrentFilter(motion)
{
    var filterList = currentFilterList();
    var filter = currentFilter();
    if (!filterList || !filter) 
      return;

    filterList.moveFilter(filter, motion);
    if (motion == nsMsgFilterMotion.up)
      gFilterTree.view.selection.select(gFilterTree.currentIndex - 1);
    else
      gFilterTree.view.selection.select(gFilterTree.currentIndex + 1);

    gFilterTree.treeBoxObject.ensureRowIsVisible(gFilterTree.currentIndex);
}

function updateButtons()
{
    var numFiltersSelected = gFilterTree.view.selection.count;
    var oneFilterSelected = (numFiltersSelected == 1);

    var filter = currentFilter();
    // "edit" only enabled when one filter selected or if we couldn't parse the filter
    gEditButton.disabled = !oneFilterSelected || filter.unparseable;
    
    // "delete" only disabled when no filters are selected
    gDeleteButton.disabled = !numFiltersSelected;

    // we can run multiple filters on a folder
    // so only disable this UI if no filters are selected
    gRunFiltersFolderPickerLabel.disabled = !numFiltersSelected;
    gRunFiltersFolderPicker.disabled = !numFiltersSelected;
    gRunFiltersButton.disabled = !numFiltersSelected;

    // "up" enabled only if one filter selected, and it's not the first
    gReorderUpButton.disabled = !(oneFilterSelected && gFilterTree.currentIndex > 0);
    // "down" enabled only if one filter selected, and it's not the last
    gReorderDownButton.disabled = !(oneFilterSelected && gFilterTree.currentIndex < gFilterTree.view.rowCount-1);
}

/**
 * Given a selected folder, returns the folder where filters should
 *  be defined (the root folder except for news) if the server can
 *  accept filters.
 *
 * @param   nsIMsgFolder aFolder - selected folder, from window args
 * @returns an nsIMsgFolder where the filter is defined
 */
function getFilterFolderForSelection()
{
    var args = window.arguments;
    var selectedFolder = args[0].folder;
  
    if (args && args[0] && selectedFolder)
    {
        var msgFolder = selectedFolder.QueryInterface(Components.interfaces.nsIMsgFolder);
        try
        {
            var rootFolder = msgFolder.server.rootFolder;
            if (rootFolder.isServer)
            {
                var server = rootFolder.server;

                if (server.canHaveFilters)
                    return server.type == "nntp" ? msgFolder : rootFolder;
            }
        }
        catch (ex)
        {
        }
    }

    return null;
}

/**
 * If the selected server cannot have filters, get the default server.
 * If the default server cannot have filters, check all accounts
 * and get a server that can have filters.
 *
 * @returns an nsIMsgIncomingServer
 */
function getServerThatCanHaveFilters()
{
    var defaultIncomingServer = MailServices.accounts.defaultAccount.incomingServer;

    // check to see if default server can have filters
    if (defaultIncomingServer.canHaveFilters)
      return defaultIncomingServer;

    // if it cannot, check all accounts to find a server
    // that can have filters
    var allServers = MailServices.accounts.allServers;
    var numServers = allServers.length;
    for (var index = 0; index < numServers; index++)
    {
        var currentServer =
          allServers.queryElementAt(index, Components.interfaces.nsIMsgIncomingServer);

        if (currentServer.canHaveFilters)
            return currentServer;
    }

    return null;
}

function onFilterDoubleClick(event)
{
    // we only care about button 0 (left click) events
    if (event.button != 0)
      return;

    var cell = gFilterTree.treeBoxObject.getCellAt(event.clientX, event.clientY);
    if (cell.row == -1 || cell.row > gFilterTree.view.rowCount - 1 || event.originalTarget.localName != "treechildren") {
      // double clicking on a non valid row should not open the edit filter dialog
      return;
    }

    // if the cell is in a "cycler" column (the enabled column)
    // don't open the edit filter dialog with the selected filter
    if (!cell.col.cycler)
      onEditFilter();
}

function onFilterTreeKeyPress(event)
{
  if (event.charCode == KeyEvent.DOM_VK_SPACE)
  {
    var rangeCount = gFilterTree.view.selection.getRangeCount();
    for (var i = 0; i < rangeCount; ++i)
    {
      var start = {}, end = {};
      gFilterTree.view.selection.getRangeAt(i, start, end);
      for (var k = start.value; k <= end.value; ++k)
        toggleFilter(k);
    }
    gFilterTree.view.selection.invalidateSelection();
  }
  else switch (event.keyCode)
  {
    case KeyEvent.DOM_VK_DELETE:
      if (!gDeleteButton.disabled)
        onDeleteFilter();
      break;
    case KeyEvent.DOM_VK_RETURN:
      if (!gEditButton.disabled)
        onEditFilter();
      break;
  }
}

function doHelpButton()
{
  openHelp("mail-filters");
}

function onTargetSelect(event)
{
  gRunFiltersFolderPicker._folder = event.target._folder;
  gRunFiltersFolderPicker.menupopup.selectFolder(gRunFiltersFolderPicker._folder);
}

/**
 * For a given server folder, get the first folder. For IMAP
 * and POP it's INBOX and it's the very first group for news accounts.
 */
function getFirstFolder(msgFolder)
{
  // Sanity check.
  if (!msgFolder.isServer)
    return msgFolder;

  try {
    // Choose Folder for feeds.
    if (msgFolder.server.type == "rss")
      return null;

    // Find Inbox for imap and pop
    if (msgFolder.server.type != "nntp")
    {
      const nsMsgFolderFlags = Components.interfaces.nsMsgFolderFlags;
      var inboxFolder = msgFolder.getFolderWithFlags(nsMsgFolderFlags.Inbox);
      if (inboxFolder)
        return inboxFolder;
      else
        // If inbox does not exist then use the server as default.
        return msgFolder;
    }

    // For news, this is the account folder.
    return msgFolder;
  }
  catch (ex) {
    dump(ex + "\n");
  }
  return msgFolder;
}

var gFilterController =
{
  supportsCommand: function(aCommand)
  {
    return aCommand == "cmd_selectAll";
  },

  isCommandEnabled: function(aCommand)
  {
    return aCommand == "cmd_selectAll";
  },

  doCommand: function(aCommand)
  {
    if (aCommand == "cmd_selectAll")
      gFilterTree.view.selection.selectAll();
  },

  onEvent: function(aEvent)
  {
  }
};
