/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that gloda does the right things in terms of compaction.  Major cases:
 *
 * - Compaction occurs while we are in the process of indexing a folder.  We
 *    want to make sure we stop indexing cleanly
 *
 * - A folder that we have already indexed gets compacted.  We want to make sure
 *    that we update the message keys for all involved.  This means verifying
 *    that both the on-disk representations and in-memory representations are
 *    correct.
 *
 * - Make sure that an indexing sweep performs a compaction pass if we kill the
 *    compaction job automatically scheduled by the conclusion of the
 *    compaction.  (Simulating the user quitting before all compactions have
 *    been processed.)
 *
 * - Moves/deletes that happen after a compaction but before we process the
 *    compaction generate a special type of edge case that we need to check.
 *
 * There is also a less interesting case:
 *
 * - Make sure that the indexer does not try and start indexing a folder that is
 *    in the process of being compacted.
 */

var {
  assertExpectedMessagesIndexed,
  glodaTestHelperInitialize,
  waitForGlodaIndexer,
} = ChromeUtils.import("resource://testing-common/gloda/GlodaTestHelper.jsm");
var {
  configureGlodaIndexing,
  resumeFromSimulatedHang,
  waitForGlodaDBFlush,
  waitForIndexingHang,
} = ChromeUtils.import(
  "resource://testing-common/gloda/GlodaTestHelperFunctions.jsm"
);
var { Gloda } = ChromeUtils.import("resource:///modules/gloda/GlodaPublic.jsm");
var { GlodaIndexer } = ChromeUtils.import(
  "resource:///modules/gloda/GlodaIndexer.jsm"
);
var { GlodaMsgIndexer } = ChromeUtils.import(
  "resource:///modules/gloda/IndexMsg.jsm"
);
var { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { MessageInjection } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageInjection.jsm"
);
var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

var msgGen;
var messageInjection;

add_setup(function () {
  /*
   * All the rest of the gloda tests (should) work with maildir, but this test
   * only works/makes sense with mbox, so force it to always use mbox.  This
   * allows developers to manually change the default to maildir and have the
   * gloda tests run with that.
   */
  Services.prefs.setCharPref(
    "mail.serverDefaultStoreContractID",
    "@mozilla.org/msgstore/berkeleystore;1"
  );
  msgGen = new MessageGenerator();
  messageInjection = new MessageInjection({ mode: "local" }, msgGen);
  glodaTestHelperInitialize(messageInjection);
});

add_task(async function compaction_indexing_pass_none_pending_commit() {
  await compaction_indexing_pass({
    name: "none pending commit",
    forceCommit: true,
  });
});
add_task(async function compaction_indexing_pass_all_pending_commit() {
  await compaction_indexing_pass({
    name: "all pending commit",
    forceCommit: false,
  });
});

/**
 * Make sure that an indexing sweep performs a compaction pass if we kill the
 *  compaction job automatically scheduled by the conclusion of the compaction.
 *  (Simulating the user quitting before all compactions have been processed.)
 */
add_task(async function test_sweep_performs_compaction() {
  const [[folder], moveSet, staySet] =
    await messageInjection.makeFoldersWithSets(1, [{ count: 1 }, { count: 1 }]);

  await waitForGlodaIndexer();
  Assert.ok(
    ...assertExpectedMessagesIndexed([moveSet, staySet], { augment: true })
  );

  // Move the message to another folder.
  const otherFolder = await messageInjection.makeEmptyFolder();
  await messageInjection.moveMessages(moveSet, otherFolder);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([moveSet]));

  // Disable event-driven indexing so there is no way the compaction job can
  //  get worked.
  configureGlodaIndexing({ event: false });

  // Compact.
  const msgFolder = messageInjection.getRealInjectionFolder(folder);
  dump(
    "Triggering compaction " +
      "Folder: " +
      msgFolder.name +
      " Gloda folder: " +
      Gloda.getFolderForFolder(msgFolder) +
      "\n"
  );
  const urlListener = new PromiseTestUtils.PromiseUrlListener();
  msgFolder.compact(urlListener, null);
  await urlListener.promise;

  // Erase the compaction job.
  GlodaIndexer.purgeJobsUsingFilter(() => true);

  // Make sure the folder is marked compacted.
  const glodaFolder = Gloda.getFolderForFolder(msgFolder);
  Assert.ok(glodaFolder.compacted);

  // Re-enable indexing and fire up an indexing pass.
  configureGlodaIndexing({ event: true });
  GlodaMsgIndexer.indexingSweepNeeded = true;
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([]));

  // Make sure the compaction happened.
  verify_message_keys(staySet);
});

