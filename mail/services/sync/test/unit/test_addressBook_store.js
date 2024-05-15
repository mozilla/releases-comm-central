/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { AddressBooksEngine, AddressBookRecord } = ChromeUtils.importESModule(
  "resource://services-sync/engines/addressBooks.sys.mjs"
);
const { Service } = ChromeUtils.importESModule(
  "resource://services-sync/service.sys.mjs"
);

let engine, store, tracker;
let cardDAVBook, ldapBook;

add_setup(async function () {
  await populateCacheFile();

  engine = new AddressBooksEngine(Service);
  await engine.initialize();
  store = engine._store;

  let dirPrefId = MailServices.ab.newAddressBook(
    "CardDAV Book",
    null,
    MailServices.ab.CARDDAV_DIRECTORY_TYPE
  );
  cardDAVBook = MailServices.ab.getDirectoryFromId(dirPrefId);
  cardDAVBook.setStringValue("carddav.url", "https://localhost:1234/a/book");
  cardDAVBook.setStringValue("carddav.username", "username@localhost");

  dirPrefId = MailServices.ab.newAddressBook(
    "LDAP Book",
    "ldap://localhost/dc=localhost??sub?(objectclass=*)",
    MailServices.ab.LDAP_DIRECTORY_TYPE
  );
  ldapBook = MailServices.ab.getDirectoryFromId(dirPrefId);
  ldapBook.QueryInterface(Ci.nsIAbLDAPDirectory);
});

add_task(async function testGetAllIDs() {
  Assert.deepEqual(await store.getAllIDs(), {
    [cardDAVBook.UID]: true,
    [ldapBook.UID]: true,
    "b5b417f5-11cd-4cfd-a578-d3ef6402ba7b": true,
  });
});

add_task(async function testItemExists() {
  Assert.ok(await store.itemExists(cardDAVBook.UID));
  Assert.ok(await store.itemExists(ldapBook.UID));
  Assert.ok(await store.itemExists("b5b417f5-11cd-4cfd-a578-d3ef6402ba7b"));
  Assert.ok(!(await store.itemExists("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")));
});

// Test that we create records with all of the expected properties. After
// creating each record, encrypt it and decrypt the encrypted text, so that
// we're testing what gets sent to the server, not just the object created.

add_task(async function testCreateCardDAVRecord() {
  let record = await store.createRecord(cardDAVBook.UID);
  record = await roundTripRecord(record, AddressBookRecord);
  Assert.equal(record.id, cardDAVBook.UID);
  Assert.equal(record.name, "CardDAV Book");
  Assert.equal(record.type, "carddav");
  Assert.equal(record.url, "https://localhost:1234/a/book");
  Assert.strictEqual(record.authMethod, undefined);
  Assert.equal(record.username, "username@localhost");
});

add_task(async function testCreateLDAPRecord() {
  let record = await store.createRecord(ldapBook.UID);
  record = await roundTripRecord(record, AddressBookRecord);
  Assert.equal(record.id, ldapBook.UID);
  Assert.equal(record.name, "LDAP Book");
  Assert.equal(record.type, "ldap");
  Assert.equal(
    record.url,
    "ldap://localhost/dc=localhost??sub?(objectclass=*)"
  );
  Assert.strictEqual(record.authMethod, undefined);
  Assert.strictEqual(record.username, undefined);

  const url = ldapBook.lDAPURL;
  url.options = Ci.nsILDAPURL.OPT_SECURE;
  ldapBook.lDAPURL = url;
  ldapBook.authDn = "cn=username";
  record = await store.createRecord(ldapBook.UID);
  record = await roundTripRecord(record, AddressBookRecord);
  Assert.equal(
    record.url,
    "ldaps://localhost/dc=localhost??sub?(objectclass=*)"
  );
  Assert.equal(record.authMethod, "passwordCleartext");
  Assert.equal(record.username, "cn=username");

  ldapBook.saslMechanism = "GSSAPI";
  record = await store.createRecord(ldapBook.UID);
  record = await roundTripRecord(record, AddressBookRecord);
  Assert.equal(record.authMethod, "gssapi");
});

