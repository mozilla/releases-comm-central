/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

do_get_profile();

const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
const { AccountsEngine, AccountRecord } = ChromeUtils.importESModule(
  "resource://services-sync/engines/accounts.sys.mjs"
);
const { Service } = ChromeUtils.importESModule(
  "resource://services-sync/service.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

let engine, store, tracker;
let imapAccount, imapServer, pop3Account, pop3Server, smtpServer;

add_setup(async function () {
  engine = new AccountsEngine(Service);
  await engine.initialize();
  store = engine._store;

  try {
    // Ensure there is a local mail account...
    MailServices.accounts.localFoldersServer;
  } catch {
    // ... if not, make one.
    MailServices.accounts.createLocalMailAccount();
  }

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

  smtpServer = MailServices.smtp.createServer();
  smtpServer.username = "username";
  smtpServer.hostname = "hostname";
  smtpServer.description = "SMTP Server";

  Assert.ok(smtpServer.UID);
  Assert.equal(
    Services.prefs.getStringPref(`mail.smtpserver.${smtpServer.key}.uid`, ""),
    smtpServer.UID
  );

  // Sanity check.
  Assert.equal(MailServices.accounts.accounts.length, 3);
  Assert.equal(MailServices.smtp.servers.length, 1);
});

add_task(async function testGetAllIDs() {
  Assert.deepEqual(await store.getAllIDs(), {
    [imapServer.UID]: true,
    [pop3Server.UID]: true,
    [smtpServer.UID]: true,
  });
});

add_task(async function testItemExists() {
  Assert.equal(await store.itemExists(imapServer.UID), true);
  Assert.equal(await store.itemExists(pop3Server.UID), true);
  Assert.equal(await store.itemExists(smtpServer.UID), true);
});

add_task(async function testCreateIMAPRecord() {
  const record = await store.createRecord(imapServer.UID);
  Assert.ok(record instanceof AccountRecord);
  Assert.equal(record.id, imapServer.UID);
  Assert.equal(record.username, "username");
  Assert.equal(record.hostname, "hostname");
  Assert.equal(record.type, "imap");
  Assert.deepEqual(record.prefs, {
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
    prettyName: "IMAP Server",
    socketType: 0,
  });
  Assert.equal(record.isDefault, undefined);
});

add_task(async function testCreatePOP3Record() {
  const record = await store.createRecord(pop3Server.UID);
  Assert.ok(record instanceof AccountRecord);
  Assert.equal(record.id, pop3Server.UID);
  Assert.equal(record.username, "username");
  Assert.equal(record.hostname, "hostname");
  Assert.equal(record.type, "pop3");
  Assert.deepEqual(record.prefs, {
    authMethod: 3,
    biffMinutes: 10,
    doBiff: true,
    downloadOnBiff: false,
    emptyTrashOnExit: false,
    incomingDuplicateAction: 0,
    limitOfflineMessageSize: false,
    loginAtStartUp: false,
    maxMessageSize: 50,
    port: 110,
    prettyName: "POP3 Server",
    socketType: 0,
  });
  Assert.equal(record.isDefault, undefined);
});

add_task(async function testCreateSMTPRecord() {
  const smtpServerID = smtpServer.UID;

  const record = await store.createRecord(smtpServerID);
  Assert.ok(record instanceof AccountRecord);
  Assert.equal(record.id, smtpServerID);
  Assert.equal(record.username, "username");
  Assert.equal(record.hostname, "hostname");
  Assert.equal(record.type, "smtp");
  Assert.deepEqual(record.prefs, {
    authMethod: 3,
    port: 0,
    description: "SMTP Server",
    socketType: 0,
  });
  Assert.equal(record.isDefault, true);
});

add_task(async function testCreateDeletedRecord() {
  const fakeID = "12345678-1234-1234-1234-123456789012";
  const record = await store.createRecord(fakeID);
  Assert.ok(record instanceof AccountRecord);
  Assert.equal(record.id, fakeID);
  Assert.equal(record.deleted, true);
});

add_task(async function testSyncIMAPRecords() {
  const newID = newUID();
  await store.applyIncoming({
    id: newID,
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

  Assert.equal(MailServices.accounts.accounts.length, 4);

  const newServer = MailServices.accounts.allServers.find(s => s.UID == newID);
  Assert.equal(newServer.username, "username");
  Assert.equal(newServer.hostName, "new.hostname");
  Assert.equal(newServer.prettyName, "New IMAP Server");
  Assert.equal(newServer.port, 143);
  Assert.equal(newServer.socketType, Ci.nsMsgSocketType.plain);

  await store.applyIncoming({
    id: newID,
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

  Assert.equal(newServer.prettyName, "Changed IMAP Server");
  Assert.equal(newServer.port, 993);
  Assert.equal(newServer.socketType, Ci.nsMsgSocketType.SSL);

  await Assert.rejects(
    store.applyIncoming({
      id: newID,
      type: "pop3",
    }),
    /Refusing to change server type/
  );

  await store.applyIncoming({
    id: newID,
    deleted: true,
  });

  Assert.equal(MailServices.accounts.accounts.length, 3);
});

add_task(async function testSyncPOP3Records() {
  const newID = newUID();
  await store.applyIncoming({
    id: newID,
    username: "username",
    hostname: "new.hostname",
    type: "pop3",
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
      port: 110,
      prettyName: "New POP3 Server",
      socketType: Ci.nsMsgSocketType.plain,
    },
  });

  Assert.equal(MailServices.accounts.accounts.length, 4);

  const newServer = MailServices.accounts.allServers.find(s => s.UID == newID);
  Assert.equal(newServer.username, "username");
  Assert.equal(newServer.hostName, "new.hostname");
  Assert.equal(newServer.prettyName, "New POP3 Server");
  Assert.equal(newServer.port, 110);
  Assert.equal(newServer.socketType, Ci.nsMsgSocketType.plain);

  await store.applyIncoming({
    id: newID,
    username: "username",
    hostname: "new.hostname",
    type: "pop3",
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
      port: 995,
      prettyName: "Changed POP3 Server",
      socketType: Ci.nsMsgSocketType.SSL,
    },
  });

  Assert.equal(newServer.prettyName, "Changed POP3 Server");
  Assert.equal(newServer.port, 995);
  Assert.equal(newServer.socketType, Ci.nsMsgSocketType.SSL);

  await Assert.rejects(
    store.applyIncoming({
      id: newID,
      type: "imap",
    }),
    /Refusing to change server type/
  );

  await store.applyIncoming({
    id: newID,
    deleted: true,
  });

  Assert.equal(MailServices.accounts.accounts.length, 3);
});

add_task(async function testSyncSMTPRecords() {
  const newSMTPServerID = newUID();
  await store.applyIncoming({
    id: newSMTPServerID,
    username: "username",
    hostname: "hostname",
    type: "smtp",
    prefs: {
      authMethod: 3,
      port: 0,
      description: "Second Outgoing Server",
      socketType: 0,
    },
    isDefault: true,
  });

  Assert.equal(MailServices.smtp.servers.length, 2);

  const newSMTPServer = MailServices.smtp.servers.find(
    s => s.UID == newSMTPServerID
  );
  Assert.equal(newSMTPServer.username, "username");
  Assert.equal(newSMTPServer.hostname, "hostname");
  Assert.equal(newSMTPServer.description, "Second Outgoing Server");
  Assert.equal(MailServices.smtp.defaultServer.key, newSMTPServer.key);

  await store.applyIncoming({
    id: smtpServer.UID,
    username: "username",
    hostname: "new.hostname",
    type: "smtp",
    prefs: {
      authMethod: 3,
      port: 0,
      description: "New SMTP Server",
      socketType: 0,
    },
    isDefault: true,
  });

  Assert.equal(smtpServer.description, "New SMTP Server");
  Assert.equal(MailServices.smtp.defaultServer.key, smtpServer.key);

  // TODO test update

  await store.applyIncoming({
    id: newSMTPServerID,
    deleted: true,
  });

  Assert.equal(MailServices.smtp.servers.length, 1);
  Assert.equal(MailServices.smtp.servers[0].key, smtpServer.key);
  Assert.equal(MailServices.smtp.defaultServer.key, smtpServer.key);
});
