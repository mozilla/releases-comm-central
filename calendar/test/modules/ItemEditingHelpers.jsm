/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = [
  "CATEGORY_LIST",
  "REPEAT_DETAILS",
  "EVENT_TABPANELS",
  "DESCRIPTION_TEXTBOX",
  "ATTENDEES_ROW",
  "PERCENT_COMPLETE_INPUT",
  "DATE_INPUT",
  "TIME_INPUT",
  "REC_DLG_ACCEPT",
  "REC_DLG_DAYS",
  "REC_DLG_UNTIL_INPUT",
  "helpersForEditUI",
  "setData",
];

var elementslib = ChromeUtils.import("resource://testing-common/mozmill/elementslib.jsm");
var { sendString, synthesizeKey, synthesizeMouseAtCenter } = ChromeUtils.import(
  "resource://testing-common/mozmill/EventUtils.jsm"
);

var { helpersForController, menulistSelect } = ChromeUtils.import(
  "resource://testing-common/mozmill/CalendarUtils.jsm"
);

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { Assert } = ChromeUtils.import("resource://testing-common/Assert.jsm");
var { BrowserTestUtils } = ChromeUtils.import("resource://testing-common/BrowserTestUtils.jsm");

// Lookup paths and path-snippets.
// These 5 have to be used with itemEditLookup().
var CATEGORY_LIST = `
    id("event-grid")/id("event-grid-category-color-row")/id("event-grid-category-color-td")
    /id("item-categories")/id("item-categories-popup")
`;
var REPEAT_DETAILS = `
    id("event-grid")/id("event-grid-recurrence-row")/id("event-grid-recurrence-td")/id("event-grid-recurrence-picker-box")/
    id("repeat-deck")/id("repeat-details")/[0]
`;
var EVENT_TABPANELS = `
    id("event-grid-tab-vbox")/id("event-grid-tab-box-row")/id("event-grid-tabbox")/
    id("event-grid-tabpanels")
`;
var DESCRIPTION_TEXTBOX = `
    ${EVENT_TABPANELS}/id("event-grid-tabpanel-description")/id("item-description")
`;
var ATTENDEES_ROW = `
    ${EVENT_TABPANELS}/id("event-grid-tabpanel-attendees")/{"flex":"1"}/
    {"flex":"1"}/id("item-attendees-box")/{"class":"item-attendees-row"}
`;
// Only for Tasks.
var PERCENT_COMPLETE_INPUT = `
    id("event-grid")/id("event-grid-todo-status-row")/id("event-grid-todo-status-td")/
    id("event-grid-todo-status-picker-box")/id("percent-complete-textbox")
`;

// To be appended to the path for a date- or timepicker.
var DATE_INPUT = `
    {"class":"datepicker-menulist"}/{"class":"menulist-input"}
`;
var TIME_INPUT = `
    {"class":"timepicker-menulist"}/{"class":"menulist-input"}
`;

// The following can be used as is.
var REC_DLG_ACCEPT = `
    /{"windowtype":"Calendar:EventDialog:Recurrence"}/id("calendar-event-dialog-recurrence")
    /shadow/{"class":"dialog-button-box"}/{"dlgtype":"accept"}
`;
var REC_DLG_DAYS = `
    /{"windowtype":"Calendar:EventDialog:Recurrence"}/id("calendar-event-dialog-recurrence")
    /id("recurrence-pattern-groupbox")/{"flex":"1"}/[1]/
    id("period-deck")/id("period-deck-weekly-box")/[1]/id("daypicker-weekday")
`;
var REC_DLG_UNTIL_INPUT = `
    /{"windowtype":"Calendar:EventDialog:Recurrence"}/id("calendar-event-dialog-recurrence")
    /id("recurrence-range-groupbox")/[1]/id("recurrence-duration")
    /id("recurrence-range-until-box")/id("repeat-until-date")/
    {"class":"datepicker-menulist"}/{"class":"menulist-input"}
`;

