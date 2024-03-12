/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);

// If the "do you want to save the event?" prompt appears, the test failed.
// Listen for all windows opening, and if one is the save prompt, fail.
var savePromptObserver = {
  async observe(win, topic) {
    if (topic == "domwindowopened") {
      await BrowserTestUtils.waitForEvent(win, "load");
      // Make sure this is a prompt window.
      if (win.location.href == "chrome://global/content/commonDialog.xhtml") {
        const doc = win.document;
        // Adding attachments also shows a prompt, but we can tell which one
        // this is by checking whether the textbox is visible.
        if (doc.querySelector("#loginContainer").hasAttribute("hidden")) {
          Assert.report(true, undefined, undefined, "Unexpected save prompt appeared");
          doc.querySelector("dialog").getButton("cancel").click();
        }
      }
    }
  },
};
Services.ww.registerNotification(savePromptObserver);

const calendarViewsInitialState = CalendarTestUtils.saveCalendarViewsState(window);

registerCleanupFunction(async () => {
  Services.ww.unregisterNotification(savePromptObserver);
  await CalendarTestUtils.restoreCalendarViewsState(window, calendarViewsInitialState);
});

function openAttendeesWindow(eventWindowOrArgs) {
  const attendeesWindowPromise = BrowserTestUtils.promiseAlertDialogOpen(
    null,
    "chrome://calendar/content/calendar-event-dialog-attendees.xhtml",
    {
      async callback(win) {
        await new Promise(resolve => win.setTimeout(resolve));
      },
    }
  );

  if (Window.isInstance(eventWindowOrArgs)) {
    EventUtils.synthesizeMouseAtCenter(
      eventWindowOrArgs.document.getElementById("button-attendees"),
      {},
      eventWindowOrArgs
    );
  } else {
    openDialog(
      "chrome://calendar/content/calendar-event-dialog-attendees.xhtml",
      "_blank",
      "chrome,titlebar,resizable",
      eventWindowOrArgs
    );
  }
  return attendeesWindowPromise;
}

async function closeAttendeesWindow(attendeesWindow, buttonAction = "accept") {
  const closedPromise = BrowserTestUtils.domWindowClosed(attendeesWindow);
  const dialog = attendeesWindow.document.querySelector("dialog");
  dialog.getButton(buttonAction).click();
  await closedPromise;

  await new Promise(resolve => setTimeout(resolve));
}

function findAndFocusMatchingRow(attendeesWindow, message, matchFunction) {
  // Get the attendee row for which the input matches.
  const attendeeList = attendeesWindow.document.getElementById("attendee-list");
  const attendeeInput = Array.from(attendeeList.children)
    .map(child => child.querySelector("input"))
    .find(input => {
      return input ? matchFunction(input.value) : false;
    });
  Assert.ok(attendeeInput, message);

  attendeeInput.focus();

  return attendeeInput;
}

function findAndEditMatchingRow(attendeesWindow, newValue, message, matchFunction) {
  // Get the attendee row we wish to edit.
  const attendeeInput = findAndFocusMatchingRow(attendeesWindow, message, matchFunction);

  // Set the new value of the row. We set the input value directly due to issues
  // experienced trying to use simulated keystrokes.
  attendeeInput.value = newValue;
  attendeeInput.dispatchEvent(new Event("change"));
}
