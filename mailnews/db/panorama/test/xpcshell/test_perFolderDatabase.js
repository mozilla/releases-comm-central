/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the new database's implemention of the old database's interfaces.
 */

const { ProfileCreator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ProfileCreator.sys.mjs"
);

let rootFolder;

add_setup(async function () {
  await installDBFromFile("db/messages.sql");
  const profile = new ProfileCreator(do_get_profile());
  const server = profile.addLocalServer();
  await server.rootFolder.addMailFolder("folderA");
  await server.rootFolder.addMailFolder("folderB");
  await server.rootFolder.addMailFolder("folderC");

  MailServices.accounts.accounts;
  const localServer = MailServices.accounts.localFoldersServer;
  Assert.equal(localServer.key, "server1");
  rootFolder = localServer.rootFolder;
});

add_task(async function testFolderMethods() {
  const folderA = MailServices.folderLookup.getFolderForURL(
    rootFolder.URI + "/folderA"
  );
  Assert.ok(folderA.filePath.path);

  const folderDatabase = database.openFolderDB(folderA, false);
  Assert.ok(folderDatabase);
  Assert.equal(folderA.msgDatabase, folderDatabase);
  Assert.deepEqual(folderDatabase.listAllKeys(), [1, 2, 3, 4]);
  Assert.ok(!folderDatabase.containsKey(0));
  Assert.ok(folderDatabase.containsKey(1));
  Assert.ok(folderDatabase.containsKey(4));
  Assert.ok(!folderDatabase.containsKey(5));

  // Test getting a message header.
  let header = folderDatabase.getMsgHdrForKey(2);
  Assert.equal(header.messageKey, 2);
  Assert.equal(header.folder, folderA);
  Assert.equal(header.date, new Date("2019-09-14T00:00:00Z").valueOf() * 1000);
  Assert.equal(header.author, '"Lydia Rau" <lydia@rau.invalid>');
  Assert.equal(header.subject, "Networked even-keeled forecast");
  Assert.equal(header.flags, 0);

  Assert.throws(
    () => folderDatabase.getMsgHdrForKey(5),
    /NS_ERROR_ILLEGAL_VALUE/,
    "message from a different folder should not be returned"
  );

  header = folderDatabase.getMsgHdrForMessageID("message4@invalid");
  Assert.equal(header.messageKey, 4);
  Assert.equal(header.folder, folderA);
  Assert.equal(header.date, new Date("2019-11-03T12:34:56Z").valueOf() * 1000);
  Assert.equal(header.author, '"Eliseo Bauch" <eliseo@bauch.invalid>');
  Assert.equal(header.subject, "Proactive intermediate collaboration");
  Assert.equal(
    header.flags,
    Ci.nsMsgMessageFlags.Read | Ci.nsMsgMessageFlags.Marked
  );

  Assert.throws(
    () => folderDatabase.getMsgHdrForMessageID("message7@invalid"),
    /NS_ERROR_ILLEGAL_VALUE/,
    "message from a different folder should not be returned"
  );

  // Test getting and changing message flags.
  Assert.ok(folderDatabase.isRead(4));
  Assert.ok(!folderDatabase.isIgnored(4));
  Assert.ok(!folderDatabase.isWatched(4));
  Assert.ok(folderDatabase.isMarked(4));
  Assert.ok(!folderDatabase.hasAttachments(4));
  Assert.ok(!folderDatabase.isMDNSent(4));
  folderDatabase.markNotNew(4, null);
  folderDatabase.markMDNNeeded(4, true, null);
  folderDatabase.markMDNSent(4, true, null);
  Assert.ok(folderDatabase.isMDNSent(4));
  folderDatabase.markRead(4, false, null);
  Assert.ok(!folderDatabase.isRead(4));
  folderDatabase.markMarked(4, false, null);
  Assert.ok(!folderDatabase.isMarked(4));
  folderDatabase.markReplied(4, true, null);
  folderDatabase.markForwarded(4, true, null);
  folderDatabase.markRedirected(4, true, null);
  folderDatabase.markHasAttachments(4, true, null);
  Assert.ok(folderDatabase.hasAttachments(4));
  folderDatabase.markOffline(4, true, null);
  folderDatabase.markImapDeleted(4, true, null);
  folderDatabase.markKilled(4, true, null);

  header = folderDatabase.getMsgHdrForKey(4);
  Assert.equal(
    header.flags,
    Ci.nsMsgMessageFlags.MDNReportNeeded |
      Ci.nsMsgMessageFlags.MDNReportSent |
      Ci.nsMsgMessageFlags.Replied |
      Ci.nsMsgMessageFlags.Forwarded |
      Ci.nsMsgMessageFlags.Redirected |
      Ci.nsMsgMessageFlags.Attachment |
      Ci.nsMsgMessageFlags.Offline |
      Ci.nsMsgMessageFlags.IMAPDeleted |
      Ci.nsMsgMessageFlags.Ignored
  );

  folderDatabase.markMDNNeeded(4, false, null);
  folderDatabase.markMDNSent(4, false, null);
  Assert.ok(!folderDatabase.isMDNSent(4));
  folderDatabase.markRead(4, true, null);
  Assert.ok(folderDatabase.isRead(4));
  folderDatabase.markMarked(4, true, null);
  Assert.ok(folderDatabase.isMarked(4));
  folderDatabase.markReplied(4, false, null);
  folderDatabase.markForwarded(4, false, null);
  folderDatabase.markRedirected(4, false, null);
  folderDatabase.markHasAttachments(4, false, null);
  Assert.ok(!folderDatabase.hasAttachments(4));
  folderDatabase.markOffline(4, false, null);
  folderDatabase.markImapDeleted(4, false, null);
  folderDatabase.markKilled(4, false, null);
  header = folderDatabase.getMsgHdrForKey(4);
  Assert.equal(
    header.flags,
    Ci.nsMsgMessageFlags.Read | Ci.nsMsgMessageFlags.Marked
  );

  // Test enumerateMessages and reverseEnumerateMessages. Do this twice to
  // make sure we get a fresh enumerator the second time.
  Assert.deepEqual(
    Array.from(folderDatabase.enumerateMessages(), m => m.messageKey),
    [1, 2, 3, 4]
  );
  Assert.deepEqual(
    Array.from(folderDatabase.enumerateMessages(), m => m.subject),
    [
      "Fundamental empowering pricing structure",
      "Networked even-keeled forecast",
      "Streamlined bandwidth-monitored help-desk",
      "Proactive intermediate collaboration",
    ]
  );

  Assert.deepEqual(
    Array.from(folderDatabase.reverseEnumerateMessages(), m => m.messageKey),
    [4, 3, 2, 1]
  );
  Assert.deepEqual(
    Array.from(folderDatabase.reverseEnumerateMessages(), m => m.subject),
    [
      "Proactive intermediate collaboration",
      "Streamlined bandwidth-monitored help-desk",
      "Networked even-keeled forecast",
      "Fundamental empowering pricing structure",
    ]
  );

  // Test marking all messages as read.
  Assert.ok(!folderDatabase.isRead(1));
  Assert.ok(!folderDatabase.isRead(2));
  Assert.ok(folderDatabase.isRead(3));
  Assert.ok(folderDatabase.isRead(4));
  Assert.deepEqual(folderDatabase.markAllRead(), [1, 2]);
  Assert.ok(folderDatabase.isRead(1));
  Assert.ok(folderDatabase.isRead(2));
  Assert.ok(folderDatabase.isRead(3));
  Assert.ok(folderDatabase.isRead(4));

  // Test the new messages list.
  Assert.ok(!folderDatabase.hasNew());
  Assert.equal(folderDatabase.firstNew, 0xffffffff); // nsMsgKey_None
  folderDatabase.addToNewList(2);
  Assert.ok(folderDatabase.hasNew());
  Assert.equal(folderDatabase.firstNew, 2);
  Assert.deepEqual(folderDatabase.getNewList(), [2]);
  folderDatabase.addToNewList(2);
  Assert.deepEqual(folderDatabase.getNewList(), [2]);
  folderDatabase.addToNewList(3);
  Assert.deepEqual(folderDatabase.getNewList(), [2, 3]);
  folderDatabase.markNotNew(2, null);
  Assert.deepEqual(folderDatabase.getNewList(), [3]);
  folderDatabase.markNotNew(2, null);
  Assert.deepEqual(folderDatabase.getNewList(), [3]);

  // Reset unread messages.
  folderDatabase.markRead(3, false, null);
  folderDatabase.markRead(4, false, null);
});