function sleep(window) {
  return new Promise(resolve => window.setTimeout(resolve));
}

function helpersForEditUI(controller) {
  function selector(sel) {
    return sel.trim().replace(/\n(\s*)/g, "");
  }

  let isEvent = cal.item.isEvent(controller.window.calendarItem);

  let obj = {
    iframeLookup: path => {
      let type = isEvent ? "event" : "task";
      return new elementslib.Lookup(
        controller.window.document,
        selector(`
                /id("calendar-${type}-dialog-inner")/${path}
            `)
      );
    },
    getDateTimePicker: id => {
      let startId = isEvent ? "event-starttime" : "todo-entrydate";
      let endId = isEvent ? "event-endtime" : "todo-duedate";
      let path;
      switch (id) {
        case "STARTDATE":
          path = `
                        id("event-grid")/id("event-grid-startdate-row")/
                        id("event-grid-startdate-td")/id("event-grid-startdate-picker-box")/
                        id("${startId}")/{"anonid":"datepicker"}/${DATE_INPUT}
                    `;
          break;
        case "ENDDATE":
          path = `
                        id("event-grid")/id("event-grid-enddate-row")/id("event-grid-enddate-td")/
                        id("event-grid-enddate-vbox")/id("event-grid-enddate-picker-box")/
                        id("${endId}")/{"anonid":"datepicker"}/${DATE_INPUT}
                    `;
          break;
        case "STARTTIME":
          path = `
                        id("event-grid")/id("event-grid-startdate-row")/id("event-grid-startdate-td")/
                        id("event-grid-startdate-picker-box")/
                        id("${startId}")/{"anonid":"timepicker"}/${TIME_INPUT}
                    `;
          break;
        case "ENDTIME":
          path = `
                        id("event-grid")/id("event-grid-enddate-row")/id("event-grid-enddate-td")/
                        id("event-grid-enddate-vbox")/id("event-grid-enddate-picker-box")/
                        id("${endId}")/{"anonid":"timepicker"}/${TIME_INPUT}
                    `;
          break;
        case "UNTILDATE":
          path = `
                        id("event-grid")/id("event-grid-recurrence-row")/
                        id("event-grid-recurrence-td")/
                        id("event-grid-recurrence-picker-box")/id("repeat-deck")/
                        id("repeat-untilDate")/id("repeat-until-datepicker")/
                        ${DATE_INPUT}
                    `;
          break;
        case "COMPLETEDDATE":
          path = `
                        id("event-grid")/id("event-grid-todo-status-row")/
                        id("event-grid-todo-status-td")/
                        id("event-grid-todo-status-picker-box")/id("completed-date-picker")/
                        ${DATE_INPUT}
                    `;
          break;
      }
      return obj.iframeLookup(path);
    },
  };
  return obj;
}

/**
 * Helper function to enter event/task dialog data.
 *
 * @param dialog    event/task dialog controller
 * @param iframe    event/task dialog iframe controller
 * @param data      dataset object
 *                      title - event/task title
 *                      location - event/task location
 *                      description - event/task description
 *                      categories - array of category names
 *                      calendar - Calendar the item should be in.
 *                      allday - boolean value
 *                      startdate - Date object
 *                      starttime - Date object
 *                      enddate - Date object
 *                      endtime - Date object
 *                      timezonedisplay - False for hidden, true for shown.
 *                      timezone - String identifying the Timezone.
 *                      repeat - reccurrence value, one of none/daily/weekly/
 *                               every.weekday/bi.weekly/
 *                               monthly/yearly
 *                               (Custom is not supported.)
 *                      repeatuntil - Date object
 *                      reminder - none/0minutes/5minutes/15minutes/30minutes
 *                                 1hour/2hours/12hours/1day/2days/1week
 *                                 (Custom is not supported.)
 *                      priority - none/low/normal/high
 *                      privacy - public/confidential/private
 *                      status - none/tentative/confirmed/canceled for events
 *                               none/needs-action/in-process/completed/cancelled for tasks
 *                      completed - Date object for tasks
 *                      percent - percent complete for tasks
 *                      freebusy - free/busy
 *                      attachment.add - url to add
 *                      attachment.remove - Label of url to remove. (without http://)
 *                      attendees.add - eMail of attendees to add, comma separated.
 *                      attendees.remove - eMail of attendees to remove, comma separated.
 */
