/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that we fail on bad messages by marking the messages as bad rather than
 *  exploding or something bad like that.
 */

var {
  assertExpectedMessagesIndexed,
  glodaTestHelperInitialize,
  waitForGlodaIndexer,
} = ChromeUtils.importESModule(
  "resource://testing-common/gloda/GlodaTestHelper.sys.mjs"
);
var { configureGlodaIndexing, waitForGlodaDBFlush } =
  ChromeUtils.importESModule(
    "resource://testing-common/gloda/GlodaTestHelperFunctions.sys.mjs"
  );
var { Gloda } = ChromeUtils.importESModule(
  "resource:///modules/gloda/GlodaPublic.sys.mjs"
);
var { GlodaMsgIndexer } = ChromeUtils.importESModule(
  "resource:///modules/gloda/IndexMsg.sys.mjs"
);
var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);

const GLODA_BAD_MESSAGE_ID = 2;
const GLODA_FIRST_VALID_MESSAGE_ID = 32;

var illegalMessageTemplates = [
  // -- Authors
  {
    name: "no author",
    clobberHeaders: {
      From: "",
    },
  },
];

var msgGen;
var messageInjection;
var testFolder;

async function test_illegal_message_no_author() {
  await illegal_message(illegalMessageTemplates[0]);
}

/*
 * Test that a message containing multiple authors does get indexed using only
 * the first author.
 */
async function test_message_multiple_authors() {
  const [msgSet] = await messageInjection.makeNewSetsInFolders(
    [testFolder],
    [
      {
        count: 1,
        clobberHeaders: {
          From: "Tweedle Dee <dee@example.com>, Tweedle Dum <dum@example.com>",
        },
      },
    ]
  );

  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet]));

  await waitForGlodaDBFlush();
  const msgHdr = msgSet.getMsgHdr(0);
  Assert.greaterOrEqual(
    msgHdr.getUint32Property("gloda-id"),
    GLODA_FIRST_VALID_MESSAGE_ID
  );

  Assert.equal(Gloda.isMessageIndexed(msgHdr), true);
}

/**
 * A byzantine failure to stream should not sink us.  Fake a failure.
 */
async function test_streaming_failure() {
  // TODO: Investigate why this test fails for online IMAP folders.
  if (!messageInjection.messageInjectionIsLocal()) {
    return;
  }

  configureGlodaIndexing({ injectFaultIn: "streaming" });

  // Inject the messages.
  const [msgSet] = await messageInjection.makeNewSetsInFolders(
    [testFolder],
    [{ count: 1 }]
  );

  // Indexing should complete without actually indexing the message.
  await waitForGlodaIndexer();
  Assert.ok(
    ...assertExpectedMessagesIndexed([], {
      recovered: 1,
      failedToRecover: 0,
      cleanedUp: 0,
      hadNoCleanUp: 0,
    })
  );

  // Make sure the header has the expected gloda bad message state.
  const msgHdr = msgSet.getMsgHdr(0);
  Assert.equal(msgHdr.getUint32Property("gloda-id"), GLODA_BAD_MESSAGE_ID);

  // Make sure gloda does not think the message is indexed
  Assert.equal(Gloda.isMessageIndexed(msgHdr), false);

  configureGlodaIndexing({});
}

/**
 * If we have one bad message followed by a good message, the good message
 *  should still get indexed.  Additionally, if we do a sweep on the folder,
 *  we should not attempt to index the message again.
 */
async function test_recovery_and_no_second_attempts() {
  const [, goodSet] = await messageInjection.makeNewSetsInFolders(
    [testFolder],
    [{ count: 1, clobberHeaders: { From: "" } }, { count: 1 }]
  );

  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([goodSet], { recovered: 1 }));

  // Index the folder; no messages should get indexed and there should be no
  //  failure things.
  GlodaMsgIndexer.indexFolder(testFolder);
  await waitForGlodaIndexer();
  Assert.ok(
    ...assertExpectedMessagesIndexed([], {
      recovered: 0,
      failedToRecover: 0,
      cleanedUp: 0,
      hadNoCleanUp: 0,
    })
  );
}

