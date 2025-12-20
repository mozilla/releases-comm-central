/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { BrowserTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/BrowserTestUtils.sys.mjs"
);
const { MockExternalProtocolService } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockExternalProtocolService.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

const { NotificationOpener } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/inappnotifications/modules/NotificationOpener.sys.mjs"
);
const { NotificationScheduler } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/inappnotifications/modules/NotificationScheduler.sys.mjs"
);
const { clearTimeout, setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);
const { PlacesUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/PlacesUtils.sys.mjs"
);

const expectedURI = "about:blank";

const SAFETY_MARGIN_MS = 100000;

function getMockNotification(type = "donation_browser") {
  const now = Date.now();
  const startDate = new Date(now - SAFETY_MARGIN_MS).toISOString();
  const endDate = new Date(now + SAFETY_MARGIN_MS).toISOString();

  return {
    id: now,
    title: "dolor sit amet",
    start_at: startDate,
    end_at: endDate,
    severity: 1,
    URL: "about:blank",
    targeting: {},
    type,
  };
}

add_setup(async function () {
  // PlacesUtils when executing the CTA needs the profile.
  do_get_profile();

  MockExternalProtocolService.init();

  registerCleanupFunction(async () => {
    await PlacesUtils.history.clear();
    MockExternalProtocolService.cleanup();
  });
});

add_task(async function test_opensBrowserWaitFalse() {
  await NotificationOpener.openLink(getMockNotification(), false);

  Assert.equal(
    MockExternalProtocolService.urls.length,
    1,
    "Link was opened in browser"
  );

  MockExternalProtocolService.reset();
});

add_task(async function test_opensBrowserWaitTrue() {
  const { promise, resolve } = Promise.withResolvers();
  const waitForActive = NotificationScheduler.waitForActive;
  let called = false;

  NotificationScheduler.waitForActive = async () => {
    called = true;
    await promise;
  };

  NotificationOpener.openLink(getMockNotification(), true);

  Assert.equal(
    MockExternalProtocolService.urls.length,
    0,
    "Link was not opened"
  );
  Assert.ok(called, "Waiting for active user");

  resolve();

  await TestUtils.waitForTick();

  Assert.equal(MockExternalProtocolService.urls.length, 1, "Link was opened");

  NotificationScheduler.waitForActive = waitForActive;
  MockExternalProtocolService.reset();
});

add_task(async function test_opensDonationWaitFalse() {
  await NotificationOpener.openLink(getMockNotification("donation"), false);

  Assert.equal(
    MockExternalProtocolService.urls.length,
    1,
    "Link was opened in browser"
  );

  MockExternalProtocolService.reset();
});

add_task(async function test_opensDonationWaitTrue() {
  const { promise, resolve } = Promise.withResolvers();
  const waitForActive = NotificationScheduler.waitForActive;
  let called = false;

  NotificationScheduler.waitForActive = async () => {
    called = true;
    await promise;
  };

  NotificationOpener.openLink(getMockNotification("donation"), true);

  Assert.equal(
    MockExternalProtocolService.urls.length,
    0,
    "Link was not opened"
  );
  Assert.ok(called, "promise is awaited");

  resolve();

  await TestUtils.waitForTick();

  Assert.equal(MockExternalProtocolService.urls.length, 1, "Link was opened");

  NotificationScheduler.waitForActive = waitForActive;
  MockExternalProtocolService.reset();
});

add_task(async function test_opensBlogWaitFalse() {
  await NotificationOpener.openLink(getMockNotification("blog"), false);

  Assert.equal(
    MockExternalProtocolService.urls.length,
    1,
    "Link was opened in browser"
  );

  MockExternalProtocolService.reset();
});

add_task(async function test_opensBlogWaitTrue() {
  const { promise, resolve } = Promise.withResolvers();
  const waitForActive = NotificationScheduler.waitForActive;
  let called = false;

  NotificationScheduler.waitForActive = async () => {
    called = true;
    await promise;
  };

  NotificationOpener.openLink(getMockNotification("blog"), true);

  Assert.equal(
    MockExternalProtocolService.urls.length,
    0,
    "Link was not opened"
  );
  Assert.ok(called, "promise is awaited");

  resolve();

  await TestUtils.waitForTick();

  Assert.equal(MockExternalProtocolService.urls.length, 1, "Link was opened");
  MockExternalProtocolService.reset();

  NotificationScheduler.waitForActive = waitForActive;
});

add_task(async function test_opensMessageWaitFalse() {
  await NotificationOpener.openLink(getMockNotification("message"), false);

  Assert.equal(
    MockExternalProtocolService.urls.length,
    1,
    "Link was opened in browser"
  );

  MockExternalProtocolService.reset();
});

add_task(async function test_opensMessageWaitTrue() {
  const { promise, resolve } = Promise.withResolvers();
  const waitForActive = NotificationScheduler.waitForActive;
  let called = false;

  NotificationScheduler.waitForActive = async () => {
    called = true;
    await promise;
  };

  NotificationOpener.openLink(getMockNotification("message"), true);

  Assert.equal(
    MockExternalProtocolService.urls.length,
    0,
    "Link was not opened"
  );
  Assert.ok(called, "promise is awaited");

  resolve();

  await TestUtils.waitForTick();

  Assert.equal(MockExternalProtocolService.urls.length, 1, "Link was opened");

  NotificationScheduler.waitForActive = waitForActive;
  MockExternalProtocolService.reset();
});

add_task(async function test_opensTabWaitFalse() {
  await NotificationOpener.openLink(getMockNotification("donation_tab"), false);

  Assert.equal(
    MockExternalProtocolService.urls.length,
    1,
    "Link was opened in browser"
  );

  MockExternalProtocolService.reset();
});

add_task(async function test_opensTabWaitTrue() {
  const { promise, resolve } = Promise.withResolvers();
  const waitForActive = NotificationScheduler.waitForActive;
  let called = false;

  NotificationScheduler.waitForActive = async () => {
    called = true;
    await promise;
  };

  NotificationOpener.openLink(getMockNotification("donation_tab"), true);

  Assert.equal(
    MockExternalProtocolService.urls.length,
    0,
    "Link was not opened"
  );
  Assert.ok(called, "promise is awaited");

  resolve();

  await TestUtils.waitForTick();

  Assert.equal(MockExternalProtocolService.urls.length, 1, "Link was opened");

  NotificationScheduler.waitForActive = waitForActive;

  MockExternalProtocolService.reset();
});

add_task(async function test_doesNotOpenWhenRejected() {
  const { promise, reject } = Promise.withResolvers();
  const waitForActive = NotificationScheduler.waitForActive;
  let called = false;

  NotificationScheduler.waitForActive = async () => {
    called = true;
    await promise;
  };

  NotificationOpener.openLink(getMockNotification("donation_tab"), true);

  Assert.equal(
    MockExternalProtocolService.urls.length,
    0,
    "Link was not opened"
  );
  Assert.ok(called, "promise is awaited");

  reject();

  await TestUtils.waitForTick();

  // Wait one second to ensure the notifiation is not shown
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));

  Assert.equal(
    MockExternalProtocolService.urls.length,
    0,
    "Link was not opened"
  );

  NotificationScheduler.waitForActive = waitForActive;

  MockExternalProtocolService.reset();
});