async function setData(dialog, iframe, data) {
  function replaceText(input, text) {
    synthesizeMouseAtCenter(input.getNode(), {}, iframe.window);
    synthesizeKey("a", { accelKey: true }, iframe.window);
    sendString(text, iframe.window);
  }

  let { eid } = helpersForController(dialog);
  let { eid: iframeid } = helpersForController(iframe);
  let { iframeLookup, getDateTimePicker } = helpersForEditUI(iframe);

  let isEvent = cal.item.isEvent(iframe.window.calendarItem);

  let startdateInput = getDateTimePicker("STARTDATE");
  let enddateInput = getDateTimePicker("ENDDATE");
  let starttimeInput = getDateTimePicker("STARTTIME");
  let endtimeInput = getDateTimePicker("ENDTIME");
  let completeddateInput = getDateTimePicker("COMPLETEDDATE");
  let percentCompleteInput = iframeLookup(PERCENT_COMPLETE_INPUT);
  let untilDateInput = getDateTimePicker("UNTILDATE");

  let dateFormatter = cal.getDateFormatter();
  // Wait for input elements' values to be populated.
  await sleep(iframe.window);

  // title
  if (data.title !== undefined) {
    let titleInput = iframeid("item-title");
    replaceText(titleInput, data.title);
  }

  // location
  if (data.location !== undefined) {
    let locationInput = iframeid("item-location");
    replaceText(locationInput, data.location);
  }

  // categories
  if (data.categories !== undefined) {
    await setCategories(iframe.window, data.categories);
    await sleep(iframe.window);
  }

  // calendar
  if (data.calendar !== undefined) {
    menulistSelect(iframeid("item-calendar"), data.calendar, dialog);
    await sleep(iframe.window);
  }

  // all-day
  if (data.allday !== undefined && isEvent) {
    let checkbox = iframeid("event-all-day");
    if (checkbox.getNode().checked != data.allday) {
      synthesizeMouseAtCenter(checkbox.getNode(), {}, iframe.window);
    }
  }

  // timezonedisplay
  if (data.timezonedisplay !== undefined) {
    let menuitem = eid("options-timezones-menuitem");
    if (menuitem.getNode().getAttribute("checked") != data.timezonedisplay) {
      dialog.click(menuitem);
    }
  }

  // timezone
  if (data.timezone !== undefined) {
    await setTimezone(dialog.window, iframe.window, data.timezone);
  }

  // startdate
  if (data.startdate !== undefined && data.startdate.constructor.name == "Date") {
    let startdate = dateFormatter.formatDateShort(
      cal.dtz.jsDateToDateTime(data.startdate, cal.dtz.floating)
    );

    if (!isEvent) {
      dialog.check(iframeid("todo-has-entrydate"), true);
    }
    replaceText(startdateInput, startdate);
  }

  // starttime
  if (data.starttime !== undefined && data.starttime.constructor.name == "Date") {
    let starttime = dateFormatter.formatTime(
      cal.dtz.jsDateToDateTime(data.starttime, cal.dtz.floating)
    );
    replaceText(starttimeInput, starttime);
    await sleep(iframe.window);
  }

  // enddate
  if (data.enddate !== undefined && data.enddate.constructor.name == "Date") {
    let enddate = dateFormatter.formatDateShort(
      cal.dtz.jsDateToDateTime(data.enddate, cal.dtz.floating)
    );
    if (!isEvent) {
      dialog.check(iframeid("todo-has-duedate"), true);
    }
    replaceText(enddateInput, enddate);
  }

  // endtime
  if (data.endtime !== undefined && data.endtime.constructor.name == "Date") {
    let endtime = dateFormatter.formatTime(
      cal.dtz.jsDateToDateTime(data.endtime, cal.dtz.floating)
    );
    replaceText(endtimeInput, endtime);
  }

  // recurrence
  if (data.repeat !== undefined) {
    menulistSelect(iframeid("item-repeat"), data.repeat, dialog);
  }
  if (data.repeatuntil !== undefined && data.repeatuntil.constructor.name == "Date") {
    // Only fill in date, when the Datepicker is visible.
    if (iframeid("repeat-deck").getNode().selectedIndex == 0) {
      let untildate = dateFormatter.formatDateShort(
        cal.dtz.jsDateToDateTime(data.repeatuntil, cal.dtz.floating)
      );
      replaceText(untilDateInput, untildate);
    }
  }

  // reminder
  if (data.reminder !== undefined) {
    await setReminderMenulist(iframe.window, data.reminder);
  }

  // priority
  if (data.priority !== undefined) {
    dialog.mainMenu.click(`#options-priority-${data.priority}-label`);
  }

  // privacy
  if (data.privacy !== undefined) {
    dialog.click(eid("button-privacy"));
    dialog.click(eid(`event-privacy-${data.privacy}-menuitem`));
    dialog.click(eid("button-privacy"));
    await sleep(iframe.window);
  }

  // status
  if (data.status !== undefined) {
    if (isEvent) {
      dialog.mainMenu.click(`#options-status-${data.status}-menuitem`);
    } else {
      menulistSelect(iframeid("todo-status"), data.status.toUpperCase(), dialog);
    }
  }

  let currentStatus = iframeid("todo-status").getNode().value;

  // completed on
  if (data.completed !== undefined && data.completed.constructor.name == "Date" && !isEvent) {
    let completeddate = dateFormatter.formatDateShort(
      cal.dtz.jsDateToDateTime(data.completed, cal.dtz.floating)
    );
    if (currentStatus == "COMPLETED") {
      replaceText(completeddateInput, completeddate);
    }
  }

  // percent complete
  if (
    data.percent !== undefined &&
    (currentStatus == "NEEDS-ACTION" ||
      currentStatus == "IN-PROCESS" ||
      currentStatus == "COMPLETED")
  ) {
    replaceText(percentCompleteInput, data.percent);
  }

  // free/busy
  if (data.freebusy !== undefined) {
    dialog.mainMenu.click(`#options-freebusy-${data.freebusy}-menuitem`);
  }

  // description
  if (data.description !== undefined) {
    dialog.click(iframeid("event-grid-tab-description"));
    let descField = iframeLookup(DESCRIPTION_TEXTBOX);
    replaceText(descField, data.description);
  }

  // attachment
  if (data.attachment !== undefined) {
    if (data.attachment.add !== undefined) {
      await handleAddingAttachment(dialog.window, data.attachment.add);
    }
    if (data.attachment.remove !== undefined) {
      dialog.click(iframeid("event-grid-tab-attachments"));
      let attachmentBox = iframeid("attachment-link");
      let attachments = attachmentBox.getNode().children;
      for (let attachment of attachments) {
        if (attachment.tooltipText.includes(data.attachment.remove)) {
          dialog.click(new elementslib.Elem(attachment));
          dialog.keypress(attachmentBox, "VK_DELETE", {});
        }
      }
    }
  }

  // attendees
  if (data.attendees !== undefined) {
    // Display attendees Tab.
    dialog.click(iframeid("event-grid-tab-attendees"));
    // Make sure no notifications are sent, since handling this dialog is
    // not working when deleting a parent of a recurring event.
    let attendeeCheckbox = iframeid("notify-attendees-checkbox");
    if (!attendeeCheckbox.getNode().disabled) {
      dialog.check(attendeeCheckbox, false);
    }

    // add
    if (data.attendees.add !== undefined) {
      await addAttendees(dialog.window, iframe.window, data.attendees.add);
    }
    // delete
    if (data.attendees.remove !== undefined) {
      await deleteAttendees(iframe.window, data.attendees.remove);
    }
  }

  await sleep(iframe.window);
}

