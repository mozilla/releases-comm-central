/* -*- Mode: javascript; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 ; js-indent-level: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../mail/base/content/utilityOverlay.js */
/* import-globals-from ../../../mail/components/addrbook/content/abCommon.js */
/* import-globals-from abView.js */

/**
 * Use of items in this file require:
 *
 * AbResultsPaneDoubleClick(card)
 *   Is called when the results pane is double-clicked, with the clicked card.
 * GetAbViewListener()
 *   Called when creating a new view
 */
/* globals AbResultsPaneDoubleClick, GetAbViewListener */ // abContactsPane.js or abSearchDialog.js

var kDefaultSortColumn = "GeneratedName";

// List/card selections in the results pane.
var kNothingSelected = 0;
var kListsAndCards = 1;
var kMultipleListsOnly = 2;
var kSingleListOnly = 3;
var kCardsOnly = 4;

// Global Variables

// Holds a reference to the "abResultsTree" document element. Initially
// set up by SetAbView.
var gAbResultsTree = null;
// gAbView is the current value of gAbResultsTree.view, without passing
// through XPCOM, so we can access extra functions if necessary.
var gAbView = null;

function SetAbView(aURI, aSearchQuery, aSearchString) {
  // If we don't have a URI, just clear the view and leave everything else
  // alone.
  if (!aURI) {
    if (gAbView) {
      CloseAbView();
    }
    return;
  }

  // If we do have a URI, we want to allow updating the review even if the
  // URI is the same, as the search results may be different.

  var sortColumn = kDefaultSortColumn;
  var sortDirection = kDefaultAscending;

  if (!gAbResultsTree) {
    gAbResultsTree = document.getElementById("abResultsTree");
    gAbResultsTree.controllers.appendController(ResultsPaneController);
  }

  if (gAbView) {
    sortColumn = gAbView.sortColumn;
    sortDirection = gAbView.sortDirection;
  } else {
    if (gAbResultsTree.hasAttribute("sortCol")) {
      sortColumn = gAbResultsTree.getAttribute("sortCol");
    }
    var sortColumnNode = document.getElementById(sortColumn);
    if (sortColumnNode && sortColumnNode.hasAttribute("sortDirection")) {
      sortDirection = sortColumnNode.getAttribute("sortDirection");
    }
  }

  gAbView = gAbResultsTree.view = new ABView(
    GetDirectoryFromURI(aURI),
    aSearchQuery,
    aSearchString,
    GetAbViewListener(),
    sortColumn,
    sortDirection
  ).QueryInterface(Ci.nsITreeView);
  window.dispatchEvent(new CustomEvent("viewchange"));

  UpdateSortIndicators(sortColumn, sortDirection);

  // If the selected address book is LDAP and the search box is empty,
  // inform the user of the empty results pane.
  const abResultsTree = document.getElementById("abResultsTree");
  const cardViewOuterBox = document.getElementById("CardViewOuterBox");
  const blankResultsPaneMessageBox = document.getElementById(
    "blankResultsPaneMessageBox"
  );
  if (aURI.startsWith("moz-abldapdirectory://") && !aSearchQuery) {
    if (abResultsTree) {
      abResultsTree.hidden = true;
    }
    if (cardViewOuterBox) {
      cardViewOuterBox.hidden = true;
    }
    if (blankResultsPaneMessageBox) {
      blankResultsPaneMessageBox.hidden = false;
    }
  } else {
    if (abResultsTree) {
      abResultsTree.hidden = false;
    }
    if (cardViewOuterBox) {
      cardViewOuterBox.hidden = false;
    }
    if (blankResultsPaneMessageBox) {
      blankResultsPaneMessageBox.hidden = true;
    }
  }
}

function CloseAbView() {
  gAbView = null;
  if (gAbResultsTree) {
    gAbResultsTree.view = null;
  }
}

function GetSelectedAddresses() {
  return GetAddressesForCards(GetSelectedAbCards());
}

function GetNumSelectedCards() {
  try {
    return gAbView.selection.count;
  } catch (ex) {}

  // if something went wrong, return 0 for the count.
  return 0;
}

