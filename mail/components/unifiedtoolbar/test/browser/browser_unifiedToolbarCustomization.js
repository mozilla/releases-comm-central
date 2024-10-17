/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { getState, storeState } = ChromeUtils.importESModule(
  "resource:///modules/CustomizationState.mjs"
);
const { default: customizableItemDetails } = ChromeUtils.importESModule(
  "resource:///modules/CustomizableItemsDetails.mjs"
);

/**
 * Integration tests for unified toolbar customization.
 */

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
    const tab = tabs.find(t => t.id.endsWith(space.name));
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

add_task(async function test_add_item_context_menu() {
  const initialState = getState();
  const customization = await openCustomization();

  const contextMenu = document.getElementById("customizationPaletteMenu");
  const tabPane = customization.querySelector(
    "unified-toolbar-customization-pane:not([hidden])"
  );
  const item = tabPane.shadowRoot.querySelector(
    '.customization-palettes li[is="customizable-element"]'
  );
  const toolbarTarget = tabPane.shadowRoot.querySelector(".toolbar-target");

  EventUtils.synthesizeMouseAtCenter(item, {
    type: "contextmenu",
  });
  await BrowserTestUtils.waitForPopupEvent(contextMenu, "shown");
  const menuItem = contextMenu.querySelector('menuitem:not([hidden="true"])');

  contextMenu.activateItem(menuItem);
  await BrowserTestUtils.waitForPopupEvent(contextMenu, "hidden");

  Assert.ok(toolbarTarget.contains(item), "Item is in toolbar target");

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
    ["spacer", item.getAttribute("item-id")],
    "Mail space has the expected new unified toolbar state"
  );
  await setState({});
});

