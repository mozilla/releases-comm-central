/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  getState,
  storeState,
} from "resource:///modules/CustomizationState.mjs";
import {
  MULTIPLE_ALLOWED_ITEM_IDS,
  EXTENSION_PREFIX,
  getAvailableItemIdsForSpace,
} from "resource:///modules/CustomizableItems.sys.mjs";
import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};
XPCOMUtils.defineLazyModuleGetters(lazy, {
  getCachedAllowedSpaces: "resource:///modules/ExtensionToolbarButtons.jsm",
  setCachedAllowedSpaces: "resource:///modules/ExtensionToolbarButtons.jsm",
  ExtensionCommon: "resource://gre/modules/ExtensionCommon.jsm",
});

/**
 * Maps XUL toolbar item IDs to unified toolbar item IDs. If null, the item is
 * not available in the unified toolbar.
 */
const MIGRATION_MAP = {
  separator: null,
  spacer: "spacer",
  spring: "spacer",
  "button-getmsg": "get-messages",
  "button-newmsg": "write-message",
  "button-reply": "reply",
  "button-replyall": "reply-all",
  "button-replylist": "reply-list",
  "button-forward": "forward-inline",
  "button-redirect": "redirect",
  "button-file": "move-to",
  "button-archive": "archive",
  "button-showconversation": "conversation",
  "button-goback": "go-back",
  "button-goforward": "go-forward",
  "button-previous": "previous-unread",
  "button-previousMsg": "previous",
  "button-next": "next-unread",
  "button-nextMsg": "next",
  "button-junk": "junk",
  "button-delete": "delete",
  "button-print": "print",
  "button-mark": "mark-as",
  "button-tag": "tag-message",
  "qfb-show-filter-bar": "quick-filter-bar",
  "button-address": "address-book",
  "button-chat": "chat",
  "throbber-box": "throbber",
  "button-stop": "stop",
  "button-compact": "compact",
  "folder-location-container": "folder-location",
  "mailviews-container": "view-picker",
  "button-addons": "add-ons-and-themes",
  "button-appmenu": null,
  "gloda-search": "search-bar",
  "lightning-button-calendar": "calendar",
  "lightning-button-tasks": "tasks",
  extractEventButton: "add-as-event",
  extractTaskButton: "add-as-task",
  "menubar-items": null,
  "calendar-synchronize-button": "synchronize",
  "calendar-newevent-button": "new-event",
  "calendar-newtask-button": "new-task",
  "calendar-goto-today-button": "go-to-today",
  "calendar-edit-button": "edit-event",
  "calendar-delete-button": "delete-event",
  "calendar-print-button": "print-event",
  "calendar-unifinder-button": "unifinder",
  "calendar-appmenu-button": null,
  "task-synchronize-button": "synchronize",
  "task-newevent-button": "new-event",
  "task-newtask-button": "new-task",
  "task-edit-button": "edit-event",
  "task-delete-button": "delete-event",
  "task-print-button": "print-event",
  "task-appmenu-button": null,
};

/**
 * Maps space names to the ID of the toolbar in the messenger window.
 */
const TOOLBAR_FOR_SPACE = {
  mail: "mail-bar3",
  calendar: "calendar-toolbar2",
  tasks: "task-toolbar2",
};

/**
 * XUL toolbars store a special value when there are no items in the toolbar.
 */
const EMPTY_SET = "__empty";
/**
 * Map from the XUL toolbar id to its default set. Since toolbars we're
 * migrating were removed from the DOM. The value should be the value of the
 * defaultset attribute of the respective element in the markup.
 *
 * @type {{[string]: string}}
 */
