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
  getDefaultItemIdsForSpace,
} from "resource:///modules/CustomizableItems.sys.mjs";
import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  ExtensionCommon: "resource://gre/modules/ExtensionCommon.sys.mjs",
  getCachedAllowedSpaces: "resource:///modules/ExtensionToolbarButtons.sys.mjs",
  setCachedAllowedSpaces: "resource:///modules/ExtensionToolbarButtons.sys.mjs",
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

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "extensionIds",
  "extensions.webextensions.uuids",
  "{}",
  null,
  value => Object.keys(JSON.parse(value))
);

/**
 * Get the extension ID from a XUL toolbar button ID of an extension.
 *
 * @param {string} buttonId - ID of the XUL toolbar button.
 * @returns {?string} ID of the extension the button belonged to.
 */
function getExtensionIdFromExtensionButton(buttonId) {
  const widgetId = buttonId.slice(0, -EXTENSION_WIDGET_SUFFIX.length);
  return lazy.extensionIds.find(
    extensionId => lazy.ExtensionCommon.makeWidgetId(extensionId) === widgetId
  );
}

/**
 * Convert the string contents of an old toolbar *set attribute to an array of
 * item IDs.
 *
 * @param {string} setString - Contents of the set attribute.
 * @returns {string[]} Array of items in the set.
 */
function toolbarSetAttributeToArray(setString) {
  if (!setString || setString === EMPTY_SET) {
    return [];
  }
  return setString.split(",").filter(Boolean);
}

/**
 * Get the default set (without extensions) of a XUL toolbar.
 *
 * @param {string} toolbarId - ID of the XUL toolbar element.
 * @param {string} window - URI of the window the toolbar is in.
 * @returns {string} defaultset attribute of the given XUL toolbar.
 */
function getOldToolbarDefaultContents(toolbarId, window = MESSENGER_WINDOW) {
  let setString = Services.xulStore.getValue(window, toolbarId, "defaultset");
  if (!setString) {
    setString = XUL_TOOLBAR_DEFAULT_SET[toolbarId];
  }
  return setString;
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
    setString = getOldToolbarDefaultContents(toolbarId, window);
  }
  return toolbarSetAttributeToArray(setString);
}

/**
 * Converts XUL toolbar item IDs to unified toolbar item IDs, filtering out
 * items that are not supported in the unified toolbar.
 *
 * @param {string[]} items - XUL toolbar item IDs to convert.
 * @returns {string[]} Unified toolbar item IDs.
 */
