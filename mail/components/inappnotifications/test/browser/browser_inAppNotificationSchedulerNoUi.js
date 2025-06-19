/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals reset, waitForNotification, waitForMinimize, waitASecond,
 * NotificationScheduler, InAppNotifications, moveWindowTo, openNewWindow,
 * showNotification, resetWindow
 */

"use strict";

const { MockExternalProtocolService } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockExternalProtocolService.sys.mjs"
);

const expectedURI = "https://example.com/notificationTarget";

add_setup(async function () {
  NotificationScheduler._idleService.disabled = true;
  NotificationManager._PER_TIME_UNIT = 1;
  NotificationScheduler.observe(null, "active");
  // PlacesUtils when executing the CTA needs the profile.

  MockExternalProtocolService.init();

  registerCleanupFunction(async () => {
    NotificationScheduler._idleService.disabled = false;
    await reset();
    MockExternalProtocolService.cleanup();
    await PlacesUtils.history.clear();
  });
});

const tabmail = document.getElementById("tabmail");

add_task(async function test_tab() {
  Assert.strictEqual(
    Services.wm.getMostRecentWindow("mail:3pane"),
    window,
    "Test window should be most recent window"
  );

  const tabPromise = BrowserTestUtils.waitForEvent(
    tabmail.tabContainer,
    "TabOpen"
  );

  await showNotification({ type: "donation_tab" });

  const {
    detail: { tabInfo },
  } = await tabPromise;

  await BrowserTestUtils.browserLoaded(
    tabInfo.browser,
    false,
    "https://example.com/notificationTarget"
  );

  Assert.equal(
    tabInfo.browser.currentURI.spec,
    "https://example.com/notificationTarget",
    "loaded url in new tab"
  );

  await InAppNotifications.updateNotifications([]);
  tabmail.closeOtherTabs(0);
  await reset();
});

add_task(async function test_showWhenResizedToFitTabLinux() {
  await moveWindowTo(0, 0);
  const tabPromise = BrowserTestUtils.waitForEvent(
    document.getElementById("tabmail").tabContainer,
    "TabOpen"
  );

  await moveWindowTo(window.screen.width - window.outerWidth + 150, 0);

  await showNotification({ type: "donation_tab" });

  await tabPromise;

  Assert.equal(
    tabmail.currentTabInfo.urlbar.value,
    "https://example.com/notificationTarget",
    "tab was opened with correct url"
  );

  tabmail.closeOtherTabs(0);

  await resetWindow();
}).skip(AppConstants.platform !== "linux");

add_task(async function test_showWhenResizedToFitTab() {
  await moveWindowTo(0, 0);
  const tabPromise = BrowserTestUtils.waitForEvent(
    document.getElementById("tabmail").tabContainer,
    "TabOpen"
  );

  await moveWindowTo(window.screen.width - window.outerWidth + 150, 0);

  await showNotification({ type: "donation_tab" });

  await waitASecond();

  Assert.equal(tabmail.tabs.length, 1, "tab was not opened when offscreen");

  window.resizeBy(-150, 0);

  await tabPromise;

  Assert.equal(
    tabmail.currentTabInfo.urlbar.value,
    "https://example.com/notificationTarget",
    "tab was opened with correct url"
  );

  await resetWindow();

  tabmail.closeOtherTabs(0);
}).skip(AppConstants.platform === "linux");

add_task(async function test_dontShowUntilUserActiveFromIdleTab() {
  const tabPromise = BrowserTestUtils.waitForEvent(
    document.getElementById("tabmail").tabContainer,
    "TabOpen"
  );

  NotificationScheduler.observe(null, "idle");

  await showNotification({ type: "donation_tab" });

  Assert.equal(tabmail.tabs.length, 1, "tab was not opened when offscreen");

  NotificationScheduler.observe(null, "active");

  await tabPromise;

  Assert.equal(
    tabmail.currentTabInfo.urlbar.value,
    "https://example.com/notificationTarget",
    "tab was opened with correct url"
  );

  await reset();

  tabmail.closeOtherTabs(0);
});

add_task(async function test_dontShowUntilUserActiveFromIdleDailyTab() {
  const tabPromise = BrowserTestUtils.waitForEvent(
    document.getElementById("tabmail").tabContainer,
    "TabOpen"
  );

  NotificationScheduler.observe(null, "idle-daily");

  await showNotification({ type: "donation_tab" });

  Assert.equal(tabmail.tabs.length, 1, "tab was not opened when offscreen");

  NotificationScheduler.observe(null, "active");

  await tabPromise;

  Assert.equal(
    tabmail.currentTabInfo.urlbar.value,
    "https://example.com/notificationTarget",
    "tab was opened with correct url"
  );

  await reset();

  tabmail.closeOtherTabs(0);
});

add_task(async function test_browser() {
  const promise = MockExternalProtocolService.promiseLoad();
  await showNotification({ type: "donation_browser" });

  await promise;

  await reset();
});

add_task(async function test_showWhenResizedToFitBrowserLinux() {
  const promise = MockExternalProtocolService.promiseLoad();
  await moveWindowTo(0, 0);

  await moveWindowTo(window.screen.width - window.outerWidth + 150, 0);

  await showNotification({ type: "donation_browser" });

  await promise;

  await resetWindow();
}).skip(AppConstants.platform !== "linux");

add_task(async function test_showWhenResizedToFitBrowser() {
  const promise = MockExternalProtocolService.promiseLoad();
  await moveWindowTo(0, 0);

  await moveWindowTo(window.screen.width - window.outerWidth + 150, 0);

  await showNotification({ type: "donation_browser" });

  await waitASecond();

  Assert.equal(
    MockExternalProtocolService.urls.length,
    0,
    "browser was not opened"
  );

  window.resizeBy(-150, 0);

  await promise;

  await resetWindow();
}).skip(AppConstants.platform === "linux");

add_task(async function test_dontShowUntilUserActiveFromIdleBrowser() {
  const promise = MockExternalProtocolService.promiseLoad();
  NotificationScheduler.observe(null, "idle");

  await showNotification({ type: "donation_browser" });

  await waitASecond();

  Assert.equal(
    MockExternalProtocolService.urls.length,
    0,
    "browser was not opened"
  );

  NotificationScheduler.observe(null, "active");

  await promise;

  await reset();
});

add_task(async function test_dontShowUntilUserActiveFromIdleDailyBrowser() {
  const promise = MockExternalProtocolService.promiseLoad();
  NotificationScheduler.observe(null, "idle-daily");

  await showNotification({ type: "donation_browser" });

  await waitASecond();

  Assert.equal(
    MockExternalProtocolService.urls.length,
    0,
    "browser was not opened"
  );

  NotificationScheduler.observe(null, "active");

  await promise;

  await reset();
});
