"use strict";

module.exports = {
  "root": true,

  // We would like the same base rules as provided by
  // mozilla/tools/lint/eslint/eslint-plugin-mozilla/lib/configs/recommended.js
  "extends": [
    "plugin:mozilla/recommended"
  ],

  // When adding items to this file please check for effects on sub-directories.
  "plugins": [
    "mozilla"
  ],

  // The html plugin is enabled via a command line option on eslint. To avoid
  // bad interactions with the xml preprocessor in eslint-plugin-mozilla, we
  // turn off processing of the html plugin for .xml files.
  "settings": {
    "html/xml-extensions": [ ".xhtml" ]
  },
};
