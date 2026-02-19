/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Test wether the extension can load remote pages and extension pages into tabs,
 * and receives the expected load events. When unloading the extension, all tabs
 * with loaded extension pages should be closed.
 */
add_task(async function testMultipleContentTabs() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const tabs = [];
        const tests = [
          {
            url: "about:blank",
            expectedUrl: "about:blank",
          },
          {
            url: "test.html",
            expectedUrl: browser.runtime.getURL("test.html"),
          },
          {
            url: "test.html",
            expectedUrl: browser.runtime.getURL("test.html"),
          },
          {
            url: "https://www.example.com",
            expectedUrl: "https://www.example.com/",
          },
          {
            url: "https://www.example.com",
            expectedUrl: "https://www.example.com/",
          },
          {
            url: "https://www.example.com/",
            expectedUrl: "https://www.example.com/",
          },
          {
            url: "https://www.example.com/",
            expectedUrl: "https://www.example.com/",
          },
          {
            url: "https://www.example.com/",
            expectedUrl: "https://www.example.com/",
          },
        ];

        async function create(url, expectedUrl) {
          const tabDonePromise = new Promise(resolve => {
            let changeInfoStatus = false;
            let changeInfoUrl = false;

            const listener = (tabId, changeInfo) => {
              if (!tab || tab.id != tabId) {
                return;
              }
              // Looks like "complete" is reached sometimes before the url is done,
              // so check for both.
              if (changeInfo.status == "complete") {
                changeInfoStatus = true;
              }
              if (changeInfo.url) {
                changeInfoUrl = changeInfo.url;
              }

              if (changeInfoStatus && changeInfoUrl) {
                browser.tabs.onUpdated.removeListener(listener);
                resolve(changeInfoUrl);
              }
            };
            browser.tabs.onUpdated.addListener(listener);
          });

          const tab = await browser.tabs.create({ url });
          for (const otherTab of tabs) {
            browser.test.assertTrue(
              tab.id != otherTab.id,
              "Id of created tab should be unique."
            );
          }
          tabs.push(tab);

          const changeInfoUrl = await tabDonePromise;
          browser.test.assertEq(
            expectedUrl,
            changeInfoUrl,
            "Should have seen the correct url."
          );
        }

        for (const { url, expectedUrl } of tests) {
          await create(url, expectedUrl);
        }

        browser.test.notifyPass();
      },
      "test.html": "<html><body>I'm a real page!</body></html>",
    },
    manifest: {
      background: { scripts: ["background.js"] },
      permissions: ["tabs"],
    },
  });

  const tabmail = document.getElementById("tabmail");
  Assert.equal(
    tabmail.tabInfo.length,
    1,
    "Should find the correct number of tabs before the test."
  );

  await extension.startup();
  await extension.awaitFinish();
  Assert.equal(
    tabmail.tabInfo.length,
    9,
    "Should find the correct number of tabs after the test."
  );

  await extension.unload();
  // After unload, the two extension tabs should be closed.
  Assert.equal(
    tabmail.tabInfo.length,
    7,
    "Should find the correct number of tabs after extension unload."
  );

  for (let i = tabmail.tabInfo.length; i > 0; i--) {
    const nativeTabInfo = tabmail.tabInfo[i - 1];
    const uri = nativeTabInfo.browser?.browsingContext.currentURI;
    if (uri && ["https", "http", "about"].includes(uri.scheme)) {
      tabmail.closeTab(nativeTabInfo);
    }
  }
  Assert.equal(
    tabmail.tabInfo.length,
    1,
    "Should find the correct number of tabs after test has finished."
  );
});

/**
 * Test wether the extension can load remote pages and extension pages into popup
 * windows, and receives the expected load events. When unloading the extension,
 * all popup windows with loaded extension pages should be closed.
 */
