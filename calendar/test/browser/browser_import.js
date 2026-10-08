/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/** This tests importing/exporting an ICS file. */

const { MockFilePicker } = ChromeUtils.importESModule(
  "resource://testing-common/MockFilePicker.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
let calendar, file;

add_setup(async function () {
  await CalendarTestUtils.setCalendarView(window, "month");
  await CalendarTestUtils.goToDate(window, 2019, 1, 1);

  file = getChromeDir(getResolvedURI(gTestPath));
  file.append("data");
  file.append("import.ics");

  calendar = CalendarTestUtils.createCalendar();

  MockFilePicker.init(window.browsingContext);
  MockFilePicker.setFiles([file]);

  registerCleanupFunction(() => {
    CalendarTestUtils.removeCalendar(calendar);
    MockFilePicker.cleanup();
  });
});

/**
 * Open the calendar import tab.
 *
 * @returns {{win: Window, doc: Document}}
 */
async function openImportTab() {
  const tabOpenPromise = BrowserTestUtils.waitForEvent(tabmail.tabContainer, "TabOpen");
  window.goDoCommand("calendar_import_command");
  const {
    detail: { tabInfo },
  } = await tabOpenPromise;
  if (
    !tabInfo.browser.webProgress ||
    tabInfo.browser.webProgress.isLoadingDocument ||
    !tabInfo.browser.currentURI?.spec.startsWith("about:import")
  ) {
    await BrowserTestUtils.browserLoaded(tabInfo.browser);
  }
  const win = tabInfo.browser.contentWindow;
  const doc = tabInfo.browser.contentDocument;
  await SimpleTest.promiseFocus(win);
  return { win, doc };
}

add_task(async function () {
  Services.fog.testResetFOG();

  const { win, doc } = await openImportTab();
  const nextButton = doc.getElementById("calendarNextButton");
  const sourcesPane = doc.getElementById("calendar-sources");
  const itemsPane = doc.getElementById("calendar-items");
  const calendarsPane = doc.getElementById("calendar-calendars");
  const summaryPane = doc.getElementById("calendar-summary");

  Assert.ok(BrowserTestUtils.isVisible(sourcesPane));
  Assert.ok(BrowserTestUtils.isHidden(itemsPane));
  Assert.ok(BrowserTestUtils.isHidden(calendarsPane));
  Assert.ok(BrowserTestUtils.isHidden(summaryPane));

  EventUtils.synthesizeMouseAtCenter(nextButton, {}, win);
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(itemsPane),
    "waiting for the items pane to be visible"
  );
  Assert.ok(BrowserTestUtils.isHidden(sourcesPane));
  Assert.ok(BrowserTestUtils.isHidden(calendarsPane));
  Assert.ok(BrowserTestUtils.isHidden(summaryPane));

  // Check the initial import dialog state.
  Assert.equal(
    doc.getElementById("calendarSourcePath").textContent,
    file.path,
    "the displayed ics file path is correct"
  );

  const tree = doc.getElementById("calendarItemTree");
  await TestUtils.waitForCondition(
    () =>
      tree.getRowAtIndex(0)?.querySelector(".calendaritemtitle-column").textContent == "Event One",
    "the items should be listed"
  );
  Assert.equal(tree.view.rowCount, 4, "all four items should be listed");
  const formatter = new Services.intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "UTC",
  });
  const formatHour = hour => formatter.format(new Date(Date.UTC(2019, 0, 1, hour)));
  const expectedRows = [
    ["Event One", 15, 16],
    ["Event Två", 16, 17],
    ["Event Three", 17, 18],
    ["Event Four", 18, 19],
  ];
  for (const [i, [title, start, end]] of expectedRows.entries()) {
    const row = tree.view.rowAt(i);
    Assert.equal(row.getText("calendarItemTitle"), title, `row ${i} title should be correct`);
    Assert.equal(
      row.getText("calendarItemStart"),
      formatHour(start),
      `row ${i} start should be in the short date format`
    );
    Assert.equal(
      row.getText("calendarItemEnd"),
      formatHour(end),
      `row ${i} end should be in the short date format`
    );
    Assert.ok(row.hasProperty("import"), `row ${i} should be selected for import`);
  }
  Assert.ok(
    tree.getRowAtIndex(0).lastElementChild.querySelector("input[type=checkbox]").checked,
    "the last column should be the checked import checkbox"
  );

  const details = doc.getElementById("calendarItemDetails");
  await TestUtils.waitForCondition(
    () => details.querySelector(".item-title")?.textContent == "Event One",
    "the first item should be selected, and its details shown"
  );
  Assert.deepEqual(tree.selectedIndices, [0], "the first item should be selected");

  info("selecting an item to show its details");
  EventUtils.synthesizeMouseAtCenter(
    tree.getRowAtIndex(1).querySelector(".calendaritemtitle-column"),
    {},
    win
  );
  await TestUtils.waitForCondition(
    () => details.querySelector(".item-title")?.textContent == "Event Två",
    "the details of the selected item should be shown"
  );
  await TestUtils.waitForCondition(
    () =>
      details.querySelector(".item-date-row-start-date").textContent ==
      cal.dtz.formatter.formatDateTime(cal.createDateTime("20190101T160000")),
    "the details should show the start date"
  );
  Assert.equal(
    details.querySelector(".item-date-row-end-date").textContent,
    cal.dtz.formatter.formatDateTime(cal.createDateTime("20190101T170000")),
    "the details should show the end date"
  );

  info("toggling import of the selected item with the keyboard");
  const checkbox = tree.getRowAtIndex(1).lastElementChild.querySelector("input");
  EventUtils.synthesizeKey(" ", {}, win);
  Assert.ok(!tree.view.rowAt(1).hasProperty("import"), "space should deselect the item");
  await TestUtils.waitForCondition(() => !checkbox.checked, "the checkbox should be unchecked");
  EventUtils.synthesizeKey(" ", {}, win);
  Assert.ok(tree.view.rowAt(1).hasProperty("import"), "space should select the item again");
  await TestUtils.waitForCondition(() => checkbox.checked, "the checkbox should be checked");

  const filterInput = doc.getElementById("calendarFilter");
  const getListedTitles = () =>
    Array.from({ length: tree.view.rowCount }, (_, i) => tree.view.rowAt(i).item.title);
  async function check_filter(filterText, expectedTitles) {
    EventUtils.synthesizeMouseAtCenter(filterInput, {}, win);
    EventUtils.synthesizeKey("a", { accelKey: true }, win);
    if (filterText) {
      EventUtils.sendString(filterText, win);
    } else {
      EventUtils.synthesizeKey("KEY_Escape", {}, win);
    }

    await TestUtils.waitForCondition(
      () => tree.view.rowCount == expectedTitles.length,
      `filtering for "${filterText}" should list ${expectedTitles.length} items`
    );
    Assert.deepEqual(getListedTitles(), expectedTitles);
  }

  await check_filter("event", ["Event One", "Event Två", "Event Three", "Event Four"]);
  await check_filter("four", ["Event Four"]);
  await TestUtils.waitForCondition(
    () => details.querySelector(".item-title")?.textContent == "Event Four",
    "the first matching item should be selected, and its details shown"
  );
  await check_filter("no match", []);
  Assert.equal(details.childElementCount, 0, "no details should be shown without items");
  await check_filter("ONE", ["Event One"]);
  await check_filter(`"event t"`, ["Event Två", "Event Three"]);
  await check_filter("", ["Event One", "Event Två", "Event Three", "Event Four"]);

  info("sorting by title");
  const titleButton = doc.getElementById("calendarItemTitleButton");
  EventUtils.synthesizeMouseAtCenter(titleButton, {}, win);
  Assert.deepEqual(
    getListedTitles(),
    ["Event Four", "Event One", "Event Three", "Event Två"],
    "the items should be sorted by title"
  );
  EventUtils.synthesizeMouseAtCenter(titleButton, {}, win);
  Assert.deepEqual(
    getListedTitles(),
    ["Event Två", "Event Three", "Event One", "Event Four"],
    "the items should be sorted by title in reverse"
  );
  // Don't let the remembered sort order affect later tests.
  Services.xulStore.removeDocument(win.location.href.replace(/\?.*/, ""));

  EventUtils.synthesizeMouseAtCenter(doc.getElementById("calendarSelectAll"), {}, win);

  nextButton.scrollIntoView({ block: "start", behavior: "instant" });
  EventUtils.synthesizeMouseAtCenter(nextButton, {}, win);
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(calendarsPane),
    "waiting for the calendars pane to be visible"
  );
  Assert.ok(BrowserTestUtils.isHidden(sourcesPane));
  Assert.ok(BrowserTestUtils.isHidden(itemsPane));
  Assert.ok(BrowserTestUtils.isHidden(summaryPane));

  const calendarRadios = doc.querySelectorAll(`#calendar-calendars input[type="radio"]`);
  Assert.equal(calendarRadios.length, 2); // `calendar`, and "create a new calendar"
  Assert.equal(calendarRadios[0].value, calendar.id);
  EventUtils.synthesizeMouseAtCenter(calendarRadios[0], {}, win);

  EventUtils.synthesizeMouseAtCenter(nextButton, {}, win);
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(summaryPane),
    "waiting for the summary pane to be visible"
  );
  Assert.ok(BrowserTestUtils.isHidden(sourcesPane));
  Assert.ok(BrowserTestUtils.isHidden(itemsPane));
  Assert.ok(BrowserTestUtils.isHidden(calendarsPane));

  EventUtils.synthesizeMouseAtCenter(doc.getElementById("calendarStartImport"), {}, win);
  await TestUtils.waitForCondition(() => doc.querySelector("#tabPane-calendar.complete"));

  const tabClosePromise = BrowserTestUtils.waitForEvent(tabmail.tabContainer, "TabClose");
  EventUtils.synthesizeMouseAtCenter(summaryPane.querySelector("button.progressFinish"), {}, win);
  await tabClosePromise;

  const gleanEvents = Glean.mail.import.testGetValue();
  Assert.equal(gleanEvents.length, 1, "the import should have been recorded in telemetry");
  Assert.deepEqual(
    gleanEvents[0].extra,
    { importer: "calendar", result: "succeeded" },
    "the telemetry data should be correct"
  );

  // Check that the items were actually successfully imported.
  const result = await calendar.getItemsAsArray(
    Ci.calICalendar.ITEM_FILTER_ALL_ITEMS,
    0,
    cal.createDateTime("20190101T000000"),
    cal.createDateTime("20190102T000000")
  );
  is(result.length, 4, "all items that were imported were in fact imported");

  await CalendarTestUtils.monthView.waitForItemAt(window, 1, 3, 4);

  const context = document.getElementById("list-calendars-context-menu");

  // While we're here, make sure we can export the "Test" calendar as well.
  // First export the calendar as .ics
  const exportedFile = await IOUtils.getFile(PathUtils.tempDir, "export.ics");
  await IOUtils.remove(exportedFile.path, { ignoreAbsent: true });
  MockFilePicker.setFiles([exportedFile]);

  EventUtils.synthesizeMouseAtCenter(
    document.querySelector("#calendar-list li:nth-child(2)"),
    { type: "contextmenu" },
    window
  );
  await BrowserTestUtils.waitForPopupEvent(context, "shown");
  context.activateItem(document.getElementById("list-calendars-context-export"));

  await TestUtils.waitForCondition(() => exportedFile.exists());

  const icsExported = await IOUtils.readUTF8(exportedFile.path);
  Assert.stringContains(
    icsExported,
    "\r\nNAME:Test\r\n",
    "ics export should contain calendar NAME"
  );
  Assert.stringContains(
    icsExported,
    "\r\nX-WR-CALNAME:Test\r\n",
    "ics export should contain calendar X-WR-CALNAME"
  );

  // Then export the calendar as .html
  const exportedFile2 = await IOUtils.getFile(PathUtils.tempDir, "export.html");
  await IOUtils.remove(exportedFile2.path, { ignoreAbsent: true });
  MockFilePicker.reset();
  MockFilePicker.showCallback = picker => {
    picker.filterIndex = 0; // .html
  };

  MockFilePicker.setFiles([exportedFile2]);
  EventUtils.synthesizeMouseAtCenter(
    document.querySelector("#calendar-list li:nth-child(2)"),
    { type: "contextmenu" },
    window
  );
  await BrowserTestUtils.waitForPopupEvent(context, "shown");
  context.activateItem(document.getElementById("list-calendars-context-export"));

  await TestUtils.waitForCondition(() => exportedFile2.exists());

  const htmlExported = await IOUtils.readUTF8(exportedFile2.path);
  Assert.stringContains(
    htmlExported,
    '<title id="title">Test</title>',
    "html export should contain calendar NAME"
  );
  Assert.stringContains(
    htmlExported,
    '<div class="value summary">Event Två</div>',
    "html export should contain event data"
  );

  for (const item of result) {
    await calendar.deleteItem(item);
  }
});

