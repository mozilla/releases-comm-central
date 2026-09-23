/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { startAxeMutationObserver } = ChromeUtils.importESModule(
  "resource://testing-common/mail/AxeHelpers.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
let browser;
let doc;
let dialog;
let dialogContainer;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarEventCreateEditDialog.xhtml",
  });

  browser = tab.browser;
  await BrowserTestUtils.browserLoaded(browser, undefined, url =>
    url.endsWith("calendarEventCreateEditDialog.xhtml")
  );
  await SimpleTest.promiseFocus(browser);
  doc = browser.contentWindow.document;
  dialogContainer = doc.getElementById("dialog-container");
  dialog = doc.querySelector('[is="calendar-event-create-edit-dialog"]');
  dialog.container = dialogContainer;

  await startAxeMutationObserver(browser, {
    message:
      "The create/edit dialog shell stayed axe-clean while the test mutated it",
    specialPowers: SpecialPowers,
  });

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(async function test_registration_and_structure() {
  const { customElements } = browser.contentWindow;
  Assert.ok(
    customElements.get("calendar-event-create-edit-dialog"),
    "The create/edit dialog custom element is registered"
  );
  Assert.equal(
    Object.getPrototypeOf(dialog.constructor.prototype),
    customElements.get("positioned-dialog").prototype,
    "The create/edit dialog extends PositionedDialog"
  );

  Assert.equal(
    dialog.querySelectorAll(
      ":scope > .calendar-event-create-edit-dialog-header"
    ).length,
    1,
    "The dialog has one header region"
  );
  Assert.equal(
    dialog.querySelectorAll(":scope > .calendar-event-create-edit-dialog-body")
      .length,
    1,
    "The dialog has one body region"
  );
  Assert.equal(
    dialog.querySelectorAll(
      ":scope > .calendar-event-create-edit-dialog-footer"
    ).length,
    1,
    "The dialog has one footer region"
  );
});

add_task(async function test_shared_row_and_subview_scaffolding() {
  const body = dialog.querySelector(".calendar-event-create-edit-dialog-body");
  const subview = body.querySelector(
    "#calendarEventCreateEditDialogMainSubview[data-subview='main']"
  );

  Assert.ok(subview, "The body provides the main subview scaffold");
  const rows = subview.querySelector(".calendar-event-create-edit-dialog-rows");
  Assert.ok(rows, "The main subview provides the shared row container");
  Assert.equal(rows.childElementCount, 0, "The static shell has no field rows");
});

add_task(async function test_accessible_static_dialog_shell() {
  dialog.showModal();

  try {
    await doc.l10n.translateFragment(dialog);

    Assert.equal(
      dialog.getAttribute("aria-label"),
      "Event",
      "The dialog has an accessible name"
    );
  } finally {
    dialog.close();
  }
});

add_task(async function test_dialogVisibilityChecks() {
  Assert.ok(!dialog.open, "The dialog is closed before it is shown");

  Assert.ok(
    BrowserTestUtils.isHidden(dialog),
    "The dialog is hidden before it is opened"
  );

  dialog.show();

  Assert.ok(
    BrowserTestUtils.isVisible(dialog),
    "The dialog is visible after opening"
  );

  dialog.close();

  Assert.ok(
    BrowserTestUtils.isHidden(dialog),
    "The dialog is hidden after closing"
  );
});

add_task(async function test_dialogHasMinimumWidth() {
  dialog.show();

  try {
    await TestUtils.waitForCondition(
      () => BrowserTestUtils.isVisible(dialog),
      "The dialog is visible before measuring its rendered width"
    );

    const { width } = dialog.getBoundingClientRect();
    Assert.greaterOrEqual(width, 424, "The dialog is at least 424px wide");
  } finally {
    dialog.close();
  }
});

