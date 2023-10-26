/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This test file recycles part of test_intl.js. What we do is insert into the
 * fulltext index two messages:
 * - one has tokens 'aa' and 'bbb',
 * - one is from a previous test and has CJK characters in it.
 *
 * We want to test that the behavior of the tokenizer is as expected (namely,
 * that it drops two-letter tokens unless they're CJK bigrams), and that
 * GlodaMsgSearcher.jsm properly drops two-letter tokens (unless CJK) from the search
 * terms to avoid issuing a query that will definitely return no results.
 */

var {
  assertExpectedMessagesIndexed,
  glodaTestHelperInitialize,
  waitForGlodaIndexer,
} = ChromeUtils.import("resource://testing-common/gloda/GlodaTestHelper.jsm");
var { waitForGlodaDBFlush } = ChromeUtils.import(
  "resource://testing-common/gloda/GlodaTestHelperFunctions.jsm"
);
var { queryExpect, sqlExpectCount } = ChromeUtils.import(
  "resource://testing-common/gloda/GlodaQueryHelper.jsm"
);
var { Gloda } = ChromeUtils.import("resource:///modules/gloda/GlodaPublic.jsm");
var { GlodaDatastore } = ChromeUtils.import(
  "resource:///modules/gloda/GlodaDatastore.jsm"
);
var { GlodaFolder } = ChromeUtils.import(
  "resource:///modules/gloda/GlodaDataModel.jsm"
);
var { GlodaMsgSearcher } = ChromeUtils.import(
  "resource:///modules/gloda/GlodaMsgSearcher.jsm"
);
var { MessageGenerator, SyntheticMessageSet } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { MessageInjection } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageInjection.jsm"
);

/* ===== Tests ===== */

/**
 * To make the encoding pairs:
 * - For the subject bit:
 *   import email
 *   h = email.Header.Header(charset=CHARSET)
 *   h.append(STRING)
 *   h.encode()
 * - For the body bit
 *   s.encode(CHARSET)
 */
var intlPhrases = [
  // -- CJK case
  {
    name: "CJK: Vending Machine",
    actual: "\u81ea\u52d5\u552e\u8ca8\u6a5f",
    encodings: {
      "utf-8": [
        "=?utf-8?b?6Ieq5YuV5ZSu6LKo5qmf?=",
        "\xe8\x87\xaa\xe5\x8b\x95\xe5\x94\xae\xe8\xb2\xa8\xe6\xa9\x9f",
      ],
    },
    searchPhrases: [
      // Match bi-gram driven matches starting from the front.
      { body: '"\u81ea\u52d5"', match: true },
    ],
  },
  // -- Regular case. Make sure two-letter tokens do not match, since the
  // tokenizer is supposed to drop them. Also make sure that a three-letter
  // token matches.
  {
    name: "Boring ASCII",
    actual: "aa bbb",
    encodings: {
      "utf-8": ["=?utf-8?q?aa_bbb?=", "aa bbb"],
    },
    searchPhrases: [
      { body: "aa", match: false },
      { body: "bbb", match: true },
    ],
  },
];

var msgGen;
var messageInjection;

add_setup(function () {
  msgGen = new MessageGenerator();
  messageInjection = new MessageInjection({ mode: "local" }, msgGen);
  glodaTestHelperInitialize(messageInjection);
});

add_task(async function test_index_cjk() {
  await indexPhrase(intlPhrases[0]);
});

add_task(async function test_index_regular() {
  await indexPhrase(intlPhrases[1]);
});

/**
 * - Check that the 'aa' token was never emitted (we don't emit two-letter
 *   tokens unless they're CJK).
 * - Check that the '\u81ea\u52d5' token was emitted, because it's CJK.
 * - Check that the 'bbb' token was duly emitted (three letters is more than two
 *   letters so it's tokenized).
 */
add_task(async function test_token_count() {
  // Force a db flush so I can investigate the database if I want.
  await waitForGlodaDBFlush();
  await sqlExpectCount(
    0,
    "SELECT COUNT(*) FROM messagesText where messagesText MATCH 'aa'"
  );
  await sqlExpectCount(
    1,
    "SELECT COUNT(*) FROM messagesText where messagesText MATCH 'bbb'"
  );
  await sqlExpectCount(
    1,
    "SELECT COUNT(*) FROM messagesText where messagesText MATCH '\u81ea\u52d5'"
  );
});

add_task(async function test_fulltextsearch_cjk() {
  await test_fulltextsearch(intlPhrases[0]);
});

add_task(async function test_fulltextsearch_regular() {
  await test_fulltextsearch(intlPhrases[1]);
});

/**
 * We make sure that the Gloda module that builds the query drops two-letter
 * tokens, otherwise this would result in an empty search (no matches for
 * two-letter tokens).
 */
add_task(async function test_query_builder() {
  // aa should be dropped, and we have one message containing the bbb token.
  await msgSearchExpectCount(1, "aa bbb");
  // The CJK part should not be dropped, and match message 1; the bbb token
  // should not be dropped, and match message 2; 0 results returned because no
  // message has the two tokens in it.
  await msgSearchExpectCount(0, "\u81ea\u52d5 bbb");
});

