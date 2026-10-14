/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let contentWindow;
let contentDocument;

function getCheckbox(row) {
  return row.shadowRoot.querySelector('input[type="checkbox"]');
}

function getContentSlot(row) {
  return row.shadowRoot.querySelector('slot[name="content"]');
}

function getLabel(row) {
  return row.querySelector('[slot="label"]');
}

function createRow({ checked = false, content = "Test Content" } = {}) {
  const row = contentDocument.createElement("calendar-dialog-toggleable-row");
  row.toggleAttribute("checked", checked);

  const label = contentDocument.createElement("span");
  label.slot = "label";
  label.textContent = "Test Label";
  row.append(label);

  if (content) {
    const contentElement = contentDocument.createElement("div");
    contentElement.slot = "content";
    contentElement.textContent = content;
    row.append(contentElement);
  }

  contentDocument.body.append(row);
  return row;
}

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarDialogToggleableRow.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  contentWindow = tab.browser.contentWindow;
  contentDocument = contentWindow.document;

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(function test_uncheckedRowHidesContent() {
  const row = contentDocument.querySelector("calendar-dialog-toggleable-row");
  const content = getContentSlot(row);

  Assert.ok(
    BrowserTestUtils.isHidden(content),
    "Unchecked row should hide its content"
  );
});

add_task(function test_checkedRowShowsContent() {
  const row = contentDocument.querySelector(
    "calendar-dialog-toggleable-row[checked]"
  );
  const content = getContentSlot(row);

  Assert.ok(
    BrowserTestUtils.isVisible(content),
    "Checked row should show its content"
  );
});

add_task(function test_checkedAttributeUpdatesRowState() {
  const row = createRow();
  const checkbox = getCheckbox(row);
  const content = getContentSlot(row);

  row.setAttribute("checked", "checked");

  Assert.ok(checkbox.checked, "Checked attribute should check the checkbox");
  Assert.ok(
    BrowserTestUtils.isVisible(content),
    "Checked attribute should show content"
  );
  Assert.equal(
    checkbox.getAttribute("aria-expanded"),
    "true",
    "Checked attribute should identify expanded content"
  );

  row.removeAttribute("checked");

  Assert.ok(!checkbox.checked, "Unchecked row should uncheck the checkbox");
  Assert.ok(
    BrowserTestUtils.isHidden(content),
    "Unchecked row should hide content"
  );
  Assert.equal(
    checkbox.getAttribute("aria-expanded"),
    "false",
    "Unchecked row should identify collapsed content"
  );

  row.remove();
});

add_task(function test_clickingToggleLabelUpdatesRow() {
  const row = createRow();
  const label = getLabel(row);
  const content = getContentSlot(row);

  EventUtils.synthesizeMouseAtCenter(label, {}, contentWindow);

  Assert.ok(row.hasAttribute("checked"), "Label click should check the row");
  Assert.ok(
    BrowserTestUtils.isVisible(content),
    "Label click should show content"
  );

  EventUtils.synthesizeMouseAtCenter(label, {}, contentWindow);

  Assert.ok(
    !row.hasAttribute("checked"),
    "Second click should uncheck the row"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(content),
    "Second click should hide content"
  );

  row.remove();
});

add_task(function test_pressingSpaceUpdatesRow() {
  const row = createRow();
  const checkbox = getCheckbox(row);
  const content = getContentSlot(row);

  checkbox.focus();
  EventUtils.synthesizeKey(" ", {}, contentWindow);

  Assert.ok(row.hasAttribute("checked"), "Space should check the row");
  Assert.ok(BrowserTestUtils.isVisible(content), "Space should show content");

  EventUtils.synthesizeKey(" ", {}, contentWindow);

  Assert.ok(!row.hasAttribute("checked"), "Space should uncheck the row");
  Assert.ok(BrowserTestUtils.isHidden(content), "Space should hide content");

  row.remove();
});

add_task(function test_checkboxIsProperlyLabelled() {
  const row = createRow();
  const checkbox = getCheckbox(row);
  const label = getLabel(row);

  Assert.ok(BrowserTestUtils.isVisible(label), "Label text should be visible");
  Assert.equal(checkbox.labels.length, 1, "Checkbox should have one label");
  const nativeLabel = checkbox.labels[0];
  Assert.ok(nativeLabel, "Checkbox should have a native label");
  Assert.equal(
    nativeLabel.querySelector('slot[name="label"]').assignedElements()[0],
    label,
    "Checkbox label should contain the visible label text"
  );

  row.remove();
});
