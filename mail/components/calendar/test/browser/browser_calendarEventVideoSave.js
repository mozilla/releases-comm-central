/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Tests saving the Video URL through the dialog's real Save pipeline and a
 * calendar stored in the profile database. Covers create, reopen, edit,
 * removal, other conference types, and a failed write.
 */

const { startAxeMutationObserver } = ChromeUtils.importESModule(
  "resource://testing-common/mail/AxeHelpers.sys.mjs"
);

const videoUrl = "https://example.com/meet?a=1,2;b=3";
const newUrl = "https://example.com/new";
const oldUrl = "https://example.com/old";
const videoLine = `CONFERENCE;VALUE=URI;FEATURE=VIDEO;LABEL=Call:${oldUrl}`;
const phoneLine = "CONFERENCE;VALUE=URI;FEATURE=PHONE:tel:+1-412-555-0123";

let browser;
let doc;
let dialog;
let row;
let checkbox;
let urlInput;
let calendar;
let transaction;

add_setup(async function () {
  const tabmail = document.getElementById("tabmail");

  calendar = createCalendar();
  calendar.setProperty("calendar-main-in-composite", true);
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarEventCreateEditDialog.xhtml",
  });
  browser = tab.browser;

  await BrowserTestUtils.browserLoaded(browser, undefined, url =>
    url.endsWith("calendarEventCreateEditDialog.xhtml")
  );
  await SimpleTest.promiseFocus(browser);

  doc = browser.contentDocument;
  dialog = doc.querySelector('[is="calendar-event-create-edit-dialog"]');
  row = dialog.querySelector("calendar-event-video-row");
  checkbox = row.shadowRoot.querySelector(".toggle-checkbox");
  urlInput = row.querySelector(".calendar-event-video-url");

  dialog.style.inlineSize = "600px";
  dialog.style.blockSize = "480px";
  cal.view.getCompositeCalendar(browser.contentWindow).defaultCalendar =
    calendar;
  browser.contentWindow.promptOccurrenceModification = event => [event];
  // Tests can replace transaction to fail a write from the dialog.
  transaction = (...args) => window.doTransaction(...args);
  browser.contentWindow.doTransaction = (...args) => transaction(...args);

  // The fixture has no title or date controls, so supply save handlers for
  // those fields. The dialog's Video save handler stays in place.
  Object.assign(dialog.saveFields, {
    title: {
      keys: ["title"],
      apply: (event, values) => {
        event.title = values.title;
      },
    },
    dateTime: {
      keys: ["start", "end"],
      apply(event, values) {
        const dateProperties = [
          ["start", "startDate"],
          ["end", "endDate"],
        ];

        for (const [key, property] of dateProperties) {
          const value = values[key];
          const date = cal.createDateTime(value.icalString);
          date.timezone = cal.timezoneService.getTimezone(value.timezoneId);
          date.isDate = value.isDate;
          event[property] = date;
        }
      },
    },
  });

  await startAxeMutationObserver(browser, {
    container: '[is="calendar-event-create-edit-dialog"]',
    message: "Video Save states should pass accessibility checks.",
    specialPowers: SpecialPowers,
  });

  registerCleanupFunction(() => {
    dialog?.close();
    tabmail.closeTab(tab);
    CalendarTestUtils.removeCalendar(calendar);
  });
});

/**
 * Opens the dialog for a saved event, or for a new event with test values.
 *
 * @param {?calIEvent} [event=null] - The event to edit, or null to create one.
 * @returns {Promise<void>} Resolves after the dialog opens and is translated.
 */
async function show(event = null) {
  dialog.setCalendarEventRoute(
    event ? { calendarId: calendar.id, eventId: event.id } : {}
  );
  doc.getElementById("menuCreate").focus();

  const isOpen = await dialog.show();

  Assert.ok(isOpen, "The video Save dialog should open.");

  if (!event) {
    dialog.resetCreateDraft({
      calendarId: calendar.id,
      categories: [],
      enabledRows: { video: false },
      videoUrl: "",
      title: "Created with video",
      start: {
        icalString: "20261021T100000Z",
        timezoneId: "UTC",
        isDate: false,
      },
      end: { icalString: "20261021T110000Z", timezoneId: "UTC", isDate: false },
    });
  }

  await doc.l10n.translateFragment(dialog);
}

