/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* TODO: Now used exclusively in SearchDialog.xhtml. Needs dead code removal. */

/* import-globals-from folderDisplay.js */
/* import-globals-from SearchDialog.js */

/* globals validateFileName */ // From utilityOverlay.js
/* globals messageFlavorDataProvider */ // From messenger.js

ChromeUtils.defineESModuleGetters(this, {
  TreeSelection: "chrome://messenger/content/tree-selection.mjs",
});

var gLastMessageUriToLoad = null;
var gThreadPaneCommandUpdater = null;
/**
 * Tracks whether the right mouse button changed the selection or not.  If the
 * user right clicks on the selection, it stays the same.  If they click outside
 * of it, we alter the selection (but not the current index) to be the row they
 * clicked on.
 *
 * The value of this variable is an object with "view" and "selection" keys
 * and values.  The view value is the view whose selection we saved off, and
 * the selection value is the selection object we saved off.
 */
var gRightMouseButtonSavedSelection = null;

/**
 * When right-clicks happen, we do not want to corrupt the underlying
 * selection.  The right-click is a transient selection.  So, unless the
 * user is right-clicking on the current selection, we create a new
 * selection object (thanks to TreeSelection) and set that as the
 * current/transient selection.
 *
 * @param aSingleSelect Should the selection we create be a single selection?
 *     This is relevant if the row being clicked on is already part of the
 *     selection.  If it is part of the selection and !aSingleSelect, then we
 *     leave the selection as is.  If it is part of the selection and
 *     aSingleSelect then we create a transient single-row selection.
 */
function ChangeSelectionWithoutContentLoad(event, tree, aSingleSelect) {
  var treeSelection = tree.view.selection;

  var row = tree.getRowAt(event.clientX, event.clientY);
  // Only do something if:
  // - the row is valid
  // - it's not already selected (or we want a single selection)
  if (row >= 0 && (aSingleSelect || !treeSelection.isSelected(row))) {
    // Check if the row is exactly the existing selection.  In that case
    //  there is no need to create a bogus selection.
    if (treeSelection.count == 1) {
      let minObj = {};
      treeSelection.getRangeAt(0, minObj, {});
      if (minObj.value == row) {
        event.stopPropagation();
        return;
      }
    }

    let transientSelection = new TreeSelection(tree);
    transientSelection.logAdjustSelectionForReplay();

    gRightMouseButtonSavedSelection = {
      // Need to clear out this reference later.
      view: tree.view,
      realSelection: treeSelection,
      transientSelection,
    };

    var saveCurrentIndex = treeSelection.currentIndex;

    // tell it to log calls to adjustSelection
    // attach it to the view
    tree.view.selection = transientSelection;
    // Don't generate any selection events! (we never set this to false, because
    //  that would generate an event, and we never need one of those from this
    //  selection object.
    transientSelection.selectEventsSuppressed = true;
    transientSelection.select(row);
    transientSelection.currentIndex = saveCurrentIndex;
    tree.ensureRowIsVisible(row);
  }
  event.stopPropagation();
}

