/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the CalExtractParser module.
 */
var { CalExtractParser } = ChromeUtils.importESModule(
  "resource:///modules/calendar/extract/CalExtractParser.sys.mjs"
);

/**
 * Tests tokenizing an empty string gives an empty list.
 */
add_task(function testTokenizeEmptyString() {
  const parser = new CalExtractParser();
  const result = parser.tokenize("");
  Assert.equal(result.length, 0, "tokenize empty string produces empty list");
});

/**
 * Tests tokenisation works as expected.
 */
add_task(function testTokenizeWithRules() {
  const parser = new CalExtractParser(
    [
      [/^(Monday|Tuesday|Wednesday)/, "DAY"],
      [/^meet/, "MEET"],
      [/^[A-Za-z]+/, "TEXT"],
      [/^[0-9]+/, "NUMBER"],
      [/^\s+/, "SPACE"],
      [/^,/, "COMMA"],
    ],
    []
  );

  const text = `Hello there, can we meet on Monday? If not, then Tuesday. We can
              also meet on Wednesday at 6`;

  const expected = [
    [
      {
        type: "TEXT",
        text: "Hello",
        sentence: 0,
        position: 0,
      },
      {
        type: "SPACE",
        text: " ",
        sentence: 0,
        position: 5,
      },
      {
        type: "TEXT",
        text: "there",
        sentence: 0,
        position: 6,
      },
      {
        type: "COMMA",
        text: ",",
        sentence: 0,
        position: 11,
      },
      {
        type: "SPACE",
        text: " ",
        sentence: 0,
        position: 12,
      },
      {
        type: "TEXT",
        text: "can",
        sentence: 0,
        position: 13,
      },
      {
        type: "SPACE",
        text: " ",
        sentence: 0,
        position: 16,
      },
      {
        type: "TEXT",
        text: "we",
        sentence: 0,
        position: 17,
      },
      {
        type: "SPACE",
        text: " ",
        sentence: 0,
        position: 19,
      },
      {
        type: "MEET",
        text: "meet",
        sentence: 0,
        position: 20,
      },
      {
        type: "SPACE",
        text: " ",
        sentence: 0,
        position: 24,
      },
      {
        type: "TEXT",
        text: "on",
        sentence: 0,
        position: 25,
      },
      {
        type: "SPACE",
        text: " ",
        sentence: 0,
        position: 27,
      },
      {
        type: "DAY",
        text: "Monday",
        sentence: 0,
        position: 28,
      },
    ],
    [
      {
        type: "TEXT",
        text: "If",
        sentence: 1,
        position: 0,
      },
      {
        type: "SPACE",
        text: " ",
        sentence: 1,
        position: 2,
      },
      {
        type: "TEXT",
        text: "not",
        sentence: 1,
        position: 3,
      },
      {
        type: "COMMA",
        text: ",",
        sentence: 1,
        position: 6,
      },
      {
        type: "SPACE",
        text: " ",
        sentence: 1,
        position: 7,
      },
      {
        type: "TEXT",
        text: "then",
        sentence: 1,
        position: 8,
      },
      {
        type: "SPACE",
        text: " ",
        sentence: 1,
        position: 12,
      },
      {
        type: "DAY",
        text: "Tuesday",
        sentence: 1,
        position: 13,
      },
    ],
    [
      {
        type: "TEXT",
        text: "We",
        sentence: 2,
        position: 0,
      },
      {
        type: "SPACE",
        text: " ",
        sentence: 2,
        position: 2,
      },
      {
        type: "TEXT",
        text: "can",
        sentence: 2,
        position: 3,
      },
      {
        type: "SPACE",
        text: "\n              ",
        sentence: 2,
        position: 6,
      },
      {
        type: "TEXT",
        text: "also",
        sentence: 2,
        position: 21,
      },
      {
        type: "SPACE",
        text: " ",
        sentence: 2,
        position: 25,
      },
      {
        type: "MEET",
        text: "meet",
        sentence: 2,
        position: 26,
      },
      {
        type: "SPACE",
        text: " ",
        sentence: 2,
        position: 30,
      },
      {
        type: "TEXT",
        text: "on",
        sentence: 2,
        position: 31,
      },
      {
        type: "SPACE",
        text: " ",
        sentence: 2,
        position: 33,
      },
      {
        type: "DAY",
        text: "Wednesday",
        sentence: 2,
        position: 34,
      },
      {
        type: "SPACE",
        text: " ",
        sentence: 2,
        position: 43,
      },
      {
        type: "TEXT",
        text: "at",
        sentence: 2,
        position: 44,
      },
      {
        type: "SPACE",
        text: " ",
        sentence: 2,
        position: 46,
      },
      {
        type: "NUMBER",
        text: "6",
        sentence: 2,
        position: 47,
      },
    ],
  ];

  info(`Tokenizing string "${text}"...`);
  const actual = parser.tokenize(text);
  Assert.equal(actual.length, expected.length, `result has ${expected.length} sentences`);
  info(`Comparing results of tokenizing "${text}"...`);
  for (let i = 0; i < expected.length; i++) {
    compareExtractResults(actual[i], expected[i], "result");
  }
});

/**
 * Tests tokenizing unknown text produces null.
 */
add_task(function testTokenizeUnknownText() {
  const parser = new CalExtractParser([], []);
  const result = parser.tokenize("text with no rules");
  Assert.equal(result.length, 1, "tokenizing unknown text produced a result");
  Assert.equal(result[0], null, "tokenizing unknown text produced a null result");
});

/**
 * Tests omitting some token names omits them from the result.
 */
add_task(function testTokenRulesNamesOmitted() {
  const parser = new CalExtractParser([
    [/^Monday/, "DAY"],
    [/^meet/, "MEET"],
    [/^[A-Za-z]+/, "TEXT"],
    [/^[0-9]+/, "NUMBER"],
    [/^\s+/],
    [/^,/],
  ]);

  const text = `Hello there, can we meet on Monday?`;
  const expected = [
    [
      {
        type: "TEXT",
        text: "Hello",
        sentence: 0,
        position: 0,
      },
      {
        type: "TEXT",
        text: "there",
        sentence: 0,
        position: 6,
      },
      {
        type: "TEXT",
        text: "can",
        sentence: 0,
        position: 13,
      },
      {
        type: "TEXT",
        text: "we",
        sentence: 0,
        position: 17,
      },
      {
        type: "MEET",
        text: "meet",
        sentence: 0,
        position: 20,
      },
      {
        type: "TEXT",
        text: "on",
        sentence: 0,
        position: 25,
      },
      {
        type: "DAY",
        text: "Monday",
        sentence: 0,
        position: 28,
      },
    ],
  ];

  info(`Tokenizing string "${text}"...`);
  const actual = parser.tokenize(text);
  Assert.equal(actual.length, expected.length, `result has ${expected.length} sentences`);
  info(`Comparing results of tokenizing string "${text}"..`);
  for (let i = 0; i < expected.length; i++) {
    compareExtractResults(actual[i], expected[i], "result");
  }
});

/**
 * Tests parsing an empty string produces an empty lit.
 */
add_task(function testParseEmptyString() {
  const parser = new CalExtractParser();
  const result = parser.parse("");
  Assert.equal(result.length, 0, "parsing empty string produces empty list");
});
