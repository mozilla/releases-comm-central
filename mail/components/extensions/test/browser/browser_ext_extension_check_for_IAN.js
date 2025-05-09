/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

async function checkInitialPrefs(expected) {
  for (const [key, value] of Object.entries(expected)) {
    await TestUtils.waitForCondition(
      () => Services.prefs.getBoolPref(key, null) === value,
      `${key} should be set to ${value}`
    );
  }
}

async function checkChangedPrefs(expected) {
  const promises = [];
  for (const [key, after] of Object.entries(expected)) {
    const before = Services.prefs.getBoolPref(key, null);
    if (before == after) {
      continue;
    }
    promises.push(
      TestUtils.waitForPrefChange(
        key,
        value => value == after,
        `${key} should switch to ${after}`
      )
    );
  }
  await Promise.all(promises);

  for (const [key, after] of Object.entries(expected)) {
    Assert.equal(
      Services.prefs.getBoolPref(key, null),
      after,
      `${key} should be set to ${after}`
    );
  }
}

add_task(async function test_extension_status_prefs() {
  createAccount();

  const webExtension = ExtensionTestUtils.loadExtension({
    useAddonManager: "permanent",
    files: {
      "background.js": function () {
        browser.test.notifyPass("finished");
      },
    },
    manifest: {
      browser_specific_settings: {
        gecko: { id: "webExtension@mochi.test" },
      },
      background: { scripts: ["background.js"] },
    },
  });

  const experiment = ExtensionTestUtils.loadExtension({
    useAddonManager: "permanent",
    files: {
      "schema.json": JSON.stringify([
        {
          namespace: "testapi",
          functions: [
            {
              name: "test",
              type: "function",
              async: true,
              parameters: [],
            },
          ],
        },
      ]),
      "implementation.js": () => {
        this.testapi = class extends ExtensionCommon.ExtensionAPI {
          getAPI() {
            return {
              testapi: {
                async test() {
                  return true;
                },
              },
            };
          }
        };
      },
      "background.js": function () {
        browser.test.notifyPass("finished");
      },
    },
    manifest: {
      browser_specific_settings: {
        gecko: { id: "experiment@mochi.test" },
      },
      background: { scripts: ["background.js"] },
      experiment_apis: {
        testapi: {
          schema: "schema.json",
          parent: {
            scopes: ["addon_parent"],
            paths: [["testapi"]],
            script: "implementation.js",
          },
        },
      },
    },
  });

  // Wait till both prefs are set to false (initial values are true). This will
  // make sure that the initial check in MailGlue.sys.mjs has run.
  await checkInitialPrefs({
    "extensions.hasExtensionsInstalled": false,
    "extensions.hasExperimentsInstalled": false,
  });

  // Install the WebExtension.
  const checkPrefsAfterWebExtensionInstall = checkChangedPrefs({
    "extensions.hasExtensionsInstalled": true,
    "extensions.hasExperimentsInstalled": false,
  });
  await webExtension.startup();
  await webExtension.awaitFinish("finished");
  await checkPrefsAfterWebExtensionInstall;

  // Install the Experiment.
  const checkPrefsAfterExpExtensionInstall = checkChangedPrefs({
    "extensions.hasExtensionsInstalled": true,
    "extensions.hasExperimentsInstalled": true,
  });
  await experiment.startup();
  await experiment.awaitFinish("finished");
  await checkPrefsAfterExpExtensionInstall;

  // Uninstall the Experiment.
  const checkPrefsAfterExpExtensionUnInstall = checkChangedPrefs({
    "extensions.hasExtensionsInstalled": true,
    "extensions.hasExperimentsInstalled": false,
  });
  await experiment.unload();
  await checkPrefsAfterExpExtensionUnInstall;

  // Uninstall the WebExtension.
  const checkPrefsAfterWebExtensionUnInstall = checkChangedPrefs({
    "extensions.hasExtensionsInstalled": false,
    "extensions.hasExperimentsInstalled": false,
  });
  await webExtension.unload();
  await checkPrefsAfterWebExtensionUnInstall;
});
