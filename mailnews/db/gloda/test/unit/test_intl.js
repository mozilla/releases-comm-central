/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Sanity check our encoding transforms and make sure the mozporter tokenizer
 *  is resulting in the expected fulltext search results.  Specifically:
 * - Check that subject, body, and attachment names are properly indexed;
 *    previously we screwed up at least one of these in terms of handling
 *    encodings properly.
 * - Check that we can fulltext search on those things afterwards.
 */

var {
  assertExpectedMessagesIndexed,
  glodaTestHelperInitialize,
  waitForGlodaIndexer,
} = ChromeUtils.import("resource://testing-common/gloda/GlodaTestHelper.jsm");
var { waitForGlodaDBFlush } = ChromeUtils.import(
  "resource://testing-common/gloda/GlodaTestHelperFunctions.jsm"
);
var { queryExpect } = ChromeUtils.import(
  "resource://testing-common/gloda/GlodaQueryHelper.jsm"
);
var { Gloda } = ChromeUtils.import("resource:///modules/gloda/GlodaPublic.jsm");
var { GlodaMsgIndexer } = ChromeUtils.import(
  "resource:///modules/gloda/IndexMsg.jsm"
);
var { MessageGenerator, SyntheticMessageSet } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);

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
      "euc-jp": [
        "=?shift-jis?b?jqmTrppTid2LQA==?=",
        "\xbc\xab\xc6\xb0\xd3\xb4\xb2\xdf\xb5\xa1",
      ],
      "shift-jis": [
        "=?shift-jis?b?jqmTrppTid2LQA==?=",
        "\x8e\xa9\x93\xae\x9aS\x89\xdd\x8b@",
      ],
    },
    searchPhrases: [
      // Match bi-gram driven matches starting from the front.
      { body: '"\u81ea\u52d5"', match: true },
      { body: '"\u81ea\u52d5\u552e"', match: true },
      { body: '"\u81ea\u52d5\u552e\u8ca8"', match: true },
      { body: '"\u81ea\u52d5\u552e\u8ca8\u6a5f"', match: true },
      // Now match from the back (bi-gram based).
      { body: '"\u52d5\u552e\u8ca8\u6a5f"', match: true },
      { body: '"\u552e\u8ca8\u6a5f"', match: true },
      { body: '"\u8ca8\u6a5f"', match: true },
      // Now everybody in the middle!
      { body: '"\u52d5\u552e\u8ca8"', match: true },
      { body: '"\u552e\u8ca8"', match: true },
      { body: '"\u52d5\u552e"', match: true },
      // -- Now match nobody!
      // Nothing in common with the right answer.
      { body: '"\u81eb\u52dc"', match: false },
      // Too long, no match!
      { body: '"\u81ea\u52d5\u552e\u8ca8\u6a5f\u6a5f"', match: false },
      // Minor change at the end.
      { body: '"\u81ea\u52d5\u552e\u8ca8\u6a5e"', match: false },
    ],
  },
  // Use two words where the last character is a multi-byte sequence and one of
  //  them is the last word in the string.  This helps test an off-by-one error
  //  in both the asymmetric case (query's last character is last character in
  //  the tokenized string but it is not the last character in the body string)
  //  and symmetric case (last character in the query and the body).
  {
    name: "Czech diacritics",
    actual: "Slov\u00e1cko Moravsk\u00e9 rodin\u011b",
    encodings: {
      "utf-8": [
        "=?utf-8?b?U2xvdsOhY2tvIE1vcmF2c2vDqSByb2RpbsSb?=",
        "Slov\xc3\xa1cko Moravsk\xc3\xa9 rodin\xc4\x9b",
      ],
    },
    searchPhrases: [
      // -- Desired
      // Match on exact for either word should work
      { body: "Slov\u00e1cko", match: true },
      { body: "Moravsk\u00e9", match: true },
      { body: "rodin\u011b", match: true },
      // The ASCII uppercase letters get case-folded
      { body: "slov\u00e1cko", match: true },
      { body: "moravsk\u00e9", match: true },
      { body: "rODIN\u011b", match: true },
    ],
  },
  // Ignore accent search!
  {
    name: "having accent: Paris",
    actual: "Par\u00eds",
    encodings: {
      "utf-8": ["=?UTF-8?B?UGFyw61z?=", "Par\xc3\xads"],
    },
    searchPhrases: [{ body: "paris", match: true }],
  },
  // Case insensitive case for non-ASCII characters.
  {
    name: "Russian: new",
    actual: "\u041d\u043e\u0432\u043e\u0435",
    encodings: {
      "utf-8": [
        "=?UTF-8?B?0J3QvtCy0L7QtQ==?=",
        "\xd0\x9d\xd0\xbe\xd0\xb2\xd0\xbe\xd0\xb5",
      ],
    },
    searchPhrases: [{ body: "\u043d\u043e\u0432\u043e\u0435", match: true }],
  },
  // Case-folding happens after decomposition.
  {
    name: "Awesome where A has a bar over it",
    actual: "\u0100wesome",
    encodings: {
      "utf-8": ["=?utf-8?q?=C4=80wesome?=", "\xc4\x80wesome"],
    },
    searchPhrases: [
      { body: "\u0100wesome", match: true }, // Upper A-bar
      { body: "\u0101wesome", match: true }, // Lower a-bar
      { body: "Awesome", match: true }, // Upper A
      { body: "awesome", match: true }, // Lower a
    ],
  },
  // Deep decomposition happens and after that, case folding.
  {
    name: "Upper case upsilon with diaeresis and hook goes to small upsilon",
    actual: "\u03d4esterday",
    encodings: {
      "utf-8": ["=?utf-8?q?=CF=94esterday?=", "\xcf\x94esterday"],
    },
    searchPhrases: [
      { body: "\u03d4esterday", match: true }, // Y_: 03d4 => 03d2 (decomposed)
      { body: "\u03d3esterday", match: true }, // Y_' 03d3 => 03d2 (decomposed)
      { body: "\u03d2esterday", match: true }, // Y_  03d2 => 03a5 (decomposed)
      { body: "\u03a5esterday", match: true }, // Y   03a5 => 03c5 (lowercase)
      { body: "\u03c5esterday", match: true }, // y   03c5 (final state)
    ],
  },
  // Full-width alphabet.
  // Even if search phrases are ASCII, it has to hit.
  {
    name: "Full-width Thunderbird",
    actual:
      "\uff34\uff48\uff55\uff4e\uff44\uff45\uff52\uff42\uff49\uff52\uff44",
    encodings: {
      "utf-8": [
        "=?UTF-8?B?77y0772I772V772O772E772F772S772C772J772S772E?=",
        "\xef\xbc\xb4\xef\xbd\x88\xef\xbd\x95\xef\xbd\x8e\xef\xbd\x84\xef\xbd\x85\xef\xbd\x92\xef\xbd\x82\xef\xbd\x89\xef\xbd\x92\xef\xbd\x84",
      ],
    },
    searchPhrases: [
      // Full-width lower.
      {
        body: "\uff34\uff28\uff35\uff2e\uff24\uff25\uff32\uff22\uff29\uff32\uff24",
        match: true,
      },
      // Half-width.
      { body: "Thunderbird", match: true },
    ],
  },
  // Half-width Katakana with voiced sound mark.
  // Even if search phrases are full-width, it has to hit.
  {
    name: "Half-width Katakana: Thunderbird (SANDAABAADO)",
    actual: "\uff7b\uff9d\uff80\uff9e\uff70\uff8a\uff9e\uff70\uff84\uff9e",
    encodings: {
      "utf-8": [
        "=?UTF-8?B?7727776d776A776e772w776K776e772w776E776e?=",
        "\xef\xbd\xbb\xef\xbe\x9d\xef\xbe\x80\xef\xbe\x9e\xef\xbd\xb0\xef\xbe\x8a\xef\xbe\x9e\xef\xbd\xb0\xef\xbe\x84\xef\xbe\x9e",
      ],
    },
    searchPhrases: [
      { body: "\u30b5\u30f3\u30c0\u30fc\u30d0\u30fc\u30c9", match: true },
    ],
  },
  // Thai: Would you like to see the movie?
  {
    name: "Thai: query movie word into Thai language content",
    actual:
      "\u0e04\u0e38\u0e13\u0e2d\u0e22\u0e32\u0e01\u0e44\u0e1b\u0e14\u0e39\u0e2b\u0e19\u0e31\u0e07",
    encodings: {
      "utf-8": [
        "=?UTF-8?B?4LiE4Li44LiT4Lit4Lii4Liy4LiB4LmE4Lib4LiU4Li54Lir4LiZ4Lix4LiH?=",
        "\xe0\xb8\x84\xe0\xb8\xb8\xe0\xb8\x93\xe0\xb8\xad\xe0\xb8\xa2\xe0\xb8\xb2\xe0\xb8\x81\xe0\xb9\x84\xe0\xb8\x9b\xe0\xb8\x94\xe0\xb8\xb9\xe0\xb8\xab\xe0\xb8\x99\xe0\xb8\xb1\xe0\xb8\x87",
      ],
    },
    searchPhrases: [{ body: "\u0e2b\u0e19\u0e31\u0e07", match: true }],
  },
];

