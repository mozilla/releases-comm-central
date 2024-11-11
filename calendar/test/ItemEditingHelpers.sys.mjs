/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Assert } from "resource://testing-common/Assert.sys.mjs";

import { TestUtils } from "resource://testing-common/TestUtils.sys.mjs";
import { BrowserTestUtils } from "resource://testing-common/BrowserTestUtils.sys.mjs";
import {
  sendString,
  synthesizeKey,
  synthesizeMouseAtCenter,
} from "resource://testing-common/mail/EventUtils.sys.mjs";

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";
import { CalDateTime } from "resource:///modules/CalDateTime.sys.mjs";
import { setTimeout } from "resource://gre/modules/Timer.sys.mjs";

function sleep(window, time = 0) {
  return new Promise(resolve => window.setTimeout(resolve, time));
}

var dateFormatter = new Services.intl.DateTimeFormat(undefined, { dateStyle: "short" });
var dateTimeFormatter = new Services.intl.DateTimeFormat(undefined, {
  dateStyle: "short",
  timeZone: "UTC",
});
var timeFormatter = new Services.intl.DateTimeFormat(undefined, {
  timeStyle: "short",
  timeZone: "UTC",
});

/**
 * Formats a date for input in a datepicker. Don't use cal.dtz.formatter methods
 * for this as they use the application locale but datepicker uses the OS locale.
 *
 * @param {calIDateTime} date
 * @returns {string}
 */
export function formatDate(date) {
  if (date.isDate) {
    return dateFormatter.format(cal.dtz.dateTimeToJsDate(date));
  }

  return dateTimeFormatter.format(cal.dtz.dateTimeToJsDate(date));
}

/**
 * Formats a time for input in a timepicker. Don't use cal.dtz.formatter methods
 * for this as they use the application locale but timepicker uses the OS locale.
 *
 * @param {calIDateTime} time
 * @returns {string}
 */
export function formatTime(time) {
  return timeFormatter.format(cal.dtz.dateTimeToJsDate(time));
}

/**
 * @callback dialogCallback
 * @param {Window} - The calendar-event-dialog-recurrence.xhtml dialog.
 */

/**
 * Helper function to enter event/task dialog data.
 *
 * @param {Window} dialogWindow - Item dialog outer window.
 * @param {Window} iframeWindow - Item dialog inner iframe.
 * @param {object} data
 * @param {string} data.title - Item title.
 * @param {string} data.location - Item location.
 * @param {string} data.description - Item description.
 * @param {string[]} data.categories - Category names to set - leave empty to clear.
 * @param {string} data.calendar - ID of the calendar the item should be in.
 * @param {boolean} data.allday
 * @param {calIDateTime} data.startdate
 * @param {calIDateTime} data.starttime
 * @param {calIDateTime} data.enddate
 * @param {calIDateTime} data.endtime
 * @param {boolean} data.timezonedisplay - false for hidden, true for shown.
 * @param {string} data.timezone - String identifying the timezone.
 * @param {string|dialogCallback} data.repeat - Recurrence value, one of
 *     none/daily/weekly/every.weekday/bi.weekly/monthly/yearly or a callback function to set a
 *     custom value.
 * @param {calIDateTime} data.repeatuntil
 * @param {string} data.reminder -
 *     none/0minutes/5minutes/15minutes/30minutes/1hour/2hours/12hours/1day/2days/1week
 *     (Custom is not supported.)
 * @param {string} data.priority - none/low/normal/high
 * @param {string} data.privacy - public/confidential/private
 * @param {string} data.status - none/tentative/confirmed/canceled for events
 *     none/needs-action/in-process/completed/cancelled for tasks
 * @param {calIDateTime} data.completed - Completion date (tasks only)
 * @param {string} data.percent - Percentage complete (tasks only)
 * @param {string} data.freebusy - free/busy
 * @param {string} data.attachment.add - URL to add
 * @param {string} data.attachment.remove - Label of url to remove. (without http://)
 * @param {string} data.attendees.add - Email of attendees to add, comma separated.
 * @param {string} data.attendees.remove - Email of attendees to remove, comma separated.
 */
