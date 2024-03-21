/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

do_get_profile();

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
const { IdentitiesEngine } = ChromeUtils.importESModule(
  "resource://services-sync/engines/identities.sys.mjs"
);
const { Service } = ChromeUtils.importESModule(
  "resource://services-sync/service.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

let engine, store, tracker;
let accountA, smtpServerA, smtpServerB, identityA, identityB;

add_setup(async function () {
  engine = new IdentitiesEngine(Service);
  await engine.initialize();
  store = engine._store;
  tracker = engine._tracker;

  Assert.equal(tracker.score, 0);
  Assert.equal(tracker._isTracking, false);
  Assert.deepEqual(await tracker.getChangedIDs(), {});

  try {
    // Ensure there is a local mail account...
    MailServices.accounts.localFoldersServer;
  } catch {
    // ... if not, make one.
    MailServices.accounts.createLocalMailAccount();
  }

  accountA = MailServices.accounts.createAccount();
  accountA.incomingServer = MailServices.accounts.createIncomingServer(
    "username",
    "hostname",
    "imap"
  );
  smtpServerA = MailServices.smtp.createServer();
  smtpServerB = MailServices.smtp.createServer();

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
  Assert.equal(tracker._isTracking, true);
});

/**
 * Test creating, changing, and deleting an identity that should be synced.
 */
add_task(async function testIdentity() {
  Assert.equal(tracker.score, 0);
  Assert.deepEqual(await tracker.getChangedIDs(), {});

  const id = newUID();
  const newIdentity = MailServices.accounts.createIdentity();
  newIdentity.UID = id;
  newIdentity.email = "username@hostname";
  newIdentity.fullName = "User";
  newIdentity.smtpServerKey = smtpServerA.key;
  accountA.addIdentity(newIdentity);

  Assert.equal(tracker.score, 301);
  Assert.deepEqual(await tracker.getChangedIDs(), { [id]: 0 });

  tracker.clearChangedIDs();
  Assert.deepEqual(await tracker.getChangedIDs(), {});
  tracker.resetScore();
  Assert.equal(tracker.score, 0);

  newIdentity.fullName = "Changed name";
  Assert.equal(tracker.score, 301);
  Assert.deepEqual(await tracker.getChangedIDs(), { [id]: 0 });

  tracker.clearChangedIDs();
  tracker.resetScore();

  newIdentity.label = "Changed label";
  Assert.equal(tracker.score, 301);
  Assert.deepEqual(await tracker.getChangedIDs(), { [id]: 0 });

  tracker.clearChangedIDs();
  tracker.resetScore();

  newIdentity.smtpServerKey = smtpServerB.key;
  Assert.equal(tracker.score, 301);
  Assert.deepEqual(await tracker.getChangedIDs(), { [id]: 0 });

  tracker.clearChangedIDs();
  tracker.resetScore();

  newIdentity.smtpServerKey = null;
  Assert.equal(tracker.score, 301);
  Assert.deepEqual(await tracker.getChangedIDs(), { [id]: 0 });

  tracker.clearChangedIDs();
  tracker.resetScore();

  accountA.removeIdentity(newIdentity);
  Assert.equal(tracker.score, 301);
  Assert.deepEqual(await tracker.getChangedIDs(), { [id]: 0 });

  tracker.clearChangedIDs();
  tracker.resetScore();
});

/**
 * Test swapping the default identity of an account.
 */
add_task(async function testDefaultIdentityChange() {
  Assert.equal(tracker.score, 0);
  Assert.deepEqual(await tracker.getChangedIDs(), {});

  accountA.defaultIdentity = identityB;

  Assert.equal(tracker.score, 301);
  Assert.deepEqual(await tracker.getChangedIDs(), {
    [identityA.UID]: 0,
    [identityB.UID]: 0,
  });

  tracker.clearChangedIDs();
  tracker.resetScore();
});

/**
 * Test the store methods on identites. The tracker should ignore them.
 */
add_task(async function testIncomingChanges() {
  const id = newUID();

  tracker.ignoreAll = true;
  await store.applyIncoming({
    id,
    accounts: [
      {
        id: accountA.UID,
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
  tracker.ignoreAll = false;

  Assert.deepEqual(await tracker.getChangedIDs(), {});
  Assert.equal(tracker.score, 0);

  tracker.clearChangedIDs();
  tracker.resetScore();

  tracker.ignoreAll = true;
  await store.applyIncoming({
    id,
    accounts: [
      {
        id: accountA.UID,
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
