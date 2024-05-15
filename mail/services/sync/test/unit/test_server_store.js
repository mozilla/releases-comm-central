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
let imapAccount, imapServer, pop3Account, pop3Server, smtpServer;

add_setup(async function () {
  await populateCacheFile();

  engine = new ServersEngine(Service);
  await engine.initialize();
  store = engine._store;

  imapAccount = MailServices.accounts.createAccount();
  imapServer = imapAccount.incomingServer =
    MailServices.accounts.createIncomingServer("username", "hostname", "imap");
  imapAccount.incomingServer.prettyName = "IMAP Server";

  Assert.ok(imapServer.UID);
  Assert.equal(
    Services.prefs.getStringPref(`mail.server.${imapServer.key}.uid`),
    imapServer.UID
  );

  pop3Account = MailServices.accounts.createAccount();
  pop3Server = pop3Account.incomingServer =
    MailServices.accounts.createIncomingServer("username", "hostname", "pop3");
  pop3Account.incomingServer.prettyName = "POP3 Server";

  Assert.ok(pop3Server.UID);
  Assert.equal(
    Services.prefs.getStringPref(`mail.server.${pop3Server.key}.uid`),
    pop3Server.UID
  );

  smtpServer = MailServices.outgoingServer.createServer("smtp");
  smtpServer.QueryInterface(Ci.nsISmtpServer);
  smtpServer.username = "username";
  smtpServer.hostname = "hostname";
  smtpServer.port = 587;
  smtpServer.description = "SMTP Server";

  Assert.ok(smtpServer.UID);
  Assert.equal(
    Services.prefs.getStringPref(`mail.smtpserver.${smtpServer.key}.uid`, ""),
    smtpServer.UID
  );

  // Sanity check.
  Assert.equal(MailServices.accounts.accounts.length, 3);
  Assert.equal(MailServices.outgoingServer.servers.length, 1);
});

add_task(async function testGetAllIDs() {
  Assert.deepEqual(await store.getAllIDs(), {
    [imapServer.UID]: true,
    [pop3Server.UID]: true,
    [smtpServer.UID]: true,
    "13dc5590-8b9e-46c8-b9c6-4c24580823e9": true,
  });
});

add_task(async function testItemExists() {
  Assert.ok(await store.itemExists(imapServer.UID));
  Assert.ok(await store.itemExists(pop3Server.UID));
  Assert.ok(await store.itemExists(smtpServer.UID));
  Assert.ok(await store.itemExists("13dc5590-8b9e-46c8-b9c6-4c24580823e9"));
  Assert.ok(!(await store.itemExists("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")));
});

// Test that we create records with all of the expected properties. After
// creating each record, encrypt it and decrypt the encrypted text, so that
// we're testing what gets sent to the server, not just the object created.

add_task(async function testCreateIMAPRecord() {
  let record = await store.createRecord(imapServer.UID);
  record = await roundTripRecord(record, ServerRecord);
  Assert.equal(record.id, imapServer.UID);
  Assert.equal(record.name, "IMAP Server");
  Assert.equal(record.type, "imap");
  Assert.equal(record.location, "hostname:143");
  Assert.equal(record.socketType, "plain");
  Assert.equal(record.authMethod, "passwordCleartext");
  Assert.equal(record.username, "username");
});

add_task(async function testCreatePOP3Record() {
  let record = await store.createRecord(pop3Server.UID);
  record = await roundTripRecord(record, ServerRecord);
  Assert.equal(record.id, pop3Server.UID);
  Assert.equal(record.name, "POP3 Server");
  Assert.equal(record.type, "pop3");
  Assert.equal(record.location, "hostname:110");
  Assert.equal(record.socketType, "plain");
  Assert.equal(record.authMethod, "passwordCleartext");
  Assert.equal(record.username, "username");
});

