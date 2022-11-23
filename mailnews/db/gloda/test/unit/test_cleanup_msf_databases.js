/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* This file tests whether we cleanup after ourselves, msf-wise.
 * This is very much a white-box test; we want to make sure that all the parts
 *  of the mechanism are actually doing what we think they should be doing.
 *
 * This test should stand on its own!  It should not be lumped together with
 *  other tests unless you take care to fix all our meddling.
 */

var {
  assertExpectedMessagesIndexed,
  glodaTestHelperInitialize,
  waitForGlodaIndexer,
} = ChromeUtils.import("resource://testing-common/gloda/GlodaTestHelper.jsm");
var { GlodaDatastore } = ChromeUtils.import(
  "resource:///modules/gloda/GlodaDatastore.jsm"
);
var { GlodaFolder } = ChromeUtils.import(
  "resource:///modules/gloda/GlodaDataModel.jsm"
);
var { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { MessageInjection } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageInjection.jsm"
);

var messageInjection;

add_task(function setupTest() {
  let msgGen = new MessageGenerator();
  messageInjection = new MessageInjection({ mode: "local" }, msgGen);
  glodaTestHelperInitialize(messageInjection);
});

/**
 * Meddle with internals of live folder tracking, create a synthetic message and
 *  index it. We do the actual work involving the headers and folders in
 *  poke_and_verify_msf_closure.
 */
add_task(async function test_msf_closure() {
  // Before doing anything, the indexer should not be tracking any live folders.
  Assert.ok(!GlodaDatastore._folderCleanupActive);
  Assert.equal(0, getLiveFolderCount());

  // Make the datastore's folder cleanup timer never be at risk of firing.
  GlodaDatastore._folderCleanupTimerInterval = 1000000000;
  // Set the acceptably old threshold so it will never age out.
  GlodaFolder.prototype.ACCEPTABLY_OLD_THRESHOLD = 1000000000;

  // Create a synthetic message.
  let [, msgSet] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1 },
  ]);
  await waitForGlodaIndexer();
  Assert.ok(
    ...assertExpectedMessagesIndexed([msgSet], {
      verifier: poke_and_verify_msf_closure,
    })
  );
});

/**
 * Grab the message header, see live folder, cleanup live folders, make sure
 *  live folder stayed live, change constants so folder can die, cleanup live
 *  folders, make sure folder died.
 *
 * @param aSynthMessage The synthetic message we indexed.
 * @param aGlodaMessage Its exciting gloda representation
 */
function poke_and_verify_msf_closure(aSynthMessage, aGlodaMessage) {
  // Get the nsIMsgDBHdr.
  let header = aGlodaMessage.folderMessage;
  // If we don't have a header, this test is unlikely to work.
  Assert.ok(header !== null);

  // We need a reference to the glodaFolder.
  let glodaFolder = aGlodaMessage.folder;

  // -- Check that everyone is tracking things correctly.
  // The message's folder should be holding an XPCOM reference to the folder.
  Assert.ok(glodaFolder._xpcomFolder !== null);
  // The cleanup timer should now be alive.
  Assert.ok(GlodaDatastore._folderCleanupActive);
  // The live folder count should be one.
  Assert.equal(1, getLiveFolderCount());

  // -- Simulate a timer cleanup firing.
  GlodaDatastore._performFolderCleanup();

  // -- Verify that things are still as they were before the cleanup firing.
  // The message's folder should be holding an XPCOM reference to the folder.
  Assert.ok(glodaFolder._xpcomFolder !== null);
  // The cleanup timer should now be alive.
  Assert.ok(GlodaDatastore._folderCleanupActive);
  // Live folder count should be one.
  Assert.equal(1, getLiveFolderCount());

  // -- Change oldness constant so that it cannot help but be true.
  // (The goal is to avoid getting tricked by the granularity of the timer
  //  updates, as well as to make sure our logic is right by skewing the
  //  constant wildly, so that if our logic was backwards, we would fail.)
  // Put the threshold 1000 seconds in the future; the event must be older than
  //  the future, for obvious reasons.
  GlodaFolder.prototype.ACCEPTABLY_OLD_THRESHOLD = -1000000;

  // -- Simulate a timer cleanup firing.
  GlodaDatastore._performFolderCleanup();

  // -- Verify that cleanup has occurred and the cleanup mechanism shutdown.
  // The message's folder should no longer be holding an XPCOM reference.
  Assert.ok(glodaFolder._xpcomFolder === null);
  // The cleanup timer should now be dead.
  Assert.ok(!GlodaDatastore._folderCleanupActive);
  // Live folder count should be zero.
  Assert.equal(0, getLiveFolderCount());
}

/**
 * @returns {number} the number of live gloda folders tracked by
 *     GlodaDatastore._liveGlodaFolders.
 */
function getLiveFolderCount() {
  return Object.keys(GlodaDatastore._liveGlodaFolders).length;
}