function ThreadPaneOnDragStart(aEvent) {
  if (aEvent.target.localName != "treechildren") {
    return;
  }

  let messageUris = gFolderDisplay.selectedMessageUris;
  if (!messageUris) {
    return;
  }

  gFolderDisplay.hintAboutToDeleteMessages();
  let messengerBundle = document.getElementById("bundle_messenger");
  let noSubjectString = messengerBundle.getString(
    "defaultSaveMessageAsFileName"
  );
  if (noSubjectString.endsWith(".eml")) {
    noSubjectString = noSubjectString.slice(0, -4);
  }
  let longSubjectTruncator = messengerBundle.getString(
    "longMsgSubjectTruncator"
  );
  // Clip the subject string to 124 chars to avoid problems on Windows,
  // see NS_MAX_FILEDESCRIPTOR in m-c/widget/windows/nsDataObj.cpp .
  const maxUncutNameLength = 124;
  let maxCutNameLength = maxUncutNameLength - longSubjectTruncator.length;
  let messages = new Map();
  for (let [index, msgUri] of messageUris.entries()) {
    let msgService = MailServices.messageServiceFromURI(msgUri);
    let msgHdr = msgService.messageURIToMsgHdr(msgUri);
    let subject = msgHdr.mime2DecodedSubject || "";
    if (msgHdr.flags & Ci.nsMsgMessageFlags.HasRe) {
      subject = "Re: " + subject;
    }

    let uniqueFileName;
    // If there is no subject, use a default name.
    // If subject needs to be truncated, add a truncation character to indicate it.
    if (!subject) {
      uniqueFileName = noSubjectString;
    } else {
      uniqueFileName =
        subject.length <= maxUncutNameLength
          ? subject
          : subject.substr(0, maxCutNameLength) + longSubjectTruncator;
    }
    let msgFileName = validateFileName(uniqueFileName);
    let msgFileNameLowerCase = msgFileName.toLocaleLowerCase();

    while (true) {
      if (!messages[msgFileNameLowerCase]) {
        messages[msgFileNameLowerCase] = 1;
        break;
      } else {
        let postfix = "-" + messages[msgFileNameLowerCase];
        messages[msgFileNameLowerCase]++;
        msgFileName = msgFileName + postfix;
        msgFileNameLowerCase = msgFileNameLowerCase + postfix;
      }
    }

    msgFileName = msgFileName + ".eml";

    let msgUrl = msgService.getUrlForUri(msgUri);
    let separator = msgUrl.spec.includes("?") ? "&" : "?";

    aEvent.dataTransfer.mozSetDataAt("text/x-moz-message", msgUri, index);
    aEvent.dataTransfer.mozSetDataAt("text/x-moz-url", msgUrl.spec, index);
    aEvent.dataTransfer.mozSetDataAt(
      "application/x-moz-file-promise-url",
      msgUrl.spec + separator + "fileName=" + encodeURIComponent(msgFileName),
      index
    );
    aEvent.dataTransfer.mozSetDataAt(
      "application/x-moz-file-promise",
      new messageFlavorDataProvider(),
      index
    );
    aEvent.dataTransfer.mozSetDataAt(
      "application/x-moz-file-promise-dest-filename",
      msgFileName.replace(/(.{74}).*(.{10})$/u, "$1...$2"),
      index
    );
  }
  aEvent.dataTransfer.effectAllowed = "copyMove";
  aEvent.dataTransfer.addElement(aEvent.target);
}

function ThreadPaneOnDragOver(aEvent) {
  let ds = Cc["@mozilla.org/widget/dragservice;1"]
    .getService(Ci.nsIDragService)
    .getCurrentSession();
  ds.canDrop = false;
  if (!gFolderDisplay.displayedFolder.canFileMessages) {
    return;
  }

  let dt = aEvent.dataTransfer;
  if (Array.from(dt.mozTypesAt(0)).includes("application/x-moz-file")) {
    let extFile = dt.mozGetDataAt("application/x-moz-file", 0);
    if (!extFile) {
      return;
    }

    extFile = extFile.QueryInterface(Ci.nsIFile);
    if (extFile.isFile()) {
      let len = extFile.leafName.length;
      if (len > 4 && extFile.leafName.toLowerCase().endsWith(".eml")) {
        ds.canDrop = true;
      }
    }
  }
}

function ThreadPaneOnDrop(aEvent) {
  let dt = aEvent.dataTransfer;
  for (let i = 0; i < dt.mozItemCount; i++) {
    let extFile = dt.mozGetDataAt("application/x-moz-file", i);
    if (!extFile) {
      continue;
    }

    extFile = extFile.QueryInterface(Ci.nsIFile);
    if (extFile.isFile()) {
      let len = extFile.leafName.length;
      if (len > 4 && extFile.leafName.toLowerCase().endsWith(".eml")) {
        MailServices.copy.copyFileMessage(
          extFile,
          gFolderDisplay.displayedFolder,
          null,
          false,
          1,
          "",
          null,
          msgWindow
        );
      }
    }
  }
}

