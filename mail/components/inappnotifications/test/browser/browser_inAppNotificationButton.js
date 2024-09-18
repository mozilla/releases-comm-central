/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
let browser,
  button,
  loadedUri = false;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/inappnotifications/test/browser/files/inAppNotificationButton.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser, undefined, url =>
    url.endsWith("inAppNotificationButton.xhtml")
  );
  await SimpleTest.promiseFocus(tab.browser);
  browser = tab.browser;
  button = browser.contentWindow.document.querySelector(
    `[is="in-app-notification-button"]`
  );

  /** @implements {nsIExternalProtocolService} */
  const mockExternalProtocolService = {
    QueryInterface: ChromeUtils.generateQI(["nsIExternalProtocolService"]),
    externalProtocolHandlerExists() {},
    isExposedProtocol() {},
    loadURI() {
      loadedUri = true;
    },
  };

  const mockExternalProtocolServiceCID = MockRegistrar.register(
    "@mozilla.org/uriloader/external-protocol-service;1",
    mockExternalProtocolService
  );

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
    MockRegistrar.unregister(mockExternalProtocolServiceCID);
  });
});

add_task(async function test_linkClickDoesntOpen() {
  loadedUri = false;
  const eventPromise = BrowserTestUtils.waitForEvent(button, "ctaclick");

  EventUtils.synthesizeMouseAtCenter(button, {}, browser.contentWindow);
  const event = await eventPromise;
  Assert.equal(event.button, 0, "Should get left click event");

  Assert.ok(!loadedUri, "Should prevent default of click event");
});