add_task(async function test_bodyScrollsWhenContentIsTooTall() {
  const dialogHeader = dialog.querySelector(
    ".calendar-event-create-edit-dialog-header"
  );
  const dialogBody = dialog.querySelector(
    ".calendar-event-create-edit-dialog-body"
  );
  const dialogFooter = dialog.querySelector(
    ".calendar-event-create-edit-dialog-footer"
  );
  const rows = dialog.querySelector(".calendar-event-create-edit-dialog-rows");
  const headerContent = dialogHeader.querySelector(".calendar-name");
  const tallContent = doc.createElement("div");

  headerContent.textContent = "Header content";
  dialogFooter.textContent = "Footer content";

  // Limit the size of the dialog container, to mimic a limited size in the
  // calendar view.
  dialogContainer.style.blockSize = "200px";

  const shortDialogRect = dialog.getBoundingClientRect();
  const shortHeaderRect = dialogHeader.getBoundingClientRect();
  const shortFooterRect = dialogFooter.getBoundingClientRect();

  dialog.show();

  try {
    Assert.ok(
      BrowserTestUtils.isVisible(dialogHeader),
      "The header is visible when the dialog content is short"
    );
    Assert.greaterOrEqual(
      shortHeaderRect.top,
      shortDialogRect.top,
      "The header top edge is inside the dialog when the content is short"
    );
    Assert.lessOrEqual(
      shortHeaderRect.bottom,
      shortDialogRect.bottom,
      "The header bottom edge is inside the dialog when the content is short"
    );
    Assert.ok(
      BrowserTestUtils.isVisible(dialogFooter),
      "The footer is visible when the dialog content is short"
    );
    Assert.greaterOrEqual(
      shortFooterRect.top,
      shortDialogRect.top,
      "The footer top edge is inside the dialog when the content is short"
    );
    Assert.lessOrEqual(
      shortFooterRect.bottom,
      shortDialogRect.bottom,
      "The footer bottom edge is inside the dialog when the content is short"
    );

    // Now, increase the height of the dialog body content, such that it
    // triggers a scrollbar
    tallContent.style.blockSize = "1000px";
    rows.append(tallContent);

    const tallDialogRect = dialog.getBoundingClientRect();
    const constrainedContainerRect = dialogContainer.getBoundingClientRect();

    Assert.lessOrEqual(
      tallDialogRect.height,
      constrainedContainerRect.height,
      "The dialog does not exceed the constrained container height"
    );

    Assert.greater(
      dialogBody.scrollHeight,
      dialogBody.clientHeight,
      "The dialog body becomes scrollable when its content is too tall"
    );

    const headerRectBeforeScroll = dialogHeader.getBoundingClientRect();
    const footerRectBeforeScroll = dialogFooter.getBoundingClientRect();

    // Scroll to the bottom of the dialog.
    dialogBody.scrollTop = dialogBody.scrollHeight;

    Assert.greater(
      dialogBody.scrollTop,
      0,
      "The dialog body scrolls when content is too tall"
    );

    const headerRectAfterScroll = dialogHeader.getBoundingClientRect();
    const footerRectAfterScroll = dialogFooter.getBoundingClientRect();

    Assert.equal(
      headerRectAfterScroll.top,
      headerRectBeforeScroll.top,
      "The header top edge stays fixed when the body scrolls"
    );
    Assert.equal(
      headerRectAfterScroll.bottom,
      headerRectBeforeScroll.bottom,
      "The header bottom edge stays fixed when the body scrolls"
    );
    Assert.greaterOrEqual(
      headerRectAfterScroll.top,
      tallDialogRect.top,
      "The header top edge stays inside the dialog after the body scrolls"
    );
    Assert.lessOrEqual(
      headerRectAfterScroll.bottom,
      tallDialogRect.bottom,
      "The header bottom edge stays inside the dialog after the body scrolls"
    );
    Assert.equal(
      footerRectAfterScroll.top,
      footerRectBeforeScroll.top,
      "The footer top edge stays fixed when the body scrolls"
    );
    Assert.equal(
      footerRectAfterScroll.bottom,
      footerRectBeforeScroll.bottom,
      "The footer bottom edge stays fixed when the body scrolls"
    );
    Assert.greaterOrEqual(
      footerRectAfterScroll.top,
      tallDialogRect.top,
      "The footer top edge stays inside the dialog after the body scrolls"
    );
    Assert.lessOrEqual(
      footerRectAfterScroll.bottom,
      tallDialogRect.bottom,
      "The footer bottom edge stays inside the dialog after the body scrolls"
    );
  } finally {
    headerContent.textContent = "";
    dialogFooter.textContent = "";
    tallContent.remove();
    dialogBody.scrollTop = 0;
    dialogContainer.style.removeProperty("block-size");
    dialog.close();
  }
});

