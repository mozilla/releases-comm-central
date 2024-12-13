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
    // Add buttons of all extension spaces to the toolbar of each newly opened
    // normal window.
    for (const spaceData of spaceTracker.getAll()) {
      if (!spaceData.extension) {
        continue;
      }
      await window.gSpacesToolbar.createToolbarButton(
        spaceData.spaceButtonId,
        spaceData.tabProperties,
        getNativeButtonProperties(spaceData)
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
        async create(name, tabProperties, buttonProperties) {
          if (spaceTracker.fromSpaceName(name, context.extension)) {
            throw new ExtensionError(
              `Failed to create space with name ${name}: Space already exists for this extension.`
            );
          }

          if (!tabProperties) {
            tabProperties = {};
          } else if (typeof tabProperties == "string") {
            tabProperties = { url: tabProperties };
          }

          tabProperties.url = context.uri.resolve(tabProperties.url);
          if (
            !/((^https:)|(^http:)|(^moz-extension:))/i.test(tabProperties.url)
          ) {
            throw new ExtensionError(
              `Failed to create space with name ${name}: Invalid default url.`
            );
          }

          try {
            const spaceData = await spaceTracker.create(
              name,
              tabProperties,
              buttonProperties,
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
        async update(spaceId, updatedTabProperties, updatedButtonProperties) {
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

          if (!updatedTabProperties) {
            updatedTabProperties = {};
          } else if (typeof updatedTabProperties == "string") {
            updatedTabProperties = { url: updatedTabProperties };
          } else if (!updatedTabProperties.hasOwnProperty("url")) {
            // The concept for the update function is to have the 2nd and the 3rd
            // parameter optional, allowing to specify the 2nd, the 3rd or both
            // parameters. Even though these parameters do not have overlapping
            // properties, the schema parser is currently not able to properly
            // detect which parameter is specified, if both are actually defined
            // as optional. The only way out is to define the 2nd parameter as
            // non-optional and allow it to accept buttonProperties (what the 3rd
            // parameter is about). This needs manual parameter fixing here.
            updatedButtonProperties = { ...updatedTabProperties };
            updatedTabProperties = {};
          }

          let changes = false;
          if (updatedTabProperties.url) {
            updatedTabProperties.url = context.uri.resolve(
              updatedTabProperties.url
            );
            if (
              !/((^https:)|(^http:)|(^moz-extension:))/i.test(
                updatedTabProperties.url
              )
            ) {
              throw new ExtensionError(
                `Failed to update space with id ${spaceId}: Invalid default url.`
              );
            }
            spaceData.tabProperties.url = updatedTabProperties.url;
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
                    spaceData.tabProperties,
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
