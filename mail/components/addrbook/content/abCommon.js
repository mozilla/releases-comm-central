/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../../toolkit/content/globalOverlay.js */
/* import-globals-from ../../../base/content/utilityOverlay.js */
/* import-globals-from abTrees.js */
/* global ResultsPaneSelectionChanged */ // addressbook.js and abContactsPanel.js have their own implementations.
/* global onEnterInSearchBar */ // addressbook.js and abContactsPanel.js have their own implementations.

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { FileUtils } = ChromeUtils.import("resource://gre/modules/FileUtils.jsm");
var { PrivateBrowsingUtils } = ChromeUtils.import(
  "resource://gre/modules/PrivateBrowsingUtils.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "CardDAVDirectory",
  "resource:///modules/CardDAVDirectory.jsm"
);

var gDirTree;
var abList = null;
var gAbResultsTree = null;
var gAbView = null;
var gAddressBookBundle;
// A boolean variable determining whether AB column should be shown
// in Contacts Sidebar in compose window.
var gShowAbColumnInComposeSidebar = false;

var kDefaultSortColumn = "GeneratedName";
var kDefaultAscending = "ascending";
var kDefaultDescending = "descending";
// kDefaultYear will be used in birthday calculations when no year is given;
// this is a leap year so that Feb 29th works.
const kDefaultYear = nearestLeap(new Date().getFullYear());
const kMaxYear = 9999;
const kMinYear = 1;
var kAllDirectoryRoot = "moz-abdirectory://";
var kLdapUrlPrefix = "moz-abldapdirectory://";
var kPersonalAddressbookURI = "jsaddrbook://abook.sqlite";
var kCollectedAddressbookURI = "jsaddrbook://history.sqlite";
// The default, generic contact image is displayed via CSS when the photoURI is
// blank.
var defaultPhotoURI = "";

var PERMS_DIRECTORY = parseInt("0755", 8);

// Controller object for Dir Pane
var DirPaneController = {
  supportsCommand(command) {
    switch (command) {
      case "cmd_selectAll":
      case "cmd_delete":
      case "button_delete":
      case "cmd_properties":
      case "cmd_syncDirectory":
      case "cmd_abToggleStartupDir":
      case "cmd_printcard":
      case "cmd_newlist":
      case "cmd_newCard":
      case "cmd_rename":
        return true;
      default:
        return false;
    }
  },

  isCommandEnabled(command) {
    switch (command) {
      case "cmd_selectAll":
        // The gDirTree pane only handles single selection, but normally we
        // enable cmd_selectAll as it will get forwarded to the results pane.
        // But if there is no gAbView, disable as we can't forward to anywhere.
        return gAbView != null;
      case "cmd_delete":
      case "button_delete": {
        let selectedDir = getSelectedDirectory();
        if (!selectedDir) {
          return false;
        }
        let selectedDirURI = selectedDir.URI;

        // Context-sensitive labels for Edit > Delete menuitem.
        // We only have ABs or Mailing Lists in the directory pane.
        // For contacts and mixed selections, the label is set in
        // ResultsPaneController in abResultsPane.js.
        if (command == "cmd_delete") {
          if (selectedDir.isMailList) {
            updateDeleteControls("valueList");
          } else if (
            selectedDir.dirType == Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE
          ) {
            updateDeleteControls("valueCardDAV", "accesskeyCardDAV");
          } else {
            updateDeleteControls("valueAddressBook");
          }
        }

        // If it's one of these special ABs, return false to disable deletion.
        if (
          selectedDirURI == kPersonalAddressbookURI ||
          selectedDirURI == kCollectedAddressbookURI ||
          selectedDirURI == kAllDirectoryRoot + "?"
        ) {
          return false;
        }

        // If the directory is a mailing list, and it is read-only,
        // return false to disable deletion.
        if (selectedDir.isMailList && selectedDir.readOnly) {
          return false;
        }

        // If the selected directory is an ldap directory,
        // and if the prefs for this directory are locked,
        // return false to disable deletion.
        if (selectedDirURI.startsWith(kLdapUrlPrefix)) {
          let disable = false;
          try {
            let prefName = selectedDirURI.substr(kLdapUrlPrefix.length);
            disable = Services.prefs.getBoolPref(prefName + ".disable_delete");
          } catch (ex) {
            // If this preference is not set, that's ok.
          }
          if (disable) {
            return false;
          }
        }

        // Else return true to enable deletion (default).
        return true;
      }
      case "cmd_printcard":
        // Prevent printing when we don't have an opener (browserDOMWindow is
        // null).
        return window.browserDOMWindow && GetSelectedCardIndex() != -1;
      case "cmd_properties": {
        let attrs = {
          label: "valueGeneric",
          accesskey: "valueGenericAccessKey",
          tooltiptext: "valueGenericTooltipText",
        };
        let selectedDir = getSelectedDirectory();
        if (selectedDir) {
          let isMailList = selectedDir.isMailList;
          attrs.label = isMailList ? "valueMailingList" : "valueAddressBook";
          attrs.accesskey = isMailList
            ? "valueMailingListAccessKey"
            : "valueAddressBookAccessKey";
          attrs.tooltiptext = isMailList
            ? "valueMailingListTooltipText"
            : "valueAddressBookTooltipText";
        }
        let enabled = selectedDir != null;
        document.querySelectorAll("[command=cmd_properties]").forEach(e => {
          e.disabled = !enabled;
          for (let [attr, name] of Object.entries(attrs)) {
            if (e.hasAttribute(attr) && e.getAttribute(name)) {
              e.setAttribute(attr, e.getAttribute(name));
            }
          }
        });
        return enabled;
      }
      case "cmd_syncDirectory":
        let selectedDir = getSelectedDirectory();
        return selectedDir && selectedDir.dirType == 102;
      case "cmd_abToggleStartupDir":
        return !!getSelectedDirectoryURI();
      case "cmd_rename":
        let selectedDirectoryURI = getSelectedDirectoryURI();
        // Prevent the renaming of Personal Address Book, Collected Addresses and All Address Books directories
        if (
          !selectedDirectoryURI ||
          selectedDirectoryURI == kAllDirectoryRoot + "?" ||
          selectedDirectoryURI == kPersonalAddressbookURI ||
          selectedDirectoryURI == kCollectedAddressbookURI
        ) {
          return false;
        }
        return true;
      case "cmd_newlist":
      case "cmd_newCard":
        return true;
      default:
        return false;
    }
  },

  doCommand(command) {
    switch (command) {
      case "cmd_printcard":
      case "cmd_selectAll":
        SendCommandToResultsPane(command);
        break;
      case "cmd_delete":
      case "button_delete":
        if (gDirTree) {
          AbDeleteSelectedDirectory();
        }
        break;
      case "cmd_properties":
        AbEditSelectedDirectory();
        break;
      case "cmd_syncDirectory":
        AbSyncSelectedDirectory();
        break;
      case "cmd_abToggleStartupDir":
        abToggleSelectedDirStartup();
        break;
      case "cmd_newlist":
        AbNewList();
        break;
      case "cmd_newCard":
        AbNewCard();
        break;
      case "cmd_rename":
        AbRenameDirectory();
        break;
    }
  },
};

