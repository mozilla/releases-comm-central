/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Common core of the test. This is complicated by how WebExtensions tests work.
 *
 * @param {Function} createTab - The code of this function is copied into the
 *     extension. It should assign a function to `window.createTab` that opens
 *     the tab to be tested and return the id of the tab.
 * @param {Function} getBrowser - A function to get the <browser> associated
 *     with the tab.
 */
async function subTest(createTab, getBrowser, shouldRemove = true) {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "createTab.js": createTab,
      "background.js": async () => {
        // Open the tab to be tested.

        const tabId = await window.createTab();

        // Test insertCSS, removeCSS, and executeScript.

        await window.sendMessage();
        await browser.tabs.insertCSS(tabId, {
          code: "body { background: lime }",
        });
        await window.sendMessage();
        await browser.tabs.removeCSS(tabId, {
          code: "body { background: lime }",
        });
        await window.sendMessage();
        await browser.tabs.executeScript(tabId, {
          code: `
            document.body.textContent = "Hey look, the script ran!";
            browser.runtime.onConnect.addListener(port =>
              port.onMessage.addListener(message => {
                browser.test.assertEq(message, "Sending a message.");
                port.postMessage("Got your message.");
              })
            );
            browser.runtime.onMessage.addListener(
              (message, sender, sendResponse) => {
                browser.test.assertEq(message, "Sending a message.");
                sendResponse("Got your message.");
              }
            );
          `,
        });
        await window.sendMessage();

        // Test connect and sendMessage. The receivers were set up above.

        const port = await browser.tabs.connect(tabId);
        port.onMessage.addListener(message =>
          browser.test.assertEq(message, "Got your message.")
        );
        port.postMessage("Sending a message.");

        const response = await browser.tabs.sendMessage(
          tabId,
          "Sending a message."
        );
        browser.test.assertEq(response, "Got your message.");

        // Remove the tab if required.

        const [remove] = await window.sendMessage();
        if (remove) {
          await browser.tabs.remove(tabId);
        }
        browser.test.notifyPass();
      },
      "test.html": "<html><body>I'm a real page!</body></html>",
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "createTab.js", "background.js"] },
    },
  });

  await extension.startup();

  await extension.awaitMessage();
  const browser = getBrowser();
  await awaitBrowserLoaded(browser, url => url != "about:blank");

  await checkContent(browser, {
    backgroundColor: "rgba(0, 0, 0, 0)",
    textContent: "I'm a real page!",
  });
  extension.sendMessage();

  await extension.awaitMessage();
  await checkContent(browser, { backgroundColor: "rgb(0, 255, 0)" });
  extension.sendMessage();

  await extension.awaitMessage();
  await checkContent(browser, { backgroundColor: "rgba(0, 0, 0, 0)" });
  extension.sendMessage();

  await extension.awaitMessage();
  await checkContent(browser, { textContent: "Hey look, the script ran!" });
  extension.sendMessage();

  await extension.awaitMessage();
  extension.sendMessage(shouldRemove);

  await extension.awaitFinish();
  await extension.unload();
}

add_task(async function testFirstTab() {
  const createTab = async () => {
    window.createTab = async function () {
      const tabs = await browser.tabs.query({});
      browser.test.assertEq(1, tabs.length);
      await browser.tabs.update(tabs[0].id, { url: "test.html" });
      return tabs[0].id;
    };
  };

  const tabmail = document.getElementById("tabmail");
  function getBrowser() {
    return tabmail.currentTabInfo.browser;
  }

  const gAccount = createAccount();
  tabmail.currentAbout3Pane.restoreState({
    folderPaneVisible: true,
    folderURI: gAccount.incomingServer.rootFolder.subFolders[0].URI,
  });

  return subTest(createTab, getBrowser, false);
});

add_task(async function testContentTab() {
  const createTab = async () => {
    window.createTab = async function () {
      const tab = await browser.tabs.create({ url: "test.html" });
      return tab.id;
    };
  };

  function getBrowser() {
    const tabmail = document.getElementById("tabmail");
    return tabmail.currentTabInfo.browser;
  }

  const tabmail = document.getElementById("tabmail");
  Assert.equal(
    tabmail.tabInfo.length,
    1,
    "Should find the correct number of tabs before the test."
  );
  // Run the subtest without removing the created tab, to check if extension tabs
  // are removed automatically, when the extension is removed.
  const rv = await subTest(createTab, getBrowser, false);
  Assert.equal(
    tabmail.tabInfo.length,
    1,
    "Should find the correct number of tabs after the test."
  );
  return rv;
});

add_task(async function testPopupWindow() {
  const createTab = async () => {
    window.createTab = async function () {
      const popup = await browser.windows.create({
        url: "test.html",
        type: "popup",
      });
      browser.test.assertEq(1, popup.tabs.length);
      return popup.tabs[0].id;
    };
  };

  function getBrowser() {
    const popups = [...Services.wm.getEnumerator("mail:extensionPopup")];
    Assert.equal(popups.length, 1);

    const popup = popups[0];

    const popupBrowser = popup.getBrowser();
    Assert.ok(popupBrowser);

    return popupBrowser;
  }
  const popups = [...Services.wm.getEnumerator("mail:extensionPopup")];
  Assert.equal(
    popups.length,
    0,
    "Should find the no extension windows before the test."
  );
  // Run the subtest without removing the created window, to check if extension
  // windows are removed automatically, when the extension is removed.
  const rv = await subTest(createTab, getBrowser, false);
  Assert.equal(
    popups.length,
    0,
    "Should find the no extension windows after the test."
  );
  return rv;
});

add_task(async function testMultipleContentTabs() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const tabs = [];
        const tests = [
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
    8,
    "Should find the correct number of tabs after the test."
  );

  await extension.unload();
  // After unload, the two extension tabs should be closed.
  Assert.equal(
    tabmail.tabInfo.length,
    6,
    "Should find the correct number of tabs after extension unload."
  );

  for (let i = tabmail.tabInfo.length; i > 0; i--) {
    const nativeTabInfo = tabmail.tabInfo[i - 1];
    const uri = nativeTabInfo.browser?.browsingContext.currentURI;
    if (uri && ["https", "http"].includes(uri.scheme)) {
      tabmail.closeTab(nativeTabInfo);
    }
  }
  Assert.equal(
    tabmail.tabInfo.length,
    1,
    "Should find the correct number of tabs after test has finished."
  );
});
