/* -*- Mode: javascript; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 ; js-indent-level: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Use of items in this file require:
 *
 * GetSelectedDirectory()
 *   returns the URI of the selected directory
 * AbResultsPaneDoubleClick(card)
 *   Is called when the results pane is double-clicked, with the clicked card.
 * AbEditCard(card)
 *   Is called when a card is to be edited, with the card as the parameter.
 *
 * The following function is only required if ResultsPaneController is used:
 *
 * goSetMenuValue()
 *   Core function in globalOverlay.js
 */

// List/card selections in the results pane.
var kNothingSelected = 0;
var kListsAndCards = 1;
var kMultipleListsOnly = 2;
var kSingleListOnly = 3;
var kCardsOnly = 4;

// Global Variables

// gAbView holds an object with an nsIAbView interface
var gAbView = null;
// Holds a reference to the "abResultsTree" document element. Initially
// set up by SetAbView.
var gAbResultsTree = null;

function SetAbView(aURI)
{
  // If we don't have a URI, just clear the view and leave everything else
  // alone.
  if (!aURI) {
    gAbView.clearView();
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
  }
  else {
    if (gAbResultsTree.hasAttribute("sortCol"))
      sortColumn = gAbResultsTree.getAttribute("sortCol");
    var sortColumnNode = document.getElementById(sortColumn);
    if (sortColumnNode && sortColumnNode.hasAttribute("sortDirection"))
      sortDirection = sortColumnNode.getAttribute("sortDirection");
  }

  var directory = GetDirectoryFromURI(aURI);

  if (!gAbView)
    gAbView = Components.classes["@mozilla.org/addressbook/abview;1"]
                        .createInstance(Components.interfaces.nsIAbView);

  var actualSortColumn = gAbView.setView(directory, GetAbViewListener(),
                                         sortColumn, sortDirection);

  gAbResultsTree.treeBoxObject.view =
    gAbView.QueryInterface(Components.interfaces.nsITreeView);

  UpdateSortIndicators(actualSortColumn, sortDirection);

  // If the selected address book is LDAP and the search box is empty,
  // inform the user of the empty results pane.
  let abResultsTree = document.getElementById("abResultsTree");
  let cardViewOuterBox = document.getElementById("CardViewOuterBox");
  let blankResultsPaneMessageBox = document.getElementById("blankResultsPaneMessageBox");
  if (aURI.startsWith("moz-abldapdirectory://") && !aURI.includes("?")) {
    if (abResultsTree)
      abResultsTree.hidden = true;
    if (cardViewOuterBox)
      cardViewOuterBox.hidden = true;
    if (blankResultsPaneMessageBox)
      blankResultsPaneMessageBox.hidden = false;
  } else {
    if (abResultsTree)
      abResultsTree.hidden = false;
    if (cardViewOuterBox)
      cardViewOuterBox.hidden = false;
    if (blankResultsPaneMessageBox)
      blankResultsPaneMessageBox.hidden = true;
  }
}

function CloseAbView()
{
  if (gAbView)
    gAbView.clearView();
}

function GetOneOrMoreCardsSelected()
{
  return (gAbView && (gAbView.selection.getRangeCount() > 0));
}

function GetSelectedAddresses()
{
  return GetAddressesForCards(GetSelectedAbCards());
}

function GetNumSelectedCards()
{
 try {
   return gAbView.selection.count;
 }
 catch (ex) {
 }

 // if something went wrong, return 0 for the count.
 return 0;
}

function GetSelectedCardTypes()
{
  var cards = GetSelectedAbCards();
  if (!cards) {
    Components.utils.reportError("ERROR: GetSelectedCardTypes: |cards| is null.");
    return kNothingSelected; // no view
  }
  var count = cards.length;
  if (count == 0)
    return kNothingSelected;  // nothing selected

  var mailingListCnt = 0;
  var cardCnt = 0;
  for (let i = 0; i < count; i++) {
    // We can assume no values from GetSelectedAbCards will be null.
    if (cards[i].isMailList)
      mailingListCnt++;
    else
      cardCnt++;
  }

  return (mailingListCnt == 0) ? kCardsOnly :
           (cardCnt > 0) ? kListsAndCards :
             (mailingListCnt == 1) ? kSingleListOnly :
               kMultipleListsOnly;
}

