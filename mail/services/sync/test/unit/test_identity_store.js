/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { IdentitiesEngine, IdentityRecord } = ChromeUtils.importESModule(
  "resource://services-sync/engines/identities.sys.mjs"
);
const { Service } = ChromeUtils.importESModule(
  "resource://services-sync/service.sys.mjs"
);

let engine, store, tracker;
let accountA, smtpServerA, identityA;
let accountB, identityB;
let smtpServerB;

add_setup(async function () {
  await populateCacheFile();

  engine = new IdentitiesEngine(Service);
  await engine.initialize();
  store = engine._store;

  // Mail account and identity.

  accountA = MailServices.accounts.createAccount();
  accountA.incomingServer = MailServices.accounts.createIncomingServer(
    "username",
    "hostname",
    "imap"
  );
  smtpServerA = MailServices.outgoingServer.createServer("smtp");

  identityA = MailServices.accounts.createIdentity();
  identityA.email = "username@hostname";
  identityA.fullName = "User";
  identityA.smtpServerKey = smtpServerA.key;
  accountA.addIdentity(identityA);

  Assert.ok(identityA.UID);
  Assert.equal(
    Services.prefs.getStringPref(`mail.identity.${identityA.key}.uid`),
    identityA.UID
  );

  // NNTP account and identity. NNTP isn't currently supported, so this test
  // will prove the identity isn't synced.

  accountB = MailServices.accounts.createAccount();
  accountB.incomingServer = MailServices.accounts.createIncomingServer(
    "username",
    "hostname",
    "nntp"
  );

  identityB = MailServices.accounts.createIdentity();
  identityB.email = "username@hostname";
  identityB.fullName = "user";
  accountB.addIdentity(identityB);

  // A second SMTP server.

  smtpServerB = MailServices.outgoingServer.createServer("smtp");

  // Sanity check.

  Assert.equal(MailServices.accounts.allIdentities.length, 2);
  Assert.equal(accountA.identities.length, 1);
  Assert.equal(accountA.defaultIdentity.key, identityA.key);
  Assert.equal(accountB.identities.length, 1);
  Assert.equal(accountB.defaultIdentity.key, identityB.key);
});

add_task(async function testGetAllIDs() {
  Assert.deepEqual(await store.getAllIDs(), {
    [identityA.UID]: true,
    "35ab495d-24f2-485b-96a4-f327313c9f2c": true,
  });
});

add_task(async function testItemExists() {
  Assert.ok(await store.itemExists(identityA.UID));
  Assert.ok(await store.itemExists("35ab495d-24f2-485b-96a4-f327313c9f2c"));
  Assert.ok(!(await store.itemExists("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")));
});

// Test that we create records with all of the expected properties. After
// creating each record, encrypt it and decrypt the encrypted text, so that
// we're testing what gets sent to the server, not just the object created.

add_task(async function testCreateRecord() {
  let record = await store.createRecord(identityA.UID);
  record = await roundTripRecord(record, IdentityRecord);
  Assert.equal(record.id, identityA.UID);
  Assert.equal(record.name, "");
  Assert.equal(record.fullName, "User");
  Assert.equal(record.email, "username@hostname");
  Assert.equal(record.incomingServer, accountA.incomingServer.UID);
  Assert.equal(record.outgoingServer, smtpServerA.UID);
});

add_task(async function testCreateCachedUnknownRecord() {
  let record = await store.createRecord("35ab495d-24f2-485b-96a4-f327313c9f2c");
  record = await roundTripRecord(record, IdentityRecord);
  Assert.equal(record.id, "35ab495d-24f2-485b-96a4-f327313c9f2c");
  Assert.equal(record.name, "Unknown Identity");
  Assert.equal(record.fullName, "Unknown User");
  Assert.equal(record.email, "username@unknown.hostname");
  Assert.equal(record.incomingServer, "13dc5590-8b9e-46c8-b9c6-4c24580823e9");
  Assert.strictEqual(record.outgoingServer, undefined);
});