add_task(async function test_remove_item_context_menu() {
  await setState({ mail: ["move-to", "spacer"] });
  const initialState = getState();
  const customization = await openCustomization();

  const contextMenu = document.getElementById("customizationTargetMenu");
  const tabPane = customization.querySelector(
    "unified-toolbar-customization-pane:not([hidden])"
  );
  const target = tabPane.shadowRoot.querySelector(".toolbar-target");
  const item = target.querySelector('li[is="customizable-element"]');

  EventUtils.synthesizeMouseAtCenter(item, {
    type: "contextmenu",
  });
  await BrowserTestUtils.waitForPopupEvent(contextMenu, "shown");

  contextMenu.activateItem(
    document.getElementById("customizationTargetRemove")
  );
  await BrowserTestUtils.waitForPopupEvent(contextMenu, "hidden");

  Assert.ok(
    !target.contains(item),
    "Item was removed from customization target"
  );

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

add_task(async function test_keyboard_selection_target() {
  await setState({ mail: ["move-to", "quick-filter-bar", "spacer"] });
  const initialState = getState();
  const customization = await openCustomization();
  const firstTab = customization.querySelector("unified-toolbar-tab");
  const tabPane = customization.querySelector(
    "unified-toolbar-customization-pane:not([hidden])"
  );
  const toolbarTarget = tabPane.shadowRoot.querySelector(".toolbar-target");
  const firstToolbarItem = toolbarTarget.querySelector("li:first-child");
  const rightIsForward = document.dir !== "rtl";
  const forwardKey = `KEY_Arrow${getKey(true, rightIsForward)}`;
  const backwardKey = `KEY_Arrow${getKey(false, rightIsForward)}`;

  function pressKeyAndCheckFocus(key, focusedIndex, message) {
    EventUtils.synthesizeKey(key);
    Assert.strictEqual(
      toolbarTarget.selectedItem,
      Array.from(toolbarTarget.children).at(focusedIndex),
      message
    );
  }

  await TestUtils.waitForCondition(
    () => document.activeElement === firstTab,
    "Focus on first tab"
  );
  EventUtils.synthesizeKey("KEY_Tab");

  Assert.strictEqual(
    tabPane.shadowRoot.activeElement,
    toolbarTarget,
    "Toolbar target is selected"
  );
  Assert.strictEqual(
    toolbarTarget.selectedItem,
    firstToolbarItem,
    "First item is initially selected"
  );

  pressKeyAndCheckFocus(forwardKey, 1, "Forward moves to second item");
  pressKeyAndCheckFocus(forwardKey, 2, "Forward moves to third item");

  pressKeyAndCheckFocus(backwardKey, 1, "Backward moves to second item");
  pressKeyAndCheckFocus(backwardKey, 0, "Backward moves to the first item");

  pressKeyAndCheckFocus("KEY_End", -1, "End moves to the last item");
  pressKeyAndCheckFocus("KEY_Home", 0, "Home returns to the first item");

  const newState = getState();
  Assert.deepEqual(
    newState,
    initialState,
    "Unified toolbar state was not changed"
  );
  await setState({});
});

add_task(async function test_keyboard_selection_palette() {
  const initialState = getState();
  const customization = await openCustomization();
  const firstTab = customization.querySelector("unified-toolbar-tab");
  const tabPane = customization.querySelector(
    "unified-toolbar-customization-pane:not([hidden])"
  );
  const palette = tabPane.shadowRoot.querySelector(
    ".customization-palettes ul"
  );
  const firstItem = palette.querySelector("li:first-child");
  const rightIsForward = document.dir !== "rtl";
  const forwardKey = `KEY_Arrow${getKey(true, rightIsForward)}`;
  const backwardKey = `KEY_Arrow${getKey(false, rightIsForward)}`;

  function pressKeyAndCheckFocus(key, focusedIndex, message) {
    EventUtils.synthesizeKey(key);
    Assert.strictEqual(
      palette.selectedItem,
      Array.from(palette.children).at(focusedIndex),
      message
    );
  }

  await TestUtils.waitForCondition(
    () => document.activeElement === firstTab,
    "Focus on first tab"
  );
  EventUtils.synthesizeKey("KEY_Tab");
  // Focus on toolbar preview.
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

  Assert.strictEqual(
    tabPane.shadowRoot.activeElement,
    palette,
    "Toolbar palette is selected"
  );
  Assert.strictEqual(
    palette.selectedItem,
    firstItem,
    "First item is initially selected"
  );

  pressKeyAndCheckFocus(forwardKey, 1, "Forward moves to second item");
  pressKeyAndCheckFocus(forwardKey, 2, "Forward moves to third item");

  pressKeyAndCheckFocus(backwardKey, 1, "Backward moves to second item");
  pressKeyAndCheckFocus(backwardKey, 0, "Backward moves to the first item");

  pressKeyAndCheckFocus("KEY_End", -1, "End moves to the last item");
  pressKeyAndCheckFocus("KEY_Home", 0, "Home returns to the first item");

  const newState = getState();
  Assert.deepEqual(
    newState,
    initialState,
    "Unified toolbar state was not changed"
  );
  await setState({});
});

add_task(async function test_palette_filter() {
  const customization = await openCustomization();
  const firstTab = customization.querySelector("unified-toolbar-tab");
  const tabPane = customization.querySelector(
    "unified-toolbar-customization-pane:not([hidden])"
  );
  const palette = tabPane.shadowRoot.querySelector(
    ".customization-palettes ul"
  );
  const searchBar = tabPane.shadowRoot.querySelector("search-bar");

  await TestUtils.waitForCondition(
    () => document.activeElement === firstTab,
    "Focus on first tab"
  );
  EventUtils.synthesizeKey("KEY_Tab");
  // Focus on toolbar preview.
  await TestUtils.waitForCondition(
    () => document.activeElement === tabPane,
    "Focus in visible tab pane"
  );
  EventUtils.synthesizeKey("KEY_Tab");
  // Focus on search box.
  await TestUtils.waitForTick();

  const eventPromise = BrowserTestUtils.waitForEvent(searchBar, "autocomplete");
  EventUtils.sendString("Test");
  await eventPromise;

  for (const child of palette.children) {
    Assert.ok(
      BrowserTestUtils.isHidden(child),
      "Palette child should be filtered out"
    );
  }

  const clearPromise = BrowserTestUtils.waitForEvent(searchBar, "autocomplete");
  EventUtils.synthesizeKey("KEY_Escape");
  await clearPromise;

  for (const child of palette.children) {
    Assert.ok(
      BrowserTestUtils.isVisible(child),
      "Palette child should be visible"
    );
  }
});

add_task(async function test_reorder_item_keyboard() {
  await setState({ mail: ["move-to", "spacer"] });
  const initialState = getState();
  const customization = await openCustomization();
  const firstTab = customization.querySelector("unified-toolbar-tab");
  const saveButton = customization.querySelector(
    '#customizationFooter button[type="submit"]'
  );
  const tabPane = customization.querySelector(
    "unified-toolbar-customization-pane:not([hidden])"
  );
  const target = tabPane.shadowRoot.querySelector(".toolbar-target");
  const item = target.querySelector('li[item-id="move-to"]');
  const rightIsForward = document.dir !== "rtl";
  const forwardKey = `KEY_Arrow${getKey(true, rightIsForward)}`;
  const backwardKey = `KEY_Arrow${getKey(false, rightIsForward)}`;

  await TestUtils.waitForCondition(
    () => document.activeElement === firstTab,
    "Focus on first tab"
  );
  EventUtils.synthesizeKey("KEY_Tab");
  // Focus on toolbar preview.
  await TestUtils.waitForCondition(
    () => document.activeElement === tabPane,
    "Focus in visible tab pane"
  );
  Assert.equal(
    tabPane.shadowRoot.activeElement,
    target,
    "Toolbar target should be active"
  );
  Assert.equal(target.selectedItem, item, "Item should be selected");

  EventUtils.synthesizeKey(forwardKey, {
    altKey: true,
  });

  Assert.ok(!saveButton.disabled, "Save button is enabled");
  Assert.deepEqual(
    Array.from(target.children, child => child.getAttribute("item-id")),
    ["spacer", "move-to"],
    "Items in target were reordered"
  );

  EventUtils.synthesizeKey(backwardKey, {
    altKey: true,
  });

  Assert.ok(saveButton.disabled, "Save button is disabled");
  Assert.deepEqual(
    Array.from(target.children, child => child.getAttribute("item-id")),
    ["move-to", "spacer"],
    "Item reordered backward"
  );

  EventUtils.synthesizeKey("KEY_End", {
    altKey: true,
  });

  Assert.ok(!saveButton.disabled, "Save button is enabled");
  Assert.deepEqual(
    Array.from(target.children, child => child.getAttribute("item-id")),
    ["spacer", "move-to"],
    "Item in target reordered to end"
  );

  EventUtils.synthesizeKey("KEY_Home", {
    altKey: true,
  });

  Assert.ok(saveButton.disabled, "Save button is disabled");

  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("unifiedToolbarCustomizationCancel"),
    {}
  );
  const finalState = getState();

  Assert.deepEqual(finalState, initialState, "Test setup state restored");

  await setState({});
});

add_task(async function test_reorder_item_context_menu() {
  await setState({ mail: ["move-to", "spacer"] });
  const initialState = getState();
  const customization = await openCustomization();

  const contextMenu = document.getElementById("customizationTargetMenu");
  const tabPane = customization.querySelector(
    "unified-toolbar-customization-pane:not([hidden])"
  );
  const target = tabPane.shadowRoot.querySelector(".toolbar-target");
  const item = target.querySelector('li[item-id="move-to"]');

  EventUtils.synthesizeMouseAtCenter(item, {
    type: "contextmenu",
  });
  await BrowserTestUtils.waitForPopupEvent(contextMenu, "shown");

  contextMenu.activateItem(document.getElementById("customizationTargetEnd"));
  await BrowserTestUtils.waitForPopupEvent(contextMenu, "hidden");

  const saveButton = customization.querySelector(
    '#customizationFooter button[type="submit"]'
  );
  Assert.ok(!saveButton.disabled, "Save button is enabled");
  Assert.deepEqual(
    Array.from(target.children, child => child.getAttribute("item-id")),
    ["spacer", "move-to"],
    "Items in target were reordered"
  );

  EventUtils.synthesizeMouseAtCenter(item, {
    type: "contextmenu",
  });
  await BrowserTestUtils.waitForPopupEvent(contextMenu, "shown");

  Assert.ok(
    document.getElementById("customizationTargetEnd").disabled,
    "Can't move to end"
  );
  Assert.ok(
    document.getElementById("customizationTargetForward").disabled,
    "Can't move forward"
  );
  Assert.ok(
    !document.getElementById("customizationTargetBackward").disabled,
    "Can move backward"
  );
  Assert.ok(
    !document.getElementById("customizationTargetStart").disabled,
    "Can move to start"
  );

  contextMenu.activateItem(
    document.getElementById("customizationTargetBackward")
  );
  await BrowserTestUtils.waitForPopupEvent(contextMenu, "hidden");

  Assert.ok(saveButton.disabled, "Save button is disabled");

  EventUtils.synthesizeKey("KEY_Escape");
  const finalState = getState();

  Assert.deepEqual(finalState, initialState, "Test setup state restored");

  await setState({});
});

add_task(async function test_palette_contents() {
  const customization = await openCustomization();
  const panes = customization.querySelectorAll(
    "unified-toolbar-customization-pane"
  );
  /**
   * Check if an item is offered in a customization pane. Switches to the pane,
   * so the item should be visibile if it exists.
   *
   * @param {string} itemId - ID of the item.
   * @param {UnifiedToolbarCustomizationPane} pane - The pane to check.
   * @param {boolean} spaceSpecific - If the item is space specific.
   * @returns
   */
  function inPaneOrTarget(itemId, pane, spaceSpecific) {
    document.getElementById(pane.getAttribute("aria-labelledby")).select();
    const targetSelector = `:is(.toolbar-target,${
      spaceSpecific ? ".space-specific-palette" : ".generic-palette"
    }) [item-id="${itemId}"]`;
    const element = pane.shadowRoot.querySelector(targetSelector);
    return Boolean(element) && BrowserTestUtils.isVisible(element);
  }
  for (const item of customizableItemDetails) {
    if (item.id === "search-bar") {
      // Global search bar is disabled in this test.
      continue;
    }
    for (const pane of panes) {
      const space = pane.getAttribute("space");
      if (item.spaces) {
        Assert.equal(
          inPaneOrTarget(item.id, pane, true),
          item.spaces.includes(space),
          `${item.id} availablility should match for space ${space}`
        );
      } else {
        Assert.ok(
          inPaneOrTarget(item.id, pane, false),
          `Item ${item.id} should be available in ${space}`
        );
      }
    }
  }

  document.getElementById("unified-toolbar-customization-tab-mail").select();
  EventUtils.synthesizeKey("KEY_Escape");
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

/**
 * Returns the key name for going forward and backward.
 *
 * @param {boolean} forward - If the returned key should be for forward.
 * @param {boolean} rightIsForward - If right is the direction of forward
 * @returns {string} Key name.
 */
function getKey(forward, rightIsForward) {
  return forward === rightIsForward ? "Right" : "Left";
}
