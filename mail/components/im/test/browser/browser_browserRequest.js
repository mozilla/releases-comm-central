/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { InteractiveBrowser, CancelledError } = ChromeUtils.importESModule(
  "resource:///modules/InteractiveBrowser.sys.mjs"
);
const kBaseWindowUri = "chrome://messenger/content/browserRequest.xhtml";

add_task(async function testBrowserRequestObserverNotification() {
  const windowPromise = BrowserTestUtils.domWindowOpenedAndLoaded(
    undefined,
    win => win.document.documentURI === kBaseWindowUri
  );
  let notifyLoaded;
  const loadedPromise = new Promise(resolve => {
    notifyLoaded = resolve;
  });
  const cancelledPromise = new Promise(resolve => {
    Services.obs.notifyObservers(
      {
        promptText: "",
        iconURI: "",
        url: "about:blank",
        cancelled() {
          resolve();
        },
        loaded(window, webProgress) {
          ok(webProgress);
          notifyLoaded(window);
        },
      },
      "browser-request"
    );
  });

  const requestWindow = await windowPromise;
  const loadedWindow = await loadedPromise;
  ok(loadedWindow);
  is(loadedWindow.document.documentURI, kBaseWindowUri);

  const closeEvent = new Event("close");
  requestWindow.dispatchEvent(closeEvent);
  await BrowserTestUtils.closeWindow(requestWindow);

  await cancelledPromise;
});

add_task(async function testWaitForRedirect() {
  const initialUrl = "about:blank";
  const promptText = "just testing";
  const completionUrl = InteractiveBrowser.COMPLETION_URL + "/done?info=foo";
  const windowPromise = BrowserTestUtils.domWindowOpenedAndLoaded(
    undefined,
    win => win.document.documentURI === kBaseWindowUri
  );
  const request = InteractiveBrowser.waitForRedirect(initialUrl, promptText);
  const requestWindow = await windowPromise;
  is(requestWindow.document.title, promptText, "set window title");

  const closedWindow = BrowserTestUtils.domWindowClosed(requestWindow);
  const browser = requestWindow.document.getElementById("requestFrame");
  await BrowserTestUtils.browserLoaded(browser);
  BrowserTestUtils.startLoadingURIString(browser, completionUrl);
  const result = await request;
  is(result, completionUrl, "finished with correct URL");

  await closedWindow;
});

add_task(async function testCancelWaitForRedirect() {
  const initialUrl = "about:blank";
  const promptText = "just testing";
  const windowPromise = BrowserTestUtils.domWindowOpenedAndLoaded(
    undefined,
    win => win.document.documentURI === kBaseWindowUri
  );
  const request = InteractiveBrowser.waitForRedirect(initialUrl, promptText);
  const requestWindow = await windowPromise;
  is(requestWindow.document.title, promptText, "set window title");

  await new Promise(resolve => setTimeout(resolve));

  await BrowserTestUtils.closeWindow(requestWindow);
  const closeEvent = new Event("close");
  requestWindow.dispatchEvent(closeEvent);
  try {
    await request;
    ok(false, "request should be rejected");
  } catch (error) {
    ok(error instanceof CancelledError, "request was rejected");
  }
});

add_task(async function testAlreadyComplete() {
  const completionUrl = InteractiveBrowser.COMPLETION_URL + "/done?info=foo";
  const promptText = "just testing";
  const windowPromise = BrowserTestUtils.domWindowOpenedAndLoaded(
    undefined,
    win => win.document.documentURI === kBaseWindowUri
  );
  const request = InteractiveBrowser.waitForRedirect(completionUrl, promptText);
  const requestWindow = await windowPromise;
  is(requestWindow.document.title, promptText, "set window title");

  const closedWindow = BrowserTestUtils.domWindowClosed(requestWindow);
  const result = await request;
  is(result, completionUrl, "finished with correct URL");

  await closedWindow;
});
