/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This file tests the folder indexing logic of Gloda._worker_folderIndex in
 *  the greater context of the sweep indexing mechanism in a whitebox fashion.
 *
 * Automated indexing is suppressed for the duration of this file.
 *
 * In order to test the phases of the logic we inject failures into
 *  GlodaIndexer._indexerGetEnumerator with a wrapper to control how far
 *  indexing gets.  We also clobber or wrap other functions as needed.
 */

var { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { MessageInjection } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageInjection.jsm"
);
var { glodaTestHelperInitialize } = ChromeUtils.import(
  "resource://testing-common/gloda/GlodaTestHelper.jsm"
);
var { configureGlodaIndexing } = ChromeUtils.import(
  "resource://testing-common/gloda/GlodaTestHelperFunctions.jsm"
);
var { sqlExpectCount } = ChromeUtils.import(
  "resource://testing-common/gloda/GlodaQueryHelper.jsm"
);
var { Gloda } = ChromeUtils.import("resource:///modules/gloda/GlodaPublic.jsm");
var { GlodaIndexer } = ChromeUtils.import(
  "resource:///modules/gloda/GlodaIndexer.jsm"
);
var { GlodaMsgIndexer } = ChromeUtils.import(
  "resource:///modules/gloda/IndexMsg.jsm"
);

var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

/**
 * We want to stop the GlodaMsgIndexer._indexerGetEnumerator after a
 * set amount of folder indexing.
 */
const ENUMERATOR_SIGNAL_WORD = "STOP Me!";
/**
 * How many more enumerations before we should throw; 0 means don't throw.
 */
var stop_enumeration_after = 0;
/**
 * We hide the error in the promise chain. But we do have to know if it happens
 * at another cycle.
 */
var error_is_thrown = false;
/**
 * Inject GlodaMsgIndexer._indexerGetEnumerator with our test indexerGetEnumerator.
 */
GlodaMsgIndexer._original_indexerGetEnumerator =
  GlodaMsgIndexer._indexerGetEnumerator;
/**
 * Wrapper for GlodaMsgIndexer._indexerGetEnumerator to cause explosions.
 */
GlodaMsgIndexer._indexerGetEnumerator = function (...aArgs) {
  if (stop_enumeration_after && !--stop_enumeration_after) {
    error_is_thrown = true;
    throw new Error(ENUMERATOR_SIGNAL_WORD);
  }

  return GlodaMsgIndexer._original_indexerGetEnumerator(...aArgs);
};

var messageInjection;

add_setup(function () {
  const msgGen = new MessageGenerator();
  messageInjection = new MessageInjection({ mode: "local" }, msgGen);
  // We do not want the event-driven indexer crimping our style.
  configureGlodaIndexing({ event: false });
  glodaTestHelperInitialize(messageInjection);
});

/**
 * The value itself does not matter; it just needs to be present and be in a
 *  certain range for our logic testing.
 */
var arbitraryGlodaId = 4096;

/**
 * When we enter a filthy folder we should be marking all the messages as filthy
 *  that have gloda-id's and committing.
 */
add_task(async function test_propagate_filthy_from_folder_to_messages() {
  // Mark the folder as filthy.
  const [[folder], msgSet] = await messageInjection.makeFoldersWithSets(1, [
    { count: 3 },
  ]);
  const glodaFolder = Gloda.getFolderForFolder(folder);
  glodaFolder._dirtyStatus = glodaFolder.kFolderFilthy;

  // Mark each header with a gloda-id so they can get marked filthy.
  for (const msgHdr of msgSet.msgHdrs()) {
    msgHdr.setUint32Property("gloda-id", arbitraryGlodaId);
  }

  // Force the database to see it as filthy so we can verify it changes.
  glodaFolder._datastore.updateFolderDirtyStatus(glodaFolder);
  await sqlExpectCount(
    1,
    "SELECT COUNT(*) FROM folderLocations WHERE id = ? " +
      "AND dirtyStatus = ?",
    glodaFolder.id,
    glodaFolder.kFolderFilthy
  );

  // Index the folder, aborting at the second get enumerator request.
  stop_enumeration_after = 2;

  await spin_folder_indexer(folder);

  // The folder should only be dirty.
  Assert.equal(glodaFolder.dirtyStatus, glodaFolder.kFolderDirty);
  // Make sure the database sees it as dirty.
  await sqlExpectCount(
    1,
    "SELECT COUNT(*) FROM folderLocations WHERE id = ? " +
      "AND dirtyStatus = ?",
    glodaFolder.id,
    glodaFolder.kFolderDirty
  );

  // The messages should be filthy per the headers.
  //  We force a commit of the database.
  for (const msgHdr of msgSet.msgHdrs()) {
    Assert.equal(
      msgHdr.getUint32Property("gloda-dirty"),
      GlodaMsgIndexer.kMessageFilthy
    );
  }
});

