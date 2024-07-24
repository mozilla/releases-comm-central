/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

do_get_profile();

const { BulkKeyBundle } = ChromeUtils.importESModule(
  "resource://services-sync/keys.sys.mjs"
);
const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
const { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

add_setup(async function () {
  try {
    // Ensure there is a local mail account...
    MailServices.accounts.localFoldersServer;
  } catch {
    // ... if not, make one.
    MailServices.accounts.createLocalMailAccount();
  }
});

registerCleanupFunction(async function () {
  await IOUtils.remove(
    PathUtils.join(PathUtils.profileDir, "syncDataCache.lz4")
  );
});

async function populateCacheFile() {
  // Pre-populate the cache file. We'll use this data to check that the store
  // functions `getAllIDs` and `itemExists` don't forget about records that
  // exist but can't be handled by this client, e.g. a server for a mail
  // protocol that gets implemented in a future version.
  await IOUtils.writeJSON(
    PathUtils.join(PathUtils.profileDir, "syncDataCache.lz4"),
    {
      servers: {
        "13dc5590-8b9e-46c8-b9c6-4c24580823e9": {
          id: "13dc5590-8b9e-46c8-b9c6-4c24580823e9",
          name: "Unknown Server",
          type: "unknown",
          location: "unknown.hostname:143",
          socketType: "plain",
          authMethod: "passwordCleartext",
          username: "username",
        },
      },
      identities: {
        "35ab495d-24f2-485b-96a4-f327313c9f2c": {
          id: "35ab495d-24f2-485b-96a4-f327313c9f2c",
          name: "Unknown Identity",
          fullName: "Unknown User",
          email: "username@unknown.hostname",
          incomingServer: "13dc5590-8b9e-46c8-b9c6-4c24580823e9",
        },
      },
      addressbooks: {
        "b5b417f5-11cd-4cfd-a578-d3ef6402ba7b": {
          id: "b5b417f5-11cd-4cfd-a578-d3ef6402ba7b",
          name: "Unknown Address Book",
          type: "unknown",
          url: "https://unknown.hostname/addressBook",
        },
      },
      calendars: {
        "f8830f91-5181-41c4-8123-54302ba44e2b": {
          id: "f8830f91-5181-41c4-8123-54302ba44e2b",
          name: "Unknown Calendar",
          type: "unknown",
          url: "https://unknown.hostname/calendar",
        },
      },
    },
    { compress: true }
  );
}

/**
 * Create a new UUID.
 *
 * @returns {string}
 */
function newUID() {
  return Services.uuid.generateUUID().toString().substring(1, 37);
}

/**
 * Take a record, encrypt it, then decrypt the ciphertext. Use this to check
 * that changes to the record would actually be sent to the server.
 *
 * @param {CryptoWrapper} record
 * @param {object} constructor - The constructor of `record`. This will be
 *   used to create the new record, and we can't just use `record.constructor`
 *   because javascript sucks sometimes.
 * @returns {CryptoWrapper}
 */
async function roundTripRecord(record, constructor) {
  Assert.ok(
    record instanceof constructor,
    `record has the expected type: ${constructor.name}`
  );
  const keyBundle = new BulkKeyBundle();
  await keyBundle.generateRandom();
  await record.encrypt(keyBundle);

  const newRecord = new constructor(undefined, record.id);
  newRecord.ciphertext = record.ciphertext;
  newRecord.IV = record.IV;
  newRecord.hmac = record.hmac;
  await newRecord.decrypt(keyBundle);
  return newRecord;
}

/**
 * Checks that a tracker has a score indicating it would be synced, if it was
 * actually hooked up to the rest of the sync code. Then clears the tracker.
 *
 * @param {Tracker} tracker
 * @param {string} expectedUID - The UID of an object that has changed.
 * @param {CryptoWrapper} record - The result of `createRecord` called before
 *   clearing the tracker.
 */
async function assertChangeTracked(tracker, expectedUID) {
  await TestUtils.waitForCondition(
    () => tracker.engine.score > 0,
    "waiting for tracker score to change"
  );
  Assert.equal(
    tracker.engine.score,
    301,
    "score is above threshold for immediate sync"
  );
  Assert.deepEqual(
    await tracker.engine.getChangedIDs(),
    { [expectedUID]: 0 },
    `${expectedUID} is marked as changed`
  );

  const record = await tracker.engine._store.createRecord(expectedUID);

  tracker.clearChangedIDs();
  tracker.resetScore();

  return record;
}

/**
 * Checks that a tracker does not have a score indicating it would be synced.
 *
 * @param {Tracker} tracker
 */
async function assertNoChangeTracked(tracker) {
  // Wait a bit, to prove nothing happened.
  await new Promise(resolve => setTimeout(resolve, 250));
  Assert.equal(
    tracker.engine.score,
    0,
    "score is not above threshold for sync"
  );
  Assert.deepEqual(await tracker.engine.getChangedIDs(), {}, "no changed ids");
}

/**
 * Checks that changes to an object cause the trackers score to rise.
 *
 * @param {Tracker} tracker
 * @param {object} object - The object (server, calendar, etc.) to change.
 * @param {string[][]} changes - Array of [property name, new value] pairs to
 *   apply to `object`.
 */
async function checkPropertyChanges(tracker, object, changes) {
  const uid = object.UID ?? object.id;

  for (const [propertyName, propertyValue] of changes) {
    // Check that a change in the property is noticed by the tracker.
    info(`${propertyName}: ${object[propertyName]} -> ${propertyValue}`);
    object[propertyName] = propertyValue;
    await assertChangeTracked(tracker, uid);

    // Check that setting the property to the current value is ignored.
    info(`${propertyName}: ${propertyValue} -> ${propertyValue}`);
    object[propertyName] = propertyValue;
    await assertNoChangeTracked(tracker);
  }
}
