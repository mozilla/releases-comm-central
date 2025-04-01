/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { NotificationOpener } = ChromeUtils.importESModule(
  "resource:///modules/NotificationOpener.sys.mjs"
);
const { NotificationScheduler } = ChromeUtils.importESModule(
  "resource:///modules/NotificationScheduler.sys.mjs"
);
const { BrowserTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/BrowserTestUtils.sys.mjs"
);
const { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);
const { clearTimeout, setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
const { PlacesUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/PlacesUtils.sys.mjs"
);

const expectedURI = "about:blank";
let didOpen = false;

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
  /** @implements {nsIExternalProtocolService} */
  const mockExternalProtocolService = {
    QueryInterface: ChromeUtils.generateQI(["nsIExternalProtocolService"]),
    externalProtocolHandlerExists() {},
    isExposedProtocol() {},
    loadURI(uri) {
      didOpen = true;
      Assert.equal(
        uri.spec,
        expectedURI,
        "Should only receive load request for expected URI"
      );
    },
  };

  const mockExternalProtocolServiceCID = MockRegistrar.register(
    "@mozilla.org/uriloader/external-protocol-service;1",
    mockExternalProtocolService
  );
  registerCleanupFunction(async () => {
    await PlacesUtils.history.clear();
    MockRegistrar.unregister(mockExternalProtocolServiceCID);
  });
});

add_task(async function test_opensBrowserWaitFalse() {
  await NotificationOpener.openLink(getMockNotification(), false);

  Assert.ok(didOpen, "Link was opened in browser");

  didOpen = false;
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

  Assert.ok(!didOpen, "Link was not opened");
  Assert.ok(called, "Waiting for active user");

  resolve();

  await TestUtils.waitForTick();

  Assert.ok(didOpen, "Link was opened");

  NotificationScheduler.waitForActive = waitForActive;
  didOpen = false;
});

add_task(async function test_opensDonationWaitFalse() {
  await NotificationOpener.openLink(getMockNotification("donation"), false);

  Assert.ok(didOpen, "Link was opened in browser");

  didOpen = false;
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

  Assert.ok(!didOpen, "Link was not opened");
  Assert.ok(called, "promise is awaited");

  resolve();

  await TestUtils.waitForTick();

  Assert.ok(didOpen, "Link was opened");

  NotificationScheduler.waitForActive = waitForActive;
  didOpen = false;
});

add_task(async function test_opensBlogWaitFalse() {
  await NotificationOpener.openLink(getMockNotification("blog"), false);

  Assert.ok(didOpen, "Link was opened in browser");

  didOpen = false;
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

  Assert.ok(!didOpen, "Link was not opened");
  Assert.ok(called, "promise is awaited");

  resolve();

  await TestUtils.waitForTick();

  Assert.ok(didOpen, "Link was opened");

  NotificationScheduler.waitForActive = waitForActive;
});

add_task(async function test_opensMessageWaitFalse() {
  await NotificationOpener.openLink(getMockNotification("message"), false);

  Assert.ok(didOpen, "Link was opened in browser");

  didOpen = false;
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

  Assert.ok(!didOpen, "Link was not opened");
  Assert.ok(called, "promise is awaited");

  resolve();

  await TestUtils.waitForTick();

  Assert.ok(didOpen, "Link was opened");

  NotificationScheduler.waitForActive = waitForActive;
  didOpen = false;
});

add_task(async function test_opensTabWaitFalse() {
  await NotificationOpener.openLink(getMockNotification("donation_tab"), false);

  Assert.ok(didOpen, "Link was opened in browser");

  didOpen = false;
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

  Assert.ok(!didOpen, "Link was not opened");
  Assert.ok(called, "promise is awaited");

  resolve();

  await TestUtils.waitForTick();

  Assert.ok(didOpen, "Link was opened");

  NotificationScheduler.waitForActive = waitForActive;

  didOpen = false;
});
