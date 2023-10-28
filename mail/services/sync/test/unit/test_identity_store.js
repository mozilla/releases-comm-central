/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

do_get_profile();

const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
const { IdentitiesEngine, IdentityRecord } = ChromeUtils.importESModule(
  "resource://services-sync/engines/identities.sys.mjs"
);
const { Service } = ChromeUtils.importESModule(
  "resource://services-sync/service.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

let engine, store, tracker;
let accountA, smtpServerA, identityA;
let accountB, identityB;

add_setup(async function () {
  engine = new IdentitiesEngine(Service);
  await engine.initialize();
  store = engine._store;

  try {
    // Ensure there is a local mail account...
    MailServices.accounts.localFoldersServer;
  } catch {
    // ... if not, make one.
    MailServices.accounts.createLocalMailAccount();
  }

  // Mail account and identity.

  accountA = MailServices.accounts.createAccount();
  accountA.incomingServer = MailServices.accounts.createIncomingServer(
    "username",
    "hostname",
    "imap"
  );
  smtpServerA = MailServices.smtp.createServer();

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
  });
});

add_task(async function testItemExists() {
  Assert.equal(await store.itemExists(identityA.UID), true);
});

add_task(async function testCreateRecord() {
  const record = await store.createRecord(identityA.UID);
  Assert.ok(record instanceof IdentityRecord);
  Assert.equal(record.id, identityA.UID);
  Assert.deepEqual(record.accounts, [
    {
      id: accountA.incomingServer.UID,
      isDefault: true,
    },
  ]);
  Assert.deepEqual(record.prefs, {
    attachSignature: false,
    attachVCard: false,
    autoQuote: true,
    catchAll: false,
    catchAllHint: null,
    composeHtml: true,
    email: "username@hostname",
    escapedVCard: null,
    fullName: "User",
    htmlSigFormat: false,
    htmlSigText: "",
    label: "",
    organization: "",
    replyOnTop: 0,
    replyTo: null,
    sigBottom: true,
    sigOnForward: false,
    sigOnReply: true,
  });
  Assert.equal(record.smtpID, smtpServerA.UID);
});

add_task(async function testCreateDeletedRecord() {
  const fakeID = "12345678-1234-1234-1234-123456789012";
  const record = await store.createRecord(fakeID);
  Assert.ok(record instanceof IdentityRecord);
  Assert.equal(record.id, fakeID);
  Assert.equal(record.deleted, true);
});

add_task(async function testSyncRecords() {
  const newIdentityID = newUID();
  await store.applyIncoming({
    id: newIdentityID,
    accounts: [
      {
        id: accountA.incomingServer.UID,
        isDefault: false,
      },
    ],
    prefs: {
      attachSignature: false,
      attachVCard: false,
      autoQuote: true,
      catchAll: false,
      catchAllHint: null,
      composeHtml: true,
      email: "username@hostname",
      escapedVCard: null,
      fullName: "User",
      htmlSigFormat: false,
      htmlSigText: "",
      label: "",
      organization: "",
      replyOnTop: 0,
      replyTo: null,
      sigBottom: true,
      sigOnForward: false,
      sigOnReply: true,
    },
    smtpID: smtpServerA.UID,
  });

  Assert.equal(MailServices.accounts.allIdentities.length, 3);
  Assert.equal(accountA.identities.length, 2);

  const newIdentity = MailServices.accounts.allIdentities.find(
    i => i.UID == newIdentityID
  );
  Assert.equal(newIdentity.email, "username@hostname");
  Assert.equal(newIdentity.fullName, "User");
  Assert.equal(newIdentity.smtpServerKey, smtpServerA.key);
  Assert.equal(accountA.defaultIdentity.key, identityA.key);

  await store.applyIncoming({
    id: newIdentityID,
    accounts: [
      {
        id: accountA.incomingServer.UID,
        isDefault: true,
      },
    ],
    prefs: {
      attachSignature: false,
      attachVCard: false,
      autoQuote: true,
      catchAll: false,
      catchAllHint: null,
      composeHtml: true,
      email: "username@hostname",
      escapedVCard: null,
      fullName: "User (changed)",
      htmlSigFormat: false,
      htmlSigText: "",
      label: "",
      organization: "",
      replyOnTop: 0,
      replyTo: null,
      sigBottom: true,
      sigOnForward: false,
      sigOnReply: true,
    },
    smtpID: smtpServerA.UID,
  });

  Assert.equal(newIdentity.fullName, "User (changed)");
  Assert.equal(accountA.defaultIdentity.key, newIdentity.key);

  await store.applyIncoming({
    id: newIdentityID,
    deleted: true,
  });

  Assert.equal(MailServices.accounts.allIdentities.length, 2);
  Assert.equal(accountA.identities.length, 1);
  Assert.equal(accountA.defaultIdentity.key, identityA.key);
  Assert.equal(accountB.identities.length, 1);
  Assert.equal(accountB.defaultIdentity.key, identityB.key);
});