/**
 * Make sure that we attempt to reindex a dirty bad message and that when we
 *  fail that we clear the dirty bit.
 */
async function test_reindex_on_dirty_clear_dirty_on_fail() {
  // TODO: Investigate why this test fails on non-local message injections.
  if (!messageInjection.messageInjectionIsLocal()) {
    return;
  }

  // Inject a new illegal message
  const [msgSet] = await messageInjection.makeNewSetsInFolders(
    [testFolder],
    [
      {
        count: 1,
        clobberHeaders: illegalMessageTemplates[0].clobberHeaders,
      },
    ]
  );

  // Indexing should complete without actually indexing the message.
  await waitForGlodaIndexer();
  Assert.ok(
    ...assertExpectedMessagesIndexed([], {
      recovered: 1,
      failedToRecover: 0,
      cleanedUp: 0,
      hadNoCleanUp: 0,
    })
  );

  // Mark the message dirty, force the folder to be indexed.
  const msgHdr = msgSet.getMsgHdr(0);
  msgHdr.setUint32Property("gloda-dirty", 1);
  GlodaMsgIndexer.indexFolder(testFolder);
  await waitForGlodaIndexer();
  Assert.ok(
    ...assertExpectedMessagesIndexed([], {
      recovered: 1,
      failedToRecover: 0,
      cleanedUp: 0,
      hadNoCleanUp: 0,
    })
  );
  // Now the message should be clean.
  Assert.equal(msgHdr.getUint32Property("gloda-dirty"), 0);

  // Check again with filthy.
  msgHdr.setUint32Property("gloda-dirty", 2);
  GlodaMsgIndexer.indexFolder(testFolder);
  await waitForGlodaIndexer();
  Assert.ok(
    ...assertExpectedMessagesIndexed([], {
      recovered: 1,
      failedToRecover: 0,
      cleanedUp: 0,
      hadNoCleanUp: 0,
    })
  );
  // Now the message should be clean.
  Assert.equal(msgHdr.getUint32Property("gloda-dirty"), 0);
}

/**
 * Using exciting templates from |illegalMessageTemplates|, verify that gloda
 *  fails to index them and marks the messages bad.
 */
async function illegal_message(aInfo) {
  // Inject the messages.
  const [msgSet] = await messageInjection.makeNewSetsInFolders(
    [testFolder],
    [{ count: 1, clobberHeaders: aInfo.clobberHeaders }]
  );

  // Indexing should complete without actually indexing the message.
  await waitForGlodaIndexer();
  Assert.ok(
    ...assertExpectedMessagesIndexed([], {
      recovered: 1,
      failedToRecover: 0,
      cleanedUp: 0,
      hadNoCleanUp: 0,
    })
  );

  // Make sure the header has the expected gloda bad message state.
  const msgHdr = msgSet.getMsgHdr(0);
  Assert.equal(msgHdr.getUint32Property("gloda-id"), GLODA_BAD_MESSAGE_ID);

  // Make sure gloda does not think the message is indexed.
  Assert.equal(Gloda.isMessageIndexed(msgHdr), false);
}

/**
 * Test that a message with a bad size property does not hang indexing.
 */
async function test_bad_message_size() {
  // Inject the messages.
  const msgText = "I will not waste chars.\r\n".repeat(500);
  const [msgSet] = await messageInjection.makeNewSetsInFolders(
    [testFolder],
    [{ count: 2, body: { body: msgText } }]
  );

  const msgHdr = msgSet.getMsgHdr(0);
  const size = msgHdr.getUint32Property("size");
  const offlineMsgSize = msgHdr.getUint32Property("offlineMsgSize");
  msgSet.getMsgHdr(0).setUint32Property("size", size / 2);
  if (offlineMsgSize) {
    msgSet.getMsgHdr(0).setUint32Property("offlineMsgSize", offlineMsgSize / 2);
  }

  // Indexing should complete without hang.
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet]));
}

/* exported tests */
var base_index_bad_messages_tests = [
  test_illegal_message_no_author,
  test_message_multiple_authors,
  test_streaming_failure,
  test_recovery_and_no_second_attempts,
  test_reindex_on_dirty_clear_dirty_on_fail,
  test_bad_message_size,
];
