/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for drag and drop on the today pane.
 */
const { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
const {
  add_message_to_folder,
  be_in_folder,
  create_folder,
  create_message,
  inboxFolder,
  select_click_row,
} = ChromeUtils.import("resource://testing-common/mozmill/FolderDisplayHelpers.jsm");
const { SyntheticPartLeaf } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);

const calendar = CalendarTestUtils.createProxyCalendar("Mochitest", "memory");
registerCleanupFunction(() => CalendarTestUtils.removeProxyCalendar(calendar));

/**
 * Ensures the today pane is visible for each test.
 */
async function ensureTodayPane() {
  let todayPane = document.querySelector("#today-pane-panel");
  if (!todayPane.isVisible()) {
    todayPane.setVisible(true, true, true);
  }

  await TestUtils.waitForCondition(() => todayPane.isVisible(), "today pane not visible in time");
}

/**
 * Tests dropping a message from the message pane on to the today pane brings
 * up the new event dialog.
 */
add_task(async function testDropMozMessage() {
  let folder = create_folder("Mochitest");
  let subject = "The Grand Event";
  let body = "Parking is available.";
  be_in_folder(folder);
  add_message_to_folder(folder, create_message({ subject, body: { body } }));
  select_click_row(0);

  let [msgStr] = window.gFolderDisplay.selectedMessageUris;
  let msgUrl = window.messenger.messageServiceFromURI(msgStr).getUrlForUri(msgStr);

  // Setup a DataTransfer to mimic what ThreadPaneOnDragStart sends.
  let dataTransfer = new DataTransfer();
  dataTransfer.mozSetDataAt("text/x-moz-message", msgStr, 0);
  dataTransfer.mozSetDataAt("text/x-moz-url", msgUrl.spec, 0);
  dataTransfer.mozSetDataAt(
    "application/x-moz-file-promise-url",
    msgUrl.spec + "?fileName=" + encodeURIComponent("message.eml"),
    0
  );
  dataTransfer.mozSetDataAt(
    "application/x-moz-file-promise",
    new window.messageFlavorDataProvider(),
    0
  );

  let promise = CalendarTestUtils.waitForEventDialog("edit");
  await ensureTodayPane();
  window.document
    .querySelector("#agenda-listbox")
    .dispatchEvent(new DragEvent("drop", { dataTransfer }));

  let eventWindow = await promise;
  let iframe = eventWindow.document.querySelector("#calendar-item-panel-iframe");
  let iframeDoc = iframe.contentDocument;

  Assert.equal(
    iframeDoc.querySelector("#item-title").value,
    subject,
    "the message subject was used as the event title"
  );
  Assert.equal(
    iframeDoc.querySelector("#item-description").contentDocument.body.innerText,
    body,
    "the message body was used as the event description"
  );

  await BrowserTestUtils.closeWindow(eventWindow);
  be_in_folder(inboxFolder);
  folder.deleteSelf(null);
});

/**
 * Tests dropping an entry from the address book adds the address as an attendee
 * to a new event when dropped on the today pane.
 */
add_task(async function testMozAddressDrop() {
  let vcard = CalendarTestUtils.dedent`
  BEGIN:VCARD
  VERSION:4.0
  EMAIL;PREF=1:person@example.com
  FN:Some Person
  N:Some;Person;;;
  UID:d5f9113d-5ede-4a5c-ba8e-0f2345369993
  END:VCARD
  `;

  let address = "Some Person <person@example.com>";

  // Setup a DataTransfer to mimic what the address book sends.
  let dataTransfer = new DataTransfer();
  dataTransfer.setData("moz/abcard", "0");
  dataTransfer.setData("text/x-moz-address", address);
  dataTransfer.setData("text/unicode", address);
  dataTransfer.setData("text/vcard", decodeURIComponent(vcard));
  dataTransfer.setData("application/x-moz-file-promise-dest-filename", "person.vcf");
  dataTransfer.setData("application/x-moz-file-promise-url", "data:text/vcard," + vcard);
  dataTransfer.setData("application/x-moz-file-promise", window.abFlavorDataProvider);

  let promise = CalendarTestUtils.waitForEventDialog("edit");
  await ensureTodayPane();
  window.document
    .querySelector("#agenda-listbox")
    .dispatchEvent(new DragEvent("drop", { dataTransfer }));

  let eventWindow = await promise;
  let iframe = eventWindow.document.querySelector("#calendar-item-panel-iframe");
  let iframeWin = iframe.cotnentWindow;
  let iframeDoc = iframe.contentDocument;

  // Verify the address was added as an attendee.
  EventUtils.synthesizeMouseAtCenter(
    iframeDoc.querySelector("#event-grid-tab-attendees"),
    {},
    iframeWin
  );

  let box = iframeDoc.querySelector('[attendeeid="mailto:person@example.com"]');
  Assert.ok(box, "address included as an attendee to the new event");
  await BrowserTestUtils.closeWindow(eventWindow);
});

