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

/*
 * Check that nsIMsgDatabase.deleteMessages() does what it says.
 */
add_task(function test_deletion() {
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
        const hdr = db.createNewHdr();
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
      "deleted messages should be gone from db"
    );

    // NOTE: The legacy db deleteMessages() doesn't actually seem to prevent
    // deleted messages from being retrieved by getMsgHdrForKey().
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

add_task(function test_stale_delete_cache() {
  localAccountUtils.loadLocalMailAccount();
  try {
    const folder = localAccountUtils.inboxFolder;
    const db = folder.msgDatabase;
    const staleHdr = db.attachHdr(db.createNewHdr(), false);
    const key = staleHdr.messageKey;

    db.getMsgHdrForKey(key);
    db.forceClosed();
    folder.msgDatabase = null;

    const reopenedDB = folder.msgDatabase;
    const freshHdr = reopenedDB.getMsgHdrForKey(key);
    Assert.notEqual(staleHdr, freshHdr);
    reopenedDB.deleteHeader(staleHdr, null, false, false);
    Assert.equal(reopenedDB.getMsgHdrForKey(key), freshHdr);
    reopenedDB.clearCachedHdrs();
  } finally {
    localAccountUtils.clearAll();
  }
});

/*
 * Check that a listener added during the post-change notification of a
 * property change doesn't make that notification run off the end of the
 * pre-change status array.
 */
add_task(function test_listener_added_during_property_change() {
  localAccountUtils.loadLocalMailAccount();
  try {
    const db = localAccountUtils.inboxFolder.msgDatabase;
    const hdr = db.attachHdr(db.createNewHdr(), false);

    const calls = [];
    const lateListener = {
      QueryInterface: ChromeUtils.generateQI(["nsIDBChangeListener"]),
      onHdrPropertyChanged(hdrChanged, property, preChange) {
        calls.push(["late", property, preChange]);
      },
    };
    const listener = {
      QueryInterface: ChromeUtils.generateQI(["nsIDBChangeListener"]),
      onHdrPropertyChanged(hdrChanged, property, preChange) {
        calls.push(["first", property, preChange]);
        if (!preChange) {
          db.addListener(lateListener);
        }
      },
    };

    for (const set of [
      () => db.setStringPropertyByHdr(hdr, "stringprop", "value"),
      () => db.setUint32PropertyByHdr(hdr, "uint32prop", 1),
    ]) {
      db.addListener(listener);
      calls.length = 0;
      set();
      db.removeListener(listener);
      db.removeListener(lateListener);
      Assert.deepEqual(
        calls.map(([who, , preChange]) => [who, preChange]),
        [
          ["first", true],
          ["first", false],
        ],
        "a listener added after the pre-change call should not get the post-change call"
      );
    }
  } finally {
    localAccountUtils.clearAll();
  }
});