/**
 * Clicks Save and waits for the dialog to close after a successful write.
 *
 * @returns {Promise<void>}
 */
async function save() {
  const closed = BrowserTestUtils.waitForEvent(dialog, "close");

  dialog.querySelector(".calendar-event-save").click();
  await closed;
}

/**
 * Stores an event, optionally with a CONFERENCE line, in the test calendar.
 *
 * @param {?string} conferenceLine - The iCalendar line to add, or null.
 * @returns {Promise<calIEvent>} Resolves to the stored event.
 */
function addEvent(conferenceLine) {
  return calendar.addItem(
    new CalEvent(
      [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        `UID:${cal.getUUID()}`,
        "SUMMARY:Video event",
        "DTSTART:20261021T100000Z",
        "DTEND:20261021T110000Z",
        ...(conferenceLine ? [conferenceLine] : []),
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n")
    )
  );
}

/**
 * Replaces the URL input's text by typing, as a user would.
 *
 * @param {string} url - The non-empty text to type.
 */
function typeUrl(url) {
  urlInput.focus();
  urlInput.select();
  EventUtils.sendString(url, browser.contentWindow);
}

add_task(async function test_createSavesThenEditShowsVideo() {
  await show();
  EventUtils.synthesizeMouseAtCenter(checkbox, {}, browser.contentWindow);
  typeUrl(videoUrl);
  await save();

  const events = await calendar.getItemsAsArray(
    Ci.calICalendar.ITEM_FILTER_TYPE_EVENT,
    0,
    null,
    null
  );
  const saved = events.find(event => event.title == "Created with video");

  Assert.equal(
    saved.getProperty("CONFERENCE"),
    videoUrl,
    "Create Save should store the typed URL."
  );
  Assert.equal(
    saved.getPropertyParameter("CONFERENCE", "FEATURE"),
    "VIDEO",
    "Create Save should mark the conference as video."
  );

  await show(saved);

  Assert.ok(
    row.hasAttribute("checked"),
    "Editing a saved video conference should show Video on."
  );
  Assert.equal(urlInput.value, videoUrl, "Editing should show the saved URL.");
  Assert.deepEqual(
    dialog.dirtySections,
    [],
    "Opening an event should leave the draft unchanged."
  );

  dialog.close();
});

add_task(async function test_editChangesThenDisablesVideo() {
  const event = await addEvent(videoLine);

  await show(event);
  await save();

  let saved = await calendar.getItem(event.id);

  Assert.equal(
    saved.getProperty("CONFERENCE"),
    oldUrl,
    "An unchanged Save should keep the URL."
  );
  Assert.equal(
    saved.getPropertyParameter("CONFERENCE", "LABEL"),
    "Call",
    "An unchanged Save should keep other parameters."
  );

  await show(saved);
  typeUrl(newUrl);
  await save();
  saved = await calendar.getItem(event.id);

  Assert.equal(
    saved.getProperty("CONFERENCE"),
    newUrl,
    "Edit Save should store the new URL."
  );
  Assert.equal(
    saved.getPropertyParameter("CONFERENCE", "LABEL"),
    null,
    "A new URL should not inherit the old parameters."
  );

  await show(saved);
  EventUtils.synthesizeMouseAtCenter(checkbox, {}, browser.contentWindow);

  Assert.deepEqual(
    dialog.dirtySections,
    ["video"],
    "Turning Video off should change the video section."
  );

  await save();

  const removed = await calendar.getItem(event.id);

  Assert.ok(
    !removed.hasProperty("CONFERENCE"),
    "Saving with Video off should remove the saved video details."
  );

  await show(removed);

  Assert.ok(
    !row.hasAttribute("checked"),
    "A reopened event without video details should show Video off."
  );
  Assert.equal(
    urlInput.value,
    "",
    "A reopened event without video details should show no URL."
  );

  dialog.close();
});

add_task(async function test_clearingUrlRemovesVideo() {
  const event = await addEvent(videoLine);

  await show(event);
  EventUtils.synthesizeMouseAtCenter(
    row.querySelector(".calendar-event-clear-video-url"),
    {},
    browser.contentWindow
  );

  Assert.ok(
    row.hasAttribute("checked"),
    "Clearing the URL should leave Video on."
  );
  Assert.equal(
    dialog.draft.videoUrl,
    "",
    "Clearing should empty the draft URL."
  );

  await save();

  const saved = await calendar.getItem(event.id);

  Assert.ok(
    !saved.hasProperty("CONFERENCE"),
    "Saving an enabled row with an empty URL should remove the video details."
  );
});

add_task(async function test_nonVideoConferenceIsPreserved() {
  const event = await addEvent(phoneLine);

  await show(event);

  Assert.ok(
    !row.hasAttribute("checked"),
    "A phone conference should show Video off."
  );
  Assert.equal(
    urlInput.value,
    "",
    "A phone conference should show no video URL."
  );
  Assert.deepEqual(
    dialog.dirtySections,
    [],
    "Opening a phone event should leave the draft unchanged."
  );

  await save();

  const saved = await calendar.getItem(event.id);

  Assert.equal(
    saved.getProperty("CONFERENCE"),
    "tel:+1-412-555-0123",
    "Save with Video off should keep the phone number."
  );
  Assert.equal(
    saved.getPropertyParameter("CONFERENCE", "FEATURE"),
    "PHONE",
    "Save with Video off should keep the phone feature."
  );
});

add_task(async function test_failedSaveKeepsVideoDraft() {
  const event = await addEvent(videoLine);
  const realTransaction = transaction;

  await show(event);
  typeUrl(newUrl);

  try {
    transaction = async () => {
      throw new Error("Provider failed");
    };

    const result = await dialog.save();

    Assert.equal(
      result.status,
      "error",
      "A provider failure should report an error."
    );
  } finally {
    transaction = realTransaction;
  }

  Assert.equal(
    dialog.draft.videoUrl,
    newUrl,
    "Failure should retain the typed URL."
  );
  Assert.ok(
    dialog.draft.enabledRows.video,
    "Failure should retain the Video toggle."
  );
  Assert.equal(
    urlInput.value,
    newUrl,
    "Failure should keep the URL on screen."
  );
  const unchanged = await calendar.getItem(event.id);

  Assert.equal(
    unchanged.getProperty("CONFERENCE"),
    oldUrl,
    "Failed Save should preserve the saved URL."
  );

  await save();

  const retried = await calendar.getItem(event.id);

  Assert.equal(
    retried.getProperty("CONFERENCE"),
    newUrl,
    "Retry should save the retained URL."
  );
});

add_task(async function test_pendingSaveDisablesVideoControls() {
  const event = await addEvent(videoLine);
  const realTransaction = transaction;
  const started = Promise.withResolvers();
  const finish = Promise.withResolvers();
  const clearButton = row.querySelector(".calendar-event-clear-video-url");

  await show(event);

  transaction = async () => {
    started.resolve();
    await finish.promise;
    throw new Error("Provider failed");
  };

  const pending = dialog.save();

  try {
    await started.promise;

    Assert.ok(
      checkbox.disabled,
      "Pending Save should disable the Video toggle."
    );
    Assert.ok(urlInput.disabled, "Pending Save should disable the URL input.");
    Assert.ok(
      clearButton.disabled,
      "Pending Save should disable the Clear button."
    );

    urlInput.value = newUrl;
    urlInput.dispatchEvent(new browser.contentWindow.Event("input"));

    Assert.equal(
      dialog.draft.videoUrl,
      oldUrl,
      "Pending Save should reject URL changes."
    );
  } finally {
    finish.resolve();
    transaction = realTransaction;
  }

  const result = await pending;

  Assert.equal(
    result.status,
    "error",
    "A provider failure should report an error."
  );
  Assert.ok(
    !checkbox.disabled,
    "A failed Save should enable the Video toggle again."
  );
  Assert.ok(
    !urlInput.disabled,
    "A failed Save should enable the URL input again."
  );
  Assert.ok(
    !clearButton.disabled,
    "A failed Save should enable the Clear button again."
  );

  dialog.close();
});
