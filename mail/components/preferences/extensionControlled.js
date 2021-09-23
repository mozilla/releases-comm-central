/* - This Source Code Form is subject to the terms of the Mozilla Public
   - License, v. 2.0. If a copy of the MPL was not distributed with this file,
   - You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from preferences.js */

"use strict";

ChromeUtils.defineModuleGetter(
  this,
  "AddonManager",
  "resource://gre/modules/AddonManager.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "DeferredTask",
  "resource://gre/modules/DeferredTask.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "ExtensionSettingsStore",
  "resource://gre/modules/ExtensionSettingsStore.jsm"
);

const API_PROXY_PREFS = [
  "network.proxy.type",
  "network.proxy.http",
  "network.proxy.http_port",
  "network.proxy.share_proxy_settings",
  "network.proxy.ssl",
  "network.proxy.ssl_port",
  "network.proxy.socks",
  "network.proxy.socks_port",
  "network.proxy.socks_version",
  "network.proxy.socks_remote_dns",
  "network.proxy.no_proxies_on",
  "network.proxy.autoconfig_url",
  "signon.autologin.proxy",
];

/**
 * Check if a pref is being managed by an extension.
 *
 * NOTE: We only currently handle proxy.settings.
 */
/**
 * Get the addon extension that is controlling the proxy settings.
 *
 * @return - The found addon, or undefined if none was found.
 */
async function getControllingProxyExtensionAddon() {
  await ExtensionSettingsStore.initialize();
  let id = ExtensionSettingsStore.getSetting("prefs", "proxy.settings")?.id;
  if (id) {
    return AddonManager.getAddonByID(id);
  }
  return undefined;
}

/**
 * Show or hide the proxy extension message depending on whether or not the
 * proxy settings are controlled by an extension.
 *
 * @return {boolean} - Whether the proxy settings are controlled by an
 *   extension.
 */
async function handleControllingProxyExtension() {
  let addon = await getControllingProxyExtensionAddon();
  if (addon) {
    showControllingProxyExtension(addon);
  } else {
    hideControllingProxyExtension();
  }
  return !!addon;
}

/**
 * Show the proxy extension message.
 *
 * @param {Object} addon - The addon extension that is currently controlling the
 *   proxy settings.
 * @param {string} addon.name - The addon name.
 * @param {string} [addon.iconUrl] - The addon icon source.
 */
function showControllingProxyExtension(addon) {
  let description = document.getElementById("proxyExtensionDescription");
  description
    .querySelector("img")
    .setAttribute(
      "src",
      addon.iconUrl || "chrome://mozapps/skin/extensions/extensionGeneric.svg"
    );
  document.l10n.setAttributes(
    description,
    "proxy-settings-controlled-by-extension",
    { name: addon.name }
  );

  document.getElementById("proxyExtensionContent").hidden = false;
}

/**
 * Hide the proxy extension message.
 */
function hideControllingProxyExtension() {
  document.getElementById("proxyExtensionContent").hidden = true;
}

/**
 * Disable the addon extension that is currently controlling the proxy settings.
 */
function disableControllingProxyExtension() {
  getControllingProxyExtensionAddon().then(addon => addon?.disable());
}

/**
 * Start listening to the proxy settings, and update the UI accordingly.
 *
 * @param {Object} container - The proxy container.
 * @param {Function} container.updateProxySettingsUI - A callback to call
 *   whenever the proxy settings change.
 */
function initializeProxyUI(container) {
  let deferredUpdate = new DeferredTask(() => {
    container.updateProxySettingsUI();
  }, 10);
  let proxyObserver = {
    observe: (subject, topic, data) => {
      if (API_PROXY_PREFS.includes(data)) {
        deferredUpdate.arm();
      }
    },
  };
  Services.prefs.addObserver("", proxyObserver);
  window.addEventListener("unload", () => {
    Services.prefs.removeObserver("", proxyObserver);
  });
}
