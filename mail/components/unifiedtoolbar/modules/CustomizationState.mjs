/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const MAIN_WINDOW_DOCUMENT = "chrome://messenger/content/messenger.xhtml";
const UNIFIED_TOOLBAR_ID = "unifiedToolbar";
const CUSTOMIZATION_ATTRIBUTE_NAME = "state";

/**
 * @typedef {object} UnifiedToolbarCustomizationState
 * @property {string[]} (spaceName) - Each space has a key on the object,
 *   containing an ordered array of item IDs.
 */

/**
 * Store the customization state for the unified toolbar. Sends a global
 * observer notification.
 *
 * @param {UnifiedToolbarCustomizationState} state
 */
export function storeState(state) {
  Services.xulStore.setValue(
    MAIN_WINDOW_DOCUMENT,
    UNIFIED_TOOLBAR_ID,
    CUSTOMIZATION_ATTRIBUTE_NAME,
    JSON.stringify(state)
  );
  Services.obs.notifyObservers(null, "unified-toolbar-state-change");
}

/**
 * Retrieve the customization state of the unified toolbar.
 *
 * @returns {UnifiedToolbarCustomizationState} A partial representation of the
 *   customization state of the unified toolbar. Missing spaces are in their
 *   default states.
 */
export function getState() {
  let state = {};
  if (
    Services.xulStore.hasValue(
      MAIN_WINDOW_DOCUMENT,
      UNIFIED_TOOLBAR_ID,
      CUSTOMIZATION_ATTRIBUTE_NAME
    )
  ) {
    const rawState = Services.xulStore.getValue(
      MAIN_WINDOW_DOCUMENT,
      UNIFIED_TOOLBAR_ID,
      CUSTOMIZATION_ATTRIBUTE_NAME
    );
    state = JSON.parse(rawState);
  }
  return state;
}
