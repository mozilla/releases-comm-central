/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../../toolkit/content/editMenuOverlay.js */
/* import-globals-from ../../../../mailnews/addrbook/content/abDragDrop.js */
/* import-globals-from ../../../../mailnews/addrbook/content/abResultsPane.js */
/* import-globals-from ../../../base/content/globalOverlay.js */
/* import-globals-from abCommon.js */

var { getSearchTokens, getModelQuery, generateQueryURI } =
  ChromeUtils.importESModule("resource:///modules/ABQueryUtils.sys.mjs");
var { UIDensity } = ChromeUtils.importESModule(
  "resource:///modules/UIDensity.sys.mjs"
);

UIDensity.registerWindow(window);

window.addEventListener("load", () => {
  AbPanelLoad();
});
window.addEventListener("unload", () => {
  AbPanelUnload();
});

// This document can be loaded with or without a query string, so the location
// we use for the XUL store must be normalised.
const xulStoreURL = location.href.replace(/\?.*/, "");
// Is the "Address Book" column hidden when "All Address Books" is selected?
// This gets special handling because the TreeView has no concept of different
// defaults that depend on the context.
let abColumnHidden =
  Services.xulStore.getValue(xulStoreURL, "abResultsTree", "abColumnHidden") ===
  "true";
let gQueryURIFormat = null;

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
  let contextMenuID;
  let positionArray;

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
    updateCardPropertiesMenu();
  }
  showContextMenu(contextMenuID, aEvent, positionArray);
}

/**
 * Update the single row card properties context menu to show or hide the "Edit"
 * menu item only depending on the selection type.
 */
function updateCardPropertiesMenu() {
  const cards = GetSelectedAbCards();

  const separator = document.getElementById("abContextBeforeEditContact");
  const menuitem = document.getElementById("abContextEditContact");

  // Only show the Edit item if one item is selected, is not a mailing list, and
  // the contact is not part of a readOnly address book.
  if (
    cards.length != 1 ||
    cards.some(c => c.isMailList) ||
    MailServices.ab.getDirectoryFromUID(cards[0].directoryUID)?.readOnly
  ) {
    separator.hidden = true;
    menuitem.hidden = true;
    return;
  }

  separator.hidden = false;
  menuitem.hidden = false;
}
/**
 * Handle the click event of the results tree (workaround for XUL tree
 * bug 1331377).
 *
 * @param aEvent  a click event
 */