/**
 * Tests dropping plain text that is actually ics data format is picked up by
 * the today pane.
 */
add_task(async function testPlainTextICSDrop() {
  let event = CalendarTestUtils.dedent`
  BEGIN:VCALENDAR
  BEGIN:VEVENT
  SUMMARY:An Event
  DESCRIPTION:Parking is not available.
  DTSTART:20210325T110000Z
  DTEND:20210325T120000Z
  UID:916bd967-35ac-40f6-8cd5-487739c9d245
  END:VEVENT
  END:VCALENDAR
  `;

  // Setup a DataTransfer to mimic what the address book sends.
  let dataTransfer = new DataTransfer();
  dataTransfer.setData("text/plain", event);

  let promise = CalendarTestUtils.waitForEventDialog("edit");
  await ensureTodayPane();
  window.document
    .querySelector("#agenda-listbox")
    .dispatchEvent(new DragEvent("drop", { dataTransfer }));

  let eventWindow = await promise;
  let iframe = eventWindow.document.querySelector("#calendar-item-panel-iframe");
  let iframeDoc = iframe.contentDocument;
  Assert.equal(iframeDoc.querySelector("#item-title").value, "An Event");

  let startTime = iframeDoc.querySelector("#event-starttime").value;
  Assert.equal(startTime.getUTCFullYear(), 2021);
  Assert.equal(startTime.getUTCMonth(), 2);
  Assert.equal(startTime.getUTCDate(), 25);

  let endTime = iframeDoc.querySelector("#event-endtime").value;
  Assert.equal(endTime.getUTCFullYear(), 2021);
  Assert.equal(endTime.getUTCMonth(), 2);
  Assert.equal(endTime.getUTCDate(), 25);

  Assert.equal(
    iframeDoc.querySelector("#item-description").contentDocument.body.innerText,
    "Parking is not available."
  );
  await BrowserTestUtils.closeWindow(eventWindow);
});

/**
 * Tests dropping a file with an ics extension on the today pane is parsed as an
 * ics file.
 */
add_task(async function testICSFileDrop() {
  let file = await File.createFromFileName(getTestFilePath("data/event.ics"));
  let dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);

  let promise = CalendarTestUtils.waitForEventDialog("edit");
  await ensureTodayPane();

  // For some reason, dataTransfer.items.add() results in a mozItemCount of 2
  // instead of one. Call onExternalDrop directly to get around that.
  window.calendarCalendarButtonDNDObserver.onExternalDrop(dataTransfer);

  let eventWindow = await promise;
  let iframe = eventWindow.document.querySelector("#calendar-item-panel-iframe");
  let iframeDoc = iframe.contentDocument;

  Assert.equal(iframeDoc.querySelector("#item-title").value, "An Event");

  let startTime = iframeDoc.querySelector("#event-starttime").value;
  Assert.equal(startTime.getUTCFullYear(), 2021);
  Assert.equal(startTime.getUTCMonth(), 2);
  Assert.equal(startTime.getUTCDate(), 25);

  let endTime = iframeDoc.querySelector("#event-endtime").value;
  Assert.equal(endTime.getUTCFullYear(), 2021);
  Assert.equal(endTime.getUTCMonth(), 2);
  Assert.equal(endTime.getUTCDate(), 25);

  Assert.equal(
    iframeDoc.querySelector("#item-description").contentDocument.body.innerText,
    "Parking is not available."
  );
  await BrowserTestUtils.closeWindow(eventWindow);
});

/**
 * Tests dropping any other file on the today pane ends up as an attachment
 * to a new event.
 */
add_task(async function testOtherFileDrop() {
  let file = await File.createFromNsIFile(
    new FileUtils.File(getTestFilePath("data/attachment.png"))
  );
  let dataTransfer = new DataTransfer();
  dataTransfer.setData("image/png", file);
  dataTransfer.items.add(file);

  let promise = CalendarTestUtils.waitForEventDialog("edit");
  await ensureTodayPane();
  window.document
    .querySelector("#agenda-listbox")
    .dispatchEvent(new DragEvent("drop", { dataTransfer }));

  let eventWindow = await promise;
  let iframe = eventWindow.document.querySelector("#calendar-item-panel-iframe");
  let iframeWin = iframe.contentWindow;
  let iframeDoc = iframe.contentDocument;

  EventUtils.synthesizeMouseAtCenter(
    iframeDoc.querySelector("#event-grid-tab-attachments"),
    {},
    iframeWin
  );

  let listBox = iframeDoc.querySelector("#attachment-link");
  let listItem = listBox.itemChildren[0];
  Assert.equal(listItem.querySelector("label").value, "attachment.png");
  await BrowserTestUtils.closeWindow(eventWindow);
});
