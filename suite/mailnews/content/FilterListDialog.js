/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
const {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");

var gEditButton;
var gDeleteButton;
var gNewButton;
var gCopyToNewButton;
var gTopButton;
var gUpButton;
var gDownButton;
var gBottomButton;
var gRunFiltersFolderPrefix;
var gRunFiltersFolder;
var gRunFiltersButton;
var gFilterBundle;
var gFilterListMsgWindow = null;
var gFilterTree;
var gStatusBar;
var gStatusText;
var gServerMenu;

var msgMoveMotion = {
  Up     : 0,
  Down   : 1,
  Top    : 2,
  Bottom : 3,
}

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
}

function onLoad()
{
    setHelpFileURI("chrome://communicator/locale/help/suitehelp.rdf");
    gFilterListMsgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(Ci.nsIMsgWindow);
    gFilterListMsgWindow.domWindow = window;
    gFilterListMsgWindow.rootDocShell.appType = Ci.nsIDocShell.APP_TYPE_MAIL;
    gFilterListMsgWindow.statusFeedback = gStatusFeedback;

    gFilterBundle = document.getElementById("bundle_filter");

    gServerMenu = document.getElementById("serverMenu");
    gFilterTree = document.getElementById("filterTree");

    gEditButton = document.getElementById("editButton");
    gDeleteButton = document.getElementById("deleteButton");
    gNewButton = document.getElementById("newButton");
    gCopyToNewButton = document.getElementById("copyToNewButton");
    gTopButton = document.getElementById("reorderTopButton");
    gUpButton = document.getElementById("reorderUpButton");
    gDownButton = document.getElementById("reorderDownButton");
    gBottomButton = document.getElementById("reorderBottomButton");
    gRunFiltersFolderPrefix = document.getElementById("folderPickerPrefix");
    gRunFiltersFolder = document.getElementById("runFiltersFolder");
    gRunFiltersButton = document.getElementById("runFiltersButton");
    gStatusBar = document.getElementById("statusbar-icon");
    gStatusText = document.getElementById("statusText");

    gFilterTree.view = gFilterTreeView;

    processWindowArguments(window.arguments[0]);

    // Focus the list.
    gFilterTree.focus();

    Services.obs.addObserver(onFilterClose,
                             "quit-application-requested");

    top.controllers.insertControllerAt(0, gFilterController);
}

/**
 * Processes arguments sent to this dialog when opened or refreshed.
 *
 * @param aArguments  An object having members representing the arguments.
 *                    { arg1: value1, arg2: value2, ... }
 */
function processWindowArguments(aArguments) {
  let wantedFolder;
  if ("folder" in aArguments)
    wantedFolder = aArguments.folder;

  // If a specific folder was requested, try to select it
  // if we don't already show its server.
  if (!gServerMenu._folder ||
      (wantedFolder && (wantedFolder != gServerMenu._folder) &&
       (wantedFolder.rootFolder != gServerMenu._folder))) {

    // Get the folder where filters should be defined, if that server
    // can accept filters.
    let firstItem = getFilterFolderForSelection(wantedFolder);

    // if the selected server cannot have filters, get the default server
    // if the default server cannot have filters, check all accounts
    // and get a server that can have filters.
    if (!firstItem) {
      var server = getServerThatCanHaveFilters();
      if (server)
        firstItem = server.rootFolder;
    }

    if (firstItem)
      setFilterFolder(firstItem);
    else
      updateButtons();

    if (wantedFolder)
      setRunFolder(wantedFolder);
  }
}

/**
 * This is called from OpenOrFocusWindow() if the dialog is already open.
 * New filters could have been created by operations outside the dialog.
 *
 * @param aArguments  An object of arguments having the same format
 *                    as window.arguments[0].
 */
function refresh(aArguments) {
  processWindowArguments(aArguments);
}

function CanRunFiltersAfterTheFact(aServer)
{
  // filter after the fact is implement using search
  // so if you can't search, you can't filter after the fact
  return aServer.canSearchMessages;
}

/**
 * Change the root server for which we are managing filters.
 *
 * @param msgFolder The nsIMsgFolder server containing filters
 *                  (or a folder for NNTP server).
 */
