/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
const {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");
const {IOUtils} = ChromeUtils.import("resource:///modules/IOUtils.js");

var gDirTree = null;
var abList = null;
var gAbResultsTree = null;
var gAbView = null;
var gAddressBookBundle;
// A boolean variable determining whether AB column should be shown in AB
// sidebar in compose window.
var gShowAbColumnInComposeSidebar = false;

const kDefaultSortColumn = "GeneratedName";
const kDefaultAscending = "ascending";
const kDefaultDescending = "descending";
// kDefaultYear will be used in birthday calculations when no year is given;
// this is a leap year so that Feb 29th works.
const kDefaultYear = nearestLeap(new Date().getFullYear());
const kMaxYear = 9999;
const kMinYear = 1;
const kAllDirectoryRoot = "moz-abdirectory://";
const kLdapUrlPrefix = "moz-abldapdirectory://";
const kPersonalAddressbookURI = "moz-abmdbdirectory://abook.mab";
const kCollectedAddressbookURI = "moz-abmdbdirectory://history.mab";
// The default image for contacts
var defaultPhotoURI = "chrome://messenger/skin/addressbook/icons/contact-generic.png";

// Controller object for Dir Pane
var DirPaneController =
{
  supportsCommand: function(command)
  {
    switch (command) {
      case "cmd_selectAll":
      case "cmd_delete":
      case "button_delete":
      case "cmd_properties":
      case "cmd_printcard":
      case "cmd_printcardpreview":
      case "cmd_print":
      case "cmd_printpreview":
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
        // The gDirTree pane only handles single selection, but normally we
        // enable cmd_selectAll as it will get forwarded to the results pane.
        // But if there is no gAbView, disable as we can't forward to anywhere.
        return (gAbView != null);
      case "cmd_delete":
      case "button_delete": {
        let selectedDir = getSelectedDirectory();
        if (!selectedDir)
          return false;
        let selectedDirURI = selectedDir.URI;

        // Context-sensitive labels for Edit > Delete menuitem.
        if (command == "cmd_delete") {
          goSetMenuValue(command, selectedDir.isMailList ?
                                  "valueList" : "valueAddressBook");
        }

        // If it's one of these special ABs, return false to disable deletion.
        if (selectedDirURI == kPersonalAddressbookURI ||
            selectedDirURI == kCollectedAddressbookURI ||
            selectedDirURI == (kAllDirectoryRoot + "?"))
          return false;

        // If the directory is a mailing list, and it is read-only,
        // return false to disable deletion.
        if (selectedDir.isMailList && selectedDir.readOnly)
          return false;

        // If the selected directory is an ldap directory,
        // and if the prefs for this directory are locked,
        // return false to disable deletion.
        if (selectedDirURI.startsWith(kLdapUrlPrefix)) {
          let disable = false;
          try {
            let prefName = selectedDirURI.substr(kLdapUrlPrefix.length);
            disable = Services.prefs.getBoolPref(prefName + ".disable_delete");
          }
          catch(ex) {
            // If this preference is not set, that's ok.
          }
          if (disable)
            return false;
        }

        // Else return true to enable deletion (default).
        return true;
      }
      case "cmd_printcard":
      case "cmd_printcardpreview":
        return (GetSelectedCardIndex() != -1);
      case "cmd_print":
      case "cmd_printpreview":
        document.querySelectorAll("[command=cmd_print]").forEach(e => {
          e.disabled = false;
        });
        return true;
      case "cmd_properties":
        return (getSelectedDirectoryURI() != null);
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
      case "cmd_printcard":
      case "cmd_printcardpreview":
      case "cmd_selectAll":
        SendCommandToResultsPane(command);
        break;
      case "cmd_print":
        AbPrintAddressBook();
        break;
      case "cmd_printpreview":
        AbPrintPreviewAddressBook();
        break;
      case "cmd_delete":
      case "button_delete":
        if (gDirTree)
          AbDeleteSelectedDirectory();
        break;
      case "cmd_properties":
        AbEditSelectedDirectory();
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

function SendCommandToResultsPane(command)
{
  ResultsPaneController.doCommand(command);

  // if we are sending the command so the results pane
  // we should focus the results pane
  gAbResultsTree.focus();
}

function AbNewLDAPDirectory()
{
  window.openDialog("chrome://messenger/content/addressbook/pref-directory-add.xul",
                    "",
                    "chrome,modal,resizable=no,centerscreen",
                    null);
}

function AbNewAddressBook()
{
  window.openDialog("chrome://messenger/content/addressbook/abAddressBookNameDialog.xul",
                    "",
                    "chrome,modal,resizable=no,centerscreen",
                    null);
}

function AbEditSelectedDirectory()
{
  let selectedDir = getSelectedDirectory();
  if (!selectedDir)
    return;

  if (selectedDir.isMailList) {
    goEditListDialog(null, selectedDir.URI);
  } else {
    window.openDialog(selectedDir.propertiesChromeURI,
                      "",
                      "chrome,modal,resizable=no,centerscreen",
                      {selectedDirectory: selectedDir});
  }
}

function AbDeleteSelectedDirectory()
{
  let selectedDirURI = getSelectedDirectoryURI();
  if (!selectedDirURI)
    return;

  AbDeleteDirectory(selectedDirURI);
}

function AbDeleteDirectory(aURI)
{
  // Determine strings for smart and context-sensitive user prompts
  // for confirming deletion.
  let directory = GetDirectoryFromURI(aURI);
  let confirmDeleteTitleID;
  let confirmDeleteTitle;
  let confirmDeleteMessageID;
  let confirmDeleteMessage;
  let brandShortName;
  let clearCollectionPrefs = false;

  if (directory.isMailList) {
    // It's a mailing list.
    confirmDeleteMessageID = "confirmDeleteThisMailingList";
    confirmDeleteTitleID = "confirmDeleteThisMailingListTitle";
  } else {
    // It's an address book: check which type.
    if (Services.prefs.getCharPref("mail.collect_addressbook") == aURI &&
        (Services.prefs.getBoolPref("mail.collect_email_address_outgoing") ||
         Services.prefs.getBoolPref("mail.collect_email_address_incoming") ||
         Services.prefs.getBoolPref("mail.collect_email_address_newsgroup"))) {
      // It's a collection address book: let's be clear about the consequences.
      brandShortName = document.getElementById("bundle_brand").getString("brandShortName");
      confirmDeleteMessageID = "confirmDeleteThisCollectionAddressbook";
      confirmDeleteTitleID = "confirmDeleteThisCollectionAddressbookTitle";
      clearCollectionPrefs = true;
    } else if (directory.URI.startsWith(kLdapUrlPrefix)) {
      // It's an LDAP directory, so we only delete our offline copy.
      confirmDeleteMessageID = "confirmDeleteThisLDAPDir";
      confirmDeleteTitleID = "confirmDeleteThisLDAPDirTitle";
    } else {
      // It's a normal personal address book: we'll delete its contacts, too.
      confirmDeleteMessageID = "confirmDeleteThisAddressbook";
      confirmDeleteTitleID = "confirmDeleteThisAddressbookTitle";
    }
  }

  // Get the raw strings with placeholders.
  confirmDeleteTitle   = gAddressBookBundle.getString(confirmDeleteTitleID);
  confirmDeleteMessage = gAddressBookBundle.getString(confirmDeleteMessageID);

  // Substitute placeholders as required.
  // Replace #1 with the name of the selected address book or mailing list.
  confirmDeleteMessage = confirmDeleteMessage.replace("#1", directory.dirName);
  if (brandShortName) {
    // For a collection address book, replace #2 with the brandShortName.
    confirmDeleteMessage = confirmDeleteMessage.replace("#2", brandShortName);
  }

  // Ask for confirmation before deleting
  if (!Services.prompt.confirm(window, confirmDeleteTitle,
                                       confirmDeleteMessage)) {
    // Deletion cancelled by user.
    return;
  }

  // If we're about to delete the collection AB, update the respective prefs.
  if (clearCollectionPrefs) {
    Services.prefs.setBoolPref("mail.collect_email_address_outgoing", false);
    Services.prefs.setBoolPref("mail.collect_email_address_incoming", false);
    Services.prefs.setBoolPref("mail.collect_email_address_newsgroup", false);

    // Change the collection AB pref to "Personal Address Book" so that we
    // don't get a blank item in prefs dialog when collection is re-enabled.
    Services.prefs.setCharPref("mail.collect_addressbook",
                               kPersonalAddressbookURI);
  }

  MailServices.ab.deleteAddressBook(aURI);
}

function InitCommonJS()
{
  gDirTree = document.getElementById("dirTree");
  abList = document.getElementById("addressbookList");
  gAddressBookBundle = document.getElementById("bundle_addressBook");

  // Make an entry for "All Address Books".
  if (abList) {
    abList.insertItemAt(0, gAddressBookBundle.getString("allAddressBooks"),
                        kAllDirectoryRoot + "?");
  }
}

function UpgradeAddressBookResultsPaneUI(prefName)
{
  // placeholder in case any new columns get added to the address book
  // var resultsPaneUIVersion = Services.prefs.getIntPref(prefName);
}

function AbDelete()
{
  let types = GetSelectedCardTypes();
  if (types == kNothingSelected)
    return;

  // Determine strings for smart and context-sensitive user prompts
  // for confirming deletion.
  let confirmDeleteTitleID;
  let confirmDeleteTitle;
  let confirmDeleteMessageID;
  let confirmDeleteMessage;
  let itemName;
  let containingListName;
  let selectedDir = getSelectedDirectory();
  let numSelectedItems = gAbView.selection.count;

  switch(types) {
    case kListsAndCards:
      confirmDeleteMessageID = "confirmDelete2orMoreContactsAndLists";
      confirmDeleteTitleID   = "confirmDelete2orMoreContactsAndListsTitle";
      break;
    case kSingleListOnly:
      // Set item name for single mailing list.
      let theCard = GetSelectedAbCards()[0];
      itemName = theCard.displayName;
      confirmDeleteMessageID = "confirmDeleteThisMailingList";
      confirmDeleteTitleID   = "confirmDeleteThisMailingListTitle";
      break;
    case kMultipleListsOnly:
      confirmDeleteMessageID = "confirmDelete2orMoreMailingLists";
      confirmDeleteTitleID   = "confirmDelete2orMoreMailingListsTitle";
      break;
    case kCardsOnly:
      if (selectedDir.isMailList) {
        // Contact(s) in mailing lists will be removed from the list, not deleted.
        if (numSelectedItems == 1) {
          confirmDeleteMessageID = "confirmRemoveThisContact";
          confirmDeleteTitleID = "confirmRemoveThisContactTitle";
        } else {
          confirmDeleteMessageID = "confirmRemove2orMoreContacts";
          confirmDeleteTitleID   = "confirmRemove2orMoreContactsTitle";
        }
        // For removing contacts from mailing list, set placeholder value
        containingListName = selectedDir.dirName;
      } else {
        // Contact(s) in address books will be deleted.
        if (numSelectedItems == 1) {
          confirmDeleteMessageID = "confirmDeleteThisContact";
          confirmDeleteTitleID   = "confirmDeleteThisContactTitle";
        } else {
          confirmDeleteMessageID = "confirmDelete2orMoreContacts";
          confirmDeleteTitleID   = "confirmDelete2orMoreContactsTitle";
        }
      }
      if (numSelectedItems == 1) {
        // Set item name for single contact.
        let theCard = GetSelectedAbCards()[0];
        let nameFormatFromPref = Services.prefs.getIntPref("mail.addr_book.lastnamefirst");
        itemName = theCard.generateName(nameFormatFromPref);
      }
      break;
  }

  // Get the raw model strings.
  // For numSelectedItems == 1, it's simple strings.
  // For messages with numSelectedItems > 1, it's multi-pluralform string sets.
  // confirmDeleteMessage has placeholders for some forms.
  confirmDeleteTitle   = gAddressBookBundle.getString(confirmDeleteTitleID);
  confirmDeleteMessage = gAddressBookBundle.getString(confirmDeleteMessageID);

  // Get plural form where applicable; substitute placeholders as required.
  if (numSelectedItems == 1) {
    // If single selected item, substitute itemName.
    confirmDeleteMessage = confirmDeleteMessage.replace("#1", itemName);
  } else {
    // If multiple selected items, get the right plural string from the
    // localized set, then substitute numSelectedItems.
    confirmDeleteMessage = PluralForm.get(numSelectedItems, confirmDeleteMessage);
    confirmDeleteMessage = confirmDeleteMessage.replace("#1", numSelectedItems);
  }
  // If contact(s) in a mailing list, substitute containingListName.
  if (containingListName)
    confirmDeleteMessage = confirmDeleteMessage.replace("#2", containingListName);

  // Finally, show our smart confirmation message, and act upon it!
  if (!Services.prompt.confirm(window, confirmDeleteTitle,
                                       confirmDeleteMessage)) {
    // Deletion cancelled by user.
    return;
  }

  if (selectedDir.URI == (kAllDirectoryRoot + "?")) {
    // Delete cards from "All Address Books" view.
    let cards = GetSelectedAbCards();
    for (let i = 0; i < cards.length; i++) {
      let dirId = cards[i].directoryId
                          .substring(0, cards[i].directoryId.indexOf("&"));
      let directory = MailServices.ab.getDirectoryFromId(dirId);

      let cardArray =
        Cc["@mozilla.org/array;1"]
          .createInstance(Ci.nsIMutableArray);
      cardArray.appendElement(cards[i], false);
      if (directory)
        directory.deleteCards(cardArray);
    }
    SetAbView(kAllDirectoryRoot + "?");
  } else {
    // Delete cards from address books or mailing lists.
    gAbView.deleteSelectedCards();
  }
}

function AbNewCard()
{
  goNewCardDialog(getSelectedDirectoryURI());
}

function AbEditCard(card)
{
  // Need a card,
  if (!card)
    return;

  if (card.isMailList) {
    goEditListDialog(card, card.mailListURI);
  } else {
    goEditCardDialog(getSelectedDirectoryURI(), card);
  }
}

function AbNewMessage()
{
  let params = Cc["@mozilla.org/messengercompose/composeparams;1"].createInstance(Ci.nsIMsgComposeParams);
  if (params) {
    let composeFields = Cc["@mozilla.org/messengercompose/composefields;1"].createInstance(Ci.nsIMsgCompFields);
    if (composeFields) {
      params.type = Ci.nsIMsgCompType.New;
      params.format = Ci.nsIMsgCompFormat.Default;
      if (DirPaneHasFocus()) {
        let selectedDir = getSelectedDirectory();
        let hidesRecipients = false;
        try {
          // This is a bit of hackery so that extensions can have mailing lists
          // where recipients are sent messages via BCC.
          hidesRecipients = selectedDir.getBoolValue("HidesRecipients", false);
        } catch(e) {
          // Standard Thunderbird mailing lists do not have preferences
          // associated with them, so we'll silently eat the error.
        }

        if (selectedDir && selectedDir.isMailList && hidesRecipients)
          // Bug 669301 (https://bugzilla.mozilla.org/show_bug.cgi?id=669301)
          // We're using BCC right now to hide recipients from one another.
          // We should probably use group syntax, but that's broken
          // right now, so this will have to do.
          composeFields.bcc = GetSelectedAddressesFromDirTree();
        else
          composeFields.to = GetSelectedAddressesFromDirTree();
      } else {
        composeFields.to = GetSelectedAddresses();
      }
      params.composeFields = composeFields;
      MailServices.compose.OpenComposeWindowWithParams(null, params);
    }
  }
}

function AbCopyAddress()
{
  var cards = GetSelectedAbCards();
  if (!cards)
    return;

  var count = cards.length;
  if (!count)
    return;

  var addresses = cards[0].primaryEmail;
  for (var i = 1; i < count; i++)
    addresses += "," + cards[i].primaryEmail;

  Cc["@mozilla.org/widget/clipboardhelper;1"]
    .getService(Ci.nsIClipboardHelper)
    .copyString(addresses);
}

/**
 * Set up items in the View > Layout menupopup.  This function is responsible
 * for updating the menu items' state to reflect reality.
 *
 * @param aEvent the event that caused the View > Layout menupopup to be shown
 */
function InitViewLayoutMenuPopup(aEvent)
{
  let dirTreeVisible = document.getElementById("dirTree-splitter")
                               .getAttribute("state") != "collapsed";
  document.getElementById("menu_showDirectoryPane")
          .setAttribute("checked", dirTreeVisible);

  let cardPaneVisible = document.getElementById("results-splitter")
                                .getAttribute("state") != "collapsed";
  document.getElementById("menu_showCardPane")
          .setAttribute("checked", cardPaneVisible);
}

// Generate a list of cards from the selected mailing list
// and get a comma separated list of card addresses. If the
// item selected in the directory pane is not a mailing list,
// an empty string is returned.
function GetSelectedAddressesFromDirTree()
{
  let selectedDir = getSelectedDirectory();

  if (!selectedDir || !selectedDir.isMailList)
    return "";

  let listCardsCount = selectedDir.addressLists.length;
  let cards = new Array(listCardsCount);
  for (let i = 0; i < listCardsCount; ++i)
    cards[i] = selectedDir.addressLists
                 .queryElementAt(i, Ci.nsIAbCard);
  return GetAddressesForCards(cards);
}

// Generate a comma separated list of addresses from a given
// set of cards.
function GetAddressesForCards(cards)
{
  var addresses = "";

  if (!cards)
    return addresses;

  var count = cards.length;
  for (var i = 0; i < count; ++i) {
    var generatedAddress = GenerateAddressFromCard(cards[i]);
    if (generatedAddress) {
      // If it's not the first address in the list, add a comma separator.
      if (addresses)
        addresses += ",";
      addresses += generatedAddress;
    }
  }

  return addresses;
}


function SelectFirstAddressBook()
{
  if (gDirectoryTreeView.selection.currentIndex != 0) {
    gDirectoryTreeView.selection.select(0);
    ChangeDirectoryByURI(getSelectedDirectoryURI());
  }
  gAbResultsTree.focus();
}

function DirPaneClick(event)
{
  // we only care about left button events
  if (event.button != 0)
    return;

  // if the user clicks on the header / trecol, do nothing
  if (event.originalTarget.localName == "treecol") {
    event.stopPropagation();
    return;
  }
}

function DirPaneDoubleClick(event)
{
  // We only care about left button events.
  if (event.button != 0)
    return;

  // Ignore double clicking on invalid rows.
  let row = gDirTree.treeBoxObject.getRowAt(event.clientX, event.clientY);
  if (row == -1 || row >= gDirectoryTreeView.rowCount)
    return;

  // Default action for double click is expand/collapse which ships with the tree.
  // For convenience, allow double-click to edit the properties of mailing
  // lists in directory tree.
  if (gDirTree && gDirTree.view.selection &&
      gDirTree.view.selection.count == 1 &&
      getSelectedDirectory().isMailList) {
    AbEditSelectedDirectory();
  }
}

function DirPaneSelectionChange()
{
  let uri = getSelectedDirectoryURI();
  // clear out the search box when changing folders...
  onAbClearSearch(false);
  if (gDirectoryTreeView.selection &&
      gDirectoryTreeView.selection.count == 1) {
    ChangeDirectoryByURI(uri);
    document.getElementById("localResultsOnlyMessage")
            .setAttribute("hidden",
                          !gDirectoryTreeView.hasRemoteAB ||
                          uri != kAllDirectoryRoot + "?");
  }
}

function ChangeDirectoryByURI(uri = kPersonalAddressbookURI)
{
  SetAbView(uri);

  // Actively de-selecting if there are any pre-existing selections
  // in the results list.
  if (gAbView && gAbView.getCardFromRow(0))
    gAbView.selection.clearSelection();
  else
    // the selection changes if we were switching directories.
    ResultsPaneSelectionChanged()
}

function AbNewList()
{
  goNewListDialog(getSelectedDirectoryURI());
}

function goNewListDialog(selectedAB)
{
  window.openDialog("chrome://messenger/content/addressbook/abMailListDialog.xul",
                    "",
                    "chrome,modal,resizable,centerscreen",
                    {selectedAB:selectedAB});
}

function goEditListDialog(abCard, listURI)
{
  let params = {
    abCard: abCard,
    listURI: listURI,
    refresh: false, // This is an out param, true if OK in dialog is clicked.
  };

  window.openDialog("chrome://messenger/content/addressbook/abEditListDialog.xul",
                    "",
                    "chrome,modal,resizable,centerscreen",
                    params);

  if (params.refresh) {
    ChangeDirectoryByURI(listURI); // force refresh
  }
}

function goNewCardDialog(selectedAB)
{
  window.openDialog("chrome://messenger/content/addressbook/abNewCardDialog.xul",
                    "",
                    "chrome,modal,resizable=no,centerscreen",
                    {selectedAB:selectedAB});
}

function goEditCardDialog(abURI, card)
{
  window.openDialog("chrome://messenger/content/addressbook/abEditCardDialog.xul",
                    "",
                    "chrome,modal,resizable=no,centerscreen",
                    {abURI:abURI, card:card});
}

function setSortByMenuItemCheckState(id, value)
{
    var menuitem = document.getElementById(id);
    if (menuitem) {
      menuitem.setAttribute("checked", value);
    }
}

function InitViewSortByMenu()
{
    var sortColumn = kDefaultSortColumn;
    var sortDirection = kDefaultAscending;

    if (gAbView) {
      sortColumn = gAbView.sortColumn;
      sortDirection = gAbView.sortDirection;
    }

    // this approach is necessary to support generic columns that get overlayed.
    let elements = document.querySelectorAll('[name="sortas"]');
    for (let i = 0; i < elements.length; i++) {
      let cmd = elements[i].id;
      let columnForCmd = cmd.substr(10); // everything right of cmd_SortBy
      setSortByMenuItemCheckState(cmd, (sortColumn == columnForCmd));
    }

    setSortByMenuItemCheckState("sortAscending", (sortDirection == kDefaultAscending));
    setSortByMenuItemCheckState("sortDescending", (sortDirection == kDefaultDescending));
}

function GenerateAddressFromCard(card)
{
  if (!card)
    return "";

  var email;

  if (card.isMailList)
  {
    var directory = GetDirectoryFromURI(card.mailListURI);
    email = directory.description || card.displayName;
  }
  else
    email = card.primaryEmail;

  return MailServices.headerParser.makeMimeAddress(card.displayName, email);
}

function GetDirectoryFromURI(uri)
{
  return MailServices.ab.getDirectory(uri);
}

// returns null if abURI is not a mailing list URI
function GetParentDirectoryFromMailingListURI(abURI)
{
  var abURIArr = abURI.split("/");
  /*
   turn turn "moz-abmdbdirectory://abook.mab/MailList6"
   into ["moz-abmdbdirectory:","","abook.mab","MailList6"]
   then, turn ["moz-abmdbdirectory:","","abook.mab","MailList6"]
   into "moz-abmdbdirectory://abook.mab"
  */
  if (abURIArr.length == 4 && abURIArr[0] == "moz-abmdbdirectory:" && abURIArr[3] != "") {
    return abURIArr[0] + "/" + abURIArr[1] + "/" + abURIArr[2];
  }

  return null;
}

/**
 * Return true if the directory pane has focus, otherwise false.
 */
function DirPaneHasFocus()
{
  return (top.document.commandDispatcher.focusedElement == gDirTree);
}

/**
 * Get the selected directory object.
 *
 * @return The object of the currently selected directory
 */
function getSelectedDirectory()
{
  // Select Addresses Dialog
  if (abList)
    return MailServices.ab.getDirectory(abList.value);

  // Main Address Book
  if (gDirTree.currentIndex < 0)
    return null;
  return gDirectoryTreeView.getDirectoryAtIndex(gDirTree.currentIndex);
}

/**
 * Get the URI of the selected directory.
 *
 * @return The URI of the currently selected directory
 */
function getSelectedDirectoryURI()
{
  // Select Addresses Dialog
  if (abList)
    return abList.value;

  // Main Address Book
  if (gDirTree.currentIndex < 0)
    return null;
  return gDirectoryTreeView.getDirectoryAtIndex(gDirTree.currentIndex).URI;
}

/**
 * DEPRECATED legacy function wrapper for addon compatibility;
 * use getSelectedDirectoryURI() instead!
 * Return the URI of the selected directory.
 */
function GetSelectedDirectory()
{
  return getSelectedDirectoryURI();
}

/**
 * Clears the contents of the search input field,
 * possibly causing refresh of results.
 *
 * @param aRefresh  Set to false if the refresh isn't needed,
 *                  e.g. window/AB is going away so user will not see anything.
 */
function onAbClearSearch(aRefresh = true)
{
  let searchInput = document.getElementById("searchInput");
  if (!searchInput || !searchInput.value)
    return;

  searchInput.value = "";
  if (aRefresh)
    onEnterInSearchBar();
}

/**
 * Returns an nsIFile of the directory in which contact photos are stored.
 * This will create the directory if it does not yet exist.
 */
function getPhotosDir() {
  var file = Services.dirsvc.get("ProfD", Ci.nsIFile);
  // Get the Photos directory
  file.append("Photos");
  if (!file.exists() || !file.isDirectory())
    file.create(Ci.nsIFile.DIRECTORY_TYPE, parseInt("0777", 8));
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
  if (!aPhotoName)
    return defaultPhotoURI;
  var file = getPhotosDir();
  try {
    file.append(aPhotoName);
  }
  catch (e) {
    return defaultPhotoURI;
  }
  if (!file.exists())
    return defaultPhotoURI;
  return Services.io.newFileURI(file).spec;
}

/**
 * Copies the photo at the given URI in a folder named "Photos" in the current
 * profile folder.
 * The filename is randomly generated and is unique.
 * The URI is used to obtain a channel which is then opened synchronously and
 * this stream is written to the new file to store an offline, local copy of the
 * photo.
 *
 * @param aUri The URI of the photo.
 *
 * @return An nsIFile representation of the photo.
 */
function storePhoto(aUri) {
  if (!aUri)
    return false;

  // Get the photos directory and check that it exists
  var file = getPhotosDir();

  // Create a channel from the URI and open it as an input stream
  var channel = Services.io.newChannelFromURI(Services.io.newURI(aUri),
                                         null,
                                         Services.scriptSecurityManager.getSystemPrincipal(),
                                         null,
                                         Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_DATA_IS_NULL,
                                         Ci.nsIContentPolicy.TYPE_INTERNAL_IMAGE);

  var istream = channel.open();

  // Get the photo file
  file = makePhotoFile(file, findPhotoExt(channel));

  return IOUtils.saveStreamToFile(istream, file);
}

/**
 * Finds the file extension of the photo identified by the URI, if possible.
 * This function can be overridden (with a copy of the original) for URIs that
 * do not identify the extension or when the Content-Type response header is
 * either not set or isn't 'image/png', 'image/jpeg', or 'image/gif'.
 * The original function can be called if the URI does not match.
 *
 * @param aUri The URI of the photo.
 * @param aChannel The opened channel for the URI.
 *
 * @return The extension of the file, if any, including the period.
 */
function findPhotoExt(aChannel) {
  var mimeSvc = Cc["@mozilla.org/mime;1"]
                  .getService(Ci.nsIMIMEService);
  var ext = "";
  var uri = aChannel.URI;
  if (uri instanceof Ci.nsIURL)
    ext = uri.fileExtension;
  try {
    return mimeSvc.getPrimaryExtension(aChannel.contentType, ext);
  } catch (e) {}
  return ext;
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
    filename = new String(Math.random()).replace("0.", "") + "." + aExtension;
    newFile = aDir.clone();
    newFile.append(filename);
  } while (newFile.exists());
  return newFile;
}

/**
 * Validates the given year and returns it, if it looks sane.
 * Returns kDefaultYear (a leap year), if no valid date is given.
 * This ensures that month/day calculations still work.
 */
function saneBirthYear(aYear) {
  return aYear && (aYear <= kMaxYear) && (aYear >= kMinYear) ? aYear : kDefaultYear;
}

/**
 * Returns the nearest leap year before aYear.
 */
function nearestLeap(aYear) {
  for (let year = aYear; year > 0; year--) {
    if (new Date(year, 1, 29).getMonth() == 1)
      return year;
  }
  return 2000;
}