export async function setData(dialogWindow, iframeWindow, data) {
  function replaceText(input, text) {
    synthesizeMouseAtCenter(input, {}, iframeWindow);
    synthesizeKey("a", { accelKey: true }, iframeWindow);
    sendString(text, iframeWindow);
  }

  const dialogDocument = dialogWindow.document;
  const iframeDocument = iframeWindow.document;

  const isEvent = iframeWindow.calendarItem.isEvent();
  const startPicker = iframeDocument.getElementById(isEvent ? "event-starttime" : "todo-entrydate");
  const endPicker = iframeDocument.getElementById(isEvent ? "event-endtime" : "todo-duedate");

  const startdateInput = startPicker._datepicker._inputField;
  const enddateInput = endPicker._datepicker._inputField;
  const starttimeInput = startPicker._timepicker._inputField;
  const endtimeInput = endPicker._timepicker._inputField;
  const completeddateInput = iframeDocument.getElementById("completed-date-picker")._inputField;
  const untilDateInput = iframeDocument.getElementById("repeat-until-datepicker")._inputField;

  // Wait for input elements' values to be populated.
  await sleep(iframeWindow, 500);

  // title
  if (data.title !== undefined) {
    const titleInput = iframeDocument.getElementById("item-title");
    replaceText(titleInput, data.title);
  }

  // location
  if (data.location !== undefined) {
    const locationInput = iframeDocument.getElementById("item-location");
    replaceText(locationInput, data.location);
  }

  // categories
  if (data.categories !== undefined) {
    await setCategories(iframeWindow, data.categories);
    await sleep(iframeWindow);
  }

  // calendar
  if (data.calendar !== undefined) {
    await menulistSelect(iframeDocument.getElementById("item-calendar"), data.calendar);
    await sleep(iframeWindow);
  }

  // all-day
  if (data.allday !== undefined && isEvent) {
    const checkbox = iframeDocument.getElementById("event-all-day");
    if (checkbox.checked != data.allday) {
      synthesizeMouseAtCenter(checkbox, {}, iframeWindow);
    }
  }

  // timezonedisplay
  if (data.timezonedisplay !== undefined) {
    const menuitem = dialogDocument.getElementById("options-timezones-menuitem");
    if (menuitem.getAttribute("checked") != data.timezonedisplay) {
      synthesizeMouseAtCenter(menuitem, {}, iframeWindow);
    }
  }

  // timezone
  if (data.timezone !== undefined) {
    await setTimezone(dialogWindow, iframeWindow, data.timezone);
  }

  // startdate
  if (
    data.startdate !== undefined &&
    (data.startdate instanceof CalDateTime || data.startdate instanceof Ci.calIDateTime)
  ) {
    const startdate = formatDate(data.startdate);

    if (!isEvent) {
      const checkbox = iframeDocument.getElementById("todo-has-entrydate");
      if (!checkbox.checked) {
        synthesizeMouseAtCenter(checkbox, {}, iframeWindow);
      }
    }
    replaceText(startdateInput, startdate);
  }

  // starttime
  if (
    data.starttime !== undefined &&
    (data.starttime instanceof CalDateTime || data.starttime instanceof Ci.calIDateTime)
  ) {
    const starttime = formatTime(data.starttime);
    replaceText(starttimeInput, starttime);
    await sleep(iframeWindow);
  }

  // enddate
  if (
    data.enddate !== undefined &&
    (data.enddate instanceof CalDateTime || data.enddate instanceof Ci.calIDateTime)
  ) {
    const enddate = formatDate(data.enddate);
    if (!isEvent) {
      const checkbox = iframeDocument.getElementById("todo-has-duedate");
      if (!checkbox.checked) {
        synthesizeMouseAtCenter(checkbox, {}, iframeWindow);
      }
    }
    replaceText(enddateInput, enddate);
  }

  // endtime
  if (
    data.endtime !== undefined &&
    (data.endtime instanceof CalDateTime || data.endtime instanceof Ci.calIDateTime)
  ) {
    const endtime = formatTime(data.endtime);
    replaceText(endtimeInput, endtime);
  }

  // recurrence
  if (data.repeat !== undefined) {
    if (typeof data.repeat == "function") {
      const repeatWindowPromise = BrowserTestUtils.promiseAlertDialog(
        undefined,
        "chrome://calendar/content/calendar-event-dialog-recurrence.xhtml",
        {
          async callback(recurrenceWindow) {
            Assert.report(false, undefined, undefined, "Recurrence dialog opened");
            await TestUtils.waitForCondition(
              () => Services.focus.activeWindow == recurrenceWindow,
              "recurrence dialog active"
            );

            await new Promise(resolve => recurrenceWindow.setTimeout(resolve, 500));
            await data.repeat(recurrenceWindow);
          },
        }
      );
      await Promise.all([
        menulistSelect(iframeDocument.getElementById("item-repeat"), "custom"),
        repeatWindowPromise,
      ]);
      Assert.report(false, undefined, undefined, "Recurrence dialog closed");
    } else {
      await menulistSelect(iframeDocument.getElementById("item-repeat"), data.repeat);
    }
  }
  if (
    data.repeatuntil !== undefined &&
    (data.repeatuntil instanceof CalDateTime || data.repeatuntil instanceof Ci.calIDateTime)
  ) {
    // Only fill in date, when the Datepicker is visible.
    if (!iframeDocument.getElementById("repeat-untilDate").hidden) {
      const untildate = formatDate(data.repeatuntil);
      replaceText(untilDateInput, untildate);
    }
  }

  // reminder
  if (data.reminder !== undefined) {
    await setReminderMenulist(iframeWindow, data.reminder);
  }

  // priority
  if (data.priority !== undefined) {
    dialogDocument.getElementById(`options-priority-${data.priority}-label`).click();
  }

  // privacy
  if (data.privacy !== undefined) {
    const button = dialogDocument.getElementById("button-privacy");
    const shownPromise = BrowserTestUtils.waitForEvent(button, "popupshown");
    synthesizeMouseAtCenter(button, {}, dialogWindow);
    await shownPromise;
    const hiddenPromise = BrowserTestUtils.waitForEvent(button, "popuphidden");
    synthesizeMouseAtCenter(
      dialogDocument.getElementById(`event-privacy-${data.privacy}-menuitem`),
      {},
      dialogWindow
    );
    await hiddenPromise;
    await sleep(iframeWindow);
  }

  // status
  if (data.status !== undefined) {
    if (isEvent) {
      dialogDocument.getElementById(`options-status-${data.status}-menuitem`).click();
    } else {
      await menulistSelect(iframeDocument.getElementById("todo-status"), data.status.toUpperCase());
    }
  }

  const currentStatus = iframeDocument.getElementById("todo-status").value;

  // completed on
  if (
    data.completed !== undefined &&
    (data.completed instanceof CalDateTime || data.completed instanceof Ci.calIDateTime) &&
    !isEvent
  ) {
    const completeddate = formatDate(data.completed);
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
    const percentCompleteInput = iframeDocument.getElementById("percent-complete-textbox");
    replaceText(percentCompleteInput, data.percent);
  }

  // free/busy
  if (data.freebusy !== undefined) {
    dialogDocument.getElementById(`options-freebusy-${data.freebusy}-menuitem`).click();
  }

  // description
  if (data.description !== undefined) {
    synthesizeMouseAtCenter(
      iframeDocument.getElementById("event-grid-tab-description"),
      {},
      iframeWindow
    );
    const descField = iframeDocument.getElementById("item-description");
    replaceText(descField, data.description);
  }

  // attachment
  if (data.attachment !== undefined) {
    if (data.attachment.add !== undefined) {
      await handleAddingAttachment(dialogWindow, data.attachment.add);
    }
    if (data.attachment.remove !== undefined) {
      synthesizeMouseAtCenter(
        iframeDocument.getElementById("event-grid-tab-attachments"),
        {},
        iframeWindow
      );
      const attachmentBox = iframeDocument.getElementById("attachment-link");
      const attachments = attachmentBox.children;
      for (const attachment of attachments) {
        if (attachment.tooltipText.includes(data.attachment.remove)) {
          synthesizeMouseAtCenter(attachment, {}, iframeWindow);
          synthesizeKey("VK_DELETE", {}, dialogWindow);
        }
      }
    }
  }

  // attendees
  if (data.attendees !== undefined) {
    // Display attendees Tab.
    synthesizeMouseAtCenter(
      iframeDocument.getElementById("event-grid-tab-attendees"),
      {},
      iframeWindow
    );
    // Make sure no notifications are sent, since handling this dialog is
    // not working when deleting a parent of a recurring event.
    const attendeeCheckbox = iframeDocument.getElementById("notify-attendees-checkbox");
    if (!attendeeCheckbox.disabled && attendeeCheckbox.checked) {
      synthesizeMouseAtCenter(attendeeCheckbox, {}, iframeWindow);
    }

    // add
    if (data.attendees.add !== undefined) {
      await addAttendees(dialogWindow, iframeWindow, data.attendees.add);
    }
    // delete
    if (data.attendees.remove !== undefined) {
      await deleteAttendees(iframeWindow, data.attendees.remove);
    }
  }

  await sleep(iframeWindow);
}