function SendCommandToResultsPane(command) {
  ResultsPaneController.doCommand(command);

  // if we are sending the command so the results pane
  // we should focus the results pane
  gAbResultsTree.focus();
}

function AbShowNewDirectoryDialog(url) {
  let params = {
    onNewDirectory(newDirectory) {
      gDirectoryTreeView.selection.select(
        gDirectoryTreeView.getIndexForId(newDirectory.URI)
      );
    },
  };
  window.browsingContext.topChromeWindow.openDialog(
    url,
    "",
    "chrome,resizable=no,centerscreen",
    params
  );
}

function AbNewLDAPDirectory() {
  AbShowNewDirectoryDialog(
    "chrome://messenger/content/addressbook/pref-directory-add.xhtml"
  );
}

function AbNewAddressBook() {
  AbShowNewDirectoryDialog(
    "chrome://messenger/content/addressbook/abAddressBookNameDialog.xhtml"
  );
}

function AbNewCardDAVBook() {
  AbShowNewDirectoryDialog(
    "chrome://messenger/content/addressbook/abCardDAVDialog.xhtml"
  );
}

function AbEditSelectedDirectory() {
  let selectedDir = getSelectedDirectory();
  if (!selectedDir) {
    return;
  }

  if (selectedDir.isMailList) {
    goEditListDialog(null, selectedDir.URI);
  } else {
    window.openDialog(
      selectedDir.propertiesChromeURI,
      "",
      "chrome,modal,resizable=no,centerscreen",
      { selectedDirectory: selectedDir }
    );
  }
}

function AbSyncSelectedDirectory() {
  let selectedDir = getSelectedDirectory();
  if (
    selectedDir &&
    selectedDir.dirType == Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE
  ) {
    selectedDir = CardDAVDirectory.forFile(selectedDir.fileName);
    selectedDir.syncWithServer();
  }
}

function updateDirTreeContext() {
  let selectedDir = getSelectedDirectory();
  let startupItem = document.getElementById("dirTreeContext-startupDir");
  let syncItem = document.getElementById("dirTreeContext-sync");
  let deleteItem = document.getElementById("dirTreeContext-delete");
  let removeItem = document.getElementById("dirTreeContext-remove");

  if (Services.prefs.getBoolPref("mail.addr_book.view.startupURIisDefault")) {
    let startupURI = Services.prefs.getCharPref(
      "mail.addr_book.view.startupURI"
    );
    startupItem.setAttribute("checked", startupURI == selectedDir.URI);
  } else {
    startupItem.setAttribute("checked", "false");
  }

  let isCardDAV =
    selectedDir?.dirType == Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE;
  syncItem.hidden = !isCardDAV;
  deleteItem.hidden = isCardDAV;
  removeItem.hidden = !isCardDAV;
}

