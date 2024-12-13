/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { ExtensionCommon } from "resource://gre/modules/ExtensionCommon.sys.mjs";
import { ExtensionParent } from "resource://gre/modules/ExtensionParent.sys.mjs";
import { ExtensionUtils } from "resource://gre/modules/ExtensionUtils.sys.mjs";
import { getIconData } from "resource:///modules/ExtensionToolbarButtons.sys.mjs";

var { ExtensionError } = ExtensionUtils;

/**
 * @typedef SpaceData
 * @property {string} name - name of the space as used by the extension
 * @property {integer} spaceId - id of the space as used by the tabs API
 * @property {string} spaceButtonId - id of the button of this space in the
 *   spaces toolbar
 * @property {SpaceTabProperties} tabProperties - properties for the default
 *   space tab
 *   @see mail/components/extensions/schemas/spaces.json
 * @property {SpaceButtonProperties} buttonProperties - properties for the
 *   space button
 *   @see mail/components/extensions/schemas/spaces.json
 * @property {ExtensionData} extension - the extension the space belongs to
 */

/**
 * Return the paths to the 16px and 32px icons defined in the manifest of this
 * extension, if any.
 *
 * @param {ExtensionData} extension - the extension to retrieve the path object for
 */
function getManifestIcons(extension) {
  if (extension.manifest.icons) {
    const { icon: icon16 } = ExtensionParent.IconDetails.getPreferredIcon(
      extension.manifest.icons,
      extension,
      16
    );
    const { icon: icon32 } = ExtensionParent.IconDetails.getPreferredIcon(
      extension.manifest.icons,
      extension,
      32
    );
    return {
      16: extension.baseURI.resolve(icon16),
      32: extension.baseURI.resolve(icon32),
    };
  }
  return null;
}

/**
 * Convert WebExtension SpaceButtonProperties into a NativeButtonProperties
 * object required by the gSpacesToolbar.* functions.
 *
 * @param {SpaceData} spaceData - @see mail/components/extensions/parent/ext-mail.js
 * @returns {NativeButtonProperties} - @see mail/base/content/spacesToolbar.js
 */
export function getNativeButtonProperties({ extension, buttonProperties }) {
  const normalizeColor = color => {
    if (typeof color == "string") {
      const col = InspectorUtils.colorToRGBA(color);
      if (!col) {
        throw new ExtensionError(`Invalid color value: "${color}"`);
      }
      return [col.r, col.g, col.b, Math.round(col.a * 255)];
    }
    return color;
  };

  const hasThemeIcons =
    buttonProperties.themeIcons && buttonProperties.themeIcons.length > 0;

  // If themeIcons have been defined, ignore manifestIcons as fallback and use
  // themeIcons for the default theme as well, following the behavior of
  // WebExtension action buttons.
  const fallbackManifestIcons = hasThemeIcons
    ? null
    : getManifestIcons(extension);

  // Use _normalize() to bypass cache.
  const icons = ExtensionParent.IconDetails._normalize(
    {
      path: buttonProperties.defaultIcons || fallbackManifestIcons,
      themeIcons: hasThemeIcons ? buttonProperties.themeIcons : null,
    },
    extension
  );
  const iconStyles = new Map(getIconData(icons, extension).style);

  const badgeStyles = new Map();
  const bgColor = normalizeColor(buttonProperties.badgeBackgroundColor);
  if (bgColor) {
    badgeStyles.set(
      "--spaces-button-badge-bg-color",
      `rgba(${bgColor[0]}, ${bgColor[1]}, ${bgColor[2]}, ${bgColor[3] / 255})`
    );
  }

  return {
    title: buttonProperties.title || extension.name,
    badgeText: buttonProperties.badgeText,
    badgeStyles,
    iconStyles,
  };
}

/**
 * Convert WebExtension SpaceTabProperties into a NativeTabProperties
 * object required by the gSpacesToolbar.* functions.
 *
 * @param {SpaceData} spaceData - @see mail/components/extensions/parent/ext-mail.js
 * @returns {NativeTabProperties} - @see mail/base/content/spacesToolbar.js
 */
export function getNativeTabProperties({ extension, tabProperties }) {
  const userContextId = tabProperties.cookieStoreId
    ? ExtensionParent.apiManager.global.getUserContextIdForCookieStoreId(
        extension,
        tabProperties.cookieStoreId
      )
    : Services.scriptSecurityManager.DEFAULT_USER_CONTEXT_ID;
  const url = tabProperties.url
    ? extension.baseURI.resolve(tabProperties.url)
    : null;

  const protocol = url && new URL(url).protocol;
  if (!protocol || !["https:", "http:", "moz-extension:"].includes(protocol)) {
    throw new Error(url ? `Invalid URL: ${url}` : `Missing URL`);
  }

  return {
    url,
    userContextId,
    linkHandler: "single-site",
    initialBrowsingContextGroupId: extension.policy.browsingContextGroupId,
    triggeringPrincipal: extension.principal,
  };
}

/**
 * Convenience class to keep track of and manage spaces.
 */
