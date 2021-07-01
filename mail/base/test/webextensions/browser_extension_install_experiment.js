"use strict";

async function installFile(filename) {
  const ChromeRegistry = Cc["@mozilla.org/chrome/chrome-registry;1"].getService(
    Ci.nsIChromeRegistry
  );
  let chromeUrl = Services.io.newURI(gTestPath);
  let fileUrl = ChromeRegistry.convertChromeURL(chromeUrl);
  let file = fileUrl.QueryInterface(Ci.nsIFileURL).file;
  file.leafName = filename;

  let MockFilePicker = SpecialPowers.MockFilePicker;
  MockFilePicker.init(window);
  MockFilePicker.setFiles([file]);
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
  checkNotification(
    panel,
    isDefaultIcon,
    [["webextPerms.description.experiment"]],
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
  await testExperimentPrompt("browser_webext_experiment.xpi");
  await testExperimentPrompt("browser_webext_experiment_permissions.xpi");
});