add_task(async function testCreateCachedUnknownRecord() {
  let record = await store.createRecord("b5b417f5-11cd-4cfd-a578-d3ef6402ba7b");
  record = await roundTripRecord(record, AddressBookRecord);
  Assert.equal(record.id, "b5b417f5-11cd-4cfd-a578-d3ef6402ba7b");
  Assert.equal(record.name, "Unknown Address Book");
  Assert.equal(record.type, "unknown");
  Assert.equal(record.url, "https://unknown.hostname/addressBook");
  Assert.strictEqual(record.authMethod, undefined);
  Assert.strictEqual(record.username, undefined);
});

add_task(async function testCreateDeletedRecord() {
  const fakeID = "12345678-1234-1234-1234-123456789012";
  let record = await store.createRecord(fakeID);
  record = await roundTripRecord(record, AddressBookRecord);
  Assert.equal(record.id, fakeID);
  Assert.equal(record.deleted, true);
});

// Test creating, updating, and deleting address books from incoming records.

add_task(async function testSyncCardDAVRecords() {
  const id = newUID();
  const data = {
    id,
    name: "New CardDAV Book",
    type: "carddav",
    url: "https://new.hostname/",
    username: "username@new.hostname",
  };
  await store.applyIncoming(AddressBookRecord.from(data));

  Assert.equal(MailServices.ab.directories.length, 5);
  let book = MailServices.ab.getDirectoryFromUID(id);
  Assert.equal(book.dirName, "New CardDAV Book");
  Assert.equal(book.dirType, MailServices.ab.CARDDAV_DIRECTORY_TYPE);
  Assert.equal(
    book.getStringValue("carddav.url", null),
    "https://new.hostname/"
  );
  Assert.equal(
    book.getStringValue("carddav.username", null),
    "username@new.hostname"
  );

  // Change some properties.

  data.name = "Changed CardDAV Book";
  data.username = "username@changed.hostname";
  await store.applyIncoming(AddressBookRecord.from(data));

  Assert.equal(MailServices.ab.directories.length, 5);
  book = MailServices.ab.getDirectoryFromUID(id);
  Assert.equal(book.dirName, "Changed CardDAV Book");
  Assert.equal(book.dirType, MailServices.ab.CARDDAV_DIRECTORY_TYPE);
  Assert.equal(
    book.getStringValue("carddav.username", null),
    "username@changed.hostname"
  );

  // Change the address book type. This should fail.

  await Assert.rejects(
    store.applyIncoming(AddressBookRecord.from({ ...data, type: "ldap" })),
    /Refusing to change book type/,
    "changing the address book type should fail"
  );

  // Change the address book URL. This should fail.

  await Assert.rejects(
    store.applyIncoming(
      AddressBookRecord.from({ ...data, url: "https://changed.hostname/" })
    ),
    /Refusing to change book URL/,
    "changing the address book URL should fail"
  );

  // Delete the address book.

  await store.applyIncoming(AddressBookRecord.from({ id, deleted: true }));

  Assert.equal(MailServices.ab.directories.length, 4);
  book = MailServices.ab.getDirectoryFromUID(id);
  Assert.equal(book, null);
});

