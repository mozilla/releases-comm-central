/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

var ABJS_PREFIX = "jsaddrbook://";
var ABLDAP_PREFIX = "moz-abldapdirectory://";

var collectedAddresses;

// Ensure all the directories are initialised.
MailServices.ab.directories;
collectedAddresses = MailServices.ab.getDirectory(
  "jsaddrbook://history.sqlite"
);

/**
 * Make sure that there is a card for this email address
 *
 * @param {string} emailAddress - The address that should have a card.
 * @param {string} displayName - The display name the card should have.
 */
export function ensure_card_exists(emailAddress, displayName) {
  ensure_no_card_exists(emailAddress);
  const card = create_contact(emailAddress, displayName);
  collectedAddresses.addCard(card);
}

/**
 * Make sure that there is no card for this email address
 *
 * @param {string} emailAddress - The address that should have no cards.
 */
export function ensure_no_card_exists(emailAddress) {
  for (const ab of MailServices.ab.directories) {
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
 *
 * @param {string} aEmailAddress - The address to search for.
 */
export function get_cards_in_all_address_books_for_email(aEmailAddress) {
  var result = [];

  for (const ab of MailServices.ab.directories) {
    var card = ab.cardForEmailAddress(aEmailAddress);
    if (card) {
      result.push(card);
    }
  }

  return result;
}

/**
 * Creates and returns a SQLite-backed address book.
 *
 * @param {string} aName - The name for the address book.
 * @returns {?nsIAbDirectory} the nsIAbDirectory address book
 */
export function create_address_book(aName) {
  const abPrefString = MailServices.ab.newAddressBook(aName, "", 101);
  const abURI = Services.prefs.getCharPref(abPrefString + ".filename");
  return MailServices.ab.getDirectory(ABJS_PREFIX + abURI);
}

/**
 * Creates and returns an LDAP-backed address book.
 * This function will automatically fill in a dummy
 * LDAP URI if no URI is supplied.
 *
 * @param {string} aName - The name for the address book.
 * @param {string} aURI - An optional URI for the address book.
 * @returns {?nsIAbDirectory} the nsIAbDirectory address book
 */
export function create_ldap_address_book(aName, aURI) {
  if (!aURI) {
    aURI = "ldap://dummyldap/??sub?(objectclass=*)";
  }
  const abPrefString = MailServices.ab.newAddressBook(aName, aURI, 0);
  return MailServices.ab.getDirectory(ABLDAP_PREFIX + abPrefString);
}

/**
 * Creates and returns an address book contact
 *
 * @param {string} aEmailAddress - The e-mail address for this contact
 * @param {string} aDisplayName - The display name for the contact
 */
export function create_contact(aEmailAddress, aDisplayName) {
  const card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );
  card.primaryEmail = aEmailAddress;
  card.displayName = aDisplayName;
  return card;
}

/**
 * Creates and returns a mailing list.
 *
 * @param {string} aMailingListName - The display name for the new mailing list.
 * @returns {nsIAbDirectory}
 */
export function create_mailing_list(aMailingListName) {
  var mailList = Cc[
    "@mozilla.org/addressbook/directoryproperty;1"
  ].createInstance(Ci.nsIAbDirectory);
  mailList.isMailList = true;
  mailList.dirName = aMailingListName;
  return mailList;
}

/**
 * Finds and returns a mailing list with a given dirName within a given
 * address book.
 *
 * @param {nsIAbDirectory} aAddressBook - The address book to search.
 * @param {string} aDirName - The dirName of the mailing list.
 */
export function get_mailing_list_from_address_book(aAddressBook, aDirName) {
  for (const list of aAddressBook.childNodes) {
    if (list.dirName == aDirName) {
      return list;
    }
  }
  throw Error("Could not find a mailing list with dirName " + aDirName);
}

/* Given some address book, adds a collection of contacts to that
 * address book.
 * @param {nsIAbDirectory} aAddressBook - An address book to add the contacts to.
 * @param {object[]} aContacts - A collection of nsIAbCards, or contacts,
 *   where each contact has members "email" and "displayName"
 *
 *                  Example:
 *                  [{email: 'test@example.com', displayName: 'Sammy Jenkis'}]
 */
export function load_contacts_into_address_book(aAddressBook, aContacts) {
  for (let i = 0; i < aContacts.length; i++) {
    let contact = aContacts[i];
    if (!(contact instanceof Ci.nsIAbCard)) {
      contact = create_contact(contact.email, contact.displayName);
    }

    aContacts[i] = aAddressBook.addCard(contact);
  }
}
