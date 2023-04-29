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

var buttons = new Map();
var windowURLs = ["chrome://messenger/content/messenger.xhtml"];

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
    for (let buttonId of [...buttons.keys()]) {
      await window.gSpacesToolbar.createToolbarButton(
        buttonId,
        buttons.get(buttonId).nativeProperties
      );
    }
  },
});

this.spacesToolbar = class extends ExtensionAPI {
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
   * Generate an id of the form <add-on-id>-spacesButton-<id>.
   *
   * @param {string} id - an id for the button
   * @returns {string} - buttonId to be used in the actual html element
   */
  generateButtonId(id) {
    return `${this.widgetId}-spacesButton-${id}`;
  }

  /**
   * Convert WebExtension ButtonProperties into a NativeButtonProperties object
   * required by the gSpacesToolbar.* functions.
   *
   * @param {ButtonProperties} properties - @see mail/components/extensions/schemas/spacesToolbar.json
   * @returns {NativeButtonProperties} - @see mail/base/content/spacesToolbar.js
   */
  convertProperties(properties) {
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
      properties.themeIcons && properties.themeIcons.length > 0;

    // If themeIcons have been defined, ignore manifestIcons as fallback and use
    // themeIcons for the default theme as well, following the behavior of
    // WebExtension action buttons.
    let fallbackManifestIcons = hasThemeIcons ? null : this.getManifestIcons();

    // Use _normalize() to bypass cache.
    let icons = ExtensionParent.IconDetails._normalize(
      {
        path: properties.defaultIcons || fallbackManifestIcons,
        themeIcons: hasThemeIcons ? properties.themeIcons : null,
      },
      this.extension
    );
    let iconStyles = new Map(getIconData(icons, this.extension).style);

    let badgeStyles = new Map();
    let bgColor = normalizeColor(properties.badgeBackgroundColor);
    if (bgColor) {
      badgeStyles.set(
        "--spaces-button-badge-bg-color",
        `rgba(${bgColor[0]}, ${bgColor[1]}, ${bgColor[2]}, ${bgColor[3] / 255})`
      );
    }

    return {
      title: properties.title || this.extension.name,
      url: properties.url,
      badgeText: properties.badgeText,
      badgeStyles,
      iconStyles,
    };
  }

  /**
   * Called when an extension context is closed.
   */
  async close() {
    let extensionButtonIds = [...buttons.keys()].filter(id =>
      id.startsWith(this.generateButtonId(""))
    );
    for (let window of ExtensionSupport.openWindows) {
      if (windowURLs.includes(window.location.href)) {
        for (let buttonId of extensionButtonIds) {
          await window.gSpacesToolbar.removeToolbarButton(buttonId);
        }
      }
    }
    for (let buttonId of extensionButtonIds) {
      buttons.delete(buttonId);
    }
  }

  getAPI(context) {
    context.callOnClose(this);
    this.widgetId = makeWidgetId(context.extension.id);
    let self = this;
    let { tabManager } = context.extension;

    return {
      spacesToolbar: {
        async addButton(id, properties) {
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

          let buttonId = self.generateButtonId(id);
          if (buttons.has(buttonId)) {
            throw new ExtensionError(
              `Failed to add button to the spaces toolbar: The id ${id} is already used by this extension.`
            );
          }
          let nativeProperties = self.convertProperties(properties);
          try {
            for (let window of ExtensionSupport.openWindows) {
              if (windowURLs.includes(window.location.href)) {
                await window.gSpacesToolbar.createToolbarButton(
                  buttonId,
                  nativeProperties
                );
              }
            }
            buttons.set(buttonId, {
              properties,
              nativeProperties,
            });
          } catch (error) {
            throw new ExtensionError(
              `Failed to add button to the spaces toolbar: ${error}`
            );
          }
        },
        async removeButton(id) {
          let buttonId = self.generateButtonId(id);
          if (!buttons.has(buttonId)) {
            throw new ExtensionError(
              `Failed to remove button from the spaces toolbar: A button with id ${id} does not exist for this extension.`
            );
          }
          try {
            for (let window of ExtensionSupport.openWindows) {
              if (windowURLs.includes(window.location.href)) {
                await window.gSpacesToolbar.removeToolbarButton(buttonId);
              }
            }
            buttons.delete(buttonId);
          } catch (ex) {
            throw new ExtensionError(
              `Failed to remove button from the spaces toolbar: ${ex.message}`
            );
          }
        },
        async updateButton(id, updatedProperties) {
          let buttonId = self.generateButtonId(id);
          if (!buttons.has(buttonId)) {
            throw new ExtensionError(
              `Failed to update button in the spaces toolbar: A button with id ${id} does not exist for this extension.`
            );
          }
          if (updatedProperties.url != null) {
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

          let { properties, nativeProperties } = buttons.get(buttonId);
          for (let [key, value] of Object.entries(updatedProperties)) {
            if (value != null) {
              properties[key] = value;
            }
          }

          nativeProperties = self.convertProperties(properties);
          try {
            for (let window of ExtensionSupport.openWindows) {
              if (windowURLs.includes(window.location.href)) {
                await window.gSpacesToolbar.updateToolbarButton(
                  buttonId,
                  nativeProperties
                );
              }
            }
            buttons.set(buttonId, {
              properties,
              nativeProperties,
            });
          } catch (error) {
            throw new ExtensionError(
              `Failed to update button in the spaces toolbar: ${error}`
            );
          }
        },
        async clickButton(id, windowId) {
          let buttonId = self.generateButtonId(id);
          if (!buttons.has(buttonId)) {
            throw new ExtensionError(
              `Failed to trigger a click on the spaces toolbar button: A button with id ${id} does not exist for this extension.`
            );
          }

          let window = await getNormalWindowReady(context, windowId);
          let space = window.gSpacesToolbar.spaces.find(
            space => space.name == buttonId
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
