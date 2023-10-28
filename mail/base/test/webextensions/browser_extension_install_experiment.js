"use strict";

async function installFile(filename) {
  const MockFilePicker = SpecialPowers.MockFilePicker;
  MockFilePicker.init(window);
  MockFilePicker.setFiles([new FileUtils.File(getTestFilePath(filename))]);
  MockFilePicker.afterOpenCallback = MockFilePicker.cleanup;

  const { document } = await openAddonsMgr("addons://list/extension");

  // Do the install...
  await waitAboutAddonsViewLoaded(document);
  const installButton = document.querySelector('[action="install-from-file"]');
  installButton.click();
}

async function testExperimentPrompt(filename) {
  const installPromise = new Promise(resolve => {
    const listener = {
      onDownloadCancelled() {
        AddonManager.removeInstallListener(listener);
        resolve(false);
      },

      onDownloadFailed() {
        AddonManager.removeInstallListener(listener);
        resolve(false);
      },

      onInstallCancelled() {
        AddonManager.removeInstallListener(listener);
        resolve(false);
      },

      onInstallEnded() {
        AddonManager.removeInstallListener(listener);
        resolve(true);
      },

      onInstallFailed() {
        AddonManager.removeInstallListener(listener);
        resolve(false);
      },
    };
    AddonManager.addInstallListener(listener);
  });

  await installFile(filename);

  const panel = await promisePopupNotificationShown("addon-webext-permissions");
  await checkNotification(
    panel,
    isDefaultIcon,
    [["webext-perms-description-experiment"]],
    false,
    true
  );
  panel.secondaryButton.click();

  const result = await installPromise;
  ok(!result, "Installation was cancelled");
  const addon = await AddonManager.getAddonByID(
    "experiment_test@tests.mozilla.org"
  );
  is(addon, null, "Extension is not installed");

  const tabmail = document.getElementById("tabmail");
  tabmail.closeTab(tabmail.currentTabInfo);
}

add_task(async () => {
  await testExperimentPrompt("addons/browser_webext_experiment.xpi");
  await testExperimentPrompt(
    "addons/browser_webext_experiment_permissions.xpi"
  );
});
