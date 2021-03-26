/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = [
  "ensure_card_exists",
  "ensure_no_card_exists",
  "open_address_book_window",
  "close_address_book_window",
  "create_address_book",
  "create_ldap_address_book",
  "create_contact",
  "create_mailing_list",
  "get_mailing_list_from_address_book",
  "load_contacts_into_address_book",
  "load_contacts_into_mailing_list",
  "get_cards_in_all_address_books_for_email",
  "get_address_book_tree_view_index",
  "set_address_books_collapsed",
  "set_address_books_expanded",
  "is_address_book_collapsed",
  "is_address_book_collapsible",
  "get_name_of_address_book_element_at",
  "select_address_book",
  "get_contact_ab_view_index",
  "select_contacts",
  "edit_selected_contact",
  "accept_contact_changes",
  "delete_address_book",
];

var folderDisplayHelper = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var windowHelper = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);
var EventUtils = ChromeUtils.import(
  "resource://testing-common/mozmill/EventUtils.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var ABJS_PREFIX = "jsaddrbook://";
var ABLDAP_PREFIX = "moz-abldapdirectory://";

var collectedAddresses;

var abController;

var mc = folderDisplayHelper.mc;

// Ensure all the directories are initialised.
MailServices.ab.directories;
collectedAddresses = MailServices.ab.getDirectory(
  "jsaddrbook://history.sqlite"
);

/**
 * Make sure that there is a card for this email address
 * @param emailAddress the address that should have a card
 * @param displayName the display name the card should have
 * @param preferDisplayName |true| if the card display name should override the
 *                          header display name
 */
function ensure_card_exists(emailAddress, displayName, preferDisplayName) {
  ensure_no_card_exists(emailAddress);
  let card = create_contact(emailAddress, displayName, preferDisplayName);
  collectedAddresses.addCard(card);
}

/**
 * Make sure that there is no card for this email address
 * @param emailAddress the address that should have no cards
 */
function ensure_no_card_exists(emailAddress) {
  for (let ab of MailServices.ab.directories) {
    try {
      var card = ab.cardForEmailAddress(emailAddress);
      if (card) {
        ab.deleteCards([card]);
      }
    } catch (ex) {}
  }
}

/**
 * Return all address book cards for a particular email address
 * @param aEmailAddress the address to search for
 */
function get_cards_in_all_address_books_for_email(aEmailAddress) {
  var result = [];

  for (let ab of MailServices.ab.directories) {
    var card = ab.cardForEmailAddress(aEmailAddress);
    if (card) {
      result.push(card);
    }
  }

  return result;
}

/**
 * Opens the address book interface
 * @returns a controller for the address book
 */
function open_address_book_window(aController) {
  if (aController === undefined) {
    aController = mc;
  }

  windowHelper.plan_for_new_window("mail:addressbook");
  EventUtils.synthesizeKey(
    "b",
    { shiftKey: true, accelKey: true },
    aController.window
  );

  // XXX this should probably be changed to making callers pass in which address
  // book they want to work with, just like ComposeHelpers.
  abController = windowHelper.wait_for_new_window("mail:addressbook");
  windowHelper.augment_controller(abController);
  return abController;
}

/**
 * Closes the address book interface
 * @param abc the controller for the address book window to close
 * @return the result from wait_for_window_close
 */
function close_address_book_window(abc) {
  windowHelper.plan_for_window_close(abc);
  abc.window.close();
  return windowHelper.wait_for_window_close(abc);
}

/**
 * Creates and returns a SQLite-backed address book.
 * @param aName the name for the address book
 * @returns the nsIAbDirectory address book
 */
function create_address_book(aName) {
  let abPrefString = MailServices.ab.newAddressBook(aName, "", 101);
  let abURI = Services.prefs.getCharPref(abPrefString + ".filename");
  return MailServices.ab.getDirectory(ABJS_PREFIX + abURI);
}

/**
 * Creates and returns an LDAP-backed address book.
 * This function will automatically fill in a dummy
 * LDAP URI if no URI is supplied.
 * @param aName the name for the address book
 * @param aURI an optional URI for the address book
 * @returns the nsIAbDirectory address book
 */
function create_ldap_address_book(aName, aURI) {
  if (!aURI) {
    aURI = "ldap://dummyldap/??sub?(objectclass=*)";
  }
  let abPrefString = MailServices.ab.newAddressBook(aName, aURI, 0);
  return MailServices.ab.getDirectory(ABLDAP_PREFIX + abPrefString);
}

/**
 * Creates and returns an address book contact
 * @param aEmailAddress the e-mail address for this contact
 * @param aDisplayName the display name for the contact
 * @param aPreferDisplayName set to true if the card display name should
 *                           override the header display name
 */
function create_contact(aEmailAddress, aDisplayName, aPreferDisplayName) {
  let card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );
  card.primaryEmail = aEmailAddress;
  card.displayName = aDisplayName;
  card.setProperty("PreferDisplayName", !!aPreferDisplayName);
  return card;
}

