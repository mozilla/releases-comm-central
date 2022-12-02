/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import CUSTOMIZABLE_ITEMS from "resource:///modules/CustomizableItemsDetails.mjs";

//TODO dynamic registry for extensions that have dynamic labels etc.

/**
 * Get the items available for the unified toolbar in a given space.
 *
 * @param {string} [space] - ID of the space to get the available exclusive
 *   items of. When omitted only items allowed in all spaces are returned.
 * @returns {string[]} Array of item IDs available in the space.
 */
export function getItemIdsForSpace(space) {
  return CUSTOMIZABLE_ITEMS.filter(item =>
    space
      ? item.spaces?.includes(space)
      : !item.spaces || item.spaces.length === 0
  ).map(item => item.id);
}
