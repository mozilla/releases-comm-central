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

add_task(async function test_install_extension_from_local_file() {
  // Listen for the first installId so we can check it later.
  let firstInstallId = null;
  AddonManager.addInstallListener({
    onNewInstall(install) {
      firstInstallId = install.installId;
      AddonManager.removeInstallListener(this);
    },
  });

  // Install the add-ons.
  await testInstallMethod(installFile);

  // Check we got an installId.
  ok(
    firstInstallId != null && !isNaN(firstInstallId),
    "There was an installId found"
  );

  const tabmail = document.getElementById("tabmail");
  tabmail.closeTab(tabmail.currentTabInfo);
});