add_task(async function testManyItems() {
  const titles = [];
  for (let i = 1; i <= 60; i++) {
    titles.push(`Many ${String(i).padStart(2, "0")}`);
  }
  const events = titles.map(
    (title, i) => `BEGIN:VEVENT
UID:many-${i}@example.com
DTSTAMP:20190101T000000Z
DTSTART:20190102T100000Z
DTEND:20190102T110000Z
SUMMARY:${title}
END:VEVENT`
  );
  const manyPath = await IOUtils.createUniqueFile(PathUtils.tempDir, "many.ics");
  registerCleanupFunction(() => IOUtils.remove(manyPath));
  const manyFile = await IOUtils.getFile(manyPath);
  await IOUtils.writeUTF8(
    manyPath,
    ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Test//EN", ...events, "END:VCALENDAR"].join(
      "\r\n"
    )
  );
  MockFilePicker.reset();
  MockFilePicker.setFiles([manyFile]);

  const { win, doc } = await openImportTab();
  const nextButton = doc.getElementById("calendarNextButton");
  EventUtils.synthesizeMouseAtCenter(nextButton, {}, win);

  const tree = doc.getElementById("calendarItemTree");
  await TestUtils.waitForCondition(() => tree.view?.rowCount == 60, "all items should be listed");
  await TestUtils.waitForCondition(
    () => doc.getElementById("calendarItemsCount").textContent == "The file contains 60 items.",
    "the number of items should be shown"
  );
  const getListedTitles = () => tree.view._rowMap.map(r => r.item.title);
  const getSelectedTitles = () =>
    [...win.calendarController._selectedItems].map(item => item.title).sort();

  info("deselecting all");
  EventUtils.synthesizeMouseAtCenter(doc.getElementById("calendarDeselectAll"), {}, win);
  Assert.deepEqual(getSelectedTitles(), [], "no item should be selected");
  Assert.ok(nextButton.disabled, "continue should be disabled with no selected items");

  info("filtering, then selecting all listed items");
  const filterInput = doc.getElementById("calendarFilter");
  EventUtils.synthesizeMouseAtCenter(filterInput, {}, win);
  EventUtils.sendString(`"many 5"`, win);
  await TestUtils.waitForCondition(
    () => tree.view.rowCount == 10,
    "matching items should be listed"
  );
  Assert.deepEqual(getListedTitles(), titles.slice(49, 59), "the matching items should be listed");
  EventUtils.synthesizeMouseAtCenter(doc.getElementById("calendarSelectAll"), {}, win);
  Assert.deepEqual(
    getSelectedTitles(),
    titles.slice(49, 59),
    "only the listed items should be selected"
  );
  Assert.ok(!nextButton.disabled, "continue should be enabled");

  info("clearing the filter");
  EventUtils.synthesizeMouseAtCenter(filterInput, {}, win);
  EventUtils.synthesizeKey("a", { accelKey: true }, win);
  EventUtils.synthesizeKey("KEY_Escape", {}, win);
  await TestUtils.waitForCondition(
    () => tree.view.rowCount == 60,
    "all items should be listed again"
  );
  Assert.deepEqual(getSelectedTitles(), titles.slice(49, 59), "the selection should be kept");
  Assert.ok(!tree.view.rowAt(0).hasProperty("import"), "the first item should not be selected");
  Assert.ok(tree.view.rowAt(49).hasProperty("import"), "the 50th item should be selected");

  nextButton.scrollIntoView({ block: "start", behavior: "instant" });
  EventUtils.synthesizeMouseAtCenter(nextButton, {}, win);
  const calendarsPane = doc.getElementById("calendar-calendars");
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(calendarsPane),
    "waiting for the calendars pane to be visible"
  );
  EventUtils.synthesizeMouseAtCenter(
    doc.querySelector(`#calendar-calendars input[value="${calendar.id}"]`),
    {},
    win
  );
  EventUtils.synthesizeMouseAtCenter(nextButton, {}, win);
  const summaryPane = doc.getElementById("calendar-summary");
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(summaryPane),
    "waiting for the summary pane to be visible"
  );
  EventUtils.synthesizeMouseAtCenter(doc.getElementById("calendarStartImport"), {}, win);
  await TestUtils.waitForCondition(() => doc.querySelector("#tabPane-calendar.complete"));

  const tabClosePromise = BrowserTestUtils.waitForEvent(tabmail.tabContainer, "TabClose");
  EventUtils.synthesizeMouseAtCenter(summaryPane.querySelector("button.progressFinish"), {}, win);
  await tabClosePromise;

  const result = await calendar.getItemsAsArray(
    Ci.calICalendar.ITEM_FILTER_ALL_ITEMS,
    0,
    cal.createDateTime("20190102T000000"),
    cal.createDateTime("20190103T000000")
  );
  Assert.deepEqual(
    result.map(item => item.title).sort(),
    titles.slice(49, 59),
    "only the selected items should be imported"
  );
  for (const item of result) {
    await calendar.deleteItem(item);
  }
});
