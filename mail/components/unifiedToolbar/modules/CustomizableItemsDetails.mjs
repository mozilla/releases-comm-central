/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* This has the following companion definition files:
 * - unifiedToolbarCustomizableItems.css for the preview icons based on the id.
 * - unifiedToolbarItems.ftl for the labels associated with the labelId.
 * - unifiedToolbarCustomizableItems.inc.xhtml for the templates referenced with
 *   templateId.
 */

/**
 * @typedef {object} CustomizableItemDetails
 * @property {string} id - The ID of the item. Will be set as a class on the
 *   outer wrapper.
 * @property {string} labelId - Fluent ID for the label shown while in the
 *   palette.
 * @property {boolean} [allowMultiple] - If this item can be added more than
 *   once to a space.
 * @property {string[]} [spaces] - If empty or omitted, item is allowed in all
 *   spaces.
 * @property {string} [templateId] - ID of template defining the "live" markup.
 * @property {string[]} [requiredModules] - List of modules that must be loaded
 *   for the template of this item.
 */

/**
 * @type {CustomizableItemDetails[]}
 */
export default [
  {
    id: "spacer",
    labelId: "spacer",
    allowMultiple: true,
  },
  {
    id: "search-bar",
    labelId: "search-bar",
    templateId: "searchBarItemTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/search-bar.mjs",
    ],
  },
];
