/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);
const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);
const { NotificationUpdater } = ChromeUtils.importESModule(
  "resource:///modules/NotificationUpdater.sys.mjs"
);

/**
 * This test injects a notifiation like we do "in the real world", by providing
 * it on the server. We then check the user-facing contents of the notification.
 * Everything else that happens inbetween is not relevant to this test.
 * Since we're testing three distinct types of dispatch systems (notification,
 * tab, and browser), we also have some expectations on the ordering of the
 * notifications returned by the server.
 * Sadly we do need to manually re-initialize the NotificationUpder for the new
 * test server URL data to get fetched within test-lifetimes.
 */

const TIME_DELTA = 100000;
const tabmail = document.getElementById("tabmail");
const notifications = [
  {
    id: "end-to-end-test-notification",
    start_at: new Date(Date.now() - TIME_DELTA).toISOString(),
    end_at: new Date(Date.now() + TIME_DELTA).toISOString(),
    title: "Look, it's working",
    description: "Hi Mom.",
    URL: "https://thunderbird.net/%LOCALE%/",
    CTA: "Check out my website",
    severity: 1,
    type: "donation",
    targeting: {
      percent_chance: 100.0,
      exclude: [
        {
          locales: ["example"],
          versions: ["1.0", "2.0", "3.0"],
        },
      ],
    },
  },
  {
    id: "end-to-end-test-tab",
    start_at: new Date(Date.now() - TIME_DELTA).toISOString(),
    end_at: new Date(Date.now() + TIME_DELTA).toISOString(),
    title: "",
    description: "",
    URL: "https://example.com/?lang=%LOCALE%",
    CTA: "Not shown",
    severity: 2,
    type: "donation_tab",
    targeting: {
      percent_chance: 100.0,
      exclude: [
        {
          locales: ["example"],
          versions: ["1.0", "2.0", "3.0"],
        },
      ],
    },
  },
  {
    id: "end-to-end-test-browser",
    start_at: new Date(Date.now() - TIME_DELTA).toISOString(),
    end_at: new Date(Date.now() + TIME_DELTA).toISOString(),
    title: "",
    description: "",
    URL: "https://thunderbird.net/%LOCALE%/",
    CTA: "Not shown",
    severity: 3,
    type: "donation_browser",
    targeting: {
      percent_chance: 100.0,
      exclude: [
        {
          locales: ["example"],
          versions: ["1.0", "2.0", "3.0"],
        },
      ],
    },
  },
];

/** @implements {nsIExternalProtocolService} */
const gMockExternalProtocolService = {
  QueryInterface: ChromeUtils.generateQI(["nsIExternalProtocolService"]),
  externalProtocolHandlerExists() {},
  isExposedProtocol() {},
  loadURI(uri) {
    Assert.equal(
      uri.spec,
      this.expectedURI,
      "Should only receive load request got test specific URI"
    );
    this.didOpen = true;
    this.deferred?.resolve(uri.spec);
    this.deferred = null;
  },
  expectOpen(uri) {
    if (this.deferred) {
      if (this.expectedURI !== uri) {
        return Promise.reject(new Error("Already waiting for a different URI"));
      }
      return this.deferred.promise;
    }
    this.didOpen = false;
    this.expectedURI = uri;
    this.deferred = Promise.withResolvers();
    return this.deferred.promise;
  },
};