/**
 * Closes an event dialog window, saving the event.
 *
 * @param {Window} dialogWindow
 */
export async function saveAndCloseItemDialog(dialogWindow) {
  const dialogClosing = BrowserTestUtils.domWindowClosed(dialogWindow);
  synthesizeMouseAtCenter(
    dialogWindow.document.getElementById("button-saveandclose"),
    {},
    dialogWindow
  );
  await dialogClosing;
  Assert.report(false, undefined, undefined, "Item dialog closed");
  await new Promise(resolve => setTimeout(resolve));
}

/**
 * Closes an event dialog window, discarding any changes.
 *
 * @param {Window} dialogWindow
 */
export function cancelItemDialog(dialogWindow) {
  synthesizeKey("VK_ESCAPE", {}, dialogWindow);
}

/**
 * Select an item in the reminder menulist.
 * Custom reminders are not supported.
 *
 * @param {Window} iframeWindow - The event dialog iframe.
 * @param {string} id - Identifying string of menuitem id.
 */
async function setReminderMenulist(iframeWindow, id) {
  const iframeDocument = iframeWindow.document;
  const menulist = iframeDocument.querySelector(".item-alarm");
  const menuitem = iframeDocument.getElementById(`reminder-${id}-menuitem`);

  Assert.ok(menulist, `<menulist id=${menulist.id}> exists`);
  Assert.ok(menuitem, `<menuitem id=${id}> exists`);

  menulist.focus();

  synthesizeMouseAtCenter(menulist, {}, iframeWindow);
  await BrowserTestUtils.waitForEvent(menulist, "popupshown");
  synthesizeMouseAtCenter(menuitem, {}, iframeWindow);
  await BrowserTestUtils.waitForEvent(menulist, "popuphidden");
  await sleep(iframeWindow);
}

