/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

/** @implements {nsIExternalProtocolService} */
const mockExternalProtocolService = {
  _loadedURLs: [],
  externalProtocolHandlerExists() {},
  getApplicationDescription() {},
  getProtocolHandlerInfo() {},
  getProtocolHandlerInfoFromOS() {},
  isExposedProtocol() {},
  loadURI(uri) {
    this._loadedURLs.push(uri.spec);
  },
  setProtocolHandlerDefaults() {},
  urlLoaded(url) {
    const found = this._loadedURLs.includes(url);
    this._loadedURLs = this._loadedURLs.filter(e => e != url);
    return found;
  },
  QueryInterface: ChromeUtils.generateQI(["nsIExternalProtocolService"]),
};

const mockExternalProtocolServiceCID = MockRegistrar.register(
  "@mozilla.org/uriloader/external-protocol-service;1",
  mockExternalProtocolService
);

registerCleanupFunction(() => {
  MockRegistrar.unregister(mockExternalProtocolServiceCID);
});

add_task(async function test_openDefaultBrowser() {
  const extension = ExtensionTestUtils.loadExtension({
    async background() {
      const urls = {
        // eslint-disable-next-line @microsoft/sdl/no-insecure-url
        "http://www.google.de/": true,
        "https://www.google.de/": true,
        "ftp://www.google.de/": false,
      };

      for (const [url, expected] of Object.entries(urls)) {
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
  const urls = await extension.awaitMessage("ready");
  for (const [url, expected] of Object.entries(urls)) {
    Assert.equal(
      mockExternalProtocolService.urlLoaded(url),
      expected,
      `Double check result for browser.windows.openDefaultBrowser(${url})`
    );
  }

  await extension.unload();
});

add_task(async function test_focusWindows() {
  const extension = ExtensionTestUtils.loadExtension({
    async background() {
      const listener = {
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

      const firstWindow = await browser.windows.getCurrent();
      browser.test.assertEq("normal", firstWindow.type);

      let currentWindows = await browser.windows.getAll();
      browser.test.assertEq(1, currentWindows.length);
      browser.test.assertEq(firstWindow.id, currentWindows[0].id);

      // Open a new mail window.

      const createdWindowPromise = listener.waitForEvent();
      const focusChangedPromise1 = listener.waitForEvent();
      const focusChangedPromise2 = listener.waitForEvent();
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

      const platformInfo = await browser.runtime.getPlatformInfo();

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
      const focusChangedPromise4 = listener.waitForEvent();

      browser.test.sendMessage("switchWindows");
      [eventName, windowId] = await focusChangedPromise3;
      browser.test.assertEq("onFocusChanged", eventName);
      browser.test.assertEq(browser.windows.WINDOW_ID_NONE, windowId);

      [eventName, windowId] = await focusChangedPromise4;
      browser.test.assertEq("onFocusChanged", eventName);
      browser.test.assertEq(firstWindow.id, windowId);

      // Close the first window.

      const removedWindowPromise = listener.waitForEvent();

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

  const account = createAccount();

  await extension.startup();

  await extension.awaitMessage("openWindow");
  const newWindowPromise = BrowserTestUtils.domWindowOpened();
  window.MsgOpenNewWindowForFolder(account.incomingServer.rootFolder.URI);
  const newWindow = await newWindowPromise;

  await extension.awaitMessage("switchWindows");
  window.focus();

  await extension.awaitMessage("closeWindow");
  newWindow.close();

  await extension.awaitFinish();
  await extension.unload();
});

add_task(async function checkTitlePreface() {
  const l10n = new Localization([
    "branding/brand.ftl",
    "messenger/extensions/popup.ftl",
  ]);

  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "content.html": `<!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8"/>
            <title>A test document</title>
            <script defer="defer" src="content.js"></script>
          </head>
          <body>
            <p>This is text.</p>
          </body>
        </html>`,
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
        let popupWindowId;

        // Test focus and titlePreface during window creation.
        {
          const titlePreface = "PREFACE1";

          const popupWindowCreatedPromise =
            window.waitForEvent("windows.onCreated");
          const popupWindowTabPromise = new Promise(resolve => {
            let urlSeen = false;
            const updateListener = (tabId, changeInfo, tab) => {
              if (changeInfo.url?.endsWith("/content.html")) {
                urlSeen = true;
              }
              if (urlSeen && changeInfo.status == "complete") {
                resolve(tab);
              }
            };
            browser.tabs.onUpdated.addListener(updateListener);
            browser.windows.create({
              titlePreface,
              url: "content.html",
              type: "popup",
              allowScriptsToClose: true,
            });
          });

          // Focus should be correct after the Promise returned by windows.create()
          // has fulfilled.
          const [popupWindow] = await popupWindowCreatedPromise;
          browser.test.assertEq(
            true,
            popupWindow.focused,
            `Should find the correct focus state`
          );

          // Bug 1879004 - Wait for the inner tab to be completed, before checking
          // the title.
          await popupWindowTabPromise;
          const [expectedTitle] = await window.sendMessage(
            "checkTitle",
            titlePreface
          );
          const { title: windowTitle } = await browser.windows.get(
            popupWindow.id
          );
          browser.test.assertEq(
            expectedTitle,
            windowTitle,
            `Should find the correct title`
          );

          popupWindowId = popupWindow.id;
        }

        // Test titlePreface during window update.
        {
          const titlePreface = "PREFACE2";
          const updated = await browser.windows.update(popupWindowId, {
            titlePreface,
          });
          const [expectedTitle] = await window.sendMessage(
            "checkTitle",
            titlePreface
          );
          browser.test.assertEq(
            expectedTitle,
            updated.title,
            `Should find the correct title`
          );
          browser.test.assertEq(
            true,
            updated.focused,
            `Should find the correct focus state`
          );
        }

        // Finish
        {
          const windowRemovePromise = window.waitForEvent("windows.onRemoved");
          browser.test.log(
            "Testing allowScriptsToClose, waiting for window to close."
          );
          await browser.runtime.sendMessage({ command: "close" });
          await windowRemovePromise;
        }

        // Test title after create without a preface.
        {
          const popupWindowCreatedPromise =
            window.waitForEvent("windows.onCreated");
          const popupWindowTabPromise = new Promise(resolve => {
            let urlSeen = false;
            const updateListener = (tabId, changeInfo, tab) => {
              if (changeInfo.url?.endsWith("/content.html")) {
                urlSeen = true;
              }
              if (urlSeen && changeInfo.status == "complete") {
                resolve(tab);
              }
            };
            browser.tabs.onUpdated.addListener(updateListener);
            browser.windows.create({
              url: "content.html",
              type: "popup",
              allowScriptsToClose: true,
            });
          });

          // Focus should be correct after the Promise returned by windows.create()
          // has fulfilled.
          const [popupWindow] = await popupWindowCreatedPromise;
          browser.test.assertEq(
            true,
            popupWindow.focused,
            `Should find the correct focus state`
          );

          // Bug 1879004 - Wait for the inner tab to be completed, before checking
          // the title.
          await popupWindowTabPromise;
          const [expectedTitle] = await window.sendMessage("checkTitle", "");
          const { title: windowTitle } = await browser.windows.get(
            popupWindow.id
          );
          browser.test.assertEq(
            expectedTitle,
            windowTitle,
            `Should find the correct title`
          );
        }

        browser.test.notifyPass("finished");
      },
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
    },
  });

  extension.onMessage("checkTitle", async titlePreface => {
    const win = Services.wm.getMostRecentWindow("mail:extensionPopup");

    const defaultTitle = await l10n.formatValue(
      "extension-popup-default-title"
    );

    let expectedTitle = titlePreface + "A test document";
    // If we're on Mac, we don't display the separator and the app name (which
    // is also used as default title).
    if (AppConstants.platform != "macosx") {
      expectedTitle += ` - ${defaultTitle}`;
    }

    Assert.equal(
      win.document.title,
      expectedTitle,
      `Check if title is as expected.`
    );
    extension.sendMessage(expectedTitle);
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function test_popupLayoutProperties() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "test.html": `<!DOCTYPE html>
        <html>
          <head>
            <title>TEST</title>
            <meta charset="utf-8">
          </head>
          <body>
            <p>Test body</p>
          </body>
        </html>`,
      "background.js": async () => {
        async function checkWindow(windowId, expected, retries = 0, info = "") {
          const win = await browser.windows.get(windowId);

          if (
            retries &&
            Object.keys(expected).some(key => expected[key] != win[key])
          ) {
            browser.test.log(
              `Got mismatched size (${JSON.stringify(
                expected
              )} != ${JSON.stringify(win)}). Retrying after a short delay.`
            );
            // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
            await new Promise(resolve => setTimeout(resolve, 200));
            return checkWindow(windowId, expected, retries - 1, info);
          }

          for (const [key, value] of Object.entries(expected)) {
            browser.test.assertEq(
              value,
              win[key],
              `${info}: Should find the correct value for ${key}`
            );
          }

          return true;
        }

        const tests = [
          { retries: 0, properties: { state: "minimized" } },
          { retries: 0, properties: { state: "maximized" } },
          { retries: 0, properties: { state: "fullscreen" } },
          {
            retries: 5,
            properties: { width: 210, height: 220, left: 90, top: 80 },
          },
        ];

        // Test create.
        for (const test of tests) {
          const win = await browser.windows.create({
            type: "popup",
            url: "test.html",
            ...test.properties,
          });
          await checkWindow(
            win.id,
            test.properties,
            test.retries,
            "browser.windows.create()"
          );
          await browser.windows.remove(win.id);
        }

        // Test update.
        for (const test of tests) {
          const win = await browser.windows.create({
            type: "popup",
            url: "test.html",
          });
          await browser.windows.update(win.id, test.properties);
          await checkWindow(
            win.id,
            test.properties,
            test.retries,
            "browser.windows.update()"
          );
          await browser.windows.remove(win.id);
        }

        browser.test.notifyPass();
      },
    },
    manifest: {
      background: { scripts: ["background.js"] },
    },
  });
  await extension.startup();
  await extension.awaitFinish();
  await extension.unload();
});