/**
 * Make sure that if we compact a folder then move messages out of it and/or
 *  delete messages from it before its compaction pass happens that the
 *  compaction pass properly marks the messages deleted.
 */
add_task(
  async function test_moves_and_deletions_on_compacted_folder_edge_case() {
    const [[folder], compactMoveSet, moveSet, delSet, staySet] =
      await messageInjection.makeFoldersWithSets(1, [
        { count: 1 },
        { count: 1 },
        { count: 1 },
        { count: 1 },
      ]);

    await waitForGlodaIndexer();
    Assert.ok(
      ...assertExpectedMessagesIndexed(
        [compactMoveSet, moveSet, delSet, staySet],
        {
          augment: true,
        }
      )
    );

    // Move the message to another folder.
    const otherFolder = await messageInjection.makeEmptyFolder();
    await messageInjection.moveMessages(compactMoveSet, otherFolder);
    await waitForGlodaIndexer();
    Assert.ok(...assertExpectedMessagesIndexed([compactMoveSet]));

    // Disable indexing because we don't want to process the compaction.
    configureGlodaIndexing({ event: false });

    // Compact the folder.
    const msgFolder = messageInjection.getRealInjectionFolder(folder);
    dump(
      "Triggering compaction " +
        "Folder: " +
        msgFolder.name +
        " Gloda folder: " +
        Gloda.getFolderForFolder(msgFolder) +
        "\n"
    );
    const urlListener = new PromiseTestUtils.PromiseUrlListener();
    msgFolder.compact(urlListener, null);
    await urlListener.promise;

    // Erase the compaction job.
    GlodaIndexer.purgeJobsUsingFilter(() => true);

    // - Delete
    // Because of the compaction, the PendingCommitTracker forgot that the message
    //  we are deleting got indexed; we will receive no event.
    await MessageInjection.deleteMessages(delSet);

    // - Move
    // Same deal on the move, except that it will try and trigger event-based
    //  indexing in the target folder...
    await messageInjection.moveMessages(moveSet, otherFolder);
    // Kill the event-based indexing job of the target; we want the indexing sweep
    //  to see it as a move.
    dump("killing all indexing jobs\n");
    GlodaIndexer.purgeJobsUsingFilter(() => true);

    // - Indexing pass
    // Re-enable indexing so we can do a sweep.
    configureGlodaIndexing({ event: true });

    // This will trigger compaction (per the previous unit test) which should mark
    //  moveSet and delSet as deleted.  Then it should happen in to the next
    //  folder and add moveSet again...
    dump("triggering indexing sweep\n");
    GlodaMsgIndexer.indexingSweepNeeded = true;
    await waitForGlodaIndexer();
    Assert.ok(
      ...assertExpectedMessagesIndexed([moveSet], {
        deleted: [moveSet, delSet],
      })
    );

    // Sanity check the compaction for giggles.
    verify_message_keys(staySet);
  }
);

/**
 * Induce a compaction while we are in the middle of indexing.  Make sure we
 *  clean up and that the folder ends
 *
 * Note that in order for compaction to happen there has to be something for
 *  compaction to do, so our prep involves moving a message to another folder.
 *  (Deletion actually produces more legwork for gloda whereas a local move is
 *  almost entirely free.)
 */
