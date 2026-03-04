/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let browser;
let row;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarDialogAcceptance.xhtml",
  });

  browser = tab.browser;
  await BrowserTestUtils.browserLoaded(browser);
  browser.focus();
  row = tab.browser.contentWindow.document.querySelector(
    "calendar-dialog-acceptance"
  );

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(async function test_attributeChanged() {
  const goingInput = row.shadowRoot.querySelector("#going");
  const maybeInput = row.shadowRoot.querySelector("#maybe");
  const notGoingInput = row.shadowRoot.querySelector("#notGoing");

  // Ensure none of the radio buttons are checked at the start.
  for (const input of row.shadowRoot.querySelectorAll("input")) {
    Assert.ok(!input.checked, `${input.id} should not be checked`);
  }

  // Set status attribute of custom element as ACCEPTED.
  let attributeChangedPromise = BrowserTestUtils.waitForAttribute(
    "status",
    row
  );
  row.setAttribute("status", "ACCEPTED");
  await attributeChangedPromise;

  Assert.ok(goingInput.checked, "Going input should be checked");
  Assert.ok(!maybeInput.checked, "Maybe input should not be checked");
  Assert.ok(!notGoingInput.checked, "Not going input should not be checked");

  // Set status attribute of custom element as TENTATIVE.
  attributeChangedPromise = BrowserTestUtils.waitForAttribute("status", row);
  row.setAttribute("status", "TENTATIVE");
  await attributeChangedPromise;

  Assert.ok(!goingInput.checked, "Going input should not be checked");
  Assert.ok(maybeInput.checked, "Maybe input should be checked");
  Assert.ok(!notGoingInput.checked, "Not going input should not be checked");

  // Set status attribute of custom element as DECLINED.
  attributeChangedPromise = BrowserTestUtils.waitForAttribute("status", row);
  row.setAttribute("status", "DECLINED");
  await attributeChangedPromise;

  Assert.ok(!goingInput.checked, "Going input should not be checked");
  Assert.ok(!maybeInput.checked, "Maybe input should not be checked");
  Assert.ok(notGoingInput.checked, "Not going input should be checked");

  // Set status attribute of custom element as NEEDS-ACTION, after resetting.
  row.reset();
  attributeChangedPromise = BrowserTestUtils.waitForAttribute("status", row);
  row.setAttribute("status", "NEEDS-ACTION");
  await attributeChangedPromise;

  // None of the radio buttons should not be checked at the start.
  for (const input of row.shadowRoot.querySelectorAll("input")) {
    Assert.ok(!input.checked, `${input.id} should not be checked`);
  }
});

add_task(async function test_clickEvent() {
  const goingInput = row.shadowRoot.querySelector("#going");
  const setEventReponseEvent = BrowserTestUtils.waitForEvent(
    row,
    "setEventResponse"
  );

  // Clicking the radio input should fire this event.
  EventUtils.synthesizeMouseAtCenter(goingInput, {}, row.ownerGlobal);
  const details = await setEventReponseEvent;

  Assert.equal(
    details.detail.status,
    goingInput.value,
    "The event should have sent the value of the input"
  );
});
