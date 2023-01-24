/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

let { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

/** @implements {nsIExternalProtocolService} */
let mockExternalProtocolService = {
  _loadedURLs: [],
  externalProtocolHandlerExists(protocolScheme) {},
  getApplicationDescription(scheme) {},
  getProtocolHandlerInfo(protocolScheme) {},
  getProtocolHandlerInfoFromOS(protocolScheme, found) {},
  isExposedProtocol(protocolScheme) {},
  loadURI(uri, windowContext) {
    this._loadedURLs.push(uri.spec);
  },
  setProtocolHandlerDefaults(handlerInfo, osHandlerExists) {},
  urlLoaded(url) {
    return this._loadedURLs.includes(url);
  },
  QueryInterface: ChromeUtils.generateQI(["nsIExternalProtocolService"]),
};

let mockExternalProtocolServiceCID = MockRegistrar.register(
  "@mozilla.org/uriloader/external-protocol-service;1",
  mockExternalProtocolService
);

registerCleanupFunction(() => {
  MockRegistrar.unregister(mockExternalProtocolServiceCID);
});

async function subtest_content(link, expectedLink) {
  Assert.equal(expectedLink, link, `Test should click on the correct link.`);
  let browser = document.getElementById("tabmail").currentTabInfo.browser;

  if (
    browser.webProgress?.isLoadingDocument ||
    !browser.currentURI ||
    browser.currentURI?.spec == "about:blank"
  ) {
    await BrowserTestUtils.browserLoaded(
      browser,
      undefined,
      url => url != "about:blank"
    );
  }

  await BrowserTestUtils.synthesizeMouseAtCenter(link, {}, browser);
}

add_task(async function testClickHandler() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        async function expectLinkOpenInSameTab(url, linkId) {
          let tab = await browser.tabs.create({ url });
          let updateLog = [];
          let updateListener = tabId => {
            updateLog.push(tabId);
          };
          browser.tabs.onUpdated.addListener(updateListener);
          await window.sendMessage("click", linkId);
          browser.test.assertTrue(
            updateLog.length > 0,
            "Should have seen at least one tab being updated"
          );
          browser.test.assertTrue(
            updateLog.every(tabId => tabId == tab.id),
            `All updates must have been done to the current tab - ${JSON.stringify(
              updateLog
            )}`
          );
          browser.tabs.onUpdated.removeListener(updateListener);
          await browser.tabs.remove(tab.id);
        }

        async function expectLinkOpenInExternalBrowser(url, linkId) {
          let tab = await browser.tabs.create({ url });
          await window.sendMessage("click", linkId);
          await browser.tabs.remove(tab.id);
        }

        // Open local file in a tab and click link to a different site.
        await expectLinkOpenInExternalBrowser("test.html", "#link1");

        // Open local file in a tab and click same site link (no target).
        await expectLinkOpenInSameTab("test.html", "#link2");

        // Open local file in a tab and click same site link ("_self" target).
        await expectLinkOpenInSameTab("test.html", "#link3");

        // Open a remote page and click link on same site.
        await expectLinkOpenInSameTab(
          "https://example.org/browser/comm/mail/components/extensions/test/browser/data/linktest.html",
          "#linkExt1"
        );

        // Open a remote page and click link to a different site.
        await expectLinkOpenInExternalBrowser(
          "https://example.org/browser/comm/mail/components/extensions/test/browser/data/linktest.html",
          "#linkExt2"
        );

        browser.test.notifyPass();
      },
      "test.html": `<!DOCTYPE HTML>
      <html>
      <head>
        <title>TITLE</title>
        <meta http-equiv="content-type" content="text/html; charset=utf-8">
      </head>
      <body>
        <ul>
        <li><a id="link1" href='https://www.example.de/'>external</a>
        <li><a id="link2" href='example.html'>no target</a>
        <li><a id="link3" href='example.html' target = "_self">_self target</a>
        <li><a id="link4" href='example.html' target = "_blank">_blank target</a>
      </ul>
      </body>
      </html>`,
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["tabs"],
    },
  });

  await extension.startup();

  // Wait for click on #link1 (external)
  {
    let link = await extension.awaitMessage("click");
    await subtest_content(link, "#link1");
    Assert.ok(
      mockExternalProtocolService.urlLoaded("https://www.example.de/"),
      `Link should have been opened in external browser.`
    );
    await extension.sendMessage();
  }

  // Wait for click on #link2 (same tab)
  {
    let link = await extension.awaitMessage("click");
    await subtest_content(link, "#link2");
    await extension.sendMessage();
  }

  // Wait for click on #link3 (same tab)
  {
    let link = await extension.awaitMessage("click");
    await subtest_content(link, "#link3");
    await extension.sendMessage();
  }

  // Wait for click on #linkExt1 (same tab)
  {
    let link = await extension.awaitMessage("click");
    await subtest_content(link, "#linkExt1");
    await extension.sendMessage();
  }

  // Wait for click on #linkExt2 (external)
  {
    let link = await extension.awaitMessage("click");
    await subtest_content(link, "#linkExt2");
    Assert.ok(
      mockExternalProtocolService.urlLoaded("https://mozilla.org/"),
      `Link should have been opened in external browser.`
    );
    await extension.sendMessage();
  }

  await extension.awaitFinish();
  await extension.unload();
});