add_task(async function testCreateSMTPRecord() {
  let record = await store.createRecord(smtpServer.UID);
  record = await roundTripRecord(record, ServerRecord);
  Assert.equal(record.id, smtpServer.UID);
  Assert.equal(record.name, "SMTP Server");
  Assert.equal(record.type, "smtp");
  Assert.equal(record.location, "hostname:587");
  Assert.equal(record.socketType, "plain");
  Assert.equal(record.authMethod, "passwordCleartext");
  Assert.equal(record.username, "username");
});

add_task(async function testCreateCachedUnknownRecord() {
  let record = await store.createRecord("13dc5590-8b9e-46c8-b9c6-4c24580823e9");
  record = await roundTripRecord(record, ServerRecord);
  Assert.equal(record.id, "13dc5590-8b9e-46c8-b9c6-4c24580823e9");
  Assert.equal(record.name, "Unknown Server");
  Assert.equal(record.type, "unknown");
  Assert.equal(record.location, "unknown.hostname:143");
  Assert.equal(record.socketType, "plain");
  Assert.equal(record.authMethod, "passwordCleartext");
  Assert.equal(record.username, "username");
});

add_task(async function testCreateDeletedRecord() {
  const fakeID = "12345678-1234-1234-1234-123456789012";
  let record = await store.createRecord(fakeID);
  record = await roundTripRecord(record, ServerRecord);
  Assert.equal(record.id, fakeID);
  Assert.equal(record.deleted, true);
});

// Test creating, updating, and deleting servers from incoming records.

add_task(async function testSyncIMAPRecords() {
  const id = newUID();
  const data = {
    id,
    name: "New IMAP Server",
    type: "imap",
    location: "new.hostname:143",
    socketType: "plain",
    authMethod: "passwordCleartext",
    username: "username@new.hostname",
  };
  await store.applyIncoming(ServerRecord.from(data));

  Assert.equal(MailServices.accounts.accounts.length, 4);
  const server = MailServices.accounts.allServers.find(s => s.UID == id);
  Assert.equal(server.prettyName, "New IMAP Server");
  Assert.equal(server.type, "imap");
  Assert.equal(server.hostName, "new.hostname");
  Assert.equal(server.port, 143);
  Assert.equal(server.socketType, Ci.nsMsgSocketType.plain);
  Assert.equal(server.authMethod, Ci.nsMsgAuthMethod.passwordCleartext);
  Assert.equal(server.username, "username@new.hostname");

  // Change some properties.

  data.name = "Changed IMAP Server";
  data.location = "changed.hostname:993";
  data.socketType = "tls";
  data.authMethod = "oAuth2";
  data.username = "username@changed.hostname";
  await store.applyIncoming(ServerRecord.from(data));

  Assert.equal(server.prettyName, "Changed IMAP Server");
  Assert.equal(server.type, "imap"); // Unchanged.
  Assert.equal(server.hostName, "changed.hostname");
  Assert.equal(server.port, 993);
  Assert.equal(server.socketType, Ci.nsMsgSocketType.SSL);
  Assert.equal(server.authMethod, Ci.nsMsgAuthMethod.OAuth2);
  Assert.equal(server.username, "username@changed.hostname");

  // Change the server type. This should fail.

  await Assert.rejects(
    store.applyIncoming(ServerRecord.from({ ...data, type: "pop3" })),
    /Refusing to change server type/,
    "changing the server type should fail"
  );
  await Assert.rejects(
    store.applyIncoming(ServerRecord.from({ ...data, type: "smtp" })),
    /Refusing to change server type/,
    "changing the server type should fail"
  );
  await Assert.rejects(
    store.applyIncoming(ServerRecord.from({ ...data, type: "xyz" })),
    /Refusing to change server type/,
    "changing the server type should fail"
  );

  await store.applyIncoming(ServerRecord.from({ id, deleted: true }));

  Assert.equal(MailServices.accounts.accounts.length, 3);
  Assert.ok(!MailServices.accounts.allServers.find(s => s.UID == id));
});

