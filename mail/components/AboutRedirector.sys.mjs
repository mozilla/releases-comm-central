/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export function AboutRedirector() {}

AboutRedirector.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIAboutModule"]),

  // Each entry in the map has the key as the part after the "about:" and the
  // value as a record with url and flags entries. Note that each addition here
  // should be coupled with a corresponding addition in mailComponents.manifest.
  _redirMap: {
    newserror: {
      url: "chrome://messenger/content/newsError.xhtml",
      flags: Ci.nsIAboutModule.ALLOW_SCRIPT,
    },
    rights: {
      url: "chrome://messenger/content/aboutRights.xhtml",
      flags:
        Ci.nsIAboutModule.ALLOW_SCRIPT |
        Ci.nsIAboutModule.URI_SAFE_FOR_UNTRUSTED_CONTENT,
    },
    support: {
      url: "chrome://messenger/content/about-support/aboutSupport.xhtml",
      flags: Ci.nsIAboutModule.ALLOW_SCRIPT,
    },
    preferences: {
      url: "chrome://messenger/content/preferences/preferences.xhtml",
      flags: Ci.nsIAboutModule.ALLOW_SCRIPT,
    },
    downloads: {
      url: "chrome://messenger/content/downloads/aboutDownloads.xhtml",
      flags: Ci.nsIAboutModule.ALLOW_SCRIPT,
    },
    policies: {
      url: "chrome://messenger/content/policies/aboutPolicies.xhtml",
      flags: Ci.nsIAboutModule.ALLOW_SCRIPT,
    },
    accountsettings: {
      url: "chrome://messenger/content/AccountManager.xhtml",
      flags: Ci.nsIAboutModule.ALLOW_SCRIPT,
    },
    accountsetup: {
      url: "chrome://messenger/content/accountcreation/accountSetup.xhtml",
      flags: Ci.nsIAboutModule.ALLOW_SCRIPT,
    },
    addressbook: {
      url: "chrome://messenger/content/addressbook/aboutAddressBook.xhtml",
      flags: Ci.nsIAboutModule.ALLOW_SCRIPT,
    },
    "3pane": {
      url: "chrome://messenger/content/about3Pane.xhtml",
      flags: Ci.nsIAboutModule.ALLOW_SCRIPT,
    },
    message: {
      url: "chrome://messenger/content/aboutMessage.xhtml",
      flags: Ci.nsIAboutModule.ALLOW_SCRIPT,
    },
    import: {
      url: "chrome://messenger/content/aboutImport.xhtml",
      flags: Ci.nsIAboutModule.ALLOW_SCRIPT,
    },
    profiling: {
      url: "chrome://devtools/content/performance-new/aboutprofiling/index.xhtml",
      flags:
        Ci.nsIAboutModule.ALLOW_SCRIPT | Ci.nsIAboutModule.IS_SECURE_CHROME_UI,
    },
  },

  /**
   * Gets the module name from the given URI.
   */
  _getModuleName(aURI) {
    // Strip out the first ? or #, and anything following it
    const name = /[^?#]+/.exec(aURI.pathQueryRef)[0];
    return name.toLowerCase();
  },

  getURIFlags(aURI) {
    const name = this._getModuleName(aURI);
    if (!(name in this._redirMap)) {
      throw Components.Exception(`no about:${name}`, Cr.NS_ERROR_ILLEGAL_VALUE);
    }
    return this._redirMap[name].flags;
  },

  newChannel(aURI, aLoadInfo) {
    const name = this._getModuleName(aURI);
    if (!(name in this._redirMap)) {
      throw Components.Exception(`no about:${name}`, Cr.NS_ERROR_ILLEGAL_VALUE);
    }

    const newURI = Services.io.newURI(this._redirMap[name].url);
    const channel = Services.io.newChannelFromURIWithLoadInfo(
      newURI,
      aLoadInfo
    );
    channel.originalURI = aURI;

    if (
      this._redirMap[name].flags &
      Ci.nsIAboutModule.URI_SAFE_FOR_UNTRUSTED_CONTENT
    ) {
      const principal = Services.scriptSecurityManager.createContentPrincipal(
        aURI,
        {}
      );
      channel.owner = principal;
    }

    return channel;
  },

  getChromeURI(aURI) {
    const name = this._getModuleName(aURI);
    if (!(name in this._redirMap)) {
      throw Components.Exception(`no about:${name}`, Cr.NS_ERROR_ILLEGAL_VALUE);
    }
    return Services.io.newURI(this._redirMap[name].url);
  },
};
