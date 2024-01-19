/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { getState, storeState } = ChromeUtils.importESModule(
  "resource:///modules/CustomizationState.mjs"
);

add_setup(async function () {
  storeState({});
  Assert.ok(
    window.gSpacesToolbar.isLoaded,
    "Spaces toolbar needs to be loaded"
  );
  registerCleanupFunction(() => {
    storeState({});
  });
});

add_task(async function test_open_customization() {
  const initialState = getState();
  const unifiedToolbar = document.querySelector("unified-toolbar");
  const popup = document.getElementById("unifiedToolbarMenu");
  const popupShowing = BrowserTestUtils.waitForEvent(popup, "popupshown");
  EventUtils.synthesizeMouseAtCenter(unifiedToolbar, {
    button: 2,
    type: "contextmenu",
  });
  await popupShowing;

  popup.activateItem(document.getElementById("unifiedToolbarCustomize"));

  await TestUtils.waitForCondition(
    () => document.querySelector("unified-toolbar-customization"),
    "Customization is inserted into the document"
  );
  const customization = document.querySelector("unified-toolbar-customization");

  await TestUtils.waitForCondition(() => customization.hasConnected);

  Assert.ok(
    BrowserTestUtils.isVisible(customization),
    "Customization is visible after being inserted"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(unifiedToolbar),
    "Unified toolbar is still visible during customization"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(
      unifiedToolbar.querySelector("#unifiedToolbarContent")
    ),
    "Toolbar content is hidden during customization"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(document.getElementById("tabmail")),
    "Tabs are hidden during customization"
  );

  const tabs = Array.from(
    customization.querySelectorAll("unified-toolbar-tab")
  );
  const tabsWithSpaces = new Set();
  for (const space of window.gSpacesToolbar.spaces) {
    const tab = tabs.find(tab => tab.id.endsWith(space.name));
    Assert.ok(tab, `There is a tab for space ${space.name}`);
    Assert.ok(
      customization.querySelector(
        `#unified-toolbar-customization-pane-${space.name}`
      ),
      `${space.name} tab has a pane`
    );
    if (space === window.gSpacesToolbar.currentSpace) {
      Assert.equal(
        tab.getAttribute("selected"),
        "true",
        `Tab for current space (${space.name}) is selected`
      );
    }
    tabsWithSpaces.add(tab);
  }
  Assert.equal(
    tabsWithSpaces.size,
    tabs.length,
    "All tabs have an associated space"
  );

  EventUtils.synthesizeKey("KEY_Escape");
  Assert.ok(
    BrowserTestUtils.isHidden(customization),
    "Customization is closed"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(unifiedToolbar),
    "Unified toolbar is still visible after closing customization"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(
      unifiedToolbar.querySelector("#unifiedToolbarContent")
    ),
    "Toolbar content is visible again after customization"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(document.getElementById("tabmail")),
    "Tabs are visible again after customization"
  );
  Assert.deepEqual(
    getState(),
    initialState,
    "Unified toolbar state remains unchanged"
  );
});

add_task(async function test_add_item() {
  const initialState = getState();
  const customization = await openCustomization();
  const firstTab = customization.querySelector("unified-toolbar-tab");
  await TestUtils.waitForCondition(
    () => document.activeElement === firstTab,
    "Focus on first tab"
  );
  EventUtils.synthesizeKey("KEY_Tab");
  // Focus on toolbar preview.
  const tabPane = customization.querySelector(
    "unified-toolbar-customization-pane:not([hidden])"
  );
  await TestUtils.waitForCondition(
    () => document.activeElement === tabPane,
    "Focus in visible tab pane"
  );
  EventUtils.synthesizeKey("KEY_Tab");
  // Focus on search box.
  await TestUtils.waitForTick();
  EventUtils.synthesizeKey("KEY_Tab");
  // Focus on search box button.
  await TestUtils.waitForTick();
  EventUtils.synthesizeKey("KEY_Tab");
  // Focus possibly on the scroll container.
  if (
    tabPane.shadowRoot?.activeElement.classList.contains(
      "customization-palettes"
    )
  ) {
    await TestUtils.waitForTick();
    EventUtils.synthesizeKey("KEY_Tab");
  }
  // Focus on mail space palette.
  await TestUtils.waitForTick();
  EventUtils.synthesizeKey("KEY_Enter");

  const saveButton = customization.querySelector(
    '#customizationFooter button[type="submit"]'
  );
  Assert.ok(!saveButton.disabled, "Save button is enabled");

  const stateChange = TestUtils.topicObserved("unified-toolbar-state-change");
  EventUtils.synthesizeMouseAtCenter(saveButton, {});

  await stateChange;
  const newState = getState();
  Assert.notDeepEqual(
    newState,
    initialState,
    "Unified toolbar state was changed"
  );
  Assert.deepEqual(
    newState.mail,
    ["spacer", "move-to"],
    "Mail space has the expected new unified toolbar state"
  );
  await setState({});
});

add_task(async function test_remove_item() {
  await setState({ mail: ["move-to", "spacer"] });
  const initialState = getState();
  const customization = await openCustomization();
  EventUtils.synthesizeKey("KEY_Tab");
  // focus on toolbar preview
  await TestUtils.waitForTick();
  EventUtils.synthesizeKey("KEY_Delete");

  const saveButton = customization.querySelector(
    '#customizationFooter button[type="submit"]'
  );
  Assert.ok(!saveButton.disabled, "Save button is enabled");

  const stateChange = TestUtils.topicObserved("unified-toolbar-state-change");
  EventUtils.synthesizeMouseAtCenter(saveButton, {});

  await stateChange;
  const newState = getState();
  Assert.notDeepEqual(
    newState,
    initialState,
    "Unified toolbar state was changed"
  );
  Assert.deepEqual(
    newState.mail,
    undefined,
    "Mail space has the expected new unified toolbar state"
  );
  await setState({});
});

add_task(async function test_reset_default() {
  await setState({ mail: ["move-to", "spacer", "chat"] });
  const customization = await openCustomization();
  const resetButton = customization.querySelector(
    '#customizationFooter button[type="reset"]'
  );
  EventUtils.synthesizeMouseAtCenter(resetButton, {});

  const saveButton = customization.querySelector(
    '#customizationFooter button[type="submit"]'
  );
  Assert.ok(!saveButton.disabled, "Save button is enabled");

  const stateChange = TestUtils.topicObserved("unified-toolbar-state-change");
  EventUtils.synthesizeMouseAtCenter(saveButton, {});

  await stateChange;
  Assert.deepEqual(getState(), {}, "Unified toolbar state was changed");
});

/**
 * Update the state of the unified toolbar and wait for the operation to
 * complete.
 *
 * @param {object} state - Unified toolbar state to store.
 */
async function setState(state) {
  const stateChange = TestUtils.topicObserved("unified-toolbar-state-change");
  storeState(state);
  await stateChange;
}

/**
 * Open the unified toolbar customization UI.
 *
 * @returns {UnifiedToolbarCustomization} The customization instance.
 */
async function openCustomization() {
  const unifiedToolbar = document.querySelector("unified-toolbar");
  unifiedToolbar.showCustomization();
  const customization = document.querySelector("unified-toolbar-customization");
  await TestUtils.waitForCondition(() => customization.hasConnected);
  return customization;
}
