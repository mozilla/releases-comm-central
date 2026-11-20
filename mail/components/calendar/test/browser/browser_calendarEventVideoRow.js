/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { startAxeMutationObserver } = ChromeUtils.importESModule(
  "resource://testing-common/mail/AxeHelpers.sys.mjs"
);

let browser;
let redux;
let doc;
let dialog;
let row;
let checkbox;
let urlInput;
let clearButton;
let calendar;

const exampleUrl = "https://example.com/meeting";

add_setup(async function () {
  const tabmail = document.getElementById("tabmail");

  calendar = createCalendar();

  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarEventCreateEditDialog.xhtml",
  });
  browser = tab.browser;

  await BrowserTestUtils.browserLoaded(browser, undefined, url =>
    url.endsWith("calendarEventCreateEditDialog.xhtml")
  );
  await SimpleTest.promiseFocus(browser);

  redux = browser.contentWindow.ReduxTestUtils;
  doc = browser.contentWindow.document;
  dialog = doc.querySelector('[is="calendar-event-create-edit-dialog"]');
  row = dialog.querySelector("calendar-event-video-row");
  checkbox = row.shadowRoot.querySelector(".toggle-checkbox");
  urlInput = row.querySelector(".calendar-event-video-url");
  clearButton = row.querySelector(".calendar-event-clear-video-url");

  Assert.ok(await dialog.show(), "The video fixture dialog should open");
  await doc.l10n.translateFragment(dialog);

  await startAxeMutationObserver(browser, {
    container: '[is="calendar-event-create-edit-dialog"]',
    message: "Video row states should pass axe checks",
    specialPowers: SpecialPowers,
  });

  registerCleanupFunction(() => {
    dialog?.close();
    CalendarTestUtils.removeCalendar(calendar);
    tabmail.closeTab(tab);
  });
});

function setVideo(isOn, url = "") {
  dialog.updateDraftSection("video", {
    enabledRows: { video: isOn },
    videoUrl: url,
  });
}

/**
 * Checks that the toggle, the URL input, the draft and the changed sections
 * agree.
 *
 * @param {boolean} isOn - Whether Video should be on.
 * @param {string} cause - What changed Video. Used in the assertion messages.
 * @param {string} [url=""] - The URL that the input and the draft should hold.
 */
function assertVideo(isOn, cause, url = "") {
  const state = isOn ? "on" : "off";
  const sections = isOn || url ? ["video"] : [];

  Assert.equal(
    row.hasAttribute("checked"),
    isOn,
    `${cause} should turn the Video toggle ${state}`
  );
  Assert.equal(
    checkbox.checked,
    isOn,
    `${cause} should turn the Video checkbox ${state}`
  );
  // isVisible does not see the hidden content slot, so check for a layout box.
  Assert.equal(
    urlInput.getClientRects().length > 0,
    isOn,
    `${cause} should turn the Video URL input ${state}`
  );
  Assert.equal(
    clearButton.getClientRects().length > 0,
    isOn,
    `${cause} should turn the Clear button ${state}`
  );
  Assert.strictEqual(
    dialog.draft.enabledRows.video,
    isOn,
    `${cause} should turn the Video flag in the draft ${state}`
  );
  Assert.equal(
    urlInput.value,
    url,
    `${cause} should leave "${url}" in the URL input`
  );
  Assert.strictEqual(
    dialog.draft.videoUrl,
    url,
    `${cause} should leave "${url}" as the draft URL`
  );
  Assert.deepEqual(
    dialog.dirtySections,
    sections,
    `${cause} should leave ${sections.length ? "only the video section" : "no sections"} changed`
  );
}

add_task(function test_startsOff() {
  const label = row.querySelector('[slot="label"]');
  const dialogTemplateRow = document
    .getElementById("calendarEventCreateEditDialogTemplate")
    .content.querySelector("calendar-event-video-row");
  const fixtureTemplateRow = doc
    .getElementById("calendarEventCreateEditDialogTemplate")
    .content.querySelector("calendar-event-video-row");

  Assert.ok(
    dialogTemplateRow,
    "The dialog template should include the Video row"
  );
  Assert.ok(
    fixtureTemplateRow,
    "The fixture template should include the Video row"
  );
  Assert.equal(
    fixtureTemplateRow.outerHTML.replace(/\s+/g, " "),
    dialogTemplateRow.outerHTML.replace(/\s+/g, " "),
    "The fixture and dialog templates should have the same Video markup"
  );

  assertVideo(false, "A new draft");
  Assert.equal(
    doc.l10n.getAttributes(label).id,
    "calendar-event-video-label",
    "The Video label should use its Fluent ID"
  );
});

add_task(function test_mouseTogglesVideo() {
  const toggleLabel = row.shadowRoot.querySelector(".toggle-label");

  setVideo(false);

  EventUtils.synthesizeMouseAtCenter(toggleLabel, {}, browser.contentWindow);
  assertVideo(true, "Clicking the label");

  EventUtils.synthesizeMouseAtCenter(toggleLabel, {}, browser.contentWindow);
  assertVideo(false, "Clicking the label again");
});

add_task(function test_typingUpdatesDraft() {
  setVideo(true);

  urlInput.focus();
  EventUtils.sendString(exampleUrl, browser.contentWindow);

  assertVideo(true, "Typing a URL", exampleUrl);
});

add_task(function test_disablingKeepsUrl() {
  const toggleLabel = row.shadowRoot.querySelector(".toggle-label");

  setVideo(true);
  urlInput.focus();
  EventUtils.sendString(exampleUrl, browser.contentWindow);

  EventUtils.synthesizeMouseAtCenter(toggleLabel, {}, browser.contentWindow);
  assertVideo(false, "Turning Video off", exampleUrl);

  EventUtils.synthesizeMouseAtCenter(toggleLabel, {}, browser.contentWindow);
  assertVideo(true, "Turning Video on again", exampleUrl);
});

add_task(function test_clearButtonRemovesUrl() {
  setVideo(true, exampleUrl);

  EventUtils.synthesizeMouseAtCenter(clearButton, {}, browser.contentWindow);

  assertVideo(true, "Clicking Clear");
});

add_task(function test_draftUpdateSetsVideo() {
  setVideo(false);

  setVideo(true, exampleUrl);
  assertVideo(true, "A draft update", exampleUrl);

  setVideo(false);
  assertVideo(false, "Another draft update");
});

add_task(async function test_clearingDraftResetsVideo() {
  setVideo(true, exampleUrl);

  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventDraftSlice.mjs",
    "clearCalendarEventDraft",
    { sessionKey: dialog.calendarEventSessionKey }
  );

  Assert.strictEqual(dialog.draft, null, "Clearing the draft should remove it");
  Assert.ok(
    !row.hasAttribute("checked"),
    "Clearing the draft should turn the Video toggle off"
  );
  Assert.ok(
    !checkbox.checked,
    "Clearing the draft should uncheck the Video checkbox"
  );
  Assert.equal(
    urlInput.value,
    "",
    "Clearing the draft should empty the URL input"
  );

  urlInput.dispatchEvent(new browser.contentWindow.Event("input"));

  Assert.strictEqual(
    dialog.draft,
    null,
    "A late input event should not recreate the cleared draft"
  );
});
