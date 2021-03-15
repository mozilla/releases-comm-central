/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that if a contact's address is updated, then the address is also
 * updated in mailing lists that that contact belongs to.
 */

"use strict";

var {
  accept_contact_changes,
  close_address_book_window,
  create_address_book,
  create_contact,
  create_mailing_list,
  delete_address_book,
  edit_selected_contact,
  open_address_book_window,
  select_address_book,
  select_contacts,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/AddressBookHelpers.jsm"
);
var { mc } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

add_task(function test_contact_in_mailing_list_updated() {
  const kOldAddress = "before@example.com";
  const kNewAddress = "after@example.com";

  // Create some address book to work with...
  let ab = create_address_book("Some Address Book");
  // And a contact...
  let contact = create_contact(kOldAddress, "Some Contact", true);
  // And our mailing list.
  let ml = create_mailing_list("Some Mailing List");

  // Add the mailing list to the address book, and then the card to the
  // address book, and finally, the card to the mailing list.
  ml = ab.addMailList(ml);
  contact = ml.addCard(contact);

  // Open the address book, select our contact...
  let abw = open_address_book_window(mc);
  select_address_book(ab);
  select_contacts(contact);

  // Change the primary email address of the contact...
  edit_selected_contact(abw, function(ecw) {
    ecw.e("PrimaryEmail").value = kNewAddress;
    accept_contact_changes(ecw);
  });

  // Because the current address book is kind of lame, in order
  // to see whether or not the mailing list contact was updated,
  // we have to get a fresh copy of the address book...
  ab = MailServices.ab.getDirectory(ab.URI);

  // Ensure that the primary email address for the contact changed
  // in the mailing list as well.
  let mlCards = ml.childCards;
  Assert.equal(
    1,
    mlCards.length,
    "There should only be one contact in the mailing list"
  );
  Assert.equal(kNewAddress, mlCards[0].primaryEmail);

  // Destroy the address book that we created.
  delete_address_book(ab);

  close_address_book_window(abw);
});
