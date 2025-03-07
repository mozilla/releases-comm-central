/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

let account;

add_setup(async function () {
  await installDB("messages.sqlite");

  account = MailServices.accounts.createLocalMailAccount();
  Assert.equal(account.incomingServer.key, "server1");
});

add_task(async function testFolderMethods() {
  const folderA = MailServices.folderLookup.getFolderForURL(
    account.incomingServer.rootFolder.URI + "/folderA"
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
  let header = folderDatabase.getMsgHdrForKey(4);
  Assert.equal(header.messageKey, 4);
  Assert.equal(header.date, new Date("2019-11-03T12:34:56Z").valueOf() * 1000);
  Assert.equal(header.author, '"Eliseo Bauch" <eliseo@bauch.invalid>');
  Assert.equal(header.subject, "Proactive intermediate collaboration");
  Assert.equal(
    header.flags,
    Ci.nsMsgMessageFlags.Read | Ci.nsMsgMessageFlags.Marked
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

  Assert.ok(!folderDatabase.isRead(1));
  Assert.ok(!folderDatabase.isRead(2));
  Assert.ok(folderDatabase.isRead(3));
  Assert.ok(folderDatabase.isRead(4));
  Assert.deepEqual(folderDatabase.markAllRead(), [1, 2]);
  Assert.ok(folderDatabase.isRead(1));
  Assert.ok(folderDatabase.isRead(2));
  Assert.ok(folderDatabase.isRead(3));
  Assert.ok(folderDatabase.isRead(4));

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
});

add_task(async function testFolderInfo() {
  const folderA = MailServices.folderLookup.getFolderForURL(
    account.incomingServer.rootFolder.URI + "/folderA"
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
});

add_task(async function testHeaderMethods() {
  const folderC = MailServices.folderLookup.getFolderForURL(
    account.incomingServer.rootFolder.URI + "/folderC"
  );
  Assert.ok(folderC.filePath.path);

  const folderDatabase = database.openFolderDB(folderC, false);
  Assert.ok(folderDatabase);
  Assert.equal(folderC.msgDatabase, folderDatabase);

  let header = folderDatabase.getMsgHdrForKey(7);
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

add_task(async function testListener() {
  class FolderListener {
    QueryInterface = ChromeUtils.generateQI(["nsIDBChangeListener"]);
    reset() {
      this._headerAdded = null;
      this._headerRemoved = null;
    }
    onHdrFlagsChanged(_hdrChanged, _oldFlags, _newFlags, _instigator) {
      Assert.ok(false, "unexpected onHdrFlagsChanged event");
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
    account.incomingServer.rootFolder.URI + "/folderB"
  );
  const folderDatabaseB = database.openFolderDB(folderB, false);
  folderDatabaseB.addListener(listenerB);

  const listenerC = new FolderListener();
  const folderC = MailServices.folderLookup.getFolderForURL(
    account.incomingServer.rootFolder.URI + "/folderC"
  );
  const folderDatabaseC = database.openFolderDB(folderC, false);
  folderDatabaseC.addListener(listenerC);

  const addedId = addMessage({ folderId: 4 });
  Assert.ok(!listenerB._headerAdded);
  Assert.ok(!listenerB._headerRemoved);
  Assert.ok(listenerC._headerAdded);
  Assert.ok(!listenerC._headerRemoved);

  const [headerAdded] = listenerC._headerAdded;
  Assert.ok(headerAdded instanceof Ci.nsIMsgDBHdr);
  Assert.equal(headerAdded.messageKey, addedId);
  // Assert.equal(headerAdded.folder, folderC);
  Assert.equal(headerAdded.messageId, "messageId");
  Assert.equal(headerAdded.date, new Date("2025-01-22").valueOf() * 1000);
  Assert.equal(headerAdded.author, "sender");
  Assert.equal(headerAdded.subject, "subject");
  Assert.equal(headerAdded.flags, 0);
  // Assert.equal(headerAdded.getStringProperty("keywords"), "");

  listenerC.reset();
  messages.removeMessage(headerAdded.messageKey);
  Assert.ok(!listenerB._headerAdded);
  Assert.ok(!listenerB._headerRemoved);
  Assert.ok(!listenerC._headerAdded);
  Assert.ok(listenerC._headerRemoved);

  const [headerRemoved] = listenerC._headerRemoved;
  Assert.ok(headerRemoved instanceof Ci.nsIMsgDBHdr);
  Assert.equal(headerRemoved.messageKey, addedId);
  // Assert.equal(headerAdded.folder, folderC);
  Assert.equal(headerAdded.messageId, "messageId");
  Assert.equal(headerAdded.date, new Date("2025-01-22").valueOf() * 1000);
  Assert.equal(headerAdded.author, "sender");
  Assert.equal(headerAdded.subject, "subject");
  Assert.equal(headerAdded.flags, 0);
  // Assert.equal(headerAdded.getStringProperty("keywords"), "");
});
