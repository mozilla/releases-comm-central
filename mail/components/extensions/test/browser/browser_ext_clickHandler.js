/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { MockExternalProtocolService } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockExternalProtocolService.sys.mjs"
);

requestLongerTimeout(2);

add_setup(async () => {
  MockExternalProtocolService.init();
  registerCleanupFunction(() => {
    MockExternalProtocolService.cleanup();
  });
});

const getCommonFiles = async () => {
  return {
    "utils.js": await getUtilsJS(),
    "common.js": () => {
      window.CreateTabPromise = class {
        constructor() {
          this.promise = new Promise(resolve => {
            const createListener = tab => {
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
        constructor() {
          this.promise = new Promise(resolve => {
            let log = {};
            const updateListener = (tabId, changes) => {
              if (changes.url == "about:blank") {
                // Reset whatever we have seen so far.
                log = {};
              } else {
                if (changes.url) {
                  log.url = changes.url;
                }
                if (changes.status == "loading") {
                  log.loading = true;
                }
                // The complete is only valid, if we seen a url (which was not
                // "about:blank").
                if (log.url && changes.status == "complete") {
                  log.complete = true;
                }
              }
              if (log.id && log.id != tabId) {
                browser.test.fail(
                  "Should not receive update events for multiple tabs"
                );
              }
              log.id = tabId;

              if (log.url && log.loading && log.complete) {
                browser.tabs.onUpdated.removeListener(updateListener);
                resolve(log);
              }
            };
            browser.tabs.onUpdated.addListener(updateListener);
          });
        }
        async verify(id, url) {
          // The updatePromise resolves after we have seen both states (loading
          // and complete) and a url.
          const updateLog = await this.promise;
          browser.test.assertEq(
            id,
            updateLog.id,
            "Updates must belong to the current tab"
          );
          browser.test.assertEq(
            url,
            updateLog.url,
            "Should have seen the correct url loaded."
          );
        }
      };
    },
    "background.js": async () => {
      window.expectedLinkHandler = await window.sendMessage(
        "expectedLinkHandler"
      );

      // Open local file and click link to a different site.
      if (window.expectedLinkHandler == "browsers") {
        await window.expectLinkOpenInSameTab(
          browser.runtime.getURL("test.html"),
          "#shadow1:#link1",
          "https://example.org/"
        );
      } else {
        await window.expectLinkOpenInExternalBrowser(
          browser.runtime.getURL("test.html"),
          "#shadow1:#link1",
          "https://example.org/"
        );
      }

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

      // Open a remote page and click link on same site.
      if (window.expectedLinkHandler == "single-page") {
        await window.expectLinkOpenInExternalBrowser(
          "https://example.org/browser/comm/mail/components/extensions/test/browser/data/linktest.html",
          "#shadowExt1:#linkExt1",
          "https://example.org/browser/comm/mail/components/extensions/test/browser/data/content.html"
        );
      } else {
        await window.expectLinkOpenInSameTab(
          "https://example.org/browser/comm/mail/components/extensions/test/browser/data/linktest.html",
          "#shadowExt1:#linkExt1",
          "https://example.org/browser/comm/mail/components/extensions/test/browser/data/content.html"
        );
      }

      // Open a remote page and click link to a different site.
      if (window.expectedLinkHandler == "browsers") {
        await window.expectLinkOpenInSameTab(
          "https://example.org/browser/comm/mail/components/extensions/test/browser/data/linktest.html",
          "#linkExt2",
          "https://example.net/"
        );
      } else {
        await window.expectLinkOpenInExternalBrowser(
          "https://example.org/browser/comm/mail/components/extensions/test/browser/data/linktest.html",
          "#linkExt2",
          "https://example.net/"
        );
      }

      // Open a remote page and click link on same site but with _blank target.
      if (window.expectedLinkHandler == "single-page") {
        await window.expectLinkOpenInExternalBrowser(
          "https://example.org/browser/comm/mail/components/extensions/test/browser/data/linktest.html",
          "#linkExt3",
          "https://example.org/browser/comm/mail/components/extensions/test/browser/data/content.html"
        );
      } else {
        await window.expectLinkOpenInNewTab(
          "https://example.org/browser/comm/mail/components/extensions/test/browser/data/linktest.html",
          "#linkExt3",
          "https://example.org/browser/comm/mail/components/extensions/test/browser/data/content.html"
        );
      }

      // Open a remote page and click link on same site but with _self target.
      if (window.expectedLinkHandler == "single-page") {
        await window.expectLinkOpenInExternalBrowser(
          "https://example.org/browser/comm/mail/components/extensions/test/browser/data/linktest.html",
          "#linkExt4",
          "https://example.org/browser/comm/mail/components/extensions/test/browser/data/content.html"
        );
      } else {
        await window.expectLinkOpenInSameTab(
          "https://example.org/browser/comm/mail/components/extensions/test/browser/data/linktest.html",
          "#linkExt4",
          "https://example.org/browser/comm/mail/components/extensions/test/browser/data/content.html"
        );
      }

      browser.test.notifyPass();
    },
    "example.html": `<!DOCTYPE html>
      <html>
        <head>
          <title>EXAMPLE</title>
          <meta charset="utf-8">
        </head>
        <body>
          <p>This is an example page</p>
        </body>
      </html>`,
    "test.html": `<!DOCTYPE html>
      <html>
        <head>
          <title>TEST</title>
          <meta charset="utf-8">
        </head>
        <body>
          <ul>
            <li>
              <div id="shadow1">
                <template shadowrootmode="open">
                  <a href="https://example.org/">
                    <span id="link1">external</span>
                  </a>
                </template>
              </div>
            </li>
            <li><a id="link2" href="example.html">no target</a></li>
            <li><a id="link3" href="example.html#self" target = "_self">_self target</a></li>
            <li><a href="example.html#blank" target = "_blank"><span id="link4">_blank target</span></a></li>
            <li><a id="link5" href="example.html#other" target = "_other">_other target</a></li>
          </ul>
        </body>
      </html>`,
  };
};

const getTabFunctions = () => {
  return () => {
    const openTestTab = async url => {
      const createdTestTab = new window.CreateTabPromise();
      const updatedTestTab = new window.UpdateTabPromise();

      let linkHandler = "balanced";
      if (window.expectedLinkHandler == "browsers") {
        linkHandler = "relaxed";
      } else if (window.expectedLinkHandler == "single-page") {
        linkHandler = "strict";
      }

      const testTab = await browser.tabs.create({
        url,
        linkHandler,
      });
      await createdTestTab.done();
      await updatedTestTab.verify(testTab.id, url);
      return testTab;
    };

    window.expectLinkOpenInNewTab = async (testUrl, linkId, expectedUrl) => {
      const testTab = await openTestTab(testUrl);

      // Click a link in testTab to open a new tab.
      const createdNewTab = new window.CreateTabPromise();
      const updatedNewTab = new window.UpdateTabPromise();
      await window.sendMessage("click", { linkId });
      const createdTab = await createdNewTab.done();
      await updatedNewTab.verify(createdTab.id, expectedUrl);

      await browser.tabs.remove(createdTab.id);
      await browser.tabs.remove(testTab.id);
    };

    window.expectLinkOpenInSameTab = async (testUrl, linkId, expectedUrl) => {
      const testTab = await openTestTab(testUrl);

      // Click a link in testTab to open in self.
      const updatedTab = new window.UpdateTabPromise();
      await window.sendMessage("click", { linkId });
      await updatedTab.verify(testTab.id, expectedUrl);

      await browser.tabs.remove(testTab.id);
    };

    window.expectLinkOpenInExternalBrowser = async (
      testUrl,
      linkId,
      expectedUrl
    ) => {
      const testTab = await openTestTab(testUrl);
      await window.sendMessage("click", { linkId, expectedUrl });
      await browser.tabs.remove(testTab.id);
    };
  };
};

const getSpaceFunctions = () => {
  return () => {
    const openTestTab = async url => {
      let linkHandler = "balanced";
      if (window.expectedLinkHandler == "browsers") {
        linkHandler = "relaxed";
      } else if (window.expectedLinkHandler == "single-page") {
        linkHandler = "strict";
      }

      const space = await browser.spaces.create(
        "test",
        {
          url,
          linkHandler,
        },
        {
          title: "Test",
        }
      );

      const createdTestTab = new window.CreateTabPromise();
      const updatedTestTab = new window.UpdateTabPromise();
      const testTab = await browser.spaces.open(space.id);
      await createdTestTab.done();
      await updatedTestTab.verify(testTab.id, url);
      return { space, testTab };
    };

    window.expectLinkOpenInNewTab = async (testUrl, linkId, expectedUrl) => {
      const { space, testTab } = await openTestTab(testUrl);

      // Click a link in testTab to open a new tab.
      const createdNewTab = new window.CreateTabPromise();
      const updatedNewTab = new window.UpdateTabPromise();
      await window.sendMessage("click", { linkId });
      const createdTab = await createdNewTab.done();
      await updatedNewTab.verify(createdTab.id, expectedUrl);

      await browser.tabs.remove(createdTab.id);
      await browser.tabs.remove(testTab.id);
      await browser.spaces.remove(space.id);
    };

    window.expectLinkOpenInSameTab = async (testUrl, linkId, expectedUrl) => {
      const { space, testTab } = await openTestTab(testUrl);

      // Click a link in testTab to open in self.
      const updatedTab = new window.UpdateTabPromise();
      await window.sendMessage("click", { linkId });
      await updatedTab.verify(testTab.id, expectedUrl);

      await browser.tabs.remove(testTab.id);
      await browser.spaces.remove(space.id);
    };

    window.expectLinkOpenInExternalBrowser = async (
      testUrl,
      linkId,
      expectedUrl
    ) => {
      const { space, testTab } = await openTestTab(testUrl);
      await window.sendMessage("click", { linkId, expectedUrl });
      await browser.tabs.remove(testTab.id);
      await browser.spaces.remove(space.id);
    };
  };
};

const getWinFunctions = () => {
  return () => {
    const openTestTab = async url => {
      const createdTestTab = new window.CreateTabPromise();
      const updatedTestTab = new window.UpdateTabPromise();

      let linkHandler = "balanced";
      if (window.expectedLinkHandler == "browsers") {
        linkHandler = "relaxed";
      } else if (window.expectedLinkHandler == "single-page") {
        linkHandler = "strict";
      }

      const testWindow = await browser.windows.create({
        type: "popup",
        url,
        linkHandler,
      });
      await createdTestTab.done();

      const [testTab] = await browser.tabs.query({
        windowId: testWindow.id,
      });
      await updatedTestTab.verify(testTab.id, url);
      return testTab;
    };

    window.expectLinkOpenInNewTab = async (testUrl, linkId, expectedUrl) => {
      const testTab = await openTestTab(testUrl);

      // Click a link in testWindow to open a new tab.
      const createdNewTab = new window.CreateTabPromise();
      const updatedNewTab = new window.UpdateTabPromise();
      await window.sendMessage("click", { linkId });
      const createdTab = await createdNewTab.done();
      await updatedNewTab.verify(createdTab.id, expectedUrl);

      await browser.tabs.remove(createdTab.id);
      await browser.tabs.remove(testTab.id);
    };

    window.expectLinkOpenInSameTab = async (testUrl, linkId, expectedUrl) => {
      const testTab = await openTestTab(testUrl);

      // Click a link in testWindow to open in self.
      const updatedTab = new window.UpdateTabPromise();
      await window.sendMessage("click", { linkId });
      await updatedTab.verify(testTab.id, expectedUrl);
      await browser.tabs.remove(testTab.id);
    };

    window.expectLinkOpenInExternalBrowser = async (
      testUrl,
      linkId,
      expectedUrl
    ) => {
      const testTab = await openTestTab(testUrl);
      await window.sendMessage("click", { linkId, expectedUrl });
      await browser.tabs.remove(testTab.id);
    };
  };
};

/**
 * @param {Extension} extension - The extension to be used during the test.
 * @param {string} expectedLinkHandler - The link handler to be used during the
 *    test, the extension will use the matching WebExtension link handler (default,
 *    strict or relaxed).
 * @param {Function} getBrowser - A callback, which returns the content browser
 *    to run the test in.
 */
const subtest_clickInBrowser = async (
  extension,
  expectedLinkHandler,
  getBrowser
) => {
  async function clickLink(target, browser) {
    await awaitBrowserLoaded(browser, url => url != "about:blank");
    // Allow to specify a click target inside a shadow DOM.
    if (target.includes(":")) {
      const [containerQuery, elementQuery] = target.split(":");
      target = `() => this.document.querySelector("${
        containerQuery
      }").shadowRoot.querySelector("${elementQuery}")`;
    }
    await synthesizeMouseAtCenterAndRetry(target, {}, browser);
  }

  await extension.startup();

  await extension.awaitMessage("expectedLinkHandler");
  extension.sendMessage(expectedLinkHandler);

  // Wait for click on #link1 (external).
  if (expectedLinkHandler == "browsers") {
    const { linkId } = await extension.awaitMessage("click");
    Assert.equal(
      "#shadow1:#link1",
      linkId,
      `Test should click on the correct link.`
    );
    await clickLink(linkId, getBrowser());
    Assert.equal(
      MockExternalProtocolService.urls.length,
      0,
      `Link should not have been opened in external browser.`
    );
    await extension.sendMessage();
  } else {
    const { linkId, expectedUrl } = await extension.awaitMessage("click");
    Assert.equal(
      "#shadow1:#link1",
      linkId,
      `Test should click on the correct link.`
    );
    Assert.equal(
      "https://example.org/",
      expectedUrl,
      `Test should open the correct link.`
    );
    await clickLink(linkId, getBrowser());
    MockExternalProtocolService.assertHasLoadedURL(expectedUrl);
    await extension.sendMessage();
  }

  // Wait for click on #link2 (same tab).
  {
    const { linkId } = await extension.awaitMessage("click");
    Assert.equal("#link2", linkId, `Test should click on the correct link.`);
    await clickLink(linkId, getBrowser());
    Assert.equal(
      MockExternalProtocolService.urls.length,
      0,
      `Link should not have been opened in external browser.`
    );
    await extension.sendMessage();
  }

  // Wait for click on #link3 (same tab).
  {
    const { linkId } = await extension.awaitMessage("click");
    Assert.equal("#link3", linkId, `Test should click on the correct link.`);
    await clickLink(linkId, getBrowser());
    Assert.equal(
      MockExternalProtocolService.urls.length,
      0,
      `Link should not have been opened in external browser.`
    );
    await extension.sendMessage();
  }

  // Wait for click on #link4 (new tab).
  {
    const { linkId } = await extension.awaitMessage("click");
    Assert.equal("#link4", linkId, `Test should click on the correct link.`);
    await clickLink(linkId, getBrowser());
    Assert.equal(
      MockExternalProtocolService.urls.length,
      0,
      `Link should not have been opened in external browser.`
    );
    await extension.sendMessage();
  }

  // Wait for click on #link5 (new tab).
  {
    const { linkId } = await extension.awaitMessage("click");
    Assert.equal("#link5", linkId, `Test should click on the correct link.`);
    await clickLink(linkId, getBrowser());
    Assert.equal(
      MockExternalProtocolService.urls.length,
      0,
      `Link should not have been opened in external browser.`
    );
    await extension.sendMessage();
  }

  // Wait for click on #linkExt1.
  if (expectedLinkHandler == "single-page") {
    // Should open extern with single-page link handler.
    const { linkId, expectedUrl } = await extension.awaitMessage("click");
    Assert.equal(
      "#shadowExt1:#linkExt1",
      linkId,
      `Test should click on the correct link.`
    );
    Assert.equal(
      "https://example.org/browser/comm/mail/components/extensions/test/browser/data/content.html",
      expectedUrl,
      `Test should open the correct link.`
    );
    await clickLink(linkId, getBrowser());
    MockExternalProtocolService.assertHasLoadedURL(expectedUrl);
    await extension.sendMessage();
  } else {
    // Should open in same tab with single-site link handler.
    const { linkId } = await extension.awaitMessage("click");
    Assert.equal(
      "#shadowExt1:#linkExt1",
      linkId,
      `Test should click on the correct link.`
    );
    await clickLink(linkId, getBrowser());
    Assert.equal(
      MockExternalProtocolService.urls.length,
      0,
      `Link should not have been opened in external browser.`
    );
    await extension.sendMessage();
  }

  // Wait for click on #linkExt2 (external).
  if (expectedLinkHandler == "browsers") {
    const { linkId } = await extension.awaitMessage("click");
    Assert.equal("#linkExt2", linkId, `Test should click on the correct link.`);
    await clickLink(linkId, getBrowser());
    Assert.equal(
      MockExternalProtocolService.urls.length,
      0,
      `Link should not have been opened in external browser.`
    );
    await extension.sendMessage();
  } else {
    const { linkId, expectedUrl } = await extension.awaitMessage("click");
    Assert.equal("#linkExt2", linkId, `Test should click on the correct link.`);
    Assert.equal(
      "https://example.net/",
      expectedUrl,
      `Test should open the correct link.`
    );
    await clickLink(linkId, getBrowser());
    MockExternalProtocolService.assertHasLoadedURL(expectedUrl);
    await extension.sendMessage();
  }

  // Wait for click on #linkExt3.
  if (expectedLinkHandler == "single-page") {
    // Should open extern with single-page link handler.
    const { linkId, expectedUrl } = await extension.awaitMessage("click");
    Assert.equal("#linkExt3", linkId, `Test should click on the correct link.`);
    Assert.equal(
      "https://example.org/browser/comm/mail/components/extensions/test/browser/data/content.html",
      expectedUrl,
      `Test should open the correct link.`
    );
    await clickLink(linkId, getBrowser());
    MockExternalProtocolService.assertHasLoadedURL(expectedUrl);
    await extension.sendMessage();
  } else {
    // Should open in same tab with single-site link handler.
    const { linkId } = await extension.awaitMessage("click");
    Assert.equal("#linkExt3", linkId, `Test should click on the correct link.`);
    await clickLink(linkId, getBrowser());
    Assert.equal(
      MockExternalProtocolService.urls.length,
      0,
      `Link should not have been opened in external browser.`
    );
    await extension.sendMessage();
  }

  // Wait for click on #linkExt4.
  if (expectedLinkHandler == "single-page") {
    // Should open extern with single-page link handler.
    const { linkId, expectedUrl } = await extension.awaitMessage("click");
    Assert.equal("#linkExt4", linkId, `Test should click on the correct link.`);
    Assert.equal(
      "https://example.org/browser/comm/mail/components/extensions/test/browser/data/content.html",
      expectedUrl,
      `Test should open the correct link.`
    );
    await clickLink(linkId, getBrowser());
    MockExternalProtocolService.assertHasLoadedURL(expectedUrl);
    await extension.sendMessage();
  } else {
    // Should open in same tab with single-site link handler.
    const { linkId } = await extension.awaitMessage("click");
    Assert.equal("#linkExt4", linkId, `Test should click on the correct link.`);
    await clickLink(linkId, getBrowser());
    Assert.equal(
      MockExternalProtocolService.urls.length,
      0,
      `Link should not have been opened in external browser.`
    );
    await extension.sendMessage();
  }

  await extension.awaitFinish();
  await extension.unload();
};

add_task(async function test_tabs() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "tabFunctions.js": getTabFunctions(),
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
    "single-site",
    () => document.getElementById("tabmail").currentTabInfo.browser
  );
});

add_task(async function test_tabs_relaxed() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "tabFunctions.js": getTabFunctions(),
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
    "browsers",
    () => document.getElementById("tabmail").currentTabInfo.browser
  );
});

