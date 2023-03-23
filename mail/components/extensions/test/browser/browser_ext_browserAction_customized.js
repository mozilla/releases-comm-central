/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

async function enforceState(state) {
  const stateChangeObserved = TestUtils.topicObserved(
    "unified-toolbar-state-change"
  );
  storeState(state);
  await stateChangeObserved;
}

add_setup(async () => {
  // Set a customized state for the spaces we are working with in this test.
  await enforceState({
    mail: ["spacer", "search-bar", "spacer"],
    calendar: ["spacer", "search-bar", "spacer"],
  });

  registerCleanupFunction(async () => {
    await enforceState({});
  });
});

// Load browserAction tests.
Services.scriptloader.loadSubScript(
  new URL("test_browserAction.js", gTestPath).href,
  this
);
