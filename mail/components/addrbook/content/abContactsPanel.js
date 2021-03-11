/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from abCommon.js */

var { getSearchTokens, getModelQuery, generateQueryURI } = ChromeUtils.import(
  "resource:///modules/ABQueryUtils.jsm"
);

var gQueryURIFormat = null;

function GetAbViewListener() {
  // the ab panel doesn't care if the total changes, or if the selection changes
  return null;
}

/**
 * Handle the command event on abContextMenuButton (click, Enter, spacebar).
 */
function abContextMenuButtonOnCommand(event) {
  showContextMenu("sidebarAbContextMenu", event, [
    event.target,
    "after_end",
    0,
    0,
    true,
  ]);
}

/**
 * Handle the context menu event of results tree (right-click, context menu key
 * press, etc.). Show the respective context menu for selected contact(s) or
 * results tree blank space (work around for XUL tree bug 1331377).
 *
 * @param aEvent  a context menu event (right-click, context menu key press, etc.)
 */
function contactsListOnContextMenu(aEvent) {
  let target = aEvent.target;
  let contextMenuID;
  let positionArray;

  // For right-click on column header or column picker, don't show context menu.
  if (target.localName == "treecol" || target.localName == "treecolpicker") {
    return;
  }

  // On treechildren, if there's no selection, show "sidebarAbContextMenu".
  if (gAbView.selection.count == 0) {
    contextMenuID = gAbResultsTree.getAttribute("contextNoSelection");
    // If "sidebarAbContextMenu" menu was activated by keyboard,
    // position it in the topleft corner of gAbResultsTree.
    if (!aEvent.button) {
      positionArray = [gAbResultsTree, "overlap", 0, 0, true];
    }
    // If there's a selection, show "cardProperties" context menu.
  } else {
    contextMenuID = gAbResultsTree.getAttribute("contextSelection");
  }
  showContextMenu(contextMenuID, aEvent, positionArray);
}

/**
 * Handle the click event of the results tree (workaround for XUL tree
 * bug 1331377).
 *
 * @param aEvent  a click event
 */
function contactsListOnClick(aEvent) {
  CommandUpdate_AddressBook();

  let target = aEvent.target;

  // Left click on column header: Change sort direction.
  if (target.localName == "treecol" && aEvent.button == 0) {
    let sortDirection =
      target.getAttribute("sortDirection") == kDefaultDescending
        ? kDefaultAscending
        : kDefaultDescending;
    SortAndUpdateIndicators(target.id, sortDirection);
    return;
  }
  // Any click on gAbResultsTree view (rows or blank space).
  if (target.localName == "treechildren") {
    let row = gAbResultsTree.getRowAt(aEvent.clientX, aEvent.clientY);
    if (row < 0 || row >= gAbResultsTree.view.rowCount) {
      // Any click on results tree whitespace.
      if ((aEvent.detail == 1 && aEvent.button == 0) || aEvent.button == 2) {
        // Single left click or any right click on results tree blank space:
        // Clear selection. This also triggers on the first click of any
        // double-click, but that's ok. MAC OS X doesn't return event.detail==1
        // for single right click, so we also let this trigger for the second
        // click of right double-click.
        gAbView.selection.clearSelection();
      }
    } else if (aEvent.button == 0 && aEvent.detail == 2) {
      // Any click on results tree rows.
      // Double-click on a row: Go ahead and add the entry.
      addSelectedAddresses("addr_to");
    }
  }
}

/**
 * Appends the currently selected cards as new recipients in the composed message.
 *
 * @param aRecipientType  Type of recipient, e.g. "addr_to".
 */
function addSelectedAddresses(aRecipientType) {
  var cards = GetSelectedAbCards();

  // Turn each card into a properly formatted address.
  let addresses = cards.map(makeMailboxObjectFromCard).filter(addr => addr);
  parent.awAddRecipientsArray(aRecipientType, addresses);
}

function AddressBookMenuListChange(aValue) {
  let searchInput = document.getElementById("peopleSearchInput");
  if (searchInput.value && !searchInput.showingSearchCriteria) {
    onEnterInSearchBar();
  } else {
    ChangeDirectoryByURI(aValue);
  }

  // Hide the addressbook column if the selected addressbook isn't
  // "All address books". Since the column is redundant in all other cases.
  let addrbookColumn = document.getElementById("addrbook");
  if (abList.value.startsWith(kAllDirectoryRoot + "?")) {
    addrbookColumn.hidden = !gShowAbColumnInComposeSidebar;
    addrbookColumn.removeAttribute("ignoreincolumnpicker");
  } else {
    addrbookColumn.hidden = true;
    addrbookColumn.setAttribute("ignoreincolumnpicker", "true");
  }

  CommandUpdate_AddressBook();
}

var mutationObs = null;

