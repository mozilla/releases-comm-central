/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * globals createCalendar, createEvent, openEvent, cal, CalendarTestUtils,
 * checkTolerance
 */

"use strict";

const { CalendarDialog } = ChromeUtils.importESModule(
  "chrome://messenger/content/calendar-dialog.mjs",
  { global: "current" }
);

const { MockExternalProtocolService } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockExternalProtocolService.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
let calendar;

add_setup(() => {
  MockExternalProtocolService.init();
  calendar = createCalendar({
    name: "TB CAL TEST",
    color: "rgb(255, 187, 255)",
  });

  registerCleanupFunction(() => {
    CalendarTestUtils.removeCalendar(calendar);
    tabmail.closeOtherTabs(0);
    MockExternalProtocolService.cleanup();
  });
});

/**
 * Clean up the state of the calendar tab by closing the dialog and removing the
 * event used for the test.
 *
 * @param {CalendarDialog} dialog - The calendar dialog that was opened in the
 *  test.
 * @param {Element} eventBox - The event box holding the event the dialog was
 *  opened for. Usually this was resolved to by |openAndShowEvent|.
 */
async function cleanUp(dialog, eventBox) {
  EventUtils.synthesizeMouseAtCenter(
    dialog.querySelector(".close-button"),
    {},
    window
  );

  await calendar.deleteItem(eventBox.occurrence);
}

add_task(async function test_calendarDialogOpenAndClose() {
  let dialog = document.querySelector('[is="calendar-dialog"]');

  if (dialog) {
    dialog.remove();
  }

  let dialogs = [...document.querySelectorAll("dialog")].filter(
    _dialog => _dialog instanceof CalendarDialog
  );
  dialog = dialogs[0];

  Assert.equal(
    dialogs.length,
    0,
    "calendar dialog does not exist until opened"
  );

  await createEvent({ calendar });
  const eventBox = await openAndShowEvent();

  dialogs = [...document.querySelectorAll("dialog")].filter(
    _dialog => _dialog instanceof CalendarDialog
  );
  dialog = dialogs[0];

  Assert.equal(dialogs.length, 1, "calendar dialog exists after opening");

  Assert.ok(dialog.open, "dialog is open");

  EventUtils.synthesizeMouseAtCenter(
    dialog.querySelector(".close-button"),
    {},
    window
  );

  Assert.ok(!dialog.open, "dialog is hidden");

  await openEvent({ eventBox });

  dialogs = [...document.querySelectorAll("dialog")].filter(
    _dialog => _dialog instanceof CalendarDialog
  );
  const newDialog = dialogs[0];

  Assert.equal(dialogs.length, 1, "1 calendar dialog exists");
  Assert.ok(newDialog.open, "dialog is visible");
  Assert.equal(
    newDialog,
    dialog,
    "New dialog and old dialog are the same element"
  );

  await cleanUp(dialog, eventBox);
});

add_task(async function test_calendarDialogColors() {
  const category = "TEST";
  const formattedCategoryName = cal.view.formatStringForCSSRule(category);
  Services.prefs.setStringPref(
    `calendar.category.color.${formattedCategoryName}`,
    "#0000ff"
  );
  const dialog = document.getElementById("calendarDialog");

  await createEvent({ calendar, categories: [category] });
  const eventBox = await openAndShowEvent();

  await BrowserTestUtils.waitForMutationCondition(
    dialog,
    {
      attributes: true,
      attributeFilter: ["style"],
    },
    () => dialog.style.getPropertyValue("--calendar-bar-color")
  );

  const calendarBarStyles = window.getComputedStyle(
    dialog.querySelector(".titlebar"),
    "::before"
  );
  Assert.equal(
    calendarBarStyles.backgroundColor,
    calendar.getProperty("color"),
    "Should apply the calendar color to the top bar"
  );

  const categoryItemStyles = window.getComputedStyle(
    dialog
      .querySelector("calendar-dialog-categories")
      .shadowRoot.querySelector(".categories-list li")
  );
  Assert.equal(
    categoryItemStyles.backgroundColor,
    "rgb(0, 0, 255)",
    "Should apply the category color the the background of the item"
  );

  Services.prefs.clearUserPref(
    `calendar.category.color.${formattedCategoryName}`
  );

  await cleanUp(dialog, eventBox);
});

