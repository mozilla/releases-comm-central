/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that rekeying events and missed move notifications do not leave Gloda
 * with duplicate records for the same message.
 */

var {
  assertExpectedMessagesIndexed,
  glodaTestHelperInitialize,
  waitForGlodaIndexer,
} = ChromeUtils.importESModule(
  "resource://testing-common/gloda/GlodaTestHelper.sys.mjs"
);
var { waitForGlodaDBFlush } = ChromeUtils.importESModule(
  "resource://testing-common/gloda/GlodaTestHelperFunctions.sys.mjs"
);
var { Gloda } = ChromeUtils.importESModule(
  "resource:///modules/gloda/GlodaPublic.sys.mjs"
);
var { GlodaIndexer, IndexingJob } = ChromeUtils.importESModule(
  "resource:///modules/gloda/GlodaIndexer.sys.mjs"
);
var { GlodaMsgIndexer, PendingCommitTracker } = ChromeUtils.importESModule(
  "resource:///modules/gloda/IndexMsg.sys.mjs"
);
var { GlodaDatastore } = ChromeUtils.importESModule(
  "resource:///modules/gloda/GlodaDatastore.sys.mjs"
);
var { sqlExpectCount, sqlRun } = ChromeUtils.importESModule(
  "resource://testing-common/gloda/GlodaQueryHelper.sys.mjs"
);
var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);

let msgGen, messageInjection;

add_setup(function () {
  // Keep the message store consistent with the compaction test, which also
  // forces mbox.
  Services.prefs.setCharPref(
    "mail.serverDefaultStoreContractID",
    "@mozilla.org/msgstore/berkeleystore;1"
  );
  msgGen = new MessageGenerator();
  messageInjection = new MessageInjection({ mode: "local" }, msgGen);
  glodaTestHelperInitialize(messageInjection);
});

/**
 * Simulate a missed rekeying by parking A's record onto B's key, then check
 * that reindexing A reuses the record and fixes its location instead of
 * creating a new record with the duplicated message.
 */
add_task(async function test_rekeyed_record_is_reused() {
  const [[folder], setA, setB] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1 },
    { count: 1 },
  ]);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([setA, setB], { augment: true }));
  await waitForGlodaDBFlush();

  const msgFolder = messageInjection.getRealInjectionFolder(folder);
  const glodaFolder = Gloda.getFolderForFolder(msgFolder);
  const [aHdr] = setA.msgHdrs();
  const [bHdr] = setB.msgHdrs();
  const aGlodaId = setA.glodaMessages[0].id;
  const aKey = aHdr.messageKey;
  const bKey = bHdr.messageKey;

  // A's record claims a key that now belongs to B, which is the state a
  // missed key changing notification leaves behind.
  GlodaDatastore.updateMessageKeys([aGlodaId], [bKey]);

  aHdr.setUint32Property("gloda-dirty", GlodaMsgIndexer.kMessageDirty);
  glodaFolder._ensureFolderDirty();
  GlodaMsgIndexer.indexingSweepNeeded = true;
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([setA]));

  await sqlExpectCount(
    1,
    "SELECT COUNT(*) FROM messages WHERE headerMessageID = ?1 AND +deleted = 0",
    setA.synMessages[0].messageId
  );
  await sqlExpectCount(
    1,
    "SELECT COUNT(*) FROM messages WHERE id = ?1 AND messageKey = ?2 AND +deleted = 0",
    aGlodaId,
    aKey
  );
});

/**
 * Simulate a move where Gloda never receives a notification and check that
 * indexing the message in its new folder adopts the stale record instead of
 * creating a duplicate.
 */