function updateDeleteControls(
  labelAttribute,
  accessKeyAttribute = "accesskeyDefault"
) {
  goSetMenuValue("cmd_delete", labelAttribute);
  goSetAccessKey("cmd_delete", accessKeyAttribute);

  // The toolbar button doesn't update itself from the command. Do that now.
  let button = document.getElementById("button-abdelete");
  if (!button) {
    return;
  }

  let command = document.getElementById("cmd_delete");
  button.label = command.getAttribute("label");
  button.setAttribute(
    "tooltiptext",
    button.getAttribute(
      labelAttribute == "valueCardDAV" ? "tooltipCardDAV" : "tooltipDefault"
    )
  );
}

function abToggleSelectedDirStartup() {
  let selectedDirURI = getSelectedDirectoryURI();
  if (!selectedDirURI) {
    return;
  }

  let isDefault = Services.prefs.getBoolPref(
    "mail.addr_book.view.startupURIisDefault"
  );
  let startupURI = Services.prefs.getCharPref("mail.addr_book.view.startupURI");

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

function AbDeleteSelectedDirectory() {
  AbDeleteDirectory(getSelectedDirectoryURI());
}

async function AbDeleteDirectory(aURI) {
  let directory = GetDirectoryFromURI(aURI);
  if (
    !directory ||
    ["ldap_2.servers.history", "ldap_2.servers.pab"].includes(
      directory.dirPrefId
    )
  ) {
    return;
  }

  let action = "delete-book";
  if (directory.isMailList) {
    action = "delete-lists";
  } else if (
    [
      Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE,
      Ci.nsIAbManager.LDAP_DIRECTORY_TYPE,
    ].includes(directory.dirType)
  ) {
    action = "remove-remote-book";
  }

  let [title, message] = await document.l10n.formatValues([
    { id: `about-addressbook-confirm-${action}-title`, args: { count: 1 } },
    {
      id: `about-addressbook-confirm-${action}`,
      args: { name: directory.dirName, count: 1 },
    },
  ]);

  if (Services.prompt.confirm(window, title, message)) {
    MailServices.ab.deleteAddressBook(directory.URI);
  }
}

function GetParentRow(aTree, aRow) {
  var row = aRow;
  var level = aTree.view.getLevel(row);
  var parentLevel = level;
  while (parentLevel >= level) {
    row--;
    if (row == -1) {
      return row;
    }
    parentLevel = aTree.view.getLevel(row);
  }
  return row;
}

function InitCommonJS() {
  gDirTree = document.getElementById("dirTree");
  abList = document.getElementById("addressbookList");
  gAddressBookBundle = document.getElementById("bundle_addressBook");
}

async function AbDelete() {
  let types = GetSelectedCardTypes();
  if (types == kNothingSelected) {
    return;
  }

  let cards = GetSelectedAbCards();

  // Determine strings for smart and context-sensitive user prompts
  // for confirming deletion.
  let action, name, list;
  let selectedDir = gAbView.directory;

  switch (types) {
    case kListsAndCards:
      action = "delete-mixed";
      break;
    case kSingleListOnly:
    case kMultipleListsOnly:
      action = "delete-lists";
      name = cards[0].displayName;
      break;
    default: {
      let nameFormatFromPref = Services.prefs.getIntPref(
        "mail.addr_book.lastnamefirst"
      );
      name = cards[0].generateName(nameFormatFromPref);
      if (selectedDir && selectedDir.isMailList) {
        action = "remove-contacts";
        list = selectedDir.dirName;
      } else {
        action = "delete-contacts";
      }
      break;
    }
  }

  let [title, message] = await document.l10n.formatValues([
    {
      id: `about-addressbook-confirm-${action}-title`,
      args: { count: cards.length },
    },
    {
      id: `about-addressbook-confirm-${action}`,
      args: {
        count: cards.length,
        name,
        list,
      },
    },
  ]);

  // Finally, show our smart confirmation message, and act upon it!
  if (!Services.prompt.confirm(window, title, message)) {
    // Deletion cancelled by user.
    return;
  }

  // Delete cards from address books or mailing lists.
  gAbView.deleteSelectedCards();
}

function AbNewCard() {
  goNewCardDialog(getSelectedDirectoryURI());
}

function AbEditCard(card) {
  // Need a card,
  // but not allowing AOL special groups to be edited.
  if (!card) {
    return;
  }

  if (card.isMailList) {
    goEditListDialog(card, card.mailListURI);
  } else {
    let directory = MailServices.ab.getDirectoryFromUID(card.directoryUID);
    goEditCardDialog(directory.URI, card);
  }
}

function AbNewMessage(address) {
  let params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  params.type = Ci.nsIMsgCompType.New;
  params.format = Ci.nsIMsgCompFormat.Default;
  params.composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  if (address) {
    params.composeFields.to = address;
  } else if (DirPaneHasFocus()) {
    let selectedDir = getSelectedDirectory();
    let hidesRecipients = false;
    try {
      // This is a bit of hackery so that extensions can have mailing lists
      // where recipients are sent messages via BCC.
      hidesRecipients = selectedDir.getBoolValue("HidesRecipients", false);
    } catch (e) {
      // Standard Thunderbird mailing lists do not have preferences
      // associated with them, so we'll silently eat the error.
    }

    if (selectedDir && selectedDir.isMailList && hidesRecipients) {
      // Bug 669301 (https://bugzilla.mozilla.org/show_bug.cgi?id=669301)
      // We're using BCC right now to hide recipients from one another.
      // We should probably use group syntax, but that's broken
      // right now, so this will have to do.
      params.composeFields.bcc = GetSelectedAddressesFromDirTree();
    } else {
      params.composeFields.to = GetSelectedAddressesFromDirTree();
    }
  } else {
    params.composeFields.to = GetSelectedAddresses();
  }
  MailServices.compose.OpenComposeWindowWithParams(null, params);
}

/**
 * Set up items in the View > Layout menupopup.  This function is responsible
 * for updating the menu items' state to reflect reality.
 *
 * @param event the event that caused the View > Layout menupopup to be shown
 */
function InitViewLayoutMenuPopup(event) {
  let dirPaneMenuItem = document.getElementById("menu_showDirectoryPane");
  dirPaneMenuItem.setAttribute(
    "checked",
    document.getElementById("dirTree-splitter").getAttribute("state") !=
      "collapsed"
  );

  let cardPaneMenuItem = document.getElementById("menu_showCardPane");
  cardPaneMenuItem.setAttribute(
    "checked",
    document.getElementById("results-splitter").getAttribute("state") !=
      "collapsed"
  );
}

// Generate a list of cards from the selected mailing list
// and get a comma separated list of card addresses. If the
// item selected in the directory pane is not a mailing list,
// an empty string is returned.
function GetSelectedAddressesFromDirTree() {
  let selectedDir = getSelectedDirectory();

  if (!selectedDir || !selectedDir.isMailList) {
    return "";
  }

  return GetAddressesForCards(
    Array.from(selectedDir.childCards, card =>
      card.QueryInterface(Ci.nsIAbCard)
    )
  );
}

/**
 * Generate a comma separated list of addresses from the given cards.
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
 * Get the startup view directory from pref and select it in the
 * directory tree so that it gets shown.
 */
function selectStartupViewDirectory() {
  let startupURI = Services.prefs.getCharPref("mail.addr_book.view.startupURI");
  if (!startupURI) {
    // If pref is empty, fall back to "All Address Books" root directory.
    startupURI = kAllDirectoryRoot + "?";
  }
  let startupDirTreeIndex = gDirectoryTreeView.getIndexForId(startupURI);
  // XXX TODO: If directory of startupURI is collapsed, we fail to find and
  // select it, so getIndexForId returns -1; for now, fall back to "All Address
  // Books" root directory.
  // We also end up here and redirect to "All ABs" root when default directory
  // is not found because it has been deleted; after fixing the collapsed case,
  // deletion will be the only case to end up here, then we could reset the pref
  // here (somewhat lazy and fuzzy).
  if (startupDirTreeIndex == -1) {
    startupDirTreeIndex = gDirectoryTreeView.getIndexForId(
      kAllDirectoryRoot + "?"
    );
  }
  gDirectoryTreeView.selection.select(startupDirTreeIndex);
}

function DirPaneClick(event) {
  // we only care about left button events
  if (event.button != 0) {
    return;
  }

  // if the user clicks on the header / trecol, do nothing
  if (event.target.localName == "treecol") {
    event.stopPropagation();
  }
}

function DirPaneDoubleClick(event) {
  // We only care about left button events.
  if (event.button != 0) {
    return;
  }

  // Ignore double clicking on invalid rows.
  let row = gDirTree.getRowAt(event.clientX, event.clientY);
  if (row == -1 || row > gDirTree.view.rowCount - 1) {
    return;
  }

  // Default action for double click is expand/collapse which ships with the tree.
  // For convenience, allow double-click to edit the properties of mailing
  // lists in directory tree.
  if (
    gDirTree &&
    gDirTree.view.selection &&
    gDirTree.view.selection.count == 1 &&
    getSelectedDirectory().isMailList
  ) {
    gDirTree.stopEditing();
    AbEditSelectedDirectory();
  }
}

function DirPaneSelectionChange() {
  let uri = getSelectedDirectoryURI();
  // clear out the search box when changing folders...
  onAbClearSearch(false);
  if (
    gDirTree &&
    gDirTree.view.selection &&
    gDirTree.view.selection.count == 1
  ) {
    ChangeDirectoryByURI(uri);
    document
      .getElementById("localResultsOnlyMessage")
      .setAttribute(
        "hidden",
        !gDirectoryTreeView.hasRemoteAB || uri != kAllDirectoryRoot + "?"
      );
  }

  goUpdateCommand("cmd_newlist");
  goUpdateCommand("cmd_newCard");
}

function ChangeDirectoryByURI(uri = kPersonalAddressbookURI) {
  SetAbView(uri);

  // Actively de-selecting if there are any pre-existing selections
  // in the results list.
  if (gAbView && gAbView.selection && gAbView.getCardFromRow(0)) {
    gAbView.selection.clearSelection();
  } else {
    // The selection changes if we were switching directories.
    ResultsPaneSelectionChanged();
  }
}

function AbNewList() {
  goNewListDialog(getSelectedDirectoryURI());
}

function AbRenameDirectory() {
  gDirTree.startEditing(
    gDirTree.view.selection.currentIndex,
    gDirTree.columns.getFirstColumn()
  );
}

function goNewListDialog(selectedAB) {
  let params = { selectedAB };
  window.openDialog(
    "chrome://messenger/content/addressbook/abMailListDialog.xhtml",
    "",
    "chrome,modal,resizable=no,centerscreen",
    params
  );
  // If new mailing list has been created and we're in main AB window where
  // gDirectoryTreeView.selection exists, select the new list in Directory Pane.
  if (params.newListURI && gDirectoryTreeView.selection) {
    gDirectoryTreeView.selection.select(
      gDirectoryTreeView.getIndexForId(params.newListURI)
    );
  }
}

function goEditListDialog(abCard, listURI) {
  let params = {
    abCard,
    listURI,
    refresh: false, // This is an out param, true if OK in dialog is clicked.
  };
  window.openDialog(
    "chrome://messenger/content/addressbook/abEditListDialog.xhtml",
    "",
    "chrome,modal,resizable=no,centerscreen",
    params
  );
  if (params.refresh && listURI == getSelectedDirectoryURI()) {
    ChangeDirectoryByURI(listURI); // force refresh
  }
}

function goNewCardDialog(selectedAB) {
  window.openDialog(
    "chrome://messenger/content/addressbook/abNewCardDialog.xhtml",
    "",
    "chrome,modal,resizable=no,centerscreen",
    { selectedAB }
  );
}

function goEditCardDialog(abURI, card) {
  window.openDialog(
    "chrome://messenger/content/addressbook/abEditCardDialog.xhtml",
    "",
    "chrome,modal,resizable=no,centerscreen",
    { abURI, card }
  );
}

function setSortByMenuItemCheckState(id, value) {
  var menuitem = document.getElementById(id);
  if (menuitem) {
    menuitem.setAttribute("checked", value);
  }
}

function InitViewSortByMenu() {
  var sortColumn = kDefaultSortColumn;
  var sortDirection = kDefaultAscending;

  if (gAbView) {
    sortColumn = gAbView.sortColumn;
    sortDirection = gAbView.sortDirection;
  }

  // this approach is necessary to support generic columns that get overlaid.
  let elements = document.querySelectorAll('[name="sortas"]');
  for (let i = 0; i < elements.length; i++) {
    let cmd = elements[i].id;
    let columnForCmd = cmd.substr(10); // everything right of cmd_SortBy
    setSortByMenuItemCheckState(cmd, sortColumn == columnForCmd);
  }

  setSortByMenuItemCheckState(
    "sortAscending",
    sortDirection == kDefaultAscending
  );
  setSortByMenuItemCheckState(
    "sortDescending",
    sortDirection == kDefaultDescending
  );
}

/**
 * Make a MIME encoded string output of the card. This will make a difference
 * e.g. in scenarios where non-ASCII is used in the mailbox, or when then
 * display name include special characters such as comma.
 *
 * @param {nsIAbCard} - The card to use.
 * @returns {string} A MIME encoded mailbox representation of the card.
 */
function makeMimeAddressFromCard(card) {
  if (!card) {
    return "";
  }

  let email;
  if (card.isMailList) {
    let directory = GetDirectoryFromURI(card.mailListURI);
    email = directory.description || card.displayName;
  } else {
    email = card.primaryEmail || card.getProperty("SecondEmail", "");
  }
  return MailServices.headerParser.makeMimeAddress(card.displayName, email);
}

/**
 * Make a mailbox string from the card, for use in the UI.
 * @param {nsIAbCard} - The card to use.
 * @returns {string} A mailbox representation of the card.
 */
function makeMailboxObjectFromCard(card) {
  if (!card) {
    return "";
  }

  let email;
  if (card.isMailList) {
    let directory = GetDirectoryFromURI(card.mailListURI);
    email = directory.description || card.displayName;
  } else {
    email = card.primaryEmail;
  }

  return MailServices.headerParser
    .makeMailboxObject(card.displayName, email)
    .toString();
}

function GetDirectoryFromURI(uri) {
  if (uri.startsWith("moz-abdirectory://")) {
    return null;
  }
  return MailServices.ab.getDirectory(uri);
}

// returns null if abURI is not a mailing list URI
function GetParentDirectoryFromMailingListURI(abURI) {
  var abURIArr = abURI.split("/");
  /*
   Turn "jsaddrbook://abook.sqlite/MailList6"
   into ["jsaddrbook:","","abook.sqlite","MailList6"],
   then into "jsaddrbook://abook.sqlite".

   Turn "moz-aboutlookdirectory:///<top dir ID>/<ML dir ID>"
   into ["moz-aboutlookdirectory:","","","<top dir ID>","<ML dir ID>"],
   and then into: "moz-aboutlookdirectory:///<top dir ID>".
  */
  if (
    abURIArr.length == 4 &&
    ["jsaddrbook:", "moz-abmdbdirectory:"].includes(abURIArr[0]) &&
    abURIArr[3] != ""
  ) {
    return abURIArr[0] + "//" + abURIArr[2];
  } else if (
    abURIArr.length == 5 &&
    abURIArr[0] == "moz-aboutlookdirectory:" &&
    abURIArr[4] != ""
  ) {
    return abURIArr[0] + "///" + abURIArr[3];
  }

  return null;
}

/**
 * Return true if the directory pane has focus, otherwise false.
 */
function DirPaneHasFocus() {
  return top.document.commandDispatcher.focusedElement == gDirTree;
}

/**
 * Get the selected directory object.
 *
 * @return The object of the currently selected directory
 */
function getSelectedDirectory() {
  // Contacts Sidebar
  if (abList) {
    return GetDirectoryFromURI(abList.value);
  }

  // Main Address Book
  if (gDirTree.currentIndex < 0) {
    return null;
  }
  return gDirectoryTreeView.getDirectoryAtIndex(gDirTree.currentIndex);
}

/**
 * Get the URI of the selected directory.
 *
 * @return The URI of the currently selected directory
 */
function getSelectedDirectoryURI() {
  // Contacts Sidebar
  if (abList) {
    return abList.value;
  }

  // Main Address Book
  if (gDirTree.currentIndex < 0) {
    return null;
  }
  return gDirectoryTreeView.getDirectoryAtIndex(gDirTree.currentIndex).URI;
}

/**
 * DEPRECATED legacy function wrapper for addon compatibility;
 * use getSelectedDirectoryURI() instead!
 * Return the URI of the selected directory.
 */
function GetSelectedDirectory() {
  return getSelectedDirectoryURI();
}

/**
 * Clears the contents of the search input field,
 * possibly causing refresh of results.
 *
 * @param aRefresh  Set to false if the refresh isn't needed,
 *                  e.g. window/AB is going away so user will not see anything.
 */
function onAbClearSearch(aRefresh = true) {
  let searchInput = document.getElementById("peopleSearchInput");
  if (!searchInput || !searchInput.value) {
    return;
  }

  searchInput.value = "";
  if (aRefresh) {
    onEnterInSearchBar();
  }
}

// sets focus into the quick search box
function QuickSearchFocus() {
  let searchInput = document.getElementById("peopleSearchInput");
  if (searchInput) {
    searchInput.focus();
    searchInput.select();
  }
}

/**
 * Returns an nsIFile of the directory in which contact photos are stored.
 * This will create the directory if it does not yet exist.
 */
function getPhotosDir() {
  let file = Services.dirsvc.get("ProfD", Ci.nsIFile);
  // Get the Photos directory
  file.append("Photos");
  if (!file.exists() || !file.isDirectory()) {
    file.create(Ci.nsIFile.DIRECTORY_TYPE, PERMS_DIRECTORY);
  }
  return file;
}

/**
 * Returns a URI specifying the location of a photo based on its name.
 * If the name is blank, or if the photo with that name is not in the Photos
 * directory then the default photo URI is returned.
 *
 * @param aPhotoName The name of the photo from the Photos folder, if any.
 *
 * @return A URI pointing to a photo.
 */
function getPhotoURI(aPhotoName) {
  if (!aPhotoName) {
    return defaultPhotoURI;
  }
  var file = getPhotosDir();
  try {
    file.append(aPhotoName);
  } catch (e) {
    return defaultPhotoURI;
  }
  if (!file.exists()) {
    return defaultPhotoURI;
  }
  return Services.io.newFileURI(file).spec;
}

/**
 * Generates a unique filename to be used for a local copy of a contact's photo.
 *
 * @param aPath      The path to the folder in which the photo will be saved.
 * @param aExtension The file extension of the photo.
 *
 * @return A unique filename in the given path.
 */
function makePhotoFile(aDir, aExtension) {
  var filename, newFile;
  // Find a random filename for the photo that doesn't exist yet
  do {
    filename =
      Math.random()
        .toString()
        .replace("0.", "") +
      "." +
      aExtension;
    newFile = aDir.clone();
    newFile.append(filename);
  } while (newFile.exists());
  return newFile;
}

/**
 * Public self-contained object for image transfers.
 * Responsible for file transfer, validating the image and downscaling.
 * Attention: It is the responsibility of the caller to remove the old photo
 * and update the card!
 */
var gImageDownloader = (function() {
  let downloadInProgress = false;

  // Current instance of nsIWebBrowserPersist. It is used two times, during
  // the actual download and for saving canvas data.
  let downloader;

  // Temporary nsIFile used for download.
  let tempFile;

  // Images are downsized to this size while keeping the aspect ratio.
  const maxSize = 300;

  // Callback function for various states
  let callbackSuccess;
  let callbackError;
  let callbackProgress;

  // Start at 4% to show a slight progress initially.
  const initProgress = 4;

  // Constants indicating error and file transfer status
  const STATE_TRANSFERRING = 0;
  const STATE_RESIZING = 1;
  const STATE_OK = 2;
  // The URI does not have a valid format.
  const ERROR_INVALID_URI = 0;
  // In case of HTTP transfers: the server did not answer with a 200 status code.
  const ERROR_UNAVAILABLE = 1;
  // The file type is not supported. Only jpeg, png and gif are.
  const ERROR_INVALID_IMG = 2;
  // An error occurred while saving the image to the hard drive.
  const ERROR_SAVE = 4;

  /**
   * Saves a target photo in the profile's photo directory. Only one concurrent file transfer is
   * supported. Starting a new transfer while another is still in progress will cancel the former
   * file transfer.
   *
   * @param aURI {string}                    URI pointing to the photo.
   * @param cbSuccess(photoName) {function}  A callback function which is called on success.
   *                                         The photo file name is passed in.
   * @param cbError(state) {function}        A callback function which is called in case
   *                                         of an error. The error state is passed in.
   * @param cbProgress(errcode, percent) {function}  A callback function which provides
   *   progress report. An error code (see above) and the progress percentage (0-100) is passed in.
   *   State transitions: STATE_TRANSFERRING -> STATE_RESIZING -> STATE_OK (100%)
   */
  function savePhoto(aURI, aCBSuccess, aCBError, aCBProgress) {
    callbackSuccess = typeof aCBSuccess == "function" ? aCBSuccess : null;
    callbackError = typeof aCBError == "function" ? aCBError : null;
    callbackProgress = typeof aCBProgress == "function" ? aCBProgress : null;

    // Make sure that there is no running download.
    cancelSave();
    downloadInProgress = true;

    if (callbackProgress) {
      callbackProgress(STATE_TRANSFERRING, initProgress);
    }

    downloader = Cc[
      "@mozilla.org/embedding/browser/nsWebBrowserPersist;1"
    ].createInstance(Ci.nsIWebBrowserPersist);
    downloader.persistFlags =
      Ci.nsIWebBrowserPersist.PERSIST_FLAGS_BYPASS_CACHE |
      Ci.nsIWebBrowserPersist.PERSIST_FLAGS_REPLACE_EXISTING_FILES |
      Ci.nsIWebBrowserPersist.PERSIST_FLAGS_CLEANUP_ON_FAILURE;
    downloader.progressListener = {
      onProgressChange(
        aWebProgress,
        aRequest,
        aCurSelfProgress,
        aMaxSelfProgress,
        aCurTotalProgress,
        aMaxTotalProgress
      ) {
        if (aMaxTotalProgress > -1 && callbackProgress) {
          // Download progress is 0-90%, 90-100% is verifying and scaling the image.
          let percent = Math.round(
            initProgress +
              (aCurTotalProgress / aMaxTotalProgress) * (90 - initProgress)
          );
          callbackProgress(STATE_TRANSFERRING, percent);
        }
      },
      onStateChange(aWebProgress, aRequest, aStateFlag, aStatus) {
        // Check if the download successfully finished.
        if (
          aStateFlag & Ci.nsIWebProgressListener.STATE_STOP &&
          !(aStateFlag & Ci.nsIWebProgressListener.STATE_IS_REQUEST)
        ) {
          try {
            // Check the response code in case of an HTTP request to catch 4xx errors
            let http = aRequest.QueryInterface(Ci.nsIHttpChannel);
            if (http.responseStatus == 200) {
              verifyImage();
            } else if (callbackError) {
              callbackError(ERROR_UNAVAILABLE);
            }
          } catch (err) {
            // The nsIHttpChannel interface is not available - just proceed
            verifyImage();
          }
        }
      },
    };

    let source;
    try {
      source = Services.io.newURI(aURI);
    } catch (err) {
      if (callbackError) {
        callbackError(ERROR_INVALID_URI);
      }
      return;
    }

    // Start the transfer to a temporary file.
    tempFile = FileUtils.getFile("TmpD", [
      "tb-photo-" + new Date().getTime() + ".tmp",
    ]);
    tempFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);
    try {
      // Obtain the privacy context of the browser window that the URL
      // we are downloading comes from. If, and only if, the URL is not
      // related to a window, null should be used instead.
      let privacy = PrivateBrowsingUtils.privacyContextFromWindow(window);
      let principal = Services.scriptSecurityManager.createContentPrincipal(
        source,
        {}
      );
      downloader.saveURI(
        source,
        principal,
        null,
        null,
        null,
        null,
        null,
        tempFile,
        Ci.nsIContentPolicy.TYPE_IMAGE,
        privacy
      );
    } catch (e) {
      Cu.reportError(e);
      cleanup();
      if (callbackError) {
        callbackError(ERROR_SAVE);
      }
    }
  }

  /**
   * Verifies the downloaded file to be an image.
   * Scales the image and starts the saving operation.
   */
  function verifyImage() {
    let img = new Image();
    img.onerror = function() {
      cleanup();
      if (callbackError) {
        callbackError(ERROR_INVALID_IMG);
      }
    };
    img.onload = function() {
      if (callbackProgress) {
        callbackProgress(STATE_RESIZING, 95);
      }

      // Images are scaled down in two steps to improve quality. Resizing ratios
      // larger than 2 use a different interpolation algorithm than small ratios.
      // Resize three times (instead of just two steps) to improve the final quality.
      let canvas = downscale(img, 3.8 * maxSize);
      canvas = downscale(canvas, 1.9 * maxSize);
      canvas = downscale(canvas, maxSize);

      saveCanvas(canvas);

      if (callbackProgress) {
        callbackProgress(STATE_OK, 100);
      }

      // Remove the temporary file.
      cleanup();
    };

    if (callbackProgress) {
      callbackProgress(STATE_RESIZING, 92);
    }

    img.src = Services.io.newFileURI(tempFile).spec;
  }

  /**
   * Scale a graphics object down to a specified maximum dimension while
   * preserving the aspect ratio. Does not upscale an image.
   *
   * @param aGraphicsObject {image | canvas}  Image or canvas object
   * @param aMaxDimension {integer}           The maximal allowed width or height
   *
   * @return A canvas object.
   */
  function downscale(aGraphicsObject, aMaxDimension) {
    let w = aGraphicsObject.width;
    let h = aGraphicsObject.height;

    if (w > h && w > aMaxDimension) {
      h = Math.round((aMaxDimension * h) / w);
      w = aMaxDimension;
    } else if (h > aMaxDimension) {
      w = Math.round((aMaxDimension * w) / h);
      h = aMaxDimension;
    }

    let canvas = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "canvas"
    );
    canvas.width = w;
    canvas.height = h;

    let ctx = canvas.getContext("2d");
    ctx.drawImage(aGraphicsObject, 0, 0, w, h);
    return canvas;
  }

  /**
   * Cancel a running download (if any).
   */
  function cancelSave() {
    if (!downloadInProgress) {
      return;
    }

    // Cancel the nsIWebBrowserPersist file transfer.
    if (downloader) {
      downloader.cancelSave();
    }
    cleanup();
  }

  /**
   * Remove the temporary file and reset internal status.
   */
  function cleanup() {
    if (tempFile) {
      try {
        if (tempFile.exists()) {
          tempFile.remove(false);
        }
      } catch (err) {}
      tempFile = null;
    }

    downloadInProgress = false;
  }

  /**
   * Save the contents of a canvas to the photos directory of the profile.
   */
  function saveCanvas(aCanvas) {
    // Get the photos directory and check that it exists
    let file = getPhotosDir();
    file = makePhotoFile(file, "png");

    // Create a data url from the canvas and then create URIs of the source and targets
    let source = Services.io.newURI(aCanvas.toDataURL("image/png", ""), "UTF8");
    let target = Services.io.newFileURI(file);

    downloader = Cc[
      "@mozilla.org/embedding/browser/nsWebBrowserPersist;1"
    ].createInstance(Ci.nsIWebBrowserPersist);
    downloader.persistFlags =
      Ci.nsIWebBrowserPersist.PERSIST_FLAGS_BYPASS_CACHE |
      Ci.nsIWebBrowserPersist.PERSIST_FLAGS_REPLACE_EXISTING_FILES |
      Ci.nsIWebBrowserPersist.PERSIST_FLAGS_CLEANUP_ON_FAILURE;
    downloader.progressListener = {
      onStateChange(aWebProgress, aRequest, aFlag, aStatus) {
        if (
          aFlag & Ci.nsIWebProgressListener.STATE_STOP &&
          !(aFlag & Ci.nsIWebProgressListener.STATE_IS_REQUEST)
        ) {
          if (callbackSuccess) {
            callbackSuccess(file.leafName);
          }
        }
      },
    };

    // Obtain the privacy context of the browser window that the URL
    // we are downloading comes from. If, and only if, the URL is not
    // related to a window, null should be used instead.
    let privacy = PrivateBrowsingUtils.privacyContextFromWindow(window);
    let principal = Services.scriptSecurityManager.createContentPrincipal(
      source,
      {}
    );
    downloader.saveURI(
      source,
      principal,
      null,
      null,
      null,
      null,
      null,
      target,
      Ci.nsIContentPolicy.TYPE_IMAGE,
      privacy
    );
  }

  // Publicly accessible methods.
  return {
    cancelSave,
    savePhoto,
    STATE_TRANSFERRING,
    STATE_RESIZING,
    STATE_OK,
    ERROR_UNAVAILABLE,
    ERROR_INVALID_URI,
    ERROR_INVALID_IMG,
    ERROR_SAVE,
  };
})();

/**
 * Validates the given year and returns it, if it looks sane.
 * Returns kDefaultYear (a leap year), if no valid date is given.
 * This ensures that month/day calculations still work.
 */
function saneBirthYear(aYear) {
  return aYear && aYear <= kMaxYear && aYear >= kMinYear ? aYear : kDefaultYear;
}

/**
 * Returns the nearest leap year before aYear.
 */
function nearestLeap(aYear) {
  for (let year = aYear; year > 0; year--) {
    if (new Date(year, 1, 29).getMonth() == 1) {
      return year;
    }
  }
  return 2000;
}
