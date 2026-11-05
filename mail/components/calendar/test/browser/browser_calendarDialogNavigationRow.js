/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let navigationRow;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarDialogNavigationRow.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  navigationRow = tab.browser.contentWindow.document.querySelector(
    "calendar-dialog-navigation-row"
  );

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(async function test_openSubviewEventBubbles() {
  const actionButton = navigationRow.shadowRoot.querySelector("button");

  Assert.ok(actionButton, "Navigation row should provide an action button");
  Assert.equal(
    navigationRow.getAttribute("subview-id"),
    "testSubview",
    "The navigation row should identify its subview"
  );

  const opened = BrowserTestUtils.waitForEvent(
    navigationRow.ownerDocument,
    "calendar-dialog-open-subview"
  );
  actionButton.click();
  const event = await opened;

  Assert.strictEqual(
    event.target,
    navigationRow,
    "The row should be the source of the subview-open request"
  );
  Assert.ok(event.bubbles, "The subview-open request should bubble");
  Assert.ok(
    event.composed,
    "The subview-open request should cross the row shadow boundary"
  );
});

add_task(function test_focusRowAction() {
  const actionButton = navigationRow.shadowRoot.querySelector("button");

  navigationRow.focusRowAction();

  Assert.strictEqual(
    navigationRow.shadowRoot.activeElement,
    actionButton,
    "focusRowAction should move focus to the row action"
  );
});
