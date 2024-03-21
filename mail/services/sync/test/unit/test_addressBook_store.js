/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

do_get_profile();

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
const { AddressBooksEngine, AddressBookRecord } = ChromeUtils.importESModule(
  "resource://services-sync/engines/addressBooks.sys.mjs"
);
const { Service } = ChromeUtils.importESModule(
  "resource://services-sync/service.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PromiseTestUtils.sys.mjs"
);

let engine, store, tracker;
let cardDAVBook;

// TODO test ldap books

add_setup(async function () {
  engine = new AddressBooksEngine(Service);
  await engine.initialize();
  store = engine._store;

  const dirPrefId = MailServices.ab.newAddressBook(
    "Sync Address Book",
    null,
    MailServices.ab.CARDDAV_DIRECTORY_TYPE
  );
  cardDAVBook = MailServices.ab.getDirectoryFromId(dirPrefId);
  cardDAVBook.setStringValue("carddav.url", "https://localhost:1234/a/book");
});

add_task(async function testGetAllIDs() {
  Assert.deepEqual(await store.getAllIDs(), {
    [cardDAVBook.UID]: true,
  });
});

add_task(async function testItemExists() {
  Assert.equal(await store.itemExists(cardDAVBook.UID), true);
});

add_task(async function testCreateRecord() {
  const record = await store.createRecord(cardDAVBook.UID);
  Assert.ok(record instanceof AddressBookRecord);
  Assert.equal(record.id, cardDAVBook.UID);
  Assert.equal(record.name, "Sync Address Book");
  Assert.equal(record.type, MailServices.ab.CARDDAV_DIRECTORY_TYPE);
  Assert.deepEqual(record.prefs, { url: "https://localhost:1234/a/book" });
});

add_task(async function testCreateDeletedRecord() {
  const fakeID = "12345678-1234-1234-1234-123456789012";
  const record = await store.createRecord(fakeID);
  Assert.ok(record instanceof AddressBookRecord);
  Assert.equal(record.id, fakeID);
  Assert.equal(record.deleted, true);
});

add_task(async function testSyncRecords() {
  Assert.equal(MailServices.ab.directories.length, 3);
  PromiseTestUtils.expectUncaughtRejection(/Connection failure/);

  const newID = newUID();
  await store.applyIncoming({
    id: newID,
    name: "bar",
    type: MailServices.ab.CARDDAV_DIRECTORY_TYPE,
    prefs: {
      url: "https://localhost/",
      syncInterval: 0,
      username: "username",
    },
  });
  Services.obs.notifyObservers(null, "weave:service:sync:finish");

  Assert.equal(MailServices.ab.directories.length, 4);
  let newBook = MailServices.ab.getDirectoryFromUID(newID);
  Assert.equal(newBook.dirName, "bar");
  Assert.equal(newBook.dirType, MailServices.ab.CARDDAV_DIRECTORY_TYPE);
  Assert.equal(
    newBook.getStringValue("carddav.url", null),
    "https://localhost/"
  );
  Assert.equal(newBook.getIntValue("carddav.syncinterval", null), 0);
  Assert.equal(newBook.getStringValue("carddav.username", null), "username");

  await store.applyIncoming({
    id: newID,
    name: "bar!",
    type: MailServices.ab.CARDDAV_DIRECTORY_TYPE,
    prefs: {
      url: "https://localhost/",
      syncInterval: 30,
      username: "username@localhost",
    },
  });

  Assert.equal(MailServices.ab.directories.length, 4);
  newBook = MailServices.ab.getDirectoryFromUID(newID);
  Assert.equal(newBook.dirName, "bar!");
  Assert.equal(newBook.dirType, MailServices.ab.CARDDAV_DIRECTORY_TYPE);
  Assert.equal(
    newBook.getStringValue("carddav.url", null),
    "https://localhost/"
  );
  Assert.equal(newBook.getIntValue("carddav.syncinterval", null), 30);
  Assert.equal(
    newBook.getStringValue("carddav.username", null),
    "username@localhost"
  );

  await store.applyIncoming({
    id: newID,
    deleted: true,
  });

  Assert.equal(MailServices.ab.directories.length, 3);
  newBook = MailServices.ab.getDirectoryFromUID(newID);
  Assert.equal(newBook, null);
});
