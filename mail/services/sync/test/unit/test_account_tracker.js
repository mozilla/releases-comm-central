/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

do_get_profile();

const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
const { AccountsEngine } = ChromeUtils.importESModule(
  "resource://services-sync/engines/accounts.sys.mjs"
);
const { Service } = ChromeUtils.importESModule(
  "resource://services-sync/service.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

let engine, store, tracker;

add_setup(async function () {
  engine = new AccountsEngine(Service);
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

  tracker.start();
  Assert.equal(tracker._isTracking, true);
});

/**
 * Test creating, changing, and deleting an account that should be synced.
 */
add_task(async function testAccount() {
  Assert.equal(tracker.score, 0);
  Assert.deepEqual(await tracker.getChangedIDs(), {});

  const id = newUID();
  info(id);
  const newAccount = MailServices.accounts.createAccount();
  newAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "username",
    "hostname",
    "imap"
  );
  newAccount.incomingServer.UID = id;
  newAccount.incomingServer.prettyName = "First Incoming Server";

  Assert.equal(tracker.score, 301);
  Assert.deepEqual(await tracker.getChangedIDs(), { [id]: 0 });

  tracker.clearChangedIDs();
  Assert.deepEqual(await tracker.getChangedIDs(), {});
  tracker.resetScore();
  Assert.equal(tracker.score, 0);

  newAccount.incomingServer.prettyName = "Changed name";
  Assert.equal(tracker.score, 301);
  Assert.deepEqual(await tracker.getChangedIDs(), { [id]: 0 });

  tracker.clearChangedIDs();
  tracker.resetScore();

  MailServices.accounts.removeAccount(newAccount, true);
  Assert.equal(tracker.score, 301);
  Assert.deepEqual(await tracker.getChangedIDs(), { [id]: 0 });

  tracker.clearChangedIDs();
  tracker.resetScore();
});

/**
 * Test the store methods on calendars. The tracker should ignore them.
 */
add_task(async function testIncomingChanges() {
  const id = newUID();

  tracker.ignoreAll = true;
  await store.applyIncoming({
    id,
    username: "username",
    hostname: "new.hostname",
    type: "imap",
    prefs: {
      authMethod: 3,
      biffMinutes: 10,
      doBiff: true,
      downloadOnBiff: false,
      emptyTrashOnExit: false,
      incomingDuplicateAction: 0,
      limitOfflineMessageSize: false,
      loginAtStartUp: false,
      maxMessageSize: 50,
      port: 143,
      prettyName: "New IMAP Server",
      socketType: Ci.nsMsgSocketType.plain,
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
    username: "username",
    hostname: "new.hostname",
    type: "imap",
    prefs: {
      authMethod: 3,
      biffMinutes: 10,
      doBiff: true,
      downloadOnBiff: false,
      emptyTrashOnExit: false,
      incomingDuplicateAction: 0,
      limitOfflineMessageSize: false,
      loginAtStartUp: false,
      maxMessageSize: 50,
      port: 993,
      prettyName: "Changed IMAP Server",
      socketType: Ci.nsMsgSocketType.SSL,
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
