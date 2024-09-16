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

function getData(value) {
  return {
    id: "test-notification",
    title: value,
    description: value,
    CTA: value,
    URL: value,
    type: "donation",
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

  notificationData = getData("new test");

  notification.setNotificationData(notificationData);
  subtestCheckAttributes(container, notificationData);
});
