/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ext-mail.js */

"use strict";

var { ExtensionPreferencesManager } = ChromeUtils.import(
  "resource://gre/modules/ExtensionPreferencesManager.jsm"
);
var { ExtensionParent } = ChromeUtils.import(
  "resource://gre/modules/ExtensionParent.jsm"
);

ChromeUtils.defineModuleGetter(
  this,
  "ExtensionSettingsStore",
  "resource://gre/modules/ExtensionSettingsStore.jsm"
);

const DEFAULT_SEARCH_STORE_TYPE = "default_search";
const DEFAULT_SEARCH_SETTING_NAME = "defaultSearch";
const ENGINE_ADDED_SETTING_NAME = "engineAdded";

// When an extension starts up, a search engine may asynchronously be
// registered, without blocking the startup. When an extension is
// uninstalled, we need to wait for this registration to finish
// before running the uninstallation handler.
// Map[extension id -> Promise]
var pendingSearchSetupTasks = new Map();

this.chrome_settings_overrides = class extends ExtensionAPI {
  static async processDefaultSearchSetting(action, id) {
    await ExtensionSettingsStore.initialize();
    let item = ExtensionSettingsStore.getSetting(
      DEFAULT_SEARCH_STORE_TYPE,
      DEFAULT_SEARCH_SETTING_NAME
    );
    if (!item) {
      return;
    }
    if (
      Services.search.defaultEngine.name != item.value &&
      Services.search.defaultEngine.name != item.initialValue
    ) {
      // The current engine is not the same as the value that the ExtensionSettingsStore has.
      // This means that the user changed the engine, so we shouldn't control it anymore.
      // Do nothing and remove our entry from the ExtensionSettingsStore.
      ExtensionSettingsStore.removeSetting(
        id,
        DEFAULT_SEARCH_STORE_TYPE,
        DEFAULT_SEARCH_SETTING_NAME
      );
      return;
    }
    item = ExtensionSettingsStore[action](
      id,
      DEFAULT_SEARCH_STORE_TYPE,
      DEFAULT_SEARCH_SETTING_NAME
    );
    if (item) {
      try {
        let engine = Services.search.getEngineByName(
          item.value || item.initialValue
        );
        if (engine) {
          Services.search.defaultEngine = engine;
        }
      } catch (e) {
        Cu.reportError(e);
      }
    }
  }

  static async removeEngine(id) {
    await ExtensionSettingsStore.initialize();
    let item = await ExtensionSettingsStore.getSetting(
      DEFAULT_SEARCH_STORE_TYPE,
      ENGINE_ADDED_SETTING_NAME,
      id
    );
    if (item) {
      ExtensionSettingsStore.removeSetting(
        id,
        DEFAULT_SEARCH_STORE_TYPE,
        ENGINE_ADDED_SETTING_NAME
      );
    }
    // We can call removeEngine in nsSearchService startup, if so we dont
    // need to reforward the call, just disable the web extension.
    if (!Services.search.isInitialized) {
      return;
    }

    try {
      let engines = await Services.search.getEnginesByExtensionID(id);
      if (engines.length > 0) {
        await Services.search.removeWebExtensionEngine(id);
      }
    } catch (e) {
      Cu.reportError(e);
    }
  }

  static removeSearchSettings(id) {
    return Promise.all([
      this.processDefaultSearchSetting("removeSetting", id),
      this.removeEngine(id),
    ]);
  }

  static async onUninstall(id) {
    let searchStartupPromise = pendingSearchSetupTasks.get(id);
    if (searchStartupPromise) {
      await searchStartupPromise;
    }
    return Promise.all([this.removeSearchSettings(id)]);
  }

  static onUpdate(id, manifest) {
    let haveSearchProvider =
      manifest &&
      manifest.chrome_settings_overrides &&
      manifest.chrome_settings_overrides.search_provider;
    if (!haveSearchProvider) {
      this.removeSearchSettings(id);
    }
  }

  static onDisable(id) {
    chrome_settings_overrides.processDefaultSearchSetting("disable", id);
    chrome_settings_overrides.removeEngine(id);
  }

  async onManifestEntry(entryName) {
    let { extension } = this;
    let { manifest } = extension;

    await ExtensionSettingsStore.initialize();

    if (manifest.chrome_settings_overrides.search_provider) {
      // Registering a search engine can potentially take a long while,
      // or not complete at all (when searchInitialized is never resolved),
      // so we are deliberately not awaiting the returned promise here.
      let searchStartupPromise = this.processSearchProviderManifestEntry().finally(
        () => {
          if (
            pendingSearchSetupTasks.get(extension.id) === searchStartupPromise
          ) {
            pendingSearchSetupTasks.delete(extension.id);
          }
        }
      );

      // Save the promise so we can await at onUninstall.
      pendingSearchSetupTasks.set(extension.id, searchStartupPromise);
    }
  }

  async processSearchProviderManifestEntry() {
    let { extension } = this;
    let { manifest } = extension;
    let searchProvider = manifest.chrome_settings_overrides.search_provider;
    if (searchProvider.is_default) {
      await searchInitialized;
      if (!this.extension) {
        Cu.reportError(
          `Extension shut down before search provider was registered`
        );
        return;
      }
    }

    let engineName = searchProvider.name.trim();
    if (searchProvider.is_default) {
      let engine = Services.search.getEngineByName(engineName);
      let defaultEngines = await Services.search.getDefaultEngines();
      if (
        engine &&
        defaultEngines.some(defaultEngine => defaultEngine.name == engineName)
      ) {
        // Needs to be called every time to handle reenabling, but
        // only sets default for install or enable.
        await this.setDefault(engineName);
        // For built in search engines, we don't do anything further
        return;
      }
    }
    await this.addSearchEngine();
    if (searchProvider.is_default) {
      if (extension.startupReason === "ADDON_INSTALL") {
        // Don't ask if it already the current engine
        let engine = Services.search.getEngineByName(engineName);
        let defaultEngine = await Services.search.getDefault();
        if (defaultEngine.name != engine.name) {
          let subject = {
            wrappedJSObject: {
              // This is a hack because we don't have the browser of
              // the actual install. This means the popup might show
              // in a different window. Will be addressed in a followup bug.
              browser: windowTracker.topWindow.gBrowser.selectedBrowser,
              name: this.extension.name,
              icon: this.extension.iconURL,
              currentEngine: defaultEngine.name,
              newEngine: engineName,
              respond(allow) {
                if (allow) {
                  ExtensionSettingsStore.addSetting(
                    extension.id,
                    DEFAULT_SEARCH_STORE_TYPE,
                    DEFAULT_SEARCH_SETTING_NAME,
                    engineName,
                    () => defaultEngine.name
                  );
                  Services.search.defaultEngine = Services.search.getEngineByName(
                    engineName
                  );
                }
              },
            },
          };
          Services.obs.notifyObservers(
            subject,
            "webextension-defaultsearch-prompt"
          );
        }
      } else {
        // Needs to be called every time to handle reenabling, but
        // only sets default for install or enable.
        this.setDefault(engineName);
      }
    } else if (
      ExtensionSettingsStore.hasSetting(
        extension.id,
        DEFAULT_SEARCH_STORE_TYPE,
        DEFAULT_SEARCH_SETTING_NAME
      )
    ) {
      // is_default has been removed, but we still have a setting. Remove it.
      chrome_settings_overrides.processDefaultSearchSetting(
        "removeSetting",
        extension.id
      );
    }
  }

  async setDefault(engineName) {
    let { extension } = this;
    if (extension.startupReason === "ADDON_INSTALL") {
      let defaultEngine = await Services.search.getDefault();
      let item = await ExtensionSettingsStore.addSetting(
        extension.id,
        DEFAULT_SEARCH_STORE_TYPE,
        DEFAULT_SEARCH_SETTING_NAME,
        engineName,
        () => defaultEngine.name
      );
      await Services.search.setDefault(
        Services.search.getEngineByName(item.value)
      );
    } else if (extension.startupReason === "ADDON_ENABLE") {
      chrome_settings_overrides.processDefaultSearchSetting(
        "enable",
        extension.id
      );
    }
  }

  async addSearchEngine() {
    let { extension } = this;
    let isCurrent = false;
    let index = -1;
    if (
      extension.startupReason === "ADDON_UPGRADE" &&
      !extension.addonData.builtIn
    ) {
      let engines = await Services.search.getEnginesByExtensionID(extension.id);
      if (engines.length > 0) {
        let firstEngine = engines[0];
        let firstEngineName = firstEngine.name;
        // There can be only one engine right now
        isCurrent =
          (await Services.search.getDefault()).name == firstEngineName;
        // Get position of engine and store it
        index = (await Services.search.getEngines())
          .map(engine => engine.name)
          .indexOf(firstEngineName);
        await Services.search.removeEngine(firstEngine);
      }
    }
    try {
      let engines = await Services.search.addEnginesFromExtension(extension);
      if (engines.length > 0) {
        await ExtensionSettingsStore.addSetting(
          extension.id,
          DEFAULT_SEARCH_STORE_TYPE,
          ENGINE_ADDED_SETTING_NAME,
          engines[0].name
        );
      }
      if (
        extension.startupReason === "ADDON_UPGRADE" &&
        !extension.addonData.builtIn
      ) {
        let engines = await Services.search.getEnginesByExtensionID(
          extension.id
        );
        let engine = Services.search.getEngineByName(engines[0].name);
        if (isCurrent) {
          await Services.search.setDefault(engine);
        }
        if (index != -1) {
          await Services.search.moveEngine(engine, index);
        }
      }
    } catch (e) {
      Cu.reportError(e);
      return false;
    }
    return true;
  }
};
