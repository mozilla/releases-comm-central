/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for msg database functions.
 */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

add_task(function test_db_open() {
  localAccountUtils.loadLocalMailAccount();

  const dbService = Cc["@mozilla.org/msgDatabase/msgDBService;1"].getService(
    Ci.nsIMsgDBService
  );
  // Get the root folder
  const root = localAccountUtils.incomingServer.rootFolder;
  root.createSubfolder("dbTest", null);
  const testFolder = root.getChildNamed("dbTest");
  let db = dbService.openFolderDB(testFolder, true);
  Assert.notEqual(db, null);
  db.dBFolderInfo.highWater = 10;
  db.close(true);
  db = dbService.openFolderDB(testFolder, true);
  Assert.notEqual(db, null);
  Assert.equal(db.dBFolderInfo.highWater, 10);
  db.dBFolderInfo.onKeyAdded(15);
  Assert.equal(db.dBFolderInfo.highWater, 15);
  db.close(true);
  db.forceClosed();
  db = null;
  localAccountUtils.clearAll();
});

/**
 * A workout for the various functions supporting UID queries.
 * While the UID functions are designed to support IMAP, there
 * is no IMAP involvement, so we can just test them using a local
 * folder, which is much simpler.
 */
add_task(function test_uid_functions() {
  // Set up an account with some messages in inbox.
  localAccountUtils.loadLocalMailAccount();
  const inbox = localAccountUtils.inboxFolder;
  const db = inbox.msgDatabase;

  // Add messages to inbox.
  const generator = new MessageGenerator();
  inbox.addMessageBatch(
    generator
      .makeMessages({ count: 100 })
      .map(message => message.toMessageString())
  );

  // Pick an arbitrary bunch of messages and pick some arbitrary UIDs
  // for testing.
  const keys = [];
  const uids = [];
  const allKeys = db.listAllKeys();
  for (let i = 10; i < 20; i++) {
    keys.push(allKeys[i]);
    uids.push(5000 + i); // Ensure obviously-differing UID.
  }
  const nsMsgKey_None = 0xffffffff; // Grr.
  const missingUID = 10000; // A UID we know isn't used.
  const missingKey = 9999; // A key which definitely isn't in DB.
  const noUIDKey = allKeys[0]; // A valid key, but with no UID assigned.

  // Make sure we can't get non-existant messages.
  Assert.throws(function () {
    db.getMsgHdrForKey(missingKey);
  }, /NS_ERROR/);

  // Assign the UIDs we picked.
  for (let i = 0; i < keys.length; i++) {
    const msg = db.getMsgHdrForKey(keys[i]);
    msg.uidOnServer = uids[i];
    Assert.equal(uids[i], msg.uidOnServer);
  }

  // Make sure getMsgKeysForUIDs() does what it says on the tin.
  Assert.deepEqual(
    db.getMsgKeysForUIDs(uids),
    keys,
    "getMsgKeysForUIDs() should find expected keys"
  );
  Assert.deepEqual(
    db.getMsgKeysForUIDs([]),
    [],
    "getMsgKeysForUIDs() shouldn't choke on empty arrays"
  );
  Assert.deepEqual(
    db.getMsgKeysForUIDs([0]),
    [nsMsgKey_None],
    "getMsgKeysForUIDs() should return nsMsgKey_None for UID 0"
  );
  Assert.deepEqual(
    db.getMsgKeysForUIDs([missingUID]),
    [nsMsgKey_None],
    "getMsgKeysForUIDs() should return nsMsgKey_None for invalid UIDs"
  );
  Assert.deepEqual(
    db.getMsgKeysForUIDs([0, uids[5], missingUID]),
    [nsMsgKey_None, keys[5], nsMsgKey_None],
    "getMsgKeysForUIDs() should handle combined edge cases"
  );

  // Check getMsgUIDsForKeys().
  Assert.deepEqual(
    db.getMsgUIDsForKeys(keys),
    uids,
    "getMsgUIDsForKeys() should find expected UIDs for keys"
  );
  Assert.deepEqual(
    db.getMsgUIDsForKeys([]),
    [],
    "getMsgUIDsForKeys() shouldn't choke on empty arrays"
  );
  Assert.deepEqual(
    db.getMsgUIDsForKeys([noUIDKey]),
    [0],
    "getMsgUIDsForKeys() should return 0 for valid message with unset .uidOnServer"
  );
  Assert.deepEqual(
    db.getMsgUIDsForKeys([nsMsgKey_None]),
    [0],
    "getMsgUIDsForKeys() should return 0 UID for nsMsgKey_None"
  );
  Assert.throws(
    () => db.getMsgUIDsForKeys([missingKey]),
    /NS_ERROR/,
    "getMsgUIDsForKeys() should fail if key is missing from DB"
  );
  Assert.throws(
    () => db.getMsgUIDsForKeys([keys[5], missingKey, nsMsgKey_None]),
    /NS_ERROR/,
    "getMsgUIDsForKeys() should fail upon error, even if some keys are found"
  );

  // Check ContainsUID().
  for (let i = 0; i < keys.length; i++) {
    Assert.equal(db.containsUID(uids[i]), true);
  }
  Assert.equal(db.containsUID(missingUID), false);
  Assert.equal(db.containsUID(0), false);

  // Check getMsgHdrForUID().
  for (let i = 0; i < keys.length; i++) {
    Assert.equal(db.getMsgHdrForUID(uids[i]).messageKey, keys[i]);
  }
  Assert.throws(
    () => db.getMsgHdrForUID([0]),
    /NS_ERROR/,
    "getMsgHdrForUID() should fail for 0 UID"
  );
  Assert.throws(
    () => db.getMsgHdrForUID([missingUID]),
    /NS_ERROR/,
    "getMsgHdrForUID() should fail if uid not found"
  );

  // Clean up.
  localAccountUtils.clearAll();
});

