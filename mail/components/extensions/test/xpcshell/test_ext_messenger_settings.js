/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);
var { ExtensionsUI } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionsUI.sys.mjs"
);
var { AddonTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/AddonTestUtils.sys.mjs"
);

function clearUserPrefs() {
  Services.prefs.clearUserPref("mailnews.wraplength");
  Services.prefs.clearUserPref("mailnews.send_plaintext_flowed");
  Services.prefs.clearUserPref("mail.spellcheck.inline");
}

add_setup(async () => {
  ExtensionTestUtils.mockAppInfo();
  AddonTestUtils.init(this);

  // Start with defaults.
  clearUserPrefs();
  // Return to defaults at end of test.
  registerCleanupFunction(clearUserPrefs);
});

add_task(async function test_message_settings() {
  // Writable settings go through ExtensionSettingsStore, which needs the
  // AddonManager to be running so that it can resolve the calling extension.
  await AddonTestUtils.promiseStartupManager();

  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const tests = [
          {
            name: "messagePlainTextFlowedOutputEnabled",
            expected: {
              value: true,
              levelOfControl: "not_controllable",
            },
          },
          {
            name: "messagePlainTextFlowedOutputEnabled",
            pref: {
              setFunc: "setBoolPref",
              name: "mailnews.send_plaintext_flowed",
              value: false,
            },
            expected: {
              value: false,
              levelOfControl: "not_controllable",
            },
          },
          {
            name: "messageLineLengthLimit",
            expected: {
              value: 72,
              levelOfControl: "not_controllable",
            },
          },
          {
            name: "messageLineLengthLimit",
            pref: {
              setFunc: "setIntPref",
              name: "mailnews.wraplength",
              value: "99",
            },
            expected: {
              value: 99,
              levelOfControl: "not_controllable",
            },
          },
          {
            name: "readerDisplayAttachmentsInline",
            expected: {
              value: true,
              levelOfControl: "not_controllable",
            },
          },
          {
            name: "readerDisplayAttachmentsInline",
            pref: {
              setFunc: "setBoolPref",
              name: "mail.inline_attachments",
              value: false,
            },
            expected: {
              value: false,
              levelOfControl: "not_controllable",
            },
          },
          {
            name: "composeInlineSpellCheckEnabled",
            expected: {
              value: true,
              levelOfControl: "controllable_by_this_extension",
            },
          },
          {
            name: "composeInlineSpellCheckEnabled",
            set: { value: false },
            expected: {
              value: false,
              levelOfControl: "controlled_by_this_extension",
            },
          },
          {
            name: "composeInlineSpellCheckEnabled",
            clear: true,
            expected: {
              value: true,
              levelOfControl: "controllable_by_this_extension",
            },
          },
        ];

        for (let idx = 0; idx < tests.length; idx++) {
          const { pref, set, clear, name, expected } = tests[idx];
          if (pref) {
            await window.sendMessage(pref.setFunc, pref.name, pref.value);
          }
          if (set) {
            await browser.messengerSettings[name].set(set);
          }
          if (clear) {
            await browser.messengerSettings[name].clear({});
          }
          window.assertDeepEqual(
            expected,
            await browser.messengerSettings[name].get({}),
            `[Test #${idx}] Value for ${name} should be correct`,
            { strict: true }
          );
        }

        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 2,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["messengerSettings"],
    },
    useAddonManager: "temporary",
  });

  extension.onMessage("setBoolPref", (name, value) => {
    Services.prefs.setBoolPref(name, value);
    extension.sendMessage();
  });
  extension.onMessage("setIntPref", (name, value) => {
    Services.prefs.setIntPref(name, value);
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
