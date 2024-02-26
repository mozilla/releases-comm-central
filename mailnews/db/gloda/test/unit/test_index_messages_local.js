/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test indexing support for local messages.
 */

var {
  glodaTestHelperInitialize,
  assertExpectedMessagesIndexed,
  waitForGlodaIndexer,
  messageInjection,
  nukeGlodaCachesAndCollections,
} = ChromeUtils.import("resource://testing-common/gloda/GlodaTestHelper.jsm");
var { waitForGlodaDBFlush } = ChromeUtils.import(
  "resource://testing-common/gloda/GlodaTestHelperFunctions.jsm"
);
var { MessageGenerator, MessageScenarioFactory } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);

/* import-globals-from base_index_messages.js */
load("base_index_messages.js");

add_setup(async function () {
  msgGen = new MessageGenerator();
  scenarios = new MessageScenarioFactory(msgGen);
  messageInjection = new MessageInjection({ mode: "local" }, msgGen);
  glodaTestHelperInitialize(messageInjection);
});

/**
 * Make sure that if we have to reparse a local folder we do not hang or
 *  anything.  (We had a regression where we would hang.)
 */
add_task(async function test_reparse_of_local_folder_works() {
  // Index a folder.
  const [[folder], msgSet] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1 },
  ]);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet]));

  // Force a db flush so we do not have any outstanding references to the
  //  folder or its headers.
  await waitForGlodaDBFlush();

  // Mark the summary invalid.
  folder.msgDatabase.summaryValid = false;
  // Clear the database so next time we have to reparse.
  folder.msgDatabase.forceClosed();

  // Force gloda to re-parse the folder again.
  GlodaMsgIndexer.indexFolder(folder);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([]));
});

/**
 * Ensure that fromJSON for a non-singular attribute properly filters out
 *  "undefined" return values, specifically as it relates to tags.  When the
 *  user removes them Gloda doesn't actually re-index the messages so the
 *  values will still be there when we next load the message.
 *
 * We directly monkey with the state of NounTag for no really good reason, but
 *  maybe it cuts down on disk I/O because we don't have to touch prefs.
 */
add_task(async function test_fromjson_of_removed_tag() {
  // -- Inject
  const [, msgSet] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1 },
  ]);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet], { augment: true }));
  let gmsg = msgSet.glodaMessages[0];

  // -- Tag
  const tag = TagNoun.getTag("$label4");
  msgSet.addTag(tag.key);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([msgSet]));
  Assert.equal(gmsg.tags.length, 1);
  Assert.equal(gmsg.tags[0].key, tag.key);

  // -- Forget about the tag, TagNoun!
  delete TagNoun._tagMap[tag.key];
  // This also means we have to replace the tag service with a liar.
  const realTagService = TagNoun._msgTagService;
  TagNoun._msgTagService = {
    isValidKey() {
      return false;
    }, // Lies!
  };

  // -- Forget about the message, gloda!
  const glodaId = gmsg.id;
  nukeGlodaCachesAndCollections();

  // -- Re-load the message.
  const query = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE);
  query.id(glodaId);
  const coll = await queryExpect(query, msgSet);

  // -- Put the tag back in TagNoun before we check and possibly explode.
  TagNoun._tagMap[tag.key] = tag;
  TagNoun._msgTagService = realTagService;

  // -- Verify the message apparently has no tags (despite no reindex).
  gmsg = coll.items[0];
  Assert.equal(gmsg.tags.length, 0);
});

/**
 * Test that we are using hasOwnProperty or a properly guarding dict for
 *  NounTag so that if someone created a tag called "watch" and then deleted
 *  it, we don't end up exposing the watch function as the tag.
 *
 * Strictly speaking, this does not really belong here, but it's a matched set
 *  with the previous test.
 */
add_task(
  function test_nountag_does_not_think_it_has_watch_tag_when_it_does_not() {
    Assert.equal(TagNoun.fromJSON("watch"), undefined);
  }
);

base_index_messages_tests.forEach(e => {
  add_task(e);
});
