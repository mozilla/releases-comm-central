/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let browser;
let dialog;
let calendarEvent;
let calendar;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarDialogAsyncLoadPosition.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser, undefined, url =>
    url.endsWith("calendarDialogAsyncLoadPosition.xhtml")
  );
  await SimpleTest.promiseFocus(tab.browser);
  // This test misbehaves if started immediately.

  browser = tab.browser;
  cal.view.colorTracker.registerWindow(browser.contentWindow);
  dialog = browser.contentWindow.document.querySelector("dialog");

  // Setting the color to the rgb value of #ffbbff so we don't have to do the
  // conversion for the computed color later.
  calendar = createCalendar({
    color: "rgb(255, 187, 255)",
    name: "TB CAL TEST",
  });
  calendarEvent = await createEvent({
    calendar,
    categories: ["TEST"],
    repeats: true,
    description: `


Prow scuttle parrel provost Sail ho shrouds spirits boom mizzenmast yardarm. Pinnace holystone mizzenmast quarter crow's nest nipperkin grog yardarm hempen halter furl. Swab barque interloper chantey doubloon starboard grog black jack gangway rutters.

Deadlights jack lad schooner scallywag dance the hempen jig carouser broadside cable strike colors. Bring a spring upon her cable holystone blow the man down spanker Shiver me timbers to go on account lookout wherry doubloon chase. Belay yo-ho-ho keelhaul squiffy black spot yardarm spyglass sheet transom heave to.

Trysail Sail ho Corsair red ensign hulk smartly boom jib rum gangway. Case shot Shiver me timbers gangplank crack Jennys tea cup ballast Blimey lee snow crow's nest rutters. Fluke jib scourge of the seven seas boatswain schooner gaff booty Jack Tar transom spirits.

    `,
  });

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
    CalendarTestUtils.removeCalendar(calendar);
  });
});

add_task(async function () {
  const target = browser.contentWindow.document.querySelector(
    ".multiday-event-listitem"
  );
  dialog.setCalendarEvent(calendarEvent);
  await dialog.show({ target });

  await BrowserTestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(dialog),
    "Waiting for dialog to be visible"
  );

  checkTolerance(
    target,
    "Dialog shold be correctly positioned after load",
    browser.contentWindow.document
  );

  dialog.close();
});
