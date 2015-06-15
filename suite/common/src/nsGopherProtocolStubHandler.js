/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

/* This is a simple module which can be used as a template for any newly
   unsupported protocol. In this case, it redirects gopher:// protocol
   requests to the Mozilla Add-Ons page for OverbiteFF, which is a
   cross-platform extension for Gopherspace. This gives a soft-landing for
   support, which was withdrawn in Mozilla 2.0. See bugs 388195 and 572000. */

function GopherProtocol()
{
}

GopherProtocol.prototype = {
  classDescription: "Gopher protocol handler stub",
  classID: Components.ID("{22042bdb-56e4-47c6-8b12-fdfa859c05a9}"),

  // nsISupports
  QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIProtocolHandler]),

  // nsIProtocolHandler
  scheme: "gopher",
  defaultPort: 70,
  protocolFlags: Components.interfaces.nsIProtocolHandler.URI_NORELATIVE |
                 Components.interfaces.nsIProtocolHandler.URI_NOAUTH |
                 Components.interfaces.nsIProtocolHandler.URI_LOADABLE_BY_ANYONE,
  
  allowPort: function GP_allowPort(port, scheme) {
    return false; // meaningless.
  },

  newURI: function GP_newURI(spec, charset, baseURI) {
    var uri = Components.classes["@mozilla.org/network/standard-url;1"]
                        .createInstance(Components.interfaces.nsIStandardURL);
    uri.init(Components.interfaces.nsIStandardURL.URLTYPE_STANDARD,
      this.defaultPort, spec, charset, baseURI)
    return uri;
  },

  newChannel: function GP_newChannel(inputURI) {
    return this.newChannel2(inputURI, null);
  },

  newChannel2: function GP_newChannel2(inputURI, loadinfo) {
    var ios = Services.io;
    var newURI = ios.newURI("chrome://communicator/content/gopherAddon.xhtml", null, null);
    // Create a chrome channel, and de-chrome it, to our information page.
    var chan = loadinfo ? ios.newChannelFromURIWithLoadInfo(newURI, loadinfo) :
                          ios.newChannelFromURI2(newURI, null,
                                                 Services.scriptSecurityManager.getSystemPrincipal(),
                                                 null,
                                                 Components.interfaces.nsILoadInfo.SEC_NORMAL,
                                                 Components.interfaces.nsIContentPolicy.TYPE_OTHER);
    chan.originalURI = inputURI;
    chan.owner = Components.classes["@mozilla.org/scriptsecuritymanager;1"]
                           .getService(Components.interfaces.nsIScriptSecurityManager)
                           .getCodebasePrincipal(inputURI);
    return chan;
  }
};

/* Make our factory. */
var components = [ GopherProtocol ];
var NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
