/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { EnterprisePolicyTesting, PoliciesPrefTracker } =
  ChromeUtils.importESModule(
    "resource://testing-common/EnterprisePolicyTesting.sys.mjs"
  );

PoliciesPrefTracker.start();

async function setupPolicyEngineWithJson(json, customSchema) {
  PoliciesPrefTracker.restoreDefaultValues();
  if (typeof json != "object") {
    let filePath = getTestFilePath(json ? json : "non-existing-file.json");
    return EnterprisePolicyTesting.setupPolicyEngineWithJson(
      filePath,
      customSchema
    );
  }
  return EnterprisePolicyTesting.setupPolicyEngineWithJson(json, customSchema);
}

function checkLockedPref(prefName, prefValue) {
  EnterprisePolicyTesting.checkPolicyPref(prefName, prefValue, true);
}

function checkUnlockedPref(prefName, prefValue) {
  EnterprisePolicyTesting.checkPolicyPref(prefName, prefValue, false);
}

async function withNewTab(options, taskFn) {
  let tab = window.openContentTab(options.url);
  await BrowserTestUtils.browserLoaded(tab.browser);

  let result = await taskFn(tab.browser);

  let tabmail = document.getElementById("tabmail");
  tabmail.closeTab(tab);
  return Promise.resolve(result);
}

add_setup(async function policies_headjs_startWithCleanSlate() {
  if (Services.policies.status != Ci.nsIEnterprisePolicies.INACTIVE) {
    await setupPolicyEngineWithJson("");
  }
  is(
    Services.policies.status,
    Ci.nsIEnterprisePolicies.INACTIVE,
    "Engine is inactive at the start of the test"
  );
});

registerCleanupFunction(async function policies_headjs_finishWithCleanSlate() {
  if (Services.policies.status != Ci.nsIEnterprisePolicies.INACTIVE) {
    await setupPolicyEngineWithJson("");
  }
  is(
    Services.policies.status,
    Ci.nsIEnterprisePolicies.INACTIVE,
    "Engine is inactive at the end of the test"
  );

  EnterprisePolicyTesting.resetRunOnceState();
  PoliciesPrefTracker.stop();
});

function waitForAddonInstall(addon_id) {
  return new Promise(resolve => {
    let listener = {
      onInstallEnded(install, addon) {
        if (addon.id == addon_id) {
          AddonManager.removeInstallListener(listener);
          resolve();
        }
      },
      onDownloadFailed() {
        AddonManager.removeInstallListener(listener);
        resolve();
      },
      onInstallFailed() {
        AddonManager.removeInstallListener(listener);
        resolve();
      },
    };
    AddonManager.addInstallListener(listener);
  });
}

function waitForAddonUninstall(addon_id) {
  return new Promise(resolve => {
    let listener = {};
    listener.onUninstalled = addon => {
      if (addon.id == addon_id) {
        AddonManager.removeAddonListener(listener);
        resolve();
      }
    };
    AddonManager.addAddonListener(listener);
  });
}
