/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { startAxeMutationObserver } = ChromeUtils.importESModule(
  "resource://testing-common/mail/AxeHelpers.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
let browser;
let dialog;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarEventCreateEditDialog.xhtml",
  });

  browser = tab.browser;
  await BrowserTestUtils.browserLoaded(browser, undefined, url =>
    url.endsWith("calendarEventCreateEditDialog.xhtml")
  );
  await SimpleTest.promiseFocus(browser);
  dialog = browser.contentWindow.document.querySelector(
    '[is="calendar-event-create-edit-dialog"]'
  );

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
  await browser.contentWindow.document.l10n.translateFragment(dialog);

  Assert.equal(
    dialog.getAttribute("aria-label"),
    "Event",
    "The dialog has an accessible name"
  );

  dialog.close();
});