add_task(async function testCreateDeletedRecord() {
  const fakeID = "12345678-1234-1234-1234-123456789012";
  let record = await store.createRecord(fakeID);
  record = await roundTripRecord(record, IdentityRecord);
  Assert.equal(record.id, fakeID);
  Assert.equal(record.deleted, true);
});

// Test creating, updating, and deleting identities from incoming records.

add_task(async function testSyncRecords() {
  const id = newUID();
  const data = {
    id,
    name: "New Identity",
    fullName: "New User",
    email: "username@new.hostname",
    incomingServer: accountA.incomingServer.UID,
    outgoingServer: smtpServerA.UID,
  };
  await store.applyIncoming(IdentityRecord.from(data));

  Assert.equal(MailServices.accounts.allIdentities.length, 3);
  Assert.equal(accountA.identities.length, 2);

  const identity = MailServices.accounts.allIdentities.find(i => i.UID == id);
  Assert.equal(identity.label, "New Identity");
  Assert.equal(identity.email, "username@new.hostname");
  Assert.equal(identity.fullName, "New User");
  Assert.equal(identity.smtpServerKey, smtpServerA.key);
  Assert.ok(accountA.identities.includes(identityA));

  // Change some properties.

  data.name = "Changed Identity";
  data.fullName = "Changed User";
  data.email = "username@changed.hostname";
  data.outgoingServer = smtpServerB.UID;
  await store.applyIncoming(IdentityRecord.from(data));

  Assert.equal(identity.label, "Changed Identity");
  Assert.equal(identity.email, "username@changed.hostname");
  Assert.equal(identity.fullName, "Changed User");
  Assert.equal(identity.smtpServerKey, smtpServerB.key);
  Assert.ok(accountA.identities.includes(identityA));

  // Change the incoming server. This should fail.

  await Assert.rejects(
    store.applyIncoming(
      IdentityRecord.from({
        ...data,
        incomingServer: accountB.incomingServer.UID,
      })
    ),
    /Refusing to change incoming server/,
    "changing the incoming server should fail"
  );

  // Delete the identity.

  await store.applyIncoming(IdentityRecord.from({ id, deleted: true }));

  Assert.equal(MailServices.accounts.allIdentities.length, 2);
  Assert.equal(accountA.identities.length, 1);
  Assert.equal(accountA.defaultIdentity.key, identityA.key);
});

// Test things we don't understand.

/**
 * Tests a server type we know about, but properties we don't know about.
 */
add_task(async function testSyncUnknownProperties() {
  const id = newUID();
  await store.applyIncoming(
    IdentityRecord.from({
      id,
      name: "Future Identity",
      fullName: "Future User",
      email: "username@new.hostname",
      incomingServer: accountA.incomingServer.UID,
      outgoingServer: smtpServerA.UID,
      extra: {},
      additional: "much data",
      more: "wow!",
    })
  );

  Assert.equal(MailServices.accounts.allIdentities.length, 3);
  Assert.equal(accountA.identities.length, 2);

  const identity = MailServices.accounts.allIdentities.find(i => i.UID == id);
  Assert.equal(identity.label, "Future Identity");
  Assert.equal(identity.email, "username@new.hostname");
  Assert.equal(identity.fullName, "Future User");
  Assert.equal(identity.smtpServerKey, smtpServerA.key);
  Assert.ok(accountA.identities.includes(identityA));

  let record = await store.createRecord(id);
  record = await roundTripRecord(record, IdentityRecord);

  Assert.equal(record.id, id);
  Assert.equal(record.name, "Future Identity");
  Assert.equal(record.fullName, "Future User");
  Assert.equal(record.email, "username@new.hostname");
  Assert.equal(record.incomingServer, accountA.incomingServer.UID);
  Assert.equal(record.outgoingServer, smtpServerA.UID);
  Assert.deepEqual(record.cleartext.extra, {});
  Assert.equal(record.cleartext.additional, "much data");
  Assert.equal(record.cleartext.more, "wow!");

  await store.applyIncoming(IdentityRecord.from({ id, deleted: true }));

  Assert.equal(MailServices.accounts.allIdentities.length, 2);
});