function GetSelectedCardTypes() {
  var cards = GetSelectedAbCards();
  if (!cards) {
    console.error("ERROR: GetSelectedCardTypes: |cards| is null.");
    return kNothingSelected; // no view
  }
  var count = cards.length;
  if (count == 0) {
    // Nothing selected.
    return kNothingSelected;
  }

  var mailingListCnt = 0;
  var cardCnt = 0;
  for (let i = 0; i < count; i++) {
    // We can assume no values from GetSelectedAbCards will be null.
    if (cards[i].isMailList) {
      mailingListCnt++;
    } else {
      cardCnt++;
    }
  }

  if (mailingListCnt == 0) {
    return kCardsOnly;
  }
  if (cardCnt > 0) {
    return kListsAndCards;
  }
  if (mailingListCnt == 1) {
    return kSingleListOnly;
  }
  return kMultipleListsOnly;
}

// NOTE, will return -1 if more than one card selected, or no cards selected.
function GetSelectedCardIndex() {
  if (!gAbView) {
    return -1;
  }

  var treeSelection = gAbView.selection;
  if (treeSelection.getRangeCount() == 1) {
    var start = {};
    var end = {};
    treeSelection.getRangeAt(0, start, end);
    if (start.value == end.value) {
      return start.value;
    }
  }

  return -1;
}

// NOTE, returns the card if exactly one card is selected, null otherwise
function GetSelectedCard() {
  var index = GetSelectedCardIndex();
  return index == -1 ? null : gAbView.getCardFromRow(index);
}

/**
 * Return a (possibly empty) list of cards
 *
 * It pushes only non-null/empty element, if any, into the returned list.
 */
function GetSelectedAbCards() {
  var abView = gAbView;

  if (!abView?.selection) {
    return [];
  }

  const cards = [];
  var count = abView.selection.getRangeCount();
  for (let i = 0; i < count; ++i) {
    const start = {};
    const end = {};

    abView.selection.getRangeAt(i, start, end);

    for (let j = start.value; j <= end.value; ++j) {
      // avoid inserting null element into the list. GetRangeAt() may be buggy.
      const tmp = abView.getCardFromRow(j);
      if (tmp) {
        cards.push(tmp);
      }
    }
  }
  return cards;
}

// XXX todo
// an optimization might be to make this return
// the selected ranges, which would be faster
// when the user does large selections, but for now, let's keep it simple.
function GetSelectedRows() {
  var selectedRows = "";

  if (!gAbView) {
    return selectedRows;
  }

  var rangeCount = gAbView.selection.getRangeCount();
  for (let i = 0; i < rangeCount; ++i) {
    var start = {};
    var end = {};
    gAbView.selection.getRangeAt(i, start, end);
    for (let j = start.value; j <= end.value; ++j) {
      if (selectedRows) {
        selectedRows += ",";
      }
      selectedRows += j;
    }
  }

  return selectedRows;
}

function AbResultsPaneOnClick(event) {
  // we only care about button 0 (left click) events
  if (event.button != 0) {
    return;
  }

  // all we need to worry about here is double clicks
  // and column header clicks.
  //
  // we get in here for clicks on the "treecol" (headers)
  // and the "scrollbarbutton" (scrollbar buttons)
  // we don't want those events to cause a "double click"

  var t = event.target;

  if (t.localName == "treecol") {
    var sortDirection;
    var currentDirection = t.getAttribute("sortDirection");

    // Revert the sort order. If none is set, use Ascending.
    sortDirection =
      currentDirection == kDefaultAscending
        ? kDefaultDescending
        : kDefaultAscending;

    SortAndUpdateIndicators(t.id, sortDirection);
  } else if (t.localName == "treechildren") {
    // figure out what row the click was in
    var row = gAbResultsTree.getRowAt(event.clientX, event.clientY);
    if (row == -1) {
      return;
    }

    if (event.detail == 2) {
      AbResultsPaneDoubleClick(gAbView.getCardFromRow(row));
    }
  }
}

function SortAndUpdateIndicators(sortColumn, sortDirection) {
  UpdateSortIndicators(sortColumn, sortDirection);

  if (gAbView) {
    gAbView.sortBy(sortColumn, sortDirection);
  }
}

function UpdateSortIndicators(colID, sortDirection) {
  var sortedColumn = null;

  // set the sort indicator on the column we are sorted by
  if (colID) {
    sortedColumn = document.getElementById(colID);
    if (sortedColumn) {
      sortedColumn.setAttribute("sortDirection", sortDirection);
      gAbResultsTree.setAttribute("sortCol", colID);
    }
  }

  // remove the sort indicator from all the columns
  // except the one we are sorted by
  var currCol = gAbResultsTree.firstElementChild.firstElementChild;
  while (currCol) {
    if (currCol != sortedColumn && currCol.localName == "treecol") {
      currCol.removeAttribute("sortDirection");
    }
    currCol = currCol.nextElementSibling;
  }
}

