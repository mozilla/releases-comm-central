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
 * Tests parsing an empty string produces an empty lit.
 */
add_task(function testParseEmptyString() {
  const parser = new CalExtractParser();
  const result = parser.parse("");
  Assert.equal(result.length, 0, "parsing empty string produces empty list");
});

/**
 * Tests parsing with various non-flag rules works as expected.
 */
add_task(function testParseText() {
  const parser = CalExtractParser.createInstance(
    [
      [/^your/i, "YOUR"],
      [/^(appointment|meeting|booking)/i, "EVENT"],
      [/^(at|@)/i, "AT"],
      [/^on/i, "ON"],
      [/^\d\d-\d\d-\d\d\d\d/, "DATE"],
      [/^\d\d\d\d-\d\d-\d\d/, "ISODATE"],
      [/^(was|is|has been| will be)/i, "BE"],
      [/^(confirmed|booked|saved|created)/i, "CONFIRM"],
      [/^[A-Z][A-Za-z0-9]+/, "NOUN"],
      [/^,/],
      [/^\S+/, "TEXT"],
      [/^\s+/],
    ],
    [
      {
        name: "event",
        patterns: ["text", "yourevent", "location", "BE", "CONFIRM"],
        action: ([, title, location]) => ({
          type: "event",
          title,
          location,
        }),
      },
      {
        name: "event",
        patterns: ["yourevent", "location", "BE", "CONFIRM"],
        action: ([title, location]) => ({
          type: "event",
          title,
          location,
        }),
      },
      {
        name: "event",
        patterns: ["yourevent", "ON", "date", "BE", "CONFIRM"],
        action: ([title, , date]) => ({
          type: "event",
          title,
          date,
        }),
      },
      {
        name: "event",
        patterns: ["yourthing", "ON", "date", "BE", "CONFIRM"],
        action: ([title, , date]) => ({
          type: "event",
          title,
          date,
        }),
      },
      {
        name: "date",
        patterns: ["DATE"],
        action: ([value]) => ({
          type: "date",
          value,
        }),
      },
      {
        name: "date",
        patterns: ["ISODATE"],
        action: ([value]) => ({
          type: "date",
          value,
        }),
      },
      {
        name: "yourevent",
        patterns: ["yourthing", "EVENT"],
        action: ([value]) => value,
      },
      {
        name: "yourthing",
        patterns: ["YOUR", "text"],
        action: ([, value]) => value,
      },
      {
        name: "location",
        patterns: ["AT", "text"],
        action: ([, value]) => ({
          type: "location",
          value,
        }),
      },
      {
        name: "text",
        patterns: ["TEXT"],
        action: ([value]) => value,
      },
      {
        name: "text",
        patterns: ["NOUN"],
        action: ([value]) => value,
      },
    ]
  );

  const tests = [
    {
      input: "Hello, your banking appointment at RealBank is booked!",
      expected: [
        {
          type: "event",
          title: {
            type: "TEXT",
            text: "banking",
            sentence: 0,
            position: 12,
          },
          location: {
            type: "location",
            value: {
              type: "NOUN",
              text: "RealBank",
              sentence: 0,
              position: 35,
            },
          },
        },
      ],
    },
    {
      input: "your banking appointment at RealBank is booked!",
      expected: [
        {
          type: "event",
          title: {
            type: "TEXT",
            text: "banking",
            sentence: 0,
            position: 5,
          },
          location: {
            type: "location",
            value: {
              type: "NOUN",
              text: "RealBank",
              sentence: 0,
              position: 28,
            },
          },
        },
      ],
    },
    {
      input: "Your Arraignment on 09-09-2021 is confirmed!",
      expected: [
        {
          type: "event",
          title: {
            type: "NOUN",
            text: "Arraignment",
            sentence: 0,
            position: 5,
          },
          date: {
            type: "date",
            value: {
              type: "DATE",
              text: "09-09-2021",
              sentence: 0,
              position: 20,
            },
          },
        },
      ],
    },
  ];

  for (const test of tests) {
    info(`Parsing string "${test.input}"...`);
    const result = parser.parse(test.input);
    Assert.equal(
      result.length,
      test.expected.length,
      `parsing "${test.input}" resulted in ${test.expected.length} sentences`
    );
    info(`Comparing parse results for string "${test.input}"...`);
    compareExtractResults(result, test.expected, "result");
  }
});