add_task(async function test_compaction_interrupting_indexing() {
  // Create a folder with a message inside.
  const [[folder], compactionFodderSet] =
    await messageInjection.makeFoldersWithSets(1, [{ count: 1 }]);

  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([compactionFodderSet]));

  // Move that message to another folder.
  const otherFolder = await messageInjection.makeEmptyFolder();
  await messageInjection.moveMessages(compactionFodderSet, otherFolder);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([compactionFodderSet]));

  // Configure the gloda indexer to hang while streaming the message.
  configureGlodaIndexing({ hangWhile: "streaming" });

  // Create a folder with a message inside.
  const [msgSet] = await messageInjection.makeNewSetsInFolders(
    [folder],
    [{ count: 1 }]
  );

  await waitForIndexingHang();

  // Compact! This should kill the job and because of the compaction; no other
  //  reason should be able to do this.
  const msgFolder = messageInjection.getRealInjectionFolder(folder);
  const urlListener = new PromiseTestUtils.PromiseUrlListener();
  msgFolder.compact(urlListener, null);
  await urlListener.promise;

  // Reset indexing to not hang.
  configureGlodaIndexing({});

  // Sorta get the event chain going again.
  await resumeFromSimulatedHang(true);

  // Because the folder was dirty it should actually end up getting indexed,
  //  so in the end the message will get indexed.
  // Also, make sure a cleanup was observed.
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet], { cleanedUp: 1 }));
});

/**
 *
 */
add_task(async function test_do_not_enter_compacting_folders() {
  // Turn off indexing.
  configureGlodaIndexing({ event: false });

  // Create a folder with a message inside.
  const [[folder]] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1 },
  ]);

  // Lie and claim we are compacting that folder.
  const glodaFolder = Gloda.getFolderForFolder(
    messageInjection.getRealInjectionFolder(folder)
  );
  glodaFolder.compacting = true;

  // Now try and force ourselves to index that folder and its message.
  // Turn back on indexing.
  configureGlodaIndexing({ event: true });

  // Verify that the indexer completes without having indexed anything.
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([]));
});

/**
 * Verify that the message keys match between the message headers and the
 *  (augmented on) gloda messages that correspond to the headers.
 */
function verify_message_keys(aSynSet) {
  let iMsg = 0;
  for (const msgHdr of aSynSet.msgHdrs()) {
    const glodaMsg = aSynSet.glodaMessages[iMsg++];
    if (msgHdr.messageKey != glodaMsg.messageKey) {
      throw new Error(
        "Message header " +
          msgHdr +
          " should have message key " +
          msgHdr.messageKey +
          " but has key " +
          glodaMsg.messageKey +
          " per gloda msg " +
          glodaMsg
      );
    }
  }
  dump("verified message keys after compaction\n");
}

/**
 * Compact a folder that we were not indexing.  Make sure gloda's representations
 *  get updated to the new message keys.
 *
 * This is parameterized because the logic has special cases to deal with
 *  messages that were pending commit that got blown away.
 */
async function compaction_indexing_pass(aParam) {
  // Create 5 messages.  We will move just the third message so the first two
  //  message keep their keys and the last two change.  (We want 2 for both
  //  cases to avoid edge cases.)
  const [[folder], sameSet, moveSet, shiftSet] =
    await messageInjection.makeFoldersWithSets(1, [
      { count: 2 },
      { count: 1 },
      { count: 2 },
    ]);

  await waitForGlodaIndexer();
  Assert.ok(
    ...assertExpectedMessagesIndexed([sameSet, moveSet, shiftSet], {
      augment: true,
    })
  );

  // Move the message to another folder.
  const otherFolder = await messageInjection.makeEmptyFolder();
  await messageInjection.moveMessages(moveSet, otherFolder);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([moveSet]));

  if (aParam.forceCommit) {
    await waitForGlodaDBFlush();
  }

  // Compact the folder.
  const msgFolder = messageInjection.getRealInjectionFolder(folder);
  dump(
    "Triggering compaction " +
      "Folder: " +
      msgFolder.name +
      " Gloda folder: " +
      Gloda.getFolderForFolder(msgFolder) +
      "\n"
  );

  const urlListener = new PromiseTestUtils.PromiseUrlListener();
  msgFolder.compact(urlListener, null);
  await urlListener.promise;
  // Wait for the compaction job to complete.
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([]));

  verify_message_keys(sameSet);
  verify_message_keys(shiftSet);
}
