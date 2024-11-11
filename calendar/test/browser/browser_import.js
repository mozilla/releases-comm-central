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

add_task(async function () {
  const tabOpenPromise = BrowserTestUtils.waitForEvent(tabmail.tabContainer, "TabOpen");
  window.goDoCommand("calendar_import_command");
  const {
    detail: { tabInfo },
  } = await tabOpenPromise;
  if (
    tabInfo.browser.docShell?.isLoadingDocument ||
    !tabInfo.browser.currentURI?.spec.startsWith("about:import")
  ) {
    await BrowserTestUtils.browserLoaded(tabInfo.browser);
  }
  const win = tabInfo.browser.contentWindow;
  const doc = tabInfo.browser.contentDocument;
  await SimpleTest.promiseFocus(win);

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

  const itemList = doc.getElementById("calendar-item-list");
  const items = itemList.getElementsByTagName("calendar-item-summary");
  await TestUtils.waitForCondition(() => {
    return items.length == 4;
  }, "four calendar items are displayed");
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

  const filterInput = doc.getElementById("calendarFilter");
  async function check_filter(filterText, expectedTitles) {
    EventUtils.synthesizeMouseAtCenter(filterInput, {}, win);
    EventUtils.synthesizeKey("a", { accelKey: true }, win);
    if (filterText) {
      EventUtils.sendString(filterText, win);
    } else {
      EventUtils.synthesizeKey("KEY_Escape", {}, win);
    }

    let visibleItems;
    await TestUtils.waitForCondition(() => {
      visibleItems = [...items].filter(summary => !summary.parentNode.hidden);
      return visibleItems.length == expectedTitles.length;
    });
    Assert.deepEqual(
      visibleItems.map(summary => summary.item.title),
      expectedTitles
    );
  }

  await check_filter("event", ["Event One", "Event Two", "Event Three", "Event Four"]);
  await check_filter("four", ["Event Four"]);
  await check_filter("no match", []);
  await check_filter("ONE", ["Event One"]);
  await check_filter(`"event t"`, ["Event Two", "Event Three"]);
  await check_filter("", ["Event One", "Event Two", "Event Three", "Event Four"]);

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

  // Check that the items were actually successfully imported.
  const result = await calendar.getItemsAsArray(
    Ci.calICalendar.ITEM_FILTER_ALL_ITEMS,
    0,
    cal.createDateTime("20190101T000000"),
    cal.createDateTime("20190102T000000")
  );
  is(result.length, 4, "all items that were imported were in fact imported");

  await CalendarTestUtils.monthView.waitForItemAt(window, 1, 3, 4);

  // While we're here, make sure we can export the "Test" calendar as well.
  const exportedFile = await IOUtils.getFile(PathUtils.tempDir, "export.ics");
  MockFilePicker.setFiles([exportedFile]);

  const context = document.getElementById("list-calendars-context-menu");
  EventUtils.synthesizeMouseAtCenter(
    document.querySelector("#calendar-list li:nth-child(2)"),
    { type: "contextmenu" },
    window
  );
  await BrowserTestUtils.waitForPopupEvent(context, "shown");
  context.activateItem(document.getElementById("list-calendars-context-export"));

  await TestUtils.waitForCondition(() => exportedFile.exists());

  const icsExported = await IOUtils.readUTF8(exportedFile.path);
  Assert.ok(icsExported.includes("\r\nNAME:Test\r\n"), "ics export should contain calendar NAME");
  Assert.ok(
    icsExported.includes("\r\nX-WR-CALNAME:Test\r\n"),
    "ics export should contain calendar X-WR-CALNAME"
  );

  for (const item of result) {
    await calendar.deleteItem(item);
  }
});