/**
 * Set the categories in the event-dialog menulist-panel.
 *
 * @param {Window} iframeWindow - The event dialog iframe.
 * @param {string[]} categories - Category names to set - leave empty to clear.
 */
async function setCategories(iframeWindow, categories) {
  const iframeDocument = iframeWindow.document;
  const menulist = iframeDocument.getElementById("item-categories");
  const menupopup = iframeDocument.getElementById("item-categories-popup");

  synthesizeMouseAtCenter(menulist, {}, iframeWindow);
  await BrowserTestUtils.waitForEvent(menupopup, "popupshown");

  // Iterate over categories and check if needed.
  for (const item of menupopup.children) {
    if (categories.includes(item.label)) {
      item.setAttribute("checked", "true");
    } else {
      item.removeAttribute("checked");
    }
  }

  const hiddenPromise = BrowserTestUtils.waitForEvent(menupopup, "popuphidden");
  menupopup.hidePopup();
  await hiddenPromise;
}

/**
 * Add an URL attachment.
 *
 * @param {Window} dialogWindow - The event dialog.
 * @param {string} url - URL to be added.
 */
async function handleAddingAttachment(dialogWindow, url) {
  const dialogDocument = dialogWindow.document;
  const attachButton = dialogDocument.querySelector("#button-url");
  const menu = dialogDocument.querySelector("#button-attach-menupopup");
  const menuShowing = BrowserTestUtils.waitForEvent(menu, "popupshown");
  synthesizeMouseAtCenter(attachButton, {}, dialogWindow);
  await menuShowing;

  const dialogPromise = BrowserTestUtils.promiseAlertDialog(undefined, undefined, {
    async callback(attachmentWindow) {
      Assert.report(false, undefined, undefined, "Attachment dialog opened");
      await TestUtils.waitForCondition(
        () => Services.focus.activeWindow == attachmentWindow,
        "attachment dialog active"
      );

      const attachmentDocument = attachmentWindow.document;
      attachmentDocument.getElementById("loginTextbox").value = url;
      attachmentDocument.querySelector("dialog").getButton("accept").click();
    },
  });
  synthesizeMouseAtCenter(dialogDocument.querySelector("#button-attach-url"), {}, dialogWindow);
  await dialogPromise;
  Assert.report(false, undefined, undefined, "Attachment dialog closed");
  await sleep(dialogWindow);
}

