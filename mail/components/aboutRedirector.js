/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

function AboutRedirector() {}
AboutRedirector.prototype = {
  classDescription: "Mail about: Redirector",
  classID: Components.ID("{8cc51368-6aa0-43e8-b762-bde9b9fd828c}"),
  QueryInterface: ChromeUtils.generateQI([Ci.nsIAboutModule]),

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
      url: "chrome://messenger/content/preferences/aboutPreferences.xul",
      flags: Ci.nsIAboutModule.ALLOW_SCRIPT,
    },
    downloads: {
      url: "chrome://messenger/content/downloads/aboutDownloads.xul",
      flags: Ci.nsIAboutModule.ALLOW_SCRIPT,
    },
    policies: {
      url: "chrome://messenger/content/policies/aboutPolicies.xhtml",
      flags: Ci.nsIAboutModule.ALLOW_SCRIPT,
    },
  },

  /**
   * Gets the module name from the given URI.
   */
  _getModuleName(aURI) {
    // Strip out the first ? or #, and anything following it
    let name = /[^?#]+/.exec(aURI.pathQueryRef)[0];
    return name.toLowerCase();
  },

  getURIFlags(aURI) {
    let name = this._getModuleName(aURI);
    if (!(name in this._redirMap)) {
      throw Cr.NS_ERROR_ILLEGAL_VALUE;
    }
    return this._redirMap[name].flags;
  },

  newChannel(aURI, aLoadInfo) {
    let name = this._getModuleName(aURI);
    if (!(name in this._redirMap)) {
      throw Cr.NS_ERROR_ILLEGAL_VALUE;
    }

    let newURI = Services.io.newURI(this._redirMap[name].url);
    let channel = Services.io.newChannelFromURIWithLoadInfo(newURI, aLoadInfo);
    channel.originalURI = aURI;

    if (
      this._redirMap[name].flags &
      Ci.nsIAboutModule.URI_SAFE_FOR_UNTRUSTED_CONTENT
    ) {
      let principal = Services.scriptSecurityManager.createContentPrincipal(
        aURI,
        {}
      );
      channel.owner = principal;
    }

    return channel;
  },
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([AboutRedirector]);
