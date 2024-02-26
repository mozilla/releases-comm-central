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
} = ChromeUtils.import("resource://testing-common/gloda/GlodaTestHelper.jsm");
var { configureGlodaIndexing } = ChromeUtils.import(
  "resource://testing-common/gloda/GlodaTestHelperFunctions.jsm"
);
var { Gloda } = ChromeUtils.import("resource:///modules/gloda/GlodaPublic.jsm");
var { GlodaMsgIndexer } = ChromeUtils.import(
  "resource:///modules/gloda/IndexMsg.jsm"
);
var { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);

const GLODA_BAD_MESSAGE_ID = 2;

var illegalMessageTemplates = [
  // -- Authors
  {
    name: "no author",
    clobberHeaders: {
      From: "",
    },
  },
  {
    name: "too many authors (> 1)",
    clobberHeaders: {
      From: "Tweedle Dee <dee@example.com>, Tweedle Dum <dum@example.com>",
    },
  },
];

var messageInjection;

add_setup(function () {
  const msgGen = new MessageGenerator();
  messageInjection = new MessageInjection({ mode: "local" }, msgGen);
  glodaTestHelperInitialize(messageInjection);
});

add_task(async function test_illegal_message_no_author() {
  await illegal_message(illegalMessageTemplates[0]);
});
add_task(async function test_illegal_message_too_many_authors() {
  await illegal_message(illegalMessageTemplates[1]);
});

/**
 * A byzantine failure to stream should not sink us.  Fake a failure.
 */
add_task(async function test_streaming_failure() {
  configureGlodaIndexing({ injectFaultIn: "streaming" });

  // Inject the messages.
  const [msgSet] = await messageInjection.makeNewSetsInFolders(
    [messageInjection.getInboxFolder()],
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
});

/**
 * If we have one bad message followed by a good message, the good message
 *  should still get indexed.  Additionally, if we do a sweep on the folder,
 *  we should not attempt to index the message again.
 */
add_task(async function test_recovery_and_no_second_attempts() {
  const [, goodSet] = await messageInjection.makeNewSetsInFolders(
    [messageInjection.getInboxFolder()],
    [{ count: 1, clobberHeaders: { From: "" } }, { count: 1 }]
  );

  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([goodSet], { recovered: 1 }));

  // Index the folder; no messages should get indexed and there should be no
  //  failure things.
  GlodaMsgIndexer.indexFolder(messageInjection.getInboxFolder());
  await waitForGlodaIndexer();
  Assert.ok(
    ...assertExpectedMessagesIndexed([], {
      recovered: 0,
      failedToRecover: 0,
      cleanedUp: 0,
      hadNoCleanUp: 0,
    })
  );
});

/**
 * Make sure that we attempt to reindex a dirty bad message and that when we
 *  fail that we clear the dirty bit.
 */
add_task(async function test_reindex_on_dirty_clear_dirty_on_fail() {
  // Inject a new illegal message
  const [msgSet] = await messageInjection.makeNewSetsInFolders(
    [messageInjection.getInboxFolder()],
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
  GlodaMsgIndexer.indexFolder(messageInjection.getInboxFolder());
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
  GlodaMsgIndexer.indexFolder(messageInjection.getInboxFolder());
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
});

/**
 * Using exciting templates from |illegalMessageTemplates|, verify that gloda
 *  fails to index them and marks the messages bad.
 */
async function illegal_message(aInfo) {
  // Inject the messages.
  const [msgSet] = await messageInjection.makeNewSetsInFolders(
    [messageInjection.getInboxFolder()],
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