/**
 * Select an item in the reminder menulist.
 * Custom reminders are not supported.
 *
 * @param iframeWindow    The event dialog iframe.
 * @param id              Identifying string of menuitem id.
 */
async function setReminderMenulist(iframeWindow, id) {
  let iframeDocument = iframeWindow.document;
  let menulist = iframeDocument.getElementById("item-alarm");
  let menuitem = iframeDocument.getElementById(`reminder-${id}-menuitem`);

  synthesizeMouseAtCenter(menulist, {}, iframeWindow);
  await BrowserTestUtils.waitForEvent(menulist, "popupshown");
  synthesizeMouseAtCenter(menuitem, {}, iframeWindow);
  await BrowserTestUtils.waitForEvent(menulist, "popuphidden");
  await sleep(iframeWindow);
}

/**
 * Set the categories in the event-dialog menulist-panel.
 *
 * @param iframeWindow    The event dialog iframe.
 * @param categories      Array containing the categories as strings - leave empty to clear.
 */
async function setCategories(iframeWindow, categories) {
  let iframeDocument = iframeWindow.document;
  let menulist = iframeDocument.getElementById("item-categories");
  let menupopup = iframeDocument.getElementById("item-categories-popup");

  synthesizeMouseAtCenter(menulist, {}, iframeWindow);
  await BrowserTestUtils.waitForEvent(menupopup, "popupshown");

  // Iterate over categories and check if needed.
  for (let item of menupopup.children) {
    if (categories.includes(item.label)) {
      item.setAttribute("checked", "true");
    } else {
      item.removeAttribute("checked");
    }
  }

  let hiddenPromise = BrowserTestUtils.waitForEvent(menupopup, "popuphidden");
  menupopup.hidePopup();
  await hiddenPromise;
}

