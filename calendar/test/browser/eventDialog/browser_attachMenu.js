/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the attach menu in the event dialog window.
 */

const { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
const { cloudFileAccounts } = ChromeUtils.import("resource:///modules/cloudFileAccounts.jsm");
const { MockFilePicker } = ChromeUtils.import("resource://specialpowers/MockFilePicker.jsm");

let manager = cal.getCalendarManager();
let _calendar = manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
_calendar.name = "Attachments";
manager.registerCalendar(_calendar);

// Remove the save prompt observer that head.js added. It's causing trouble here.
Services.ww.unregisterNotification(savePromptObserver);

registerCleanupFunction(() => {
  manager.unregisterCalendar(_calendar);
});

let calendar = cal.async.promisifyCalendar(_calendar);

async function getEventBox(selector) {
  let itemBox;
  await TestUtils.waitForCondition(() => {
    itemBox = document.querySelector(selector);
    return itemBox != null;
  }, "calendar item did not appear in time");
  return itemBox;
}

async function openEventFromBox(eventBox) {
  if (Services.focus.activeWindow != window) {
    await BrowserTestUtils.waitForEvent(window, "focus");
  }
  let promise = CalendarTestUtils.waitForEventDialog();
  EventUtils.synthesizeMouseAtCenter(eventBox, { clickCount: 2 });
  return promise;
}

/**
 * Tests using the "Website" menu item attaches a link to the event.
 */
add_task(async function testAttachWebPage() {
  let startDate = cal.createDateTime("20200101T000001Z");
  await CalendarTestUtils.setCalendarView(window, "month");
  window.goToDate(startDate);

  let getEventWin = CalendarTestUtils.waitForEventDialog("edit");
  window.goDoCommand("calendar_new_event_command");

  let eventWin = await getEventWin;

  // Give the new event a title.
  let iframe = eventWin.document.querySelector("#calendar-item-panel-iframe");
  let titleElement = iframe.contentDocument.querySelector("#item-title");
  EventUtils.synthesizeMouseAtCenter(titleElement, {}, iframe.contentWindow);
  EventUtils.sendString("Web Link Event", iframe.contentWindow);

  // Set its date.
  iframe.contentDocument.querySelector("#event-starttime").value = cal.dtz.dateTimeToJsDate(
    startDate
  );

  // Attach the url.
  let attachButton = eventWin.document.querySelector("#button-url");
  Assert.ok(attachButton, "attach menu button found");

  let menu = eventWin.document.querySelector("#button-attach-menupopup");
  let menuShowing = BrowserTestUtils.waitForEvent(menu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(attachButton, {}, eventWin);
  await menuShowing;

  let url = "https://thunderbird.net/";
  let urlPrompt = BrowserTestUtils.promiseAlertDialogOpen(
    "",
    "chrome://global/content/commonDialog.xhtml",
    {
      async callback(win) {
        win.document.querySelector("#loginTextbox").value = url;
        EventUtils.synthesizeKey("VK_RETURN", {}, win);
      },
    }
  );
  EventUtils.synthesizeMouseAtCenter(
    eventWin.document.querySelector("#button-attach-url"),
    {},
    eventWin
  );
  await urlPrompt;

  // Now check that the url shows in the attachments list.
  EventUtils.synthesizeMouseAtCenter(
    iframe.contentDocument.querySelector("#event-grid-tab-attachments"),
    {}
  );

  let listBox = iframe.contentDocument.querySelector("#attachment-link");
  await BrowserTestUtils.waitForCondition(
    () => listBox.itemChildren.length == 1,
    "attachment list did not show in time"
  );

  Assert.equal(listBox.itemChildren[0].tooltipText, url, "url included in attachments list");

  // Save the new event.
  eventWin.document.querySelector("#button-saveandclose").click();

  // Open the event to verify the attachment is shown in the summary dialog.
  let summaryWin = await openEventFromBox(await getEventBox("calendar-month-day-box-item"));
  let label = summaryWin.document.querySelector(`label[value="${url}"]`);
  Assert.ok(label, "attachment label found on calendar summary dialog");
  await BrowserTestUtils.closeWindow(summaryWin);

  // Clean up.
  let eventBox = await getEventBox("calendar-month-day-box-item");
  eventBox.focus();
  EventUtils.synthesizeKey("VK_DELETE", {});
  await CalendarTestUtils.closeCalendarTab(window);
});

/**
 * Tests selecting a provider from the attach menu works.
 */
add_task(async function testAttachProvider() {
  let fileUrl = "http://path/to/mock/file.pdf";
  let iconURL = "chrome://messenger/content/extension.svg";
  let provider = {
    type: "Mochitest",
    displayName: "Mochitest",
    iconURL,
    initAccount(accountKey) {
      return {
        accountKey,
        type: "Mochitest",
        get displayName() {
          return Services.prefs.getCharPref(
            `mail.cloud_files.accounts.${this.accountKey}.displayName`,
            "Mochitest Account"
          );
        },
        iconURL,
        configured: true,
        managementURL: "",
        uploadFile() {
          return new Promise(resolve =>
            setTimeout(() =>
              resolve({
                url: fileUrl,
              })
            )
          );
        },
      };
    },
  };

  cloudFileAccounts.registerProvider("Mochitest", provider);
  cloudFileAccounts.createAccount("Mochitest");
  registerCleanupFunction(() => {
    cloudFileAccounts.unregisterProvider("Mochitest");
  });

  let file = new FileUtils.File(getTestFilePath("data/guests.txt"));
  MockFilePicker.init(window);
  MockFilePicker.setFiles([file]);
  MockFilePicker.returnValue = MockFilePicker.returnOk;

  let startDate = cal.createDateTime("20200201T000001Z");
  await CalendarTestUtils.setCalendarView(window, "month");
  window.goToDate(startDate);

  let getEventWin = CalendarTestUtils.waitForEventDialog("edit");
  window.goDoCommand("calendar_new_event_command");

  let eventWin = await getEventWin;

  // Give the new event a title.
  let iframe = eventWin.document.querySelector("#calendar-item-panel-iframe");
  let titleElement = iframe.contentDocument.querySelector("#item-title");
  EventUtils.synthesizeMouseAtCenter(titleElement, {}, iframe.contentWindow);
  EventUtils.sendString("Provider Attachment Event", iframe.contentWindow);

  // Set its date.
  iframe.contentDocument.querySelector("#event-starttime").value = cal.dtz.dateTimeToJsDate(
    startDate
  );

  let attachButton = eventWin.document.querySelector("#button-url");
  Assert.ok(attachButton, "attach menu button found");

  let menu = eventWin.document.querySelector("#button-attach-menupopup");
  let menuItem;

  await BrowserTestUtils.waitForCondition(() => {
    menuItem = menu.querySelector("menuitem[label='File using Mochitest Account']");
    return menuItem;
  });

  Assert.ok(menuItem, "custom provider menuitem found");
  Assert.equal(menuItem.image, iconURL, "provider image src is provider image");

  // Click on the "Attach" menu.
  let menuShowing = BrowserTestUtils.waitForEvent(menu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(attachButton, {}, eventWin);
  await menuShowing;

  // Click on the menuitem to attach a file using our provider.
  let menuHidden = BrowserTestUtils.waitForEvent(menu, "popuphidden");
  EventUtils.synthesizeMouseAtCenter(menuItem, {}, eventWin);
  await menuHidden;

  // Check if the file dialog was "shown". MockFilePicker.open() is asynchronous
  // but does not return a promise.
  await BrowserTestUtils.waitForCondition(
    () => MockFilePicker.shown,
    "file picker was not shown in time"
  );

  // Click on the attachments tab of the event dialog.
  iframe = eventWin.document.querySelector("#calendar-item-panel-iframe");
  EventUtils.synthesizeMouseAtCenter(
    iframe.contentDocument.querySelector("#event-grid-tab-attachments"),
    {},
    iframe.contentWindow
  );

  // Wait until the file we attached appears.
  let listBox = iframe.contentDocument.querySelector("#attachment-link");
  await BrowserTestUtils.waitForCondition(
    () => listBox.itemChildren.length == 1,
    "attachment list did not show in time"
  );

  let listItem = listBox.itemChildren[0];

  // XXX: This property is set after an async operation. Unfortunately, that
  // operation is not awaited on in its surrounding code so the assertion
  // after this will occasionally fail if this is not done.
  await BrowserTestUtils.waitForCondition(
    () => listItem.attachCloudFileUpload,
    "attachCloudFileUpload property not set on attachment listitem in time."
  );

  Assert.equal(listItem.attachCloudFileUpload.url, fileUrl, "upload attached to event");

  let listItemImage = listItem.querySelector("img");
  Assert.equal(listItemImage.src, iconURL, "attachment image is provider image");

  // Save the new event.
  eventWin.document.querySelector("#button-saveandclose").click();

  // Open it and verify the attachment is shown.
  let summaryWin = await openEventFromBox(await getEventBox("calendar-month-day-box-item"));
  let label = summaryWin.document.querySelector(`label[value="${fileUrl}"]`);
  Assert.ok(label, "attachment label found on calendar summary dialog");
  await BrowserTestUtils.closeWindow(summaryWin);

  if (Services.focus.activeWindow != window) {
    await BrowserTestUtils.waitForEvent(window, "focus");
  }

  // Clean up.
  let eventBox = await getEventBox("calendar-month-day-box-item");
  eventBox.focus();
  EventUtils.synthesizeKey("VK_DELETE", {});
  await CalendarTestUtils.closeCalendarTab(window);
});

registerCleanupFunction(() => {
  MockFilePicker.cleanup();
});
