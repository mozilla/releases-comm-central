/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Test telemetry related to address book.
 */

const { MailTelemetryForTests } = ChromeUtils.import(
  "resource:///modules/MailGlue.jsm"
);
const { TelemetryTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TelemetryTestUtils.sys.mjs"
);

/**
 * Test we're counting address books and contacts.
 */
add_task(async function test_address_book_count() {
  Services.telemetry.clearScalars();

  // Adding some address books and contracts.
  const addrBook1 = createAddressBook("AB 1");
  const addrBook2 = createAddressBook("AB 2");
  const ldapBook = createAddressBook(
    "LDAP Book",
    Ci.nsIAbManager.LDAP_DIRECTORY_TYPE
  );

  const contact1 = createContact("test1", "example");
  const contact2 = createContact("test2", "example");
  const contact3 = createContact("test3", "example");
  addrBook1.addCard(contact1);
  addrBook2.addCard(contact2);
  addrBook2.addCard(contact3);

  // Run the probe.
  MailTelemetryForTests.reportAddressBookTypes();

  const scalars = TelemetryTestUtils.getProcessScalars("parent", true);
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

  await promiseDirectoryRemoved(addrBook1.URI);
  await promiseDirectoryRemoved(addrBook2.URI);
  await promiseDirectoryRemoved(ldapBook.URI);
});
