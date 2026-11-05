/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let subview;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarDialogSubview.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  subview = tab.browser.contentWindow.document.querySelector(
    "calendar-dialog-subview"
  );

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(function test_mainAndFooterSlots() {
  const mainSlot = subview.shadowRoot.querySelector('slot[name="main"]');
  const footerSlot = subview.shadowRoot.querySelector('slot[name="footer"]');
  const mainInput = mainSlot.assignedElements()[0].querySelector("input");

  Assert.ok(mainInput, "The main slot should have an input");

  Assert.equal(
    mainInput.value,
    "Main content",
    "The main slot should show the main content"
  );
  Assert.equal(
    footerSlot.assignedElements()[0].textContent,
    "Footer content",
    "The footer slot should show the footer content"
  );
});

add_task(function test_focusMovesToMainContent() {
  const mainInput = subview.querySelector("#mainInput");

  subview.focus();

  Assert.strictEqual(
    subview.ownerDocument.activeElement,
    mainInput,
    "The subview should focus its main content"
  );
});

add_task(function test_focusMovesToMainContainerWithoutInitialFocusId() {
  const fallbackSubview =
    subview.ownerDocument.querySelector("#fallbackSubview");

  Assert.ok(fallbackSubview, "The fixture should have a fallback subview");
  const main = fallbackSubview.shadowRoot.querySelector("main");
  Assert.ok(main, "The fallback subview should have a main container");
  fallbackSubview.focus();

  Assert.strictEqual(
    fallbackSubview.shadowRoot.activeElement,
    main,
    "The subview should focus its main container when no focus attribute is provided"
  );
});

add_task(function test_backButtonHasLocalizationId() {
  const button = subview.shadowRoot.querySelector("button");

  Assert.ok(button, "The subview should have a Back button");
  Assert.equal(
    subview.ownerDocument.l10n.getAttributes(button).id,
    "calendar-event-create-edit-dialog-back-button",
    "The Back button should have the correct localization ID"
  );
});

add_task(async function test_backButtonBubblesCloseRequest() {
  const button = subview.shadowRoot.querySelector("button");
  const closed = BrowserTestUtils.waitForEvent(
    subview.ownerDocument,
    "calendar-dialog-close-subview"
  );

  button.click();
  const event = await closed;

  Assert.strictEqual(
    event.target,
    subview,
    "The subview is the source of the close request"
  );
  Assert.ok(event.bubbles, "The close request should bubble");
  Assert.ok(event.composed, "The close request should be composed");
});
