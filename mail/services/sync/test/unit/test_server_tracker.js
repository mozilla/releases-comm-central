/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { ServersEngine, ServerRecord } = ChromeUtils.importESModule(
  "resource://services-sync/engines/servers.sys.mjs"
);
const { Service } = ChromeUtils.importESModule(
  "resource://services-sync/service.sys.mjs"
);

let engine, store, tracker;

add_setup(async function () {
  engine = new ServersEngine(Service);
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
 * Test creating, changing, and deleting an incoming server that should be synced.
 */
add_task(async function testTrackingIncomingServers() {
  const id = newUID();
  const incomingServer = MailServices.accounts.createIncomingServer(
    "username",
    "hostname",
    "imap"
  );
  // Because we want a specific UID, it must be set between the server's
  // creation and any other property changing.
  incomingServer.UID = id;
  // The tracker doesn't notice the new server until the first property is
  // changed after creation. This is somewhat intentional, because we need to
  // be able to set the UID, and in practice there's always properties to set.
  incomingServer.prettyName = "Incoming Server";
  await assertChangeTracked(tracker, id);
  await assertNoChangeTracked(tracker);

  await checkPropertyChanges(tracker, incomingServer, [
    ["prettyName", "Changed Server"],
    ["hostName", "changed.hostname"],
    ["port", 993],
    ["socketType", Ci.nsMsgSocketType.SSL],
    ["authMethod", Ci.nsMsgAuthMethod.OAuth2],
    ["username", "changed username"],
  ]);

  MailServices.accounts.removeIncomingServer(incomingServer, false);
  let record = await assertChangeTracked(tracker, id);
  record = await roundTripRecord(record, ServerRecord);
  Assert.ok(record.deleted, "record should be a tombstone record");
  await assertNoChangeTracked(tracker);
});

/**
 * Test creating, changing, and deleting an outgoing server that should be synced.
 */
add_task(async function testTrackingOutgoingServers() {
  const id = newUID();
  const outgoingServer = MailServices.outgoingServer.createServer("smtp");
  outgoingServer.QueryInterface(Ci.nsISmtpServer);
  outgoingServer.UID = id;
  outgoingServer.description = "Outgoing Server";
  await assertChangeTracked(tracker, outgoingServer.UID);
  await assertNoChangeTracked(tracker);

  await checkPropertyChanges(tracker, outgoingServer, [
    ["description", "Changed Server"],
    ["hostname", "changed.hostname"],
    ["port", 465],
    ["socketType", Ci.nsMsgSocketType.SSL],
    ["authMethod", Ci.nsMsgAuthMethod.OAuth2],
    ["username", "changed username"],
  ]);

  MailServices.outgoingServer.deleteServer(outgoingServer);
  let record = await assertChangeTracked(tracker, id);
  record = await roundTripRecord(record, ServerRecord);
  Assert.ok(record.deleted, "record should be a tombstone record");
  await assertNoChangeTracked(tracker);
});

/**
 * Test the store methods on servers. The tracker should ignore them.
 */
add_task(async function testIncomingChanges() {
  const id = newUID();

  tracker.ignoreAll = true;
  await store.applyIncoming(
    ServerRecord.from({
      id,
      name: "New IMAP Server",
      type: "imap",
      location: "new.hostname:143",
      socketType: "plain",
      authMethod: "passwordCleartext",
      username: "username",
    })
  );
  tracker.ignoreAll = false;

  await assertNoChangeTracked(tracker);

  tracker.ignoreAll = true;
  await store.applyIncoming(
    ServerRecord.from({
      id,
      prettyName: "Changed IMAP Server",
      type: "imap",
      location: "new.hostname:993",
      socketType: "tls",
      authMethod: "passwordCleartext",
      username: "username",
    })
  );
  tracker.ignoreAll = false;

  await assertNoChangeTracked(tracker);

  tracker.ignoreAll = true;
  await store.applyIncoming(ServerRecord.from({ id, deleted: true }));
  tracker.ignoreAll = false;

  await assertNoChangeTracked(tracker);
});
