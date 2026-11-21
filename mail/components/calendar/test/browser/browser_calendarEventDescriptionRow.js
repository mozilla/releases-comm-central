/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { startAxeMutationObserver } = ChromeUtils.importESModule(
  "resource://testing-common/mail/AxeHelpers.sys.mjs"
);

let browser;
let dialog;
let nextEvent;

add_setup(async function () {
  const tabmail = document.getElementById("tabmail");
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarEventCreateEditDialog.xhtml",
  });

  browser = tab.browser;
  await BrowserTestUtils.browserLoaded(browser);
  await SimpleTest.promiseFocus(browser);

  dialog = browser.contentDocument.querySelector(
    '[is="calendar-event-create-edit-dialog"]'
  );
  const calendar = createCalendar({ type: "memory" });
  nextEvent = await createEvent({ calendar, name: "Next event" });

  await startAxeMutationObserver(browser, {
    container: '[is="calendar-event-create-edit-dialog"]',
    message: "Description navigation should pass accessibility checks.",
    specialPowers: SpecialPowers,
  });

  registerCleanupFunction(() => {
    dialog.close();
    tabmail.closeTab(tab);
    CalendarTestUtils.removeCalendar(calendar);
  });
});

add_task(async function test_descriptionNavigation() {
  const shown = await dialog.show();
  Assert.ok(shown, "The create dialog should open.");

  const manager = dialog.querySelector("calendar-dialog-subview-manager");
  const row = dialog.querySelector("#descriptionNavigationRow");
  const subview = manager.querySelector(
    "#calendarEventCreateEditDescriptionSubview"
  );
  const button = row.shadowRoot.querySelector("button");
  const label = row.querySelector('[slot="label"]');
  const back = subview.shadowRoot.querySelector("button");

  Assert.equal(
    row.localName,
    "calendar-dialog-navigation-row",
    "Description should use the shared navigation row."
  );
  Assert.equal(
    browser.contentDocument.l10n.getAttributes(label).id,
    "calendar-event-add-description",
    "The navigation row should have the Add description label."
  );
  Assert.ok(
    row.querySelector(".icon-description"),
    "The row should have a description icon."
  );
  Assert.ok(
    row.querySelector('[slot="action"].icon-nav-right'),
    "The row should have a chevron."
  );
  Assert.ok(
    !row.querySelector("textarea, input, [contenteditable]"),
    "The row should contain only navigation controls."
  );

  const service = Cc["@mozilla.org/accessibilityService;1"].getService(
    Ci.nsIAccessibilityService
  );

  const accessibleName = await TestUtils.waitForCondition(
    () => service.getAccessibleFor(button)?.name,
    "The navigation button should have a name in the accessibility tree."
  );
  Assert.equal(
    accessibleName,
    label.textContent,
    "The navigation button should use the visible translated label."
  );

  const navigationRequest = BrowserTestUtils.waitForEvent(
    row,
    "calendar-dialog-open-subview"
  );
  const draft = dialog.draft;
  const size = manager.getBoundingClientRect().toJSON();

  button.focus();
  EventUtils.synthesizeKey("KEY_Enter", {}, browser.contentWindow);
  const event = await navigationRequest;

  Assert.equal(event.target, row, "The row should request subview navigation.");
  Assert.ok(BrowserTestUtils.isVisible(subview), "Description should open.");
  Assert.ok(
    subview.contains(browser.contentDocument.activeElement),
    "Opening Description should focus its initial control."
  );
  Assert.deepEqual(
    manager.getBoundingClientRect().toJSON(),
    size,
    "Opening Description should keep the manager's size and position."
  );

  back.focus();
  EventUtils.synthesizeKey(" ", {}, browser.contentWindow);
  Assert.equal(
    row.shadowRoot.activeElement,
    button,
    "Back should focus Add description."
  );
  Assert.deepEqual(dialog.draft, draft, "Back should preserve the draft.");

  EventUtils.synthesizeMouseAtCenter(button, {}, browser.contentWindow);
  Assert.ok(
    BrowserTestUtils.isVisible(subview),
    "Description should be open before switching events."
  );

  dialog.setCalendarEventRoute({
    calendarId: nextEvent.calendar.id,
    eventId: nextEvent.id,
  });
  const replaced = await dialog.show();
  const currentRow = dialog.querySelector("#descriptionNavigationRow");
  const currentSubview = dialog.querySelector(
    "#calendarEventCreateEditDescriptionSubview"
  );

  Assert.ok(replaced, "The edit dialog should open for the selected event.");
  Assert.equal(
    dialog.querySelector(".event-title-input").value,
    nextEvent.title,
    "The dialog should show the selected event's title."
  );
  Assert.ok(
    BrowserTestUtils.isVisible(currentRow),
    "The selected event should start on the main view."
  );
  Assert.ok(
    BrowserTestUtils.isHidden(currentSubview),
    "Description should close when the dialog switches events."
  );

  const currentButton = currentRow.shadowRoot.querySelector("button");

  await TestUtils.waitForCondition(
    () => service.getAccessibleFor(currentButton)?.name == accessibleName,
    "Switching events should keep the navigation button's translated name."
  );

  EventUtils.synthesizeMouseAtCenter(currentButton, {}, browser.contentWindow);

  Assert.ok(
    BrowserTestUtils.isVisible(currentSubview),
    "Description should open for the selected event."
  );

  dialog.close();
});

add_task(async function test_descriptionRowReconnect() {
  const shown = await dialog.show();

  Assert.ok(shown, "The create dialog should open for row reconnection.");

  const row = dialog.querySelector("#descriptionNavigationRow");
  const button = row.shadowRoot.querySelector("button");
  const rowContainer = row.parentElement;
  const nextSibling = row.nextSibling;

  row.remove();
  rowContainer.insertBefore(row, nextSibling);

  Assert.equal(
    row.shadowRoot.querySelector("button"),
    button,
    "Reconnecting Description should retain the shared navigation button."
  );
  Assert.equal(
    row.shadowRoot.querySelectorAll("button").length,
    1,
    "Reconnecting Description should keep one navigation button."
  );
  Assert.equal(
    row.querySelectorAll('[slot="label"]').length,
    1,
    "Reconnecting Description should keep one label."
  );

  button.focus();
  EventUtils.synthesizeKey("KEY_Enter", {}, browser.contentWindow);

  const subview = dialog.querySelector(
    "#calendarEventCreateEditDescriptionSubview"
  );

  Assert.ok(
    BrowserTestUtils.isVisible(subview),
    "Reconnecting Description should retain keyboard navigation."
  );

  const back = subview.shadowRoot.querySelector("button");

  back.focus();
  EventUtils.synthesizeKey(" ", {}, browser.contentWindow);
  Assert.equal(
    row.shadowRoot.activeElement,
    button,
    "Back should focus the reconnected Description row."
  );

  dialog.close();
});
