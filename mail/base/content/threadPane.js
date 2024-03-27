/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from folderDisplay.js */
/* import-globals-from SearchDialog.js */

/* globals validateFileName */ // From utilityOverlay.js
/* globals messageFlavorDataProvider */ // From messenger.js

/* exported ThreadPaneKeyDown ThreadPaneOnDragStart UpdateSortIndicators */

ChromeUtils.defineESModuleGetters(this, {
  ThreadPaneColumns: "chrome://messenger/content/thread-pane-columns.mjs",
  TreeSelection: "chrome://messenger/content/tree-selection.mjs",
});

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
      const minObj = {};
      treeSelection.getRangeAt(0, minObj, {});
      if (minObj.value == row) {
        event.stopPropagation();
        return;
      }
    }

    const transientSelection = new TreeSelection(tree);
    transientSelection.logAdjustSelectionForReplay();

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

  const messageUris = gFolderDisplay.selectedMessageUris;
  if (!messageUris) {
    return;
  }

  gFolderDisplay.hintAboutToDeleteMessages();
  const messengerBundle = document.getElementById("bundle_messenger");
  let noSubjectString = messengerBundle.getString(
    "defaultSaveMessageAsFileName"
  );
  if (noSubjectString.endsWith(".eml")) {
    noSubjectString = noSubjectString.slice(0, -4);
  }
  const longSubjectTruncator = messengerBundle.getString(
    "longMsgSubjectTruncator"
  );
  // Clip the subject string to 124 chars to avoid problems on Windows,
  // see NS_MAX_FILEDESCRIPTOR in m-c/widget/windows/nsDataObj.cpp .
  const maxUncutNameLength = 124;
  const maxCutNameLength = maxUncutNameLength - longSubjectTruncator.length;
  const messages = new Map();
  for (const [index, msgUri] of messageUris.entries()) {
    const msgService = MailServices.messageServiceFromURI(msgUri);
    const msgHdr = msgService.messageURIToMsgHdr(msgUri);
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

    // @see https://github.com/eslint/eslint/issues/17807
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (!messages[msgFileNameLowerCase]) {
        messages[msgFileNameLowerCase] = 1;
        break;
      } else {
        const postfix = "-" + messages[msgFileNameLowerCase];
        messages[msgFileNameLowerCase]++;
        msgFileName = msgFileName + postfix;
        msgFileNameLowerCase = msgFileNameLowerCase + postfix;
      }
    }

    msgFileName = msgFileName + ".eml";

    const msgUrl = msgService.getUrlForUri(msgUri);
    const separator = msgUrl.spec.includes("?") ? "&" : "?";

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

  const t = event.target;
  if (t.localName == "treecol") {
    HandleColumnClick(t.id);
    return;
  }

  if (t.localName != "treechildren") {
    return;
  }

  const tree = GetThreadTree();
  // Figure out what cell the click was in.
  const treeCellInfo = tree.getCellAt(event.clientX, event.clientY);
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

  // Cyclers and twisties respond to single clicks, not double clicks.
  if (
    event.detail == 2 &&
    !treeCellInfo.col.cycler &&
    treeCellInfo.childElt != "twisty"
  ) {
    ThreadPaneDoubleClick();
  }
}

function HandleColumnClick(columnID) {
  if (columnID == "selectCol") {
    const treeView = gFolderDisplay.tree.view;
    const selection = treeView.selection;
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

  if (gFolderDisplay.BUILTIN_NOSORT_COLUMNS.has(columnID)) {
    return;
  }

  if (!gFolderDisplay.BUILTIN_SORT_COLUMNS.has(columnID)) {
    // This must be a custom column, check if it exists and is sortable.
    const customColumn = ThreadPaneColumns.getCustomColumns().find(
      c => c.id == columnID
    );
    if (!customColumn) {
      dump(
        `HandleColumnClick: No custom column handler registered for columnID: ${columnID}\n`
      );
      return;
    }
    if (!customColumn.sortKey) {
      return;
    }
  }

  if (gFolderDisplay.view.primarySortColumnId == columnID) {
    MsgReverseSortThreadPane();
  } else {
    MsgSortThreadPane(columnID);
  }
}

function HandleSelectColClick(event, row) {
  // User wants to multiselect using the old way.
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return;
  }
  const tree = gFolderDisplay.tree;
  const selection = tree.view.selection;
  if (event.detail == 1) {
    selection.toggleSelect(row);
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

  // Prevent any thread that happens to be last selected (currentIndex) in a
  // single or multi selection from toggling in tree.js.
  event.stopImmediatePropagation();

  ThreadPaneDoubleClick();
}

function MsgSortThreadPane(columnId) {
  gFolderDisplay.view._threadExpandAll = Boolean(
    gFolderDisplay.view._viewFlags & Ci.nsMsgViewFlagsType.kExpandAll
  );

  gFolderDisplay.view.sort(columnId, Ci.nsMsgViewSortOrder.ascending);
}

function MsgReverseSortThreadPane() {
  gFolderDisplay.view._threadExpandAll = Boolean(
    gFolderDisplay.view._viewFlags & Ci.nsMsgViewFlagsType.kExpandAll
  );

  if (gFolderDisplay.view.isSortedAscending) {
    gFolderDisplay.view.sortDescending();
  } else {
    gFolderDisplay.view.sortAscending();
  }
}

// XXX this should probably migrate into FolderDisplayWidget, or whatever
//  FolderDisplayWidget ends up using if it refactors column management out.
function UpdateSortIndicators(colID, sortOrder) {
  // Remove the sort indicator from all the columns
  const treeColumns = document.getElementById("threadCols").children;
  for (let i = 0; i < treeColumns.length; i++) {
    treeColumns[i].removeAttribute("sortDirection");
  }

  let sortedColumn;
  // set the sort indicator on the column we are sorted by
  if (colID) {
    sortedColumn = document.getElementById(colID);
  }

  if (sortedColumn) {
    sortedColumn.setAttribute(
      "sortDirection",
      sortOrder == Ci.nsMsgViewSortOrder.ascending ? "ascending" : "descending"
    );
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
}

function ThreadPaneSelectionChanged() {
  GetThreadTree().view.selectionChanged();
  UpdateSelectCol();
  UpdateMailSearch();
}

function UpdateSelectCol() {
  const selectCol = document.getElementById("selectCol");
  if (!selectCol) {
    return;
  }
  const treeView = gFolderDisplay.tree.view;
  const selection = treeView.selection;
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