function setFilterFolder(msgFolder) {
  if (!msgFolder || msgFolder == gServerMenu._folder)
    return;

  // Save the current filters to disk before switching because
  // the dialog may be closed and we'll lose current filters.
  let filterList = currentFilterList();
  if (filterList)
    filterList.saveToDefaultFile();

  // Setting this attribute should go away in bug 473009.
  gServerMenu._folder = msgFolder;
  // Calling this should go away in bug 802609.
  gServerMenu.menupopup.selectFolder(msgFolder);

  // Calling getFilterList will detect any errors in rules.dat,
  // backup the file, and alert the user
  gFilterTreeView.filterList = msgFolder.getEditableFilterList(gFilterListMsgWindow);

  // Select the first item in the list, if there is one.
  if (gFilterTreeView.rowCount)
    gFilterTreeView.selection.select(0);

  // This will get the deferred to account root folder, if server is deferred.
  // We intentionally do this after setting the current server, as we want
  // that to refer to the rootFolder for the actual server, not the
  // deferred-to server, as current server is really a proxy for the
  // server whose filters we are editing. But below here we are managing
  // where the filters will get applied, which is on the deferred-to server.
  msgFolder = msgFolder.server.rootMsgFolder;

  // root the folder picker to this server
  let runMenu = gRunFiltersFolder.menupopup;
  runMenu._teardown();
  runMenu._parentFolder = msgFolder;
  runMenu._ensureInitialized();

  var canFilterAfterTheFact = CanRunFiltersAfterTheFact(msgFolder.server);
  gRunFiltersButton.hidden = !canFilterAfterTheFact;
  gRunFiltersFolder.hidden = !canFilterAfterTheFact;
  gRunFiltersFolderPrefix.hidden = !canFilterAfterTheFact;

  if (canFilterAfterTheFact) {
    let wantedFolder = null;
    // For a given server folder, get the default run target folder or show
    // "Choose Folder".
    if (!msgFolder.isServer) {
      wantedFolder = msgFolder;
    } else {
      try {
        switch (msgFolder.server.type) {
          case "nntp":
            // For NNTP select the subscribed newsgroup.
            wantedFolder = gServerMenu._folder;
            break;
          case "rss":
            // Show "Choose Folder" for feeds.
            wantedFolder = null;
            break;
          case "imap":
          case "pop3":
          case "none":
            // Find Inbox for IMAP and POP or Local Folders,
            // show "Choose Folder" if not found.
            wantedFolder = msgFolder.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
            break;
          default:
            // For other account types we don't know what's good to select,
            // so show "Choose Folder".
            wantedFolder = null;
        }
      } catch (e) {
        Cu.reportError("Failed to select a suitable folder to run filters on: " + e);
        wantedFolder = null;
      }
    }
    // Select a useful first folder for the server.
    setRunFolder(wantedFolder);
  }
}

/**
 * Select a folder on which filters are to be run.
 *
 * @param aFolder     nsIMsgFolder folder to select.
 */
function setRunFolder(aFolder) {
  // Setting this attribute should go away in bug 473009.
  gRunFiltersFolder._folder = aFolder;
  // Calling this should go away in bug 802609.
  gRunFiltersFolder.menupopup.selectFolder(gRunFiltersFolder._folder);
  updateButtons();
}

function toggleFilter(index)
{
    var filter = getFilter(index);
    if (filter.unparseable)
    {
      Services.prompt.alert(window, null,
                            gFilterBundle.getFormattedString("cannotEnableIncompatFilter",
                            [document.getElementById("bundle_brand").getString("brandShortName")]));
      return false;
    }
    filter.enabled = !filter.enabled;
    return true;
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
  if (gEditButton.disabled)
    return;

  var selectedFilter = currentFilter();
  var curFilterList = currentFilterList();
  var args = {filter: selectedFilter, filterList: curFilterList};

  window.openDialog("chrome://messenger/content/FilterEditor.xul", "FilterEditor", "chrome,modal,titlebar,resizable,centerscreen", args);

  // The focus change will cause a repaint of the row updating any name change
}

/**
 * Handler function for the 'New...' buttons.
 * Opens the filter dialog for creating a new filter.
 */
function onNewFilter() {
  calculatePositionAndShowCreateFilterDialog({});
}

/**
 * Handler function for the 'Copy...' button.
 * Opens the filter dialog for copying the selected filter.
 */
function onCopyToNewFilter() {
  if (gCopyToNewButton.disabled)
    return;

  let selectedFilter = currentFilter();
  if (!selectedFilter)
    return;

  calculatePositionAndShowCreateFilterDialog({copiedFilter: selectedFilter});
}

