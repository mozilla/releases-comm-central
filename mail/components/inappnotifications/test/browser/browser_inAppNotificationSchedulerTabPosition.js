/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals showNotification, resetWindow, waitForNotification, waitForMinimize,
 * NotificationScheduler, moveWindowTo, openNewWindow, waitASecond
 */

"use strict";

add_setup(async function () {
  NotificationManager._PER_TIME_UNIT = 1;
  NotificationScheduler.observe(null, "active");
  NotificationScheduler._resolveStartupDelay();
  await NotificationScheduler._startupDelayPromise;
  await TestUtils.waitForTick();
  NotificationScheduler._idleService.disabled = true;

  registerCleanupFunction(async () => {
    NotificationScheduler._idleService.disabled = false;
    await resetWindow();
  });
});

const tabmail = document.getElementById("tabmail");

add_task(async function test_showWhenOffFullyScreenXLinux() {
  const tabPromise = BrowserTestUtils.waitForEvent(
    document.getElementById("tabmail").tabContainer,
    "TabOpen"
  );

  await moveWindowTo(-(window.screen.width * 2), 0);

  showNotification({ type: "donation_tab" });

  await waitASecond();

  await tabPromise;

  Assert.equal(
    tabmail.currentTabInfo.urlbar.value,
    "https://example.com/notificationTarget",
    "tab was opened with correct url"
  );

  tabmail.closeOtherTabs(0);

  await resetWindow();
}).skip(AppConstants.platform !== "linux");

add_task(async function test_dontShowWhenOffFullyScreenX() {
  await moveWindowTo(-(window.screen.width * 2), 0);

  showNotification({ type: "donation_tab" });

  await waitASecond();

  Assert.equal(tabmail.tabs.length, 1, "tab was not opened when offscreen");

  await moveWindowTo(0, 0);

  const tabPromise = BrowserTestUtils.waitForEvent(
    document.getElementById("tabmail").tabContainer,
    "TabOpen"
  );

  await waitASecond();

  await tabPromise;

  Assert.equal(
    tabmail.currentTabInfo.urlbar.value,
    "https://example.com/notificationTarget",
    "tab was opened with correct url"
  );

  await resetWindow();
  tabmail.closeOtherTabs(0);
}).skip(AppConstants.platform === "linux");

add_task(async function test_showWhenOffScreen150XLinux() {
  const tabPromise = BrowserTestUtils.waitForEvent(
    document.getElementById("tabmail").tabContainer,
    "TabOpen"
  );

  await moveWindowTo(-150, 0);

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

add_task(async function test_dontShowWhenOffScreen150X() {
  await moveWindowTo(-150, 0);

  await showNotification({ type: "donation_tab" });

  await waitASecond();

  Assert.equal(tabmail.tabs.length, 1, "tab was not opened when offscreen");

  await moveWindowTo(0, 0);

  const tabPromise = BrowserTestUtils.waitForEvent(
    document.getElementById("tabmail").tabContainer,
    "TabOpen"
  );

  await waitASecond();

  await tabPromise;

  Assert.equal(
    tabmail.currentTabInfo.urlbar.value,
    "https://example.com/notificationTarget",
    "tab was opened with correct url"
  );

  await resetWindow();

  tabmail.closeOtherTabs(0);
}).skip(AppConstants.platform === "linux");

add_task(async function test_showWhenOffScreen100X() {
  await moveWindowTo(-100, 0);

  const tabPromise = BrowserTestUtils.waitForEvent(
    document.getElementById("tabmail").tabContainer,
    "TabOpen"
  );

  await showNotification({ type: "donation_tab" });

  await waitASecond();

  await tabPromise;

  Assert.equal(tabmail.tabs.length, 2, "tab was opened");

  Assert.equal(
    tabmail.currentTabInfo.urlbar.value,
    "https://example.com/notificationTarget",
    "tab was opened with correct url"
  );

  await resetWindow();
  tabmail.closeOtherTabs(0);
});

add_task(async function test_showWhenOffFullyScreenYLinux() {
  const tabPromise = BrowserTestUtils.waitForEvent(
    document.getElementById("tabmail").tabContainer,
    "TabOpen"
  );

  await moveWindowTo(0, window.screen.height * 3);

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

add_task(async function test_dontShowWhenOffFullyScreenY() {
  await moveWindowTo(0, window.screen.height * 3);

  await showNotification({ type: "donation_tab" });

  await waitASecond();

  Assert.equal(tabmail.tabs.length, 1, "tab was not opened when offscreen");

  await moveWindowTo(0, 0);

  const tabPromise = BrowserTestUtils.waitForEvent(
    document.getElementById("tabmail").tabContainer,
    "TabOpen"
  );

  await waitASecond();

  await tabPromise;

  Assert.equal(
    tabmail.currentTabInfo.urlbar.value,
    "https://example.com/notificationTarget",
    "tab was opened with correct url"
  );

  await resetWindow();
  tabmail.closeOtherTabs(0);
}).skip(AppConstants.platform === "linux");

add_task(async function test_showWhenOffScreen150YLinux() {
  const tabPromise = BrowserTestUtils.waitForEvent(
    document.getElementById("tabmail").tabContainer,
    "TabOpen"
  );

  await moveWindowTo(0, window.screen.availHeight - window.outerHeight + 150);

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

add_task(async function test_dontShowWhenOffScreen150Y() {
  await moveWindowTo(
    0,
    window.screen.availHeight -
      window.outerHeight +
      150 +
      window.screen.availTop
  );

  await showNotification({ type: "donation_tab" });

  await waitASecond();

  Assert.equal(tabmail.tabs.length, 1, "tab was not opened when offscreen");

  await moveWindowTo(window.screen.availLeft, window.top.availTop);

  const tabPromise = BrowserTestUtils.waitForEvent(
    document.getElementById("tabmail").tabContainer,
    "TabOpen"
  );

  await waitASecond();

  await tabPromise;

  Assert.equal(
    tabmail.currentTabInfo.urlbar.value,
    "https://example.com/notificationTarget",
    "tab was opened with correct url"
  );

  await resetWindow();
  tabmail.closeOtherTabs(0);
}).skip(AppConstants.platform === "linux");

add_task(async function test_showWhenOffScreen100Y() {
  await moveWindowTo(0, window.screen.availHeight - window.outerHeight + 100);

  const tabPromise = BrowserTestUtils.waitForEvent(
    document.getElementById("tabmail").tabContainer,
    "TabOpen"
  );

  await showNotification({ type: "donation_tab" });

  await waitASecond();

  await tabPromise;

  Assert.equal(
    tabmail.currentTabInfo.urlbar.value,
    "https://example.com/notificationTarget",
    "tab was opened with correct url"
  );

  await resetWindow();
  tabmail.closeOtherTabs(0);
});