add_task(async function testFolderInfo() {
  const folderA = MailServices.folderLookup.getFolderForURL(
    rootFolder.URI + "/folderA"
  );
  const folderDatabase = database.openFolderDB(folderA, false);
  const folderInfo = folderDatabase.dBFolderInfo;
  Assert.ok(folderInfo);
  Assert.equal(folderInfo.folderName, "folderA");

  Assert.equal(folderInfo.flags, 0);

  folderInfo.flags = Ci.nsMsgFolderFlags.Mail | Ci.nsMsgFolderFlags.Inbox;
  Assert.equal(
    folderInfo.flags,
    Ci.nsMsgFolderFlags.Mail | Ci.nsMsgFolderFlags.Inbox
  );

  Assert.equal(
    folderInfo.andFlags(Ci.nsMsgFolderFlags.Mail),
    Ci.nsMsgFolderFlags.Mail
  );
  Assert.equal(folderInfo.flags, Ci.nsMsgFolderFlags.Mail);

  Assert.equal(
    folderInfo.orFlags(Ci.nsMsgFolderFlags.Virtual),
    Ci.nsMsgFolderFlags.Mail | Ci.nsMsgFolderFlags.Virtual
  );
  Assert.equal(
    folderInfo.flags,
    Ci.nsMsgFolderFlags.Mail | Ci.nsMsgFolderFlags.Virtual
  );

  Assert.equal(folderInfo.numMessages, 4);
  Assert.equal(folderA.getTotalMessages(false), 4);
  Assert.equal(folderInfo.numUnreadMessages, 2);
  Assert.equal(folderA.getNumUnread(false), 2);
});

