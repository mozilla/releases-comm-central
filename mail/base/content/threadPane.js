/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from commandglue.js */
/* import-globals-from folderDisplay.js */
/* import-globals-from mailWindow.js */

var gLastMessageUriToLoad = null;
var gThreadPaneCommandUpdater = null;

function ThreadPaneOnClick(event) {
  // We only care about button 0 (left click) events.
  if (event.button != 0) {
    event.stopPropagation();
    return;
  }

  // We already handle marking as read/flagged/junk cyclers in nsMsgDBView.cpp
  // so all we need to worry about here is doubleclicks and column header. We
  // get here for clicks on the "treecol" (headers) and the "scrollbarbutton"
  // (scrollbar buttons) and don't want those events to cause a doubleclick.

  let t = event.target;
  if (t.localName == "treecol") {
    HandleColumnClick(t.id);
    return;
  }

  if (t.localName != "treechildren") {
    return;
  }

  let tree = GetThreadTree();
  // Figure out what cell the click was in.
  let treeCellInfo = tree.getCellAt(event.clientX, event.clientY);
  if (treeCellInfo.row == -1) {
    return;
  }

  if (treeCellInfo.col.id == "selectCol") {
    HandleSelectColClick(event, treeCellInfo.row);
    return;
  }

  if (treeCellInfo.col.id == "deleteCol") {
    handleDeleteColClick(event);
    return;
  }

  // Grouped By Sort dummy header row non cycler column doubleclick toggles the
  // thread's open/closed state; tree.js handles it. Cyclers are not currently
  // implemented in group header rows, a click/doubleclick there should
  // select/toggle thread state.
  if (gFolderDisplay.view.isGroupedByHeaderAtIndex(treeCellInfo.row)) {
    if (!treeCellInfo.col.cycler) {
      return;
    }
    if (event.detail == 1) {
      gFolderDisplay.selectViewIndex(treeCellInfo.row);
    }
    if (event.detail == 2) {
      gFolderDisplay.view.dbView.toggleOpenState(treeCellInfo.row);
    }
    event.stopPropagation();
    return;
  }

  // Cyclers and twisties respond to single clicks, not double clicks.
  if (
    event.detail == 2 &&
    !treeCellInfo.col.cycler &&
    treeCellInfo.childElt != "twisty"
  ) {
    ThreadPaneDoubleClick();
  } else if (treeCellInfo.col.id == "junkStatusCol") {
    MsgJunkMailInfo(true);
  } else if (
    treeCellInfo.col.id == "threadCol" &&
    !event.shiftKey &&
    (event.ctrlKey || event.metaKey)
  ) {
    gDBView.ExpandAndSelectThreadByIndex(treeCellInfo.row, true);
    event.stopPropagation();
  }
}

function HandleColumnClick(columnID) {
  if (columnID == "selectCol") {
    let treeView = gFolderDisplay.tree.view;
    let selection = treeView.selection;
    if (!selection) {
      return;
    }
    if (selection.count > 0) {
      selection.clearSelection();
    } else {
      selection.selectAll();
    }
    return;
  }

  if (gFolderDisplay.COLUMNS_MAP_NOSORT.has(columnID)) {
    return;
  }

  let sortType = gFolderDisplay.COLUMNS_MAP.get(columnID);
  let curCustomColumn = gDBView.curCustomColumn;
  if (!sortType) {
    // If the column isn't in the map, check if it's a custom column.
    try {
      // Test for the columnHandler (an error is thrown if it does not exist).
      gDBView.getColumnHandler(columnID);

      // Handler is registered - set column to be the current custom column.
      gDBView.curCustomColumn = columnID;
      sortType = "byCustom";
    } catch (ex) {
      dump(
        "HandleColumnClick: No custom column handler registered for " +
          "columnID: " +
          columnID +
          " - " +
          ex +
          "\n"
      );
      return;
    }
  }

  let viewWrapper = gFolderDisplay.view;
  let simpleColumns = false;
  try {
    simpleColumns = !Services.prefs.getBoolPref(
      "mailnews.thread_pane_column_unthreads"
    );
  } catch (ex) {}

  if (sortType == "byThread") {
    if (simpleColumns) {
      MsgToggleThreaded();
    } else if (viewWrapper.showThreaded) {
      MsgReverseSortThreadPane();
    } else {
      MsgSortByThread();
    }

    return;
  }

  if (!simpleColumns && viewWrapper.showThreaded) {
    viewWrapper.showUnthreaded = true;
    MsgSortThreadPane(sortType);
    return;
  }

  if (
    viewWrapper.primarySortType == Ci.nsMsgViewSortType[sortType] &&
    (viewWrapper.primarySortType != Ci.nsMsgViewSortType.byCustom ||
      curCustomColumn == columnID)
  ) {
    MsgReverseSortThreadPane();
  } else {
    MsgSortThreadPane(sortType);
  }
}