/**
 * Add an URL attachment.
 *
 * @param dialogWindow    The event dialog.
 * @param url             URL to be added
 */
async function handleAddingAttachment(dialogWindow, url) {
  let dialogDocument = dialogWindow.document;

  synthesizeMouseAtCenter(dialogDocument.getElementById("button-url"), {}, dialogWindow);
  await BrowserTestUtils.promiseAlertDialog(undefined, undefined, attachmentWindow => {
    let attachmentDocument = attachmentWindow.document;

    attachmentDocument.getElementById("loginTextbox").value = url;
    synthesizeMouseAtCenter(
      attachmentDocument.querySelector("dialog").getButton("accept"),
      {},
      attachmentWindow
    );
  });
  await sleep(dialogWindow);
}

/**
 * Add attendees to the event.
 *
 * @param dialogWindow      The event dialog.
 * @param iframeWindow      The event dialog iframe.
 * @param attendeesString   Comma separated list of eMail-Addresses to add.
 */
async function addAttendees(dialogWindow, iframeWindow, attendeesString) {
  let dialogDocument = dialogWindow.document;

  let attendees = attendeesString.split(",");
  for (let attendee of attendees) {
    let calAttendee = iframeWindow.attendees.find(aAtt => aAtt.id == `mailto:${attendee}`);
    // Only add if not already present.
    if (!calAttendee) {
      synthesizeMouseAtCenter(dialogDocument.getElementById("button-attendees"), {}, dialogWindow);
      await BrowserTestUtils.promiseAlertDialog(
        undefined,
        "chrome://calendar/content/calendar-event-dialog-attendees.xhtml",
        async attendeesWindow => {
          await sleep(attendeesWindow);
          let attendeesDocument = attendeesWindow.document;

          // As starting point is always the last entered Attendee, we have
          // to advance to not overwrite it.
          await sleep(attendeesWindow);
          Assert.equal(attendeesDocument.activeElement.getAttribute("is"), "autocomplete-input");
          synthesizeKey("VK_TAB", {}, attendeesWindow);
          Assert.equal(attendeesDocument.activeElement.getAttribute("is"), "autocomplete-input");
          Assert.equal(attendeesDocument.activeElement.getAttribute("value"), null);
          sendString(attendee, attendeesWindow);
          synthesizeMouseAtCenter(
            attendeesDocument.querySelector("dialog").getButton("accept"),
            {},
            attendeesWindow
          );
        }
      );
      await sleep(iframeWindow);
    }
  }
}

