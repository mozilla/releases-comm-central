/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionSupport } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionSupport.sys.mjs"
);
var { ExtensionCommon } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionCommon.sys.mjs"
);
var { ExtensionParent } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionParent.sys.mjs"
);
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  getIconData: "resource:///modules/ExtensionToolbarButtons.sys.mjs",
});

XPCOMUtils.defineLazyGlobalGetters(this, ["InspectorUtils"]);

var windowURLs = ["chrome://messenger/content/messenger.xhtml"];

/**
 * Return the paths to the 16px and 32px icons defined in the manifest of this
 * extension, if any.
 *
 * @param {ExtensionData} extension - the extension to retrieve the path object for
 */
function getManifestIcons(extension) {
  if (extension.manifest.icons) {
    let { icon: icon16 } = ExtensionParent.IconDetails.getPreferredIcon(
      extension.manifest.icons,
      extension,
      16
    );
    let { icon: icon32 } = ExtensionParent.IconDetails.getPreferredIcon(
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
function getNativeButtonProperties({
  extension,
  defaultUrl,
  buttonProperties,
}) {
  const normalizeColor = color => {
    if (typeof color == "string") {
      let col = InspectorUtils.colorToRGBA(color);
      if (!col) {
        throw new ExtensionError(`Invalid color value: "${color}"`);
      }
      return [col.r, col.g, col.b, Math.round(col.a * 255)];
    }
    return color;
  };

  let hasThemeIcons =
    buttonProperties.themeIcons && buttonProperties.themeIcons.length > 0;

  // If themeIcons have been defined, ignore manifestIcons as fallback and use
  // themeIcons for the default theme as well, following the behavior of
  // WebExtension action buttons.
  let fallbackManifestIcons = hasThemeIcons
    ? null
    : getManifestIcons(extension);

  // Use _normalize() to bypass cache.
  let icons = ExtensionParent.IconDetails._normalize(
    {
      path: buttonProperties.defaultIcons || fallbackManifestIcons,
      themeIcons: hasThemeIcons ? buttonProperties.themeIcons : null,
    },
    extension
  );
  let iconStyles = new Map(getIconData(icons, extension).style);

  let badgeStyles = new Map();
  let bgColor = normalizeColor(buttonProperties.badgeBackgroundColor);
  if (bgColor) {
    badgeStyles.set(
      "--spaces-button-badge-bg-color",
      `rgba(${bgColor[0]}, ${bgColor[1]}, ${bgColor[2]}, ${bgColor[3] / 255})`
    );
  }

  return {
    title: buttonProperties.title || extension.name,
    url: defaultUrl,
    badgeText: buttonProperties.badgeText,
    badgeStyles,
    iconStyles,
  };
}

ExtensionSupport.registerWindowListener("ext-spaces", {
  chromeURLs: windowURLs,
  onLoadWindow: async window => {
    await new Promise(resolve => {
      if (window.gSpacesToolbar.isLoaded) {
        resolve();
      } else {
        window.addEventListener("spaces-toolbar-ready", resolve, {
          once: true,
        });
      }
    });
    // Add buttons of all extension spaces to the toolbar of each newly opened
    // normal window.
    for (let spaceData of spaceTracker.getAll()) {
      if (!spaceData.extension) {
        continue;
      }
      let nativeButtonProperties = getNativeButtonProperties(spaceData);
      await window.gSpacesToolbar.createToolbarButton(
        spaceData.spaceButtonId,
        nativeButtonProperties
      );
    }
  },
});

this.spaces = class extends ExtensionAPI {
  /**
   * Match a WebExtension Space object against the provided queryInfo.
   *
   * @param {Space} space - @see mail/components/extensions/schemas/spaces.json
   * @param {QueryInfo} queryInfo - @see mail/components/extensions/schemas/spaces.json
   * @returns {boolean}
   */
  matchSpace(space, queryInfo) {
    if (queryInfo.id != null && space.id != queryInfo.id) {
      return false;
    }
    if (queryInfo.name != null && space.name != queryInfo.name) {
      return false;
    }
    if (queryInfo.isBuiltIn != null && space.isBuiltIn != queryInfo.isBuiltIn) {
      return false;
    }
    if (
      queryInfo.isSelfOwned != null &&
      space.isSelfOwned != queryInfo.isSelfOwned
    ) {
      return false;
    }
    if (
      queryInfo.extensionId != null &&
      space.extensionId != queryInfo.extensionId
    ) {
      return false;
    }
    return true;
  }

  async onShutdown(isAppShutdown) {
    if (isAppShutdown) {
      return;
    }

    let extensionId = this.extension.id;
    for (let spaceData of spaceTracker.getAll()) {
      if (spaceData.extension?.id != extensionId) {
        continue;
      }
      for (let window of ExtensionSupport.openWindows) {
        if (windowURLs.includes(window.location.href)) {
          await window.gSpacesToolbar.removeToolbarButton(
            spaceData.spaceButtonId
          );
        }
      }
      spaceTracker.remove(spaceData);
    }
  }

  getAPI(context) {
    let { tabManager } = context.extension;
    let self = this;

    return {
      spaces: {
        async create(name, defaultUrl, buttonProperties) {
          if (spaceTracker.fromSpaceName(name, context.extension)) {
            throw new ExtensionError(
              `Failed to create space with name ${name}: Space already exists for this extension.`
            );
          }

          defaultUrl = context.uri.resolve(defaultUrl);
          if (!/((^https:)|(^http:)|(^moz-extension:))/i.test(defaultUrl)) {
            throw new ExtensionError(
              `Failed to create space with name ${name}: Invalid default url.`
            );
          }

          try {
            let spaceData = await spaceTracker.create(
              name,
              defaultUrl,
              buttonProperties,
              context.extension
            );

            let nativeButtonProperties = getNativeButtonProperties(spaceData);
            for (let window of ExtensionSupport.openWindows) {
              if (windowURLs.includes(window.location.href)) {
                await window.gSpacesToolbar.createToolbarButton(
                  spaceData.spaceButtonId,
                  nativeButtonProperties
                );
              }
            }

            return spaceTracker.convert(spaceData, context.extension);
          } catch (error) {
            throw new ExtensionError(
              `Failed to create space with name ${name}: ${error}`
            );
          }
        },
        async remove(spaceId) {
          let spaceData = spaceTracker.fromSpaceId(spaceId);
          if (!spaceData) {
            throw new ExtensionError(
              `Failed to remove space with id ${spaceId}: Unknown id.`
            );
          }
          if (spaceData.extension?.id != context.extension.id) {
            throw new ExtensionError(
              `Failed to remove space with id ${spaceId}: Space does not belong to this extension.`
            );
          }

          try {
            for (let window of ExtensionSupport.openWindows) {
              if (windowURLs.includes(window.location.href)) {
                await window.gSpacesToolbar.removeToolbarButton(
                  spaceData.spaceButtonId
                );
              }
            }
            spaceTracker.remove(spaceData);
          } catch (ex) {
            throw new ExtensionError(
              `Failed to remove space with id ${spaceId}: ${ex.message}`
            );
          }
        },
        async update(spaceId, updatedDefaultUrl, updatedButtonProperties) {
          let spaceData = spaceTracker.fromSpaceId(spaceId);
          if (!spaceData) {
            throw new ExtensionError(
              `Failed to update space with id ${spaceId}: Unknown id.`
            );
          }
          if (spaceData.extension?.id != context.extension.id) {
            throw new ExtensionError(
              `Failed to update space with id ${spaceId}: Space does not belong to this extension.`
            );
          }

          let changes = false;
          if (updatedDefaultUrl) {
            updatedDefaultUrl = context.uri.resolve(updatedDefaultUrl);
            if (
              !/((^https:)|(^http:)|(^moz-extension:))/i.test(updatedDefaultUrl)
            ) {
              throw new ExtensionError(
                `Failed to update space with id ${spaceId}: Invalid default url.`
              );
            }
            spaceData.defaultUrl = updatedDefaultUrl;
            changes = true;
          }

          if (updatedButtonProperties) {
            for (let [key, value] of Object.entries(updatedButtonProperties)) {
              if (value != null) {
                spaceData.buttonProperties[key] = value;
                changes = true;
              }
            }
          }

          if (changes) {
            let nativeButtonProperties = getNativeButtonProperties(spaceData);
            try {
              for (let window of ExtensionSupport.openWindows) {
                if (windowURLs.includes(window.location.href)) {
                  await window.gSpacesToolbar.updateToolbarButton(
                    spaceData.spaceButtonId,
                    nativeButtonProperties
                  );
                }
              }
              spaceTracker.update(spaceData);
            } catch (error) {
              throw new ExtensionError(
                `Failed to update space with id ${spaceId}: ${error}`
              );
            }
          }
        },
        async open(spaceId, windowId) {
          let spaceData = spaceTracker.fromSpaceId(spaceId);
          if (!spaceData) {
            throw new ExtensionError(
              `Failed to open space with id ${spaceId}: Unknown id.`
            );
          }

          let window = await getNormalWindowReady(context, windowId);
          let space = window.gSpacesToolbar.spaces.find(
            space => space.button.id == spaceData.spaceButtonId
          );

          let tabmail = window.document.getElementById("tabmail");
          let currentTab = tabmail.selectedTab;
          let nativeTabInfo = window.gSpacesToolbar.openSpace(tabmail, space);
          return tabManager.convert(nativeTabInfo, currentTab);
        },
        async get(spaceId) {
          let spaceData = spaceTracker.fromSpaceId(spaceId);
          if (!spaceData) {
            throw new ExtensionError(
              `Failed to get space with id ${spaceId}: Unknown id.`
            );
          }
          return spaceTracker.convert(spaceData, context.extension);
        },
        async query(queryInfo) {
          let allSpaceData = [...spaceTracker.getAll()];
          return allSpaceData
            .map(spaceData =>
              spaceTracker.convert(spaceData, context.extension)
            )
            .filter(space => self.matchSpace(space, queryInfo));
        },
      },
    };
  }
};
