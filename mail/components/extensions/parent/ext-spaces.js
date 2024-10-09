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
function getNativeButtonProperties({
  extension,
  defaultUrl,
  buttonProperties,
}) {
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
    for (const spaceData of spaceTracker.getAll()) {
      if (!spaceData.extension) {
        continue;
      }
      const nativeButtonProperties = getNativeButtonProperties(spaceData);
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
    // Manifest V2.
    if (queryInfo.id != null && space.id != queryInfo.id) {
      return false;
    }
    // Manifest V3.
    if (queryInfo.spaceId != null && space.id != queryInfo.spaceId) {
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

    const extensionId = this.extension.id;
    for (const spaceData of spaceTracker.getAll()) {
      if (spaceData.extension?.id != extensionId) {
        continue;
      }
      for (const window of ExtensionSupport.openWindows) {
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
    const { tabManager } = context.extension;
    const self = this;

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
            const spaceData = await spaceTracker.create(
              name,
              defaultUrl,
              buttonProperties,
              context.extension
            );

            const nativeButtonProperties = getNativeButtonProperties(spaceData);
            for (const window of ExtensionSupport.openWindows) {
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
          const spaceData = spaceTracker.fromSpaceId(spaceId);
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
            for (const window of ExtensionSupport.openWindows) {
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
          const spaceData = spaceTracker.fromSpaceId(spaceId);
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
            for (const [key, value] of Object.entries(
              updatedButtonProperties
            )) {
              // In MV2 all optional but unset properties have a null value here
              // and need to be ignored, reset happens via an empty string. In MV3
              // we use "optional": "omit-key-if-missing" and unset properties
              // are omitted and null is an allowed value to enforce a reset.
              if (
                context.extension.manifest.manifest_version > 2 ||
                value != null
              ) {
                spaceData.buttonProperties[key] = value;
                changes = true;
              }
            }
          }

          if (changes) {
            const nativeButtonProperties = getNativeButtonProperties(spaceData);
            try {
              for (const window of ExtensionSupport.openWindows) {
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
          const spaceData = spaceTracker.fromSpaceId(spaceId);
          if (!spaceData) {
            throw new ExtensionError(
              `Failed to open space with id ${spaceId}: Unknown id.`
            );
          }

          const window = await getNormalWindowReady(context, windowId);
          const space = window.gSpacesToolbar.spaces.find(
            s => s.button.id == spaceData.spaceButtonId
          );

          const tabmail = window.document.getElementById("tabmail");
          const currentTab = tabmail.selectedTab;
          const nativeTabInfo = window.gSpacesToolbar.openSpace(tabmail, space);
          return tabManager.convert(nativeTabInfo, currentTab);
        },
        async get(spaceId) {
          const spaceData = spaceTracker.fromSpaceId(spaceId);
          if (!spaceData) {
            throw new ExtensionError(
              `Failed to get space with id ${spaceId}: Unknown id.`
            );
          }
          return spaceTracker.convert(spaceData, context.extension);
        },
        async query(queryInfo) {
          const allSpaceData = [...spaceTracker.getAll()];
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