const XUL_TOOLBAR_DEFAULT_SET = {
  "mail-bar3":
    AppConstants.platform == "macosx"
      ? "button-getmsg,button-newmsg,button-tag,qfb-show-filter-bar,spring,gloda-search,button-appmenu"
      : "button-getmsg,button-newmsg,separator,button-tag,qfb-show-filter-bar,spring,gloda-search,button-appmenu",
  "tabbar-toolbar": "",
  "toolbar-menubar": "menubar-items,spring",
  "calendar-toolbar2":
    "calendar-synchronize-button,calendar-newevent-button,calendar-newtask-button,calendar-edit-button,calendar-delete-button,spring,calendar-appmenu-button",
  "task-toolbar2":
    "task-synchronize-button,task-newevent-button,task-newtask-button,task-edit-button,task-delete-button,spring,task-appmenu-button",
};
const MESSENGER_WINDOW = "chrome://messenger/content/messenger.xhtml";
const EXTENSION_WIDGET_SUFFIX = "-browserAction-toolbarbutton";

/**
 * Get the available extension IDs with buttons for a space.
 *
 * @returns {string[]} IDs of the extensions that are available in this profile.
 */
function getExtensionIds() {
  return Object.keys(
    JSON.parse(
      Services.prefs.getStringPref("extensions.webextensions.uuids", "{}")
    )
  );
}

/**
 * Get the extension ID from a XUL toolbar button ID of an extension.
 *
 * @param {string} buttonId - ID of the XUL toolbar button.
 * @param {string[]} extensionIds - Available extension IDs.
 * @returns {?string} ID of the extension the button belonged to.
 */
function getExtensionIdFromExtensionButton(buttonId, extensionIds) {
  const widgetId = buttonId.slice(0, -EXTENSION_WIDGET_SUFFIX.length);
  return extensionIds.find(
    extensionId => lazy.ExtensionCommon.makeWidgetId(extensionId) === widgetId
  );
}

/**
 * Get the items in a XUL toolbar area. Will return defaults if the area is not
 * customized.
 *
 * @param {string} toolbarId - ID of the XUL toolbar element.
 * @param {string} window - URI of the window the toolbar is in.
 * @returns {string[]} Item IDs in the given XUL toolbar.
 */
function getOldToolbarContents(toolbarId, window = MESSENGER_WINDOW) {
  let setString = Services.xulStore.getValue(window, toolbarId, "currentset");
  if (!setString) {
    setString = Services.xulStore.getValue(window, toolbarId, "defaultset");
  }
  if (!setString) {
    setString = XUL_TOOLBAR_DEFAULT_SET[toolbarId];
  }
  if (setString === EMPTY_SET) {
    return [];
  }
  return setString.split(",").filter(Boolean);
}

/**
 * Converts XUL toolbar item IDs to unified toolbar item IDs, filtering out
 * items that are not supported in the unified toolbar.
 *
 * @param {string[]} items - XUL toolbar item IDs to convert.
 * @param {string[]} extensionIds - Extensions IDs in the profile.
 * @returns {string[]} Unified toolbar item IDs.
 */
function convertContents(items, extensionIds) {
  return items
    .map(itemId => {
      if (MIGRATION_MAP.hasOwnProperty(itemId)) {
        return MIGRATION_MAP[itemId];
      }
      if (itemId.endsWith(EXTENSION_WIDGET_SUFFIX)) {
        const extensionId = getExtensionIdFromExtensionButton(
          itemId,
          extensionIds
        );
        if (extensionId) {
          return `${EXTENSION_PREFIX}${extensionId}`;
        }
      }
      return null;
    })
    .filter(Boolean);
}

/**
 * Get the unified toolbar item IDs for items that were in the tab bar and the
 * menu bar areas.
 *
 * @param {string[]} extensionIds - Extension IDs in the profile.
 * @returns {string[]} Item IDs that were available in any tab in the XUL
 *   toolbars.
 */
function getGlobalItems(extensionIds) {
  const tabsContent = convertContents(
    getOldToolbarContents("tabbar-toolbar"),
    extensionIds
  );
  const menubarContent = convertContents(
    getOldToolbarContents("toolbar-menubar"),
    extensionIds
  );
  return [...menubarContent, ...tabsContent];
}

