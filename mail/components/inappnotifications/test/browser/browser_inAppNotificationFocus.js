/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

const InAppNotifications = ChromeUtils.importESModule(
  "resource:///modules/InAppNotifications.sys.mjs"
).InAppNotifications;

add_setup(() => {
  /** @implements {nsIExternalProtocolService} */
  const mockExternalProtocolService = {
    QueryInterface: ChromeUtils.generateQI(["nsIExternalProtocolService"]),
    externalProtocolHandlerExists() {},
    isExposedProtocol() {},
    loadURI() {},
  };

  const mockExternalProtocolServiceCID = MockRegistrar.register(
    "@mozilla.org/uriloader/external-protocol-service;1",
    mockExternalProtocolService
  );

  registerCleanupFunction(async () => {
    await InAppNotifications.updateNotifications([]);
    MockRegistrar.unregister(mockExternalProtocolServiceCID);
  });
});

add_task(async function test_maintainsFocusWhenOpened() {
  const searchBar = document.querySelector("global-search-bar");
  searchBar.focus();

  await InAppNotifications.updateNotifications([
    {
      id: "testNotification" + Date.now(),
      title: "Test notification",
      description: "Long prose text",
      URL: "https://example.com/notificationTarget",
      CTA: "Click me!",
      severity: 1,
      type: "donation",
      start_at: new Date(Date.now() - 100000).toISOString(),
      end_at: new Date(Date.now() + 9999999999).toISOString(),
      targeting: {},
    },
  ]);

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    1,
    "Notification Shown"
  );

  Assert.equal(
    searchBar,
    document.activeElement,
    "the search bar still has focus"
  );
});

add_task(async function test_maintainsFocusWhenClosed() {
  await InAppNotifications.updateNotifications([
    {
      id: "testNotification" + Date.now(),
      title: "Test notification",
      description: "Long prose text",
      URL: "https://example.com/notificationTarget",
      CTA: "Click me!",
      severity: 1,
      type: "donation",
      start_at: new Date(Date.now() - 100000).toISOString(),
      end_at: new Date(Date.now() + 9999999999).toISOString(),
      targeting: {},
    },
  ]);

  const searchBar = document.querySelector("global-search-bar");
  searchBar.focus();

  Assert.equal(
    document.querySelectorAll("in-app-notification").length,
    1,
    "Notification Shown"
  );

  EventUtils.synthesizeMouseAtCenter(
    document
      .querySelector("in-app-notification")
      .shadowRoot.querySelector("in-app-notification-container")
      .shadowRoot.querySelector('[is="in-app-notification-close-button"]'),
    {}
  );

  Assert.equal(
    searchBar,
    document.activeElement,
    "the search bar still has focus"
  );
});

add_task(async function test_doesNotStoreFocusElementInsideNotification() {
  await InAppNotifications.updateNotifications([
    {
      id: "testNotification" + Date.now(),
      title: "Test notification",
      description: "Long prose text",
      URL: "https://example.com/notificationTarget",
      CTA: "Click me!",
      severity: 1,
      type: "donation",
      start_at: new Date(Date.now() - 100000).toISOString(),
      end_at: new Date(Date.now() + 9999999999).toISOString(),
      targeting: {},
    },
  ]);

  const searchBar = document.querySelector("global-search-bar");
  searchBar.focus();

  const container = document
    .querySelector("in-app-notification")
    .shadowRoot.querySelector("in-app-notification-container").shadowRoot;

  container.querySelector(".in-app-notification-container").focus();

  EventUtils.synthesizeMouseAtCenter(
    container.querySelector('[is="in-app-notification-close-button"]'),
    {}
  );

  Assert.equal(
    searchBar,
    document.activeElement,
    "the search bar still has focus"
  );
});
