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
  if (
    browser.webProgress?.isLoadingDocument ||
    browser.currentURI?.spec == "about:blank"
  ) {
    await BrowserTestUtils.browserLoaded(browser);
  }

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
    window.createTab = async function() {
      let tabs = await browser.tabs.query({});
      browser.test.assertEq(1, tabs.length);
      await browser.tabs.update(tabs[0].id, { url: "test.html" });
      return tabs[0].id;
    };
  };

  function getBrowser(expected) {
    let tabmail = document.getElementById("tabmail");
    return tabmail.currentTabInfo.browser;
  }

  if (
    document.getElementById("folderpane_splitter").getAttribute("state") ==
    "collapsed"
  ) {
    window.MsgToggleFolderPane();
  }

  let gAccount = createAccount();
  window.gFolderTreeView.selectFolder(
    gAccount.incomingServer.rootFolder.subFolders[0]
  );
  window.ClearMessagePane();
  return subTest(createTab, getBrowser, false);
});

add_task(async function testContentTab() {
  let createTab = async () => {
    window.createTab = async function() {
      let tab = await browser.tabs.create({ url: "test.html" });
      return tab.id;
    };
  };

  function getBrowser(expected) {
    let tabmail = document.getElementById("tabmail");
    return tabmail.currentTabInfo.browser;
  }

  return subTest(createTab, getBrowser);
});

add_task(async function testPopupWindow() {
  let createTab = async () => {
    window.createTab = async function() {
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

  return subTest(createTab, getBrowser);
});