/**
 * Tests parsing unknown text produces a null result for the sentence.
 */
add_task(function testParseUnknownText() {
  const parser = CalExtractParser.createInstance(
    [
      [/^No/, "NO"],
      [/^rules/, "RULES"],
      [/^for/, "FOR"],
      [/^this/, "THIS"],
      [/^Or/, "OR"],
      [/^even/, "EVEN"],
      [/^\s+/, "SPACE"],
    ],
    [
      {
        name: "statement",
        patterns: ["NO", "SPACE", "RULES", "SPACE", "FOR", "SPACE", "THIS"],
        action: () => "statement",
      },
      {
        name: "statement",
        patterns: ["OR", "SPACE", "THIS"],
        action: () => "statement",
      },
    ]
  );

  const result = parser.parse("No rules for this. Or this. Or even this!");
  Assert.equal(result.length, 3, "result has 3 sentences");
  Assert.equal(result[0], "statement", "first sentence parsed properly");
  Assert.equal(result[1], "statement", "second sentence parsed properly");
  Assert.equal(result[2], null, "third sentence was not parsed properly");
});

/**
 * Tests parsing without any parse rules produces a null result for each
 * sentence.
 */
add_task(function testParseWithoutParseRules() {
  const parser = CalExtractParser.createInstance(
    [
      [/^[A-Za-z]+/, "TEXT"],
      [/^\s+/, "SPACE"],
    ],
    []
  );
  const result = parser.parse("No rules for this. Or this. Or event this!");
  Assert.equal(result.length, 3, "result has 3 parsed sentences");
  Assert.ok(
    result.every(val => val == null),
    "all parsed results are null"
  );
});

/**
 * Tests parsing using the "+" flag in various scenarios.
 */
add_task(function testParseWithPlusFlags() {
  const parser = CalExtractParser.createInstance(
    [
      [/^we\b/i, "WE"],
      [/^meet\b/i, "MEET"],
      [/^at\b/i, "AT"],
      [/^\d/, "NUMBER"],
      [/^\S+/, "TEXT"],
      [/^\s+/],
    ],
    [
      {
        name: "result",
        patterns: ["subject", "text+", "meet", "time"],
        action: ([subject, text, , time]) => ({
          type: "result0",
          subject,
          text,
          time,
        }),
      },
      {
        name: "result",
        patterns: ["meet", "time", "text+"],
        action: ([, time, text]) => ({
          type: "result1",
          time,
          text,
        }),
      },
      {
        name: "result",
        patterns: ["text+", "meet", "time"],
        action: ([text, , time]) => ({
          type: "result2",
          time,
          text,
        }),
      },
      {
        name: "subject",
        patterns: ["WE"],
        action: ([subject]) => ({
          type: "subject",
          subject,
        }),
      },
      {
        name: "meet",
        patterns: ["MEET", "AT"],
        action: ([meet, at]) => ({
          type: "meet",
          meet,
          at,
        }),
      },
      {
        name: "time",
        patterns: ["NUMBER"],
        action: ([value]) => ({
          type: "time",
          value,
        }),
      },
      {
        name: "text",
        patterns: ["TEXT"],
        action: ([value]) => value,
      },
    ]
  );

  const tests = [
    {
      name: "using '+' flag can capture one pattern",
      input: "We will meet at 7",
      expected: [
        {
          type: "result0",
          subject: {
            type: "subject",
            subject: {
              type: "WE",
              text: "We",
              sentence: 0,
              position: 0,
            },
          },
          text: [
            {
              type: "TEXT",
              text: "will",
              sentence: 0,
              position: 3,
            },
          ],
          time: {
            type: "time",
            value: {
              type: "NUMBER",
              text: "7",
              sentence: 0,
              position: 16,
            },
          },
        },
      ],
    },
    {
      name: "using the '+' flag can capture multiple patterns",
      input: "We are coming to meet at 7",
      expected: [
        {
          type: "result0",
          subject: {
            type: "subject",
            subject: {
              type: "WE",
              text: "We",
              sentence: 0,
              position: 0,
            },
          },
          text: [
            {
              type: "TEXT",
              text: "are",
              sentence: 0,
              position: 3,
            },
            {
              type: "TEXT",
              text: "coming",
              sentence: 0,
              position: 7,
            },
            {
              type: "TEXT",
              text: "to",
              sentence: 0,
              position: 14,
            },
          ],
          time: {
            type: "time",
            value: { type: "NUMBER", text: "7", sentence: 0, position: 25 },
          },
        },
      ],
    },
    {
      name: "using '+' fails if its pattern is unmatched",
      input: "We meet at 7",
      expected: [null],
    },
    {
      name: "'+' can be used in the first position",
      input: "Well do not meet at 7",
      expected: [
        {
          type: "result2",
          time: {
            type: "time",
            value: {
              type: "NUMBER",
              text: "7",
              sentence: 0,
              position: 20,
            },
          },
          text: [
            {
              type: "TEXT",
              text: "Well",
              sentence: 0,
              position: 0,
            },
            {
              type: "TEXT",
              text: "do",
              sentence: 0,
              position: 5,
            },
            {
              type: "TEXT",
              text: "not",
              sentence: 0,
              position: 8,
            },
          ],
        },
      ],
    },
    {
      name: "'+' can be used in the last position",
      input: "Meet at 7 is the plan",
      expected: [
        {
          type: "result1",
          time: {
            type: "time",
            value: {
              type: "NUMBER",
              text: "7",
              sentence: 0,
              position: 8,
            },
          },
          text: [
            {
              type: "TEXT",
              text: "is",
              sentence: 0,
              position: 10,
            },
            {
              type: "TEXT",
              text: "the",
              sentence: 0,
              position: 13,
            },
            {
              type: "TEXT",
              text: "plan",
              sentence: 0,
              position: 17,
            },
          ],
        },
      ],
    },
  ];

  for (const test of tests) {
    info(`Running test: ${test.name}`);
    const result = parser.parse(test.input);
    Assert.equal(
      result.length,
      test.expected.length,
      `parsing "${test.input}" resulted in ${test.expected.length} sentences`
    );
    info(`Comparing parse results for string "${test.input}"...`);
    compareExtractResults(result, test.expected, "result");
  }
});