add_task(async function testMultipleContentPopups() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const tabs = [];
        const tests = [
          {
            url: "about:blank",
            expectedUrl: "about:blank",
          },
          {
            url: "test.html",
            expectedUrl: browser.runtime.getURL("test.html"),
          },
          {
            url: "test.html",
            expectedUrl: browser.runtime.getURL("test.html"),
          },
          {
            url: "https://www.example.com",
            expectedUrl: "https://www.example.com/",
          },
          {
            url: "https://www.example.com",
            expectedUrl: "https://www.example.com/",
          },
          {
            url: "https://www.example.com/",
            expectedUrl: "https://www.example.com/",
          },
          {
            url: "https://www.example.com/",
            expectedUrl: "https://www.example.com/",
          },
          {
            url: "https://www.example.com/",
            expectedUrl: "https://www.example.com/",
          },
        ];

        async function create(url, expectedUrl) {
          const openPopup = async () => {
            const tabDoneTask = Promise.withResolvers();
            let changeInfoStatus = false;
            let changeInfoUrl = false;
            let changeInfoTabId;
            const events = [];

            const listener = (lTabId, lChangeInfo) => {
              browser.test.log(JSON.stringify({ lTabId, lChangeInfo }));
              events.push({ tabId: lTabId, changeInfo: lChangeInfo });
              if (lChangeInfo.setTabId) {
                // This is a synthetic event to set the tabId for this create
                // operation.
                changeInfoTabId = lTabId;
              }

              if (!changeInfoTabId) {
                // Skip events evaluation until we know our popup tab id.
                return;
              }
              while (events.length > 0) {
                const { tabId, changeInfo } = events.pop();
                if (changeInfoTabId != tabId) {
                  continue;
                }
                if (changeInfo.status == "complete") {
                  changeInfoStatus = true;
                }
                if (changeInfo.url) {
                  changeInfoUrl = changeInfo.url;
                }
              }
              if (changeInfoStatus && changeInfoUrl) {
                browser.tabs.onUpdated.removeListener(listener);
                tabDoneTask.resolve({
                  popupTabId: changeInfoTabId,
                  popupUrl: changeInfoUrl,
                });
              }
            };
            browser.tabs.onUpdated.addListener(listener);

            const win = await browser.windows.create({ type: "popup", url });
            listener(win.tabs[0].id, { setTabId: true });
            return tabDoneTask.promise;
          };

          const { popupTabId, popupUrl } = await openPopup();

          for (const otherTab of tabs) {
            browser.test.assertTrue(
              popupTabId != otherTab.id,
              "Id of created tab should be unique."
            );
          }
          tabs.push(popupTabId);

          browser.test.assertEq(
            expectedUrl,
            popupUrl,
            "Should have seen the correct url."
          );
        }

        for (const { url, expectedUrl } of tests) {
          await create(url, expectedUrl);
        }

        browser.test.notifyPass();
      },
      "test.html": "<html><body>I'm a real page!</body></html>",
    },
    manifest: {
      background: { scripts: ["background.js"] },
      permissions: ["tabs"],
    },
  });

  Assert.equal(
    [...Services.wm.getEnumerator("mail:extensionPopup")].length,
    0,
    "Should find the correct number of open popups before the test."
  );

  await extension.startup();
  await extension.awaitFinish();
  Assert.equal(
    [...Services.wm.getEnumerator("mail:extensionPopup")].length,
    8,
    "Should find the correct number of open popups after the test."
  );

  await extension.unload();
  await TestUtils.waitForTick();
  // After unload, the two extension popups should be closed.
  Assert.equal(
    [...Services.wm.getEnumerator("mail:extensionPopup")].length,
    6,
    "Should find the correct number of open popups after extension unload."
  );

  // Close the remaining popups.
  for (const window of Services.wm.getEnumerator("mail:extensionPopup")) {
    window.close();
  }
  await TestUtils.waitForTick();
  Assert.equal(
    [...Services.wm.getEnumerator("mail:extensionPopup")].length,
    0,
    "Should find the correct number of open popups after test has finished."
  );
});
