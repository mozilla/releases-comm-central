/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import eslintConfigPrettier from "eslint-config-prettier";
import mozilla from "eslint-plugin-mozilla";
import json from "@eslint/json";
import html from "eslint-plugin-html";
import importPlugin from "eslint-plugin-import";
import globals from "globals";
import globalIgnores from "./eslint-ignores.config.mjs";

function readFile(filePath) {
  return fs
    .readFileSync(filePath, { encoding: "utf-8" })
    .split("\n")
    .filter(p => p && !p.startsWith("#"))
    .map(p => p.replace(/^comm\//, ""));
}

const dirname = path.dirname(fileURLToPath(import.meta.url));
const ignorePatterns = [
  ...readFile(path.join(dirname, "tools", "lint", "ThirdPartyPaths.txt")),
  ...readFile(path.join(dirname, "tools", "lint", "Generated.txt")),
];

function wrapPathsWithAllExts(paths, excludedExts = []) {
  const extensions = mozilla.allFileExtensions.filter(
    f => !excludedExts.includes(f)
  );
  return paths.map(p => {
    if (p.endsWith("**")) {
      return p + `/*.{${extensions.join(",")}}`;
    }
    if (p.endsWith("/")) {
      return p + `**/*.{${extensions.join(",")}}`;
    }
    return p;
  });
}

const xpcshellTestPaths = [
  "**/test*/unit*/",
  "**/test*/xpcshell/",
  "chat/**/test*/",
  "mailnews/test/",
];

const browserTestPaths = ["**/test*/**/browser/"];

export default [
  {
    name: "import-plugin-settings",
    settings: {
      "import/extensions": [".mjs"],
      "import/resolver": {
        [path.resolve(import.meta.dirname, "../srcdir-resolver.js")]: {},
        node: {},
      },
    },
  },
  {
    name: "ignores",
    ignores: [...globalIgnores, ...ignorePatterns],
  },
  {
    name: "source-type-script",
    files: ["**/*.{js,json,html,sjs,xhtml,globals}"],
    languageOptions: {
      sourceType: "script",
    },
  },
  ...mozilla.configs["flat/recommended"],
  {
    name: "json-recommended-with-comments",
    files: ["**/*.json"],
    language: "json/jsonc",
    ...json.configs.recommended,
  },
  {
    name: "json-recommended-no-comments",
    files: ["**/package.json", "**/*.globals"],
    language: "json/json",
    ...json.configs.recommended,
  },
  {
    name: "eslint-plugin-html",
    files: ["**/*.html", "**/*.xhtml"],
    plugins: { html },
  },
  {
    name: "comm-overrides",
    files: wrapPathsWithAllExts(["**"]),

    rules: {
      complexity: ["error", 80],
      "func-names": ["error", "never"],
      "mozilla/prefer-boolean-length-check": "off",
      // Enforce using `let` only when variables are reassigned.
      "prefer-const": ["error", { destructuring: "all" }],
    },
  },
  {
    name: "define-globals-for-browser-env",
    files: wrapPathsWithAllExts(["**"], ["sjs"]),
    ignores: [
      "**/*.sys.mjs",
      "**/?(*.)worker.?(m)js",
      ...wrapPathsWithAllExts(xpcshellTestPaths, ["mjs", "sjs"]),
      "!mail/components/extensions/test/xpcshell/**/*.js",
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Generally we assume that all files, except mjs ones are in our
    // privileged and specific environment. mjs are handled separately by
    // the recommended configuration in eslint-plugin-mozilla.
    name: "define-privileged-and-specific-globas-for-most-files",
    files: wrapPathsWithAllExts(["**"], ["json"]),
    ignores: ["mail/components/storybook/**", "tools"],
    languageOptions: {
      globals: {
        ...mozilla.environments.privileged.globals,
        ...mozilla.environments.specific.globals,
      },
    },
  },
  {
    name: "define-globals-for-node-files",
    files: [
      // All .eslintrc.mjs files are in the node environment, so turn that
      // on here.
      "**/.eslintrc*.mjs",
      // .js files in the top-level are generally assumed to be node.
      "\.*.js",
      // *.config.js files are generally assumed to be configuration files
      // based for node.
      "**/*.config.js",
      // The resolver for moz-src for eslint, vscode etc.
      "srcdir-resolver.js",
    ],
    languageOptions: {
      globals: { ...globals.node, ...mozilla.turnOff(globals.browser) },
    },
  },
  {
    name: "define-globals-for-storybook-modules",
    files: ["mail/components/storybook/.storybook/**/*.mjs"],
    languageOptions: {
      // Adding node without disabling browser.
      globals: globals.node,
    },
  },
  {
    name: "eslint-plugin-import-rules",
    files: ["**/*.mjs"],
    plugins: { import: importPlugin },
    rules: {
      "import/default": "error",
      "import/export": "error",
      "import/named": "error",
      "import/namespace": "error",
      "import/newline-after-import": "error",
      "import/no-duplicates": "error",
      "import/no-absolute-path": "error",
      "import/no-named-default": "error",
      "import/no-named-as-default": "error",
      "import/no-named-as-default-member": "error",
      "import/no-self-import": "error",
      "import/no-unassigned-import": "error",
      "import/no-unresolved": [
        "error",
        // Bug 1773473 - Ignore resolver URLs for chrome and resource as we
        // do not yet have a resolver for them.
        { ignore: ["chrome://", "resource://"] },
      ],
      "import/no-useless-path-segments": "error",
    },
  },
  {
    name: "reduce-import-checks-for-stories",
    // Turn off no-unassigned-import for files that typically test our
    // custom elements, which are imported for the side effects (ie
    // the custom element being registered) rather than any particular
    // export:
    files: ["**/*.stories.mjs"],
    plugins: { import: importPlugin },
    rules: {
      "import/no-unassigned-import": "off",
      "import/no-unresolved": "off",
    },
  },
  {
    // If the storybook node modules aren't installed, a bunch of modules can't
    // be resolved.
    name: "storybook-node-import-no-unresolved",
    files: ["mail/components/storybook/.storybook/**/*.mjs"],
    rules: {
      "import/no-unresolved": "off",
    },
  },
  {
    ...mozilla.configs["flat/general-test"],
    files: wrapPathsWithAllExts(["**/test/**", "**/tests/**"]),
  },
  {
    ...mozilla.configs["flat/xpcshell-test"],
    files: wrapPathsWithAllExts(xpcshellTestPaths, ["mjs", "sjs"]),
  },
  {
    name: "no-unused-vars-for-xpcshell",
    // If it is a test head file, we turn off global unused variable checks, as it
    // would require searching the other test files to know if they are used or not.
    // This would be expensive and slow, and it isn't worth it for head files.
    // We could get developers to declare as exported, but that doesn't seem worth it.
    files: [
      ...browserTestPaths.map(filePath => `${filePath}head*.js`),
      ...xpcshellTestPaths.map(filePath => `${filePath}head*.js`),
    ],
    rules: {
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          vars: "local",
        },
      ],
    },
  },
  {
    ...mozilla.configs["flat/browser-test"],
    files: wrapPathsWithAllExts(browserTestPaths, ["mjs", "sjs"]),
  },
  {
    name: "valid-jsdoc-with-custom-element-tags",
    files: wrapPathsWithAllExts(["**"]),
    ...mozilla.configs["flat/valid-jsdoc"],
    settings: {
      jsdoc: {
        tagNamePreference: {
          attr: "attribute",
          cssprop: "cssproperty",
          tag: "tagname",
        },
      },
    },
    rules: {
      ...mozilla.configs["flat/valid-jsdoc"].rules,
      "jsdoc/check-tag-names": [
        "error",
        {
          definedTags: ["attribute", "cssproperty", "part", "slot", "tagname"],
        },
      ],
    },
  },
  // Local overrides
  {
    name: "comm-named-functions",
    files: wrapPathsWithAllExts(
      [...xpcshellTestPaths, ...browserTestPaths],
      ["mjs", "sjs"]
    ),
    rules: {
      "func-names": "off",
    },
  },
  {
    name: "calendar-tests-use-utc",
    files: ["calendar/test/**/*.js", "calendar/test/**/*.mjs"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          property: "getFullYear",
          message: "These tests run in UTC. Use 'getUTCFullYear' instead.",
        },
        {
          property: "getMonth",
          message: "These tests run in UTC. Use 'getUTCMonth' instead.",
        },
        {
          property: "getDay",
          message: "These tests run in UTC. Use 'getUTCDay' instead.",
        },
        {
          property: "getDate",
          message: "These tests run in UTC. Use 'getUTCDate' instead.",
        },
        {
          property: "getHours",
          message: "These tests run in UTC. Use 'getUTCHours' instead.",
        },
        {
          property: "getMinutes",
          message: "These tests run in UTC. Use 'getUTCMinutes' instead.",
        },
        {
          property: "setFullYear",
          message: "These tests run in UTC. Use 'setUTCFullYear' instead.",
        },
        {
          property: "setMonth",
          message: "These tests run in UTC. Use 'setUTCMonth' instead.",
        },
        {
          property: "setDay",
          message: "These tests run in UTC. Use 'setUTCDay' instead.",
        },
        {
          property: "setDate",
          message: "These tests run in UTC. Use 'setUTCDate' instead.",
        },
        {
          property: "setHours",
          message: "These tests run in UTC. Use 'setUTCHours' instead.",
        },
        {
          property: "setMinutes",
          message: "These tests run in UTC. Use 'setUTCMinutes' instead.",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "[callee.name='Date'][arguments.length>=2]",
          message:
            "These tests run in UTC. Use 'new Date(Date.UTC(...))' to construct a Date with arguments.",
        },
      ],
    },
  },
  {
    name: "webextension-tests",
    files: [
      "mail/base/test/browser/menus/browser_browserContext.js",
      "mail/base/test/browser/webextensions/**/*.js",
      "mail/base/test/browser/widgets/browser_formPickers_webextensions.js",
      "mail/components/extensions/test/**/*.js",
      "mail/components/preferences/test/browser/browser_cloudfile.js",
      "mail/test/browser/shared-modules/**/*.mjs",
    ],
    languageOptions: {
      globals: globals.webextensions,
    },
  },
  {
    name: "webextension-child-globals",
    files: ["mail/components/extensions/child/**/*.js"],
    languageOptions: {
      globals: {
        // These are defined in the WebExtension script scopes by ExtensionCommon.sys.mjs.
        // From toolkit/components/extensions/.eslintrc.js.
        ExtensionAPI: true,
        ExtensionCommon: true,
        extensions: true,
        ExtensionUtils: true,

        // From toolkit/components/extensions/child/.eslintrc.js.
        EventManager: true,
      },
    },
  },
  {
    name: "webextension-parent-globals",
    files: ["mail/components/extensions/parent/*.js"],
    languageOptions: {
      globals: {
        // These are defined in the WebExtension script scopes by ExtensionCommon.sys.mjs.
        // From toolkit/components/extensions/.eslintrc.js.
        AppConstants: true,
        ExtensionAPI: true,
        ExtensionAPIPersistent: true,
        ExtensionCommon: true,
        ExtensionUtils: true,
        extensions: true,
        global: true,
        Services: true,
        XPCOMUtils: true,

        // From toolkit/components/extensions/parent/.eslintrc.js.
        CONTAINER_STORE: true,
        DEFAULT_STORE: true,
        EventEmitter: true,
        EventManager: true,
        InputEventManager: true,
        PRIVATE_STORE: true,
        TabBase: true,
        TabManagerBase: true,
        TabTrackerBase: true,
        WindowBase: true,
        WindowManagerBase: true,
        WindowTrackerBase: true,
        getContainerForCookieStoreId: true,
        getUserContextIdForCookieStoreId: true,
        getCookieStoreIdForOriginAttributes: true,
        getCookieStoreIdForContainer: true,
        getCookieStoreIdForTab: true,
        isContainerCookieStoreId: true,
        isDefaultCookieStoreId: true,
        isPrivateCookieStoreId: true,
        isValidCookieStoreId: true,

        // These are defined in ext-mail.js.
        ADDRESS_BOOK_WINDOW_URI: true,
        COMPOSE_WINDOW_URI: true,
        MAIN_WINDOW_URI: true,
        MESSAGE_WINDOW_URI: true,
        MESSAGE_PROTOCOLS: true,
        ExtensionError: true,
        ExtensionSupport: true,
        Tab: true,
        TabmailTab: true,
        Window: true,
        TabmailWindow: true,
        clickModifiersFromEvent: true,
        getNormalWindowReady: true,
        getRealFileForFile: true,
        getTabBrowser: true,
        getTabTabmail: true,
        getTabWindow: true,
        messageListTracker: true,
        messageTracker: true,
        spaceTracker: true,
        tabTracker: true,
        tagTracker: true,
        waitForMailTabReady: true,

        windowTracker: true,

        AccountManager: true,
        FolderManager: true,
        MessageListTracker: true,
        MessageManager: true,
        MessageTracker: true,

        // ext-browserAction.js
        browserActionFor: true,
      },
    },
    rules: {
      // From toolkit/components/extensions/.eslintrc.js.
      // Disable reject-importGlobalProperties because we don't want to include
      // these in the sandbox directly as that would potentially mean the
      // imported properties would be instantiated up-front rather than lazily.
      "mozilla/reject-importGlobalProperties": "off",
    },
  },
  {
    name: "no-more-globals-in-msgcomposecommands",
    files: ["mail/components/compose/content/MsgComposeCommands.js"],
    rules: {
      "mozilla/no-more-globals": "error",
    },
  },
  {
    name: "redux-immutable-slices",
    files: ["**/*Slice.mjs"],
    rules: {
      "no-param-reassign": ["error", { props: false }],
    },
  },
  /**
   * The items below should always be the last items in this order:
   *
   * - Enable eslint-config-prettier.
   * - Enable curly.
   * - Rollouts
   */

  // Turn off rules that conflict with Prettier.
  { name: "eslint-config-prettier", ...eslintConfigPrettier },
  {
    name: "enable-curly",
    files: wrapPathsWithAllExts(["**/"]),
    rules: {
      // Require braces around blocks that start a new line. This must be
      // configured after eslint-config-prettier is included, as otherwise
      // eslint-config-prettier disables the curly rule. Hence, we do
      // not include it in
      // `tools/lint/eslint/eslint-plugin-mozilla/lib/configs/recommended.js`.
      curly: ["error", "all"],
    },
  },
];
