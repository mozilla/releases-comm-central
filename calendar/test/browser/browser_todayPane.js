/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals agendaListbox */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.jsm",
  CalRecurrenceInfo: "resource:///modules/CalRecurrenceInfo.jsm",
});

add_task(async function testTodayPane() {
  // Add a calendar to work with.
  let manager = cal.getCalendarManager();
  let calendar = manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  calendar.name = "Mochitest";
  manager.registerCalendar(calendar);
  let pCalendar = cal.async.promisifyCalendar(calendar);

  registerCleanupFunction(async () => {
    manager.unregisterCalendar(calendar);
  });

  // Let the UI respond to the registration of the calendar.
  await new Promise(resolve => setTimeout(resolve));
  await new Promise(resolve => setTimeout(resolve));

  let todayPanePanel = document.getElementById("today-pane-panel");
  let todayPaneStatusButton = document.getElementById("calendar-status-todaypane-button");

  let today = cal.dtz.now();
  let startHour = today.hour;
  today.hour = today.minute = today.second = 0;

  // Go to mail tab.
  selectFolderTab();

  // Verify today pane open.
  if (todayPanePanel.hasAttribute("collapsed")) {
    EventUtils.synthesizeMouseAtCenter(todayPaneStatusButton, {});
  }
  Assert.ok(!todayPanePanel.hasAttribute("collapsed"));

  // Verify today pane's date.
  Assert.equal(document.getElementById("datevalue-label").value, today.day);

  // Tomorrow and soon are collapsed by default. Expand them.
  for (let headerId of ["today-header", "tomorrow-header", "nextweek-header"]) {
    let header = document.getElementById(headerId);
    if (header.getAttribute("checked") != "true") {
      EventUtils.synthesizeMouseAtCenter(header.firstElementChild.firstElementChild, {});
    }
    Assert.equal(header.getAttribute("checked"), "true");
  }

  // Create some events.
  let todaysEvent = new CalEvent();
  todaysEvent.title = "Today's Event";
  todaysEvent.startDate = today.clone();
  todaysEvent.startDate.hour = Math.min(startHour + 6, 23);
  todaysEvent.endDate = todaysEvent.startDate.clone();
  todaysEvent.endDate.hour++;

  let tomorrowsEvent = new CalEvent();
  tomorrowsEvent.title = "Tomorrow's Event";
  tomorrowsEvent.startDate = today.clone();
  tomorrowsEvent.startDate.day++;
  tomorrowsEvent.startDate.hour = 9;
  tomorrowsEvent.endDate = tomorrowsEvent.startDate.clone();
  tomorrowsEvent.endDate.hour++;

  let futureEvent = new CalEvent();
  futureEvent.id = "this is what we're waiting for";
  futureEvent.title = "Future Event";
  futureEvent.startDate = today.clone();
  futureEvent.startDate.day += 3;
  futureEvent.startDate.hour = 11;
  futureEvent.endDate = futureEvent.startDate.clone();
  futureEvent.endDate.hour++;

  let promiseFutureEventAdded = new Promise(resolve => {
    calendar.addObserver({
      onAddItem(item) {
        if (item.hasSameIds(futureEvent)) {
          calendar.removeObserver(this);
          resolve();
        }
      },
    });
  });

  await Promise.all([
    pCalendar.addItem(todaysEvent),
    pCalendar.addItem(tomorrowsEvent),
    pCalendar.addItem(futureEvent),
    promiseFutureEventAdded,
  ]);

  // Let the UI respond to the new events.
  await new Promise(resolve => setTimeout(resolve));
  await new Promise(resolve => setTimeout(resolve));

  // There should be a menupopup child and six list items.
  let listChildren = agendaListbox.agendaListboxControl.children;
  Assert.equal(listChildren.length, 7);
  Assert.equal(listChildren[0].localName, "menupopup");
  Assert.equal(listChildren[1].id, "today-header");
  Assert.equal(listChildren[3].id, "tomorrow-header");
  Assert.equal(listChildren[5].id, "nextweek-header");

  // Verify events shown in today pane.
  let dateFormatter = cal.dtz.formatter;

  let startString = dateFormatter.formatTime(todaysEvent.startDate, cal.dtz.defaultTimezone);
  Assert.equal(
    listChildren[2].querySelector(".agenda-event-start").textContent,
    `${startString} Today's Event`
  );

  startString = dateFormatter.formatTime(tomorrowsEvent.startDate, cal.dtz.defaultTimezone);
  Assert.equal(
    listChildren[4].querySelector(".agenda-event-start").textContent,
    `${startString} Tomorrow's Event`
  );

  startString = dateFormatter.formatDateTime(futureEvent.startDate, cal.dtz.defaultTimezone);
  Assert.equal(listChildren[6].querySelector(".agenda-event-start").textContent, startString);
  Assert.equal(listChildren[6].querySelector(".agenda-event-title").textContent, "Future Event");

  // Delete events.
  EventUtils.synthesizeMouseAtCenter(listChildren[2], {});
  EventUtils.synthesizeKey("VK_DELETE");
  Assert.equal(listChildren.length, 6);

  EventUtils.synthesizeMouseAtCenter(listChildren[3], {});
  EventUtils.synthesizeKey("VK_DELETE");
  Assert.equal(listChildren.length, 5);

  EventUtils.synthesizeMouseAtCenter(listChildren[4], {});
  EventUtils.synthesizeKey("VK_DELETE");
  Assert.equal(listChildren.length, 4);

  // Hide and verify today pane hidden.
  EventUtils.synthesizeMouseAtCenter(todayPaneStatusButton, {});
  Assert.ok(todayPanePanel.hasAttribute("collapsed"));

  // Reset today pane.
  EventUtils.synthesizeMouseAtCenter(todayPaneStatusButton, {});
  Assert.ok(!todayPanePanel.hasAttribute("collapsed"));

  // Collapse tomorrow and soon sections.
  for (let headerId of ["tomorrow-header", "nextweek-header"]) {
    let header = document.getElementById(headerId);
    EventUtils.synthesizeMouseAtCenter(header.firstElementChild.firstElementChild, {});
    Assert.ok(!header.getAttribute("checked"));
  }
});

