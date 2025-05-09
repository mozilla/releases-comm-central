/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const tabmail = document.getElementById("tabmail");
let expandingDescription, expandedDescription;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarDialogDescriptionRow.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();

  expandingDescription = tab.browser.contentWindow.document.querySelector(
    "#expandingDescription"
  );
  expandedDescription = tab.browser.contentWindow.document.querySelector(
    "#expandedDescription"
  );
});

registerCleanupFunction(() => {
  tabmail.closeOtherTabs(tabmail.tabInfo[0]);
});

add_task(function test_attributes() {
  const expandedRow = expandedDescription.querySelector("calendar-dialog-row");
  const expandingRow = expandingDescription.querySelector(
    "calendar-dialog-row"
  );

  Assert.ok(
    expandedRow.hasAttribute("expanded"),
    "Expanded description should have dialog row with expanded attribute"
  );
  Assert.ok(
    expandingRow.hasAttribute("expanding"),
    "Expanding description should have dialog row with expanding attribute"
  );

  Assert.ok(
    expandingRow
      .querySelector('[slot="content"]')
      .classList.contains("truncated-content"),
    "Expanding description should have truncated-content class"
  );

  Assert.ok(
    expandedRow.querySelector('[slot="content"] browser'),
    "Expanded description should have a browser element it's content slot"
  );
});

add_task(function test_setDescription() {
  expandingDescription.setDescription("foo");
  Assert.equal(
    expandingDescription.querySelector('[slot="content"]').textContent,
    "foo",
    "The description text content should be updated"
  );

  expandingDescription.setDescription("");
  Assert.equal(
    expandingDescription.querySelector('[slot="content"]').textContent,
    "",
    "The description text content should be empty"
  );
});
