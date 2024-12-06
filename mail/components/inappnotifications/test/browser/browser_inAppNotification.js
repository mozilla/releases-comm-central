/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let browser, notification;
const observedProperties = {
  CTA: "cta",
  id: "data-id",
  description: "description",
  title: "heading",
  type: "type",
  URL: "url",
};

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/inappnotifications/test/browser/files/inAppNotification.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser, undefined, url =>
    url.endsWith("inAppNotification.xhtml")
  );
  tab.browser.focus();
  browser = tab.browser;
  notification = browser.contentWindow.document.querySelector(
    "in-app-notification"
  );

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

function subtestCheckAttributes(container, data) {
  for (const [key, value] in observedProperties) {
    Assert.equal(
      container.getAttribute(value),
      data[key],
      `${key} is properly translated to ${value} attribute`
    );
  }
}

function getData(value, type = "donation") {
  return {
    id: "test-notification",
    title: value,
    description: value,
    CTA: value,
    URL: value,
    type,
    severity: 4,
  };
}

add_task(function test_notificationAttributeTranslation() {
  const container = notification.shadowRoot.querySelector(
    "in-app-notification-container"
  );
  let notificationData = getData(null);

  subtestCheckAttributes(container, notificationData);

  notificationData = getData("test");

  notification.setNotificationData(notificationData);
  subtestCheckAttributes(container, notificationData);

  notificationData = getData("new test", "message");

  notification.setNotificationData(notificationData);
  subtestCheckAttributes(container, notificationData);
});

add_task(function test_notificationPositionNull() {
  const data = getData("test");

  notification.setNotificationData({
    ...data,
    position: null,
  });

  Assert.ok(
    notification.classList.contains("bottom-spaces-toolbar"),
    "has correct position class"
  );
});

add_task(function test_notificationPositionMissing() {
  const data = getData("test");

  notification.setNotificationData({
    ...data,
  });

  Assert.ok(
    notification.classList.contains("bottom-spaces-toolbar"),
    "has correct position class"
  );
});

add_task(function test_notificationPositionInvalid() {
  const data = getData("test");

  notification.setNotificationData({
    ...data,
    position: "foo",
  });

  Assert.ok(
    notification.classList.contains("bottom-spaces-toolbar"),
    "has correct position class"
  );
});

add_task(function test_notificationPositionToday() {
  const data = getData("test");

  notification.setNotificationData({
    ...data,
    position: "bottom-today-pane",
  });

  Assert.ok(
    notification.classList.contains("bottom-today-pane"),
    "has correct position class"
  );
});

add_task(function test_notificationPositionSpacesToolbar() {
  const data = getData("test");

  notification.setNotificationData({
    ...data,
    position: "bottom-spaces-toolbar",
  });

  Assert.ok(
    notification.classList.contains("bottom-spaces-toolbar"),
    "has correct position class"
  );
});