function contactsListOnClick(aEvent) {
  // Any click on gAbResultsTree view (rows or blank space).
  const row = aEvent.target.closest(`tr[is="auto-tree-view-table-row"]`);
  if (!row) {
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

/**
 * Appends the currently selected cards as new recipients in the composed message.
 *
 * @param recipientType  Type of recipient, e.g. "addr_to".
 */
function addSelectedAddresses(recipientType) {
  var cards = GetSelectedAbCards();

  // Turn each card into a properly formatted address.
  const addresses = cards.map(makeMailboxObjectFromCard).filter(addr => addr);
  parent.addressRowAddRecipientsArray(
    parent.document.querySelector(
      `.address-row[data-recipienttype="${recipientType}"]`
    ),
    addresses
  );
}

/**
 * Open the address book tab and trigger the edit of the selected contact.
 */
function editSelectedAddress() {
  const cards = GetSelectedAbCards();
  window.top.toAddressBook(["cmd_editContact", cards[0]]);
}

function AddressBookMenuListChange(aValue) {
  const searchInput = document.getElementById("peopleSearchInput");
  if (searchInput.value && !searchInput.showingSearchCriteria) {
    onEnterInSearchBar();
  } else {
    ChangeDirectoryByURI(aValue);
  }

  CommandUpdate_AddressBook();
}

function AbPanelLoad() {
  document.title = parent.document.getElementById("contactsTitle").value;

  // Get the URI of the directory to display.
  let startupURI = Services.prefs.getCharPref("mail.addr_book.view.startupURI");
  // If the URI is a mailing list, use the parent directory instead, since
  // mailing lists are not displayed here.
  startupURI = startupURI.replace(/^(jsaddrbook:\/\/[\w\.-]*)\/.*$/, "$1");

  const abPopup = document.getElementById("addressbookList");
  abPopup.value = startupURI;

  // If provided directory is not on abPopup, fall back to All Address Books.
  if (!abPopup.selectedItem) {
    abPopup.selectedIndex = 0;
  }

  const searchBar = document.getElementById("peopleSearchInput");
  if (location.search == "?focus") {
    searchBar.focus();
  }
  searchBar.addEventListener("autocomplete", () => onEnterInSearchBar());
  searchBar.addEventListener("search", event => event.preventDefault());

  window.controllers.appendController(ResultsPaneController);
  gAbResultsTree = document.getElementById("abResultsTree");
  gAbResultsTree.setAttribute("rows", "auto-tree-view-table-row");
  gAbResultsTree.defaultColumns = [
    {
      id: "GeneratedName",
      l10n: {
        header: "about-addressbook-column-header-generatedname2",
        menuitem: "about-addressbook-column-label-generatedname2",
        cell: "about-addressbook-cell-generatedname2",
      },
      picker: false,
    },
    {
      id: "EmailAddresses",
      l10n: {
        header: "about-addressbook-column-header-emailaddresses2",
        menuitem: "about-addressbook-column-label-emailaddresses2",
        cell: "about-addressbook-cell-emailaddresses2",
      },
      hidden: true,
    },
    {
      id: "addrbook",
      l10n: {
        header: "about-addressbook-column-header-addrbook2",
        menuitem: "about-addressbook-column-label-addrbook2",
        cell: "about-addressbook-cell-addrbook2",
      },
      hidden: true,
      picker: false,
    },
  ];

  gAbResultsTree.table.addEventListener("contextmenu", event =>
    contactsListOnContextMenu(event)
  );
  gAbResultsTree.table.body.addEventListener("click", event =>
    contactsListOnClick(event)
  );
  gAbResultsTree.addEventListener("select", () => {
    gAbResultsTree.view.selectionChanged();
    document.commandDispatcher.updateCommands("addrbook-select");
  });
  gAbResultsTree.table.addEventListener("dragstart", event =>
    abResultsPaneObserver.onDragStart(event)
  );
  gAbResultsTree.addEventListener("columns-changed", event => {
    if (event.detail.value == "addrbook") {
      abColumnHidden = !event.detail.target.hasAttribute("checked");
      Services.xulStore.setValue(
        xulStoreURL,
        "abResultsTree",
        "abColumnHidden",
        abColumnHidden
      );
    }
  });

  // Postpone the slow contacts load so that the sidebar document
  // gets a chance to display quickly.
  setTimeout(ChangeDirectoryByURI, 0, abPopup.value);
}

function AbPanelUnload() {
  // If there's no default startupURI, save the last used URI as new startupURI.
  if (!Services.prefs.getBoolPref("mail.addr_book.view.startupURIisDefault")) {
    Services.prefs.setCharPref(
      "mail.addr_book.view.startupURI",
      getSelectedDirectoryURI()
    );
  }

  CloseAbView();
}

function CommandUpdate_AddressBook() {
  // Toggle disable state of to,cc,bcc buttons.
  const disabled = GetNumSelectedCards() == 0 ? "true" : "false";
  document.getElementById("cmd_addrTo").setAttribute("disabled", disabled);
  document.getElementById("cmd_addrCc").setAttribute("disabled", disabled);
  document.getElementById("cmd_addrBcc").setAttribute("disabled", disabled);

  goUpdateCommand("cmd_delete");
}

/**
 * Handle the onpopupshowing event of #sidebarAbContextMenu.
 * Update the checkmark of #sidebarAbContext-startupDir menuitem when context
 * menu opens, so as to always be in sync with changes from the main AB window.
 */
function onAbContextShowing() {
  const startupItem = document.getElementById("sidebarAbContext-startupDir");
  if (Services.prefs.getBoolPref("mail.addr_book.view.startupURIisDefault")) {
    const startupURI = Services.prefs.getCharPref(
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

  const searchURI = getSelectedDirectoryURI();
  let searchQuery;
  const searchInput = document.getElementById("peopleSearchInput");

  // Use helper method to split up search query to multi-word search
  // query against multiple fields.
  if (searchInput) {
    const searchWords = getSearchTokens(searchInput.value);
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
  const theContextMenu = document.getElementById(aContextMenuID);
  if (!aPositionArray) {
    aPositionArray = [null, "", aEvent.clientX, aEvent.clientY, true];
  }
  theContextMenu.openPopup(...aPositionArray);
}

/**
 * Get the URI of the selected directory.
 *
 * @returns The URI of the currently selected directory
 */
function getSelectedDirectoryURI() {
  return document.getElementById("addressbookList").value;
}

function abToggleSelectedDirStartup() {
  const selectedDirURI = getSelectedDirectoryURI();
  if (!selectedDirURI) {
    return;
  }

  const isDefault = Services.prefs.getBoolPref(
    "mail.addr_book.view.startupURIisDefault"
  );
  const startupURI = Services.prefs.getCharPref(
    "mail.addr_book.view.startupURI"
  );

  if (isDefault && startupURI == selectedDirURI) {
    // The current directory has been the default startup view directory;
    // toggle that off now. So there's no default startup view directory any more.
    Services.prefs.setBoolPref(
      "mail.addr_book.view.startupURIisDefault",
      false
    );
  } else {
    // The current directory will now be the default view
    // when starting up the main AB window.
    Services.prefs.setCharPref(
      "mail.addr_book.view.startupURI",
      selectedDirURI
    );
    Services.prefs.setBoolPref("mail.addr_book.view.startupURIisDefault", true);
  }

  // Update the checkbox in the menuitem.
  goUpdateCommand("cmd_abToggleStartupDir");
}

function ChangeDirectoryByURI(uri = kPersonalAddressbookURI) {
  // Hide the "Address Book" column if the selected address book isn't "All
  // Address Books". The column is hidden in all other cases. Also, disable
  // the column in the column picker.
  const isAllBooks = uri.startsWith(kAllDirectoryRoot + "?");

  // Change the default, so "Restore default columns" works sensibly.
  const defaultColumn = gAbResultsTree.defaultColumns.find(
    c => c.id == "addrbook"
  );
  defaultColumn.picker = isAllBooks;
  defaultColumn.hidden = !isAllBooks;

  // Change the current columns.
  const currentColumn = gAbResultsTree.table.columns.find(
    c => c.id == "addrbook"
  );
  currentColumn.picker = isAllBooks;
  gAbResultsTree.changeColumns("addrbook", !isAllBooks || abColumnHidden);

  SetAbView(uri);
}