/**
 * Tests parsing using the "*" flag in various scenarios.
 */
add_task(function testParseWithStarFlags() {
  const parser = CalExtractParser.createInstance(
    [
      [/^we\b/i, "WE"],
      [/^meet\b/i, "MEET"],
      [/^at\b/i, "AT"],
      [/^\d/, "NUMBER"],
      [/^\S+/, "TEXT"],
      [/^\s+/],
    ],
    [
      {
        name: "result",
        patterns: ["subject", "text*", "meet", "time"],
        action: ([subject, text, , time]) => ({
          type: "result0",
          subject,
          text,
          time,
        }),
      },
      {
        name: "result",
        patterns: ["meet", "time", "text*"],
        action: ([, time, text]) => ({
          type: "result1",
          time,
          text,
        }),
      },
      {
        name: "result",
        patterns: ["text*", "subject", "text", "meet", "time"],
        action: ([text, subject, , time]) => ({
          type: "result2",
          text,
          subject,
          time,
        }),
      },
      {
        name: "subject",
        patterns: ["WE"],
        action: ([subject]) => ({
          type: "subject",
          subject,
        }),
      },
      {
        name: "meet",
        patterns: ["MEET", "AT"],
        action: ([meet, at]) => ({
          type: "meet",
          meet,
          at,
        }),
      },
      {
        name: "time",
        patterns: ["NUMBER"],
        action: ([value]) => ({
          type: "time",
          value,
        }),
      },
      {
        name: "text",
        patterns: ["TEXT"],
        action: ([value]) => value,
      },
    ]
  );

  const tests = [
    {
      name: "using '*' flag can capture one pattern",
      input: "We will meet at 7",
      expected: [
        {
          type: "result0",
          subject: {
            type: "subject",
            subject: {
              type: "WE",
              text: "We",
              sentence: 0,
              position: 0,
            },
          },
          text: [
            {
              type: "TEXT",
              text: "will",
              sentence: 0,
              position: 3,
            },
          ],
          time: {
            type: "time",
            value: {
              type: "NUMBER",
              text: "7",
              sentence: 0,
              position: 16,
            },
          },
        },
      ],
    },
    {
      name: "using the '*' flag can capture multiple patterns",
      input: "We are coming to meet at 7",
      expected: [
        {
          type: "result0",
          subject: {
            type: "subject",
            subject: {
              type: "WE",
              text: "We",
              sentence: 0,
              position: 0,
            },
          },
          text: [
            {
              type: "TEXT",
              text: "are",
              sentence: 0,
              position: 3,
            },
            {
              type: "TEXT",
              text: "coming",
              sentence: 0,
              position: 7,
            },
            {
              type: "TEXT",
              text: "to",
              sentence: 0,
              position: 14,
            },
          ],
          time: {
            type: "time",
            value: { type: "NUMBER", text: "7", sentence: 0, position: 25 },
          },
        },
      ],
    },
    {
      name: "'*' capture is optional",
      input: "We meet at 7",
      expected: [
        {
          type: "result0",
          subject: {
            type: "subject",
            subject: {
              type: "WE",
              text: "We",
              sentence: 0,
              position: 0,
            },
          },
          text: [],
          time: {
            type: "time",
            value: { type: "NUMBER", text: "7", sentence: 0, position: 11 },
          },
        },
      ],
    },
    {
      name: "'*' can be used in the first position",
      input: "To think we will meet at 7",
      expected: [
        {
          type: "result2",
          text: [
            {
              type: "TEXT",
              text: "To",
              sentence: 0,
              position: 0,
            },
            {
              type: "TEXT",
              text: "think",
              sentence: 0,
              position: 3,
            },
          ],
          subject: {
            type: "subject",
            subject: {
              type: "WE",
              text: "we",
              sentence: 0,
              position: 9,
            },
          },
          time: {
            type: "meet",
            meet: {
              type: "MEET",
              text: "meet",
              sentence: 0,
              position: 17,
            },
            at: {
              type: "AT",
              text: "at",
              sentence: 0,
              position: 22,
            },
          },
        },
      ],
    },
    {
      name: "'*' can be used in the last position",
      input: "Meet at 7 is the plan",
      expected: [
        {
          type: "result1",
          time: {
            type: "time",
            value: {
              type: "NUMBER",
              text: "7",
              sentence: 0,
              position: 8,
            },
          },
          text: [
            {
              type: "TEXT",
              text: "is",
              sentence: 0,
              position: 10,
            },
            {
              type: "TEXT",
              text: "the",
              sentence: 0,
              position: 13,
            },
            {
              type: "TEXT",
              text: "plan",
              sentence: 0,
              position: 17,
            },
          ],
        },
      ],
    },
  ];

  for (const test of tests) {
    info(`Running test: ${test.name}`);
    const result = parser.parse(test.input);
    Assert.equal(
      result.length,
      test.expected.length,
      `parsing "${test.input}" resulted in ${test.expected.length} sentences`
    );
    info(`Comparing parse results for string "${test.input}"...`);
    compareExtractResults(result, test.expected, "result");
  }
});