add_task(async function testFolderProperties() {
  const folderB = MailServices.folderLookup.getFolderForURL(
    rootFolder.URI + "/folderB"
  );

  const folderDatabase = database.openFolderDB(folderB, false);
  const folderInfo = folderDatabase.dBFolderInfo;

  Assert.equal(folderInfo.getProperty("wibble"), "");
  folderInfo.setProperty("wibble", "wobble");
  Assert.equal(folderInfo.getProperty("wibble"), "wobble");
  folderInfo.setProperty("wibble", "");
  Assert.equal(folderInfo.getProperty("wibble"), "");

  Assert.equal(folderInfo.getCharProperty("hack"), "");
  folderInfo.setCharProperty("hack", "splat");
  Assert.equal(folderInfo.getCharProperty("hack"), "splat");
  folderInfo.setCharProperty("hack", "");
  Assert.equal(folderInfo.getCharProperty("hack"), "");

  Assert.equal(folderInfo.getUint32Property("answer", 3), 3);
  folderInfo.setUint32Property("answer", 42);
  Assert.equal(folderInfo.getUint32Property("answer", 3), 42);

  Assert.equal(folderInfo.getInt64Property("days", -1), -1);
  folderInfo.setInt64Property("days", 365);
  Assert.equal(folderInfo.getInt64Property("days", -1), 365);

  Assert.equal(folderInfo.getBooleanProperty("yes?", true), true);
  folderInfo.setBooleanProperty("yes?", false);
  Assert.equal(folderInfo.getBooleanProperty("yes?", true), false);

  Assert.equal(folderInfo.getBooleanProperty("no!", false), false);
  folderInfo.setBooleanProperty("no!", true);
  Assert.equal(folderInfo.getBooleanProperty("no!", false), true);

  // Check the database has a record of the properties.
  // TODO: Should we remove properties set to an empty string or 0?

  const stmt = database.connectionForTests.createStatement(
    "SELECT id, name, value FROM folder_properties ORDER BY id, name"
  );
  const properties = [];
  while (stmt.executeStep()) {
    properties.push([stmt.row.id, stmt.row.name, stmt.row.value]);
  }
  stmt.finalize();

  Assert.deepEqual(properties, [
    [3, "answer", 42],
    [3, "days", 365],
    [3, "hack", ""],
    [3, "no!", true],
    [3, "wibble", ""],
    [3, "yes?", false],
  ]);
});

