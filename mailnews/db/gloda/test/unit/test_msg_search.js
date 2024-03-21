/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test GlodaMsgSearcher.sys.mjs our heuristic-based fulltext search mechanism.  Things we
 *  generally want to verify:
 * - fulltext weighting by where the match happened works.
 * - static interestingness impacts things appropriately.
 *
 * Our general strategy is to create two messages each with a unique string
 *  placed in controlled places and whatever intentional message manipulation
 *  is required to set things up.  Then we query using a GlodaMsgSearcher with
 *  the limit set to 1.  Only the message we expect should come back.
 * Keep in mind in all tests that our underlying ranking mechanism is based on
 *  time so the date of each message is relevant but should not be significant
 *  because our score boost factor should always be well in excess of the one
 *  hour increment between messages.
 *
 * Previously, we relied on the general equivalence of the logic in
 *  test_query_core to our message search logic.
 */

var {
  assertExpectedMessagesIndexed,
  glodaTestHelperInitialize,
  waitForGlodaIndexer,
} = ChromeUtils.importESModule(
  "resource://testing-common/gloda/GlodaTestHelper.sys.mjs"
);
var { queryExpect } = ChromeUtils.importESModule(
  "resource://testing-common/gloda/GlodaQueryHelper.sys.mjs"
);
var { GlodaMsgSearcher } = ChromeUtils.importESModule(
  "resource:///modules/gloda/GlodaMsgSearcher.sys.mjs"
);
var { waitForGlodaDBFlush } = ChromeUtils.importESModule(
  "resource://testing-common/gloda/GlodaTestHelperFunctions.sys.mjs"
);
var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);

var uniqueCounter = 0;
var messageInjection;

add_setup(async function () {
  const msgGen = new MessageGenerator();
  messageInjection = new MessageInjection({ mode: "local" }, msgGen);
  glodaTestHelperInitialize(messageInjection);
});

/**
 * Verify that the ranking function is using the weights as expected.  We do not
 *  need to test all the permutations
 */
add_task(async function test_fulltext_weighting_by_column() {
  const ustr = unique_string();
  const [, subjSet, bodySet] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1, subject: ustr },
    { count: 1, body: { body: ustr } },
  ]);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([subjSet, bodySet]));
  await asyncMsgSearcherExpect(ustr, subjSet);
});

/**
 * A term mentioned 3 times in the body is worth more than twice in the subject.
 * (This is because the subject saturates at one occurrence worth 2.0 and the
 * body does not saturate until 10, each worth 1.0.)
 */
add_task(async function test_fulltext_weighting_saturation() {
  const ustr = unique_string();
  const double_ustr = ustr + " " + ustr;
  const thrice_ustr = ustr + " " + ustr + " " + ustr;
  const [, subjSet, bodySet] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1, subject: double_ustr },
    { count: 1, body: { body: thrice_ustr } },
  ]);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([subjSet, bodySet]));
  await asyncMsgSearcherExpect(ustr, bodySet);
});

/**
 * Use a starred message with the same fulltext match characteristics as another
 * message to verify the preference goes the right way.  Have the starred
 * message be the older message for safety.
 */
add_task(async function test_static_interestingness_boost_works() {
  const ustr = unique_string();
  const [, starred, notStarred] = await messageInjection.makeFoldersWithSets(
    1,
    [
      { count: 1, subject: ustr },
      { count: 1, subject: ustr },
    ]
  );
  // Index in their native state.
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([starred, notStarred]));
  // Star and index.
  starred.setStarred(true);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([starred]));
  // Stars upon thars wins.
  await asyncMsgSearcherExpect(ustr, starred);
});

/**
 * Make sure that the query does not retrieve more than actually matches.
 */
add_task(async function test_joins_do_not_return_everybody() {
  const ustr = unique_string();
  const [, subjSet] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1, subject: ustr },
  ]);
  await waitForGlodaIndexer();
  Assert.ok(...assertExpectedMessagesIndexed([subjSet]));
  await asyncMsgSearcherExpect(ustr, subjSet, 2);
});

/**
 * Generate strings like "aaaaa", "aabaa", "aacaa", etc.  The idea with the
 * suffix is to avoid the porter stemmer from doing something weird that
 * collapses things.
 */
function unique_string() {
  const uval = uniqueCounter++;
  const s =
    String.fromCharCode(97 + Math.floor(uval / (26 * 26))) +
    String.fromCharCode(97 + (Math.floor(uval / 26) % 26)) +
    String.fromCharCode(97 + (uval % 26)) +
    "aa";
  return s;
}

/**
 * Wrap the construction of a GlodaMsgSearcher with a limit of 1 and feed it to
 * queryExpect.
 *
 * @param {string} aFulltextStr - The fulltext query string which
 *   GlodaMsgSearcher will parse.
 * @param {object} aExpectedSet The expected result set.  Make sure that the
 *   size of the set is consistent with aLimit.
 * @param {integer} [aLimit=1] - Limit.
 *
 * Use like so:
 *  await asyncMsgSearchExpect("foo bar", someSynMsgSet);
 */
async function asyncMsgSearcherExpect(aFulltextStr, aExpectedSet, aLimit) {
  const limit = aLimit ? aLimit : 1;
  Services.prefs.setIntPref("mailnews.database.global.search.msg.limit", limit);
  const searcher = new GlodaMsgSearcher(null, aFulltextStr);
  await queryExpect(searcher.buildFulltextQuery(), aExpectedSet);
}
