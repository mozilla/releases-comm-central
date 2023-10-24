/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

do_get_profile();

const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
const { AddressBooksEngine } = ChromeUtils.importESModule(
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

add_setup(async function () {
  engine = new AddressBooksEngine(Service);
  await engine.initialize();
  store = engine._store;
  tracker = engine._tracker;

  Assert.equal(tracker.score, 0);
  Assert.equal(tracker._isTracking, false);
  Assert.deepEqual(await tracker.getChangedIDs(), {});

  tracker.start();
  Assert.equal(tracker._isTracking, true);
});

/**
 * Test creating, changing, and deleting an address book that should be synced.
 */
add_task(async function testNetworkAddressBook() {
  Assert.equal(tracker.score, 0);
  Assert.deepEqual(await tracker.getChangedIDs(), {});

  let id = newUID();
  let dirPrefId = MailServices.ab.newAddressBook(
    "Sync Address Book",
    null,
    MailServices.ab.CARDDAV_DIRECTORY_TYPE,
    id
  );
  Assert.equal(tracker.score, 301);
  Assert.deepEqual(await tracker.getChangedIDs(), { [id]: 0 });

  tracker.clearChangedIDs();
  Assert.deepEqual(await tracker.getChangedIDs(), {});
  tracker.resetScore();
  Assert.equal(tracker.score, 0);

  let book = MailServices.ab.getDirectoryFromId(dirPrefId);
  book.dirName = "changed name";
  Assert.equal(tracker.score, 301);
  Assert.deepEqual(await tracker.getChangedIDs(), { [id]: 0 });

  tracker.clearChangedIDs();
  tracker.resetScore();

  book.setIntValue("carddav.syncinterval", 0);
  Assert.equal(tracker.score, 301);
  Assert.deepEqual(await tracker.getChangedIDs(), { [id]: 0 });

  book.setStringValue("carddav.url", "https://localhost/");
  Assert.equal(tracker.score, 301);
  Assert.deepEqual(await tracker.getChangedIDs(), { [id]: 0 });

  tracker.clearChangedIDs();
  tracker.resetScore();

  let deletedPromise = TestUtils.topicObserved("addrbook-directory-deleted");
  MailServices.ab.deleteAddressBook(book.URI);
  await deletedPromise;
  Assert.equal(tracker.score, 301);
  Assert.deepEqual(await tracker.getChangedIDs(), { [id]: 0 });

  tracker.clearChangedIDs();
  tracker.resetScore();
});

/**
 * Test a local address book. This shouldn't affect the tracker at all.
 */
add_task(async function testStorageAddressBook() {
  let dirPrefId = MailServices.ab.newAddressBook(
    "Sync Address Book",
    null,
    MailServices.ab.JS_DIRECTORY_TYPE
  );
  Assert.deepEqual(await tracker.getChangedIDs(), {});
  Assert.equal(tracker.score, 0);

  let book = MailServices.ab.getDirectoryFromId(dirPrefId);
  book.dirName = "changed name";
  book.setBoolValue("readOnly", true);
  Assert.deepEqual(await tracker.getChangedIDs(), {});
  Assert.equal(tracker.score, 0);

  let deletedPromise = TestUtils.topicObserved("addrbook-directory-deleted");
  MailServices.ab.deleteAddressBook(book.URI);
  await deletedPromise;
  Assert.deepEqual(await tracker.getChangedIDs(), {});
  Assert.equal(tracker.score, 0);
});

/**
 * Test the store methods on address books. The tracker should ignore them.
 */
add_task(async function testIncomingChanges() {
  PromiseTestUtils.expectUncaughtRejection(/Connection failure/);

  let id = newUID();

  tracker.ignoreAll = true;
  await store.applyIncoming({
    id,
    name: "New Book",
    type: MailServices.ab.CARDDAV_DIRECTORY_TYPE,
    prefs: {
      url: "https://localhost/",
      syncInterval: 0,
      username: "username",
    },
  });
  tracker.ignoreAll = false;

  Assert.deepEqual(await tracker.getChangedIDs(), {});
  Assert.equal(tracker.score, 0);

  tracker.clearChangedIDs();
  tracker.resetScore();

  tracker.ignoreAll = true;
  await store.applyIncoming({
    id,
    name: "New Book (changed)!",
    type: MailServices.ab.CARDDAV_DIRECTORY_TYPE,
    prefs: {
      url: "https://localhost/",
      syncInterval: 30,
      username: "username@localhost",
    },
  });
  tracker.ignoreAll = false;

  Assert.deepEqual(await tracker.getChangedIDs(), {});
  Assert.equal(tracker.score, 0);

  tracker.ignoreAll = true;
  await store.applyIncoming({
    id,
    deleted: true,
  });
  tracker.ignoreAll = false;

  Assert.deepEqual(await tracker.getChangedIDs(), {});
  Assert.equal(tracker.score, 0);
});