function HandleSelectColClick(event, row) {
  // User wants to multiselect using the old way.
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return;
  }
  let tree = gFolderDisplay.tree;
  let selection = tree.view.selection;
  if (event.detail == 1) {
    selection.toggleSelect(row);
  }

  // In the selectCol, we want a double click on a thread parent to select
  // and deselect all children, in threaded and grouped views.
  if (
    event.detail == 2 &&
    tree.view.isContainerOpen(row) &&
    !tree.view.isContainerEmpty(row)
  ) {
    // On doubleclick of an open thread, select/deselect all the children.
    let startRow = row + 1;
    let endRow = startRow;
    while (endRow < tree.view.rowCount && tree.view.getLevel(endRow) > 0) {
      endRow++;
    }
    endRow--;
    if (selection.isSelected(row)) {
      selection.rangedSelect(startRow, endRow, true);
    } else {
      selection.clearRange(startRow, endRow);
      ThreadPaneSelectionChanged();
    }
  }

  // There is no longer any selection, clean up for correct state of things.
  if (selection.count == 0) {
    if (gFolderDisplay.displayedFolder) {
      gFolderDisplay.displayedFolder.lastMessageLoaded = nsMsgKey_None;
    }
    gFolderDisplay._mostRecentSelectionCounts[1] = 0;
  }
}

/**
 * Delete a message without selecting it or loading its content.
 *
 * @param {DOMEvent} event - The DOM Event.
 */
function handleDeleteColClick(event) {
  // Prevent deletion if any of the modifier keys was pressed.
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return;
  }

  // Simulate a right click on the message row to inherit all the validations
  // and alerts coming from the "cmd_delete" command.
  ChangeSelectionWithoutContentLoad(
    event,
    event.target.parentNode,
    event.button == 1
  );

  // Trigger the message deletion.
  goDoCommand("cmd_delete");

  // Since a right click wasn't actually triggered, we need to call this method
  // to restore the previous selection.
  RestoreSelectionWithoutContentLoad(gFolderDisplay.tree);
}

function ThreadPaneDoubleClick() {
  if (IsSpecialFolderSelected(Ci.nsMsgFolderFlags.Drafts, true)) {
    MsgComposeDraftMessage();
  } else if (IsSpecialFolderSelected(Ci.nsMsgFolderFlags.Templates, true)) {
    ComposeMessage(
      Ci.nsIMsgCompType.Template,
      Ci.nsIMsgCompFormat.Default,
      gFolderDisplay.displayedFolder,
      gFolderDisplay.selectedMessageUris
    );
  } else {
    MsgOpenSelectedMessages();
  }
}

function ThreadPaneKeyDown(event) {
  if (event.keyCode != KeyEvent.DOM_VK_RETURN) {
    return;
  }

  // Grouped By Sort dummy header row <enter> toggles the thread's open/closed
  // state. Let tree.js handle it.
  if (
    gFolderDisplay.view.showGroupedBySort &&
    gFolderDisplay.treeSelection &&
    gFolderDisplay.treeSelection.count == 1 &&
    gFolderDisplay.view.isGroupedByHeaderAtIndex(
      gFolderDisplay.treeSelection.currentIndex
    )
  ) {
    return;
  }

  // Prevent any thread that happens to be last selected (currentIndex) in a
  // single or multi selection from toggling in tree.js.
  event.stopImmediatePropagation();

  ThreadPaneDoubleClick();
}

function MsgSortByThread() {
  gFolderDisplay.view.showThreaded = true;
  MsgSortThreadPane("byDate");
}

