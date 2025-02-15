"use strict";

const INSTALL_PAGE = `${BASE}/file_install_extensions.html`;

async function installTrigger(filename) {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["extensions.InstallTrigger.enabled", true],
      ["extensions.InstallTriggerImpl.enabled", true],
      // Relax the user input requirements while running this test.
      ["xpinstall.userActivation.required", false],
    ],
  });
  const gBrowser = document.getElementById("tabmail");
  const loadPromise = BrowserTestUtils.browserLoaded(gBrowser.selectedBrowser);
  BrowserTestUtils.startLoadingURIString(
    gBrowser.selectedBrowser,
    INSTALL_PAGE
  );
  await loadPromise;

  SpecialPowers.spawn(
    gBrowser.selectedBrowser,
    [`${BASE}/${filename}`],
    async function (url) {
      content.wrappedJSObject.installTrigger(url);
    }
  );
}

add_task(() => testInstallMethod(installTrigger));
