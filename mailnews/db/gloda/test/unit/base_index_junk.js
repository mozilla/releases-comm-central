/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test indexing in the face of junk classification and junk folders.  It is
 *  gloda policy not to index junk mail.
 *
 * A similar test that moving things to the trash folder is deletion happens in
 *  base_index_messages.js.
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { Gloda } = ChromeUtils.importESModule(
  "resource:///modules/gloda/GlodaPublic.sys.mjs"
);
var { GlodaConstants } = ChromeUtils.importESModule(
  "resource:///modules/gloda/GlodaConstants.sys.mjs"
);
var { GlodaMsgIndexer } = ChromeUtils.importESModule(
  "resource:///modules/gloda/IndexMsg.sys.mjs"
);
var { queryExpect } = ChromeUtils.importESModule(
  "resource://testing-common/gloda/GlodaQueryHelper.sys.mjs"
);
var { assertExpectedMessagesIndexed, waitForGlodaIndexer } =
  ChromeUtils.importESModule(
    "resource://testing-common/gloda/GlodaTestHelper.sys.mjs"
  );
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);

var messageInjection;

const SPAM_BODY = { body: "superspam superspam superspam eevil eevil eevil" };
const HAM_BODY = { body: "ham ham ham nice nice nice happy happy happy" };

/**
 * Make SPAM_BODY be known as spammy and HAM_BODY be known as hammy.
 */
async function setup_spam_filter() {
  const [, spamSet, hamSet] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1, body: SPAM_BODY },
    { count: 1, body: HAM_BODY },
  ]);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([spamSet, hamSet], []));
  let promiseResolve;
  let promise = new Promise(resolve => {
    promiseResolve = resolve;
  });
  const junkListener = {
    onMessageClassified() {
      promiseResolve();
    },
  };

  // Ham.
  dump(`Marking message: ${hamSet.getMsgHdr(0)} as ham.`);
  MailServices.junk.setMessageClassification(
    hamSet.getMsgURI(0),
    null, // no old classification
    MailServices.junk.GOOD,
    null,
    junkListener
  );
  await promise;

  // Reset promise for junkListener.
  promise = new Promise(resolve => {
    promiseResolve = resolve;
  });

  // Spam.
  dump(`Marking message: ${spamSet.getMsgHdr(0)} as spam.`);
  MailServices.junk.setMessageClassification(
    spamSet.getMsgURI(0),
    null, // No old classification.
    MailServices.junk.JUNK,
    null,
    junkListener
  );
  await promise;
}

/**
 * Because gloda defers indexing until after junk, we should never index a
 *  message that gets marked as junk.  So if we inject a message that will
 *  definitely be marked as junk (thanks to use of terms that guarantee it),
 *  the indexer should never index it.
 *
 * ONLY THIS TEST ACTUALLY RELIES ON THE BAYESIAN CLASSIFIER.
 */
async function test_never_indexes_a_message_marked_as_junk() {
  // Event-driven does not index junk.

  // Make a message that will be marked as junk from the get-go.
  await messageInjection.makeFoldersWithSets(1, [
    { count: 1, body: SPAM_BODY },
  ]);
  // Since the message is junk, gloda should not index it!
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([]));

  // Folder sweep does not index junk.
  GlodaMsgIndexer.indexingSweepNeeded = true;
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([]));
}

/**
 * Reset the training data so the bayesian classifier stops doing things.
 */
function reset_spam_filter() {
  MailServices.junk.resetTrainingData();
}

/**
 * Marking a message as junk is equivalent to deleting the message, un-mark it
 *  and it should go back to being a happy message (with the same gloda-id!).
 *
 * THIS TEST DOES NOT RELY ON THE BAYESIAN CLASSIFIER.
 */

async function test_mark_as_junk_is_deletion_mark_as_not_junk_is_exposure() {
  // Mark as junk is deletion.
  // Create a message; it should get indexed.
  const [, msgSet] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1 },
  ]);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet], { augment: true }));
  const glodaId = msgSet.glodaMessages[0].id;
  // Mark it as junk.
  msgSet.setJunk(true);
  // It will appear deleted after the event.
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([], { deleted: [msgSet] }));
  // Mark as non-junk gets indexed.
  msgSet.setJunk(false);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet], { augment: true }));
  // We should have reused the existing gloda message so it should keep the id.
  Assert.equal(glodaId, msgSet.glodaMessages[0].id);
}

/**
 * Moving a message to the junk folder is equivalent to deletion.  Gloda does
 *  not index junk folders at all, which is why this is an important and
 *  independent determination from marking a message directly as junk.
 *
 * The move to the junk folder is performed without using any explicit junk
 *  support code.  This ends up being effectively the same underlying logic test
 *  as base_index_messages' test of moving a message to the trash folder.
 */
async function test_message_moving_to_junk_folder_is_deletion() {
  // Create and index two messages in a conversation.
  const [, msgSet] = await messageInjection.makeFoldersWithSets(1, [
    { count: 2, msgsPerThread: 2 },
  ]);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet], { augment: true }));

  const convId = msgSet.glodaMessages[0].conversation.id;
  const firstGlodaId = msgSet.glodaMessages[0].id;
  const secondGlodaId = msgSet.glodaMessages[1].id;

  // Move them to the junk folder.
  await messageInjection.moveMessages(
    msgSet,
    await messageInjection.getJunkFolder()
  );

  // They will appear deleted after the events.
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([], { deleted: [msgSet] }));

  // We do not index the junk folder so this should actually make them appear
  //  deleted to an unprivileged query.
  const msgQuery = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE);
  msgQuery.id(firstGlodaId, secondGlodaId);
  await queryExpect(msgQuery, []);

  // Force a sweep.
  GlodaMsgIndexer.indexingSweepNeeded = true;
  // There should be no apparent change as the result of this pass.
  // (Well, the conversation will die, but we can't see that.)
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([]));

  // The conversation should be gone.
  const convQuery = Gloda.newQuery(GlodaConstants.NOUN_CONVERSATION);
  convQuery.id(convId);
  await queryExpect(convQuery, []);

  // The messages should be entirely gone.
  const msgPrivQuery = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE, {
    noDbQueryValidityConstraints: true,
  });
  msgPrivQuery.id(firstGlodaId, secondGlodaId);
  await queryExpect(msgPrivQuery, []);
}

function test_sanity_test_environment() {
  Assert.ok(messageInjection, "Sanity that messageInjection is set.");
  Assert.ok(messageInjection.messageGenerator, "Sanity that msgGen is set.");
}

/* exported tests */
var base_index_junk_tests = [
  test_sanity_test_environment,
  setup_spam_filter,
  test_never_indexes_a_message_marked_as_junk,
  reset_spam_filter,
  test_mark_as_junk_is_deletion_mark_as_not_junk_is_exposure,
  test_message_moving_to_junk_folder_is_deletion,
];