function convertContents(items) {
  return items
    .map(itemId => {
      if (MIGRATION_MAP.hasOwnProperty(itemId)) {
        return MIGRATION_MAP[itemId];
      }
      if (itemId.endsWith(EXTENSION_WIDGET_SUFFIX)) {
        const extensionId = getExtensionIdFromExtensionButton(itemId);
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
 * @returns {string[]} Item IDs that were available in any tab in the XUL
 *   toolbars.
 */
function getGlobalItems() {
  const tabsContent = convertContents(getOldToolbarContents("tabbar-toolbar"));
  const menubarContent = convertContents(
    getOldToolbarContents("toolbar-menubar")
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
 * If there is no old toolbar for the given space, only the global items are
 * returned.
 *
 * @param {string} space - Name of the space to get the items for.
 * @returns {string[]} Unified toolbar item IDs based on the old contents of the
 *   xul toolbar of the space.
 */
function getItemsForSpace(space) {
  let spaceContent = [];
  if (TOOLBAR_FOR_SPACE.hasOwnProperty(space)) {
    spaceContent = convertContents(
      getOldToolbarContents(TOOLBAR_FOR_SPACE[space])
    );
  } else {
    spaceContent = getDefaultItemIdsForSpace(space);
  }
  const newContents = [...spaceContent, ...getGlobalItems()];
  const availableItems = getAvailableItemIdsForSpace(space, true).concat(
    lazy.extensionIds.map(id => `${EXTENSION_PREFIX}${id}`)
  );
  const encounteredItems = new Set();
  const finalItems = newContents.filter((itemId, index, items) => {
    if (
      (encounteredItems.has(itemId) &&
        !MULTIPLE_ALLOWED_ITEM_IDS.has(itemId)) ||
      !availableItems.includes(itemId) ||
      (itemId === "spacer" && index > 0 && items[index - 1] === itemId)
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
 */
function convertExtensionState(space) {
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
    getExtensionIdFromExtensionButton(buttonId)
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
 * Check if the XUL toolbar matches the default state.
 *
 * @param {string} toolbarId - ID of the old XUL toolbar element to check the
 *   state of.
 * @returns {boolean} If the toolbar with the given ID has a currentset matching
 *   the default state for that toolbar.
 */
function oldToolbarContainsDefaultItems(toolbarId) {
  // Fast path: if there is no current set, the contents of the toolbar were
  // never modified.
  if (!Services.xulStore.hasValue(MESSENGER_WINDOW, toolbarId, "currentset")) {
    return true;
  }
  const toolbarContents = getOldToolbarContents(toolbarId);
  let defaultContents = toolbarSetAttributeToArray(
    getOldToolbarDefaultContents(toolbarId)
  );
  const extensionContents = toolbarSetAttributeToArray(
    Services.xulStore.getValue(MESSENGER_WINDOW, toolbarId, "extensionset")
  );
  // Extensions are inserted before the appmenu button, which is usually at the
  // end of the default set.
  if (extensionContents.length) {
    const appmenuIndex = defaultContents.findIndex(
      itemId => itemId === "button-appmenu"
    );
    if (appmenuIndex !== -1) {
      defaultContents.splice(appmenuIndex, 0, ...extensionContents);
    } else {
      defaultContents = defaultContents.concat(extensionContents);
    }
  }
  return (
    toolbarContents.length === defaultContents.length &&
    toolbarContents.every((itemId, index) => itemId === defaultContents[index])
  );
}

/**
 * Check if the XUL toolbar customization state is equivalent to its default set
 * for a given space.
 *
 * @param {string} space - Name of the space to check the default set for.
 * @returns {boolean} If the state of the old XUL toolbars matches the default
 *   set for that space. True if we don't know any toolbar for the given space.
 */
function stateMatchesDefault(space) {
  if (!TOOLBAR_FOR_SPACE.hasOwnProperty(space)) {
    return true;
  }
  if (!oldToolbarContainsDefaultItems(TOOLBAR_FOR_SPACE[space])) {
    return false;
  }
  if (space === "mail") {
    if (!oldToolbarContainsDefaultItems("tabbar-toolbar")) {
      return false;
    }
    if (!oldToolbarContainsDefaultItems("toolbar-menubar")) {
      return false;
    }
  }
  return true;
}

/**
 * Remove all the persisted state of a XUL toolbar from the XUL store.
 *
 * @param {string} toolbarId - Element ID of the XUL toolbar to clear the state
 *   of.
 */
export function clearXULToolbarState(toolbarId) {
  Services.xulStore.removeValue(MESSENGER_WINDOW, toolbarId, "currentset");
  Services.xulStore.removeValue(MESSENGER_WINDOW, toolbarId, "defaultset");
  Services.xulStore.removeValue(MESSENGER_WINDOW, toolbarId, "extensionset");
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
  // If the mail toolbar areas are all in their default state, we don't want to
  // migrate their contents.
  const mailToolbarInDefaultState =
    space === "mail" && stateMatchesDefault(space);
  // Don't migrate contents if the state of the space is already customized.
  if (state[space] || mailToolbarInDefaultState) {
    if (mailToolbarInDefaultState && TOOLBAR_FOR_SPACE.hasOwnProperty(space)) {
      clearXULToolbarState(TOOLBAR_FOR_SPACE[space]);
    }
    return;
  }
  state[space] = getItemsForSpace(space);
  storeState(state);
  if (TOOLBAR_FOR_SPACE.hasOwnProperty(space)) {
    convertExtensionState(space);
    // Remove all the state for the old toolbar of the space.
    clearXULToolbarState(TOOLBAR_FOR_SPACE[space]);
  }
}
