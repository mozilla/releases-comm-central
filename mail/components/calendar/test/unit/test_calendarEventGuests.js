/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { calendarEventDraftSlice, resetFromSource, updateSection } =
  ChromeUtils.importESModule(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventDraftSlice.mjs"
  );
const { selectGuestsViewModel } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/state/calendar-event-create-edit-selectors.mjs"
);

const sessionKey = "calendar-event-guests-test";

function sourceSnapshot(attendees, organizer) {
  return { event: { attendees, organizer } };
}

function draftState(snapshot) {
  return {
    calendarEventDraft: calendarEventDraftSlice.reducer(
      undefined,
      resetFromSource({ sessionKey, snapshot })
    ),
  };
}

add_task(function test_responseCountsIncludeUnknownInTotal() {
  const draftStoreState = draftState(sourceSnapshot([], null));
  draftStoreState.calendarEventDraft = calendarEventDraftSlice.reducer(
    draftStoreState.calendarEventDraft,
    updateSection({
      sessionKey,
      section: "guests",
      patch: {
        attendees: [
          { id: "mailto:yes@example.com", participationStatus: "ACCEPTED" },
          { id: "mailto:no@example.com", participationStatus: "DECLINED" },
          { id: "mailto:maybe@example.com", participationStatus: "TENTATIVE" },
          {
            id: "mailto:pending@example.com",
            participationStatus: "NEEDS-ACTION",
          },
          { id: "mailto:unknown@example.com", participationStatus: "UNKNOWN" },
        ],
        organizer: null,
      },
    })
  );

  Assert.deepEqual(
    selectGuestsViewModel(draftStoreState, sessionKey),
    { invited: 5, attending: 1, notAttending: 1, maybe: 1, pending: 1 },
    "Unknown responses should count only toward the invited total"
  );
});

add_task(function test_organizerCountsOnlyOnce() {
  const draftStoreState = draftState(sourceSnapshot([], null));
  draftStoreState.calendarEventDraft = calendarEventDraftSlice.reducer(
    draftStoreState.calendarEventDraft,
    updateSection({
      sessionKey,
      section: "guests",
      patch: {
        attendees: [
          { id: "mailto:guest@example.com", participationStatus: "DECLINED" },
          { id: "MAILTO:HOST@EXAMPLE.COM", participationStatus: "ACCEPTED" },
        ],
        organizer: { id: "mailto:host@example.com" },
      },
    })
  );
  const guestsSummary = selectGuestsViewModel(draftStoreState, sessionKey);

  Assert.equal(guestsSummary.attending, 1, "The organizer is attending");
  Assert.equal(
    guestsSummary.invited,
    2,
    "The organizer should count once when their ID matches an attendee"
  );
});
