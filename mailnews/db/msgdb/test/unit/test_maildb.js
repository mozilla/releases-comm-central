/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for msg database functions.
 */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

function test_db_open() {
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
}

/**
 * A workout for the various functions supporting UID queries.
 * While the UID functions are designed to support IMAP, there
 * is no IMAP involvement, so we can just test them using a local
 * folder, which is much simpler.
 */
function test_uid_functions() {
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
}

add_task(test_db_open);
add_task(test_uid_functions);