add_task(async function test_tabs_strict() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "tabFunctions.js": getTabFunctions(),
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
    "single-page",
    () => document.getElementById("tabmail").currentTabInfo.browser
  );
});

add_task(async function test_spaces() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "tabFunctions.js": getSpaceFunctions(),
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
    "single-site",
    () => document.getElementById("tabmail").currentTabInfo.browser
  );
});

add_task(async function test_spaces_relaxed() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "tabFunctions.js": getSpaceFunctions(),
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
    "browsers",
    () => document.getElementById("tabmail").currentTabInfo.browser
  );
});

add_task(async function test_spaces_strict() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "tabFunctions.js": getSpaceFunctions(),
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
    "single-page",
    () => document.getElementById("tabmail").currentTabInfo.browser
  );
});

add_task(async function test_windows() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "windowFunctions.js": getWinFunctions(),
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
    "single-site",
    () => Services.wm.getMostRecentWindow("mail:extensionPopup").browser
  );
});

add_task(async function test_windows_relaxed() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "windowFunctions.js": getWinFunctions(),
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
    "browsers",
    () => Services.wm.getMostRecentWindow("mail:extensionPopup").browser
  );
});

add_task(async function test_windows_strict() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "windowFunctions.js": getWinFunctions(),
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
    "single-page",
    () => Services.wm.getMostRecentWindow("mail:extensionPopup").browser
  );
});

