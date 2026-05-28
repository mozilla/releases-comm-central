/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that calendars defined in the preferences are correctly read from the
 * preferences and displayed in the UI.
 */

add_setup(async function () {
  await CalendarTestUtils.setCalendarView(window, "multiweek");
});

registerCleanupFunction(async function () {
  await CalendarTestUtils.closeCalendarTab(window);
});

add_task(function () {
  const calendars = cal.manager.getCalendars();
  Assert.equal(calendars.length, 3);

  const first = calendars.find(c => c.id == "d583cb96-7228-4d81-8d5b-26d64abc140f");
  const second = calendars.find(c => c.id == "ab3004ed-411d-4bc6-b03c-e758ae3c3a50");
  const third = calendars.find(c => c.id == "ba548f76-a457-44d3-b020-1c4cc7c853fd");

  // Check we read the calendars correctly from the preferences.

  Assert.equal(first.name, "First");
  Assert.equal(first.type, "storage");
  Assert.equal(first.uri.spec, "moz-storage-calendar://");
  Assert.ok(!first.getProperty("calendar-main-default"));
  Assert.ok(first.getProperty("calendar-main-in-composite"));
  Assert.equal(first.getProperty("color"), "#ff6600");

  Assert.equal(second.name, "Second");
  Assert.equal(second.type, "storage");
  Assert.ok(second.getProperty("calendar-main-default"));
  Assert.ok(second.getProperty("calendar-main-in-composite"));
  Assert.equal(second.uri.spec, "moz-storage-calendar://");

  Assert.equal(third.name, "Third");
  Assert.equal(third.type, "storage");
  Assert.equal(third.uri.spec, "moz-storage-calendar://");
  Assert.ok(!third.getProperty("calendar-main-default"));
  Assert.ok(!third.getProperty("calendar-main-in-composite"));
  Assert.equal(third.getProperty("color"), "#ff33cc");

  // Check the sort order preference was correctly updated. The first and
  // second calendars were already in the pref, but the third was not.
  // It should be added.

  Assert.equal(
    Services.prefs.getStringPref("calendar.list.sortOrder"),
    `${first.id} ${second.id} ${third.id}`,
    "sort order preference should have been updated"
  );
  Assert.equal(
    getSelectedCalendar(),
    second,
    "the second calendar should have be the selected calendar"
  );

  // Check the UI calendar list correctly displays the calendars.

  const calendarList = document.getElementById("calendar-list");
  Assert.equal(calendarList.rowCount, 3, "all calendars should be listed");
  Assert.equal(calendarList.selectedIndex, 1, "the second calendar should be selected");

  function checkProperties(index, expected) {
    info(`checking the properties of the row at index ${index}`);
    const item = calendarList.rows[index];
    const colorImage = item.querySelector(".calendar-color");
    for (const [key, expectedValue] of Object.entries(expected)) {
      switch (key) {
        case "id":
          Assert.equal(item.getAttribute("calendar-id"), expectedValue);
          break;
        case "displayed":
          Assert.equal(item.querySelector(".calendar-displayed").checked, expectedValue);
          break;
        case "color":
          Assert.equal(getComputedStyle(colorImage).backgroundColor, expectedValue);
          break;
        case "name":
          Assert.equal(item.querySelector(".calendar-name").textContent, expectedValue);
          break;
      }
    }
  }

  checkProperties(0, {
    id: "d583cb96-7228-4d81-8d5b-26d64abc140f",
    name: "First",
    displayed: true,
    color: "rgb(255, 102, 0)",
  });

  checkProperties(1, {
    id: "ab3004ed-411d-4bc6-b03c-e758ae3c3a50",
    name: "Second",
    displayed: true,
  });

  checkProperties(2, {
    id: "ba548f76-a457-44d3-b020-1c4cc7c853fd",
    name: "Third",
    displayed: false,
    color: "rgb(255, 51, 204)",
  });
});
