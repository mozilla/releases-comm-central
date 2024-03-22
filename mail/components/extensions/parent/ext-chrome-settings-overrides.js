/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global searchInitialized */

// Copy of browser/components/extensions/parent/ext-chrome-settings-overrides.js
// minus HomePage.sys.mjs (+ dependent ExtensionControlledPopup.sys.mjs and
// ExtensionPermissions.sys.mjs usage).

"use strict";

var { ExtensionPreferencesManager } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionPreferencesManager.sys.mjs"
);
var { ExtensionParent } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionParent.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  ExtensionSettingsStore:
    "resource://gre/modules/ExtensionSettingsStore.sys.mjs",
});
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
    const control = await ExtensionSettingsStore.getLevelOfControl(
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
        const engine = Services.search.getEngineByName(
          item.value || item.initialValue
        );
        if (engine) {
          await Services.search.setDefault(
            engine,
            action == "enable"
              ? Ci.nsISearchService.CHANGE_REASON_ADDON_INSTALL
              : Ci.nsISearchService.CHANGE_REASON_ADDON_UNINSTALL
          );
        }
      } catch (e) {
        console.error(e);
      }
    }
  }

  static async removeEngine(id) {
    try {
      await Services.search.removeWebExtensionEngine(id);
    } catch (e) {
      console.error(e);
    }
  }

  static removeSearchSettings(id) {
    return Promise.all([
      this.processDefaultSearchSetting("removeSetting", id),
      this.removeEngine(id),
    ]);
  }

  static async onUninstall(id) {
    const searchStartupPromise = pendingSearchSetupTasks.get(id);
    if (searchStartupPromise) {
      await searchStartupPromise.catch(console.error);
    }
    // Note: We do not have to deal with homepage here as it is managed by
    // the ExtensionPreferencesManager.
    return Promise.all([this.removeSearchSettings(id)]);
  }

  static async onUpdate(id, manifest) {
    const search_provider =
      manifest?.chrome_settings_overrides?.search_provider;

    if (!search_provider) {
      // Remove setting and engine from search if necessary.
      this.removeSearchSettings(id);
    } else if (!search_provider.is_default) {
      // Remove the setting, but keep the engine in search.
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

  async onManifestEntry() {
    const { extension } = this;
    const { manifest } = extension;
    if (manifest.chrome_settings_overrides.search_provider) {
      // Registering a search engine can potentially take a long while,
      // or not complete at all (when searchInitialized is never resolved),
      // so we are deliberately not awaiting the returned promise here.
      const searchStartupPromise =
        this.processSearchProviderManifestEntry().finally(() => {
          if (
            pendingSearchSetupTasks.get(extension.id) === searchStartupPromise
          ) {
            pendingSearchSetupTasks.delete(extension.id);
            // This is primarily for tests so that we know when an extension
            // has finished initialising.
            ExtensionParent.apiManager.emit("searchEngineProcessed", extension);
          }
        });

      // Save the promise so we can await at onUninstall.
      pendingSearchSetupTasks.set(extension.id, searchStartupPromise);
    }
  }

  async ensureSetting(engineName, disable = false) {
    const { extension } = this;
    // Ensure the addon always has a setting
    await ExtensionSettingsStore.initialize();
    let item = ExtensionSettingsStore.getSetting(
      DEFAULT_SEARCH_STORE_TYPE,
      DEFAULT_SEARCH_SETTING_NAME,
      extension.id
    );
    if (!item) {
      const defaultEngine = await Services.search.getDefault();
      item = await ExtensionSettingsStore.addSetting(
        extension.id,
        DEFAULT_SEARCH_STORE_TYPE,
        DEFAULT_SEARCH_SETTING_NAME,
        engineName,
        () => defaultEngine.name
      );
      // If there was no setting, we're fixing old behavior in this api.
      // A lack of a setting would mean it was disabled before, disable it now.
      disable =
        disable ||
        ["ADDON_UPGRADE", "ADDON_DOWNGRADE", "ADDON_ENABLE"].includes(
          extension.startupReason
        );
    }

    // Ensure the item is disabled (either if exists and is not default or if it does not
    // exist yet).
    if (disable) {
      item = await ExtensionSettingsStore.disable(
        extension.id,
        DEFAULT_SEARCH_STORE_TYPE,
        DEFAULT_SEARCH_SETTING_NAME
      );
    }
    return item;
  }

  async promptDefaultSearch(engineName) {
    const { extension } = this;
    // Don't ask if it is already the current engine
    const engine = Services.search.getEngineByName(engineName);
    const defaultEngine = await Services.search.getDefault();
    if (defaultEngine.name == engine.name) {
      return;
    }
    // Ensures the setting exists and is disabled.  If the
    // user somehow bypasses the prompt, we do not want this
    // setting enabled for this extension.
    await this.ensureSetting(engineName, true);

    const subject = {
      wrappedJSObject: {
        // This is a hack because we don't have the browser of
        // the actual install. This means the popup might show
        // in a different window. Will be addressed in a followup bug.
        // As well, we still notify if no topWindow exists to support
        // testing from xpcshell.
        browser: windowTracker.topWindow?.gBrowser.selectedBrowser,
        id: extension.id,
        name: extension.name,
        icon: extension.iconURL,
        currentEngine: defaultEngine.name,
        newEngine: engineName,
        async respond(allow) {
          if (allow) {
            await chrome_settings_overrides.processDefaultSearchSetting(
              "enable",
              extension.id
            );
            await Services.search.setDefault(
              Services.search.getEngineByName(engineName),
              Ci.nsISearchService.CHANGE_REASON_ADDON_INSTALL
            );
          }
          // For testing
          Services.obs.notifyObservers(
            null,
            "webextension-defaultsearch-prompt-response"
          );
        },
      },
    };
    Services.obs.notifyObservers(subject, "webextension-defaultsearch-prompt");
  }

  async processSearchProviderManifestEntry() {
    const { extension } = this;
    const { manifest } = extension;
    const searchProvider = manifest.chrome_settings_overrides.search_provider;

    // If we're not being requested to be set as default, then all we need
    // to do is to add the engine to the service. The search service can cope
    // with receiving added engines before it is initialised, so we don't have
    // to wait for it.  Search Service will also prevent overriding a builtin
    // engine appropriately.
    if (!searchProvider.is_default) {
      await this.addSearchEngine();
      return;
    }

    await searchInitialized;
    if (!this.extension) {
      console.error(
        `Extension shut down before search provider was registered`
      );
      return;
    }

    const engineName = searchProvider.name.trim();
    const result = await Services.search.maybeSetAndOverrideDefault(extension);
    // This will only be set to true when the specified engine is an app-provided
    // engine, or when it is an allowed add-on defined in the list stored in
    // SearchDefaultOverrideAllowlistHandler.
    if (result.canChangeToAppProvided) {
      await this.setDefault(engineName, true);
    }
    if (!result.canInstallEngine) {
      // This extension is overriding an app-provided one, so we don't
      // add its engine as well.
      return;
    }
    await this.addSearchEngine();
    if (extension.startupReason === "ADDON_INSTALL") {
      await this.promptDefaultSearch(engineName);
    } else {
      // Needs to be called every time to handle reenabling.
      await this.setDefault(engineName);
    }
  }

  async setDefault(engineName, skipEnablePrompt = false) {
    const { extension } = this;
    if (extension.startupReason === "ADDON_INSTALL") {
      // We should only get here if an extension is setting an app-provided
      // engine to default and we are ignoring the addons other engine settings.
      // In this case we do not show the prompt to the user.
      const item = await this.ensureSetting(engineName);
      await Services.search.setDefault(
        Services.search.getEngineByName(item.value),
        Ci.nsISearchService.CHANGE_REASON_ADDON_INSTALL
      );
    } else if (
      ["ADDON_UPGRADE", "ADDON_DOWNGRADE", "ADDON_ENABLE"].includes(
        extension.startupReason
      )
    ) {
      // We would be called for every extension being enabled, we should verify
      // that it has control and only then set it as default
      let control = await ExtensionSettingsStore.getLevelOfControl(
        extension.id,
        DEFAULT_SEARCH_STORE_TYPE,
        DEFAULT_SEARCH_SETTING_NAME
      );

      // Check for an inconsistency between the value returned by getLevelOfcontrol
      // and the current engine actually set.
      if (
        control === "controlled_by_this_extension" &&
        Services.search.defaultEngine.name !== engineName
      ) {
        // Check for and fix any inconsistency between the extensions settings storage
        // and the current engine actually set.  If settings claims the extension is default
        // but the search service claims otherwise, select what the search service claims
        // (See Bug 1767550).
        const allSettings = ExtensionSettingsStore.getAllSettings(
          DEFAULT_SEARCH_STORE_TYPE,
          DEFAULT_SEARCH_SETTING_NAME
        );
        for (const setting of allSettings) {
          if (setting.value !== Services.search.defaultEngine.name) {
            await ExtensionSettingsStore.disable(
              setting.id,
              DEFAULT_SEARCH_STORE_TYPE,
              DEFAULT_SEARCH_SETTING_NAME
            );
          }
        }
        control = await ExtensionSettingsStore.getLevelOfControl(
          extension.id,
          DEFAULT_SEARCH_STORE_TYPE,
          DEFAULT_SEARCH_SETTING_NAME
        );
      }

      if (control === "controlled_by_this_extension") {
        await Services.search.setDefault(
          Services.search.getEngineByName(engineName),
          Ci.nsISearchService.CHANGE_REASON_ADDON_INSTALL
        );
      } else if (control === "controllable_by_this_extension") {
        if (skipEnablePrompt) {
          // For overriding app-provided engines, we don't prompt, so set
          // the default straight away.
          await chrome_settings_overrides.processDefaultSearchSetting(
            "enable",
            extension.id
          );
          await Services.search.setDefault(
            Services.search.getEngineByName(engineName),
            Ci.nsISearchService.CHANGE_REASON_ADDON_INSTALL
          );
        } else if (extension.startupReason == "ADDON_ENABLE") {
          // This extension has precedence, but is not in control.  Ask the user.
          await this.promptDefaultSearch(engineName);
        }
      }
    }
  }

  async addSearchEngine() {
    const { extension } = this;
    try {
      await Services.search.addEnginesFromExtension(extension);
    } catch (e) {
      console.error(e);
      return false;
    }
    return true;
  }
};