add_setup(async () => {
  NotificationScheduler._idleService.disabled = true;
  NotificationScheduler.observe(null, "active");
  NotificationManager._PER_TIME_UNIT = 1;

  const mockExternalProtocolServiceCID = MockRegistrar.register(
    "@mozilla.org/uriloader/external-protocol-service;1",
    gMockExternalProtocolService
  );

  Services.prefs.setIntPref(
    "datareporting.policy.dataSubmissionPolicyAcceptedVersion",
    10
  );
  Services.prefs.setIntPref("datareporting.policy.currentPolicyVersion", 10);

  const server = new HttpServer();

  server.registerPathHandler("/notifications.json", (request, response) => {
    response.setStatusLine(request.httpVersion, 200, "OK");
    response.setHeader("Content-Type", "application/json");
    response.setHeader("Cache-Control", "max-age=100");
    response.write(JSON.stringify(notifications));
  });

  server.start(-1);

  const serverUrl = `http://localhost:${server.identity.primaryPort}/notifications.json?t=${Date.now()}`;
  Services.prefs.setStringPref("mail.inappnotifications.url", serverUrl);

  // We have to manually force a refresh for this test to finish within useful time.
  NotificationUpdater._clearStateForTests();
  const initResult = await NotificationUpdater.init();
  info(`NotificationUpdater re-init: ${JSON.stringify(initResult, null, 2)}`);

  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref(
      "datareporting.policy.dataSubmissionPolicyAcceptedVersion"
    );
    Services.prefs.clearUserPref("datareporting.policy.currentPolicyVersion");
    Services.prefs.setStringPref("mail.inappnotifications.url", "");
    await reset();
    await new Promise(resolve => server.stop(resolve));
    MockRegistrar.unregister(mockExternalProtocolServiceCID);
    await PlacesUtils.history.clear();
  });
});

add_task(async function test_notificationEndToEnd() {
  const manager = document.querySelector("in-app-notification-manager");
  await waitForNotification(true);

  const notificationContent =
    manager.firstElementChild.shadowRoot.firstElementChild.shadowRoot;
  const ctaButton = notificationContent.querySelector(
    'a[is="in-app-notification-button"]'
  );

  Assert.ok(
    BrowserTestUtils.isVisible(
      notificationContent.querySelector(
        `div.in-app-notification-${notifications[0].type}`
      )
    ),
    "Should display a notification with the specified type"
  );
  Assert.equal(
    notificationContent
      .querySelector(".in-app-notification-heading")
      .textContent.trim(),
    notifications[0].title,
    "Title should be populated in the notification"
  );
  Assert.equal(
    notificationContent
      .querySelector(".in-app-notification-description")
      .textContent.trim(),
    notifications[0].description,
    "The description should match the value specified by the server"
  );
  Assert.equal(
    ctaButton.textContent.trim(),
    notifications[0].CTA,
    "The call to action label should match what the server specificies"
  );

  const formattedURLNotification = Services.urlFormatter.formatURL(
    notifications[0].URL
  );
  const waitForLinkOpen = gMockExternalProtocolService.expectOpen(
    formattedURLNotification
  );

  EventUtils.synthesizeMouseAtCenter(ctaButton, {}, window);
  await waitForLinkOpen;

  info("Wait for next notification: tab");

  if (tabmail.tabs.length <= 1) {
    await BrowserTestUtils.waitForEvent(
      tabmail.tabContainer,
      "TabOpen",
      undefined,
      event => event.detail.tabInfo.mode.name === "contentTab"
    );
  }

  Assert.equal(
    tabmail.currentTabInfo.mode.name,
    "contentTab",
    "Should open a content tab"
  );

  // Add the listener for the external browser now that we have the tab.
  const formattedURLBrowser = Services.urlFormatter.formatURL(
    notifications[2].URL
  );
  const mockOpen = gMockExternalProtocolService.expectOpen(formattedURLBrowser);

  const formattedURLTab = Services.urlFormatter.formatURL(notifications[1].URL);
  const tabBrowser = tabmail.getBrowserForSelectedTab();
  await BrowserTestUtils.browserLoaded(
    tabBrowser,
    false,
    url => url == formattedURLTab
  );
  Assert.equal(
    tabBrowser.currentURI.spec,
    formattedURLTab,
    "Should load expected URL"
  );

  const tab = tabmail.selectedTab;
  tabmail.closeTab(tab);

  info("Wait for next notification: browser");

  // The mock service asserts that we open the expected URL.
  await mockOpen;

  await waitForNotification(false);
});