add_task(async function test_rowsExpandAndCollapseWithinAvailableSpace() {
  const dialogBody = dialog.querySelector(
    ".calendar-event-create-edit-dialog-body"
  );
  const rows = dialog.querySelector(".calendar-event-create-edit-dialog-rows");
  const row = doc.createElement("div");
  const details = doc.createElement("details");
  const summary = doc.createElement("summary");
  const expandedContent = doc.createElement("div");

  summary.textContent = "Expandable row";
  expandedContent.style.blockSize = "80px";
  expandedContent.textContent = "Expanded row content";
  details.append(summary, expandedContent);
  row.append(details);
  rows.append(row);

  dialog.show();

  try {
    const collapsedHeight = dialog.getBoundingClientRect().height;

    details.open = true;

    const expandedHeight = dialog.getBoundingClientRect().height;

    Assert.greater(
      expandedHeight,
      collapsedHeight,
      "The dialog grows when a row expands and vertical space is available"
    );
    Assert.lessOrEqual(
      dialogBody.scrollHeight,
      dialogBody.clientHeight,
      "The dialog body does not need to scroll when vertical space is available"
    );

    details.open = false;

    Assert.less(
      dialog.getBoundingClientRect().height,
      expandedHeight,
      "The dialog shrinks when the row collapses"
    );
  } finally {
    row.remove();
    dialogBody.scrollTop = 0;
    dialog.close();
  }
});

add_task(async function test_rowsScrollWhenAvailableSpaceIsConstrained() {
  const dialogBody = dialog.querySelector(
    ".calendar-event-create-edit-dialog-body"
  );
  const rows = dialog.querySelector(".calendar-event-create-edit-dialog-rows");
  const row = doc.createElement("div");
  const details = doc.createElement("details");
  const summary = doc.createElement("summary");
  const expandedContent = doc.createElement("div");

  summary.textContent = "Expandable row";
  expandedContent.style.blockSize = "260px";
  expandedContent.textContent = "Expanded row content";
  details.append(summary, expandedContent);
  row.append(details);

  dialogContainer.style.blockSize = "160px";
  rows.append(row);

  dialog.show();

  try {
    const constrainedHeight = dialogContainer.getBoundingClientRect().height;
    const collapsedHeight = dialog.getBoundingClientRect().height;

    Assert.lessOrEqual(
      collapsedHeight,
      constrainedHeight,
      "The collapsed dialog fits inside the constrained container"
    );

    details.open = true;

    const expandedHeight = dialog.getBoundingClientRect().height;

    Assert.lessOrEqual(
      expandedHeight,
      constrainedHeight,
      "The expanded dialog does not grow beyond the constrained height"
    );
    Assert.equal(
      expandedHeight,
      collapsedHeight,
      "The dialog height stays static when a row expands without more vertical space"
    );
    Assert.greater(
      dialogBody.scrollHeight,
      dialogBody.clientHeight,
      "The dialog body becomes scrollable when expanded content exceeds available space"
    );

    const scrollTop = dialogBody.scrollTop;
    dialogBody.scrollTop = dialogBody.scrollHeight;

    Assert.greater(
      dialogBody.scrollTop,
      scrollTop,
      "The dialog body can scroll to show the expanded row content"
    );
  } finally {
    row.remove();
    dialogBody.scrollTop = 0;
    dialogContainer.style.removeProperty("block-size");
    dialog.close();
  }
});