/* Creates and returns a mailing list
 * @param aMailingListName the display name for the new mailing list
 */
function create_mailing_list(aMailingListName) {
  var mailList = Cc[
    "@mozilla.org/addressbook/directoryproperty;1"
  ].createInstance(Ci.nsIAbDirectory);
  mailList.isMailList = true;
  mailList.dirName = aMailingListName;
  return mailList;
}

/* Finds and returns a mailing list with a given dirName within a
 * given address book.
 * @param aAddressBook the address book to search
 * @param aDirName the dirName of the mailing list
 */
function get_mailing_list_from_address_book(aAddressBook, aDirName) {
  for (let list of aAddressBook.childNodes) {
    if (list.dirName == aDirName) {
      return list;
    }
  }
  throw Error("Could not find a mailing list with dirName " + aDirName);
}

/* Given some address book, adds a collection of contacts to that
 * address book.
 * @param aAddressBook an address book to add the contacts to
 * @param aContacts a collection of nsIAbCards, or contacts,
 *                  where each contact has members "email"
 *                  and "displayName"
 *
 *                  Example:
 *                  [{email: 'test@example.com', displayName: 'Sammy Jenkis'}]
 */
function load_contacts_into_address_book(aAddressBook, aContacts) {
  for (let i = 0; i < aContacts.length; i++) {
    let contact = aContacts[i];
    if (!(contact instanceof Ci.nsIAbCard)) {
      contact = create_contact(contact.email, contact.displayName, true);
    }

    aContacts[i] = aAddressBook.addCard(contact);
  }
}

/* Given some mailing list, adds a collection of contacts to that
 * mailing list.
 * @param aMailingList a mailing list to add the contacts to
 * @param aContacts a collection of contacts, where each contact is either
 *                  an nsIAbCard, or an object with members "email" and
 *                  "displayName"
 *
 *                  Example:
 *                  [{email: 'test@example.com', displayName: 'Sammy Jenkis'}]
 */
function load_contacts_into_mailing_list(aMailingList, aContacts) {
  // Surprise! A mailing list is just a super special type of address
  // book.
  load_contacts_into_address_book(aMailingList, aContacts);
}

/* Given some address book, return the row index for that address book
 * in the tree view.  Throws an error if it cannot find the address book.
 * @param aAddrBook an address book to search for
 * @return the row index for that address book
 */
function get_address_book_tree_view_index(aAddrBook) {
  let addrbooks = abController.window.gDirectoryTreeView._rowMap;
  for (let i = 0; i < addrbooks.length; i++) {
    if (addrbooks[i]._directory.URI == aAddrBook.URI) {
      return i;
    }
  }
  throw Error(
    "Could not find the index for the address book named " + aAddrBook.dirName
  );
}

/* Given some contact, return the row index for that contact in the
 * address book view.  Assumes that the address book that the contact
 * belongs to is currently selected.  Throws an error if it cannot
 * find the contact.
 * @param aContact a contact to search for
 * @return the row index for that contact
 */
function get_contact_ab_view_index(aContact) {
  let contacts = abController.window.gAbView;
  for (let i = 0; i < contacts.rowCount; i++) {
    let contact = contacts.getCardFromRow(i);
    if (contact.equals(aContact)) {
      return i;
    }
  }
  throw Error(
    "Could not find the index for the contact named " + aContact.displayName
  );
}

/* Determines whether or not an address book is collapsed in
 * the tree view.
 * @param aAddrBook the address book to check
 * @return true if the address book is collapsed, otherwise false
 */
function is_address_book_collapsed(aAddrbook) {
  let aIndex = get_address_book_tree_view_index(aAddrbook);
  return !abController.window.gDirectoryTreeView.isContainerOpen(aIndex);
}

/* Determines whether or not an address book is collapsible in
 * the tree view.
 * @param aAddrBook the address book to check
 * @return true if the address book is collapsible, otherwise false
 */
