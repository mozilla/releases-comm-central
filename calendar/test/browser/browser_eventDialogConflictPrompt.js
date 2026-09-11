/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { saveAndCloseItemDialog, setData } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/ItemEditingHelpers.sys.mjs"
);
var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

var { dayView } = CalendarTestUtils;

const calendar = CalendarTestUtils.createCalendar();
registerCleanupFunction(() => {
  CalendarTestUtils.removeCalendar(calendar);
});

/**
 * An item modified outside the open event dialog, while the dialog holds local
 * changes of its own, should prompt for which set of changes to keep.
 */
add_task(async function testModificationConflictPrompt() {
  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2009, 1, 1);

  let { dialogWindow, iframeWindow } = await CalendarTestUtils.editNewEvent(
    window,
    dayView.getHourBoxAt(window, 8)
  );
  await setData(dialogWindow, iframeWindow, { title: "original title" });
  await saveAndCloseItemDialog(dialogWindow);

  const eventbox = await dayView.waitForEventBoxAt(window, 1);

  // Re-open the event and give the dialog an unsaved local change.
  ({ dialogWindow, iframeWindow } = await CalendarTestUtils.editItem(window, eventbox));
  await setData(dialogWindow, iframeWindow, { title: "local title" });

  const [item] = await calendar.getItemsAsArray(
    Ci.calICalendar.ITEM_FILTER_ALL_ITEMS,
    0,
    cal.createDateTime("20090101T000000Z"),
    cal.createDateTime("20090102T000000Z")
  );
  const modifiedItem = item.clone();
  modifiedItem.title = "external title";

  // Dismissing the prompt discards the dialog's local changes, so the dialog
  // should reload with the externally modified item.
  const promptPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://global/content/commonDialog.xhtml",
    {
      callback(win) {
        const dialog = win.document.querySelector("dialog");
        const l10n = new Localization(["calendar/calendar.ftl"], true);
        Assert.equal(
          win.document.title,
          l10n.formatValueSync("modify-conflict-prompt-title"),
          "the prompt title should be the modification conflict title"
        );
        dialog.getButton("cancel").click();
      },
    }
  );
  await calendar.modifyItem(modifiedItem, item);
  await promptPromise;

  const titleInput = iframeWindow.document.getElementById("item-title");
  await TestUtils.waitForCondition(
    () => titleInput.value == "external title",
    "the dialog should have reloaded with the externally modified title"
  );

  const dialogClosed = BrowserTestUtils.domWindowClosed(dialogWindow);
  EventUtils.synthesizeKey("KEY_Escape", {}, dialogWindow);
  await dialogClosed;
});
