/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionParent } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionParent.sys.mjs"
);
var { getNativeButtonProperties, getNativeTabProperties } =
  ChromeUtils.importESModule("resource:///modules/ExtensionSpaces.sys.mjs");

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
      await window.gSpacesToolbar.createToolbarButton(
        spaceData.spaceButtonId,
        getNativeTabProperties(spaceData),
        getNativeButtonProperties(spaceData)
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
    const { extension } = context;
    const { tabManager } = extension;
    this.widgetId = makeWidgetId(extension.id);

    // Enforce full startup of the parent implementation of the tabs API. This is
    // needed, because `tabs.onCreated.addListener()` is a synchronous child
    // implementation, which returns as soon as the listener has been registered
    // in the current child process, not waiting for the parent implementation of
    // the tabs API to actually register a listener for the native TabOpen event.
    // If the tab is opened through the spacesToolbar API, the parent implementation
    // of the tabs API may not even be fully initialized and the pending event
    // listener for the TabOpen event may not get registered in time.
    extensions.loadModule("tabs");

    return {
      spacesToolbar: {
        async addButton(name, buttonProperties) {
          if (spaceTracker.fromSpaceName(name, extension)) {
            throw new ExtensionError(
              `Failed to add button to the spaces toolbar: The id ${name} is already used by this extension.`
            );
          }

          // The deprecated spacesToolbar API handles the url as part of its
          // buttonProperties, but internally we store the url as part of the
          // tabProperties.
          const tabProperties = { url: buttonProperties.url };
          delete buttonProperties.url;

          try {
            const nativeButtonProperties = getNativeButtonProperties({
              extension,
              buttonProperties,
            });
            const nativeTabProperties = getNativeTabProperties({
              extension,
              tabProperties,
            });

            const spaceData = await spaceTracker.create(
              name,
              tabProperties,
              buttonProperties,
              extension
            );

            for (const window of ExtensionSupport.openWindows) {
              if (windowURLs.includes(window.location.href)) {
                await window.gSpacesToolbar.createToolbarButton(
                  spaceData.spaceButtonId,
                  nativeTabProperties,
                  nativeButtonProperties
                );
              }
            }

            return spaceData.spaceId;
          } catch (error) {
            throw new ExtensionError(
              `Failed to add button to the spaces toolbar: ${error.message}`
            );
          }
        },
        async removeButton(name) {
          const spaceData = spaceTracker.fromSpaceName(name, extension);
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
          const spaceData = spaceTracker.fromSpaceName(name, extension);
          if (!spaceData) {
            throw new ExtensionError(
              `Failed to update button in the spaces toolbar: A button with id ${name} does not exist for this extension.`
            );
          }

          let changes = false;
          const buttonProperties = { ...spaceData.buttonProperties };
          const tabProperties = { ...spaceData.tabProperties };
          for (const [key, value] of Object.entries(updatedProperties)) {
            if (value != null) {
              // The deprecated spacesToolbar API handles the url as part of its
              // buttonProperties, but internally we store the url as part of the
              // tabProperties.
              if (key == "url") {
                tabProperties[key] = value;
              } else {
                buttonProperties[key] = value;
              }
              changes = true;
            }
          }

          if (!changes) {
            return;
          }

          try {
            const nativeButtonProperties = getNativeButtonProperties({
              extension,
              buttonProperties,
            });
            const nativeTabProperties = getNativeTabProperties({
              extension,
              tabProperties,
            });

            for (const window of ExtensionSupport.openWindows) {
              if (windowURLs.includes(window.location.href)) {
                await window.gSpacesToolbar.updateToolbarButton(
                  spaceData.spaceButtonId,
                  nativeTabProperties,
                  nativeButtonProperties
                );
              }
            }

            spaceData.buttonProperties = buttonProperties;
            spaceData.tabProperties = tabProperties;
            spaceTracker.update(spaceData);
          } catch (error) {
            throw new ExtensionError(
              `Failed to update button in the spaces toolbar: ${error.message}`
            );
          }
        },
        async clickButton(name, windowId) {
          const spaceData = spaceTracker.fromSpaceName(name, extension);
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
