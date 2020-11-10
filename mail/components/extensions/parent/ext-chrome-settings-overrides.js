/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global searchInitialized */

// Copy of browser/components/extensions/parent/ext-chrome-settings-overrides.js
// minus HomePage.jsm (+ dependent ExtensionControlledPopup.jsm and
// ExtensionPermissions.jsm usage).

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
      DEFAULT_SEARCH_SETTING_NAME,
      id
    );
    if (!item) {
      return;
    }
    let control = await ExtensionSettingsStore.getLevelOfControl(
      id,
      DEFAULT_SEARCH_STORE_TYPE,
      DEFAULT_SEARCH_SETTING_NAME
    );
    item = ExtensionSettingsStore[action](
      id,
      DEFAULT_SEARCH_STORE_TYPE,
      DEFAULT_SEARCH_SETTING_NAME
    );
    if (item && control == "controlled_by_this_extension") {
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

    try {
      await Services.search.removeWebExtensionEngine(id);
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

  static async onEnabling(id) {
    await ExtensionSettingsStore.initialize();
    let item = await ExtensionSettingsStore.getSetting(
      DEFAULT_SEARCH_STORE_TYPE,
      DEFAULT_SEARCH_SETTING_NAME,
      id
    );
    if (item) {
      ExtensionSettingsStore.enable(
        id,
        DEFAULT_SEARCH_STORE_TYPE,
        DEFAULT_SEARCH_SETTING_NAME
      );
    }
  }

  static async onUninstall(id) {
    let searchStartupPromise = pendingSearchSetupTasks.get(id);
    if (searchStartupPromise) {
      await searchStartupPromise.catch(Cu.reportError);
    }
    // Note: We do not have to deal with homepage here as it is managed by
    // the ExtensionPreferencesManager.
    return Promise.all([this.removeSearchSettings(id)]);
  }

  static async onUpdate(id, manifest) {
    let haveSearchProvider =
      manifest &&
      manifest.chrome_settings_overrides &&
      manifest.chrome_settings_overrides.search_provider;

    if (!haveSearchProvider) {
      this.removeSearchSettings(id);
    } else if (
      !!haveSearchProvider.is_default &&
      (await ExtensionSettingsStore.initialize()) &&
      ExtensionSettingsStore.hasSetting(
        id,
        DEFAULT_SEARCH_STORE_TYPE,
        DEFAULT_SEARCH_SETTING_NAME
      )
    ) {
      // is_default has been removed, but we still have a setting. Remove it.
      chrome_settings_overrides.processDefaultSearchSetting(
        "removeSetting",
        id
      );
    }
  }

  static async onDisable(id) {
    await chrome_settings_overrides.processDefaultSearchSetting("disable", id);
    await chrome_settings_overrides.removeEngine(id);
  }

  async onManifestEntry(entryName) {
    let { extension } = this;
    let { manifest } = extension;
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
            // This is primarily for tests so that we know when an extension
            // has finished initialising.
            ExtensionParent.apiManager.emit("searchEngineProcessed", extension);
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

    // If we're not being requested to be set as default, then all we need
    // to do is to add the engine to the service. The search service can cope
    // with receiving added engines before it is initialised, so we don't have
    // to wait for it.
    if (!searchProvider.is_default) {
      await this.addSearchEngine();
      return;
    }

    await searchInitialized;
    if (!this.extension) {
      Cu.reportError(
        `Extension shut down before search provider was registered`
      );
      return;
    }

    let engineName = searchProvider.name.trim();
    let result = await Services.search.maybeSetAndOverrideDefault(extension);
    if (result.canChangeToAppProvided) {
      await this.setDefault(engineName);
    }
    if (!result.canInstallEngine) {
      // This extension is overriding an app-provided one, so we don't
      // add its engine as well.
      return;
    }
    await this.addSearchEngine();
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
            async respond(allow) {
              if (allow) {
                await ExtensionSettingsStore.initialize();
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
      await this.setDefault(engineName);
    }
  }

  async setDefault(engineName) {
    let { extension } = this;
    if (extension.startupReason === "ADDON_INSTALL") {
      let defaultEngine = await Services.search.getDefault();
      await ExtensionSettingsStore.initialize();
      // We should only get here if an extension is setting an app-provided
      // engine to default and we are ignoring the addons other engine settings.
      // In this case we do not show the prompt to the user.
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
      // We would be called for every extension being enabled, we should verify
      // that it has control and only then set it as default
      let control = await ExtensionSettingsStore.getLevelOfControl(
        extension.id,
        DEFAULT_SEARCH_STORE_TYPE,
        DEFAULT_SEARCH_SETTING_NAME
      );
      if (control === "controlled_by_this_extension") {
        await Services.search.setDefault(
          Services.search.getEngineByName(engineName)
        );
      }
    }
  }

  async addSearchEngine() {
    let { extension } = this;
    try {
      let engines = await Services.search.addEnginesFromExtension(extension);
      if (engines.length) {
        await ExtensionSettingsStore.initialize();
        await ExtensionSettingsStore.addSetting(
          extension.id,
          DEFAULT_SEARCH_STORE_TYPE,
          ENGINE_ADDED_SETTING_NAME,
          engines[0].name
        );
      }
    } catch (e) {
      Cu.reportError(e);
      return false;
    }
    return true;
  }
};
