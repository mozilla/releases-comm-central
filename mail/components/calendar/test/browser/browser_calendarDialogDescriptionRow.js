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

add_task(async function test_attributes() {
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
    BrowserTestUtils.isVisible(
      expandingDescription.querySelector(".plain-text-description")
    ),
    "Expanding row should have plain text description visible"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(
      expandingDescription.querySelector(".rich-description")
    ),
    "Expanding row should not show rich description"
  );

  Assert.ok(
    BrowserTestUtils.isHidden(
      expandedDescription.querySelector(".plain-text-description")
    ),
    "Expanded row should have plain text description hidden"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(
      expandedDescription.querySelector(".rich-description")
    ),
    "Expanded row should show rich description"
  );
});

add_task(async function test_richDescriptionBrowser() {
  const richDescriptionBrowser =
    expandedDescription.querySelector(".rich-description");
  const targetDocument = "chrome://messenger/content/eventDescription.html";

  if (
    richDescriptionBrowser.contentWindow.location.href !== targetDocument ||
    richDescriptionBrowser.contentDocument.readyState === "loading"
  ) {
    await BrowserTestUtils.browserLoaded(
      richDescriptionBrowser,
      targetDocument
    );
  }
  Assert.equal(
    richDescriptionBrowser.contentWindow.location.href,
    "chrome://messenger/content/eventDescription.html",
    "Should have description document loaded"
  );
  Assert.equal(
    richDescriptionBrowser.contentDocument.body.childElementCount,
    0,
    "Loaded document should have an empty body"
  );
});

add_task(async function test_setExpandingDescription() {
  const entireSlot = expandingDescription.querySelector('[slot="content"]');
  const plainText = expandingDescription.querySelector(
    ".plain-text-description"
  );
  const richDescription =
    expandingDescription.querySelector(".rich-description");
  const toggleRowVisibilityPromise = BrowserTestUtils.waitForEvent(
    expandingDescription,
    "toggleRowVisibility"
  );
  await expandingDescription.setDescription("foo");

  // Setting the description should fire this event.
  await toggleRowVisibilityPromise;
  Assert.equal(
    entireSlot.textContent.trim(),
    "foo",
    "The description text content should be updated"
  );
  Assert.equal(
    plainText.textContent,
    "foo",
    "Should display description in plain field"
  );
  Assert.equal(
    richDescription.contentDocument.body.textContent.trim(),
    "",
    "Should not touch browser for expanding row"
  );

  await expandingDescription.setDescription("");
  Assert.equal(
    entireSlot.textContent.trim(),
    "",
    "The description text content should be empty"
  );
  Assert.equal(
    plainText.textContent,
    "",
    "Should clear plain text description"
  );
  Assert.equal(
    richDescription.contentDocument.body.textContent.trim(),
    "",
    "Should still not touch browser"
  );
});

add_task(async function test_setFullDescription() {
  const plainText = expandedDescription.querySelector(
    ".plain-text-description"
  );
  const richDescription =
    expandedDescription.querySelector(".rich-description");
  await expandedDescription.setDescription("foo");
  Assert.equal(
    plainText.textContent,
    "foo",
    "Should display description in plain field"
  );
  Assert.equal(
    richDescription.contentDocument.body.innerHTML.trim(),
    "foo",
    "Should have a simple string in the browser body"
  );

  await expandedDescription.setDescription(
    "foo",
    "<p>foo</p><button>Test</button>"
  );
  Assert.equal(
    plainText.textContent,
    "foo",
    "Should display description in plain field"
  );
  Assert.equal(
    richDescription.contentDocument.body.innerHTML.trim(),
    "<p>foo</p>",
    "Browser should contain sanitized rich description"
  );

  await expandedDescription.setDescription("");
  Assert.equal(
    plainText.textContent,
    "",
    "Should clear plain text description"
  );
  Assert.equal(
    richDescription.contentDocument.body.childElementCount,
    0,
    "Should clear browser"
  );
});
