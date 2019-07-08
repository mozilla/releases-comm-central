"use strict";

const xpcshellTestConfig = require("eslint-plugin-mozilla/lib/configs/xpcshell-test.js");
const browserTestConfig = require("eslint-plugin-mozilla/lib/configs/browser-test.js");

/**
 * Some configurations have overrides, which can't be specified within overrides,
 * so we need to remove them.
 */
function removeOverrides(config) {
  config = {...config};
  delete config.overrides;
  return config;
}

const xpcshellTestPaths = [
  "**/test*/unit*/",
  "**/test*/xpcshell/",
  "chat/**/test*/",
];

const browserTestPaths = [
  "**/test*/**/browser/",
];

module.exports = {
  "root": true,

  // We would like the same base rules as provided by
  // mozilla/tools/lint/eslint/eslint-plugin-mozilla/lib/configs/recommended.js
  "extends": [
    "plugin:mozilla/recommended",
  ],

  // When adding items to this file please check for effects on sub-directories.
  "plugins": [
    "html",
    "mozilla",
  ],

  "rules": {
    "func-names": ["error", "never"],
    "no-multi-spaces": ["error", {
      exceptions: {
        "ArrayExpression": true,
        "AssignmentExpression": true,
        "ObjectExpression": true,
        "VariableDeclarator": true,
      },
      ignoreEOLComments: true,
    }],
    "prettier/prettier": "off",
    "semi-spacing": ["error", {"before": false, "after": true}],
    "space-in-parens": ["error", "never"],


    // Require spacing around =>
    "arrow-spacing": "error",

    // Always require spacing around a single line block
    "block-spacing": "error",

    // No newline before open brace for a block
    "brace-style": ["error", "1tbs", { "allowSingleLine": true }],

    // Require trailing commas for easy list extension and consistent style.
    "comma-dangle": ["error", "always-multiline"],

    // No space before always a space after a comma
    "comma-spacing": ["error", {"after": true, "before": false}],

    // Commas at the end of the line not the start
    "comma-style": "error",

    // Don't require spaces around computed properties
    "computed-property-spacing": ["error", "never"],

    // Note that this rule is likely to be overridden on a per-directory basis
    // very frequently.
    "curly": "off",

    // Always require a trailing EOL
    "eol-last": "error",

    // No spaces between function name and parentheses
    "func-call-spacing": "error",

    // Require function* name()
    "generator-star-spacing": ["error", {"after": true, "before": false}],

    // Space after colon not before in property declarations
    "key-spacing": ["error", {
      "afterColon": true,
      "beforeColon": false,
      "mode": "minimum",
    }],

    // Require spaces before and after keywords
    "keyword-spacing": "error",

    // Unix linebreaks
    "linebreak-style": ["error", "unix"],

    // Disallow tabs.
    "no-tabs": "error",

    // No trailing whitespace
    "no-trailing-spaces": "error",

    // Disallow whitespace before properties.
    "no-whitespace-before-property": "error",

    // Prohibit blank lines at the beginning and end of blocks.
    "padded-blocks": ["error", "never"],

    // Require double-quotes everywhere, except where quotes are escaped
    // or template literals are used.
    "quotes": ["error", "double", {
      "allowTemplateLiterals": true,
      "avoidEscape": true,
    }],

    // No spacing inside rest or spread expressions
    "rest-spread-spacing": "error",

    // Always require semicolon at end of statement
    "semi": ["error", "always"],

    // Require space before blocks
    "space-before-blocks": "error",

    // Never use spaces before function parentheses
    "space-before-function-paren": ["error", {
      "anonymous": "never",
      "asyncArrow": "always",
      "named": "never",
    }],

    // No space padding in parentheses
    // "space-in-parens": ["error", "never"],

    // Require spaces around operators
    "space-infix-ops": ["error", { "int32Hint": true }],

    // ++ and -- should not need spacing
    "space-unary-ops": ["error", {
      "nonwords": false,
      "overrides": {
        "typeof": false, // We tend to use typeof as a function call
      },
      "words": true,
    }],

    // Requires or disallows a whitespace (space or tab) beginning a comment
    "spaced-comment": ["error", "always", { "markers": ["#"] }],
  },

  // To avoid bad interactions of the html plugin with the xml preprocessor in
  // eslint-plugin-mozilla, we turn off processing of the html plugin for .xml
  // files.
  "settings": {
    "html/xml-extensions": [ ".xhtml" ],
  },

  "overrides": [{
    // eslint-plugin-html handles eol-last slightly different - it applies to
    // each set of script tags, so we turn it off here.
    "files": "**/*.*html",
    "rules": {
      "eol-last": "off",
    },
  }, {
    "files": "**/.eslintrc.js",
    "env": {
      "node": true,
    },
  }, {
    ...removeOverrides(xpcshellTestConfig),
    "files": xpcshellTestPaths.map(path => `${path}**`),
    "rules": {
      "func-names": "off",
      "mozilla/import-headjs-globals": "error",
    },
  }, {
    // If it is an xpcshell head file, we turn off global unused variable checks, as it
    // would require searching the other test files to know if they are used or not.
    // This would be expensive and slow, and it isn't worth it for head files.
    // We could get developers to declare as exported, but that doesn't seem worth it.
    "files": xpcshellTestPaths.map(path => `${path}head*.js`),
    "rules": {
      "no-unused-vars": ["error", {
        "args": "none",
        "vars": "local",
      }],
    },
  }, {
    ...browserTestConfig,
    "files": browserTestPaths.map(path => `${path}**`),
  }],
};
