/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let header;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/accountcreation/test/browser/files/accountHubHeader.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  header =
    tab.browser.contentWindow.document.querySelector("account-hub-header");

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(async function test_showsTitleAndSubheader() {
  const title = header.shadowRoot.querySelector("#accountHubHeaderTitle");
  const subheader = header.shadowRoot.querySelector(
    "#accountHubHeaderSubheader"
  );

  const titleSlot = title.querySelector("slot[name='title']");
  const assignedToTitleSlot = titleSlot.assignedElements()[0];

  const subHeaderSlot = subheader.querySelector('slot[name="subheader"]');
  const assignedToSubHeaderSlot = subHeaderSlot.assignedElements()[0];

  Assert.strictEqual(
    assignedToTitleSlot.tagName,
    "span",
    "Title slot should have a <span> assigned to it"
  );
  Assert.strictEqual(
    assignedToTitleSlot.id,
    "title",
    'Title slot should have an element with id="title" assigned to it'
  );
  Assert.strictEqual(
    assignedToSubHeaderSlot.tagName,
    "span",
    "Subheader slot should have a <span> assigned to it"
  );
  Assert.strictEqual(
    assignedToSubHeaderSlot.id,
    "subheader",
    'Subheader slot should have an element with id="subheader" assigned to it'
  );

  Assert.equal(
    assignedToTitleSlot.textContent,
    "Test Title",
    "Title should be set correctly"
  );
  Assert.equal(
    assignedToSubHeaderSlot.textContent,
    "Test Subheader",
    "Subheader should be set correctly"
  );
});

add_task(async function test_subheader_hidden_by_default() {
  const subheader = header.shadowRoot.querySelector(
    "#accountHubHeaderSubheader"
  );

  Assert.ok(
    BrowserTestUtils.isHidden(subheader),
    "Subheader should be hidden by default"
  );

  header.showSubheader();
  Assert.ok(
    BrowserTestUtils.isVisible(subheader),
    "Subheader should be shown when showSubheader is called"
  );
});

add_task(async function test_subheader_showNotification_fluent_title() {
  header.showNotification({
    fluentTitleId: "fake-title-for-test",
    fluentTitleArguments: { foo: "bar" },
    type: "info",
  });

  const notification = header.shadowRoot.querySelector(
    "#emailFormNotification"
  );

  Assert.ok(
    BrowserTestUtils.isVisible(notification),
    "Should show notification"
  );

  const localizedTitle = notification.querySelector(".localized-title");
  const rawTitle = notification.querySelector(".raw-title");

  Assert.equal(rawTitle.textContent, "", "Should not have a raw title");

  const l10nState = document.l10n.getAttributes(localizedTitle);

  Assert.deepEqual(
    l10nState,
    {
      id: "fake-title-for-test",
      args: { foo: "bar" },
    },
    "Should apply expected l10n attributes to title"
  );

  header.clearNotifications();

  Assert.ok(
    BrowserTestUtils.isHidden(notification),
    "Notification should be hidden"
  );

  const hiddenL10nState = document.l10n.getAttributes(localizedTitle);

  Assert.deepEqual(
    hiddenL10nState,
    {
      id: null,
      args: null,
    },
    "Clear should reset the l10n state of the title"
  );
});

add_task(async function test_showNotification_error_without_cause() {
  const notification = header.shadowRoot.querySelector(
    "#emailFormNotification"
  );

  Assert.ok(
    BrowserTestUtils.isHidden(notification),
    "Notification should be hidden before showing an error"
  );

  const errorMessage = "EWS initialization failed (test)";
  const error = new Error(errorMessage);
  // Don't set error.cause here. Test to ensure the header code handles that
  // gracefully and doesn't try to access error.cause.fluentDescriptionId
  // without a null-check.

  header.showNotification({
    error,
    type: "error",
  });

  Assert.ok(
    BrowserTestUtils.isVisible(notification),
    "Notification should be visible when showing an error without a cause"
  );

  const localizedTitle = notification.querySelector(".localized-title");
  const rawTitle = notification.querySelector(".raw-title");

  // With only an Error message and no fluentTitleId/fluentDescriptionId,
  // the logic should use the title and not set l10n attributes.
  Assert.equal(
    rawTitle.textContent,
    errorMessage,
    "Raw title should be taken from error.message when there is no cause"
  );

  const l10nState = document.l10n.getAttributes(localizedTitle);
  Assert.deepEqual(
    l10nState,
    { id: null, args: null },
    "Localized title should not be used when we only have error.message"
  );

  header.clearNotifications();
  Assert.ok(
    BrowserTestUtils.isHidden(notification),
    "Notification should be hidden again after clearNotifications()"
  );
});
