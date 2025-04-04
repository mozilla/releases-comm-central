/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * globals createCalendar, createEvent, openEvent, cal, CalendarTestUtils
 */

"use strict";

const { CalendarDialog } = ChromeUtils.importESModule(
  "chrome://messenger/content/calendar-dialog.mjs",
  { global: "current" }
);

const tabmail = document.getElementById("tabmail");
let calendar;

add_setup(() => {
  calendar = createCalendar();

  registerCleanupFunction(() => {
    CalendarTestUtils.removeCalendar(calendar);
  });
});

add_task(async function test_calendarDialogOpenAndClose() {
  let dialogs = [...document.querySelectorAll("dialog")].filter(
    _dialog => _dialog instanceof CalendarDialog
  );
  let dialog = dialogs[0];

  Assert.equal(
    dialogs.length,
    0,
    "calendar dialog does not exist until opened"
  );
  createEvent({ calendar });
  await openEvent();

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

  await openEvent();

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
});

add_task(async function test_calendarDialogNewEvent() {
  let dialogs = [...document.querySelectorAll("dialog")].filter(
    _dialog => _dialog instanceof CalendarDialog
  );
  const dialog = dialogs[0];

  Assert.equal(dialogs.length, 1, "1 calendar dialog exists");
  Assert.ok(!dialog.open, "dialog is hidden");
  createEvent({ calendar });
  await openEvent();

  Assert.ok(dialog.open, "dialog is open");

  EventUtils.synthesizeMouseAtCenter(
    dialog.querySelector(".close-button"),
    {},
    window
  );

  Assert.ok(!dialog.open, "dialog is hidden");

  createEvent({ calendar, offset: 1 });

  await openEvent(1);

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
});
