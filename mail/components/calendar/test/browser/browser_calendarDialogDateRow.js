/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const tabmail = document.getElementById("tabmail");
let row;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarDialogDateRow.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  row = tab.browser.contentWindow.document.querySelector(
    "calendar-dialog-date-row"
  );
});

registerCleanupFunction(() => {
  tabmail.closeOtherTabs(tabmail.tabInfo[0]);
});

add_task(function test_setDateRange() {
  const testStartDate = new Date(2025, 1, 2, 19, 0, 9, 8);
  const testEndDate = new Date(2025, 2, 6, 0, 14, 42, 50);
  const range = new Intl.DateTimeFormat(undefined, {
    timeStyle: "short",
    dateStyle: "medium",
  }).formatRange(testStartDate, testEndDate);

  row.setAttribute("start-date", testStartDate.toISOString());
  row.setAttribute("end-date", testEndDate.toISOString());

  Assert.equal(
    row.querySelector(".date-label").textContent,
    range,
    "Should have updated range to expected format"
  );
});

add_task(function test_setRepeats() {
  const repeatsIcon = row.querySelector(".repeats");
  const testRepeatPattern = "Once every blue moon";

  Assert.ok(!row.hasAttribute("repeats"), "Should not have any repeats set");
  Assert.ok(
    BrowserTestUtils.isHidden(repeatsIcon),
    "Repeats shouldn't be shown"
  );

  row.setAttribute("repeats", testRepeatPattern);
  Assert.ok(
    BrowserTestUtils.isVisible(repeatsIcon),
    "Repeats icon should be visible"
  );
  Assert.equal(
    repeatsIcon.title,
    testRepeatPattern,
    "Repeats icon should have pattern description as tooltip"
  );

  row.removeAttribute("repeats");
  Assert.ok(
    BrowserTestUtils.isHidden(repeatsIcon),
    "Repeats shouldn't be hidden again"
  );
});
