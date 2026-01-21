/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const lazy = {};

const { Preferences } = ChromeUtils.importESModule(
  "resource://gre/modules/Preferences.sys.mjs"
);
const { updateAppInfo, getAppInfo } = ChromeUtils.importESModule(
  "resource://testing-common/AppInfo.sys.mjs"
);
const { FileTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/FileTestUtils.sys.mjs"
);
const { PermissionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PermissionTestUtils.sys.mjs"
);
ChromeUtils.defineESModuleGetters(lazy, {
  SearchService: "moz-src:///toolkit/components/search/SearchService.sys.mjs",
  SearchTestUtils: "resource://testing-common/SearchTestUtils.sys.mjs",
});
const { EnterprisePolicyTesting } = ChromeUtils.importESModule(
  "resource://testing-common/EnterprisePolicyTesting.sys.mjs"
);

updateAppInfo({
  name: "XPCShell",
  ID: "xpcshell@tests.mozilla.org",
  version: "48",
  platformVersion: "48",
});

// This initializes the policy engine for xpcshell tests
const policies = Cc["@mozilla.org/enterprisepolicies;1"].getService(
  Ci.nsIObserver
);
policies.observe(null, "policies-startup", null);

async function setupPolicyEngineWithJson(json, customSchema) {
  if (typeof json != "object") {
    const filePath = do_get_file(json ? json : "non-existing-file.json").path;
    return EnterprisePolicyTesting.setupPolicyEngineWithJson(
      filePath,
      customSchema
    );
  }
  return EnterprisePolicyTesting.setupPolicyEngineWithJson(json, customSchema);
}

/**
 * Loads a new enterprise policy, and re-initialise the search service
 * with the new policy. Also waits for the search service to write the settings
 * file to disk.
 *
 * @param {object} json - The enterprise policy to use.
 * @param {object} customSchema - A custom schema to use to validate the
 *   enterprise policy.
 */
async function setupPolicyEngineWithJsonWithSearch(json, customSchema) {
  lazy.SearchService.wrappedJSObject.reset();
  if (typeof json != "object") {
    const filePath = do_get_file(json ? json : "non-existing-file.json").path;
    await EnterprisePolicyTesting.setupPolicyEngineWithJson(
      filePath,
      customSchema
    );
  } else {
    await EnterprisePolicyTesting.setupPolicyEngineWithJson(json, customSchema);
  }
  const settingsWritten = lazy.SearchTestUtils.promiseSearchNotification(
    "write-settings-to-disk-complete"
  );
  await lazy.SearchService.init();
  return settingsWritten;
}

function checkLockedPref(prefName, prefValue) {
  EnterprisePolicyTesting.checkPolicyPref(prefName, prefValue, true);
}

function checkUnlockedPref(prefName, prefValue) {
  EnterprisePolicyTesting.checkPolicyPref(prefName, prefValue, false);
}

function checkUserPref(prefName, prefValue) {
  equal(
    Preferences.get(prefName),
    prefValue,
    `Pref ${prefName} has the correct value`
  );
}

function checkClearPref(prefName) {
  equal(
    Services.prefs.prefHasUserValue(prefName),
    false,
    `Pref ${prefName} has no user value`
  );
}

function checkDefaultPref(prefName) {
  const defaultPrefBranch = Services.prefs.getDefaultBranch("");
  const prefType = defaultPrefBranch.getPrefType(prefName);
  notEqual(
    prefType,
    Services.prefs.PREF_INVALID,
    `Pref ${prefName} is set on the default branch`
  );
}

function checkUnsetPref(prefName) {
  const defaultPrefBranch = Services.prefs.getDefaultBranch("");
  const prefType = defaultPrefBranch.getPrefType(prefName);
  equal(
    prefType,
    Services.prefs.PREF_INVALID,
    `Pref ${prefName} is not set on the default branch`
  );
}