function TreeOnMouseDown(event) {
  // Detect right mouse click and change the highlight to the row
  // where the click happened without loading the message headers in
  // the Folder or Thread Pane.
  // Same for middle click, which will open the folder/message in a tab.
  if (event.button == 2 || event.button == 1) {
    // We want a single selection if this is a middle-click (button 1)
    ChangeSelectionWithoutContentLoad(
      event,
      event.target.parentNode,
      event.button == 1
    );
  }
}

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
}

function ThreadPaneDoubleClick() {
  MsgOpenSelectedMessages();
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
  let treeColumns = document.getElementById("threadCols").children;
  for (let i = 0; i < treeColumns.length; i++) {
    treeColumns[i].removeAttribute("sortDirection");
  }

  // show the twisties if the view is threaded
  let threadCol = document.getElementById("threadCol");
  let subjectCol = document.getElementById("subjectCol");
  let sortedColumn;
  // set the sort indicator on the column we are sorted by
  let colID = ConvertSortTypeToColumnID(sortType);
  if (colID) {
    sortedColumn = document.getElementById(colID);
  }

  let viewWrapper = gFolderDisplay.view;

  // the thread column is not visible when we are grouped by sort
  threadCol.collapsed = viewWrapper.showGroupedBySort;

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

function GetThreadTree() {
  return document.getElementById("threadTree");
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
  GetThreadTree().view.selectionChanged();
  UpdateSelectCol();
  UpdateMailSearch();
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

function ConvertSortTypeToColumnID(sortKey) {
  var columnID;

  // Hack to turn this into an integer, if it was a string.
  // It would be a string if it came from XULStore.json.
  sortKey = sortKey - 0;

  switch (sortKey) {
    // In the case of None, we default to the date column
    // This appears to be the case in such instances as
    // Global search, so don't complain about it.
    case Ci.nsMsgViewSortType.byNone:
    case Ci.nsMsgViewSortType.byDate:
      columnID = "dateCol";
      break;
    case Ci.nsMsgViewSortType.byReceived:
      columnID = "receivedCol";
      break;
    case Ci.nsMsgViewSortType.byAuthor:
      columnID = "senderCol";
      break;
    case Ci.nsMsgViewSortType.byRecipient:
      columnID = "recipientCol";
      break;
    case Ci.nsMsgViewSortType.bySubject:
      columnID = "subjectCol";
      break;
    case Ci.nsMsgViewSortType.byLocation:
      columnID = "locationCol";
      break;
    case Ci.nsMsgViewSortType.byAccount:
      columnID = "accountCol";
      break;
    case Ci.nsMsgViewSortType.byUnread:
      columnID = "unreadButtonColHeader";
      break;
    case Ci.nsMsgViewSortType.byStatus:
      columnID = "statusCol";
      break;
    case Ci.nsMsgViewSortType.byTags:
      columnID = "tagsCol";
      break;
    case Ci.nsMsgViewSortType.bySize:
      columnID = "sizeCol";
      break;
    case Ci.nsMsgViewSortType.byPriority:
      columnID = "priorityCol";
      break;
    case Ci.nsMsgViewSortType.byFlagged:
      columnID = "flaggedCol";
      break;
    case Ci.nsMsgViewSortType.byThread:
      columnID = "threadCol";
      break;
    case Ci.nsMsgViewSortType.byId:
      columnID = "idCol";
      break;
    case Ci.nsMsgViewSortType.byJunkStatus:
      columnID = "junkStatusCol";
      break;
    case Ci.nsMsgViewSortType.byAttachments:
      columnID = "attachmentCol";
      break;
    case Ci.nsMsgViewSortType.byCustom:
      // TODO: either change try() catch to if (property exists) or restore the getColumnHandler() check
      try {
        // getColumnHandler throws an error when the ID is not handled
        columnID = window.gDBView.curCustomColumn;
      } catch (err) {
        // error - means no handler
        dump(
          "ConvertSortTypeToColumnID: custom sort key but no handler for column '" +
            columnID +
            "'\n"
        );
        columnID = "dateCol";
      }

      break;
    case Ci.nsMsgViewSortType.byCorrespondent:
      columnID = "correspondentCol";
      break;
    default:
      dump("unsupported sort key: " + sortKey + "\n");
      columnID = "dateCol";
      break;
  }
  return columnID;
}

addEventListener("load", ThreadPaneOnLoad, true);
