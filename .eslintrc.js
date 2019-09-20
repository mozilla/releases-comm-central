"use strict";

const xpcshellTestConfig = require("eslint-plugin-mozilla/lib/configs/xpcshell-test.js");
const browserTestConfig = require("eslint-plugin-mozilla/lib/configs/browser-test.js");

/**
 * Some configurations have overrides, which can't be specified within overrides,
 * so we need to remove them.
 */
function removeOverrides(config) {
  config = { ...config };
  delete config.overrides;
  return config;
}

const xpcshellTestPaths = [
  "**/test*/unit*/",
  "**/test*/xpcshell/",
  "chat/**/test*/",
];

const browserTestPaths = ["**/test*/**/browser/"];

module.exports = {
  root: true,

  // We would like the same base rules as provided by
  // mozilla/tools/lint/eslint/eslint-plugin-mozilla/lib/configs/recommended.js
  extends: ["plugin:mozilla/recommended"],

  // When adding items to this file please check for effects on sub-directories.
  plugins: ["html", "mozilla"],

  rules: {
    "func-names": ["error", "never"],
    "no-multi-spaces": [
      "error",
      {
        exceptions: {
          ArrayExpression: true,
          AssignmentExpression: true,
          ObjectExpression: true,
          VariableDeclarator: true,
        },
        ignoreEOLComments: true,
      },
    ],
    "semi-spacing": ["error", { before: false, after: true }],
    "space-in-parens": ["error", "never"],
    curly: ["error", "all"],

    // Use brace-style because Prettier covers most brace issues but not this:
    //
    //     }
    //     // a comment
    //     else {
    //
    // Allow single line for inline JS in XUL files.
    "brace-style": ["error", "1tbs", { allowSingleLine: true }],
  },

  // To avoid bad interactions of the html plugin with the xml preprocessor in
  // eslint-plugin-mozilla, we turn off processing of the html plugin for .xml
  // files.
  settings: {
    "html/xml-extensions": [".xhtml"],
  },

  overrides: [
    {
      // eslint-plugin-html handles eol-last slightly different - it applies to
      // each set of script tags, so we turn it off here.
      files: "**/*.*html",
      rules: {
        "eol-last": "off",
      },
    },
    {
      files: "**/.eslintrc.js",
      env: {
        node: true,
      },
    },
    {
      ...removeOverrides(xpcshellTestConfig),
      files: xpcshellTestPaths.map(path => `${path}**`),
      rules: {
        "func-names": "off",
        "mozilla/import-headjs-globals": "error",
      },
    },
    {
      // If it is an xpcshell head file, we turn off global unused variable checks, as it
      // would require searching the other test files to know if they are used or not.
      // This would be expensive and slow, and it isn't worth it for head files.
      // We could get developers to declare as exported, but that doesn't seem worth it.
      files: xpcshellTestPaths.map(path => `${path}head*.js`),
      rules: {
        "no-unused-vars": [
          "error",
          {
            args: "none",
            vars: "local",
          },
        ],
      },
    },
    {
      ...browserTestConfig,
      files: browserTestPaths.map(path => `${path}**`),
    },
  ],
};
