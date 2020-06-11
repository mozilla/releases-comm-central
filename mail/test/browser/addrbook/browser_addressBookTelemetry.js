/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* global reportAddressBookTypes */

/**
 * Test telemetry related to address book.
 */

let { TelemetryTestUtils } = ChromeUtils.import(
  "resource://testing-common/TelemetryTestUtils.jsm"
);
let {
  create_address_book,
  delete_address_book,
  create_contact,
  create_ldap_address_book,
  load_contacts_into_address_book,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/AddressBookHelpers.jsm"
);

/**
 * Test we're counting address books and contacts.
 */
add_task(async function test_address_book_count() {
  Services.telemetry.clearScalars();

  // Adding some address books and contracts.
  let addrBook1 = create_address_book("AB 1");
  let addrBook2 = create_address_book("AB 2");
  let ldapBook = create_ldap_address_book("LDAP Book");

  let contact1 = create_contact("test1@example.com", "test1", true);
  let contact2 = create_contact("test2@example.com", "test2", true);
  let contact3 = create_contact("test3@example.com", "test3", true);
  load_contacts_into_address_book(addrBook1, [contact1]);
  load_contacts_into_address_book(addrBook2, [contact2, contact3]);

  // Run the probe.
  reportAddressBookTypes();

  let scalars = TelemetryTestUtils.getProcessScalars("parent", true);
  Assert.equal(
    scalars["tb.addressbook.addressbook_count"]["moz-abldapdirectory"],
    1,
    "LDAP address book count must be correct"
  );
  Assert.equal(
    scalars["tb.addressbook.addressbook_count"].jsaddrbook,
    4,
    "JS address book count must be correct"
  );
  Assert.equal(
    scalars["tb.addressbook.contact_count"].jsaddrbook,
    3,
    "Contact count must be correct"
  );

  registerCleanupFunction(() => {
    delete_address_book(addrBook1);
    delete_address_book(addrBook2);
    delete_address_book(ldapBook);
  });
});
