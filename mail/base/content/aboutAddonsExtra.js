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

  // Consume clicks on a-tags and let openTrustedLinkIn() decide how to open them.
  window.addEventListener("click", event => {
    if (event.target.matches("a[href]") && event.target.href) {
      let uri = Services.io.newURI(event.target.href);
      if (uri.scheme == "http" || uri.scheme == "https") {
        event.preventDefault();
        event.stopPropagation();
        windowRoot.ownerGlobal.openTrustedLinkIn(event.target.href, "tab");
      }
    }
  });

  // Fix the "Search on addons.mozilla.org" placeholder text in the searchbox.
  let textbox = document.querySelector("search-addons > search-textbox");
  document.l10n.setAttributes(textbox, "atn-addons-heading-search-input");

  // Add our stylesheet.
  let contentStylesheet = document.createProcessingInstruction(
    "xml-stylesheet",
    'href="chrome://messenger/skin/aboutAddonsExtra.css" type="text/css"'
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
    const { STATE_SOFTBLOCKED } = Ci.nsIBlocklistService;

    let data = new ExtensionData(addon.getResourceURI());
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

  // Remove this after Bug 1773568 has been uplifted to ESR 102.
  AddonCard.prototype.updateMessage = async function () {
    const messageBar = this.card.querySelector(".addon-card-message");

    const {
      linkUrl,
      messageId,
      messageArgs,
      type = "",
    } = await getAddonMessageInfo(this.addon);

    if (messageId) {
      document.l10n.pauseObserving();
      document.l10n.setAttributes(
        messageBar.querySelector("span"),
        messageId,
        messageArgs
      );

      const link = messageBar.querySelector("button");
      if (linkUrl) {
        // Do not use the missing locale string, but instead use one having a
        // similar wording.
        let localeId = (messageId == "details-notification-incompatible")
          ? "details-notification-unsigned-and-disabled-link"
          : `${messageId}-link`
        document.l10n.setAttributes(link, localeId);
        link.setAttribute("url", linkUrl);
        link.hidden = false;
      } else {
        link.hidden = true;
      }

      document.l10n.resumeObserving();
      await document.l10n.translateFragment(messageBar);
      messageBar.setAttribute("type", type);
      messageBar.hidden = false;
    } else {
      messageBar.hidden = true;
    }
  }

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

  await customElements.whenDefined("search-addons");
  SearchAddons.prototype.searchAddons = function(query) {
    if (query.length === 0) {
      return;
    }

    let url = new URL(
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

    let browser = getBrowserElement();
    let chromewin = browser.ownerGlobal;
    chromewin.openLinkIn(url.href, "tab", {
      fromChrome: true,
      triggeringPrincipal: Services.scriptSecurityManager.createNullPrincipal(
        {}
      ),
    });

    AMTelemetry.recordLinkEvent({
      object: "aboutAddons",
      value: "search",
      extra: {
        type: this.closest("addon-page-header").getAttribute("type"),
        view: getTelemetryViewName(this),
      },
    });
  };
})();
