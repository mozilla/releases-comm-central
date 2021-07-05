/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {
  closeAllEventDialogs,
  controller,
  createCalendar,
  deleteCalendars,
  invokeNewEventDialog,
  invokeEditingEventDialog,
  switchToView,
} = ChromeUtils.import("resource://testing-common/calendar/CalendarUtils.jsm");
var { cancelItemDialog, saveAndCloseItemDialog, setData } = ChromeUtils.import(
  "resource://testing-common/calendar/ItemEditingHelpers.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var UTF8STRING = " 💣 💥  ☣  ";

add_task(async function testUTF8() {
  Services.prefs.setStringPref("calendar.categories.names", UTF8STRING);
  createCalendar(controller, UTF8STRING);
  switchToView(controller, "day");

  // Create new event.
  let eventBox = CalendarTestUtils.dayView.getHourBoxAt(controller.window, 8);
  await invokeNewEventDialog(window, eventBox, async (eventWindow, iframeWindow) => {
    // Fill in name, location, description.
    await setData(eventWindow, iframeWindow, {
      title: UTF8STRING,
      location: UTF8STRING,
      description: UTF8STRING,
      categories: [UTF8STRING],
    });
    await saveAndCloseItemDialog(eventWindow);
  });

  // open
  eventBox = await CalendarTestUtils.dayView.waitForEventBoxAt(controller.window, 1);
  await invokeEditingEventDialog(window, eventBox, (eventWindow, iframeWindow) => {
    let iframeDocument = iframeWindow.document;

    // Check values.
    Assert.equal(iframeDocument.getElementById("item-title").value, UTF8STRING);
    Assert.equal(iframeDocument.getElementById("item-location").value, UTF8STRING);
    // The trailing spaces confuse innerText, so we'll do this longhand
    let editorEl = iframeDocument.getElementById("item-description");
    let editor = editorEl.getEditor(editorEl.contentWindow);
    let description = editor.outputToString("text/plain", 0);
    Assert.equal(description, UTF8STRING);
    Assert.ok(
      iframeDocument
        .getElementById("item-categories")
        .querySelector(`menuitem[label="${UTF8STRING}"][checked]`)
    );

    // Escape the event window.
    cancelItemDialog(eventWindow);
  });

  Assert.ok(true, "Test ran to completion");
});

registerCleanupFunction(function teardownModule(module) {
  deleteCalendars(controller, UTF8STRING);
  Services.prefs.clearUserPref("calendar.categories.names");
  closeAllEventDialogs();
});