function MsgSortThreadPane(sortName) {
  let sortType = Ci.nsMsgViewSortType[sortName];
  let grouped = gFolderDisplay.view.showGroupedBySort;
  gFolderDisplay.view._threadExpandAll = Boolean(
    gFolderDisplay.view._viewFlags & Ci.nsMsgViewFlagsType.kExpandAll
  );

  if (!grouped) {
    gFolderDisplay.view.sort(sortType, Ci.nsMsgViewSortOrder.ascending);
    // Respect user's last expandAll/collapseAll choice, post sort direction change.
    gFolderDisplay.restoreThreadState();
    return;
  }

  // legacy behavior dictates we un-group-by-sort if we were.  this probably
  //  deserves a UX call...

  // For non virtual folders, do not ungroup (which sorts by the going away
  // sort) and then sort, as it's a double sort.
  // For virtual folders, which are rebuilt in the backend in a grouped
  // change, create a new view upfront rather than applying viewFlags. There
  // are oddities just applying viewFlags, for example changing out of a
  // custom column grouped xfvf view with the threads collapsed works (doesn't)
  // differently than other variations.
  // So, first set the desired sortType and sortOrder, then set viewFlags in
  // batch mode, then apply it all (open a new view) with endViewUpdate().
  gFolderDisplay.view.beginViewUpdate();
  gFolderDisplay.view._sort = [[sortType, Ci.nsMsgViewSortOrder.ascending]];
  gFolderDisplay.view.showGroupedBySort = false;
  gFolderDisplay.view.endViewUpdate();

  // Virtual folders don't persist viewFlags well in the back end,
  // due to a virtual folder being either 'real' or synthetic, so make
  // sure it's done here.
  if (gFolderDisplay.view.isVirtual) {
    gFolderDisplay.view.dbView.viewFlags = gFolderDisplay.view.viewFlags;
  }
}

function MsgReverseSortThreadPane() {
  let grouped = gFolderDisplay.view.showGroupedBySort;
  gFolderDisplay.view._threadExpandAll = Boolean(
    gFolderDisplay.view._viewFlags & Ci.nsMsgViewFlagsType.kExpandAll
  );

  // Grouped By view is special for column click sort direction changes.
  if (grouped) {
    if (gDBView.selection.count) {
      gFolderDisplay._saveSelection();
    }

    if (gFolderDisplay.view.isSingleFolder) {
      if (gFolderDisplay.view.isVirtual) {
        gFolderDisplay.view.showGroupedBySort = false;
      } else {
        // Must ensure rows are collapsed and kExpandAll is unset.
        gFolderDisplay.doCommand(Ci.nsMsgViewCommandType.collapseAll);
      }
    }
  }

  if (gFolderDisplay.view.isSortedAscending) {
    gFolderDisplay.view.sortDescending();
  } else {
    gFolderDisplay.view.sortAscending();
  }

  // Restore Grouped By state post sort direction change.
  if (grouped) {
    if (gFolderDisplay.view.isVirtual && gFolderDisplay.view.isSingleFolder) {
      MsgGroupBySort();
    }

    // Restore Grouped By selection post sort direction change.
    gFolderDisplay._restoreSelection();
  }

  // Respect user's last expandAll/collapseAll choice, for both threaded and grouped
  // views, post sort direction change.
  gFolderDisplay.restoreThreadState();
}

function MsgToggleThreaded() {
  if (gFolderDisplay.view.showThreaded) {
    gFolderDisplay.view.showUnthreaded = true;
  } else {
    gFolderDisplay.view.showThreaded = true;
  }
}

function MsgSortThreaded() {
  gFolderDisplay.view.showThreaded = true;
}

function MsgGroupBySort() {
  gFolderDisplay.view.showGroupedBySort = true;
}

function MsgSortUnthreaded() {
  gFolderDisplay.view.showUnthreaded = true;
}

function MsgSortAscending() {
  if (
    gFolderDisplay.view.showGroupedBySort &&
    gFolderDisplay.view.isSingleFolder
  ) {
    if (gFolderDisplay.view.isSortedDescending) {
      MsgReverseSortThreadPane();
    }

    return;
  }

  gFolderDisplay.view.sortAscending();
}

