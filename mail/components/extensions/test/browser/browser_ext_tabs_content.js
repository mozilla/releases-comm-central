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
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "createTab.js": createTab,
      "background.js": async () => {
        // Open the tab to be tested.

        let tabId = await window.createTab();

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

        let port = await browser.tabs.connect(tabId);
        port.onMessage.addListener(message =>
          browser.test.assertEq(message, "Got your message.")
        );
        port.postMessage("Sending a message.");

        let response = await browser.tabs.sendMessage(
          tabId,
          "Sending a message."
        );
        browser.test.assertEq(response, "Got your message.");

        // Remove the tab if required.

        let [shouldRemove] = await window.sendMessage();
        if (shouldRemove) {
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
  let browser = getBrowser();
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
  let createTab = async () => {
    window.createTab = async function () {
      let tabs = await browser.tabs.query({});
      browser.test.assertEq(1, tabs.length);
      await browser.tabs.update(tabs[0].id, { url: "test.html" });
      return tabs[0].id;
    };
  };

  let tabmail = document.getElementById("tabmail");
  function getBrowser(expected) {
    return tabmail.currentTabInfo.browser;
  }

  let gAccount = createAccount();
  tabmail.currentAbout3Pane.restoreState({
    folderPaneVisible: true,
    folderURI: gAccount.incomingServer.rootFolder.subFolders[0].URI,
  });

  return subTest(createTab, getBrowser, false);
});

add_task(async function testContentTab() {
  let createTab = async () => {
    window.createTab = async function () {
      let tab = await browser.tabs.create({ url: "test.html" });
      return tab.id;
    };
  };

  function getBrowser(expected) {
    let tabmail = document.getElementById("tabmail");
    return tabmail.currentTabInfo.browser;
  }

  let tabmail = document.getElementById("tabmail");
  Assert.equal(
    tabmail.tabInfo.length,
    1,
    "Should find the correct number of tabs before the test."
  );
  // Run the subtest without removing the created tab, to check if extension tabs
  // are removed automatically, when the extension is removed.
  let rv = await subTest(createTab, getBrowser, false);
  Assert.equal(
    tabmail.tabInfo.length,
    1,
    "Should find the correct number of tabs after the test."
  );
  return rv;
});

add_task(async function testPopupWindow() {
  let createTab = async () => {
    window.createTab = async function () {
      let popup = await browser.windows.create({
        url: "test.html",
        type: "popup",
      });
      browser.test.assertEq(1, popup.tabs.length);
      return popup.tabs[0].id;
    };
  };

  function getBrowser(expected) {
    let popups = [...Services.wm.getEnumerator("mail:extensionPopup")];
    Assert.equal(popups.length, 1);

    let popup = popups[0];

    let popupBrowser = popup.getBrowser();
    Assert.ok(popupBrowser);

    return popupBrowser;
  }
  let popups = [...Services.wm.getEnumerator("mail:extensionPopup")];
  Assert.equal(
    popups.length,
    0,
    "Should find the no extension windows before the test."
  );
  // Run the subtest without removing the created window, to check if extension
  // windows are removed automatically, when the extension is removed.
  let rv = await subTest(createTab, getBrowser, false);
  Assert.equal(
    popups.length,
    0,
    "Should find the no extension windows after the test."
  );
  return rv;
});

add_task(async function testMultipleContentTabs() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        let tabs = [];
        let tests = [
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
          let tabDonePromise = new Promise(resolve => {
            let changeInfoStatus = false;
            let changeInfoUrl = false;

            let listener = (tabId, changeInfo) => {
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

          let tab = await browser.tabs.create({ url });
          for (let otherTab of tabs) {
            browser.test.assertTrue(
              tab.id != otherTab.id,
              "Id of created tab should be unique."
            );
          }
          tabs.push(tab);

          let changeInfoUrl = await tabDonePromise;
          browser.test.assertEq(
            expectedUrl,
            changeInfoUrl,
            "Should have seen the correct url."
          );
        }

        for (let { url, expectedUrl } of tests) {
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

  let tabmail = document.getElementById("tabmail");
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
    let nativeTabInfo = tabmail.tabInfo[i - 1];
    let uri = nativeTabInfo.browser?.browsingContext.currentURI;
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
