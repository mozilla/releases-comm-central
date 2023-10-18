/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionSupport } = ChromeUtils.import(
  "resource:///modules/ExtensionSupport.jsm"
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

var { makeWidgetId } = ExtensionCommon;

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
function convertProperties({ extension, buttonProperties }) {
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
    url: buttonProperties.url,
    badgeText: buttonProperties.badgeText,
    badgeStyles,
    iconStyles,
  };
}

ExtensionSupport.registerWindowListener("ext-spacesToolbar", {
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
      let nativeButtonProperties = convertProperties(spaceData);
      await window.gSpacesToolbar.createToolbarButton(
        spaceData.spaceButtonId,
        nativeButtonProperties
      );
    }
  },
});

this.spacesToolbar = class extends ExtensionAPI {
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
    this.widgetId = makeWidgetId(context.extension.id);
    let { tabManager } = context.extension;

    return {
      spacesToolbar: {
        async addButton(name, properties) {
          if (properties.url) {
            properties.url = context.uri.resolve(properties.url);
          }
          let [protocol] = (properties.url || "").split("://");
          if (
            !protocol ||
            !["https", "http", "moz-extension"].includes(protocol)
          ) {
            throw new ExtensionError(
              `Failed to add button to the spaces toolbar: Invalid url.`
            );
          }

          if (spaceTracker.fromSpaceName(name, context.extension)) {
            throw new ExtensionError(
              `Failed to add button to the spaces toolbar: The id ${name} is already used by this extension.`
            );
          }
          try {
            let spaceData = await spaceTracker.create(
              name,
              properties.url,
              properties,
              context.extension
            );

            let nativeButtonProperties = convertProperties(spaceData);
            for (let window of ExtensionSupport.openWindows) {
              if (windowURLs.includes(window.location.href)) {
                await window.gSpacesToolbar.createToolbarButton(
                  spaceData.spaceButtonId,
                  nativeButtonProperties
                );
              }
            }

            return spaceData.spaceId;
          } catch (error) {
            throw new ExtensionError(
              `Failed to add button to the spaces toolbar: ${error}`
            );
          }
        },
        async removeButton(name) {
          let spaceData = spaceTracker.fromSpaceName(name, context.extension);
          if (!spaceData) {
            throw new ExtensionError(
              `Failed to remove button from the spaces toolbar: A button with id ${name} does not exist for this extension.`
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
              `Failed to remove button from the spaces toolbar: ${ex.message}`
            );
          }
        },
        async updateButton(name, updatedProperties) {
          let spaceData = spaceTracker.fromSpaceName(name, context.extension);
          if (!spaceData) {
            throw new ExtensionError(
              `Failed to update button in the spaces toolbar: A button with id ${name} does not exist for this extension.`
            );
          }

          if (updatedProperties.url != null) {
            updatedProperties.url = context.uri.resolve(updatedProperties.url);
            let [protocol] = updatedProperties.url.split("://");
            if (
              !protocol ||
              !["https", "http", "moz-extension"].includes(protocol)
            ) {
              throw new ExtensionError(
                `Failed to update button in the spaces toolbar: Invalid url.`
              );
            }
          }

          let changes = false;
          for (let [key, value] of Object.entries(updatedProperties)) {
            if (value != null) {
              if (key == "url") {
                spaceData.defaultUrl = value;
              }
              spaceData.buttonProperties[key] = value;
              changes = true;
            }
          }

          if (changes) {
            let nativeButtonProperties = convertProperties(spaceData);
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
                `Failed to update button in the spaces toolbar: ${error}`
              );
            }
          }
        },
        async clickButton(name, windowId) {
          let spaceData = spaceTracker.fromSpaceName(name, context.extension);
          if (!spaceData) {
            throw new ExtensionError(
              `Failed to trigger a click on the spaces toolbar button: A button with id ${name} does not exist for this extension.`
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
      },
    };
  }
};
