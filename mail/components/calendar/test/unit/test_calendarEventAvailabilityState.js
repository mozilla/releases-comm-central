/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { store } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/base/content/state/store.mjs"
);
const { resetForCreate, updateSection, clearCalendarEventDraft } =
  ChromeUtils.importESModule(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventDraftSlice.mjs"
  );
const { selectAvailabilityControl, selectCurrentDraft, selectDirtySections } =
  ChromeUtils.importESModule(
    "moz-src:///comm/mail/components/calendar/content/state/calendar-event-create-edit-selectors.mjs"
  );

const sessionKey = "availability-test";

add_setup(function () {
  registerCleanupFunction(() => {
    store.dispatch(clearCalendarEventDraft({ sessionKey }));
  });
});

add_task(function test_availabilityDraft() {
  store.dispatch(
    resetForCreate({ sessionKey, initialDraft: { title: "Event" } })
  );

  const initial = selectAvailabilityControl(store.getState(), sessionKey);

  Assert.equal(initial.value, null, "Missing availability should stay absent");
  Assert.deepEqual(
    selectCurrentDraft(store.getState(), sessionKey),
    { title: "Event" },
    "Rendering should not initialize availability"
  );

  for (const availability of ["default", "busy", "free"]) {
    store.dispatch(
      updateSection({
        sessionKey,
        section: "availability",
        patch: { availability },
      })
    );

    const control = selectAvailabilityControl(store.getState(), sessionKey);

    Assert.equal(
      control.value,
      availability,
      "The selector should return the enum"
    );

    Assert.strictEqual(
      control.baseline,
      initial.baseline,
      "Selection should preserve the baseline identity"
    );

    Assert.deepEqual(
      selectDirtySections(store.getState(), sessionKey),
      ["availability"],
      "Selection should dirty only availability"
    );

    Assert.deepEqual(
      selectCurrentDraft(store.getState(), sessionKey),
      { title: "Event", availability },
      "Selection should preserve other fields"
    );
  }

  const before = selectAvailabilityControl(store.getState(), sessionKey);

  store.dispatch(
    updateSection({ sessionKey, section: "title", patch: { title: "Other" } })
  );

  Assert.strictEqual(
    selectAvailabilityControl(store.getState(), sessionKey),
    before,
    "Unrelated edits should preserve the control view model"
  );

  Assert.equal(
    selectAvailabilityControl(store.getState(), "another").value,
    null,
    "Another session should not inherit availability"
  );

  store.dispatch(
    resetForCreate({ sessionKey, initialDraft: { availability: "free" } })
  );

  Assert.notStrictEqual(
    selectAvailabilityControl(store.getState(), sessionKey).baseline,
    before.baseline,
    "Reset should replace the control lifetime"
  );

  Assert.deepEqual(
    selectDirtySections(store.getState(), sessionKey),
    [],
    "Reset should clear dirty sections"
  );

  store.dispatch(
    updateSection({
      sessionKey,
      section: "availability",
      patch: { availability: "busy" },
    })
  );

  store.dispatch(
    updateSection({
      sessionKey,
      section: "availability",
      patch: { availability: "free" },
    })
  );

  Assert.deepEqual(
    selectDirtySections(store.getState(), sessionKey),
    [],
    "Returning to the baseline should clear availability dirtiness"
  );
});