function is_address_book_collapsible(aAddrbook) {
  let aIndex = get_address_book_tree_view_index(aAddrbook);
  return !abController.window.gDirectoryTreeView.isContainerEmpty(aIndex);
}

/* Sets one or more address books to the expanded state in the
 * tree view.  If any of the address books cannot be expanded,
 * an error is thrown.
 * @param aAddrBooks either a lone address book, or an array of
 *        address books
 */
function set_address_books_expanded(aAddrBooks) {
  if (!Array.isArray(aAddrBooks)) {
    aAddrBooks = [aAddrBooks];
  }

  for (let i = 0; i < aAddrBooks.length; i++) {
    let addrBook = aAddrBooks[i];
    if (!is_address_book_collapsible(addrBook)) {
      throw Error(
        "Address book called " + addrBook.dirName + " cannot be expanded."
      );
    }
    if (is_address_book_collapsed(addrBook)) {
      let aIndex = get_address_book_tree_view_index(addrBook);
      abController.window.gDirectoryTreeView.toggleOpenState(aIndex);
    }
  }
}

/* Sets one or more address books to the collapsed state in the
 * tree view.  If any of the address books cannot be collapsed,
 * an error is thrown.
 * @param aAddrBooks either a lone address book, or an array of
 *        address books
 */
function set_address_books_collapsed(aAddrBooks) {
  if (!Array.isArray(aAddrBooks)) {
    aAddrBooks = [aAddrBooks];
  }

  for (let i = 0; i < aAddrBooks.length; i++) {
    let addrBook = aAddrBooks[i];
    if (!is_address_book_collapsible(addrBook)) {
      throw Error(
        "Address book called " + addrBook.dirName + " cannot be collapsed."
      );
    }
    if (!is_address_book_collapsed(addrBook)) {
      let aIndex = get_address_book_tree_view_index(addrBook);
      abController.window.gDirectoryTreeView.toggleOpenState(aIndex);
    }
  }
}

/* Returns the displayed name of an address book in the tree view
 * at a particular row index.
 * @param aIndex the row index of the target address book
 * @return the displayed name of the address book
 */
function get_name_of_address_book_element_at(aIndex) {
  return abController.window.gDirectoryTreeView.getCellText(aIndex, 0);
}

/* Selects a given address book in the tree view.  Assumes that
 * the parent of aAddrBook in the treeView is not collapsed.
 * Since mailing lists are technically address books, this will
 * work for mailing lists too.
 * @param aAddrBook an address book to select
 */
function select_address_book(aAddrBook) {
  let aIndex = get_address_book_tree_view_index(aAddrBook);
  abController.window.gDirectoryTreeView.selection.select(aIndex);
  // Focus the resulting list of cards.
  abController.window.gAbResultsTree.focus();
}

/* Selects one or more contacts in an address book, assuming that
 * the address book is already selected.  Pass a single nsIAbCard
 * to select one contact, or an array of nsIAbCards to select
 * multiple.
 */
function select_contacts(aContacts) {
  if (!Array.isArray(aContacts)) {
    aContacts = [aContacts];
  }

  abController.window.gAbView.selection.clearSelection();
  for (let i = 0; i < aContacts.length; i++) {
    let aIndex = get_contact_ab_view_index(aContacts[i]);
    abController.window.gAbView.selection.toggleSelect(aIndex);
  }
}

/**
 * Opens the contact editing dialog for the selected contact. Callers
 * are responsible for closing the dialog.
 *
 * @param aController the address book window controller to use.
 * @param aFunction the function to execute when the editing dialog
 *                  is opened (since it's a modal dialog).  The function
 *                  should take a single parameter, which will be the
 *                  augmented controller for the editing dialog.
 */
function edit_selected_contact(aController, aFunction) {
  windowHelper.plan_for_modal_dialog("Mail:abcard", aFunction);
  aController.click(
    aController.window.document.getElementById("button-editcard")
  );
  windowHelper.wait_for_modal_dialog("Mail:abcard");
}

/**
 * Accepts the changes entered into the contact editing dialog, and closes
 * the dialog.
 *
 * @param aController the contact editing dialog controller to use.
 */
function accept_contact_changes(aController) {
  if (
    !aController.window.document.documentElement
      .querySelector("dialog")
      .acceptDialog()
  ) {
    throw new Error("Could not close the contact editing dialog!");
  }
}

/**
 * Deletes an address book.
 */
function delete_address_book(aAddrBook) {
  MailServices.ab.deleteAddressBook(aAddrBook.URI);
}