add_task(async function testHeaderMethods() {
  const folderC = MailServices.folderLookup.getFolderForURL(
    rootFolder.URI + "/folderC"
  );
  Assert.ok(folderC.filePath.path);

  const folderDatabase = database.openFolderDB(folderC, false);
  Assert.ok(folderDatabase);
  Assert.equal(folderC.msgDatabase, folderDatabase);

  let header = folderDatabase.getMsgHdrForKey(7);
  Assert.equal(header.folder, folderC);
  Assert.equal(header.flags, 0);
  Assert.ok(!header.isRead);
  Assert.ok(!header.isFlagged);
  Assert.ok(!header.isKilled);

  header.flags = Ci.nsMsgMessageFlags.Read | Ci.nsMsgMessageFlags.Marked;
  Assert.equal(
    header.flags,
    Ci.nsMsgMessageFlags.Read | Ci.nsMsgMessageFlags.Marked
  );
  Assert.ok(header.isRead);
  Assert.ok(header.isFlagged);
  Assert.ok(!header.isKilled);

  Assert.equal(
    header.andFlags(~Ci.nsMsgMessageFlags.Marked),
    Ci.nsMsgMessageFlags.Read
  );
  Assert.equal(
    header.orFlags(Ci.nsMsgMessageFlags.Ignored),
    Ci.nsMsgMessageFlags.Read | Ci.nsMsgMessageFlags.Ignored
  );

  header = folderDatabase.getMsgHdrForKey(7);
  Assert.equal(
    header.flags,
    Ci.nsMsgMessageFlags.Read | Ci.nsMsgMessageFlags.Ignored
  );

  header.markRead(false);
  Assert.ok(!header.isRead);
  header.markFlagged(true);
  Assert.ok(header.isFlagged);
  header.markHasAttachments(true);
  Assert.equal(
    header.flags,
    Ci.nsMsgMessageFlags.Marked |
      Ci.nsMsgMessageFlags.Ignored |
      Ci.nsMsgMessageFlags.Attachment
  );
});

add_task(async function testHeaderProperties() {
  const folderC = MailServices.folderLookup.getFolderForURL(
    rootFolder.URI + "/folderC"
  );

  const folderDatabase = database.openFolderDB(folderC, false);
  const header = folderDatabase.getMsgHdrForKey(7);

  Assert.equal(header.getStringProperty("hack"), "");
  header.setStringProperty("hack", "splat");
  Assert.equal(header.getStringProperty("hack"), "splat");
  header.setStringProperty("hack", "");
  Assert.equal(header.getStringProperty("hack"), "");

  Assert.equal(header.getUint32Property("answer"), 0);
  header.setUint32Property("answer", 42);
  Assert.equal(header.getUint32Property("answer"), 42);

  Assert.equal(header.storeToken, "");
  header.storeToken = "12345678";
  Assert.equal(header.storeToken, "12345678");

  Assert.equal(header.messageSize, 0);
  header.messageSize = 500;
  Assert.equal(header.messageSize, 500);

  Assert.deepEqual(header.properties.toSorted(), [
    "answer",
    "hack",
    "messageSize",
    "storeToken",
  ]);

  // Check the database has a record of the properties.
  // TODO: Should we remove properties set to an empty string or 0?

  const stmt = database.connectionForTests.createStatement(
    "SELECT id, name, value FROM message_properties ORDER BY id, name"
  );
  const properties = [];
  while (stmt.executeStep()) {
    properties.push([stmt.row.id, stmt.row.name, stmt.row.value]);
  }
  stmt.finalize();

  Assert.deepEqual(properties, [
    [7, "answer", 42],
    [7, "hack", ""],
    [7, "messageSize", 500],
    [7, "storeToken", "12345678"],
  ]);
});

