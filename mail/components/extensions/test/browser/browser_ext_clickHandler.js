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
    let found = this._loadedURLs.includes(url);
    this._loadedURLs = this._loadedURLs.filter(e => e != url);
    return found;
  },
  hasAnyUrlLoaded() {
    return this._loadedURLs.length > 0;
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

const getCommonFiles = async () => {
  return {
    "utils.js": await getUtilsJS(),
    "common.js": () => {
      window.CreateTabPromise = class {
        constructor() {
          this.promise = new Promise(resolve => {
            let createListener = tab => {
              browser.tabs.onCreated.removeListener(createListener);
              resolve(tab);
            };
            browser.tabs.onCreated.addListener(createListener);
          });
        }
        async done() {
          return this.promise;
        }
      };

      window.UpdateTabPromise = class {
        constructor(options) {
          this.logWindowId = options?.logWindowId;
          this.promise = new Promise(resolve => {
            let updateLog = new Map();
            let updateListener = (tabId, changes, tab) => {
              let id = this.logWindowId ? tab.windowId : tabId;
              let log = updateLog.get(id) || {};

              if (changes.url && changes.url == "about:blank") {
                // Reset whatever we have seen so far.
                log = {};
              } else {
                if (changes.url && changes.url != "about:blank") {
                  log.url = changes.url;
                }
                if (changes?.status == "loading") {
                  log.loading = true;
                }
                // The complete is only valid, if we seen a url (which was not
                // "about:blank")
                if (log.url && changes?.status == "complete") {
                  log.complete = true;
                }
              }
              updateLog.set(id, log);
              if (log.url && log.loading && log.complete) {
                browser.tabs.onUpdated.removeListener(updateListener);
                resolve(updateLog);
              }
            };
            browser.tabs.onUpdated.addListener(updateListener);
          });
        }
        async verify(id, url) {
          // The updatePromise resolves after we have seen both states (loading
          // and complete) and a url.
          let updateLog = await this.promise;
          browser.test.assertEq(
            1,
            updateLog.size,
            `Should have seen exactly one tab being updated - ${JSON.stringify(
              Array.from(updateLog)
            )}`
          );
          browser.test.assertTrue(
            updateLog.has(id),
            "Updates must belong to the current tab"
          );
          browser.test.assertEq(
            url,
            updateLog.get(id).url,
            "Should have seen the correct url loaded."
          );
        }
      };
    },
    "background.js": async () => {
      // Open local file and click link to a different site.
      await window.expectLinkOpenInExternalBrowser(
        browser.runtime.getURL("test.html"),
        "#link1",
        "https://www.example.de/"
      );

      // Open local file and click same site link (no target).
      await window.expectLinkOpenInSameTab(
        browser.runtime.getURL("test.html"),
        "#link2",
        browser.runtime.getURL("example.html")
      );

      // Open local file and click same site link ("_self" target).
      await window.expectLinkOpenInSameTab(
        browser.runtime.getURL("test.html"),
        "#link3",
        browser.runtime.getURL("example.html#self")
      );

      // Disabled until Bug 1770105 is fully fixed.
      /*
      // Open local file and click same site link ("_blank" target).
      await window.expectLinkOpenInNewTab(
        browser.runtime.getURL("test.html"),
        "#link4",
        browser.runtime.getURL("example.html#blank")
      );

      // Open local file and click same site link ("_other" target).
      await window.expectLinkOpenInNewTab(
        browser.runtime.getURL("test.html"),
        "#link5",
        browser.runtime.getURL("example.html#other")
      );
      */

      // Open a remote page and click link on same site.
      await window.expectLinkOpenInSameTab(
        "https://example.org/browser/comm/mail/components/extensions/test/browser/data/linktest.html",
        "#linkExt1",
        "https://example.org/browser/comm/mail/components/extensions/test/browser/data/content.html"
      );

      // Open a remote page and click link to a different site.
      await window.expectLinkOpenInExternalBrowser(
        "https://example.org/browser/comm/mail/components/extensions/test/browser/data/linktest.html",
        "#linkExt2",
        "https://mozilla.org/"
      );

      browser.test.notifyPass();
    },
    "example.html": `<!DOCTYPE HTML>
      <html>
      <head>
        <title>EXAMPLE</title>
        <meta http-equiv="content-type" content="text/html; charset=utf-8">
      </head>
      <body>
        <p>This is an example page</p>
      </body>
      </html>`,
    "test.html": `<!DOCTYPE HTML>
      <html>
      <head>
        <title>TEST</title>
        <meta http-equiv="content-type" content="text/html; charset=utf-8">
      </head>
      <body>
        <ul>
          <li><a id="link1" href="https://www.example.de/">external</a>
          <li><a id="link2" href="example.html">no target</a>
          <li><a id="link3" href="example.html#self" target = "_self">_self target</a>
          <li><a id="link4" href="example.html#blank" target = "_blank">_blank target</a>
          <li><a id="link5" href="example.html#other" target = "_other">_other target</a>
        </ul>
      </body>
      </html>`,
  };
};

const subtest_clickInBrowser = async (extension, getBrowser) => {
  async function clickLink(linkId, browser) {
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
    await BrowserTestUtils.synthesizeMouseAtCenter(linkId, {}, browser);
  }

  await extension.startup();

  // Wait for click on #link1 (external)
  {
    let { linkId, expectedUrl } = await extension.awaitMessage("click");
    Assert.equal("#link1", linkId, `Test should click on the correct link.`);
    Assert.equal(
      "https://www.example.de/",
      expectedUrl,
      `Test should open the correct link.`
    );
    await clickLink(linkId, getBrowser());
    Assert.ok(
      mockExternalProtocolService.urlLoaded(expectedUrl),
      `Link should have correctly been opened in external browser.`
    );
    await extension.sendMessage();
  }

  // Wait for click on #link2 (same tab)
  {
    let { linkId } = await extension.awaitMessage("click");
    Assert.equal("#link2", linkId, `Test should click on the correct link.`);
    await clickLink(linkId, getBrowser());
    Assert.ok(
      !mockExternalProtocolService.hasAnyUrlLoaded(),
      `Link should not have been opened in external browser.`
    );
    await extension.sendMessage();
  }

  // Wait for click on #link3 (same tab)
  {
    let { linkId } = await extension.awaitMessage("click");
    Assert.equal("#link3", linkId, `Test should click on the correct link.`);
    await clickLink(linkId, getBrowser());
    Assert.ok(
      !mockExternalProtocolService.hasAnyUrlLoaded(),
      `Link should not have been opened in external browser.`
    );
    await extension.sendMessage();
  }

  // Disabled until Bug 1770105 is fully fixed.
  /*
  // Wait for click on #link4 (new tab)
  {
    let { linkId } = await extension.awaitMessage("click");
    Assert.equal("#link4", linkId, `Test should click on the correct link.`);
    await clickLink(linkId, getBrowser());
    Assert.ok(
      !mockExternalProtocolService.hasAnyUrlLoaded(),
      `Link should not have been opened in external browser.`
    );
    await extension.sendMessage();
  }

  // Wait for click on #link5 (new tab)
  {
    let { linkId } = await extension.awaitMessage("click");
    Assert.equal("#link5", linkId, `Test should click on the correct link.`);
    await clickLink(linkId, getBrowser());
    Assert.ok(
      !mockExternalProtocolService.hasAnyUrlLoaded(),
      `Link should not have been opened in external browser.`
    );
    await extension.sendMessage();
  }
  */

  // Wait for click on #linkExt1 (same tab)
  {
    let { linkId } = await extension.awaitMessage("click");
    Assert.equal("#linkExt1", linkId, `Test should click on the correct link.`);
    await clickLink(linkId, getBrowser());
    Assert.ok(
      !mockExternalProtocolService.hasAnyUrlLoaded(),
      `Link should not have been opened in external browser.`
    );
    await extension.sendMessage();
  }

  // Wait for click on #linkExt2 (external)
  {
    let { linkId, expectedUrl } = await extension.awaitMessage("click");
    Assert.equal("#linkExt2", linkId, `Test should click on the correct link.`);
    Assert.equal(
      "https://mozilla.org/",
      expectedUrl,
      `Test should open the correct link.`
    );
    await clickLink(linkId, getBrowser());
    Assert.ok(
      mockExternalProtocolService.urlLoaded(expectedUrl),
      `Link should have correctly been opened in external browser.`
    );
    await extension.sendMessage();
  }

  await extension.awaitFinish();
  await extension.unload();
};

add_task(async function test_tabs() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "tabFunctions.js": async () => {
        let openTestTab = async url => {
          let createdTestTab = new window.CreateTabPromise();
          let updatedTestTab = new window.UpdateTabPromise();
          let testTab = await browser.tabs.create({ url });
          await createdTestTab.done();
          await updatedTestTab.verify(testTab.id, url);
          return testTab;
        };

        window.expectLinkOpenInNewTab = async (
          testUrl,
          linkId,
          expectedUrl
        ) => {
          let testTab = await openTestTab(testUrl);

          // Click a link in testTab to open a new tab.
          let createdNewTab = new window.CreateTabPromise();
          let updatedNewTab = new window.UpdateTabPromise();
          await window.sendMessage("click", { linkId });
          let createdTab = await createdNewTab.done();
          await updatedNewTab.verify(createdTab.id, expectedUrl);

          await browser.tabs.remove(createdTab.id);
          await browser.tabs.remove(testTab.id);
        };

        window.expectLinkOpenInSameTab = async (
          testUrl,
          linkId,
          expectedUrl
        ) => {
          let testTab = await openTestTab(testUrl);

          // Click a link in testTab to open in self.
          let updatedTab = new window.UpdateTabPromise();
          await window.sendMessage("click", { linkId });
          await updatedTab.verify(testTab.id, expectedUrl);

          await browser.tabs.remove(testTab.id);
        };

        window.expectLinkOpenInExternalBrowser = async (
          testUrl,
          linkId,
          expectedUrl
        ) => {
          let testTab = await openTestTab(testUrl);
          await window.sendMessage("click", { linkId, expectedUrl });
          await browser.tabs.remove(testTab.id);
        };
      },
      ...(await getCommonFiles()),
    },
    manifest: {
      background: {
        scripts: ["utils.js", "common.js", "tabFunctions.js", "background.js"],
      },
      permissions: ["tabs"],
    },
  });

  await subtest_clickInBrowser(
    extension,
    () => document.getElementById("tabmail").currentTabInfo.browser
  );
});