export class SpaceTracker {
  constructor() {
    this._nextId = 1;
    this._spaceData = new Map();
    this._spaceIds = new Map();

    // Keep this in sync with the default spaces in gSpacesToolbar.
    const builtInSpaces = [
      {
        name: "mail",
        spaceButtonId: "mailButton",
        tabInSpace: tabInfo =>
          ["folder", "mail3PaneTab", "mailMessageTab"].includes(
            tabInfo.mode.name
          )
            ? 1
            : 0,
      },
      {
        name: "addressbook",
        spaceButtonId: "addressBookButton",
        tabInSpace: tabInfo => (tabInfo.mode.name == "addressBookTab" ? 1 : 0),
      },
      {
        name: "calendar",
        spaceButtonId: "calendarButton",
        tabInSpace: tabInfo => (tabInfo.mode.name == "calendar" ? 1 : 0),
      },
      {
        name: "tasks",
        spaceButtonId: "tasksButton",
        tabInSpace: tabInfo => (tabInfo.mode.name == "tasks" ? 1 : 0),
      },
      {
        name: "chat",
        spaceButtonId: "chatButton",
        tabInSpace: tabInfo => (tabInfo.mode.name == "chat" ? 1 : 0),
      },
      {
        name: "settings",
        spaceButtonId: "settingsButton",
        tabInSpace: tabInfo => {
          switch (tabInfo.mode.name) {
            case "preferencesTab":
              // A primary tab that the open method creates.
              return 1;
            case "contentTab": {
              const url = tabInfo.urlbar?.value;
              if (url == "about:accountsettings" || url == "about:addons") {
                // A secondary tab, that is related to this space.
                return 2;
              }
            }
          }
          return 0;
        },
      },
    ];
    for (const builtInSpace of builtInSpaces) {
      this._add(builtInSpace);
    }
  }

  findSpaceForTab(tabInfo) {
    for (const spaceData of this._spaceData.values()) {
      if (spaceData.tabInSpace(tabInfo)) {
        return spaceData;
      }
    }
    return undefined;
  }

  _add(spaceData) {
    const spaceId = this._nextId++;
    const { spaceButtonId } = spaceData;
    this._spaceData.set(spaceButtonId, { ...spaceData, spaceId });
    this._spaceIds.set(spaceId, spaceButtonId);
    return { ...spaceData, spaceId };
  }

  /**
   * Generate an id of the form <add-on-id>-spacesButton-<spaceId>.
   *
   * @param {string} name - name of the space as used by the extension
   * @param {ExtensionData} extension
   * @returns {string} id of the html element of the spaces toolbar button of
   *   this space
   */
  _getSpaceButtonId(name, extension) {
    return `${ExtensionCommon.makeWidgetId(extension.id)}-spacesButton-${name}`;
  }

  /**
   * Get the SpaceData for the space with the given name for the given extension.
   *
   * @param {string} name - name of the space as used by the extension
   * @param {ExtensionData} extension
   * @returns {SpaceData}
   */
  fromSpaceName(name, extension) {
    const spaceButtonId = this._getSpaceButtonId(name, extension);
    return this.fromSpaceButtonId(spaceButtonId);
  }

  /**
   * Get the SpaceData for the space with the given spaceId.
   *
   * @param {integer} spaceId - id of the space as used by the tabs API
   * @returns {SpaceData}
   */
  fromSpaceId(spaceId) {
    const spaceButtonId = this._spaceIds.get(spaceId);
    return this.fromSpaceButtonId(spaceButtonId);
  }

  /**
   * Get the SpaceData for the space with the given spaceButtonId.
   *
   * @param {string} spaceButtonId - id of the html element of a spaces toolbar
   *   button
   * @returns {SpaceData}
   */
  fromSpaceButtonId(spaceButtonId) {
    if (!spaceButtonId || !this._spaceData.has(spaceButtonId)) {
      return null;
    }
    return this._spaceData.get(spaceButtonId);
  }

  /**
   * Create a new space and return its SpaceData.
   *
   * @param {string} name - name of the space as used by the extension
   * @param {SpaceTabProperties} tabProperties - properties for the default
   *   space tab
   *   @see mail/components/extensions/schemas/spaces.json
   * @param {SpaceButtonProperties} buttonProperties - properties for the
   *   space button
   *   @see mail/components/extensions/schemas/spaces.json
   * @param {ExtensionData} extension - the extension the space belongs to
   * @returns {SpaceData}
   */
  async create(name, tabProperties, buttonProperties, extension) {
    const spaceButtonId = this._getSpaceButtonId(name, extension);
    if (this._spaceData.has(spaceButtonId)) {
      return false;
    }
    return this._add({
      name,
      spaceButtonId,
      tabInSpace: tabInfo => (tabInfo.spaceButtonId == spaceButtonId ? 1 : 0),
      tabProperties,
      buttonProperties,
      extension,
    });
  }

  /**
   * Return a WebExtension Space object, representing the given spaceData.
   *
   * @param {SpaceData} spaceData
   * @returns {Space} - @see mail/components/extensions/schemas/spaces.json
   */
  convert(spaceData, extension) {
    const space = {
      id: spaceData.spaceId,
      name: spaceData.name,
      isBuiltIn: !spaceData.extension,
      isSelfOwned: spaceData.extension?.id == extension.id,
    };
    if (spaceData.extension && extension.hasPermission("management")) {
      space.extensionId = spaceData.extension.id;
    }
    return space;
  }

  /**
   * Remove a space and its SpaceData from the tracker.
   *
   * @param {SpaceData} spaceData
   */
  remove(spaceData) {
    if (!this._spaceData.has(spaceData.spaceButtonId)) {
      return;
    }
    this._spaceData.delete(spaceData.spaceButtonId);
  }

  /**
   * Update spaceData for a space in the tracker.
   *
   * @param {SpaceData} spaceData
   */
  update(spaceData) {
    if (!this._spaceData.has(spaceData.spaceButtonId)) {
      return;
    }
    this._spaceData.set(spaceData.spaceButtonId, spaceData);
  }

  /**
   * Return the SpaceData of all spaces known to the tracker.
   *
   * @returns {SpaceData[]}
   */
  getAll() {
    return this._spaceData.values();
  }
}
