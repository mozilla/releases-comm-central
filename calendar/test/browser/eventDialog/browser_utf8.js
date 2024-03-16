/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cancelItemDialog, saveAndCloseItemDialog, setData } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/ItemEditingHelpers.sys.mjs"
);

var UTF8STRING = " 💣 💥  ☣  ";

add_task(async function testUTF8() {
  const calendar = CalendarTestUtils.createCalendar();
  Services.prefs.setStringPref("calendar.categories.names", UTF8STRING);

  registerCleanupFunction(() => {
    CalendarTestUtils.removeCalendar(calendar);
    Services.prefs.clearUserPref("calendar.categories.names");
  });

  await CalendarTestUtils.setCalendarView(window, "day");

  // Create new event.
  const eventBox = CalendarTestUtils.dayView.getHourBoxAt(window, 8);
  const { dialogWindow, iframeWindow } = await CalendarTestUtils.editNewEvent(window, eventBox);
  // Fill in name, location, description.
  await setData(dialogWindow, iframeWindow, {
    title: UTF8STRING,
    location: UTF8STRING,
    description: UTF8STRING,
    categories: [UTF8STRING],
  });
  await saveAndCloseItemDialog(dialogWindow);

  // open
  const { dialogWindow: dlgWindow, iframeDocument } = await CalendarTestUtils.dayView.editEventAt(
    window,
    1
  );
  // Check values.
  Assert.equal(iframeDocument.getElementById("item-title").value, UTF8STRING);
  Assert.equal(iframeDocument.getElementById("item-location").value, UTF8STRING);
  // The trailing spaces confuse innerText, so we'll do this longhand
  const editorEl = iframeDocument.getElementById("item-description");
  const editor = editorEl.getEditor(editorEl.contentWindow);
  const description = editor.outputToString("text/plain", 0);
  // The HTML editor makes the first character a NBSP instead of a space.
  Assert.equal(description.replaceAll("\xA0", " "), UTF8STRING);
  Assert.ok(
    iframeDocument
      .getElementById("item-categories")
      .querySelector(`menuitem[label="${UTF8STRING}"][checked]`)
  );

  // Escape the event window.
  cancelItemDialog(dlgWindow);
});
