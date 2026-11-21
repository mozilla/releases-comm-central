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
let calendar;
let axeWatcher;
let tab;

add_setup(async function () {
  const tabmail = document.getElementById("tabmail");
  registerCleanupFunction(async () => {
    await axeWatcher?.finish();
    dialog?.close();

    if (tab) {
      tabmail.closeTab(tab);
    }

    if (calendar) {
      CalendarTestUtils.removeCalendar(calendar);
    }
  });

  tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarEventCreateEditDialog.xhtml",
  });

  browser = tab.browser;
  await BrowserTestUtils.browserLoaded(browser);
  await SimpleTest.promiseFocus(browser);

  dialog = browser.contentDocument.querySelector(
    '[is="calendar-event-create-edit-dialog"]'
  );
  calendar = createCalendar({ type: "memory" });
  nextEvent = await createEvent({ calendar, name: "Next event" });

  axeWatcher = await startAxeMutationObserver(browser, {
    container: '[is="calendar-event-create-edit-dialog"]',
    message: "Description navigation should pass accessibility checks.",
    specialPowers: SpecialPowers,
    autoFinish: false,
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
  const heading = subview.querySelector("h2");
  const editorRegion = subview.querySelector(".calendar-description-editor");

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
    heading.textContent.trim(),
    "The Description heading should be translated on first entry."
  );
  Assert.ok(
    back.textContent.trim(),
    "The Back button should be translated on first entry."
  );
  Assert.equal(
    browser.contentDocument.activeElement,
    editorRegion,
    "Opening Description should move focus to the editor region."
  );
  Assert.greater(
    manager.getBoundingClientRect().height,
    size.height,
    "Opening Description should grow to fit the editor."
  );
  Assert.equal(
    manager.getBoundingClientRect().width,
    size.width,
    "Opening Description should keep the dialog's width."
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

add_task(async function test_descriptionShellContainsSuppliedContent() {
  const shown = await dialog.show();
  Assert.ok(shown, "The create dialog should open.");

  const manager = dialog.querySelector("calendar-dialog-subview-manager");
  const row = dialog.querySelector("#descriptionNavigationRow");
  const subview = dialog.querySelector(
    "#calendarEventCreateEditDescriptionSubview"
  );
  const button = row.shadowRoot.querySelector("button");
  const back = subview.shadowRoot.querySelector("button");
  const heading = subview.querySelector("h2");
  const editorRegion = subview.querySelector(".calendar-description-editor");

  Assert.ok(heading, "Description should have a heading.");
  Assert.ok(editorRegion, "Description should have an editor region.");
  Assert.equal(
    back.parentElement.localName,
    "footer",
    "Back should appear in the subview footer."
  );
  Assert.ok(
    subview.querySelector(".calendar-description-heading .icon-description"),
    "The Description heading should include its document icon."
  );
  Assert.equal(
    editorRegion.getAttribute("aria-labelledby"),
    heading.id,
    "The content region should use the heading as its accessible name."
  );

  const mainSlot = subview.shadowRoot.querySelector('slot[name="main"]');

  Assert.ok(mainSlot, "Description should retain the shared main slot.");
  Assert.equal(
    mainSlot.assignedElements()[0],
    editorRegion.parentElement,
    "The main slot should show the supplied Description content."
  );

  EventUtils.synthesizeMouseAtCenter(button, {}, browser.contentWindow);

  Assert.equal(
    browser.contentDocument.activeElement,
    editorRegion,
    "Opening Description should focus the editor container."
  );
  Assert.ok(
    BrowserTestUtils.isVisible(subview.shadowRoot.querySelector("footer")),
    "The footer should keep Back available below the editor."
  );
  Assert.greater(
    editorRegion.clientHeight,
    0,
    "The Description editor should have a visible content area."
  );
  const position = dialog.getBoundingClientRect().toJSON();
  const suppliedContent = browser.contentDocument.createElement("p");

  suppliedContent.textContent = "Supplied description. ".repeat(2000);
  editorRegion.append(suppliedContent);

  Assert.greater(
    editorRegion.scrollHeight,
    editorRegion.clientHeight,
    "Long content should overflow the shell's scroll region."
  );

  editorRegion.scrollTop = editorRegion.scrollHeight;
  Assert.greater(
    editorRegion.scrollTop,
    0,
    "The shell should scroll to show long content."
  );
  Assert.deepEqual(
    dialog.getBoundingClientRect().toJSON(),
    position,
    "Supplied content should retain the dialog's size and position."
  );

  back.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(back, {}, browser.contentWindow);
  Assert.ok(
    manager.isDefaultSubviewVisible(),
    "Back should return to the main view before reopening Description."
  );

  EventUtils.synthesizeMouseAtCenter(button, {}, browser.contentWindow);
  Assert.equal(
    suppliedContent.parentElement,
    editorRegion,
    "Reopening Description should retain the supplied editor content."
  );
  dialog.close();
});