/**
 * Make sure our counting pass and our indexing passes gets it right.  We test
 *  with 0,1,2 messages matching.
 */
add_task(async function test_count_pass() {
  const [[folder], msgSet] = await messageInjection.makeFoldersWithSets(1, [
    { count: 2 },
  ]);

  const hdrs = msgSet.msgHdrList;

  // - (clean) messages with gloda-id's do not get indexed
  // Nothing is indexed at this point, so all 2.
  error_is_thrown = false;
  stop_enumeration_after = 2;
  await spin_folder_indexer(folder, 2);

  // Pretend the first is indexed, leaving a count of 1.
  hdrs[0].setUint32Property("gloda-id", arbitraryGlodaId);
  error_is_thrown = false;
  stop_enumeration_after = 2;
  await spin_folder_indexer(folder, 1);

  // Pretend both are indexed, count of 0.
  hdrs[1].setUint32Property("gloda-id", arbitraryGlodaId);
  // No explosion should happen since we should never get to the second
  //  enumerator.
  error_is_thrown = false;
  await spin_folder_indexer(folder, 0);

  // - Dirty messages get indexed.
  hdrs[0].setUint32Property("gloda-dirty", GlodaMsgIndexer.kMessageDirty);
  stop_enumeration_after = 2;
  error_is_thrown = false;
  await spin_folder_indexer(folder, 1);

  hdrs[1].setUint32Property("gloda-dirty", GlodaMsgIndexer.kMessageDirty);
  stop_enumeration_after = 2;
  error_is_thrown = false;
  await spin_folder_indexer(folder, 2);
});

/**
 * Create a folder indexing job for the given injection folder handle and
 * run it until completion.
 *
 * The folder indexer will continue running on its own if we dont throw an Error in the
 * GlodaMsgIndexer._indexerGetEnumerator
 */
async function spin_folder_indexer(aFolderHandle, aExpectedJobGoal) {
  const msgFolder = messageInjection.getRealInjectionFolder(aFolderHandle);

  // Cheat and use indexFolder to build the job for us.
  GlodaMsgIndexer.indexFolder(msgFolder);
  // Steal that job.
  const job = GlodaIndexer._indexQueue.pop();
  GlodaIndexer._indexingJobGoal--;

  // Create the callbackHandle.
  const callbackHandle = new CallbackHandle();
  // Create the worker.
  const worker = GlodaMsgIndexer._worker_folderIndex(job, callbackHandle);
  try {
    callbackHandle.pushAndGo(worker, null);
    await Promise.race([
      callbackHandle.promise,
      TestUtils.waitForCondition(() => {
        return error_is_thrown;
      }),
    ]);
  } catch (ex) {
    do_throw(ex);
  }

  if (aExpectedJobGoal !== undefined) {
    Assert.equal(job.goal, aExpectedJobGoal);
  }
}

/**
 * Implements GlodaIndexer._callbackHandle's interface adapted to our async
 *  test driver.  This allows us to run indexing workers directly in tests
 *  or support code.
 *
 * We do not do anything with the context stack or recovery.  Use the actual
 *  indexer callback handler for that!
 *
 * Actually, we do very little at all right now.  This will fill out as needs
 *  arise.
 */
class CallbackHandle {
  constructor() {
    this._promise = new Promise(resolve => {
      this._resolve = resolve;
    });
  }

  pushAndGo(aIterator, aContext) {
    this.glodaWorkerAdapter(aIterator, this._resolve).catch(reason => {
      if (!reason.message.match(ENUMERATOR_SIGNAL_WORD)) {
        throw reason;
      }
    });
  }

  async glodaWorkerAdapter(aIter, resolve) {
    while (!error_is_thrown) {
      switch (aIter.next().value) {
        case GlodaConstants.kWorkSync:
          break;
        case GlodaConstants.kWorkDone:
        case GlodaConstants.kWorkDoneWithResult:
          resolve();
          return;
        default:
          break;
      }
    }
  }
  get promise() {
    return this._promise;
  }
}
