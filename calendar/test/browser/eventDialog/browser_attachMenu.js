/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the attach menu in the event dialog window.
 */

const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
const { cloudFileAccounts } = ChromeUtils.importESModule(
  "resource:///modules/cloudFileAccounts.sys.mjs"
);
const { MockFilePicker } = ChromeUtils.importESModule(
  "resource://testing-common/MockFilePicker.sys.mjs"
);
var { saveAndCloseItemDialog, setData } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/ItemEditingHelpers.sys.mjs"
);

// Remove the save prompt observer that head.js added. It's causing trouble here.
Services.ww.unregisterNotification(savePromptObserver);

const calendar = CalendarTestUtils.createCalendar("Attachments");
registerCleanupFunction(() => {
  cal.manager.unregisterCalendar(calendar);
  MockFilePicker.cleanup();
});

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
  const promise = CalendarTestUtils.waitForEventDialog();
  EventUtils.synthesizeMouseAtCenter(eventBox, { clickCount: 2 });
  return promise;
}

/**
 * Tests using the "Website" menu item attaches a link to the event.
 */
add_task(async function testAttachWebPage() {
  const startDate = cal.createDateTime("20200101T000001Z");
  await CalendarTestUtils.setCalendarView(window, "month");
  window.goToDate(startDate);

  const { dialogWindow, iframeWindow, dialogDocument, iframeDocument } =
    await CalendarTestUtils.editNewEvent(window);

  await setData(dialogWindow, iframeWindow, {
    title: "Web Link Event",
    startDate,
  });

  // Attach the url.
  const attachButton = dialogWindow.document.querySelector("#button-url");
  Assert.ok(attachButton, "attach menu button found");

  const menu = dialogDocument.querySelector("#button-attach-menupopup");
  const menuShowing = BrowserTestUtils.waitForEvent(menu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(attachButton, {}, dialogWindow);
  await menuShowing;

  const url = "https://thunderbird.net/";
  const urlPrompt = BrowserTestUtils.promiseAlertDialogOpen(
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
    dialogDocument.querySelector("#button-attach-url"),
    {},
    dialogWindow
  );
  await urlPrompt;

  // Now check that the url shows in the attachments list.
  EventUtils.synthesizeMouseAtCenter(
    iframeDocument.querySelector("#event-grid-tab-attachments"),
    {},
    iframeWindow
  );

  const listBox = iframeDocument.querySelector("#attachment-link");
  await BrowserTestUtils.waitForCondition(
    () => listBox.itemChildren.length == 1,
    "attachment list did not show in time"
  );

  Assert.equal(listBox.itemChildren[0].tooltipText, url, "url included in attachments list");

  // Save the new event.
  await saveAndCloseItemDialog(dialogWindow);

  // Open the event to verify the attachment is shown in the summary dialog.
  const summaryWin = await openEventFromBox(await getEventBox("calendar-month-day-box-item"));
  const label = summaryWin.document.querySelector(`label[value="${url}"]`);
  Assert.ok(label, "attachment label found on calendar summary dialog");
  await BrowserTestUtils.closeWindow(summaryWin);

  // Clean up.
  const eventBox = await getEventBox("calendar-month-day-box-item");
  eventBox.focus();
  EventUtils.synthesizeKey("VK_DELETE", {});
});

/**
 * Tests selecting a provider from the attach menu works.
 */
add_task(async function testAttachProvider() {
  const fileUrl = "https://path/to/mock/file.pdf";
  const iconURL = "chrome://messenger/content/extension.svg";
  const provider = {
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
        uploadFile(window, aFile) {
          return new Promise(resolve =>
            setTimeout(() =>
              resolve({
                id: 1,
                path: aFile.path,
                size: aFile.fileSize,
                url: fileUrl,
                // The uploadFile() function should return serviceIcon, serviceName
                // and serviceUrl - either default or user defined values specified
                // by the onFileUpload event. The item-edit dialog uses only the
                // serviceIcon.
                serviceIcon: "chrome://messenger/skin/icons/globe.svg",
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

  const file = new FileUtils.File(getTestFilePath("data/guests.txt"));
  MockFilePicker.init(window.browsingContext);
  MockFilePicker.setFiles([file]);
  MockFilePicker.returnValue = MockFilePicker.returnOk;

  const startDate = cal.createDateTime("20200201T000001Z");
  await CalendarTestUtils.setCalendarView(window, "month");
  window.goToDate(startDate);

  const { dialogWindow, iframeWindow, dialogDocument, iframeDocument } =
    await CalendarTestUtils.editNewEvent(window);

  await setData(dialogWindow, iframeWindow, {
    title: "Provider Attachment Event",
    startDate,
  });

  const attachButton = dialogDocument.querySelector("#button-url");
  Assert.ok(attachButton, "attach menu button found");

  const menu = dialogDocument.querySelector("#button-attach-menupopup");
  let menuItem;

  await BrowserTestUtils.waitForCondition(() => {
    menuItem = menu.querySelector("menuitem[label='File using Mochitest Account']");
    return menuItem;
  });

  Assert.ok(menuItem, "custom provider menuitem found");
  Assert.equal(menuItem.image, iconURL, "provider image src is provider image");

  // Click on the "Attach" menu.
  const menuShowing = BrowserTestUtils.waitForEvent(menu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(attachButton, {}, dialogWindow);
  await menuShowing;

  // Click on the menuitem to attach a file using our provider.
  const menuHidden = BrowserTestUtils.waitForEvent(menu, "popuphidden");
  EventUtils.synthesizeMouseAtCenter(menuItem, {}, dialogWindow);
  await menuHidden;

  // Check if the file dialog was "shown". MockFilePicker.open() is asynchronous
  // but does not return a promise.
  await BrowserTestUtils.waitForCondition(
    () => MockFilePicker.shown,
    "file picker was not shown in time"
  );

  // Click on the attachments tab of the event dialog.
  EventUtils.synthesizeMouseAtCenter(
    iframeDocument.querySelector("#event-grid-tab-attachments"),
    {},
    iframeWindow
  );

  // Wait until the file we attached appears.
  const listBox = iframeDocument.querySelector("#attachment-link");
  await BrowserTestUtils.waitForCondition(
    () => listBox.itemChildren.length == 1,
    "attachment list did not show in time"
  );

  const listItem = listBox.itemChildren[0];

  // XXX: This property is set after an async operation. Unfortunately, that
  // operation is not awaited on in its surrounding code so the assertion
  // after this will occasionally fail if this is not done.
  await BrowserTestUtils.waitForCondition(
    () => listItem.attachCloudFileUpload,
    "attachCloudFileUpload property not set on attachment listitem in time."
  );

  Assert.equal(listItem.attachCloudFileUpload.url, fileUrl, "upload attached to event");

  const listItemImage = listItem.querySelector("img");
  Assert.equal(
    listItemImage.src,
    "chrome://messenger/skin/icons/globe.svg",
    "attachment image is provider image"
  );

  // Save the new event.
  dialogDocument.querySelector("#button-saveandclose").click();

  // Open it and verify the attachment is shown.
  const summaryWin = await openEventFromBox(await getEventBox("calendar-month-day-box-item"));
  const label = summaryWin.document.querySelector(`label[value="${fileUrl}"]`);
  Assert.ok(label, "attachment label found on calendar summary dialog");
  await BrowserTestUtils.closeWindow(summaryWin);

  if (Services.focus.activeWindow != window) {
    await BrowserTestUtils.waitForEvent(window, "focus");
  }

  // Clean up.
  const eventBox = await getEventBox("calendar-month-day-box-item");
  eventBox.focus();
  EventUtils.synthesizeKey("VK_DELETE", {});
});