/**
 * Delete attendees from the event.
 *
 * @param iframeWindow      The event dialog iframe.
 * @param attendeesString   Comma separated list of eMail-Addresses to delete.
 */
async function deleteAttendees(iframeWindow, attendeesString) {
  let iframeDocument = iframeWindow.document;
  let menupopup = iframeDocument.getElementById("attendee-popup");

  // Now delete the attendees.
  let attendees = attendeesString.split(",");
  for (let attendee of attendees) {
    let attendeeToDelete = iframeDocument.querySelector(
      `.item-attendees-row [attendeeid="mailto:${attendee}"]`
    );
    if (attendeeToDelete) {
      attendeeToDelete.focus();
      synthesizeMouseAtCenter(attendeeToDelete, { type: "contextmenu" }, iframeWindow);
      await BrowserTestUtils.waitForEvent(menupopup, "popupshown");
      synthesizeMouseAtCenter(
        iframeDocument.getElementById("attendee-popup-removeattendee-menuitem"),
        {},
        iframeWindow
      );
      await BrowserTestUtils.waitForEvent(menupopup, "popuphidden");
    }
  }
  await sleep(iframeWindow);
}

/**
 * Set the timezone for the item
 *
 * @param dialogWindow    The event dialog.
 * @param iframeWindow    The event dialog iframe.
 * @param timezone        String identifying the Timezone.
 */
async function setTimezone(dialogWindow, iframeWindow, timezone) {
  let dialogDocument = dialogWindow.document;
  let iframeDocument = iframeWindow.document;

  let menuitem = dialogDocument.getElementById("options-timezones-menuitem");
  let label = iframeDocument.getElementById("timezone-starttime");
  let menupopup = iframeDocument.getElementById("timezone-popup");
  let customMenuitem = iframeDocument.getElementById("timezone-custom-menuitem");

  if (!BrowserTestUtils.is_visible(label)) {
    menuitem.click();
    await sleep(iframeWindow);
  }

  Assert.ok(BrowserTestUtils.is_visible(label));
  synthesizeMouseAtCenter(label, {}, iframeWindow);
  await BrowserTestUtils.waitForEvent(menupopup, "popupshown");
  synthesizeMouseAtCenter(customMenuitem, {}, iframeWindow);

  await BrowserTestUtils.promiseAlertDialog(
    undefined,
    "chrome://calendar/content/calendar-event-dialog-timezone.xhtml",
    async timezoneWindow => {
      let timezoneDocument = timezoneWindow.document;
      let timezoneMenulist = timezoneDocument.getElementById("timezone-menulist");
      let timezoneMenuitem = timezoneMenulist.querySelector(`[value="${timezone}"]`);

      synthesizeMouseAtCenter(timezoneMenulist, {}, timezoneWindow);
      await BrowserTestUtils.waitForEvent(timezoneMenulist, "popupshown");
      timezoneMenuitem.scrollIntoView();
      synthesizeMouseAtCenter(timezoneMenuitem, {}, timezoneWindow);
      await BrowserTestUtils.waitForEvent(timezoneMenulist, "popuphidden");
      await sleep(timezoneWindow);

      synthesizeMouseAtCenter(
        timezoneDocument.querySelector("dialog").getButton("accept"),
        {},
        timezoneWindow
      );
    }
  );

  await new Promise(resolve => iframeWindow.setTimeout(resolve, 500));
}
