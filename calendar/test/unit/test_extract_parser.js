/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the CalExtractParser module.
 */
var { CalExtractParseNode, extendParseRule, prepareArguments } = ChromeUtils.importESModule(
  "resource:///modules/calendar/extract/CalExtractParser.sys.mjs"
);

/**
 * Tests to ensure extendParseRule() expands parse rules as we desire.
 */
add_task(function testExtendParseRule() {
  const action = () => {};

  const tests = [
    {
      name: "parse rules are expanded correctly",
      input: {
        name: "text",
        patterns: ["TEXT"],
        action,
      },
      expected: {
        name: "text",
        patterns: ["TEXT"],
        action,
        flags: [0],
        graph: {
          symbol: null,
          flags: null,
          descendants: [
            {
              symbol: "TEXT",
              flags: 0,
              descendants: [],
            },
          ],
        },
      },
    },
    {
      name: "flags are detected correctly",
      input: {
        name: "text",
        patterns: ["CHAR+", "TEXT?", "characters*"],
        action,
      },
      expected: {
        name: "text",
        action,
        patterns: ["CHAR", "TEXT", "characters"],
        flags: [
          CalExtractParseNode.FLAG_NONEMPTY | CalExtractParseNode.FLAG_MULTIPLE,
          CalExtractParseNode.FLAG_OPTIONAL,
          CalExtractParseNode.FLAG_OPTIONAL | CalExtractParseNode.FLAG_MULTIPLE,
        ],
        graph: {
          symbol: null,
          flags: null,
          descendants: [
            {
              symbol: "CHAR",
              flags: CalExtractParseNode.FLAG_NONEMPTY | CalExtractParseNode.FLAG_MULTIPLE,
              descendants: [
                {
                  symbol: "CHAR",
                },
                {
                  symbol: "TEXT",
                  flags: CalExtractParseNode.FLAG_OPTIONAL,
                  descendants: [
                    {
                      symbol: "characters",
                      flags: CalExtractParseNode.FLAG_OPTIONAL | CalExtractParseNode.FLAG_MULTIPLE,
                      descendants: [
                        {
                          symbol: "characters",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    },
  ];

  for (const test of tests) {
    info(`Test extendParseRule(): ${test.name}`);
    compareExtractResults(extendParseRule(test.input), test.expected);
  }
});

/**
 * Tests prepareArguments() gives the correct arguments.
 */
add_task(function testReconcileArguments() {
  const tests = [
    {
      name: "patterns without no flags bits are untouched",
      rule: {
        name: "text",
        patterns: ["CHAR", "TEXT", "characters"],
        flags: [0, 0, 0],
      },
      matched: [
        ["CHAR", "is char"],
        ["TEXT", "is text"],
        ["characters", "is characters"],
      ],
      expected: ["is char", "is text", "is characters"],
    },
    {
      name: "multi patterns are turned into arrays",
      rule: {
        name: "text",
        patterns: ["CHAR", "TEXT", "characters"],
        flags: [
          CalExtractParseNode.FLAG_NONEMPTY | CalExtractParseNode.FLAG_MULTIPLE,
          CalExtractParseNode.FLAG_OPTIONAL,
          CalExtractParseNode.FLAG_OPTIONAL | CalExtractParseNode.FLAG_MULTIPLE,
        ],
      },
      matched: [
        ["CHAR", "is char"],
        ["TEXT", "is text"],
        ["characters", "is characters"],
      ],
      expected: [["is char"], "is text", ["is characters"]],
    },
    {
      name: "unmatched optional patterns are null",
      rule: {
        name: "text",
        patterns: ["CHAR", "TEXT", "characters"],
        flags: [
          CalExtractParseNode.FLAG_NONEMPTY | CalExtractParseNode.FLAG_MULTIPLE,
          CalExtractParseNode.FLAG_OPTIONAL,
          CalExtractParseNode.FLAG_OPTIONAL | CalExtractParseNode.FLAG_MULTIPLE,
        ],
      },
      matched: [
        ["CHAR", "is char"],
        ["characters", "is characters"],
      ],
      expected: [["is char"], null, ["is characters"]],
    },
  ];

  for (const test of tests) {
    info(`Test prepareArguments(): ${test.name}`);
    compareExtractResults(prepareArguments(test.rule, test.matched), test.expected);
  }
});