add_task(async function testSyncLDAPRecords() {
  const id = newUID();
  const data = {
    id,
    name: "New LDAP Book",
    type: "ldap",
    url: "ldap://new.hostname",
  };
  await store.applyIncoming(AddressBookRecord.from(data));

  Assert.equal(MailServices.ab.directories.length, 5);
  let book = MailServices.ab.getDirectoryFromUID(id);
  book.QueryInterface(Ci.nsIAbLDAPDirectory);
  Assert.equal(book.dirName, "New LDAP Book");
  Assert.equal(book.dirType, MailServices.ab.LDAP_DIRECTORY_TYPE);
  Assert.equal(book.lDAPURL.host, "new.hostname");
  Assert.equal(book.lDAPURL.port, -1);
  Assert.equal(book.lDAPURL.options, 0);
  Assert.ok(!book.authDn);
  Assert.ok(!book.saslMechanism);

  // Change some properties.

  data.name = "Changed LDAP Book";
  data.url = "ldap://changed.hostname";
  await store.applyIncoming(AddressBookRecord.from(data));

  Assert.equal(MailServices.ab.directories.length, 5);
  book = MailServices.ab.getDirectoryFromUID(id);
  book.QueryInterface(Ci.nsIAbLDAPDirectory);
  Assert.equal(book.dirName, "Changed LDAP Book");
  Assert.equal(book.lDAPURL.host, "changed.hostname");

  // Change the address book type. This should fail.

  await Assert.rejects(
    store.applyIncoming(AddressBookRecord.from({ id, type: "carddav" })),
    /Refusing to change book type/,
    "changing the address book type should fail"
  );

  // Test some port/socket type combinations.

  for (const [port, scheme, expectedPort] of [
    [389, "ldaps", 389],
    [636, "ldap", 636],
    [636, "ldaps", -1],
    [999, "ldap", 999],
    [999, "ldaps", 999],
  ]) {
    data.url = `${scheme}://changed.hostname:${port}`;
    await store.applyIncoming(AddressBookRecord.from(data));

    book = MailServices.ab.getDirectoryFromUID(id);
    book.QueryInterface(Ci.nsIAbLDAPDirectory);
    Assert.equal(book.lDAPURL.port, expectedPort);
  }

  // Add a username.

  data.username = "username@changed.hostname";
  data.authMethod = "passwordCleartext";
  await store.applyIncoming(AddressBookRecord.from(data));

  book = MailServices.ab.getDirectoryFromUID(id);
  book.QueryInterface(Ci.nsIAbLDAPDirectory);
  Assert.equal(book.authDn, "username@changed.hostname");
  Assert.equal(book.saslMechanism, "");

  // Change the authentication mechanism.

  data.authMethod = "gssapi";
  await store.applyIncoming(AddressBookRecord.from(data));

  book = MailServices.ab.getDirectoryFromUID(id);
  book.QueryInterface(Ci.nsIAbLDAPDirectory);
  Assert.equal(book.saslMechanism, "GSSAPI");

  // Delete the address book.

  await store.applyIncoming(AddressBookRecord.from({ id, deleted: true }));

  Assert.equal(MailServices.ab.directories.length, 4);
  book = MailServices.ab.getDirectoryFromUID(id);
  Assert.equal(book, null);
});

// Test things we don't understand.

/**
 * Tests an address book type we don't know about.
 */
add_task(async function testSyncUnknownType() {
  const id = newUID();
  const data = {
    id,
    name: "XYZ Address Book",
    type: "xyz",
    url: "https://localhost/addressBooks/file.xyz",
    username: "username",
  };
  await store.applyIncoming(AddressBookRecord.from(data));

  Assert.equal(MailServices.ab.directories.length, 4);
  Assert.ok(!MailServices.ab.getDirectoryFromUID(id));

  await store.applyIncoming(AddressBookRecord.from(data));

  await store.applyIncoming(AddressBookRecord.from({ id, deleted: true }));

  Assert.equal(MailServices.ab.directories.length, 4);
});

/**
 * Tests an address book type we know about, but properties we don't know about.
 */
add_task(async function testSyncUnknownProperties() {
  const id = newUID();
  await store.applyIncoming(
    AddressBookRecord.from({
      id,
      name: "Future CardDAV Book",
      type: "carddav",
      url: "https://v999.hostname/addressBooks/file.vcf",
      username: "username",
      extra: {},
      additional: "much data",
      more: "wow!",
    })
  );

  Assert.equal(MailServices.ab.directories.length, 5);
  const book = MailServices.ab.getDirectoryFromUID(id);
  Assert.equal(book.UID, id);
  Assert.equal(book.dirName, "Future CardDAV Book");
  Assert.equal(book.dirType, MailServices.ab.CARDDAV_DIRECTORY_TYPE);
  Assert.equal(
    book.getStringValue("carddav.url", null),
    "https://v999.hostname/addressBooks/file.vcf"
  );
  Assert.equal(book.getStringValue("carddav.username", null), "username");

  let record = await store.createRecord(id);
  record = await roundTripRecord(record, AddressBookRecord);

  Assert.equal(record.id, id);
  Assert.equal(record.name, "Future CardDAV Book");
  Assert.equal(record.type, "carddav");
  Assert.equal(record.url, "https://v999.hostname/addressBooks/file.vcf");
  Assert.equal(record.username, "username");
  Assert.deepEqual(record.cleartext.extra, {});
  Assert.equal(record.cleartext.additional, "much data");
  Assert.equal(record.cleartext.more, "wow!");

  await store.applyIncoming(AddressBookRecord.from({ id, deleted: true }));

  Assert.equal(MailServices.ab.directories.length, 4);
});
