/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import CUSTOMIZABLE_ITEMS from "resource:///modules/CustomizableItemsDetails.mjs";
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
});
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "glodaEnabled",
  "mailnews.database.global.indexer.enabled",
  true,
  () => Services.obs.notifyObservers(null, "unified-toolbar-state-change")
);

const DEFAULT_ITEMS = ["spacer", "search-bar", "spacer"];
const DEFAULT_ITEMS_WITHOUT_SEARCH = ["spacer"];

/**
 * @type {{id: string, spaces: string[], installDate: Date}[]}
 */
const EXTENSIONS = [];

export const EXTENSION_PREFIX = "ext-";

/**
 * Add an extension button that is available in the given spaces. Defaults to
 * making the button only available in the mail space. To provide it in all
 * spaces, pass an empty array for the spaces.
 *
 * @param {string} id - Extension ID to add the button for.
 * @param {string[]} [spaces=["mail"]] - Array of spaces the button can be used
 *   in.
 */
export async function registerExtension(id, spaces = ["mail"]) {
  if (EXTENSIONS.some(extension => extension.id === id)) {
    return;
  }
  const addon = await lazy.AddonManager.getAddonByID(id);
  EXTENSIONS.push({
    id,
    spaces,
    installDate: addon?.installDate ?? new Date(),
  });
  EXTENSIONS.sort(
    (extA, extB) => extA.installDate.valueOf() - extB.installDate.valueOf()
  );
}

/**
 * Remove the extension from the palette of available items.
 *
 * @param {string} id - Extension ID to remove.
 */
export function unregisterExtension(id) {
  const index = EXTENSIONS.findIndex(extension => extension.id === id);
  EXTENSIONS.splice(index, 1);
}

/**
 * Get the IDs for the extension buttons available in a given space.
 *
 * @param {string} [space] - Space name, "default" or falsy value to specify the
 *   space the extension items should be returned for. For default, extensions
 *   explicitly available in the default space are returned. With a falsy value,
 *   extensions available in all spaces are returned.
 * @param {boolean} [includeSpaceAgnostic=false] - When set, extensions that are
 *   available for all spaces and the provided space are returned. Only has an
 *   effect if space is not falsy.
 * @returns {string[]} Array of item IDs for extensions in the given space.
 */
function getExtensionsForSpace(space, includeSpaceAgnostic = false) {
  return EXTENSIONS.filter(
    extension =>
      (space && extension.spaces?.includes(space)) ||
      ((!space || includeSpaceAgnostic) && !extension.spaces?.length)
  ).map(extension => `${EXTENSION_PREFIX}${extension.id}`);
}

/**
 * Get the items available for the unified toolbar in a given space.
 *
 * @param {string} [space] - ID of the space to get the available exclusive
 *   items of. When omitted only items allowed in all spaces are returned.
 * @param {boolean} [includeSpaceAgnostic=false] - When set, extensions that are
 *   available for all spaces and the provided space are returned. Only has an
 *   effect if space is not falsy.
 * @returns {string[]} Array of item IDs available in the space.
 */
export function getAvailableItemIdsForSpace(
  space,
  includeSpaceAgnostic = false
) {
  return CUSTOMIZABLE_ITEMS.filter(
    item =>
      ((space && item.spaces?.includes(space)) ||
        ((!space || includeSpaceAgnostic) &&
          (!item.spaces || item.spaces.length === 0))) &&
      (item.id !== "search-bar" || lazy.glodaEnabled)
  )
    .map(item => item.id)
    .concat(getExtensionsForSpace(space, includeSpaceAgnostic));
}

/**
 * Retrieve the set of items that are in the default configuration of the
 * toolbar for a given space.
 *
 * @param {string} space - ID of the space to get the default items for.
 *   "default" is passed to indicate a default state without any active space.
 * @returns {string[]} Array of item IDs to show by default in the space.
 */
export function getDefaultItemIdsForSpace(space) {
  return (
    lazy.glodaEnabled ? DEFAULT_ITEMS : DEFAULT_ITEMS_WITHOUT_SEARCH
  ).concat(getExtensionsForSpace(space, true));
}

/**
 * Set of item IDs that can occur more than once in the targets of a space.
 *
 * @type {Set<string>}
 */
export const MULTIPLE_ALLOWED_ITEM_IDS = new Set(
  CUSTOMIZABLE_ITEMS.filter(item => item.allowMultiple).map(item => item.id)
);

export const SKIP_FOCUS_ITEM_IDS = new Set(
  CUSTOMIZABLE_ITEMS.filter(item => item.skipFocus).map(item => item.id)
);
