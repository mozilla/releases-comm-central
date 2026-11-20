/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Tests saving the Video URL without a dialog. The tests use the calendar
 * event draft store and the create and edit save functions with an in-memory
 * calendar. Edit tests use loadCalendarEventSnapshot to load the saved event
 * into the draft.
 */

const { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);
const { CalEvent } = ChromeUtils.importESModule(
  "resource:///modules/CalEvent.sys.mjs"
);
const { updateAppInfo } = ChromeUtils.importESModule(
  "resource://testing-common/AppInfo.sys.mjs"
);
const { CalTransactionManager, CalAddTransaction, CalModifyTransaction } =
  ChromeUtils.importESModule(
    "resource:///modules/CalTransactionManager.sys.mjs"
  );
const { store } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/base/content/state/store.mjs"
);
const { loadCalendarEventSnapshot, selectCalendarEventSourceSession } =
  ChromeUtils.importESModule(
    "moz-src:///comm/mail/components/calendar/content/state/calendar-event-source-state.mjs"
  );
const {
  resetForCreate,
  resetFromSource,
  updateSection,
  selectCalendarEventDraftState,
} = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/state/calendarEventDraftSlice.mjs"
);
const { startCreateSession, startEditSession } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/state/calendarEventCreateEditSessionSlice.mjs"
);
const { calendarEventVideoSaveField, getEventVideoUrl } =
  ChromeUtils.importESModule(
    "moz-src:///comm/mail/components/calendar/content/calendar-event-save-fields.mjs"
  );
const { saveCalendarEventCreate } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/calendar-event-create-save.mjs"
);
const { saveCalendarEventEdit } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/calendar-event-edit-save.mjs"
);

const sessionKey = "video-save-test";
const manager = CalTransactionManager.getInstance();
const fields = {
  video: calendarEventVideoSaveField,
  // Create Save needs date objects even though this test has no date controls.
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
};
const videoUrl = "https://example.com/meet?a=1,2;b=3";
const oldUrl = "https://example.com/old";
const videoLine = `CONFERENCE;VALUE=URI;FEATURE=VIDEO;LABEL=Call:${oldUrl}`;
const phoneLine = "CONFERENCE;VALUE=URI;FEATURE=PHONE:tel:+1-412-555-0123";
let calendar;

add_setup(function () {
  do_get_profile();
  updateAppInfo();
  calendar = cal.manager.createCalendar(
    "memory",
    Services.io.newURI("moz-memory-calendar://")
  );
  registerCleanupFunction(() => cal.manager.unregisterCalendar(calendar));
  cal.manager.registerCalendar(calendar);
});

/**
 * Stores an event in the test calendar.
 *
 * @param {string[]} [conferenceLines=[]] - CONFERENCE lines to add to the event.
 * @returns {Promise<calIEvent>} Resolves to the stored event.
 */