function MsgSortDescending() {
  if (
    gFolderDisplay.view.showGroupedBySort &&
    gFolderDisplay.view.isSingleFolder
  ) {
    if (gFolderDisplay.view.isSortedAscending) {
      MsgReverseSortThreadPane();
    }

    return;
  }

  gFolderDisplay.view.sortDescending();
}

// XXX this should probably migrate into FolderDisplayWidget, or whatever
//  FolderDisplayWidget ends up using if it refactors column management out.
function UpdateSortIndicators(sortType, sortOrder) {
  // Remove the sort indicator from all the columns
  var treeColumns = document.getElementById("threadCols").children;
  for (var i = 0; i < treeColumns.length; i++) {
    treeColumns[i].removeAttribute("sortDirection");
  }

  // show the twisties if the view is threaded
  var threadCol = document.getElementById("threadCol");
  var subjectCol = document.getElementById("subjectCol");
  var sortedColumn;
  // set the sort indicator on the column we are sorted by
  var colID = ConvertSortTypeToColumnID(sortType);
  if (colID) {
    sortedColumn = document.getElementById(colID);
  }

  var viewWrapper = gFolderDisplay.view;

  // the thread column is not visible when we are grouped by sort
  document.getElementById("threadCol").collapsed =
    viewWrapper.showGroupedBySort;

  // show twisties only when grouping or threading
  if (viewWrapper.showGroupedBySort || viewWrapper.showThreaded) {
    subjectCol.setAttribute("primary", "true");
  } else {
    subjectCol.removeAttribute("primary");
  }

  if (sortedColumn) {
    sortedColumn.setAttribute(
      "sortDirection",
      sortOrder == Ci.nsMsgViewSortOrder.ascending ? "ascending" : "descending"
    );
  }

  // Prevent threadCol from showing the sort direction chevron.
  if (viewWrapper.showThreaded) {
    threadCol.removeAttribute("sortDirection");
  }
}

function IsSpecialFolderSelected(flags, checkAncestors) {
  let folder = GetThreadPaneFolder();
  return folder && folder.isSpecialFolder(flags, checkAncestors);
}

function GetThreadTree() {
  return document.getElementById("threadTree");
}

function GetThreadPaneFolder() {
  try {
    return gDBView.msgFolder;
  } catch (ex) {
    return null;
  }
}

function ThreadPaneOnLoad() {
  var tree = GetThreadTree();
  // We won't have the tree if we're in a message window, so exit silently
  if (!tree) {
    return;
  }
  tree.addEventListener("click", ThreadPaneOnClick, true);
  tree.addEventListener(
    "dblclick",
    event => {
      // The tree.js dblclick event handler is handling editing and toggling
      // open state of the cell. We don't use editing, and we want to handle
      // the toggling through the click handler (also for double click), so
      // capture the dblclick event before it bubbles up and causes the
      // tree.js dblclick handler to toggle open state.
      event.stopPropagation();
    },
    true
  );

  // The mousedown event listener below should only be added in the thread
  // pane of the mailnews 3pane window, not in the advanced search window.
  if (tree.parentNode.id == "searchResultListBox") {
    return;
  }

  tree.addEventListener("mousedown", TreeOnMouseDown, true);
  let delay = Services.prefs.getIntPref("mailnews.threadpane_select_delay");
  document.getElementById("threadTree")._selectDelay = delay;
}

function ThreadPaneSelectionChanged() {
  UpdateStatusMessageCounts(gFolderDisplay.displayedFolder);
  GetThreadTree().view.selectionChanged();
  UpdateSelectCol();
}

function UpdateSelectCol() {
  let selectCol = document.getElementById("selectCol");
  if (!selectCol) {
    return;
  }
  let treeView = gFolderDisplay.tree.view;
  let selection = treeView.selection;
  if (selection && selection.count > 0) {
    if (treeView.rowCount == selection.count) {
      selectCol.classList.remove("someselected");
      selectCol.classList.add("allselected");
    } else {
      selectCol.classList.remove("allselected");
      selectCol.classList.add("someselected");
    }
  } else {
    selectCol.classList.remove("allselected");
    selectCol.classList.remove("someselected");
  }
}

addEventListener("load", ThreadPaneOnLoad, true);
