"use strict";

const INSTALL_PAGE = `${BASE}/file_install_extensions.html`;

async function installMozAM(filename) {
  const browser = document.getElementById("tabmail").selectedBrowser;
  BrowserTestUtils.startLoadingURIString(browser, INSTALL_PAGE);
  await BrowserTestUtils.browserLoaded(browser);

  await SpecialPowers.spawn(
    browser,
    [`${BASE}/${filename}`],
    async function (url) {
      await content.wrappedJSObject.installMozAM(url);
    }
  );
}

add_task(() => testInstallMethod(installMozAM));
