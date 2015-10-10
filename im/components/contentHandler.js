/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

var Ci = Components.interfaces;
var Cc = Components.classes;
var Cr = Components.results;

// defined in nsIContentHandler.idl.
var NS_ERROR_WONT_HANDLE_CONTENT = 0x805d0001;

function contentHandler() {
}
contentHandler.prototype = {
  classID: Components.ID("{fda46332-1b03-4940-a30c-0997445d8e34}"),

  _xpcom_factory: {
    createInstance: function ch_factory_ci(outer, iid) {
      if (outer)
        throw Components.results.NS_ERROR_NO_AGGREGATION;
      return gContentHandler.QueryInterface(iid);
    }
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIContentHandler]),

  // nsIContentHandler

  handleContent: function ch_HandleContent(aContentType, aWindowContext,
                                            aRequest) {
    try {
      if (!Cc["@mozilla.org/webnavigation-info;1"]
             .getService(Ci.nsIWebNavigationInfo)
             .isTypeSupported(aContentType, null))
        throw NS_ERROR_WONT_HANDLE_CONTENT;
    }
    catch (e) {
      throw NS_ERROR_WONT_HANDLE_CONTENT;
    }

    aRequest.QueryInterface(Ci.nsIChannel);

    // Even though they are exposed (for OAuth dialogs), http and https
    // requests should be redirected to the external browser.
    if (!aRequest.URI.schemeIs("http") && !aRequest.URI.schemeIs("https"))
      throw NS_ERROR_WONT_HANDLE_CONTENT;

    Cc["@mozilla.org/uriloader/external-protocol-service;1"]
      .getService(Ci.nsIExternalProtocolService)
      .loadUrl(aRequest.URI);
    aRequest.cancel(Cr.NS_BINDING_ABORTED);
  },

  // nsIFactory
  createInstance: function ch_CI(outer, iid) {
    if (outer != null)
      throw Components.results.NS_ERROR_NO_AGGREGATION;

    return this.QueryInterface(iid);
  },

  lockFactory: function ch_lock(lock) {
    // No-op.
  }
};
var gContentHandler = new contentHandler();

var NSGetFactory = XPCOMUtils.generateNSGetFactory([contentHandler]);
