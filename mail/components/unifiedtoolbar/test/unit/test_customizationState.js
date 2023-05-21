/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
const { storeState, getState } = ChromeUtils.importESModule(
  "resource:///modules/CustomizationState.mjs"
);

add_setup(function () {
  // Ensure xulStore has a profile to refer to.
  do_get_profile();
});

add_task(function test_getState_empty() {
  const state = getState();
  Assert.equal(typeof state, "object", "State should be an object");
  Assert.deepEqual(state, {}, "Empty state should be an empty object");
});

add_task(async function test_storeState_observer() {
  const stateChangeObserved = TestUtils.topicObserved(
    "unified-toolbar-state-change"
  );
  storeState({
    mail: ["write-message", "spacer", "search-bar", "spacer"],
  });
  await stateChangeObserved;
});

add_task(function test_storeState_getState() {
  const state = {
    mail: ["write-message", "spacer", "search-bar", "spacer"],
    calendar: [],
  };
  const previousState = getState();
  Assert.notDeepEqual(
    previousState,
    state,
    "Current state should be different from the state to write"
  );
  storeState(state);
  const newState = getState();
  Assert.deepEqual(
    newState,
    state,
    "State loaded should matche the stored state"
  );
  Assert.notStrictEqual(
    newState,
    state,
    "State loaded should not be the same object as what was saved"
  );
});

registerCleanupFunction(() => {
  Services.xulStore.removeValue(
    "chrome://messenger/content/messenger.xhtml",
    "unifiedToolbar",
    "state"
  );
});
