/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

requestLongerTimeout(2);

var { cancelItemDialog, saveAndCloseItemDialog, setData } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/ItemEditingHelpers.sys.mjs"
);

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

var { data, newlines } = setupData();

var { dayView } = CalendarTestUtils;

const calendar = CalendarTestUtils.createCalendar();
// This is done so that calItemBase#isInvitation returns true.
calendar.setProperty("organizerId", "mailto:pillow@example.com");
registerCleanupFunction(() => {
  CalendarTestUtils.removeCalendar(calendar);
});
const l10n = new Localization(["calendar/categories.ftl"], true);
// Test that closing an event dialog with no changes does not prompt for save.
add_task(async function testEventDialogModificationPrompt() {
  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2009, 1, 1);

  const createbox = dayView.getHourBoxAt(window, 8);

  // Create new event.
  let { dialogWindow, iframeWindow } = await CalendarTestUtils.editNewEvent(window, createbox);
  const categories = l10n.formatValueSync("categories2").split(",");
  data[0].categories.push(categories[0]);
  data[1].categories.push(categories[1], categories[2]);

  // Enter first set of data.
  await setData(dialogWindow, iframeWindow, data[0]);
  await saveAndCloseItemDialog(dialogWindow);

  let eventbox = await dayView.waitForEventBoxAt(window, 1);

  // Open, but change nothing.
  ({ dialogWindow, iframeWindow } = await CalendarTestUtils.editItem(window, eventbox));
  // Escape the event window, there should be no prompt to save event.
  cancelItemDialog(dialogWindow);
  // Wait to see if the prompt appears.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 2000));

  eventbox = await dayView.waitForEventBoxAt(window, 1);
  // Open, change all values then revert the changes.
  ({ dialogWindow, iframeWindow } = await CalendarTestUtils.editItem(window, eventbox));
  // Change all values.
  await setData(dialogWindow, iframeWindow, data[1]);

  // Edit all values back to original.
  await setData(dialogWindow, iframeWindow, data[0]);

  // Escape the event window, there should be no prompt to save event.
  cancelItemDialog(dialogWindow);
  // Wait to see if the prompt appears.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Delete event.
  document.getElementById("day-view").focus();
  if (window.currentView().getSelectedItems().length == 0) {
    EventUtils.synthesizeMouseAtCenter(eventbox, {}, window);
  }
  Assert.equal(eventbox.isEditing, false, "event is not being edited");
  EventUtils.synthesizeKey("VK_DELETE", {}, window);
  await dayView.waitForNoEventBoxAt(window, 1);
});

add_task(async function testDescriptionWhitespace() {
  for (let i = 0; i < newlines.length; i++) {
    // test set i
    const createbox = dayView.getHourBoxAt(window, 8);
    let { dialogWindow, iframeWindow } = await CalendarTestUtils.editNewEvent(window, createbox);
    await setData(dialogWindow, iframeWindow, newlines[i]);
    await saveAndCloseItemDialog(dialogWindow);

    const eventbox = await dayView.waitForEventBoxAt(window, 1);

    // Open and close.
    ({ dialogWindow, iframeWindow } = await CalendarTestUtils.editItem(window, eventbox));
    await setData(dialogWindow, iframeWindow, newlines[i]);
    cancelItemDialog(dialogWindow);
    // Wait to see if the prompt appears.
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Delete it.
    document.getElementById("day-view").focus();
    if (window.currentView().getSelectedItems().length == 0) {
      EventUtils.synthesizeMouseAtCenter(eventbox, {}, window);
    }
    Assert.equal(eventbox.isEditing, false, "event is not being edited");
    EventUtils.synthesizeKey("VK_DELETE", {}, window);
    await dayView.waitForNoEventBoxAt(window, 1);
  }
});

function setupData() {
  const date1 = cal.createDateTime("20090101T080000Z");
  const date2 = cal.createDateTime("20090102T090000Z");
  const date3 = cal.createDateTime("20090103T100000Z");
  return {
    data: [
      {
        title: "title1",
        location: "location1",
        description: "description1",
        categories: [],
        allday: false,
        startdate: date1,
        starttime: date1,
        enddate: date2,
        endtime: date2,
        repeat: "none",
        reminder: "none",
        priority: "normal",
        privacy: "public",
        status: "confirmed",
        freebusy: "busy",
        timezonedisplay: true,
        attachment: { add: "https://mozilla.org" },
        attendees: { add: "foo@bar.de,foo@bar.com" },
      },
      {
        title: "title2",
        location: "location2",
        description: "description2",
        categories: [],
        allday: true,
        startdate: date2,
        starttime: date2,
        enddate: date3,
        endtime: date3,
        repeat: "daily",
        reminder: "5minutes",
        priority: "high",
        privacy: "private",
        status: "tentative",
        freebusy: "free",
        timezonedisplay: false,
        attachment: { remove: "mozilla.org" },
        attendees: { remove: "foo@bar.de,foo@bar.com" },
      },
    ],
    newlines: [
      { title: "title", description: "  test spaces  " },
      { title: "title", description: "\ntest newline\n" },
      { title: "title", description: "\rtest \\r\r" },
      { title: "title", description: "\r\ntest \\r\\n\r\n" },
      { title: "title", description: "\ttest \\t\t" },
    ],
  };
}