// Controller object for Results Pane
var ResultsPaneController = {
  supportsCommand(command) {
    switch (command) {
      case "cmd_selectAll":
      case "cmd_delete":
      case "button_delete":
      case "cmd_print":
      case "cmd_printcard":
        return true;
      default:
        return false;
    }
  },

  isCommandEnabled(command) {
    switch (command) {
      case "cmd_selectAll":
        return true;
      case "cmd_delete":
      case "button_delete": {
        let numSelected;
        let enabled = false;
        if (gAbView && gAbView.selection) {
          if (gAbView.directory) {
            enabled = !gAbView.directory.readOnly;
          } else {
            enabled = true;
          }
          numSelected = gAbView.selection.count;
        } else {
          numSelected = 0;
        }
        enabled = enabled && numSelected > 0;

        if (enabled && !gAbView?.directory) {
          // Undefined gAbView.directory means "All Address Books" is selected.
          // Disable the menu/button if any selected card is from a read only
          // directory.
          enabled = !GetSelectedAbCards().some(
            card =>
              MailServices.ab.getDirectoryFromUID(card.directoryUID).readOnly
          );
        }

        if (command == "cmd_delete") {
          switch (GetSelectedCardTypes()) {
            case kSingleListOnly:
              updateDeleteControls("valueList");
              break;
            case kMultipleListsOnly:
              updateDeleteControls("valueLists");
              break;
            case kListsAndCards:
              updateDeleteControls("valueItems");
              break;
            case kCardsOnly:
            default:
              updateDeleteControls(
                numSelected < 2 ? "valueCard" : "valueCards"
              );
          }
        }
        return enabled;
      }
      case "cmd_print":
        // cmd_print is currently only used in SeaMonkey.
        // Prevent printing when we don't have an opener (browserDOMWindow is
        // null).
        const enabled = window.browserDOMWindow && GetNumSelectedCards() > 0;
        document.querySelectorAll("[command=cmd_print]").forEach(e => {
          e.disabled = !enabled;
        });
        return enabled;
      case "cmd_printcard":
        // Prevent printing when we don't have an opener (browserDOMWindow is
        // null).
        return window.browserDOMWindow && GetNumSelectedCards() > 0;
      default:
        return false;
    }
  },

  doCommand(command) {
    switch (command) {
      case "cmd_selectAll":
        if (gAbView) {
          gAbView.selection.selectAll();
        }
        break;
      case "cmd_delete":
      case "button_delete":
        AbDelete();
        break;
    }
  },
};

function updateDeleteControls(
  labelAttribute,
  accessKeyAttribute = "accesskeyDefault"
) {
  goSetMenuValue("cmd_delete", labelAttribute);
  goSetAccessKey("cmd_delete", accessKeyAttribute);

  // The toolbar button doesn't update itself from the command. Do that now.
  const button = document.getElementById("button-abdelete");
  if (!button) {
    return;
  }

  const command = document.getElementById("cmd_delete");
  button.label = command.getAttribute("label");
  button.setAttribute(
    "tooltiptext",
    button.getAttribute(
      labelAttribute == "valueCardDAV" ? "tooltipCardDAV" : "tooltipDefault"
    )
  );
}

/**
 * Generate a comma separated list of addresses from the given cards.
 *
 * @param {nsIAbCard[]} cards - The cards to get addresses for.
 * @returns {string} A string of comma separated mailboxes.
 */
function GetAddressesForCards(cards) {
  if (!cards) {
    return "";
  }

  return cards
    .map(makeMimeAddressFromCard)
    .filter(addr => addr)
    .join(",");
}

/**
 * Make a MIME encoded string output of the card. This will make a difference
 * e.g. in scenarios where non-ASCII is used in the mailbox, or when then
 * display name include special characters such as comma.
 *
 * @param {nsIAbCard} card - The card to use.
 * @returns {string} A MIME encoded mailbox representation of the card.
 */
function makeMimeAddressFromCard(card) {
  if (!card) {
    return "";
  }

  let email;
  if (card.isMailList) {
    const directory = GetDirectoryFromURI(card.mailListURI);
    email = directory.description || card.displayName;
  } else {
    email = card.emailAddresses[0];
  }
  return MailServices.headerParser.makeMimeAddress(card.displayName, email);
}