add_task(async function test_maxSize() {
  const style = document.createElement("style");
  style.textContent = `[is="calendar-dialog"] { height: 2000px; }`;
  document.head.appendChild(style);

  await createEvent({ calendar });
  const eventBox = await openAndShowEvent();

  const dialog = document.querySelector(`[is="calendar-dialog"]`);

  const dialogBox = dialog.getBoundingClientRect();
  const container = document.getElementById("calendarDisplayBox");
  const containerBox = container.getBoundingClientRect();

  Assert.lessOrEqual(
    Math.floor(dialogBox.height),
    Math.floor(containerBox.height - DEFAULT_DIALOG_MARGIN * 2),
    "The dialog height is restricted by the container"
  );

  await cleanUp(dialog, eventBox);
  style.remove();
});

add_task(async function test_resizeWindow() {
  const fixedDate = new Date(2025, 3, 6, 12, 0, 0, 0);

  const style = document.createElement("style");
  style.textContent = `[is="calendar-dialog"] { height: 2000px; }`;
  document.head.appendChild(style);

  await createEvent({ calendar, baseDate: fixedDate });
  const eventBox = await openAndShowEvent({ baseDate: fixedDate });

  const dialog = document.querySelector(`[is="calendar-dialog"]`);
  const container = document.getElementById("calendarDisplayBox");
  let dialogBox = dialog.getBoundingClientRect();
  let containerBox = container.getBoundingClientRect();

  Assert.lessOrEqual(
    Math.round(dialogBox.height),
    Math.round(containerBox.height - DEFAULT_DIALOG_MARGIN * 2),
    "The dialog height should be restricted by the container initially"
  );

  checkTolerance(eventBox, `Dialog has correct initial position`);

  await resizeWindow({ y: window.outerHeight - 100 });

  await TestUtils.waitForCondition(() => {
    dialogBox = dialog.getBoundingClientRect();
    containerBox = container.getBoundingClientRect();

    return (
      Math.round(dialogBox.height) <=
      Math.round(containerBox.height - DEFAULT_DIALOG_MARGIN * 2)
    );
  }, "Waiting for dialog to resize");

  Assert.lessOrEqual(
    Math.round(dialogBox.height),
    Math.round(containerBox.height - DEFAULT_DIALOG_MARGIN * 2),
    "The dialog height should be restricted by the container"
  );

  checkTolerance(eventBox, `Dialog should have correct final position`);

  await cleanUp(dialog, eventBox);
  style.remove();
});

add_task(async function test_attachmentLinkClick() {
  await createEvent({ calendar, attachments: ["https://example.com/"] });
  const eventBox = await openAndShowEvent();

  const dialog = document.getElementById("calendarDialog");
  await BrowserTestUtils.waitForAttributeRemoval(
    "hidden",
    dialog.querySelector("#attachmentsRow")
  );

  info("Open attachments subbiew...");
  EventUtils.synthesizeMouseAtCenter(
    dialog.querySelector("#expandAttachments"),
    {}
  );
  await BrowserTestUtils.waitForAttributeRemoval(
    "hidden",
    dialog.querySelector("#calendarAttachmentsSubview")
  );

  info("Clicking link...");
  const openPromise = MockExternalProtocolService.promiseLoad();
  EventUtils.synthesizeMouseAtCenter(
    dialog.querySelector('li[is="calendar-dialog-attachment"] a'),
    {}
  );
  Assert.equal(
    await openPromise,
    "https://example.com/",
    "Should try to open attachment URL"
  );

  await cleanUp(dialog, eventBox);
  MockExternalProtocolService.reset();
});

add_task(async function test_closeDialogOnTabSwitch() {
  await createEvent({ calendar });
  const eventBox = await openAndShowEvent();

  const dialog = document.querySelector(`[is="calendar-dialog"]`);

  Assert.ok(dialog.open, "Dialog should be open");

  const dialogClose = BrowserTestUtils.waitForEvent(dialog, "close");
  tabmail.switchToTab(0);
  await dialogClose;

  Assert.ok(!dialog.open, "Dialog should report it is closed");
  Assert.ok(BrowserTestUtils.isHidden(dialog), "Dialog should not be visible");

  await CalendarTestUtils.openCalendarTab(window);

  Assert.ok(
    !dialog.open,
    "Dialog should stay closed after switching back to calendar tab"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(dialog),
    "Dialog should still not be visible"
  );

  await calendar.deleteItem(eventBox.occurrence);
});