// We do not allow anything but single-page for the browser in mail3pane.
add_task(async function test_mail3pane() {
  const account = createAccount();
  const subFolders = account.incomingServer.rootFolder.subFolders;
  await createMessages(subFolders[0], 1);

  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  Assert.ok(Boolean(about3Pane), "about:3pane should be the current tab");
  about3Pane.restoreState({
    folderPaneVisible: true,
    folderURI: subFolders[0],
    messagePaneVisible: true,
  });
  const loadedPromise = BrowserTestUtils.browserLoaded(
    about3Pane.messageBrowser.contentWindow.getMessagePaneBrowser()
  );
  about3Pane.threadTree.selectedIndex = 0;
  await loadedPromise;
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "mail3paneFunctions.js": async () => {
        const updateTestTab = async url => {
          const updatedTestTab = new window.UpdateTabPromise();
          const mailTabs = await browser.tabs.query({ type: "mail" });
          browser.test.assertEq(
            1,
            mailTabs.length,
            "Should find a single mailTab"
          );
          await browser.tabs.update(mailTabs[0].id, { url });
          await updatedTestTab.verify(mailTabs[0].id, url);
          return mailTabs[0];
        };

        window.expectLinkOpenInNewTab = async (
          testUrl,
          linkId,
          expectedUrl
        ) => {
          await updateTestTab(testUrl);

          // Click a link in testTab to open a new tab.
          const createdNewTab = new window.CreateTabPromise();
          const updatedNewTab = new window.UpdateTabPromise();
          await window.sendMessage("click", { linkId });
          const createdTab = await createdNewTab.done();
          await updatedNewTab.verify(createdTab.id, expectedUrl);

          await browser.tabs.remove(createdTab.id);
        };

        window.expectLinkOpenInSameTab = async (
          testUrl,
          linkId,
          expectedUrl
        ) => {
          const testTab = await updateTestTab(testUrl);

          // Click a link in testTab to open in self.
          const updatedTab = new window.UpdateTabPromise();
          await window.sendMessage("click", { linkId });
          await updatedTab.verify(testTab.id, expectedUrl);
        };

        window.expectLinkOpenInExternalBrowser = async (
          testUrl,
          linkId,
          expectedUrl
        ) => {
          await updateTestTab(testUrl);
          await window.sendMessage("click", { linkId, expectedUrl });
        };
      },
      ...(await getCommonFiles()),
    },
    manifest: {
      background: {
        scripts: [
          "utils.js",
          "common.js",
          "mail3paneFunctions.js",
          "background.js",
        ],
      },
      permissions: ["tabs"],
    },
  });

  await subtest_clickInBrowser(
    extension,
    "single-page",
    () => document.getElementById("tabmail").currentTabInfo.browser
  );
});

// This is actually not an extension test, but everything we need is here already
// and we only want to simulate a click on a link in a message.
add_task(async function test_message() {
  const account = createAccount();
  const rootFolder = account.incomingServer.rootFolder;
  await createSubfolder(rootFolder, "test0");

  const subFolders = {};
  for (const folder of rootFolder.subFolders) {
    subFolders[folder.name] = folder;
  }
  await createMessageFromFile(
    subFolders.test0,
    getTestFilePath("messages/messageWithLink.eml")
  );

  // Select the message which has a link.
  const folder = subFolders.test0;
  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  about3Pane.displayFolder(folder.URI);
  const messagePane =
    about3Pane.messageBrowser.contentWindow.getMessagePaneBrowser();
  const loadedPromise = BrowserTestUtils.browserLoaded(messagePane);
  about3Pane.threadTree.selectedIndex = 0;
  await loadedPromise;

  // Click the link.
  await synthesizeMouseAtCenterAndRetry("#link", {}, messagePane);
  MockExternalProtocolService.assertHasLoadedURL(
    "https://www.example.de/messageLink.html"
  );
});