/**
 * Add attendees to the event.
 *
 * @param {Window} dialogWindow - The event dialog.
 * @param {Window} iframeWindow - The event dialog iframe.
 * @param {string} attendeesString - Comma separated list of email-addresses to add.
 */
async function addAttendees(dialogWindow, iframeWindow, attendeesString) {
  const dialogDocument = dialogWindow.document;

  const attendees = attendeesString.split(",");
  for (const attendee of attendees) {
    const calAttendee = iframeWindow.attendees.find(aAtt => aAtt.id == `mailto:${attendee}`);
    // Only add if not already present.
    if (!calAttendee) {
      const dialogPromise = BrowserTestUtils.promiseAlertDialog(
        undefined,
        "chrome://calendar/content/calendar-event-dialog-attendees.xhtml",
        {
          async callback(attendeesWindow) {
            Assert.report(false, undefined, undefined, "Attendees dialog opened");
            await TestUtils.waitForCondition(
              () => Services.focus.activeWindow == attendeesWindow,
              "attendees dialog active"
            );

            const attendeesDocument = attendeesWindow.document;
            Assert.equal(attendeesDocument.activeElement.localName, "input");
            Assert.equal(
              attendeesDocument.activeElement.value,
              "",
              "active input value should be empty"
            );
            sendString(attendee, attendeesWindow);
            Assert.report(false, undefined, undefined, `Sent attendee ${attendee}`);
            // Windows needs the focus() call here.
            attendeesDocument.querySelector("dialog").getButton("accept").focus();
            synthesizeMouseAtCenter(
              attendeesDocument.querySelector("dialog").getButton("accept"),
              {},
              attendeesWindow
            );
          },
        }
      );
      synthesizeMouseAtCenter(dialogDocument.getElementById("button-attendees"), {}, dialogWindow);
      await dialogPromise;
      Assert.report(false, undefined, undefined, "Attendees dialog closed");
      await sleep(iframeWindow);
    }
  }
}

/**
 * Delete attendees from the event.
 *
 * @param {Window} iframeWindow - The event dialog iframe.
 * @param {string} attendeesString - Comma separated list of email-addresses to delete.
 */
async function deleteAttendees(iframeWindow, attendeesString) {
  const iframeDocument = iframeWindow.document;
  const menupopup = iframeDocument.getElementById("attendee-popup");

  // Now delete the attendees.
  const attendees = attendeesString.split(",");
  for (const attendee of attendees) {
    const attendeeToDelete = iframeDocument.querySelector(
      `.attendee-list [attendeeid="mailto:${attendee}"]`
    );
    if (attendeeToDelete) {
      attendeeToDelete.focus();
      synthesizeMouseAtCenter(attendeeToDelete, { type: "contextmenu" }, iframeWindow);
      await BrowserTestUtils.waitForEvent(menupopup, "popupshown");
      menupopup.activateItem(
        iframeDocument.getElementById("attendee-popup-removeattendee-menuitem")
      );
      await BrowserTestUtils.waitForEvent(menupopup, "popuphidden");
    }
  }
  await sleep(iframeWindow);
}

