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

add_setup(async function () {
  engine = new AddressBooksEngine(Service);
  await engine.initialize();
  store = engine._store;
  tracker = engine._tracker;

  Assert.equal(tracker._isTracking, false, "tracker is disabled");
  await assertNoChangeTracked(tracker);

  tracker.start();
  Assert.equal(tracker._isTracking, true, "tracker is enabled");

  registerCleanupFunction(function () {
    tracker.stop();
  });
});

/**
 * Test creating, changing, and deleting a CardDAV book that should be synced.
 */
add_task(async function testCardDAVAddressBook() {
  const id = newUID();
  const dirPrefId = MailServices.ab.newAddressBook(
    "CardDAV Address Book",
    null,
    MailServices.ab.CARDDAV_DIRECTORY_TYPE,
    id
  );
  await assertChangeTracked(tracker, id);
  await assertNoChangeTracked(tracker);

  const book = MailServices.ab.getDirectoryFromId(dirPrefId);
  book.dirName = "Changed Address Book";
  await assertChangeTracked(tracker, id);

  book.setStringValue("carddav.url", "https://changed.hostname/");
  await assertChangeTracked(tracker, id);

  book.setStringValue("carddav.username", "changed username");
  await assertChangeTracked(tracker, id);

  const deletedPromise = TestUtils.topicObserved("addrbook-directory-deleted");
  MailServices.ab.deleteAddressBook(book.URI);
  await deletedPromise;
  let record = await assertChangeTracked(tracker, id);
  record = await roundTripRecord(record, AddressBookRecord);
  Assert.ok(record.deleted, "record should be a tombstone record");
  await assertNoChangeTracked(tracker);
});

/**
 * Test creating, changing, and deleting an LDAP book that should be synced.
 */
add_task(async function testLDAPAddressBook() {
  const id = newUID();
  const dirPrefId = MailServices.ab.newAddressBook(
    "LDAP Address Book",
    "ldap://new.hostname/",
    MailServices.ab.LDAP_DIRECTORY_TYPE,
    id
  );
  await assertChangeTracked(tracker, id);
  await assertNoChangeTracked(tracker);

  const book = MailServices.ab.getDirectoryFromId(dirPrefId);
  book.QueryInterface(Ci.nsIAbLDAPDirectory);

  await checkPropertyChanges(tracker, book, [
    ["dirName", "Changed Address Book"],
    [
      "lDAPURL",
      Services.io.newURI(
        "ldap://changed.hostname/dc=localhost??sub?(objectclass=*)"
      ),
    ],
    ["authDn", "cn=username"],
    ["saslMechanism", "GSSAPI"],
  ]);

  const deletedPromise = TestUtils.topicObserved("addrbook-directory-deleted");
  MailServices.ab.deleteAddressBook(book.URI);
  await deletedPromise;
  let record = await assertChangeTracked(tracker, id);
  record = await roundTripRecord(record, AddressBookRecord);
  Assert.ok(record.deleted, "record should be a tombstone record");
  await assertNoChangeTracked(tracker);
});

/**
 * Test a local address book. This shouldn't affect the tracker at all.
 */
add_task(async function testLocalAddressBook() {
  const dirPrefId = MailServices.ab.newAddressBook(
    "Local Address Book",
    null,
    MailServices.ab.JS_DIRECTORY_TYPE
  );
  await assertNoChangeTracked(tracker);

  const book = MailServices.ab.getDirectoryFromId(dirPrefId);
  book.dirName = "Changed Address Book";
  book.setBoolValue("readOnly", true);
  await assertNoChangeTracked(tracker);

  const deletedPromise = TestUtils.topicObserved("addrbook-directory-deleted");
  MailServices.ab.deleteAddressBook(book.URI);
  await deletedPromise;
  await assertNoChangeTracked(tracker);
});

/**
 * Test the store methods on address books. The tracker should ignore them.
 */
add_task(async function testIncomingChanges() {
  const id = newUID();

  tracker.ignoreAll = true;
  await store.applyIncoming(
    AddressBookRecord.from({
      id,
      name: "New Book",
      type: "carddav",
      url: "https://localhost/",
      username: "username",
    })
  );
  tracker.ignoreAll = false;

  await assertNoChangeTracked(tracker);

  tracker.ignoreAll = true;
  await store.applyIncoming(
    AddressBookRecord.from({
      id,
      name: "Changed Book",
      type: "carddav",
      url: "https://localhost/",
      username: "username@localhost",
    })
  );
  tracker.ignoreAll = false;

  await assertNoChangeTracked(tracker);

  tracker.ignoreAll = true;
  await store.applyIncoming(AddressBookRecord.from({ id, deleted: true }));
  tracker.ignoreAll = false;

  await assertNoChangeTracked(tracker);
});
