/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");
const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

add_setup(async function () {
  await CalendarTestUtils.setCalendarView(window, "day");
  CalendarTestUtils.goToDate(window, 2023, 2, 18);
});

add_task(async function testPastePreformattedWithLinebreak() {
  const calendar = CalendarTestUtils.createCalendar();

  // Create an event which currently has no description.
  const event = await calendar.addItem(
    new CalEvent(CalendarTestUtils.dedent`
      BEGIN:VEVENT
      SUMMARY:An event
      DTSTART:20230218T100000Z
      DTEND:20230218T110000Z
      END:VEVENT
    `)
  );

  // Remember event details so we can refetch it after editing.
  const eventId = event.id;
  const eventModified = event.lastModifiedTime;

  // Sanity check.
  Assert.equal(event.descriptionHTML, null, "event should not have an HTML description");
  Assert.equal(event.descriptionText, null, "event should not have a text description");

  // Open our event for editing.
  const { dialogWindow: eventWindow, iframeDocument } = await CalendarTestUtils.dayView.editEventAt(
    window,
    1
  );

  const editor = iframeDocument.getElementById("item-description");
  editor.focus();

  const expectedHTML =
    "<pre><code>This event is one which includes\nan explicit linebreak inside a pre tag.</code></pre>";

  // Create a paste which includes HTML data, which the editor will recognize as
  // HTML and paste with formatting by default.
  const stringData = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
  stringData.data = expectedHTML;

  const transferable = Cc["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);
  transferable.init(null);
  transferable.addDataFlavor("text/html");
  transferable.setTransferData("text/html", stringData);
  Services.clipboard.setData(transferable, null, Ci.nsIClipboard.kGlobalClipboard);

  // Paste.
  EventUtils.synthesizeKey("v", { accelKey: true }, eventWindow);

  await CalendarTestUtils.items.saveAndCloseItemDialog(eventWindow);

  await TestUtils.waitForCondition(async () => {
    const item = await calendar.getItem(eventId);
    return item.lastModifiedTime != eventModified;
  });

  const editedEvent = await calendar.getItem(eventId);

  // Verify that the description has been set appropriately. There should be no
  // change to the HTML, which is preformatted, and the text description should
  // include a linebreak in the same place as the HTML.
  Assert.equal(editedEvent.descriptionHTML, expectedHTML, "HTML description should match input");
  Assert.equal(
    editedEvent.descriptionText,
    "This event is one which includes\nan explicit linebreak inside a pre tag.",
    "text description should include linebreak"
  );

  CalendarTestUtils.removeCalendar(calendar);
});

add_task(async function testTypeLongTextWithLinebreaks() {
  const calendar = CalendarTestUtils.createCalendar();

  // Create an event which currently has no description.
  const event = await calendar.addItem(
    new CalEvent(CalendarTestUtils.dedent`
      BEGIN:VEVENT
      SUMMARY:An event
      DTSTART:20230218T100000Z
      DTEND:20230218T110000Z
      END:VEVENT
    `)
  );

  // Remember event details so we can refetch it after editing.
  const eventId = event.id;
  const eventModified = event.lastModifiedTime;

  // Sanity check.
  Assert.equal(event.descriptionHTML, null, "event should not have an HTML description");
  Assert.equal(event.descriptionText, null, "event should not have a text description");

  // Open our event for editing.
  const {
    dialogWindow: eventWindow,
    iframeDocument,
    iframeWindow,
  } = await CalendarTestUtils.dayView.editEventAt(window, 1);

  const editor = iframeDocument.getElementById("item-description");
  editor.focus();

  // Insert text with several long lines and explicit linebreaks.
  const firstLine =
    "This event is pretty much just plain text, albeit it has some pretty long lines so that we can ensure that we don't accidentally wrap it during conversion.";
  EventUtils.sendString(firstLine, iframeWindow);
  EventUtils.sendKey("RETURN", iframeWindow);

  const secondLine = "This line follows immediately after a linebreak.";
  EventUtils.sendString(secondLine, iframeWindow);
  EventUtils.sendKey("RETURN", iframeWindow);
  EventUtils.sendKey("RETURN", iframeWindow);

  const thirdLine =
    "And one after a couple more linebreaks, for good measure. It might as well be a fairly long string as well, just so we're certain.";
  EventUtils.sendString(thirdLine, iframeWindow);

  await CalendarTestUtils.items.saveAndCloseItemDialog(eventWindow);

  await TestUtils.waitForCondition(async () => {
    const item = await calendar.getItem(eventId);
    return item.lastModifiedTime != eventModified;
  });

  const editedEvent = await calendar.getItem(eventId);

  // Verify that the description has been set appropriately. The HTML should
  // match the input and use <br> as a linebreak, while the text should not be
  // wrapped and should use \n as a linebreak.
  Assert.equal(
    editedEvent.descriptionHTML,
    `${firstLine}<br>${secondLine}<br><br>${thirdLine}`,
    "HTML description should match input with <br> for linebreaks"
  );
  Assert.equal(
    editedEvent.descriptionText,
    `${firstLine}\n${secondLine}\n\n${thirdLine}`,
    "text description should match input with linebreaks"
  );

  CalendarTestUtils.removeCalendar(calendar);
});