/**
 * For each phrase in the intlPhrases array (we are parameterized over it using
 *  parameterizeTest in the 'tests' declaration), create a message where the
 *  subject, body, and attachment name are populated using the encodings in
 *  the phrase's "encodings" attribute, one encoding per message.  Make sure
 *  that the strings as exposed by the gloda representation are equal to the
 *  expected/actual value.
 * Stash each created synthetic message in a resultList list on the phrase so
 *  that we can use them as expected query results in
 *  |test_fulltextsearch|.
 */
async function indexPhrase(aPhrase) {
  // Create a synthetic message for each of the delightful encoding types.
  const messages = [];
  aPhrase.resultList = [];
  for (const charset in aPhrase.encodings) {
    const [quoted, bodyEncoded] = aPhrase.encodings[charset];

    const smsg = msgGen.makeMessage({
      subject: quoted,
      body: { charset, encoding: "8bit", body: bodyEncoded },
      attachments: [{ filename: quoted, body: "gabba gabba hey" }],
      // Save off the actual value for checking.
      callerData: [charset, aPhrase.actual],
    });

    messages.push(smsg);
    aPhrase.resultList.push(smsg);
  }
  const synSet = new SyntheticMessageSet(messages);
  await messageInjection.addSetsToFolders(
    [messageInjection.getInboxFolder()],
    [synSet]
  );

  await waitForGlodaIndexer();
  Assert.ok(
    ...assertExpectedMessagesIndexed([synSet], { verifier: verify_index })
  );
}

/**
 * Does the per-message verification for indexPhrase.  Knows what is right for
 *  each message because of the callerData attribute on the synthetic message.
 */
function verify_index(smsg, gmsg) {
  const [charset, actual] = smsg.callerData;
  const subject = gmsg.subject;
  const indexedBodyText = gmsg.indexedBodyText.trim();
  const attachmentName = gmsg.attachmentNames[0];
  dump("Using character set:\n" + charset + "\nActual:\n" + actual + "\n");
  dump("Subject:\n" + subject + "\nSubject length:\n" + subject.length + "\n");
  Assert.equal(actual, subject);
  dump("Body: " + indexedBodyText + " (len: " + indexedBodyText.length + ")\n");
  Assert.equal(actual, indexedBodyText);
  dump(
    "Attachment name:" +
      attachmentName +
      " (len: " +
      attachmentName.length +
      ")\n"
  );
  Assert.equal(actual, attachmentName);
}

/**
 * For each phrase, make sure that all of the searchPhrases either match or fail
 *  to match as appropriate.
 */
async function test_fulltextsearch(aPhrase) {
  for (const searchPhrase of aPhrase.searchPhrases) {
    const query = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE);
    query.bodyMatches(searchPhrase.body);
    await queryExpect(query, searchPhrase.match ? aPhrase.resultList : []);
  }
}

/**
 * Pass a query string to the GlodaMsgSearcher, run the corresponding SQL query,
 * and check the resulted count is what we want.
 *
 * Use like so:
 *  await msgSearchExpectCount(1, "I like cheese");
 */
async function msgSearchExpectCount(aCount, aFulltextStr) {
  // Let the GlodaMsgSearcher build its query
  const searcher = new GlodaMsgSearcher(null, aFulltextStr);
  const conn = GlodaDatastore.asyncConnection;
  const query = searcher.buildFulltextQuery();

  // Brace yourself, brutal monkey-patching NOW
  let sql, args;
  const oldFunc = GlodaDatastore._queryFromSQLString;
  GlodaDatastore._queryFromSQLString = function (aSql, aArgs) {
    sql = aSql;
    args = aArgs;
  };
  query.getCollection();
  GlodaDatastore._queryFromSQLString = oldFunc;

  // Bind the parameters
  const stmt = conn.createStatement(sql);
  for (const [iBinding, bindingValue] of args.entries()) {
    GlodaDatastore._bindVariant(stmt, iBinding, bindingValue);
  }

  let promiseResolve;
  const promise = new Promise(resolve => {
    promiseResolve = resolve;
  });

  let i = 0;
  stmt.executeAsync({
    handleResult(aResultSet) {
      for (
        let row = aResultSet.getNextRow();
        row;
        row = aResultSet.getNextRow()
      ) {
        i++;
      }
    },

    handleError(aError) {
      do_throw(new Error("Error: " + aError.message));
    },

    handleCompletion(aReason) {
      if (aReason != Ci.mozIStorageStatementCallback.REASON_FINISHED) {
        do_throw(new Error("Query canceled or aborted!"));
      }

      if (i != aCount) {
        throw new Error(
          "Didn't get the expected number of rows: got " +
            i +
            " expected " +
            aCount +
            " SQL: " +
            sql
        );
      }
      promiseResolve();
    },
  });
  stmt.finalize();
  await promise;
}
