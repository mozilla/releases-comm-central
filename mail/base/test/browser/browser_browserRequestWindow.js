/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../content/browserRequest.js */

/**
 * Open the browserRequest window.
 *
 * @returns {{cancelledPromise: Promise, requestWindow: DOMWindow}}
 */
async function openBrowserRequestWindow() {
  let onCancelled;
  let cancelledPromise = new Promise(resolve => {
    onCancelled = resolve;
  });
  let requestWindow = await new Promise(resolve => {
    Services.ww.openWindow(
      null,
      "chrome://messenger/content/browserRequest.xhtml",
      null,
      "chrome,private,centerscreen,width=980,height=750",
      {
        url: "http://mochi.test:8888/browser/comm/mail/base/test/browser/files/sampleContent.html",
        cancelled() {
          onCancelled();
        },
        loaded(window, webProgress) {
          resolve(window);
        },
      }
    );
  });
  return { cancelledPromise, requestWindow };
}

add_task(async function test_urlBar() {
  let { requestWindow, cancelledPromise } = await openBrowserRequestWindow();

  let browser = requestWindow.getBrowser();
  await BrowserTestUtils.browserLoaded(browser);
  ok(browser, "Got a browser from global getBrowser function");

  let urlBar = requestWindow.document.getElementById("headerMessage");
  is(urlBar.value, browser.currentURI.spec, "Initial page is shown in URL bar");

  let redirect = BrowserTestUtils.browserLoaded(browser);
  BrowserTestUtils.loadURIString(browser, "about:blank");
  await redirect;
  is(urlBar.value, "about:blank", "URL bar value follows browser");

  const closeEvent = new Event("close");
  requestWindow.dispatchEvent(closeEvent);
  await BrowserTestUtils.closeWindow(requestWindow);
  await cancelledPromise;
});

add_task(async function test_cancelWithEsc() {
  let { requestWindow, cancelledPromise } = await openBrowserRequestWindow();

  EventUtils.synthesizeKey("VK_ESCAPE", {}, requestWindow);
  await cancelledPromise;
});

add_task(async function test_cancelWithAccelW() {
  let { requestWindow, cancelledPromise } = await openBrowserRequestWindow();

  EventUtils.synthesizeKey(
    "w",
    { [AppConstants.platform == "macosx" ? "metaKey" : "ctrlKey"]: true },
    requestWindow
  );
  await cancelledPromise;
});