add_task(async function testSyncPOP3Records() {
  const id = newUID();
  const data = {
    id,
    name: "New POP3 Server",
    type: "pop3",
    location: "new.hostname:110",
    socketType: "plain",
    authMethod: "passwordCleartext",
    username: "username@new.hostname",
  };
  await store.applyIncoming(ServerRecord.from(data));

  Assert.equal(MailServices.accounts.accounts.length, 4);
  const server = MailServices.accounts.allServers.find(s => s.UID == id);
  Assert.equal(server.prettyName, "New POP3 Server");
  Assert.equal(server.type, "pop3");
  Assert.equal(server.hostName, "new.hostname");
  Assert.equal(server.port, 110);
  Assert.equal(server.socketType, Ci.nsMsgSocketType.plain);
  Assert.equal(server.authMethod, Ci.nsMsgAuthMethod.passwordCleartext);
  Assert.equal(server.username, "username@new.hostname");

  // Change some properties.

  data.name = "Changed POP3 Server";
  data.location = "changed.hostname:995";
  data.socketType = "tls";
  data.authMethod = "oAuth2";
  data.username = "username@changed.hostname";
  await store.applyIncoming(ServerRecord.from(data));

  Assert.equal(server.prettyName, "Changed POP3 Server");
  Assert.equal(server.type, "pop3"); // Unchanged.
  Assert.equal(server.hostName, "changed.hostname");
  Assert.equal(server.port, 995);
  Assert.equal(server.socketType, Ci.nsMsgSocketType.SSL);
  Assert.equal(server.authMethod, Ci.nsMsgAuthMethod.OAuth2);
  Assert.equal(server.username, "username@changed.hostname");

  // Change the server type. This should fail.

  await Assert.rejects(
    store.applyIncoming(ServerRecord.from({ ...data, type: "imap" })),
    /Refusing to change server type/,
    "changing the server type should fail"
  );
  await Assert.rejects(
    store.applyIncoming(ServerRecord.from({ ...data, type: "smtp" })),
    /Refusing to change server type/,
    "changing the server type should fail"
  );
  await Assert.rejects(
    store.applyIncoming(ServerRecord.from({ ...data, type: "xyz" })),
    /Refusing to change server type/,
    "changing the server type should fail"
  );

  await store.applyIncoming(ServerRecord.from({ id, deleted: true }));

  Assert.equal(MailServices.accounts.accounts.length, 3);
  Assert.ok(!MailServices.accounts.allServers.find(s => s.UID == id));
});

add_task(async function testSyncSMTPRecords() {
  const id = newUID();
  const data = {
    id,
    name: "New SMTP Server",
    type: "smtp",
    location: "new.hostname:587",
    socketType: "plain",
    authMethod: "passwordCleartext",
    username: "username@new.hostname",
  };
  await store.applyIncoming(ServerRecord.from(data));

  Assert.equal(MailServices.outgoingServer.servers.length, 2);
  const server = MailServices.outgoingServer.servers.find(s => s.UID == id);
  server.QueryInterface(Ci.nsISmtpServer);
  Assert.equal(server.description, "New SMTP Server");
  Assert.equal(server.hostname, "new.hostname");
  Assert.equal(server.port, 587);
  Assert.equal(server.socketType, Ci.nsMsgSocketType.plain);
  Assert.equal(server.authMethod, Ci.nsMsgAuthMethod.passwordCleartext);
  Assert.equal(server.username, "username@new.hostname");

  // Change some properties.

  data.name = "Changed SMTP Server";
  data.location = "changed.hostname:465";
  data.socketType = "tls";
  data.authMethod = "oAuth2";
  data.username = "username@changed.hostname";
  await store.applyIncoming(ServerRecord.from(data));

  Assert.equal(server.description, "Changed SMTP Server");
  Assert.equal(server.hostname, "changed.hostname");
  Assert.equal(server.port, 465);
  Assert.equal(server.socketType, Ci.nsMsgSocketType.SSL);
  Assert.equal(server.authMethod, Ci.nsMsgAuthMethod.OAuth2);
  Assert.equal(server.username, "username@changed.hostname");

  // Change the server type. This should fail.

  await Assert.rejects(
    store.applyIncoming(ServerRecord.from({ ...data, type: "imap" })),
    /Refusing to change server type/,
    "changing the server type should fail"
  );
  await Assert.rejects(
    store.applyIncoming(ServerRecord.from({ ...data, type: "pop3" })),
    /Refusing to change server type/,
    "changing the server type should fail"
  );
  await Assert.rejects(
    store.applyIncoming(ServerRecord.from({ ...data, type: "xyz" })),
    /Refusing to change server type/,
    "changing the server type should fail"
  );

  await store.applyIncoming(ServerRecord.from({ id, deleted: true }));

  Assert.equal(MailServices.outgoingServer.servers.length, 1);
  Assert.ok(!MailServices.outgoingServer.servers.find(s => s.UID == id));
});

