/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

let { BrowserTestUtils } = ChromeUtils.import(
  "resource://testing-common/BrowserTestUtils.jsm"
);
let { MockRegistrar } = ChromeUtils.import(
  "resource://testing-common/MockRegistrar.jsm"
);

/** @implements {nsIExternalProtocolService} */
let mockExternalProtocolService = {
  _loadedURLs: [],
  externalProtocolHandlerExists(aProtocolScheme) {},
  getApplicationDescription(aScheme) {},
  getProtocolHandlerInfo(aProtocolScheme) {},
  getProtocolHandlerInfoFromOS(aProtocolScheme, aFound) {},
  isExposedProtocol(aProtocolScheme) {},
  loadURI(aURI, aWindowContext) {
    this._loadedURLs.push(aURI.spec);
  },
  setProtocolHandlerDefaults(aHandlerInfo, aOSHandlerExists) {},
  urlLoaded(aURL) {
    return this._loadedURLs.includes(aURL);
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

add_task(async () => {
  let extension = ExtensionTestUtils.loadExtension({
    async background() {
      const urls = {
        "http://www.google.de/": true,
        "https://www.google.de/": true,
        "ftp://www.google.de/": false,
      };

      for (let [url, expected] of Object.entries(urls)) {
        let rv = null;
        try {
          await browser.windows.openDefaultBrowser(url);
          rv = true;
        } catch (e) {
          rv = false;
        }
        browser.test.assertEq(
          rv,
          expected,
          `Checking result for browser.windows.openDefaultBrowser(${url})`
        );
      }
      browser.test.sendMessage("ready", urls);
    },
  });

  await extension.startup();
  let urls = await extension.awaitMessage("ready");
  for (let [url, expected] of Object.entries(urls)) {
    Assert.equal(
      mockExternalProtocolService.urlLoaded(url),
      expected,
      `Double check result for browser.windows.openDefaultBrowser(${url})`
    );
  }

  await extension.unload();
});

add_task(async () => {
  let extension = ExtensionTestUtils.loadExtension({
    async background() {
      let listener = {
        waitingPromises: [],
        waitForEvent() {
          return new Promise(resolve => {
            listener.waitingPromises.push(resolve);
          });
        },
        checkWaiting() {
          if (listener.waitingPromises.length < 1) {
            browser.test.fail("Unexpected event fired");
          }
        },
        created(win) {
          listener.checkWaiting();
          listener.waitingPromises.shift()(["onCreated", win]);
        },
        focusChanged(windowId) {
          listener.checkWaiting();
          listener.waitingPromises.shift()(["onFocusChanged", windowId]);
        },
        removed(windowId) {
          listener.checkWaiting();
          listener.waitingPromises.shift()(["onRemoved", windowId]);
        },
      };
      browser.windows.onCreated.addListener(listener.created);
      browser.windows.onFocusChanged.addListener(listener.focusChanged);
      browser.windows.onRemoved.addListener(listener.removed);

      let firstWindow = await browser.windows.getCurrent();
      browser.test.assertEq("normal", firstWindow.type);

      let currentWindows = await browser.windows.getAll();
      browser.test.assertEq(1, currentWindows.length);
      browser.test.assertEq(firstWindow.id, currentWindows[0].id);

      // Open a new mail window.

      let createdWindowPromise = listener.waitForEvent();
      let focusChangedPromise1 = listener.waitForEvent();
      let focusChangedPromise2 = listener.waitForEvent();
      let eventName, createdWindow, windowId;

      browser.test.sendMessage("openWindow");
      [eventName, createdWindow] = await createdWindowPromise;
      browser.test.assertEq("onCreated", eventName);
      browser.test.assertEq("normal", createdWindow.type);

      [eventName, windowId] = await focusChangedPromise1;
      browser.test.assertEq("onFocusChanged", eventName);
      browser.test.assertEq(browser.windows.WINDOW_ID_NONE, windowId);

      [eventName, windowId] = await focusChangedPromise2;
      browser.test.assertEq("onFocusChanged", eventName);
      browser.test.assertEq(createdWindow.id, windowId);

      currentWindows = await browser.windows.getAll();
      browser.test.assertEq(2, currentWindows.length);
      browser.test.assertEq(firstWindow.id, currentWindows[0].id);
      browser.test.assertEq(createdWindow.id, currentWindows[1].id);

      // Focus the first window.

      let platformInfo = await browser.runtime.getPlatformInfo();

      let focusChangedPromise3;
      if (["mac", "win"].includes(platformInfo.os)) {
        // Mac and Windows don't fire this event. Pretend they do.
        focusChangedPromise3 = Promise.resolve([
          "onFocusChanged",
          browser.windows.WINDOW_ID_NONE,
        ]);
      } else {
        focusChangedPromise3 = listener.waitForEvent();
      }
      let focusChangedPromise4 = listener.waitForEvent();

      browser.test.sendMessage("switchWindows");
      [eventName, windowId] = await focusChangedPromise3;
      browser.test.assertEq("onFocusChanged", eventName);
      browser.test.assertEq(browser.windows.WINDOW_ID_NONE, windowId);

      [eventName, windowId] = await focusChangedPromise4;
      browser.test.assertEq("onFocusChanged", eventName);
      browser.test.assertEq(firstWindow.id, windowId);

      // Close the first window.

      let removedWindowPromise = listener.waitForEvent();

      browser.test.sendMessage("closeWindow");
      [eventName, windowId] = await removedWindowPromise;
      browser.test.assertEq("onRemoved", eventName);
      browser.test.assertEq(createdWindow.id, windowId);

      currentWindows = await browser.windows.getAll();
      browser.test.assertEq(1, currentWindows.length);
      browser.test.assertEq(firstWindow.id, currentWindows[0].id);

      browser.windows.onCreated.removeListener(listener.created);
      browser.windows.onFocusChanged.removeListener(listener.focusChanged);
      browser.windows.onRemoved.removeListener(listener.removed);

      browser.test.notifyPass();
    },
  });

  let account = createAccount();

  await extension.startup();

  await extension.awaitMessage("openWindow");
  let newWindowPromise = BrowserTestUtils.domWindowOpened();
  window.MsgOpenNewWindowForFolder(account.incomingServer.rootFolder.URI);
  let newWindow = await newWindowPromise;

  await extension.awaitMessage("switchWindows");
  window.focus();

  await extension.awaitMessage("closeWindow");
  newWindow.close();

  await extension.awaitFinish();
  await extension.unload();
});

add_task(async function checkTitlePreface() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "content.html": `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8"/>
          <title>A test document</title>
          <script type="text/javascript" src="content.js"></script>
        </head>
        <body>
          <p>This is text.</p>
        </body>
        </html>
      `,
      "content.js": `
        browser.runtime.onMessage.addListener(
          (data, sender) => {
            if (data.command == "close") {
              window.close();
            }
          }
        );`,
      "utils.js": await getUtilsJS(),
      "background.js": async () => {
        let popup;

        // Test titlePreface during window creation.
        {
          let windowCreatePromise = window.waitForEvent("windows.onCreated");
          let titlePreface = "PREFACE1";
          popup = await browser.windows.create({
            titlePreface,
            url: "content.html",
            type: "popup",
            allowScriptsToClose: true,
          });
          await windowCreatePromise;
          await window.sendMessage("checkTitle", titlePreface);
        }

        // Test titlePreface during window update.
        {
          let titlePreface = "PREFACE2";
          await browser.windows.update(popup.id, {
            titlePreface,
          });
          await window.sendMessage("checkTitle", titlePreface);
        }

        // Finish
        {
          let windowRemovePromise = window.waitForEvent("windows.onRemoved");
          browser.test.log(
            "Testing allowScriptsToClose, waiting for window to close."
          );
          await browser.runtime.sendMessage({ command: "close" });
          await windowRemovePromise;
          browser.test.notifyPass("finished");
        }
      },
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
    },
  });

  extension.onMessage("checkTitle", async titlePreface => {
    let win = Services.wm.getMostRecentWindow("mail:extensionPopup");

    let expectedTitle = titlePreface + "A test document";
    // If we're on Mac, don't display the separator and the modifier.
    if (AppConstants.platform != "macosx") {
      expectedTitle +=
        win.document.documentElement.getAttribute("titlemenuseparator") +
        win.document.documentElement.getAttribute("titlemodifier");
    }

    if (win.document.title != expectedTitle) {
      await BrowserTestUtils.waitForEvent(
        win.document,
        "extension-window-title-changed"
      );
    }

    Assert.equal(
      win.document.title,
      expectedTitle,
      `Check if title is as expected.`
    );
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