add_task(async function test_stale_record_after_missed_move_is_reused() {
  const [[folder], setA] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1 },
  ]);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([setA], { augment: true }));

  const srcFolder = messageInjection.getRealInjectionFolder(folder);
  const aGlodaId = setA.glodaMessages[0].id;
  const originalKey = setA.getMsgHdr(0).messageKey;

  const destHandle = await messageInjection.makeEmptyFolder();
  await messageInjection.moveMessages(setA, destHandle);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([setA]));
  await waitForGlodaDBFlush();

  const destFolder = messageInjection.getRealInjectionFolder(destHandle);
  const destGlodaFolder = Gloda.getFolderForFolder(destFolder);
  const destHdr = setA.getMsgHdr(0);
  const newKey = destHdr.messageKey;

  // Simulate a record rewind on the source folder, as if the move notifications
  // had never been processed.
  GlodaDatastore.updateMessageLocations(
    [aGlodaId],
    [originalKey],
    srcFolder,
    /* aDoNotNotify */ true
  );

  destHdr.setUint32Property("gloda-dirty", GlodaMsgIndexer.kMessageDirty);
  destGlodaFolder._ensureFolderDirty();
  GlodaMsgIndexer.indexingSweepNeeded = true;
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([setA]));

  await sqlExpectCount(
    1,
    "SELECT COUNT(*) FROM messages WHERE headerMessageID = ?1 AND +deleted = 0",
    setA.synMessages[0].messageId
  );
  await sqlExpectCount(
    1,
    "SELECT COUNT(*) FROM messages WHERE id = ?1 AND folderID = ?2 AND messageKey = ?3 AND +deleted = 0",
    aGlodaId,
    destGlodaFolder.id,
    newKey
  );
});

/**
 * Check that inserting a fresh record retires a stale record that claims the
 * same location with a different message ID, and that the retired record is
 * used again when its own message is indexed again.
 */
add_task(async function test_insert_retires_stale_location() {
  const [[folder], setA, setB] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1 },
    { count: 1 },
  ]);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([setA, setB], { augment: true }));
  await waitForGlodaDBFlush();

  const msgFolder = messageInjection.getRealInjectionFolder(folder);
  const glodaFolder = Gloda.getFolderForFolder(msgFolder);
  const [aHdr] = setA.msgHdrs();
  const [bHdr] = setB.msgHdrs();
  const aGlodaId = setA.glodaMessages[0].id;
  const bGlodaId = setB.glodaMessages[0].id;
  const aKey = aHdr.messageKey;
  const bKey = bHdr.messageKey;

  // Park B's record on A's key, so the location is claimed by two records with
  // different message IDs.
  GlodaDatastore.updateMessageKeys([bGlodaId], [aKey]);

  // Remove A's record so that A is inserted as a fresh record.
  await sqlRun("DELETE FROM messages WHERE id = " + aGlodaId);
  await sqlRun("DELETE FROM messagesText WHERE docid = " + aGlodaId);
  aHdr.setUint32Property("gloda-id", 0);
  aHdr.setUint32Property("gloda-dirty", GlodaMsgIndexer.kMessageDirty);
  glodaFolder._ensureFolderDirty();
  GlodaMsgIndexer.indexingSweepNeeded = true;
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([setA]));
  await waitForGlodaDBFlush();

  // B's stale record was retired by A's insert.
  await sqlExpectCount(
    1,
    "SELECT COUNT(*) FROM messages WHERE id = ?1 AND deleted = 1 AND folderID IS NULL",
    bGlodaId
  );
  await sqlExpectCount(
    1,
    "SELECT COUNT(*) FROM messages WHERE headerMessageID = ?1 AND +deleted = 0",
    setA.synMessages[0].messageId
  );

  // Indexing again B brings the retired record back to its real location.
  bHdr.setUint32Property("gloda-dirty", GlodaMsgIndexer.kMessageDirty);
  glodaFolder._ensureFolderDirty();
  GlodaMsgIndexer.indexingSweepNeeded = true;
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([setB]));

  await sqlExpectCount(
    1,
    "SELECT COUNT(*) FROM messages WHERE id = ?1 AND deleted = 0 AND messageKey = ?2",
    bGlodaId,
    bKey
  );
});