/**
 * Tests the today pane opens events in the summary dialog for both
 * non-recurring and recurring events.
 */
add_task(async function testOpenEvent() {
  let now = cal.dtz.now();
  let uri = Services.io.newURI("moz-memory-calendar://");
  let manager = cal.getCalendarManager();
  let calendar = manager.createCalendar("memory", uri);
  let calendarProxy = cal.async.promisifyCalendar(calendar);

  calendar.name = "TestOpenEvent";
  manager.registerCalendar(calendar);
  registerCleanupFunction(() => manager.removeCalendar(calendar));

  // Let the UI respond to the registration of the calendar.
  await new Promise(resolve => setTimeout(resolve));
  await new Promise(resolve => setTimeout(resolve));

  let todayPanePanel = document.querySelector("#today-pane-panel");
  let todayPaneBtn = document.querySelector("#calendar-status-todaypane-button");

  // Go to mail tab.
  selectFolderTab();

  // Verify today pane open.
  if (todayPanePanel.hasAttribute("collapsed")) {
    EventUtils.synthesizeMouseAtCenter(todayPaneBtn, {});
  }

  Assert.ok(!todayPanePanel.hasAttribute("collapsed"));

  let noRepeatEvent = new CalEvent();
  noRepeatEvent.id = "no repeat event";
  noRepeatEvent.title = "No Repeat Event";
  noRepeatEvent.startDate = now.clone();
  noRepeatEvent.endDate = noRepeatEvent.startDate.clone();
  noRepeatEvent.endDate.hour++;

  let repeatEvent = new CalEvent();
  repeatEvent.id = "repeated event";
  repeatEvent.title = "Repeated Event";
  repeatEvent.startDate = now.clone();
  repeatEvent.endDate = noRepeatEvent.startDate.clone();
  repeatEvent.endDate.hour++;
  repeatEvent.recurrenceInfo = new CalRecurrenceInfo(repeatEvent);
  repeatEvent.recurrenceInfo.appendRecurrenceItem(
    cal.createRecurrenceRule("RRULE:FREQ=DAILY;COUNT=5")
  );

  for (let event of [noRepeatEvent, repeatEvent]) {
    await calendarProxy.addItem(event);

    // Let the UI respond to the new events.
    await new Promise(resolve => setTimeout(resolve));
    await new Promise(resolve => setTimeout(resolve));

    let listBox = agendaListbox.agendaListboxControl;
    let richlistitem = listBox.querySelector("#today-header + richlistitem");

    Assert.ok(richlistitem.textContent.includes(event.title), "event title is correct");

    let dialogWindowPromise = CalendarTestUtils.waitForEventDialog();
    EventUtils.synthesizeMouseAtCenter(richlistitem, { clickCount: 2 });

    let dialogWindow = await dialogWindowPromise;
    let docUri = dialogWindow.document.documentURI;
    Assert.ok(
      docUri === "chrome://calendar/content/calendar-summary-dialog.xhtml",
      "event summary dialog shown"
    );

    await BrowserTestUtils.closeWindow(dialogWindow);
    await calendarProxy.deleteItem(event);
  }
});