/**
 * Tests parsing using the "?" flag in various scenarios.
 */
add_task(function testParseWithOptionalFlags() {
  const parser = CalExtractParser.createInstance(
    [
      [/^we\b/i, "WE"],
      [/^meet\b/i, "MEET"],
      [/^at\b/i, "AT"],
      [/^\d/, "NUMBER"],
      [/^\S+/, "TEXT"],
      [/^\s+/],
    ],
    [
      {
        name: "result",
        patterns: ["subject", "text?", "meet", "time"],
        action: ([subject, text, , time]) => ({
          type: "result0",
          subject,
          text,
          time,
        }),
      },
      {
        name: "result",
        patterns: ["meet", "time", "text?"],
        action: ([, time, text]) => ({
          type: "result1",
          time,
          text,
        }),
      },
      {
        name: "result",
        patterns: ["text?", "subject", "text", "meet", "time"],
        action: ([text, subject, , time]) => ({
          type: "result2",
          text,
          subject,
          time,
        }),
      },
      {
        name: "subject",
        patterns: ["WE"],
        action: ([subject]) => ({
          type: "subject",
          subject,
        }),
      },
      {
        name: "meet",
        patterns: ["MEET", "AT"],
        action: ([meet, at]) => ({
          type: "meet",
          meet,
          at,
        }),
      },
      {
        name: "time",
        patterns: ["NUMBER"],
        action: ([value]) => ({
          type: "time",
          value,
        }),
      },
      {
        name: "text",
        patterns: ["TEXT"],
        action: ([value]) => value,
      },
    ]
  );

  const tests = [
    {
      name: "using '?' flag can capture one pattern",
      input: "We will meet at 7",
      expected: [
        {
          type: "result0",
          subject: {
            type: "subject",
            subject: {
              type: "WE",
              text: "We",
              sentence: 0,
              position: 0,
            },
          },
          text: {
            type: "TEXT",
            text: "will",
            sentence: 0,
            position: 3,
          },

          time: {
            type: "time",
            value: {
              type: "NUMBER",
              text: "7",
              sentence: 0,
              position: 16,
            },
          },
        },
      ],
    },
    {
      name: "'?' capture is optional",
      input: "We meet at 7",
      expected: [
        {
          type: "result0",
          subject: {
            type: "subject",
            subject: {
              type: "WE",
              text: "We",
              sentence: 0,
              position: 0,
            },
          },
          text: null,
          time: {
            type: "time",
            value: { type: "NUMBER", text: "7", sentence: 0, position: 11 },
          },
        },
      ],
    },
    {
      name: "'?' can be used in the first position",
      input: "Think we will meet at 7",
      expected: [
        {
          type: "result2",
          text: {
            type: "TEXT",
            text: "Think",
            sentence: 0,
            position: 0,
          },
          subject: {
            type: "subject",
            subject: {
              type: "WE",
              text: "we",
              sentence: 0,
              position: 6,
            },
          },
          time: {
            type: "meet",
            meet: {
              type: "MEET",
              text: "meet",
              sentence: 0,
              position: 14,
            },
            at: {
              type: "AT",
              text: "at",
              sentence: 0,
              position: 19,
            },
          },
        },
      ],
    },
    {
      name: "'?' can be used in the last position",
      input: "Meet at 7 please",
      expected: [
        {
          type: "result1",
          time: {
            type: "time",
            value: {
              type: "NUMBER",
              text: "7",
              sentence: 0,
              position: 8,
            },
          },
          text: {
            type: "TEXT",
            text: "please",
            sentence: 0,
            position: 10,
          },
        },
      ],
    },
  ];

  for (const test of tests) {
    info(`Running test: ${test.name}`);
    const result = parser.parse(test.input);
    Assert.equal(
      result.length,
      test.expected.length,
      `parsing "${test.input}" resulted in ${test.expected.length} sentences`
    );
    info(`Comparing parse results for string "${test.input}"...`);
    compareExtractResults(result, test.expected, "result");
  }
});