/**
 * Check that the compaction pass garbage collector retires a record whose
 * key still exists but now belongs to a different message, while keeping
 * the record of the message that actually lives at that key.
 */
add_task(async function test_compaction_gc_uses_message_identity() {
  const [[folder], setA, setB] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1 },
    { count: 1 },
  ]);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([setA, setB], { augment: true }));
  await waitForGlodaDBFlush();

  const msgFolder = messageInjection.getRealInjectionFolder(folder);
  const glodaFolder = Gloda.getFolderForFolder(msgFolder);
  const aGlodaId = setA.glodaMessages[0].id;
  const bGlodaId = setB.glodaMessages[0].id;
  const [bHdr] = setB.msgHdrs();
  const bKey = bHdr.messageKey;

  // A's record claims B's key so the key exists but no longer belongs to A.
  GlodaDatastore.updateMessageKeys([aGlodaId], [bKey]);

  // Run the compaction pass directly. A physical compaction would be skipped as
  // AsyncCompactFolders ignores folders with no expunged bytes, so no compact
  // job would ever be queued for this folder.
  glodaFolder.compacted = true;
  GlodaIndexer.indexJob(new IndexingJob("folderCompact", glodaFolder.id));
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([], { deleted: [setA] }));
  await waitForGlodaDBFlush();

  // A's record was retired because another message lives at its key.
  await sqlExpectCount(
    1,
    "SELECT COUNT(*) FROM messages WHERE id = ?1 AND deleted = 1 AND folderID IS NULL",
    aGlodaId
  );
  // B's record survived because B still lives at that key.
  await sqlExpectCount(
    1,
    "SELECT COUNT(*) FROM messages WHERE id = ?1 AND deleted = 0 AND messageKey = ?2",
    bGlodaId,
    bKey
  );
});

/**
 * Check that the compaction pass healing links a gloda id only to the header
 * that carries the recorded message ID, and not to whichever message happens to
 * occupy the remembered key after the database swap.
 */
add_task(async function test_healing_verifies_message_identity() {
  const [[folder], setA, setB] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1 },
    { count: 1 },
  ]);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([setA, setB], { augment: true }));
  await waitForGlodaDBFlush();

  const msgFolder = messageInjection.getRealInjectionFolder(folder);
  const glodaFolder = Gloda.getFolderForFolder(msgFolder);
  const aGlodaId = setA.glodaMessages[0].id;
  const bGlodaId = setB.glodaMessages[0].id;
  const aMessageId = setA.synMessages[0].messageId;
  const [aHdr] = setA.msgHdrs();
  const [bHdr] = setB.msgHdrs();
  const aKey = aHdr.messageKey;
  const bKey = bHdr.messageKey;

  // Simulate the database swap wiping the gloda id from A's header.
  aHdr.setUint32Property("gloda-id", 0);

  // The limbo entry remembers a key that now belongs to B.
  PendingCommitTracker._limboCommitsByFolderURI[msgFolder.URI] = [
    { glodaId: aGlodaId, msgKey: bKey, messageId: aMessageId },
  ];
  glodaFolder.compacted = true;
  GlodaIndexer.indexJob(new IndexingJob("folderCompact", glodaFolder.id));
  await waitForGlodaIndexer();
  await waitForGlodaDBFlush();

  // B still keeps its own gloda id.
  Assert.equal(bHdr.getUint32Property("gloda-id"), bGlodaId);
  Assert.equal(aHdr.getUint32Property("gloda-id"), 0);

  // A limbo entry whose key still belongs to the recorded message heals.
  PendingCommitTracker._limboCommitsByFolderURI[msgFolder.URI] = [
    { glodaId: aGlodaId, msgKey: aKey, messageId: aMessageId },
  ];
  glodaFolder.compacted = true;
  GlodaIndexer.indexJob(new IndexingJob("folderCompact", glodaFolder.id));
  await waitForGlodaIndexer();
  await waitForGlodaDBFlush();

  Assert.equal(aHdr.getUint32Property("gloda-id"), aGlodaId);
});
