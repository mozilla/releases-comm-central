/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { getState, storeState } = ChromeUtils.importESModule(
  "resource:///modules/CustomizationState.mjs"
);
const { getDefaultItemIdsForSpace } = ChromeUtils.importESModule(
  "resource:///modules/CustomizableItems.sys.mjs"
);

add_setup(async function () {
  await setState({});
  Assert.ok(
    window.gSpacesToolbar.isLoaded,
    "Spaces toolbar needs to be loaded"
  );
});

add_task(async function test_default_contents() {
  Assert.equal(
    window.gSpacesToolbar.currentSpace?.name,
    "mail",
    "Should be in mail space"
  );
  checkToolbarContents("mail");
});

add_task(async function test_customized_contents() {
  await setState({
    mail: ["get-messages", "spacer", "throbber"],
  });
  checkToolbarContents("mail");
  await setState({});
});

add_task(async function test_space_switch() {
  const tabmail = document.getElementById("tabmail");
  const toolbarMutation = BrowserTestUtils.waitForMutationCondition(
    document.querySelector("unified-toolbar"),
    { childList: true },
    () => true
  );
  window.gSpacesToolbar.openSpace(
    tabmail,
    window.gSpacesToolbar.spaces.find(space => space.name == "addressbook")
  );
  await toolbarMutation;

  checkToolbarContents("addressbook");

  tabmail.closeTab();
});

/**
 * Assert that the unified toolbar contents match the expected contents.
 *
 * @param {string} space - ID of the space the unified toolbar should be
 *   showing.
 */
function checkToolbarContents(space) {
  const unifiedToolbar = document.querySelector("unified-toolbar");
  const state = getState()[space] ?? getDefaultItemIdsForSpace(space);
  const items = Array.from(
    unifiedToolbar.querySelectorAll(
      "#unifiedToolbarContent > li:not([hidden])"
    ),
    item => item.getAttribute("item-id")
  );
  Assert.deepEqual(
    items,
    state,
    `Unified toolbar contents match expected contents for ${space}`
  );
}

/**
 * Update the state of the unified toolbar contents.
 *
 * @param {object} state - The new state for the unified toolbar.
 */
async function setState(state) {
  const stateUpdated = TestUtils.topicObserved("unified-toolbar-state-change");
  const toolbarMutation = BrowserTestUtils.waitForMutationCondition(
    document.querySelector("unified-toolbar"),
    { childList: true },
    () => true
  );
  storeState(state);
  await stateUpdated;
  await toolbarMutation;
}
