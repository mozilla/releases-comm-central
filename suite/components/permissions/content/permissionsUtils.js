/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function DeleteAllFromTree
    (tree, view, table, deletedTable, removeButton, removeAllButton) {

  gTreeUtils.deleteAll(tree, view, table, deletedTable);

  // disable buttons
  document.getElementById(removeButton).setAttribute("disabled", "true")
  document.getElementById(removeAllButton).setAttribute("disabled","true");
}

function DeleteSelectedItemFromTree
    (tree, view, table, deletedTable, removeButton, removeAllButton) {

  gTreeUtils.deleteSelectedItems(tree, view, table, deletedTable);

  // disable buttons if nothing left in the table
  if (!table.length) {
    document.getElementById(removeButton).setAttribute("disabled", "true")
    document.getElementById(removeAllButton).setAttribute("disabled","true");
  }
}

function GetTreeSelections(tree) {
  var selections = [];
  var select = tree.view.selection;
  if (select) {
    var count = select.getRangeCount();
    var min = new Object();
    var max = new Object();
    for (var i=0; i<count; i++) {
      select.getRangeAt(i, min, max);
      for (var k=min.value; k<=max.value; k++) {
        if (k != -1) {
          selections[selections.length] = k;
        }
      }
    }
  }
  return selections;
}

function SortTree(tree, view, table, column, lastSortColumn, lastSortAscending, updateSelection) {

  // remember which item was selected so we can restore it after the sort
  var selections = GetTreeSelections(tree);
  var selectedNumber = selections.length ? table[selections[0]].id : -1;

  // do the sort or re-sort
  // this is a temporary hack for 1.7, we should implement
  // display and sort variables here for trees in general
  var sortColumn;
  var comparator;
  if (column == "expires") {
    sortColumn = "expiresSortValue";
    comparator = function compare(a, b) { return a - b; };
  } else {
    sortColumn = column;
    comparator = function compare(a, b) {
      return a.toLowerCase().localeCompare(b.toLowerCase());
    };
  }
  if (lastSortColumn == "expires") {
    lastSortColumn = "expiresSortValue";
  }
  var ascending = gTreeUtils.sort(tree, view, table, sortColumn, comparator,
                                  lastSortColumn, lastSortAscending);

  // restore the selection
  if (selectedNumber >= 0 && updateSelection) {
    var selectedRow = -1;
    for (var s = 0; s < table.length; s++) {
      if (table[s].id == selectedNumber) {
        selectedRow = s;
        break;
      }
    }

    if (selectedRow > 0) {
      // update selection and display the results
      tree.view.selection.select(selectedRow);
      tree.treeBoxObject.invalidate();
      tree.treeBoxObject.ensureRowIsVisible(selectedRow);
    }
  }

  return ascending;
}

function handleHostInput(aValue) {
  // trim any leading and trailing spaces and scheme
  // and set buttons appropiately
  btnDisable(!trimSpacesAndScheme(aValue));
}

function trimSpacesAndScheme(aString) {
  if (!aString)
    return "";
  return aString.trim().replace(/([-\w]*:\/+)?/, "");
}

function btnDisable(aDisabled) {
  document.getElementById("btnSession").disabled = aDisabled;
  document.getElementById("btnBlock").disabled = aDisabled;
  document.getElementById("btnAllow").disabled = aDisabled;
}

function PermissionSelected(tree) {
  var hasSelection = tree.view.selection.count > 0;
  document.getElementById("removePermission").disabled = !hasSelection;
}

function SetSortDirection(tree, column, ascending) {
  // first we need to get the right elements
  for (let col of tree.getElementsByTagName("treecol")) {
    if (col.id == column) {
      // set the sortDirection attribute to get the styling going
      col.setAttribute("sortDirection", ascending ? "ascending" : "descending");
    }
    else {
      // clear out the sortDirection attribute on the rest of the columns
      col.removeAttribute("sortDirection");
    }
  }
}
