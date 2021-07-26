/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../toolkit/mozapps/extensions/content/aboutaddons.js */

const THUNDERBIRD_THEME_PREVIEWS = new Map([
  [
    "thunderbird-compact-light@mozilla.org",
    "chrome://mozapps/content/extensions/firefox-compact-light.svg",
  ],
  [
    "thunderbird-compact-dark@mozilla.org",
    "chrome://mozapps/content/extensions/firefox-compact-dark.svg",
  ],
]);

XPCOMUtils.defineLazyModuleGetters(this, {
  ExtensionData: "resource://gre/modules/Extension.jsm",
});

XPCOMUtils.defineLazyPreferenceGetter(
  this,
  "alternativeAddonSearchUrl",
  "extensions.alternativeAddonSearch.url"
);

(async function() {
  window.MozXULElement.insertFTLIfNeeded("messenger/aboutAddonsExtra.ftl");

  // Fix the "Search on addons.mozilla.org" placeholder text in the searchbox.
  let textbox = document.querySelector("search-addons > search-textbox");
  document.l10n.setAttributes(textbox, "atn-addons-heading-search-input");

  // Change the "Settings" button to "Preferences".
  let prefsButton = document.querySelector(
    "#preferencesButton > .sidebar-footer-label"
  );
  document.l10n.setAttributes(prefsButton, "sidebar-preferences-button-title");

  // Add our stylesheet.
  let contentStylesheet = document.createProcessingInstruction(
    "xml-stylesheet",
    'href="chrome://messenger/content/aboutAddonsExtra.css" type="text/css"'
  );
  document.insertBefore(contentStylesheet, document.documentElement);

  // Override logic for detecting unsigned add-ons.
  window.isCorrectlySigned = function() {
    return true;
  };
  // Load our permissions strings.
  delete window.browserBundle;
  window.browserBundle = Services.strings.createBundle(
    "chrome://messenger/locale/addons.properties"
  );

  // Load our theme screenshots.
  let _getScreenshotUrlForAddon = getScreenshotUrlForAddon;
  getScreenshotUrlForAddon = function(addon) {
    if (THUNDERBIRD_THEME_PREVIEWS.has(addon.id)) {
      return THUNDERBIRD_THEME_PREVIEWS.get(addon.id);
    }
    return _getScreenshotUrlForAddon(addon);
  };

  // Add logic to detect add-ons using the unsupported legacy API.
  let getMozillaAddonMessageInfo = window.getAddonMessageInfo;
  window.getAddonMessageInfo = async function(addon) {
    const { name } = addon;
    const appName = brandBundle.GetStringFromName("brandShortName");
    const { STATE_SOFTBLOCKED } = Ci.nsIBlocklistService;
    const formatString = (name, args) =>
      extBundle.formatStringFromName(
        `details.notification.${name}`,
        args,
        args.length
      );
    let data = new ExtensionData(addon.getResourceURI());
    await data.loadManifest();
    if (
      data.manifest.legacy ||
      (!addon.isCompatible &&
        (AddonManager.checkCompatibility ||
          addon.blocklistState !== STATE_SOFTBLOCKED))
    ) {
      return {
        linkText: await document.l10n.formatValue(
          "add-on-search-alternative-button-label"
        ),
        linkUrl: `${alternativeAddonSearchUrl}?id=${encodeURIComponent(
          addon.id
        )}&q=${encodeURIComponent(name)}`,
        message: formatString("incompatible", [
          name,
          appName,
          Services.appinfo.version,
        ]),
        type: "warning",
      };
    }
    return getMozillaAddonMessageInfo(addon);
  };
  document.querySelectorAll("addon-card").forEach(card => card.updateMessage());

  // Override parts of the addon-card customElement to be able
  // to add a dedicated button for extension preferences.
  await customElements.whenDefined("addon-card");
  AddonCard.prototype.addOptionsButton = async function() {
    let { addon, optionsButton } = this;
    if (addon.type != "extension") {
      return;
    }

    let addonOptionsButton = this.querySelector(".extension-options-button");
    if (addon.isActive) {
      if (!addon.optionsType) {
        // Upon fresh install the manifest has not been parsed and optionsType
        // is not known, manually trigger parsing.
        let data = new ExtensionData(addon.getResourceURI());
        await data.loadManifest();
      }

      if (addon.optionsType) {
        if (!addonOptionsButton) {
          addonOptionsButton = document.createElement("button");
          addonOptionsButton.classList.add("extension-options-button");
          addonOptionsButton.setAttribute("action", "preferences");
          addonOptionsButton.setAttribute(
            "data-l10n-id",
            "add-on-options-button"
          );
          optionsButton.parentNode.insertBefore(
            addonOptionsButton,
            optionsButton
          );
        }
      }
    } else if (addonOptionsButton) {
      addonOptionsButton.remove();
    }
  };
  AddonCard.prototype._update = AddonCard.prototype.update;
  AddonCard.prototype.update = function() {
    this._update();
    this.addOptionsButton();
  };

  // Override parts of the addon-permission-list customElement to be able
  // to show the usage of Experiments in the permission list.
  await customElements.whenDefined("addon-permissions-list");
  AddonPermissionsList.prototype.renderExperimentOnly = function() {
    let appName = brandBundle.GetStringFromName("brandShortName");

    this.textContent = "";
    let frag = importTemplate("addon-permissions-list");
    let section = frag.querySelector(".addon-permissions-required");
    section.hidden = false;
    let list = section.querySelector(".addon-permissions-list");

    let msg = browserBundle.formatStringFromName(
      "webextPerms.description.experiment",
      [appName]
    );
    let item = document.createElement("li");
    item.classList.add("permission-info", "permission-checked");
    item.appendChild(document.createTextNode(msg));
    list.appendChild(item);

    this.appendChild(frag);
  };
  // We change this function from sync to async, which does not matter.
  // It calls this.render() which is async without awaiting it anyway.
  AddonPermissionsList.prototype.setAddon = async function(addon) {
    this.addon = addon;
    let data = new ExtensionData(addon.getResourceURI());
    await data.loadManifest();
    if (data.manifest.experiment_apis) {
      this.renderExperimentOnly();
    } else {
      this.render();
    }
  };

  await customElements.whenDefined("recommended-addon-card");
  RecommendedAddonCard.prototype._setCardContent =
    RecommendedAddonCard.prototype.setCardContent;
  RecommendedAddonCard.prototype.setCardContent = function(card, addon) {
    this._setCardContent(card, addon);
    card.addEventListener("click", event => {
      if (event.target.matches("a[href]") || event.target.matches("button")) {
        return;
      }
      windowRoot.ownerGlobal.openTrustedLinkIn(
        card.querySelector(".disco-addon-author a").href,
        "tab"
      );
    });
  };
})();
