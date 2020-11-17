"use strict";

const INSTALL_PAGE = `${BASE}/file_install_extensions.html`;

async function installTrigger(filename) {
  let browser = document.getElementById("tabmail").selectedBrowser;
  BrowserTestUtils.loadURI(browser, INSTALL_PAGE);
  await BrowserTestUtils.browserLoaded(browser);

  await SpecialPowers.spawn(browser, [`${BASE}/${filename}`], async function(
    url
  ) {
    await content.wrappedJSObject.installTrigger(url);
  });
}

add_task(() => testInstallMethod(installTrigger, "installAmo"));
