"use strict";

async function installFile(filename) {
  const MockFilePicker = SpecialPowers.MockFilePicker;
  MockFilePicker.init(window.browsingContext);
  MockFilePicker.setFiles([new FileUtils.File(getTestFilePath(filename))]);
  MockFilePicker.afterOpenCallback = MockFilePicker.cleanup;

  const { document } = await openAddonsMgr("addons://list/extension");

  // Do the install...
  await waitAboutAddonsViewLoaded(document);
  const installButton = document.querySelector('[action="install-from-file"]');
  installButton.click();
}

/**
 * Returns a promise that resolves with the install listener reason string
 * ("cancelled", "downloadFailed", "installed", or "failed").
 */
function promiseInstallResult() {
  return new Promise(resolve => {
    const listener = {
      onDownloadCancelled() {
        AddonManager.removeInstallListener(listener);
        resolve("cancelled");
      },
      onDownloadFailed() {
        AddonManager.removeInstallListener(listener);
        resolve("downloadFailed");
      },
      onInstallCancelled() {
        AddonManager.removeInstallListener(listener);
        resolve("cancelled");
      },
      onInstallEnded() {
        AddonManager.removeInstallListener(listener);
        resolve("installed");
      },
      onInstallFailed() {
        AddonManager.removeInstallListener(listener);
        resolve("failed");
      },
    };
    AddonManager.addInstallListener(listener);
  });
}

/**
 * Test that installing an experiment add-on while experiments are suppressed
 * shows the suppressed notification instead of the normal permissions prompt.
 */
add_task(async function test_suppressed_experiment_install() {
  // Enable experiment suppression.
  Services.prefs.setBoolPref("extensions.experiments.suppressed", true);

  const installPromise = promiseInstallResult();

  await installFile("addons/browser_webext_experiment.xpi");

  // The suppressed notification should appear instead of the permissions prompt.
  const panel = await promisePopupNotificationShown(
    "addon-webext-expsuppressed"
  );
  Assert.ok(panel, "Suppressed experiment notification should be shown");

  // Dismiss the notification.
  panel.button.click();

  const result = await installPromise;
  Assert.notEqual(
    result,
    "installed",
    "Suppressed experiment should not be installed"
  );

  // Verify the add-on is not installed.
  const addon = await AddonManager.getAddonByID(
    "experiment_test@tests.mozilla.org"
  );
  Assert.equal(addon, null, "Extension should not be installed");

  const tabmail = document.getElementById("tabmail");
  tabmail.closeTab(tabmail.currentTabInfo);

  Services.prefs.clearUserPref("extensions.experiments.suppressed");
});

/**
 * Test that an allow-listed experiment add-on can still be installed even when
 * experiments are suppressed. The normal experiment permissions prompt should
 * appear.
 */
add_task(async function test_allowlisted_experiment_bypasses_suppression() {
  // Enable experiment suppression.
  Services.prefs.setBoolPref("extensions.experiments.suppressed", true);

  const installPromise = promiseInstallResult();

  await installFile("addons/browser_webext_experiment_allowlisted.xpi");

  // The normal experiment permissions prompt should appear, NOT the suppressed
  // notification, because this add-on's ID is in the allow list.
  const panel = await promisePopupNotificationShown("addon-webext-permissions");
  // Verify this is actually an experiment by checking for the experiment
  // warning text in the permissions prompt.
  await checkNotification(
    panel,
    isDefaultIcon,
    [["webext-perms-description-experiment-access"]],
    false,
    true
  );

  // Cancel the install.
  panel.secondaryButton.click();

  const result = await installPromise;
  Assert.equal(result, "cancelled", "Installation should be cancelled");

  const addon = await AddonManager.getAddonByID("tbpro-add-on@thunderbird.net");
  Assert.equal(addon, null, "Extension should not be installed");

  const tabmail = document.getElementById("tabmail");
  tabmail.closeTab(tabmail.currentTabInfo);

  Services.prefs.clearUserPref("extensions.experiments.suppressed");
});

/**
 * Test that a temporarily installed experiment add-on is exempt from
 * suppression, even when the pref is on.
 */
add_task(async function test_temporary_experiment_bypasses_suppression() {
  // Enable experiment suppression.
  Services.prefs.setBoolPref("extensions.experiments.suppressed", true);

  // Install the experiment as a temporary add-on (like about:debugging does).
  const xpiFile = new FileUtils.File(
    getTestFilePath("addons/browser_webext_experiment.xpi")
  );
  const addon = await AddonManager.installTemporaryAddon(xpiFile);
  Assert.ok(addon, "Temporary experiment add-on should be installed");
  Assert.equal(
    addon.id,
    "experiment_test@tests.mozilla.org",
    "Add-on ID should match"
  );
  Assert.ok(addon.isActive, "Temporary experiment add-on should be active");

  // Open about:addons — no suppression banner should appear for temporary
  // add-ons even though suppression is on.
  const { document: addonDoc } = await openAddonsMgr("addons://list/extension");
  await waitAboutAddonsViewLoaded(addonDoc);

  const card = addonDoc.querySelector(
    `addon-card[addon-id="experiment_test@tests.mozilla.org"]`
  );
  Assert.ok(card, "Addon card should exist for temporary add-on");

  const messageBar = card.querySelector(".addon-card-message");
  Assert.ok(
    !messageBar || messageBar.hidden,
    "Warning banner should not be shown for temporary add-on"
  );

  // Clean up.
  const tabmail = document.getElementById("tabmail");
  tabmail.closeTab(tabmail.currentTabInfo);
  await addon.uninstall();
  Services.prefs.clearUserPref("extensions.experiments.suppressed");
});