/**
 * Test the flags can be used together in the same rules.
 */
add_task(function testParseWithFlags() {
  const tokens = [
    [/^we\b/i, "WE"],
    [/^meet\b/i, "MEET"],
    [/^at\b/i, "AT"],
    [/^\d/, "NUMBER"],
    [/^\S+/, "TEXT"],
    [/^\s+/],
  ];

  const patterns = [
    {
      name: "subject",
      patterns: ["WE"],
      action: ([subject]) => ({
        type: "subject",
        subject,
      }),
    },
    {
      name: "meet",
      patterns: ["MEET", "AT"],
      action: ([meet, at]) => ({
        type: "meet",
        meet,
        at,
      }),
    },
    {
      name: "time",
      patterns: ["NUMBER"],
      action: ([value]) => ({
        type: "time",
        value,
      }),
    },
    {
      name: "text",
      patterns: ["TEXT"],
      action: ([value]) => value,
    },
  ];

  const tests = [
    {
      patterns: ["subject?", "text*", "time+"],
      variants: [
        {
          input: "We will 7",
          expected: [
            [
              {
                type: "subject",
                subject: {
                  type: "WE",
                  text: "We",
                  sentence: 0,
                  position: 0,
                },
              },
              [
                {
                  type: "TEXT",
                  text: "will",
                  sentence: 0,
                  position: 3,
                },
              ],
              [
                {
                  type: "time",
                  value: {
                    type: "NUMBER",
                    text: "7",
                    sentence: 0,
                    position: 8,
                  },
                },
              ],
            ],
          ],
        },
        {
          input: "7",
          expected: [
            [
              null,
              [],
              [{ type: "time", value: { type: "NUMBER", text: "7", sentence: 0, position: 0 } }],
            ],
          ],
        },
        {
          input: "we",
          expected: [null],
        },
        {
          input: "will 7",
          expected: [
            [
              null,
              [{ type: "TEXT", text: "will", sentence: 0, position: 0 }],
              [{ type: "time", value: { type: "NUMBER", text: "7", sentence: 0, position: 5 } }],
            ],
          ],
        },
        {
          input: "we 7",
          expected: [
            [
              { type: "subject", subject: { type: "WE", text: "we", sentence: 0, position: 0 } },
              [],
              [{ type: "time", value: { type: "NUMBER", text: "7", sentence: 0, position: 3 } }],
            ],
          ],
        },
      ],
    },
    {
      patterns: ["subject+", "text?", "time*"],
      variants: [
        {
          input: "We will 7",
          expected: [
            [
              [
                {
                  type: "subject",
                  subject: {
                    type: "WE",
                    text: "We",
                    sentence: 0,
                    position: 0,
                  },
                },
              ],
              {
                type: "TEXT",
                text: "will",
                sentence: 0,
                position: 3,
              },

              [
                {
                  type: "time",
                  value: {
                    type: "NUMBER",
                    text: "7",
                    sentence: 0,
                    position: 8,
                  },
                },
              ],
            ],
          ],
        },
        {
          input: "7",
          expected: [null],
        },
        {
          input: "will 7",
          expected: [null],
        },
        {
          input: "we 7",
          expected: [
            [
              [
                {
                  type: "subject",
                  subject: {
                    type: "WE",
                    text: "we",
                    sentence: 0,
                    position: 0,
                  },
                },
              ],
              null,
              [
                {
                  type: "time",
                  value: {
                    type: "NUMBER",
                    text: "7",
                    sentence: 0,
                    position: 3,
                  },
                },
              ],
            ],
          ],
        },
      ],
    },
    {
      patterns: ["subject*", "text+", "time?"],
      variants: [
        {
          input: "We will 7",
          expected: [
            [
              [
                {
                  type: "subject",
                  subject: {
                    type: "WE",
                    text: "We",
                    sentence: 0,
                    position: 0,
                  },
                },
              ],
              [
                {
                  type: "TEXT",
                  text: "will",
                  sentence: 0,
                  position: 3,
                },
              ],
              {
                type: "time",
                value: {
                  type: "NUMBER",
                  text: "7",
                  sentence: 0,
                  position: 8,
                },
              },
            ],
          ],
        },
        {
          input: "will",
          expected: [[[], [{ type: "TEXT", text: "will", sentence: 0, position: 0 }], null]],
        },
        {
          input: "will 7",
          expected: [
            [
              [],
              [
                {
                  type: "TEXT",
                  text: "will",
                  sentence: 0,
                  position: 0,
                },
              ],
              {
                type: "time",
                value: {
                  type: "NUMBER",
                  text: "7",
                  sentence: 0,
                  position: 5,
                },
              },
            ],
          ],
        },
        {
          input: "we will",
          expected: [
            [
              [
                {
                  type: "subject",
                  subject: {
                    type: "WE",
                    text: "we",
                    sentence: 0,
                    position: 0,
                  },
                },
              ],
              [
                {
                  type: "TEXT",
                  text: "will",
                  sentence: 0,
                  position: 3,
                },
              ],
              null,
            ],
          ],
        },
      ],
    },
  ];

  for (let test of tests) {
    test = tests[2];
    const rule = {
      name: "result",
      patterns: test.patterns,
      action: args => args,
    };
    const parser = CalExtractParser.createInstance(tokens, [rule, ...patterns]);

    for (let input of test.variants) {
      input = test.variants[3];
      info(`Testing pattern: ${test.patterns} with input "${input.input}".`);
      const result = parser.parse(input.input);
      info(`Comparing parse results for string "${input.input}"...`);
      compareExtractResults(result, input.expected, "result");
    }
  }
});
