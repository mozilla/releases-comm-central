/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let browser, container;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/inappnotifications/test/browser/files/inAppNotificationContainer.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser, undefined, url =>
    url.endsWith("inAppNotificationContainer.xhtml")
  );
  tab.browser.focus();
  browser = tab.browser;
  container = browser.contentWindow.document.querySelector(
    `in-app-notification-container`
  );

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

function subtestTextValue(property) {
  const element = container.shadowRoot.querySelector(
    `.in-app-notification-${property}`
  );

  Assert.equal(element.textContent, "", `${property} has no value`);

  container.setAttribute(property, "test text");

  Assert.equal(
    element.textContent,
    "test text",
    `${property} has correct value`
  );

  container.setAttribute(property, "new text");

  Assert.equal(
    element.textContent,
    "new text",
    `${property} updates correctly`
  );

  container.removeAttribute(property);

  Assert.equal(element.textContent, "", `${property} is correctly removed`);
}

add_task(function test_ctaValue() {
  subtestTextValue("cta");
});

add_task(function test_descriptionValue() {
  subtestTextValue("description");
});

add_task(function test_headingValue() {
  subtestTextValue("heading");
});

add_task(async function test_urlValue() {
  const element = container.shadowRoot.querySelector("a");

  Assert.equal(element.href, "", "url is null");

  container.setAttribute("url", "https://example.com/");

  Assert.equal(element.href, "https://example.com/", "url is set");

  container.setAttribute("url", "https://example.com/index.html");

  Assert.equal(
    element.href,
    "https://example.com/index.html",
    "url is updated"
  );

  container.removeAttribute("url");

  Assert.equal(element.href, "", "url is cleared");
});