/**
 * Calculates the position for inserting the new filter,
 * and then displays the create dialog.
 *
 * @param args  The object containing the arguments for the dialog,
 *              passed to the filterEditorOnLoad() function.
 *              It will be augmented with the insertion position
 *              and global filters list properties by this function.
 */
function calculatePositionAndShowCreateFilterDialog(args) {
  var position = Math.max(gFilterTree.currentIndex, 0);
  args.filterList = currentFilterList();
  args.filterPosition = position;
  args.refresh = false;

  window.openDialog("chrome://messenger/content/FilterEditor.xul",
                    "FilterEditor",
                    "chrome,modal,titlebar,resizable,centerscreen", args);

  if (args.refresh)
  {
    gFilterTreeView.tree.rowCountChanged(position, 1);
    gFilterTree.view.selection.select(position);
    gFilterTree.treeBoxObject.ensureRowIsVisible(position);
  }
}

function onDeleteFilter()
{
  if (gDeleteButton.disabled)
    return;

  var filterList = currentFilterList();
  if (!filterList)
    return;

  var sel = gFilterTree.view.selection;
  var selCount = sel.getRangeCount();
  if (!selCount)
    return;

  let checkValue = {value: false};
  if (Services.prefs.getBoolPref("mailnews.filters.confirm_delete") &&
      Services.prompt.confirmEx(window, null,
                        gFilterBundle.getString("deleteFilterConfirmation"),
                        Services.prompt.STD_YES_NO_BUTTONS,
                        '', '', '',
                        gFilterBundle.getString('dontWarnAboutDeleteCheckbox'),
                        checkValue))
    return;

  if (checkValue.value)
    Services.prefs.setBoolPref("mailnews.filters.confirm_delete", false);

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

/**
 * Move filter one step up in visible list.
 */
function onUp(event) {
  moveFilter(msgMoveMotion.Up);
}

/**
 * Move filter one step down in visible list.
 */
function onDown(event) {
  moveFilter(msgMoveMotion.Down);
}

/**
 * Move filter to bottom for long filter lists.
 */
function onTop(event) {
  moveFilter(msgMoveMotion.Top);
}

/**
 * Move filter to top for long filter lists.
 */
function onBottom(event) {
  moveFilter(msgMoveMotion.Bottom);
}

/**
 * Moves a singular selected filter up or down either 1 increment or to the
 * top/bottom.
 *
 * @param motion
 *   msgMoveMotion.Up, msgMoveMotion.Down, msgMoveMotion.Top, msgMoveMotion.Bottom
 */
function moveFilter(motion) {
  // At the moment, do not allow moving groups of filters.
  let selectedFilter = currentFilter();
  if (!selectedFilter)
    return;

  let filterList = currentFilterList();
  let moveFilterNative;

  switch (motion) {
    case msgMoveMotion.Top:
      filterList.removeFilter(selectedFilter);
      filterList.insertFilterAt(0, selectedFilter);
      gFilterTree.treeBoxObject.ensureRowIsVisible(0);
      gFilterTree.view.selection.select(0);
      return;
    case msgMoveMotion.Bottom:
      filterList.removeFilter(selectedFilter);
      filterList.insertFilterAt(filterList.filterCount, selectedFilter);
      gFilterTree.treeBoxObject.ensureRowIsVisible(filterList.filterCount - 1);
      gFilterTree.view.selection.select(filterList.filterCount - 1);
      return;
    case msgMoveMotion.Up:
      moveFilterNative = Ci.nsMsgFilterMotion.up;
      break;
    case msgMoveMotion.Down:
      moveFilterNative = Ci.nsMsgFilterMotion.down;
      break;
  }

  moveCurrentFilter(moveFilterNative);
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
      aCancelQuit instanceof Ci.nsISupportsPRBool &&
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

  let folder = gRunFiltersFolder._folder ||
               gRunFiltersFolder.selectedItem._folder;
  if (!folder)
    return;

  let filterList = MailServices.filters.getTempFilterList(folder);

  // make sure the tmp filter list uses the real filter list log stream
  filterList.loggingEnabled = currentFilterList().loggingEnabled;
  filterList.logStream = currentFilterList().logStream;
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

  MailServices.filters.applyFiltersToFolders(filterList, [folder], gFilterListMsgWindow);
}

function moveCurrentFilter(motion)
{
    var filterList = currentFilterList();
    var filter = currentFilter();
    if (!filterList || !filter)
      return;

    filterList.moveFilter(filter, motion);
    if (motion == Ci.nsMsgFilterMotion.up)
      gFilterTree.view.selection.select(gFilterTree.currentIndex - 1);
    else
      gFilterTree.view.selection.select(gFilterTree.currentIndex + 1);

    gFilterTree.treeBoxObject.ensureRowIsVisible(gFilterTree.currentIndex);
}

/**
 * Try to only enable buttons that make sense
 *  - moving filters is currently only enabled for single selection
 *    also movement is restricted by searchBox and current selection position
 *  - edit only for single filters
 *  - delete / run only for one or more selected filters
 */
function updateButtons()
{
    var numFiltersSelected = gFilterTree.view.selection.count;
    var oneFilterSelected = (numFiltersSelected == 1);

    // "edit" only enabled when one filter selected
    // or if we couldn't parse the filter.
    let disabled = !oneFilterSelected || currentFilter().unparseable;
    gEditButton.disabled = disabled;

    // "copy" is the same as "edit".
    gCopyToNewButton.disabled = disabled;

    // "delete" only disabled when no filters are selected
    gDeleteButton.disabled = !numFiltersSelected;

    // we can run multiple filters on a folder
    // so only disable this UI if no filters are selected
    gRunFiltersFolderPrefix.disabled = !numFiltersSelected;
    gRunFiltersFolder.disabled = !numFiltersSelected;
    gRunFiltersButton.disabled = !numFiltersSelected ||
                                 !gRunFiltersFolder._folder;

    // "up" and "top" enabled only if one filter is selected,
    // and it's not the first.
    disabled = !(oneFilterSelected && gFilterTree.currentIndex > 0);
    gUpButton.disabled = disabled;
    gTopButton.disabled = disabled;

    // "down" and "bottom" enabled only if one filter selected,
    // and it's not the last.
    disabled = !(oneFilterSelected &&
                 gFilterTree.currentIndex < gFilterTree.view.rowCount - 1);
    gDownButton.disabled = disabled;
    gBottomButton.disabled = disabled;
}

/**
 * Given a selected folder, returns the folder where filters should
 *  be defined (the root folder except for news) if the server can
 *  accept filters.
 *
 * @param   nsIMsgFolder aFolder - selected folder, from window args
 * @returns an nsIMsgFolder where the filter is defined
 */
function getFilterFolderForSelection(aFolder) {
  if (!aFolder || !aFolder.server)
    return null;

  let rootFolder = aFolder.server.rootFolder;
  if (rootFolder && rootFolder.isServer && rootFolder.server.canHaveFilters)
    return (aFolder.server.type == "nntp") ? aFolder : rootFolder;

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
    let defaultAccount = MailServices.accounts.defaultAccount;
    if (defaultAccount) {
      let defaultIncomingServer = defaultAccount.incomingServer;
      // Check to see if default server can have filters.
      if (defaultIncomingServer.canHaveFilters)
        return defaultIncomingServer;
    }

    // if it cannot, check all accounts to find a server
    // that can have filters
    for (let currentServer of MailServices.accounts.allServers)
    {
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

function onFilterTreeKeyPress(aEvent) {
  if (aEvent.ctrlKey || aEvent.altKey || aEvent.metaKey || aEvent.shiftKey)
    return;

  if (aEvent.keyCode) {
    switch (aEvent.keyCode) {
      case KeyEvent.DOM_VK_INSERT:
        if (!gNewButton.disabled)
          onNewFilter();
        break;
      case KeyEvent.DOM_VK_DELETE:
        if (!gDeleteButton.disabled)
          onDeleteFilter();
        break;
      case KeyEvent.DOM_VK_RETURN:
        if (!gEditButton.disabled)
          onEditFilter();
        break;
    }
    return;
  }

  switch (aEvent.charCode) {
    case KeyEvent.DOM_VK_SPACE:
      let rangeCount = gFilterTree.view.selection.getRangeCount();
      for (let i = 0; i < rangeCount; ++i) {
        let start = {}, end = {};
        gFilterTree.view.selection.getRangeAt(i, start, end);
        for (let k = start.value; k <= end.value; ++k)
          toggleFilter(k);
      }
      gFilterTree.view.selection.invalidateSelection();
      break;
    default:
  }
}

function doHelpButton()
{
  openHelp("mail-filters");
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
