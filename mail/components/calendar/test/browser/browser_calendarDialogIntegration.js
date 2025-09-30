/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * globals createCalendar, createEvent, openEvent, cal, CalendarTestUtils,
 */

"use strict";

const { CalendarDialog } = ChromeUtils.importESModule(
  "chrome://messenger/content/calendar-dialog.mjs",
  { global: "current" }
);

const tabmail = document.getElementById("tabmail");
let calendar;

add_setup(() => {
  calendar = createCalendar({
    name: "TB CAL TEST",
    color: "rgb(255, 187, 255)",
  });

  registerCleanupFunction(() => {
    CalendarTestUtils.removeCalendar(calendar);
  });
});

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

  EventUtils.synthesizeMouseAtCenter(
    dialog.querySelector(".close-button"),
    {},
    window
  );

  await calendar.deleteItem(eventBox.occurrence);
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

  await calendar.deleteItem(eventBox.occurrence);
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

  Assert.equal(
    Math.floor(dialogBox.height),
    Math.floor(containerBox.height - DEFAULT_DIALOG_MARGIN * 2),
    "The dialog height is restricted by the container"
  );

  await calendar.deleteItem(eventBox.occurrence);

  style.remove();
});
