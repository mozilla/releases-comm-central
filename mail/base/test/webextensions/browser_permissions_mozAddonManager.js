"use strict";

const INSTALL_PAGE = `${BASE}/file_install_extensions.html`;

async function installMozAM(filename) {
  let browser = document.getElementById("tabmail").selectedBrowser;
  BrowserTestUtils.loadURI(browser, INSTALL_PAGE);
  await BrowserTestUtils.browserLoaded(browser);

  await SpecialPowers.spawn(browser, [`${BASE}/${filename}`], async function(
    url
  ) {
    await content.wrappedJSObject.installMozAM(url);
  });
}

add_task(() => testInstallMethod(installMozAM, "installAmo"));