/*
 * Check that nsIMsgDatabase.deleteMessages() does what it says.
 */
add_task(function test_deletion() {
  const nsMsgKey_None = 0xffffffff; // Arrrrg!
  localAccountUtils.loadLocalMailAccount();
  try {
    const inbox = localAccountUtils.inboxFolder;
    const db = inbox.msgDatabase;

    Assert.equal(db.listAllKeys().length, 0, "db should start out empty");

    // Add a bunch of msgHdrs to the db.
    const keep = []; // Ones we'll keep.
    const doomed = []; // Ones we'll delete.
    {
      const generator = new MessageGenerator();
      for (let uniq = 0; uniq < 30; ++uniq) {
        const hdr = db.createNewHdr(nsMsgKey_None);
        hdr.messageId = generator.makeMessageId(uniq);
        hdr.author = generator.makeMailAddress(uniq * 2);
        hdr.recipients = generator.makeMailAddress(uniq * 2 + 1);
        hdr.subject = generator.makeSubject(uniq);
        hdr.date = generator.makeDate(uniq);
        const live = db.attachHdr(hdr, false);
        if (uniq % 3 == 0) {
          doomed.push(live.messageKey);
        } else {
          keep.push(live.messageKey);
        }
      }
    }

    // Make sure they were all added.
    Assert.deepEqual(
      db.listAllKeys().toSorted(),
      [...keep, ...doomed].toSorted(),
      "db should have all messages"
    );

    // Delete a selection and check they're gone.
    db.deleteMessages(doomed, null);
    Assert.deepEqual(
      db.listAllKeys().toSorted(),
      keep.toSorted(),
      "deleted messsages should be gone from db"
    );

    // NOTE: The legacy db deleteMessages() doesn't actually seem to prevent
    // deleted messages from being retreived by getMsgHdrForKey().
    // Bug 1971647.
    // This fails on legacy db (but is fine when run on Panorama db):
    /*
    for (const gone of doomed) {
      Assert.throws(
        () => db.getMsgHdrForKey(gone),
        /NS_ERROR_ILLEGAL_VALUE/,
        "deleted message should be inaccessible"
      );
    }
    */
  } finally {
    localAccountUtils.clearAll();
  }
});
