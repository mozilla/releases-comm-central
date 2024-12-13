/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionParent } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionParent.sys.mjs"
);
var { getNativeButtonProperties } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionSpaces.sys.mjs"
);

var { makeWidgetId } = ExtensionCommon;

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
    // Add buttons of all extension spaces to the toolbar of each newly opened
    // normal window.
    for (const spaceData of spaceTracker.getAll()) {
      if (!spaceData.extension) {
        continue;
      }
      const nativeButtonProperties = getNativeButtonProperties(spaceData);
      await window.gSpacesToolbar.createToolbarButton(
        spaceData.spaceButtonId,
        spaceData.tabProperties,
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
    this.widgetId = makeWidgetId(context.extension.id);
    const { tabManager } = context.extension;

    return {
      spacesToolbar: {
        async addButton(name, properties) {
          // The deprecated spacesToolbar API handles the url as part of its
          // buttonBroperties, but internally we store the url as part of the
          // tabProperties.
          const tabProperties = {};
          if (properties.url) {
            tabProperties.url = context.uri.resolve(properties.url);
            const protocol = new URL(tabProperties.url).protocol;
            if (
              !protocol ||
              !["https:", "http:", "moz-extension:"].includes(protocol)
            ) {
              throw new ExtensionError(
                `Failed to add button to the spaces toolbar: Invalid url.`
              );
            }
            delete properties.url;
          } else {
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
            const spaceData = await spaceTracker.create(
              name,
              tabProperties,
              properties,
              context.extension
            );

            const nativeButtonProperties = getNativeButtonProperties(spaceData);
            for (const window of ExtensionSupport.openWindows) {
              if (windowURLs.includes(window.location.href)) {
                await window.gSpacesToolbar.createToolbarButton(
                  spaceData.spaceButtonId,
                  spaceData.tabProperties,
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
          const spaceData = spaceTracker.fromSpaceName(name, context.extension);
          if (!spaceData) {
            throw new ExtensionError(
              `Failed to remove button from the spaces toolbar: A button with id ${name} does not exist for this extension.`
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
              `Failed to remove button from the spaces toolbar: ${ex.message}`
            );
          }
        },
        async updateButton(name, updatedProperties) {
          const spaceData = spaceTracker.fromSpaceName(name, context.extension);
          if (!spaceData) {
            throw new ExtensionError(
              `Failed to update button in the spaces toolbar: A button with id ${name} does not exist for this extension.`
            );
          }

          let changes = false;

          if (updatedProperties.url != null) {
            const url = context.uri.resolve(updatedProperties.url);
            const protocol = new URL(url).protocol;
            if (
              !protocol ||
              !["https:", "http:", "moz-extension:"].includes(protocol)
            ) {
              throw new ExtensionError(
                `Failed to update button in the spaces toolbar: Invalid url.`
              );
            }
            spaceData.tabProperties.url = url;
            delete updatedProperties.url;
            changes = true;
          }

          for (const [key, value] of Object.entries(updatedProperties)) {
            if (value != null) {
              spaceData.buttonProperties[key] = value;
              changes = true;
            }
          }

          if (changes) {
            const nativeButtonProperties = getNativeButtonProperties(spaceData);
            try {
              for (const window of ExtensionSupport.openWindows) {
                if (windowURLs.includes(window.location.href)) {
                  await window.gSpacesToolbar.updateToolbarButton(
                    spaceData.spaceButtonId,
                    spaceData.tabProperties,
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
          const spaceData = spaceTracker.fromSpaceName(name, context.extension);
          if (!spaceData) {
            throw new ExtensionError(
              `Failed to trigger a click on the spaces toolbar button: A button with id ${name} does not exist for this extension.`
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
      },
    };
  }
};