add_task(async function testListener() {
  class FolderListener {
    QueryInterface = ChromeUtils.generateQI(["nsIDBChangeListener"]);
    reset() {
      this._headerAdded = null;
      this._headerRemoved = null;
      this._headerChanged = null;
    }
    onHdrFlagsChanged(hdrChanged, oldFlags, newFlags, instigator) {
      this._headerChanged = [hdrChanged, oldFlags, newFlags, instigator];
    }
    onHdrDeleted(hdrChanged, parentKey, flags, instigator) {
      this._headerRemoved = [hdrChanged, parentKey, flags, instigator];
    }
    onHdrAdded(hdrChanged, parentKey, flags, instigator) {
      this._headerAdded = [hdrChanged, parentKey, flags, instigator];
    }
    onParentChanged(_keyChanged, _oldParent, _newParent, _instigator) {
      Assert.ok(false, "unexpected onParentChanged event");
    }
    onAnnouncerGoingAway(_instigator) {
      Assert.ok(false, "unexpected onAnnouncerGoingAway event");
    }
    onReadChanged(_instigator) {
      Assert.ok(false, "unexpected onReadChanged event");
    }
    onJunkScoreChanged(_instigator) {
      Assert.ok(false, "unexpected onJunkScoreChanged event");
    }
    onHdrPropertyChanged(
      _hdrToChange,
      _property,
      _preChange,
      _status,
      _instigator
    ) {
      Assert.ok(false, "unexpected onHdrPropertyChanged event");
    }
    onEvent(_db, _event) {
      Assert.ok(false, "unexpected onEvent event");
    }
  }

  const listenerB = new FolderListener();
  const folderB = MailServices.folderLookup.getFolderForURL(
    rootFolder.URI + "/folderB"
  );
  const folderDatabaseB = database.openFolderDB(folderB, false);
  folderDatabaseB.addListener(listenerB);

  const listenerC = new FolderListener();
  const folderC = MailServices.folderLookup.getFolderForURL(
    rootFolder.URI + "/folderC"
  );
  const folderDatabaseC = database.openFolderDB(folderC, false);
  folderDatabaseC.addListener(listenerC);

  const addedId = addMessage({ folderId: 4 });
  Assert.ok(!listenerB._headerAdded);
  Assert.ok(!listenerB._headerRemoved);
  Assert.ok(!listenerB._headerChanged);
  Assert.ok(listenerC._headerAdded);
  Assert.ok(!listenerC._headerRemoved);
  Assert.ok(!listenerC._headerChanged);

  const [headerAdded] = listenerC._headerAdded;
  Assert.ok(headerAdded instanceof Ci.nsIMsgDBHdr);
  Assert.equal(headerAdded.messageKey, addedId);
  Assert.equal(headerAdded.folder, folderC);
  Assert.equal(headerAdded.messageId, "messageId");
  Assert.equal(headerAdded.date, new Date("2025-01-22").valueOf() * 1000);
  Assert.equal(headerAdded.author, "sender");
  Assert.equal(headerAdded.subject, "subject");
  Assert.equal(headerAdded.flags, 0);
  Assert.equal(headerAdded.getStringProperty("keywords"), "");

  listenerC.reset();
  headerAdded.markRead(true);
  Assert.ok(!listenerB._headerAdded);
  Assert.ok(!listenerB._headerRemoved);
  Assert.ok(!listenerB._headerChanged);
  Assert.ok(!listenerC._headerAdded);
  Assert.ok(!listenerC._headerRemoved);
  Assert.ok(listenerC._headerChanged);

  const [headerChanged, oldFlags, newFlags] = listenerC._headerChanged;
  Assert.ok(headerChanged instanceof Ci.nsIMsgDBHdr);
  Assert.equal(headerChanged.messageKey, addedId);
  Assert.equal(headerChanged.folder, folderC);
  Assert.equal(headerChanged.messageId, "messageId");
  Assert.equal(headerChanged.date, new Date("2025-01-22").valueOf() * 1000);
  Assert.equal(headerChanged.author, "sender");
  Assert.equal(headerChanged.subject, "subject");
  Assert.equal(headerChanged.flags, Ci.nsMsgMessageFlags.Read);
  Assert.equal(headerChanged.getStringProperty("keywords"), "");
  Assert.equal(oldFlags, 0);
  Assert.equal(newFlags, Ci.nsMsgMessageFlags.Read);

  listenerC.reset();
  messageDB.removeMessage(headerAdded.messageKey);
  Assert.ok(!listenerB._headerAdded);
  Assert.ok(!listenerB._headerRemoved);
  Assert.ok(!listenerB._headerChanged);
  Assert.ok(!listenerC._headerAdded);
  Assert.ok(listenerC._headerRemoved);
  Assert.ok(!listenerC._headerChanged);

  const [headerRemoved] = listenerC._headerRemoved;
  Assert.ok(headerRemoved instanceof Ci.nsIMsgDBHdr);
  Assert.equal(headerRemoved.messageKey, addedId);
  Assert.equal(headerRemoved.folder, folderC);
  Assert.equal(headerRemoved.messageId, "messageId");
  Assert.equal(headerRemoved.date, new Date("2025-01-22").valueOf() * 1000);
  Assert.equal(headerRemoved.author, "sender");
  Assert.equal(headerRemoved.subject, "subject");
  Assert.equal(headerRemoved.flags, Ci.nsMsgMessageFlags.Read);
  // TODO
  //Assert.equal(headerRemoved.getStringProperty("keywords"), "");
});