/**
 * Converts the items in the old xul toolbar of a given space and the tab bar
 * and menu bar areas to unified toolbar item IDs.
 *
 * Filters out any items not available and items that appear multiple times, if
 * they can't be repeated. The first instance is kept.
 *
 * @param {string} space - Name of the space to get the items for.
 * @param {string[]} extensionIds - Available extensions in the profile.
 * @returns {string[]} Unified toolbar item IDs based on the old contents of the
 *   xul toolbar of the space.
 */
function getItemsForSpace(space, extensionIds) {
  const spaceContent = convertContents(
    getOldToolbarContents(TOOLBAR_FOR_SPACE[space]),
    extensionIds
  );
  const newContents = [...spaceContent, ...getGlobalItems(extensionIds)];
  const availableItems = getAvailableItemIdsForSpace(space, true).concat(
    extensionIds.map(id => `${EXTENSION_PREFIX}${id}`)
  );
  const encounteredItems = new Set();
  const finalItems = newContents.filter(itemId => {
    if (
      (encounteredItems.has(itemId) &&
        !MULTIPLE_ALLOWED_ITEM_IDS.has(itemId)) ||
      !availableItems.includes(itemId)
    ) {
      return false;
    }
    encounteredItems.add(itemId);
    return true;
  });
  return finalItems;
}

/**
 * Convert the persisted extensions from the old extensionset to the new space
 * specific store for extensions.
 *
 * @param {string} space - Name of the migrated space.
 * @param {string[]} extensionIds - Available extensions in the profile.
 * @param {string[]} items - Unified toolbar item IDs in the migrated space.
 */
function convertExtensionState(space, extensionIds) {
  if (
    !Services.xulStore.hasValue(
      MESSENGER_WINDOW,
      TOOLBAR_FOR_SPACE[space],
      "extensionset"
    )
  ) {
    return;
  }
  const extensionSet = Services.xulStore
    .getValue(MESSENGER_WINDOW, TOOLBAR_FOR_SPACE[space], "extensionset")
    .split(",")
    .filter(Boolean);
  const extensionsInExtensionSet = extensionSet.map(buttonId =>
    getExtensionIdFromExtensionButton(buttonId, extensionIds)
  );
  const cachedAllowedSpaces = lazy.getCachedAllowedSpaces();
  for (const extensionId of extensionsInExtensionSet) {
    const allowedSpaces = cachedAllowedSpaces.get(extensionId) ?? [];
    if (!allowedSpaces.includes(space)) {
      allowedSpaces.push(space);
    }
    cachedAllowedSpaces.set(extensionId, allowedSpaces);
  }
  lazy.setCachedAllowedSpaces(cachedAllowedSpaces);
}

/**
 * Migrate the old xul toolbar contents for a given space to the unified toolbar
 * if the unified toolbar has not yet been customized.
 *
 * Adds both the contents of the space specific toolbar and the tab bar and menu
 * bar areas to the unified toolbar, if the items are available.
 *
 * When the migration is complete, the old XUL store values for the XUL toolbar
 * area are deleted.
 *
 * @param {string} space - Name of the space to migrate.
 */
export function migrateToolbarForSpace(space) {
  const state = getState();
  // Don't migrate contents if the state of the space is already customized.
  if (state[space]) {
    return;
  }
  if (!TOOLBAR_FOR_SPACE.hasOwnProperty(space)) {
    throw new Error(`Migration for space "${space}" not supported`);
  }
  const extensionIds = getExtensionIds();
  state[space] = getItemsForSpace(space, extensionIds);
  storeState(state);
  convertExtensionState(space, extensionIds);
  // Remove all the state for the old toolbar of the space.
  Services.xulStore.removeValue(
    MESSENGER_WINDOW,
    TOOLBAR_FOR_SPACE[space],
    "currentset"
  );
  Services.xulStore.removeValue(
    MESSENGER_WINDOW,
    TOOLBAR_FOR_SPACE[space],
    "defaultset"
  );
  Services.xulStore.removeValue(
    MESSENGER_WINDOW,
    TOOLBAR_FOR_SPACE[space],
    "extensionset"
  );
}