function createEvent(conferenceLines = []) {
  return calendar.addItem(
    new CalEvent(
      [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        `UID:${cal.getUUID()}`,
        "SUMMARY:Video event",
        "DTSTART:20261021T100000Z",
        "DTEND:20261021T110000Z",
        ...conferenceLines,
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n")
    )
  );
}

/**
 * Starts a new draft or loads a saved event into a draft.
 * Reuses `sessionKey` so each test replaces the previous draft.
 *
 * @param {?calIEvent} event - The saved event to edit, or null for create mode.
 * @returns {Promise<void>} Resolves after the draft and mode are set in the store.
 */
async function start(event) {
  if (!event) {
    store.dispatch(startCreateSession({ sessionKey }));
    store.dispatch(
      resetForCreate({
        sessionKey,
        initialDraft: {
          calendarId: calendar.id,
          enabledRows: { video: false },
          videoUrl: "",
          start: {
            icalString: "20261021T100000Z",
            timezoneId: "UTC",
            isDate: false,
          },
          end: {
            icalString: "20261021T110000Z",
            timezoneId: "UTC",
            isDate: false,
          },
        },
      })
    );

    return;
  }

  await store.dispatch(
    loadCalendarEventSnapshot({
      sessionKey,
      identity: {
        calendarId: calendar.id,
        eventId: event.id,
        recurrenceId: null,
      },
    })
  );
  const source = selectCalendarEventSourceSession(store.getState(), sessionKey);

  Assert.equal(
    source.status,
    "ready",
    "The edit source should finish loading."
  );

  store.dispatch(startEditSession({ sessionKey }));
  store.dispatch(resetFromSource({ sessionKey, snapshot: source.snapshot }));
}

/**
 * Sets the draft's video URL and whether Save includes it.
 * A disabled row keeps its URL in the draft.
 *
 * @param {boolean} isOn - Whether Save includes the URL.
 * @param {string} url - The URL as entered, including any surrounding space.
 */
function setVideo(isOn, url) {
  store.dispatch(
    updateSection({
      sessionKey,
      section: "video",
      patch: { enabledRows: { video: isOn }, videoUrl: url },
    })
  );
}

/**
 * Returns the draft state for this test's session.
 *
 * @returns {?CalendarEventDraftState} The draft state, or null before it exists.
 */
function draftState() {
  return selectCalendarEventDraftState(store.getState(), sessionKey);
}

/**
 * Checks that Save kept the input, starting values, and changed section names.
 *
 * @param {CalendarEventDraftState} expected - A copy of the draft before Save.
 */
function assertRetainedDraft(expected) {
  const actual = draftState();

  Assert.deepEqual(
    actual.value,
    expected.value,
    "Save should retain draft values and row state."
  );
  Assert.deepEqual(
    actual.baseline,
    expected.baseline,
    "Save should retain the draft baseline."
  );
  Assert.deepEqual(
    actual.dirtySections,
    expected.dirtySections,
    "Save should retain changed draft sections."
  );
}

/**
 * Saves the draft with a Calendar transaction, without sending invitations.
 * Tests can replace `transact` to fail the write.
 *
 * @param {boolean} editing - True to modify an event, false to create an event.
 * @param {object} [options={}] - Replacements for the default Save arguments.
 * @returns {Promise<{status: string}>} Resolves with the Save result.
 */
function save(editing, options = {}) {
  const common = { store, sessionKey, fields };

  if (editing) {
    return saveCalendarEventEdit({
      ...common,
      chooseOccurrence: event => event,
      transact: (event, original) =>
        manager.commit(
          new CalModifyTransaction(event, event.calendar, original, {
            responseMode: Ci.calIItipItem.NONE,
          })
        ),
      ...options,
    });
  }

  return saveCalendarEventCreate({
    ...common,
    transact: event =>
      manager.commit(
        new CalAddTransaction(event, event.calendar, null, {
          responseMode: Ci.calIItipItem.NONE,
        })
      ),
    ...options,
  });
}

/**
 * Runs create Save and returns the event it added to the test calendar.
 *
 * @returns {Promise<calIEvent>} Resolves to the new event.
 */
async function saveNewEvent() {
  const getEvents = () =>
    calendar.getItemsAsArray(
      Ci.calICalendar.ITEM_FILTER_TYPE_EVENT,
      0,
      null,
      null
    );
  const ids = new Set((await getEvents()).map(event => event.id));

  const result = await save(false);

  Assert.equal(result.status, "success", "Create Save should succeed.");

  return (await getEvents()).find(event => !ids.has(event.id));
}

add_task(async function test_createWritesVideoConference() {
  await start(null);
  setVideo(true, `  ${videoUrl}  `);
  const draftBeforeSave = structuredClone(draftState());

  const saved = await saveNewEvent();

  Assert.equal(
    saved.getProperty("CONFERENCE"),
    videoUrl,
    "Save should write the trimmed URL."
  );
  Assert.equal(
    saved.getPropertyParameter("CONFERENCE", "VALUE"),
    "URI",
    "Save should write VALUE=URI."
  );
  Assert.equal(
    saved.getPropertyParameter("CONFERENCE", "FEATURE"),
    "VIDEO",
    "Save should write FEATURE=VIDEO."
  );
  assertRetainedDraft(draftBeforeSave);

  const line = saved.icalString
    .replace(/\r\n /g, "")
    .split("\r\n")
    .find(text => text.startsWith("CONFERENCE"));

  Assert.ok(
    line.includes("VALUE=URI") &&
      line.includes("FEATURE=VIDEO") &&
      line.endsWith(`:${videoUrl}`),
    "The ICS line should carry the parameters and an unescaped URL."
  );
  Assert.equal(
    getEventVideoUrl(new CalEvent(saved.icalString)),
    videoUrl,
    "Parsing the saved ICS should restore the URL."
  );
  Assert.deepEqual(
    JSON.parse(JSON.stringify(store.getState())),
    store.getState(),
    "Redux should contain only JSON-compatible data."
  );
});

add_task(async function test_createWritesNothingWhenOffOrEmpty() {
  const noConferenceCases = [
    [false, videoUrl],
    [true, "   "],
    [true, ""],
  ];

  for (const [isOn, url] of noConferenceCases) {
    await start(null);
    setVideo(isOn, url);

    const saved = await saveNewEvent();

    Assert.ok(
      !saved.hasProperty("CONFERENCE"),
      `Save with Video ${isOn ? "on" : "off"} and "${url}" should write no conference.`
    );
  }
});

add_task(async function test_editHydratesOnlyVideoConferences() {
  const cases = [
    [videoLine, oldUrl, true],
    [
      "CONFERENCE;VALUE=URI;FEATURE=AUDIO,video:https://example.com/av",
      "https://example.com/av",
      true,
    ],
    [phoneLine, "", false],
    ["CONFERENCE;VALUE=URI:https://example.com/bare", "", false],
    [null, "", false],
  ];

  for (const [line, url, isOn] of cases) {
    await start(await createEvent(line ? [line] : []));
    const { value, dirtySections } = draftState();

    Assert.strictEqual(
      value.videoUrl,
      url,
      `The draft should hold "${url}" for ${line}.`
    );
    Assert.strictEqual(
      value.enabledRows.video,
      isOn,
      `Video should be ${isOn ? "on" : "off"} for ${line}.`
    );
    Assert.deepEqual(
      dirtySections,
      [],
      "A loaded draft should have no changed sections."
    );
  }
});

add_task(async function test_unchangedSaveKeepsConferenceParameters() {
  const event = await createEvent([videoLine]);
  await start(event);

  const result = await save(true);

  Assert.equal(result.status, "success", "Edit Save should succeed.");

  const saved = await calendar.getItem(event.id);

  Assert.equal(
    saved.getProperty("CONFERENCE"),
    oldUrl,
    "An unchanged URL should stay."
  );
  Assert.equal(
    saved.getPropertyParameter("CONFERENCE", "LABEL"),
    "Call",
    "An unchanged Save should keep other parameters."
  );
});

add_task(async function test_titleEditPreservesNewerVideoUrl() {
  const newerUrl = "https://example.com/newer";
  const event = await createEvent([videoLine]);
  await start(event);

  // Simulate another editor changing the URL while this draft is open.
  const updatedEvent = event.clone();
  updatedEvent.setProperty("CONFERENCE", newerUrl);
  await calendar.modifyItem(updatedEvent, event);

  const storedEvent = await calendar.getItem(event.id);

  Assert.equal(
    draftState().value.videoUrl,
    oldUrl,
    "The draft should still hold the original URL."
  );
  Assert.equal(
    storedEvent.getProperty("CONFERENCE"),
    newerUrl,
    "The calendar should hold the other editor's URL."
  );

  const title = "Updated event title";

  store.dispatch(
    updateSection({ sessionKey, section: "title", patch: { title } })
  );

  const result = await save(true);
  const saved = await calendar.getItem(event.id);

  Assert.equal(result.status, "success", "The title edit should save.");
  Assert.equal(saved.title, title, "Save should update the event title.");
  Assert.equal(
    saved.getProperty("CONFERENCE"),
    newerUrl,
    "The title edit should preserve the URL saved by the other editor."
  );
});

add_task(async function test_titleEditPreservesNewerVideoConference() {
  const event = await createEvent();
  await start(event);

  // Simulate another editor adding a video conference while this draft is open.
  const updatedEvent = event.clone();
  updatedEvent.setProperty("CONFERENCE", videoUrl);
  updatedEvent.setPropertyParameter("CONFERENCE", "VALUE", "URI");
  updatedEvent.setPropertyParameter("CONFERENCE", "FEATURE", "VIDEO");
  await calendar.modifyItem(updatedEvent, event);

  const storedEvent = await calendar.getItem(event.id);

  Assert.strictEqual(
    draftState().value.enabledRows.video,
    false,
    "The draft should still have Video off."
  );
  Assert.equal(
    storedEvent.getProperty("CONFERENCE"),
    videoUrl,
    "The calendar should hold the other editor's conference."
  );

  const title = "Updated event title";

  store.dispatch(
    updateSection({ sessionKey, section: "title", patch: { title } })
  );

  const result = await save(true);
  const saved = await calendar.getItem(event.id);

  Assert.equal(result.status, "success", "The title edit should save.");
  Assert.equal(saved.title, title, "Save should update the event title.");
  Assert.equal(
    saved.getProperty("CONFERENCE"),
    videoUrl,
    "The title edit should preserve the conference added by the other editor."
  );
});

add_task(async function test_titleEditIgnoresVideoUrlTypedWhileOff() {
  const newerUrl = "https://example.com/newer";
  const event = await createEvent();
  await start(event);

  // The user types a URL, then turns Video off again.
  setVideo(true, videoUrl);
  setVideo(false, videoUrl);

  // Simulate another editor adding a video conference while this draft is open.
  const updatedEvent = event.clone();
  updatedEvent.setProperty("CONFERENCE", newerUrl);
  updatedEvent.setPropertyParameter("CONFERENCE", "VALUE", "URI");
  updatedEvent.setPropertyParameter("CONFERENCE", "FEATURE", "VIDEO");
  await calendar.modifyItem(updatedEvent, event);

  const storedEvent = await calendar.getItem(event.id);

  Assert.equal(
    draftState().value.videoUrl,
    videoUrl,
    "The draft should still hold the typed URL."
  );
  Assert.equal(
    storedEvent.getProperty("CONFERENCE"),
    newerUrl,
    "The calendar should hold the other editor's conference."
  );

  const title = "Updated event title";

  store.dispatch(
    updateSection({ sessionKey, section: "title", patch: { title } })
  );

  const result = await save(true);
  const saved = await calendar.getItem(event.id);

  Assert.equal(result.status, "success", "The title edit should save.");
  Assert.equal(saved.title, title, "Save should update the event title.");
  Assert.equal(
    saved.getProperty("CONFERENCE"),
    newerUrl,
    "The title edit should preserve the conference added by the other editor."
  );
});

add_task(async function test_editChangesUrl() {
  const event = await createEvent([videoLine]);
  await start(event);
  setVideo(true, videoUrl);

  await save(true);

  const saved = await calendar.getItem(event.id);

  Assert.equal(
    saved.getProperty("CONFERENCE"),
    videoUrl,
    "Edit Save should write the new URL."
  );
  Assert.equal(
    saved.getPropertyParameter("CONFERENCE", "FEATURE"),
    "VIDEO",
    "The new conference should list VIDEO."
  );
  Assert.equal(
    saved.getPropertyParameter("CONFERENCE", "LABEL"),
    null,
    "The old parameters should not carry over."
  );
});

add_task(async function test_disablingOrClearingRemovesConference() {
  const removalCases = [
    [false, oldUrl],
    [true, ""],
  ];

  for (const [isOn, url] of removalCases) {
    const event = await createEvent([videoLine]);
    await start(event);
    setVideo(isOn, url);
    const draftBeforeSave = structuredClone(draftState());

    await save(true);

    const saved = await calendar.getItem(event.id);

    Assert.ok(
      !saved.hasProperty("CONFERENCE"),
      "Save should remove the video conference."
    );
    assertRetainedDraft(draftBeforeSave);
  }
});

add_task(async function test_emptyUrlKeepsNonVideoConference() {
  const event = await createEvent([phoneLine]);

  await start(event);
  setVideo(true, "");
  await save(true);

  const saved = await calendar.getItem(event.id);

  Assert.equal(
    saved.getProperty("CONFERENCE"),
    "tel:+1-412-555-0123",
    "Save with Video on and an empty URL should keep a phone conference."
  );
});

add_task(async function test_explicitVideoUrlReplacesNonVideoConference() {
  const event = await createEvent([phoneLine]);
  await start(event);
  setVideo(true, videoUrl);
  await save(true);

  const saved = await calendar.getItem(event.id);

  Assert.equal(
    saved.getProperty("CONFERENCE"),
    videoUrl,
    "An explicit video URL should replace the phone conference."
  );
});

add_task(async function test_failedSaveRetainsVideoDraft() {
  const editingModes = [false, true];

  for (const editing of editingModes) {
    const event = await createEvent([videoLine]);
    await start(editing ? event : null);
    setVideo(true, videoUrl);
    const draftBeforeSave = structuredClone(draftState());

    const result = await save(editing, {
      transact: async () => {
        throw new Error("Provider failed");
      },
    });

    Assert.equal(
      result.status,
      "error",
      "A failed transaction should report an error."
    );
    assertRetainedDraft(draftBeforeSave);

    if (editing) {
      const saved = await calendar.getItem(event.id);

      Assert.equal(
        saved.getProperty("CONFERENCE"),
        oldUrl,
        "Failure should preserve the saved conference."
      );
    }

    const retryResult = await save(editing);

    Assert.equal(
      retryResult.status,
      "success",
      "The retained draft should allow a retry."
    );
  }
});