/**
 * Set the timezone for the item
 *
 * @param {Window} dialogWindow - The event dialog.
 * @param {Window} iframeWindow - The event dialog iframe.
 * @param {string} timezone - String identifying the timezone.
 */
async function setTimezone(dialogWindow, iframeWindow, timezone) {
  const dialogDocument = dialogWindow.document;
  const iframeDocument = iframeWindow.document;

  const menuitem = dialogDocument.getElementById("options-timezones-menuitem");
  const label = iframeDocument.getElementById("timezone-starttime");
  const menupopup = iframeDocument.getElementById("timezone-popup");
  const customMenuitem = iframeDocument.getElementById("timezone-custom-menuitem");

  if (!BrowserTestUtils.isVisible(label)) {
    menuitem.click();
    await TestUtils.waitForCondition(
      () => BrowserTestUtils.isVisible(label),
      "Timezone label should become visible"
    );
  }

  await TestUtils.waitForCondition(() => !label.disabled, "Tiemzone label should become enabled");

  const shownPromise = BrowserTestUtils.waitForEvent(menupopup, "popupshown");
  const dialogPromise = BrowserTestUtils.promiseAlertDialog(
    undefined,
    "chrome://calendar/content/calendar-event-dialog-timezone.xhtml",
    {
      async callback(timezoneWindow) {
        Assert.report(false, undefined, undefined, "Timezone dialog opened");
        await TestUtils.waitForCondition(
          () => Services.focus.activeWindow == timezoneWindow,
          "timezone dialog active"
        );

        const timezoneDocument = timezoneWindow.document;
        const timezoneMenulist = timezoneDocument.getElementById("timezone-menulist");
        const timezoneMenuitem = timezoneMenulist.querySelector(`[value="${timezone}"]`);

        const popupshown = BrowserTestUtils.waitForEvent(timezoneMenulist, "popupshown");
        synthesizeMouseAtCenter(timezoneMenulist, {}, timezoneWindow);
        await popupshown;

        timezoneMenuitem.scrollIntoView({ block: "start", behavior: "instant" });

        const popuphidden = BrowserTestUtils.waitForEvent(timezoneMenulist, "popuphidden");
        synthesizeMouseAtCenter(timezoneMenuitem, {}, timezoneWindow);
        await popuphidden;

        synthesizeMouseAtCenter(
          timezoneDocument.querySelector("dialog").getButton("accept"),
          {},
          timezoneWindow
        );
      },
    }
  );

  synthesizeMouseAtCenter(label, {}, iframeWindow);
  await shownPromise;

  synthesizeMouseAtCenter(customMenuitem, {}, iframeWindow);
  await dialogPromise;
  Assert.report(false, undefined, undefined, "Timezone dialog closed");

  await new Promise(resolve => iframeWindow.setTimeout(resolve, 500));
}

/**
 * Selects an item from a menulist.
 *
 * @param {Element} menulist
 * @param {string} value
 */
export async function menulistSelect(menulist, value) {
  const win = menulist.ownerGlobal;
  Assert.ok(menulist, `<menulist id=${menulist.id}> exists`);
  const menuitem = menulist.querySelector(`menupopup > menuitem[value='${value}']`);
  Assert.ok(menuitem, `<menuitem value=${value}> exists`);

  menulist.focus();

  const shownPromise = BrowserTestUtils.waitForEvent(menulist, "popupshown");
  synthesizeMouseAtCenter(menulist, {}, win);
  await shownPromise;

  const hiddenPromise = BrowserTestUtils.waitForEvent(menulist, "popuphidden");
  synthesizeMouseAtCenter(menuitem, {}, win);
  await hiddenPromise;

  await new Promise(resolve => win.setTimeout(resolve));
  Assert.equal(menulist.value, value);
}