var msgGen;
var messageInjection;

add_setup(function () {
  msgGen = new MessageGenerator();
  // Use mbox injection because the fake server chokes sometimes right now.
  messageInjection = new MessageInjection({ mode: "local" }, msgGen);
  glodaTestHelperInitialize(messageInjection);
});

add_task(async function test_index_all_phrases() {
  for (const phrase of intlPhrases) {
    await indexPhrase(phrase);
  }
});

add_task(async function flush_db() {
  // Force a db flush so I can investigate the database if I want.
  await waitForGlodaDBFlush();
});

add_task(async function test_fulltextsearch_all_phrases() {
  for (const phrase of intlPhrases) {
    await fulltextsearchPhrase(phrase);
  }
});

/**
 * Names with encoded commas in them can screw up our mail address parsing if
 *  we perform the mime decoding prior to handing the mail address off for
 *  parsing.
 */
add_task(async function test_encoding_complications_with_mail_addresses() {
  const basePair = msgGen.makeNameAndAddress();
  // The =2C encodes a comma!
  const encodedCommaPair = ["=?iso-8859-1?Q?=DFnake=2C_=DFammy?=", basePair[1]];
  // "Snake, Sammy", but with a much cooler looking S-like character!
  const decodedName = "\u00dfnake, \u00dfammy";
  // Use the thing with the comma in it for all cases; previously there was an
  //  asymmetry between to and cc...
  const smsg = msgGen.makeMessage({
    from: encodedCommaPair,
    to: [encodedCommaPair],
    cc: [encodedCommaPair],
  });
  function verify_sammy_snake(unused, gmsg) {
    Assert.equal(gmsg.from.contact.name, decodedName);
    Assert.equal(gmsg.to.length, 1);
    Assert.equal(gmsg.to[0].id, gmsg.from.id);
    Assert.equal(gmsg.cc.length, 1);
    Assert.equal(gmsg.cc[0].id, gmsg.from.id);
  }

  const synSet = new SyntheticMessageSet([smsg]);
  await messageInjection.addSetsToFolders(
    [messageInjection.getInboxFolder()],
    [synSet]
  );
  await waitForGlodaIndexer();
  Assert.ok(
    ...assertExpectedMessagesIndexed([synSet], { verifier: verify_sammy_snake })
  );
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
 *  |fulltextsearchPhrase|.
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
  dump("using character set: " + charset + " actual: " + actual + "\n");
  dump("subject: " + subject + " (len: " + subject.length + ")\n");
  Assert.equal(actual, subject);
  dump("Body: " + indexedBodyText + " (len: " + indexedBodyText.length + ")\n");
  Assert.equal(actual, indexedBodyText);
  dump(
    "Attachment name: " +
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
async function fulltextsearchPhrase(aPhrase) {
  for (const searchPhrase of aPhrase.searchPhrases) {
    const query = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE);
    query.bodyMatches(searchPhrase.body);
    await queryExpect(query, searchPhrase.match ? aPhrase.resultList : []);
  }
}
