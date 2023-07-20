"use strict";

async function installFile(filename) {
  let MockFilePicker = SpecialPowers.MockFilePicker;
  MockFilePicker.init(window);
  MockFilePicker.setFiles([new FileUtils.File(getTestFilePath(filename))]);
  MockFilePicker.afterOpenCallback = MockFilePicker.cleanup;

  let { document } = await openAddonsMgr("addons://list/extension");

  // Do the install...
  await waitAboutAddonsViewLoaded(document);
  let installButton = document.querySelector('[action="install-from-file"]');
  installButton.click();
}

async function testExperimentPrompt(filename) {
  let installPromise = new Promise(resolve => {
    let listener = {
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

  let panel = await promisePopupNotificationShown("addon-webext-permissions");
  await checkNotification(
    panel,
    isDefaultIcon,
    [["webext-perms-description-experiment"]],
    false,
    true
  );
  panel.secondaryButton.click();

  let result = await installPromise;
  ok(!result, "Installation was cancelled");
  let addon = await AddonManager.getAddonByID(
    "experiment_test@tests.mozilla.org"
  );
  is(addon, null, "Extension is not installed");

  let tabmail = document.getElementById("tabmail");
  tabmail.closeTab(tabmail.currentTabInfo);
}

add_task(async () => {
  await testExperimentPrompt("addons/browser_webext_experiment.xpi");
  await testExperimentPrompt(
    "addons/browser_webext_experiment_permissions.xpi"
  );
});