function AbPanelLoad() {
  if (location.search == "?focus") {
    document.getElementById("peopleSearchInput").focus();
  }

  InitCommonJS();

  document.title = parent.document.getElementById("sidebar-title").value;

  // Get the URI of the directory to display.
  let startupURI = Services.prefs.getCharPref("mail.addr_book.view.startupURI");
  // If the URI is a mailing list, use the parent directory instead, since
  // mailing lists are not displayed here.
  startupURI = startupURI.replace(/^(jsaddrbook:\/\/[\w\.-]*)\/.*$/, "$1");

  let abPopup = document.getElementById("addressbookList");
  abPopup.value = startupURI;

  // If provided directory is not on abPopup, fall back to All Address Books.
  if (!abPopup.selectedItem) {
    abPopup.selectedIndex = 0;
  }

  // Postpone the slow contacts load so that the sidebar document
  // gets a chance to display quickly.
  setTimeout(ChangeDirectoryByURI, 0, abPopup.value);

  mutationObs = new MutationObserver(function(aMutations) {
    aMutations.forEach(function(mutation) {
      if (
        getSelectedDirectoryURI() == kAllDirectoryRoot + "?" &&
        mutation.type == "attributes" &&
        mutation.attributeName == "hidden"
      ) {
        let curState = document.getElementById("addrbook").hidden;
        gShowAbColumnInComposeSidebar = !curState;
      }
    });
  });

  document.getElementById("addrbook").hidden = !gShowAbColumnInComposeSidebar;

  mutationObs.observe(document.getElementById("addrbook"), {
    attributes: true,
    childList: true,
  });
}

function AbPanelUnload() {
  mutationObs.disconnect();

  // If there's no default startupURI, save the last used URI as new startupURI.
  if (!Services.prefs.getBoolPref("mail.addr_book.view.startupURIisDefault")) {
    Services.prefs.setCharPref(
      "mail.addr_book.view.startupURI",
      getSelectedDirectoryURI()
    );
  }

  CloseAbView();
}

function AbPanelNewCard() {
  goNewCardDialog(abList.value);
}

function AbPanelNewList() {
  goNewListDialog(abList.value);
}

function ResultsPaneSelectionChanged() {
  // do nothing for ab panel
}

function OnClickedCard() {
  // do nothing for ab panel
}

function AbResultsPaneDoubleClick(card) {
  // double click for ab panel means "send mail to this person / list"
  AbNewMessage();
}

function UpdateCardView() {
  // do nothing for ab panel
}

function CommandUpdate_AddressBook() {
  // Toggle disable state of to,cc,bcc buttons.
  let disabled = GetNumSelectedCards() == 0 ? "true" : "false";
  document.getElementById("cmd_addrTo").setAttribute("disabled", disabled);
  document.getElementById("cmd_addrCc").setAttribute("disabled", disabled);
  document.getElementById("cmd_addrBcc").setAttribute("disabled", disabled);

  goUpdateCommand("cmd_delete");
  goUpdateCommand("cmd_properties");
}

/**
 * Handle the onpopupshowing event of #sidebarAbContextMenu.
 * Update the checkmark of #sidebarAbContext-startupDir menuitem when context
 * menu opens, so as to always be in sync with changes from the main AB window.
 */
function onAbContextShowing() {
  let startupItem = document.getElementById("sidebarAbContext-startupDir");
  if (Services.prefs.getBoolPref("mail.addr_book.view.startupURIisDefault")) {
    let startupURI = Services.prefs.getCharPref(
      "mail.addr_book.view.startupURI"
    );
    startupItem.setAttribute(
      "checked",
      startupURI == getSelectedDirectoryURI()
    );
  } else {
    startupItem.setAttribute("checked", "false");
  }
}

function onEnterInSearchBar() {
  if (!gQueryURIFormat) {
    // Get model query from pref. We don't want the query starting with "?"
    // as we have to prefix "?and" to this format.
    /* eslint-disable no-global-assign */
    gQueryURIFormat = getModelQuery("mail.addr_book.quicksearchquery.format");
    /* eslint-enable no-global-assign */
  }

  let searchURI = getSelectedDirectoryURI();
  let searchQuery;
  let searchInput = document.getElementById("peopleSearchInput");

  // Use helper method to split up search query to multi-word search
  // query against multiple fields.
  if (searchInput) {
    let searchWords = getSearchTokens(searchInput.value);
    searchQuery = generateQueryURI(gQueryURIFormat, searchWords);
  }

  SetAbView(searchURI, searchQuery, searchInput ? searchInput.value : "");
}

/**
 * Open a menupopup as a context menu
 *
 * @param aContextMenuID The ID of a menupopup to be shown as context menu
 * @param aEvent         The event which triggered this.
 * @param positionArray  An optional array containing the parameters for openPopup() method;
 *                       if omitted, mouse pointer position will be used.
 */
function showContextMenu(aContextMenuID, aEvent, aPositionArray) {
  let theContextMenu = document.getElementById(aContextMenuID);
  if (!aPositionArray) {
    aPositionArray = [null, "", aEvent.clientX, aEvent.clientY, true];
  }
  theContextMenu.openPopup(...aPositionArray);
}