/**
 * Test that the about:addons warning banner appears for an installed experiment
 * when suppression is enabled, and disappears when suppression is disabled.
 */
add_task(async function test_aboutaddons_suppressed_banner() {
  // Install the experiment with suppression OFF by accepting the prompt.
  Services.prefs.setBoolPref("extensions.experiments.suppressed", false);

  const installPromise = new Promise(resolve => {
    const listener = {
      onInstallEnded(_install, addon) {
        AddonManager.removeInstallListener(listener);
        resolve(addon);
      },
      onInstallCancelled() {
        AddonManager.removeInstallListener(listener);
        resolve(null);
      },
      onInstallFailed() {
        AddonManager.removeInstallListener(listener);
        resolve(null);
      },
    };
    AddonManager.addInstallListener(listener);
  });

  await installFile("addons/browser_webext_experiment.xpi");

  // Accept the experiment permissions prompt.
  const panel = await promisePopupNotificationShown("addon-webext-permissions");
  panel.button.click();

  const addon = await installPromise;
  Assert.ok(addon, "Experiment add-on should be installed");

  // Close the about:addons tab opened by installFile.
  const tabmail = document.getElementById("tabmail");
  tabmail.closeTab(tabmail.currentTabInfo);

  // Open about:addons — no warning banner should be shown.
  const { document: addonDoc } = await openAddonsMgr("addons://list/extension");
  await waitAboutAddonsViewLoaded(addonDoc);

  let card = addonDoc.querySelector(
    `addon-card[addon-id="experiment_test@tests.mozilla.org"]`
  );
  Assert.ok(card, "Addon card should exist");

  let messageBar = card.querySelector(".addon-card-message");
  // The banner is rendered asynchronously by getAddonMessageInfo. Wait for
  // it to settle before asserting it is not shown.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, 500));
  Assert.ok(
    !messageBar || messageBar.hidden,
    "Warning banner should not be shown when suppression is off"
  );
  tabmail.closeTab(tabmail.currentTabInfo);

  // Enable suppression.
  Services.prefs.setBoolPref("extensions.experiments.suppressed", true);

  // Re-open about:addons — warning banner should now be visible.
  const { document: addonDoc2 } = await openAddonsMgr(
    "addons://list/extension"
  );
  await waitAboutAddonsViewLoaded(addonDoc2);

  card = addonDoc2.querySelector(
    `addon-card[addon-id="experiment_test@tests.mozilla.org"]`
  );
  Assert.ok(card, "Addon card should still exist");

  // Wait for the banner to render (getAddonMessageInfo is async).
  await TestUtils.waitForCondition(() => {
    const mb = card.querySelector(".addon-card-message");
    return mb && !mb.hidden;
  }, "Waiting for warning banner to appear");

  messageBar = card.querySelector(".addon-card-message");
  Assert.equal(
    messageBar.getAttribute("type"),
    "warning",
    "Banner should be of type warning"
  );

  // Clean up.
  tabmail.closeTab(tabmail.currentTabInfo);
  await addon.uninstall();
  Services.prefs.clearUserPref("extensions.experiments.suppressed");
});

/**
 * Test that installing an experiment add-on while experiments are NOT
 * suppressed shows the normal experiment permissions prompt.
 */
add_task(async function test_non_suppressed_experiment_install() {
  // Ensure experiment suppression is off.
  Services.prefs.setBoolPref("extensions.experiments.suppressed", false);

  const installPromise = promiseInstallResult();

  await installFile("addons/browser_webext_experiment.xpi");

  // The normal experiment permissions prompt should appear with the experiment
  // warning text.
  const panel = await promisePopupNotificationShown("addon-webext-permissions");
  await checkNotification(
    panel,
    isDefaultIcon,
    [["webext-perms-description-experiment-access"]],
    false,
    true
  );

  // Cancel the install.
  panel.secondaryButton.click();

  const result = await installPromise;
  Assert.equal(result, "cancelled", "Installation should be cancelled");

  const addon = await AddonManager.getAddonByID(
    "experiment_test@tests.mozilla.org"
  );
  Assert.equal(addon, null, "Extension should not be installed");

  const tabmail = document.getElementById("tabmail");
  tabmail.closeTab(tabmail.currentTabInfo);

  Services.prefs.clearUserPref("extensions.experiments.suppressed");
});