// Test things we don't understand.

/**
 * Tests a server type we don't know about.
 */
add_task(async function testSyncUnknownType() {
  const id = newUID();
  const data = {
    id,
    name: "New XYZ Server",
    type: "xyz",
    location: "https://new.hostname",
  };
  await store.applyIncoming(ServerRecord.from(data));

  Assert.equal(MailServices.accounts.accounts.length, 3);
  Assert.ok(!MailServices.accounts.allServers.find(s => s.UID == id));

  data.name = "Changed XYZ Server";
  data.location = "https://changed.hostname";
  await store.applyIncoming(ServerRecord.from(data));

  Assert.equal(MailServices.accounts.accounts.length, 3);
  Assert.ok(!MailServices.accounts.allServers.find(s => s.UID == id));

  let record = await store.createRecord(id);
  record = await roundTripRecord(record, ServerRecord);

  Assert.equal(record.id, id);
  Assert.equal(record.name, "Changed XYZ Server");
  Assert.equal(record.type, "xyz");
  Assert.equal(record.location, "https://changed.hostname");

  await store.applyIncoming(ServerRecord.from({ id, deleted: true }));
  Assert.equal(MailServices.accounts.accounts.length, 3);
});

/**
 * Tests a server type we know about, but properties we don't know about.
 */
add_task(async function testSyncUnknownProperties() {
  const id = newUID();
  await store.applyIncoming(
    ServerRecord.from({
      id,
      name: "Future IMAP Server",
      type: "imap",
      location: "v999.hostname:143",
      socketType: "plain",
      authMethod: "passwordCleartext",
      username: "username",
      extra: {},
      additional: "much data",
      more: "wow!",
    })
  );

  Assert.equal(MailServices.accounts.accounts.length, 4);
  const newServer = MailServices.accounts.allServers.find(s => s.UID == id);
  Assert.equal(newServer.username, "username");
  Assert.equal(newServer.hostName, "v999.hostname");
  Assert.equal(newServer.prettyName, "Future IMAP Server");
  Assert.equal(newServer.port, 143);
  Assert.equal(newServer.socketType, Ci.nsMsgSocketType.plain);

  let record = await store.createRecord(id);
  record = await roundTripRecord(record, ServerRecord);

  Assert.equal(record.id, id);
  Assert.equal(record.name, "Future IMAP Server");
  Assert.equal(record.type, "imap");
  Assert.equal(record.location, "v999.hostname:143");
  Assert.equal(record.socketType, "plain");
  Assert.equal(record.authMethod, "passwordCleartext");
  Assert.equal(record.username, "username");
  Assert.deepEqual(record.cleartext.extra, {});
  Assert.equal(record.cleartext.additional, "much data");
  Assert.equal(record.cleartext.more, "wow!");

  await store.applyIncoming(ServerRecord.from({ id, deleted: true }));

  Assert.equal(MailServices.accounts.accounts.length, 3);
});
