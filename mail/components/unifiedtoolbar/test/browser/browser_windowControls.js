/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { storeState } = ChromeUtils.importESModule(
  "resource:///modules/CustomizationState.mjs"
);
const { getAvailableItemIdsForSpace } = ChromeUtils.importESModule(
  "resource:///modules/CustomizableItems.sys.mjs"
);

add_setup(async function () {
  await setState({});
  Assert.ok(
    window.gSpacesToolbar.isLoaded,
    "Spaces toolbar needs to be loaded"
  );
  Assert.ok(
    Services.prefs.getBoolPref("mail.tabs.drawInTitlebar"),
    "Should be drawing our own titlebar"
  );
});

add_task(function test_normalLayout() {
  assertWindowControlsVisible();
});

add_task(async function test_filledToolbar() {
  await setState({
    mail: getAvailableItemIdsForSpace("mail", true),
  });

  assertWindowControlsVisible();

  await setState({});
});

add_task(async function test_emptyToolbar() {
  await setState({
    mail: [],
  });

  assertWindowControlsVisible();

  await setState({});
});

add_task(async function test_unifiedToolbarCustomization() {
  const unifiedToolbar = document.querySelector("unified-toolbar");
  const customizationInserted = BrowserTestUtils.waitForMutationCondition(
    document,
    {
      subtree: true,
      childList: true,
    },
    () => document.querySelector("unified-toolbar-customization")
  );
  unifiedToolbar.showCustomization();
  await customizationInserted;
  const customization = document.querySelector("unified-toolbar-customization");
  await TestUtils.waitForCondition(() => customization.hasConnected);

  assertWindowControlsVisible();

  customization.toggle(false);
});

/**
 * Check that the close button of the window controls is visible and within the
 * visible parts of the window.
 */
function assertWindowControlsVisible() {
  const titlebarButtons = document.querySelector(
    "#unifiedToolbarContainer .titlebar-buttonbox-container .titlebar-buttonbox"
  );
  // On Mac OSX the close button doesn't have any size in the CSS model, so we
  // just check the properties of the entire button box.
  const closeButton =
    AppConstants.platform == "macosx"
      ? titlebarButtons
      : titlebarButtons.querySelector(".titlebar-close");
  Assert.ok(
    BrowserTestUtils.isVisible(closeButton),
    "Close button should be visible by computed styles"
  );
  const closeBoundingBox = closeButton.getBoundingClientRect();
  Assert.greaterOrEqual(
    closeBoundingBox.left,
    window.scrollX,
    "Left side of close button visible"
  );
  Assert.lessOrEqual(
    closeBoundingBox.right,
    window.scrollX + window.innerWidth,
    "Right side of close button visible"
  );
  // Windows has a negative margin by 1 pixel, we compensate for that by
  // requiring the button to be at least 2 pixels high later on.
  const windowTop =
    AppConstants.platform == "win" ? window.scrollY - 1 : window.scrollY;
  Assert.greaterOrEqual(
    closeBoundingBox.top,
    windowTop,
    "Top of close button visible"
  );
  Assert.lessOrEqual(
    closeBoundingBox.bottom,
    window.scrollY + window.innerHeight,
    "Bottom of close button visible"
  );
  Assert.greaterOrEqual(
    closeBoundingBox.width,
    1,
    "Close button is at least 1 pixel wide"
  );
  const minimumHeight = AppConstants.platform == "win" ? 2 : 1;
  Assert.greaterOrEqual(
    closeBoundingBox.height,
    minimumHeight,
    "Close button is at least 1 visible pixel high"
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
