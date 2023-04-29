/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionSupport } = ChromeUtils.import(
  "resource:///modules/ExtensionSupport.jsm"
);
var { ExtensionCommon } = ChromeUtils.import(
  "resource://gre/modules/ExtensionCommon.jsm"
);
var { ExtensionParent } = ChromeUtils.import(
  "resource://gre/modules/ExtensionParent.jsm"
);
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

ChromeUtils.defineModuleGetter(
  this,
  "getIconData",
  "resource:///modules/ExtensionToolbarButtons.jsm"
);

XPCOMUtils.defineLazyGlobalGetters(this, ["InspectorUtils"]);

var { makeWidgetId } = ExtensionCommon;

var nativeSpaces = new Map();
var windowURLs = ["chrome://messenger/content/messenger.xhtml"];

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
    for (let nativeSpaceId of [...nativeSpaces.keys()]) {
      await window.gSpacesToolbar.createToolbarButton(
        nativeSpaceId,
        nativeSpaces.get(nativeSpaceId).nativeButtonProperties
      );
    }
  },
});

this.spaces = class extends ExtensionAPI {
  /**
   * Return the paths to the 16px and 32px icons defined in the manifest of this
   * extension, if any.
   */
  getManifestIcons() {
    if (this.extension.manifest.icons) {
      let { icon: icon16 } = ExtensionParent.IconDetails.getPreferredIcon(
        this.extension.manifest.icons,
        this.extension,
        16
      );
      let { icon: icon32 } = ExtensionParent.IconDetails.getPreferredIcon(
        this.extension.manifest.icons,
        this.extension,
        32
      );
      return {
        16: this.extension.baseURI.resolve(icon16),
        32: this.extension.baseURI.resolve(icon32),
      };
    }
    return null;
  }

  /**
   * Generate an id of the form <add-on-id>-spacesButton-<spaceId>.
   *
   * @param {string} spaceId - spaceId as used by the extension
   * @returns {string} - native id representing the space, also used as the id
   *   of the html element of the spaces toolbar button of this space
   */
  generateNativeSpaceId(spaceId) {
    return `${this.widgetId}-spacesButton-${spaceId}`;
  }

  /**
   * Convert WebExtension SpaceButtonProperties into a NativeButtonProperties
   * object required by the gSpacesToolbar.* functions.
   *
   * @param {string} defaultUrl - the url for the default space tab
   * @param {SpaceButtonProperties} buttonProperties - @see mail/components/extensions/schemas/spaces.json
   *
   * @returns {NativeButtonProperties} - @see mail/base/content/spacesToolbar.js
   */
  convertProperties(defaultUrl, buttonProperties) {
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
    let fallbackManifestIcons = hasThemeIcons ? null : this.getManifestIcons();

    // Use _normalize() to bypass cache.
    let icons = ExtensionParent.IconDetails._normalize(
      {
        path: buttonProperties.defaultIcons || fallbackManifestIcons,
        themeIcons: hasThemeIcons ? buttonProperties.themeIcons : null,
      },
      this.extension
    );
    let iconStyles = new Map(getIconData(icons, this.extension).style);

    let badgeStyles = new Map();
    let bgColor = normalizeColor(buttonProperties.badgeBackgroundColor);
    if (bgColor) {
      badgeStyles.set(
        "--spaces-button-badge-bg-color",
        `rgba(${bgColor[0]}, ${bgColor[1]}, ${bgColor[2]}, ${bgColor[3] / 255})`
      );
    }

    return {
      title: buttonProperties.title || this.extension.name,
      url: defaultUrl,
      badgeText: buttonProperties.badgeText,
      badgeStyles,
      iconStyles,
    };
  }

  /**
   * Called when an extension context is closed.
   */
  async close() {
    let obsoleteNativeSpaceIds = [...nativeSpaces.keys()].filter(id =>
      id.startsWith(this.generateNativeSpaceId(""))
    );
    for (let window of ExtensionSupport.openWindows) {
      if (windowURLs.includes(window.location.href)) {
        for (let nativeSpaceId of obsoleteNativeSpaceIds) {
          await window.gSpacesToolbar.removeToolbarButton(nativeSpaceId);
        }
      }
    }
    for (let nativeSpaceId of obsoleteNativeSpaceIds) {
      nativeSpaces.delete(nativeSpaceId);
    }
  }

  getAPI(context) {
    context.callOnClose(this);
    this.widgetId = makeWidgetId(context.extension.id);
    let self = this;
    let { tabManager } = context.extension;

    return {
      spaces: {
        async create(spaceId, defaultUrl, buttonProperties) {
          let nativeSpaceId = self.generateNativeSpaceId(spaceId);
          if (nativeSpaces.has(nativeSpaceId)) {
            throw new ExtensionError(
              `Failed to create new space: The id ${spaceId} is already used by this extension.`
            );
          }

          defaultUrl = context.uri.resolve(defaultUrl);
          if (!/((^https:)|(^http:)|(^moz-extension:))/i.test(defaultUrl)) {
            throw new ExtensionError(
              `Failed to create new space: Invalid default url.`
            );
          }

          let nativeButtonProperties = self.convertProperties(
            defaultUrl,
            buttonProperties
          );
          try {
            for (let window of ExtensionSupport.openWindows) {
              if (windowURLs.includes(window.location.href)) {
                await window.gSpacesToolbar.createToolbarButton(
                  nativeSpaceId,
                  nativeButtonProperties
                );
              }
            }
            nativeSpaces.set(nativeSpaceId, {
              defaultUrl,
              buttonProperties,
              nativeButtonProperties,
            });
          } catch (error) {
            throw new ExtensionError(`Failed to create space: ${error}`);
          }
        },
        async remove(spaceId) {
          let nativeSpaceId = self.generateNativeSpaceId(spaceId);
          if (!nativeSpaces.has(nativeSpaceId)) {
            throw new ExtensionError(
              `Failed to remove space: A space with id ${spaceId} does not exist for this extension.`
            );
          }
          try {
            for (let window of ExtensionSupport.openWindows) {
              if (windowURLs.includes(window.location.href)) {
                await window.gSpacesToolbar.removeToolbarButton(nativeSpaceId);
              }
            }
            nativeSpaces.delete(nativeSpaceId);
          } catch (ex) {
            throw new ExtensionError(`Failed to remove space: ${ex.message}`);
          }
        },
        async update(spaceId, updatedDefaultUrl, updatedButtonProperties) {
          let nativeSpaceId = self.generateNativeSpaceId(spaceId);
          if (!nativeSpaces.has(nativeSpaceId)) {
            throw new ExtensionError(
              `Failed to update space: A space with id ${spaceId} does not exist for this extension.`
            );
          }
          let { defaultUrl, buttonProperties } = nativeSpaces.get(
            nativeSpaceId
          );
          let changes = false;

          if (updatedDefaultUrl) {
            updatedDefaultUrl = context.uri.resolve(updatedDefaultUrl);
            if (
              !/((^https:)|(^http:)|(^moz-extension:))/i.test(updatedDefaultUrl)
            ) {
              throw new ExtensionError(
                `Failed to update space: Invalid default url.`
              );
            }
            defaultUrl = updatedDefaultUrl;
            changes = true;
          }

          if (updatedButtonProperties) {
            for (let [key, value] of Object.entries(updatedButtonProperties)) {
              if (value != null) {
                buttonProperties[key] = value;
                changes = true;
              }
            }
          }

          if (changes) {
            let nativeButtonProperties = self.convertProperties(
              defaultUrl,
              buttonProperties
            );
            try {
              for (let window of ExtensionSupport.openWindows) {
                if (windowURLs.includes(window.location.href)) {
                  await window.gSpacesToolbar.updateToolbarButton(
                    nativeSpaceId,
                    nativeButtonProperties
                  );
                }
              }
              nativeSpaces.set(nativeSpaceId, {
                defaultUrl,
                buttonProperties,
                nativeButtonProperties,
              });
            } catch (error) {
              throw new ExtensionError(`Failed to update space: ${error}`);
            }
          }
        },
        async open(spaceId, windowId) {
          let nativeSpaceId = self.generateNativeSpaceId(spaceId);
          if (!nativeSpaces.has(nativeSpaceId)) {
            throw new ExtensionError(
              `Failed to open space: A space with id ${spaceId} does not exist for this extension.`
            );
          }

          let window = await getNormalWindowReady(context, windowId);
          let space = window.gSpacesToolbar.spaces.find(
            space => space.name == nativeSpaceId
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