add_task(async function test_windows() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "windowFunctions.js": async () => {
        let openTestWin = async url => {
          let createdTestTab = new window.CreateTabPromise();
          let updatedTestTab = new window.UpdateTabPromise({
            logWindowId: true,
          });
          let testWindow = await browser.windows.create({ type: "popup", url });
          await createdTestTab.done();
          await updatedTestTab.verify(testWindow.id, url);
          return testWindow;
        };

        window.expectLinkOpenInNewTab = async (
          testUrl,
          linkId,
          expectedUrl
        ) => {
          let testWindow = await openTestWin(testUrl);

          // Click a link in testWindow to open a new tab.
          let createdNewTab = new window.CreateTabPromise();
          let updatedNewTab = new window.UpdateTabPromise();
          await window.sendMessage("click", { linkId });
          let createdTab = await createdNewTab.done();
          await updatedNewTab.verify(createdTab.id, expectedUrl);

          await browser.tabs.remove(createdTab.id);
          await browser.windows.remove(testWindow.id);
        };

        window.expectLinkOpenInSameTab = async (
          testUrl,
          linkId,
          expectedUrl
        ) => {
          let testWindow = await openTestWin(testUrl);

          // Click a link in testWindow to open in self.
          let updatedTab = new window.UpdateTabPromise({ logWindowId: true });
          await window.sendMessage("click", { linkId });
          await updatedTab.verify(testWindow.id, expectedUrl);

          await browser.windows.remove(testWindow.id);
        };

        window.expectLinkOpenInExternalBrowser = async (
          testUrl,
          linkId,
          expectedUrl
        ) => {
          let win = await openTestWin(testUrl);
          await window.sendMessage("click", { linkId, expectedUrl });
          await browser.windows.remove(win.id);
        };
      },
      ...(await getCommonFiles()),
    },
    manifest: {
      background: {
        scripts: [
          "utils.js",
          "common.js",
          "windowFunctions.js",
          "background.js",
        ],
      },
      permissions: ["tabs"],
    },
  });

  await subtest_clickInBrowser(
    extension,
    () => Services.wm.getMostRecentWindow("mail:extensionPopup").browser
  );
});
