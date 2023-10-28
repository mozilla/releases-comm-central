/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../toolkit/mozapps/extensions/content/aboutaddons.js */

const THUNDERBIRD_THEME_PREVIEWS = new Map([
  [
    "thunderbird-compact-light@mozilla.org",
    "resource://builtin-themes/light/preview.svg",
  ],
  [
    "thunderbird-compact-dark@mozilla.org",
    "resource://builtin-themes/dark/preview.svg",
  ],
]);

var { UIFontSize } = ChromeUtils.import("resource:///modules/UIFontSize.jsm");
ChromeUtils.defineESModuleGetters(this, {
  ExtensionData: "resource://gre/modules/Extension.sys.mjs",
});

XPCOMUtils.defineLazyPreferenceGetter(
  this,
  "alternativeAddonSearchUrl",
  "extensions.alternativeAddonSearch.url"
);

(async function () {
  window.MozXULElement.insertFTLIfNeeded("messenger/aboutAddonsExtra.ftl");
  // Needed for webext-perms-description-experiment.
  window.MozXULElement.insertFTLIfNeeded("messenger/extensionPermissions.ftl");
  UIFontSize.registerWindow(window);

  // Consume clicks on a-tags and let openTrustedLinkIn() decide how to open them.
  window.addEventListener("click", event => {
    if (event.target.matches("a[href]") && event.target.href) {
      const uri = Services.io.newURI(event.target.href);
      if (uri.scheme == "http" || uri.scheme == "https") {
        event.preventDefault();
        event.stopPropagation();
        windowRoot.ownerGlobal.openTrustedLinkIn(event.target.href, "tab");
      }
    }
  });

  // Fix the "Search on addons.mozilla.org" placeholder text in the searchbox.
  const textbox = document.querySelector("search-addons > search-textbox");
  document.l10n.setAttributes(textbox, "atn-addons-heading-search-input");

  // Add our stylesheet.
  const contentStylesheet = document.createElement("link");
  contentStylesheet.rel = "stylesheet";
  contentStylesheet.href = "chrome://messenger/skin/aboutAddonsExtra.css";
  document.head.appendChild(contentStylesheet);

  // Override logic for detecting unsigned add-ons.
  window.isCorrectlySigned = function () {
    return true;
  };

  // Load our theme screenshots.
  const _getScreenshotUrlForAddon = getScreenshotUrlForAddon;
  getScreenshotUrlForAddon = function (addon) {
    if (THUNDERBIRD_THEME_PREVIEWS.has(addon.id)) {
      return THUNDERBIRD_THEME_PREVIEWS.get(addon.id);
    }
    return _getScreenshotUrlForAddon(addon);
  };

  // Add logic to detect add-ons using the unsupported legacy API.
  const getMozillaAddonMessageInfo = window.getAddonMessageInfo;
  window.getAddonMessageInfo = async function (addon) {
    const { name } = addon;
    const { STATE_SOFTBLOCKED } = Ci.nsIBlocklistService;

    const data = new ExtensionData(addon.getResourceURI());
    await data.loadManifest();
    if (
      addon.type == "extension" &&
      (data.manifest.legacy ||
        (!addon.isCompatible &&
          (AddonManager.checkCompatibility ||
            addon.blocklistState !== STATE_SOFTBLOCKED)))
    ) {
      return {
        linkText: await document.l10n.formatValue(
          "add-on-search-alternative-button-label"
        ),
        linkUrl: `${alternativeAddonSearchUrl}?id=${encodeURIComponent(
          addon.id
        )}&q=${encodeURIComponent(name)}`,
        messageId: "details-notification-incompatible",
        messageArgs: { name, version: Services.appinfo.version },
        type: "warning",
      };
    }
    return getMozillaAddonMessageInfo(addon);
  };
  document.querySelectorAll("addon-card").forEach(card => card.updateMessage());

  // Override parts of the addon-card customElement to be able
  // to add a dedicated button for extension preferences.
  await customElements.whenDefined("addon-card");
  AddonCard.prototype.addOptionsButton = async function () {
    const { addon, optionsButton } = this;
    if (addon.type != "extension") {
      return;
    }

    let addonOptionsButton = this.querySelector(".extension-options-button");
    if (!addonOptionsButton) {
      addonOptionsButton = document.createElement("button");
      addonOptionsButton.classList.add("extension-options-button");
      addonOptionsButton.setAttribute("action", "preferences");
      document.l10n.setAttributes(addonOptionsButton, "add-on-options-button");
      addonOptionsButton.disabled = true;
      optionsButton.parentNode.insertBefore(addonOptionsButton, optionsButton);
    }

    // Upon fresh install the manifest has not been parsed and optionsType
    // is not known, manually trigger parsing.
    if (addon.isActive && !addon.optionsType) {
      const data = new ExtensionData(addon.getResourceURI());
      await data.loadManifest();
    }

    addonOptionsButton.disabled = !(addon.isActive && addon.optionsType);
  };
  AddonCard.prototype._update = AddonCard.prototype.update;
  AddonCard.prototype.update = function () {
    this._update();
    this.addOptionsButton();
  };

  // Override parts of the addon-permission-list customElement to be able
  // to show the usage of Experiments in the permission list.
  await customElements.whenDefined("addon-permissions-list");
  AddonPermissionsList.prototype.renderExperimentOnly = function () {
    this.textContent = "";
    const frag = importTemplate("addon-permissions-list");
    const section = frag.querySelector(".addon-permissions-required");
    section.hidden = false;
    const list = section.querySelector(".addon-permissions-list");

    const item = document.createElement("li");
    document.l10n.setAttributes(item, "webext-perms-description-experiment");
    item.classList.add("permission-info", "permission-checked");
    list.appendChild(item);

    this.appendChild(frag);
  };
  // We change this function from sync to async, which does not matter.
  // It calls this.render() which is async without awaiting it anyway.
  AddonPermissionsList.prototype.setAddon = async function (addon) {
    this.addon = addon;
    const data = new ExtensionData(addon.getResourceURI());
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
  RecommendedAddonCard.prototype.setCardContent = function (card, addon) {
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

  await customElements.whenDefined("search-addons");
  SearchAddons.prototype.searchAddons = function (query) {
    if (query.length === 0) {
      return;
    }

    const url = new URL(
      formatUTMParams(
        "addons-manager-search",
        AddonRepository.getSearchURL(query)
      )
    );

    // Limit search to themes, if the themes section is currently active.
    if (
      document.getElementById("page-header").getAttribute("type") == "theme"
    ) {
      url.searchParams.set("cat", "themes");
    }

    const browser = getBrowserElement();
    const chromewin = browser.ownerGlobal;
    chromewin.openLinkIn(url.href, "tab", {
      fromChrome: true,
      triggeringPrincipal: Services.scriptSecurityManager.createNullPrincipal(
        {}
      ),
    });
  };
})();
