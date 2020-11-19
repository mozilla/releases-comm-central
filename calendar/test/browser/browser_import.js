/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// This tests importing an ICS file. Rather than using the UI to trigger the
// import, loadEventsFromFile is called directly.

/* globals loadEventsFromFile */

var { CALENDARNAME, controller, createCalendar, deleteCalendars } = ChromeUtils.import(
  "resource://testing-common/mozmill/CalendarUtils.jsm"
);

const { MockFilePicker } = ChromeUtils.import("resource://specialpowers/MockFilePicker.jsm");
const ChromeRegistry = Cc["@mozilla.org/chrome/chrome-registry;1"].getService(Ci.nsIChromeRegistry);

add_task(async () => {
  let chromeUrl = Services.io.newURI(getRootDirectory(gTestPath) + "data/import.ics");
  let fileUrl = ChromeRegistry.convertChromeURL(chromeUrl);
  let file = fileUrl.QueryInterface(Ci.nsIFileURL).file;

  MockFilePicker.init(window);
  MockFilePicker.setFiles([file]);
  MockFilePicker.returnValue = MockFilePicker.returnCancel;

  let calendarId = createCalendar(controller, CALENDARNAME);
  let calendar = cal.getCalendarManager().getCalendarById(calendarId);

  let cancelReturn = await loadEventsFromFile();
  ok(!cancelReturn, "loadEventsFromFile returns false on cancel");

  // Prepare to test the import dialog.
  MockFilePicker.returnValue = MockFilePicker.returnOK;

  let dialogWindowPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://calendar/content/calendar-ics-file-dialog.xhtml",
    async dialogWindow => {
      let doc = dialogWindow.document;
      let dialogElement = doc.querySelector("dialog");

      // Check the initial import dialog state.
      let displayedPath = doc.querySelector("#calendar-ics-file-dialog-file-path").value;
      let pathFragment = "browser/comm/calendar/test/browser/data/import.ics";
      if (Services.appinfo.OS == "WINNT") {
        pathFragment = pathFragment.replace(/\//g, "\\");
      }
      is(
        displayedPath.substring(displayedPath.length - pathFragment.length),
        pathFragment,
        "the displayed ics file path is correct"
      );

      let calendarMenu = doc.querySelector("#calendar-ics-file-dialog-calendar-menu");
      // 0 is the Home calendar.
      calendarMenu.selectedIndex = 1;
      let calendarMenuItems = calendarMenu.querySelectorAll("menuitem");
      is(calendarMenu.value, "Mozmill", "correct calendar name is selected");
      Assert.equal(calendarMenuItems.length, 2, "exactly two calendars are in the calendars menu");
      is(calendarMenuItems[1].selected, true, "calendar menu item is selected");

      let items = doc.querySelectorAll(".calendar-ics-file-dialog-item-frame");
      is(items.length, 4, "four calendar items are displayed");
      is(
        items[0].querySelector(".item-title").textContent,
        "Event One",
        "event 1 title should be correct"
      );
      is(
        items[1].querySelector(".item-title").textContent,
        "Event Two",
        "event 2 title should be correct"
      );
      is(
        items[2].querySelector(".item-title").textContent,
        "Event Three",
        "event 3 title should be correct"
      );
      is(
        items[3].querySelector(".item-title").textContent,
        "Event Four",
        "event 4 title should be correct"
      );
      is(
        items[0].querySelector(".item-date-row-start-date").textContent,
        cal.dtz.formatter.formatDateTime(cal.createDateTime("20190101T150000")),
        "event 1 start date should be correct"
      );
      is(
        items[0].querySelector(".item-date-row-end-date").textContent,
        cal.dtz.formatter.formatDateTime(cal.createDateTime("20190101T160000")),
        "event 1 end date should be correct"
      );
      is(
        items[1].querySelector(".item-date-row-start-date").textContent,
        cal.dtz.formatter.formatDateTime(cal.createDateTime("20190101T160000")),
        "event 2 start date should be correct"
      );
      is(
        items[1].querySelector(".item-date-row-end-date").textContent,
        cal.dtz.formatter.formatDateTime(cal.createDateTime("20190101T170000")),
        "event 2 end date should be correct"
      );
      is(
        items[2].querySelector(".item-date-row-start-date").textContent,
        cal.dtz.formatter.formatDateTime(cal.createDateTime("20190101T170000")),
        "event 3 start date should be correct"
      );
      is(
        items[2].querySelector(".item-date-row-end-date").textContent,
        cal.dtz.formatter.formatDateTime(cal.createDateTime("20190101T180000")),
        "event 3 end date should be correct"
      );
      is(
        items[3].querySelector(".item-date-row-start-date").textContent,
        cal.dtz.formatter.formatDateTime(cal.createDateTime("20190101T180000")),
        "event 4 start date should be correct"
      );
      is(
        items[3].querySelector(".item-date-row-end-date").textContent,
        cal.dtz.formatter.formatDateTime(cal.createDateTime("20190101T190000")),
        "event 4 end date should be correct"
      );

      // Import just the first item, and check that the correct number of items remains.
      let firstItemImportButton = items[0].querySelector(
        ".calendar-ics-file-dialog-item-import-button"
      );
      EventUtils.synthesizeMouseAtCenter(firstItemImportButton, { clickCount: 1 }, dialogWindow);

      let remainingItems = doc.querySelectorAll(".calendar-ics-file-dialog-item-frame");
      is(remainingItems.length, 3, "three items remain after importing the first item");
      is(
        remainingItems[0].querySelector(".item-title").textContent,
        "Event Two",
        "'Event Two' should now be the first item in the dialog"
      );

      let messageElement = doc.querySelector("#calendar-ics-file-dialog-message");

      // Set up an observer to wait for the import success message to appear,
      // before clicking the accept button again to close the dialog window.
      let observer = new MutationObserver(mutationList => {
        mutationList.forEach(async mutation => {
          if (mutation.attributeName == "value") {
            is(messageElement.value, "Successfully imported!", "import success message appeared");
            await new Promise(resolve => setTimeout(resolve));
            dialogElement.getButton("accept").click();
          }
        });
      });
      observer.observe(messageElement, { attributes: true });

      // Click the accept button to import the remaining items.
      dialogElement.getButton("accept").click();
    }
  );

  await loadEventsFromFile();
  await dialogWindowPromise;

  // Check that the items were actually successfully imported.
  let promiseCalendar = cal.async.promisifyCalendar(calendar);
  let result = await promiseCalendar.getItems(
    Ci.calICalendar.ITEM_FILTER_ALL_ITEMS,
    0,
    cal.createDateTime("20190101T000000"),
    cal.createDateTime("20190102T000000")
  );
  is(result.length, 4, "all items that were imported were in fact imported");

  for (let item of result) {
    await promiseCalendar.deleteItem(item);
  }

  MockFilePicker.cleanup();
});
