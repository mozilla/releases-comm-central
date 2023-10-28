/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

const ADDON_ID = "policytest@mozilla.com";
const BASE_URL =
  "http://mochi.test:8888/browser/comm/mail/components/enterprisepolicies/tests/browser";

async function isExtensionLockedAndUpdateDisabled(win, addonID) {
  const addonCard = await BrowserTestUtils.waitForCondition(() => {
    return win.document.querySelector(`addon-card[addon-id="${addonID}"]`);
  }, `Get addon-card for "${addonID}"`);
  const disableBtn = addonCard.querySelector('[action="toggle-disabled"]');
  const removeBtn = addonCard.querySelector('panel-item[action="remove"]');
  ok(removeBtn.disabled, "Remove button should be disabled");
  ok(disableBtn.hidden, "Disable button should be hidden");
  const updateRow = addonCard.querySelector(".addon-detail-row-updates");
  is(updateRow.hidden, true, "Update row should be hidden");
}

add_task(async function test_addon_install() {
  const installPromise = waitForAddonInstall(ADDON_ID);
  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        "policytest@mozilla.com": {
          install_url: `${BASE_URL}/policytest_v0.1.xpi`,
          installation_mode: "force_installed",
          updates_disabled: true,
        },
      },
    },
  });
  await installPromise;
  const addon = await AddonManager.getAddonByID(ADDON_ID);
  isnot(addon, null, "Addon not installed.");
  is(addon.version, "0.1", "Addon version is correct");

  Assert.deepEqual(
    addon.installTelemetryInfo,
    { source: "enterprise-policy" },
    "Got the expected addon.installTelemetryInfo"
  );
});

add_task(async function test_addon_locked_update_disabled() {
  const tabmail = document.getElementById("tabmail");
  const index = tabmail.tabInfo.length;
  await window.openAddonsMgr("addons://detail/" + encodeURIComponent(ADDON_ID));
  const tab = tabmail.tabInfo[index];
  const browser = tab.browser;
  const win = browser.contentWindow;

  await isExtensionLockedAndUpdateDisabled(win, ADDON_ID);

  tabmail.closeTab(tab);
});

add_task(async function test_addon_uninstall() {
  const uninstallPromise = waitForAddonUninstall(ADDON_ID);
  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        "policytest@mozilla.com": {
          installation_mode: "blocked",
        },
      },
    },
  });
  await uninstallPromise;
  const addon = await AddonManager.getAddonByID(ADDON_ID);
  is(addon, null, "Addon should be uninstalled.");
});
