/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let browser, notification, tab;
const observedProperties = {
  CTA: "cta",
  id: "data-id",
  description: "description",
  title: "heading",
  type: "type",
  URL: "url",
};
const { startAxeMutationObserver } = ChromeUtils.importESModule(
  "resource://testing-common/mail/AxeHelpers.sys.mjs"
);

add_setup(async function () {
  tab = tabmail.openTab("contentTab", {
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

  await startAxeMutationObserver(tab.browser, {
    message: "Page stayed axe-clean while the test mutated the DOM",
    specialPowers: SpecialPowers,
  });

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

add_task(function test_importedTemplates() {
  const doc = browser.contentWindow.document;

  Assert.ok(notification, "The fixture should contain a notification");
  Assert.ok(
    notification.shadowRoot,
    "The notification should have a shadow root"
  );

  const container = notification.shadowRoot.querySelector(
    "in-app-notification-container"
  );

  Assert.equal(
    doc.querySelectorAll("template").length,
    0,
    "The notification should load without templates in the host document"
  );
  Assert.ok(container, "The notification should contain a container");
  Assert.ok(
    container instanceof
      browser.contentWindow.customElements.get("in-app-notification-container"),
    "The imported container should use its custom element definition"
  );

  const closeButton = container.shadowRoot.querySelector(
    '[is="in-app-notification-close-button"]'
  );
  const actionButton = container.shadowRoot.querySelector(
    '[is="in-app-notification-button"]'
  );

  Assert.ok(closeButton, "The container should contain a close button");
  Assert.ok(actionButton, "The container should contain an action link");
  Assert.ok(
    closeButton instanceof
      browser.contentWindow.customElements.get(
        "in-app-notification-close-button"
      ),
    "The imported close button should use its custom element definition"
  );
  Assert.ok(
    actionButton instanceof
      browser.contentWindow.customElements.get("in-app-notification-button"),
    "The imported action link should use its custom element definition"
  );
  Assert.ok(
    closeButton.querySelector("img"),
    "The close button should load its own template"
  );
});

add_task(function test_dataBeforeConnection() {
  const doc = browser.contentWindow.document;
  const second = doc.createElement("in-app-notification");

  registerCleanupFunction(() => second.remove());
  second.setNotificationData(getData("Second notification"));
  doc.body.append(second);

  Assert.ok(
    second.shadowRoot,
    "The second notification should have a shadow root"
  );

  const firstContainer = notification.shadowRoot.querySelector(
    "in-app-notification-container"
  );
  const secondContainer = second.shadowRoot.querySelector(
    "in-app-notification-container"
  );

  Assert.ok(
    secondContainer,
    "The second notification should contain a container"
  );
  Assert.notEqual(
    firstContainer,
    secondContainer,
    "Each notification should receive its own template contents"
  );
  Assert.ok(
    secondContainer.shadowRoot.querySelector(
      '[is="in-app-notification-close-button"] img'
    ),
    "The second notification should copy the nested close button contents"
  );
  Assert.equal(
    secondContainer.shadowRoot.querySelector(".in-app-notification-heading")
      .textContent,
    "Second notification",
    "The second notification should display its own heading"
  );
  Assert.equal(
    secondContainer.getAttribute("heading"),
    "Second notification",
    "The notification should apply data set before connection"
  );
  Assert.equal(
    firstContainer.getAttribute("heading"),
    null,
    "Setting another notification's data should leave the first notification unchanged"
  );

  second.remove();
});

add_task(async function test_notificationAttributeTranslation() {
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