// NOTE, will return -1 if more than one card selected, or no cards selected.
function GetSelectedCardIndex()
{
  if (!gAbView)
    return -1;

  var treeSelection = gAbView.selection;
  if (treeSelection.getRangeCount() == 1) {
    var start = new Object;
    var end = new Object;
    treeSelection.getRangeAt(0, start, end);
    if (start.value == end.value)
      return start.value;
  }

  return -1;
}

// NOTE, returns the card if exactly one card is selected, null otherwise
function GetSelectedCard()
{
  var index = GetSelectedCardIndex();
  return (index == -1) ? null : gAbView.getCardFromRow(index);
}

/**
 * Return a (possibly empty) list of cards
 *
 * It pushes only non-null/empty element, if any, into the returned list.
 */
function GetSelectedAbCards()
{
  var abView = gAbView;

  // if sidebar is open, and addressbook panel is open and focused,
  // then use the ab view from sidebar (gCurFrame is from sidebarOverlay.js)
  if (document.getElementById("sidebar-box")) {
    const abPanelUrl =
      "chrome://messenger/content/addressbook/addressbook-panel.xul";
    if (gCurFrame &&
        gCurFrame.getAttribute("src") == abPanelUrl &&
        document.commandDispatcher.focusedWindow == gCurFrame.contentDocument.defaultView)
      abView = gCurFrame.contentDocument.defaultView.gAbView;
  }

  if (!abView)
    return [];

  let cards = [];
  var count = abView.selection.getRangeCount();
  var current = 0;
  for (let i = 0; i < count; ++i) {
    let start = {};
    let end = {};

    abView.selection.getRangeAt(i, start, end);

    for (let j = start.value; j <= end.value; ++j) {
      // avoid inserting null element into the list. GetRangeAt() may be buggy.
      let tmp = abView.getCardFromRow(j);
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
function GetSelectedRows()
{
  var selectedRows = "";

  if (!gAbView)
    return selectedRows;

  var rangeCount = gAbView.selection.getRangeCount();
  for (let i = 0; i < rangeCount; ++i) {
    var start = new Object;
    var end = new Object;
    gAbView.selection.getRangeAt(i, start, end);
    for (let j = start.value;j <= end.value; ++j) {
      if (selectedRows)
        selectedRows += ",";
      selectedRows += j;
    }
  }

  return selectedRows;
}

function AbSwapFirstNameLastName()
{
  if (gAbView)
    gAbView.swapFirstNameLastName();
}

function AbEditSelectedCard()
{
  AbEditCard(GetSelectedCard());
}

function AbResultsPaneOnClick(event)
{
  // we only care about button 0 (left click) events
  if (event.button != 0) return;

  // all we need to worry about here is double clicks
  // and column header clicks.
  //
  // we get in here for clicks on the "treecol" (headers)
  // and the "scrollbarbutton" (scrollbar buttons)
  // we don't want those events to cause a "double click"

  var t = event.originalTarget;

  if (t.localName == "treecol") {
    var sortDirection;
    var currentDirection = t.getAttribute("sortDirection");

    // Revert the sort order. If none is set, use Ascending.
    sortDirection = currentDirection == kDefaultAscending ?
                                        kDefaultDescending : kDefaultAscending;

    SortAndUpdateIndicators(t.id, sortDirection);
  }
  else if (t.localName == "treechildren") {
    // figure out what row the click was in
    var row = gAbResultsTree.treeBoxObject.getRowAt(event.clientX,
                                                    event.clientY);
    if (row == -1)
      return;

    if (event.detail == 2)
      AbResultsPaneDoubleClick(gAbView.getCardFromRow(row));
  }
}

function AbSortAscending()
{
  var sortColumn = gAbResultsTree.getAttribute("sortCol");
  SortAndUpdateIndicators(sortColumn, kDefaultAscending);
}

function AbSortDescending()
{
  var sortColumn = gAbResultsTree.getAttribute("sortCol");
  SortAndUpdateIndicators(sortColumn, kDefaultDescending);
}

function SortResultPane(sortColumn)
{
  var sortDirection = kDefaultAscending;
  if (gAbView)
     sortDirection = gAbView.sortDirection;

  SortAndUpdateIndicators(sortColumn, sortDirection);
}

function SortAndUpdateIndicators(sortColumn, sortDirection)
{
  UpdateSortIndicators(sortColumn, sortDirection);

  if (gAbView)
    gAbView.sortBy(sortColumn, sortDirection);
}

function UpdateSortIndicators(colID, sortDirection)
{
  var sortedColumn = null;

  // set the sort indicator on the column we are sorted by
  if (colID) {
    sortedColumn = document.getElementById(colID);
    if (sortedColumn) {
      sortedColumn.setAttribute("sortDirection",sortDirection);
      gAbResultsTree.setAttribute("sortCol", colID);
    }
  }

  // remove the sort indicator from all the columns
  // except the one we are sorted by
  var currCol = gAbResultsTree.firstChild.firstChild;
  while (currCol) {
    if (currCol != sortedColumn && currCol.localName == "treecol")
      currCol.removeAttribute("sortDirection");
    currCol = currCol.nextSibling;
  }
}

function InvalidateResultsPane()
{
  if (gAbResultsTree)
    gAbResultsTree.treeBoxObject.invalidate();
}

// Controller object for Results Pane
var ResultsPaneController =
{
  supportsCommand: function(command)
  {
    switch (command) {
      case "cmd_selectAll":
      case "cmd_delete":
      case "button_delete":
      case "cmd_properties":
      case "cmd_newlist":
      case "cmd_newCard":
        return true;
      default:
        return false;
    }
  },

  isCommandEnabled: function(command)
  {
    switch (command) {
      case "cmd_selectAll":
        return true;
      case "cmd_delete":
      case "button_delete":
        var numSelected;
        var enabled = false;
        if (gAbView && gAbView.selection) {
          if (gAbView.directory)
            enabled = !gAbView.directory.readOnly;
          numSelected = gAbView.selection.count;
        }
        else
          numSelected = 0;

        // fix me, don't update on isCommandEnabled
        if (command == "cmd_delete") {
          switch (GetSelectedCardTypes()) {
            case kSingleListOnly:
              goSetMenuValue(command, "valueList");
              break;
            case kMultipleListsOnly:
              goSetMenuValue(command, "valueLists");
              break;
            case kListsAndCards:
              goSetMenuValue(command, "valueItems");
              break;
            case kCardsOnly:
            default:
              if (numSelected < 2)
                goSetMenuValue(command, "valueCard");
              else
                goSetMenuValue(command, "valueCards");
              break;
          }
        }
        return (enabled && (numSelected > 0));
      case "cmd_properties":
        // While "Edit Contact" dialogue is still modal (bug 115904, bug 135126),
        // only enable "Properties" button for single selection; then fix bug 119999.
        return (GetNumSelectedCards() == 1);
      case "cmd_newlist":
      case "cmd_newCard":
        return true;
      default:
        return false;
    }
  },

  doCommand: function(command)
  {
    switch (command) {
      case "cmd_selectAll":
        if (gAbView)
          gAbView.selectAll();
        break;
      case "cmd_delete":
      case "button_delete":
        AbDelete();
        break;
      case "cmd_properties":
        AbEditSelectedCard();
        break;
      case "cmd_newlist":
        AbNewList();
        break;
      case "cmd_newCard":
        AbNewCard();
        break;
    }
  },

  onEvent: function(event)
  {
    // on blur events set the menu item texts back to the normal values
    if (event == "blur")
      goSetMenuValue("cmd_delete", "valueDefault");
  }
};

function SelectFirstCard()
{
  if (gAbView && gAbView.selection && (gAbView.selection.count > 0))
    gAbView.selection.select(0);
}
