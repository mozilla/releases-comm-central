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
let accountA, smtpServerA, smtpServerB, identityA, identityB;

add_setup(async function () {
  engine = new IdentitiesEngine(Service);
  await engine.initialize();
  store = engine._store;
  tracker = engine._tracker;

  Assert.equal(tracker._isTracking, false, "tracker is disabled");
  await assertNoChangeTracked(tracker);

  accountA = MailServices.accounts.createAccount();
  accountA.incomingServer = MailServices.accounts.createIncomingServer(
    "username",
    "hostname",
    "imap"
  );
  smtpServerA = MailServices.outgoingServer.createServer("smtp");
  smtpServerB = MailServices.outgoingServer.createServer("smtp");

  identityA = MailServices.accounts.createIdentity();
  identityA.email = "identity.a@hostname";
  identityA.fullName = "Identity A";
  identityA.smtpServerKey = smtpServerA.key;
  accountA.addIdentity(identityA);

  identityB = MailServices.accounts.createIdentity();
  identityB.email = "identity.b@hostname";
  identityB.fullName = "Identity B";
  identityB.smtpServerKey = smtpServerB.key;
  accountA.addIdentity(identityB);

  Assert.equal(MailServices.accounts.allIdentities.length, 2);
  Assert.equal(accountA.identities.length, 2);
  Assert.equal(accountA.defaultIdentity.key, identityA.key);

  tracker.start();
  Assert.equal(tracker._isTracking, true, "tracker is enabled");

  registerCleanupFunction(function () {
    tracker.stop();
  });
});

/**
 * Test creating, changing, and deleting an identity that should be synced.
 */
add_task(async function testIdentity() {
  const id = newUID();
  const identity = MailServices.accounts.createIdentity();
  // Identities aren't tracked until added to an account.
  identity.UID = id;
  identity.label = "New Identity";
  identity.fullName = "New User";
  identity.email = "username@hostname";
  identity.smtpServerKey = smtpServerA.key;
  await assertNoChangeTracked(tracker);

  accountA.addIdentity(identity);
  await assertChangeTracked(tracker, id);
  await assertNoChangeTracked(tracker);

  await checkPropertyChanges(tracker, identity, [
    ["label", "Changed label"],
    ["fullName", "Changed name"],
    ["email", "changed@hostname"],
    ["smtpServerKey", smtpServerB.key],
    ["smtpServerKey", null],
  ]);

  accountA.removeIdentity(identity);
  let record = await assertChangeTracked(tracker, id);
  record = await roundTripRecord(record, IdentityRecord);
  Assert.ok(record.deleted, "record should be a tombstone record");
  await assertNoChangeTracked(tracker);
});

/**
 * Test the store methods on identites. The tracker should ignore them.
 */
add_task(async function testIncomingChanges() {
  const id = newUID();

  tracker.ignoreAll = true;
  await store.applyIncoming(
    IdentityRecord.from({
      id,
      name: "",
      fullName: "User",
      email: "username@hostname",
      incomingServer: accountA.UID,
      outgoingServer: smtpServerA.UID,
    })
  );
  tracker.ignoreAll = false;

  await assertNoChangeTracked(tracker);

  tracker.ignoreAll = true;
  await store.applyIncoming(
    IdentityRecord.from({
      id,
      name: "",
      email: "username@hostname",
      fullName: "User (changed)",
      incomingServer: accountA.UID,
      outgoingServer: smtpServerA.UID,
    })
  );
  tracker.ignoreAll = false;

  await assertNoChangeTracked(tracker);

  tracker.ignoreAll = true;
  await store.applyIncoming(IdentityRecord.from({ id, deleted: true }));
  tracker.ignoreAll = false;

  await assertNoChangeTracked(tracker);
});
