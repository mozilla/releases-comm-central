/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

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
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIProtocolHandler]),

  // nsIProtocolHandler
  scheme: "gopher",
  defaultPort: 70,
  protocolFlags: Ci.nsIProtocolHandler.URI_NORELATIVE |
                 Ci.nsIProtocolHandler.URI_NOAUTH |
                 Ci.nsIProtocolHandler.URI_LOADABLE_BY_ANYONE,

  allowPort: function GP_allowPort(port, scheme) {
    return false; // meaningless.
  },

  newURI: function GP_newURI(spec, charset, baseURI) {
    return Cc["@mozilla.org/network/standard-url-mutator;1"]
             .createInstance(Ci.nsIStandardURLMutator)
             .init(Ci.nsIStandardURL.URLTYPE_STANDARD,
                   this.defaultPort, spec, charset, baseURI)
             .finalize()
             .QueryInterface(Ci.nsIStandardURL);
  },

  newChannel: function GP_newChannel(inputURI) {
    return this.newChannel2(inputURI, null);
  },

  newChannel2: function GP_newChannel2(inputURI, loadinfo) {
    var newURI = Services.io.newURI("chrome://communicator/content/gopherAddon.xhtml");
    // Create a chrome channel, and de-chrome it, to our information page.
    var chan =
      loadinfo ? Services.io.newChannelFromURIWithLoadInfo(newURI, loadinfo) :
                 Services.io.newChannelFromURI(newURI, null,
                                               Services.scriptSecurityManager.getSystemPrincipal(),
                                               null,
                                               Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
                                               Ci.nsIContentPolicy.TYPE_OTHER);
    chan.originalURI = inputURI;
    chan.owner = Services.scriptSecurityManager.createCodebasePrincipal(inputURI, {});
    return chan;
  }
};

/* Make our factory. */
var components = [ GopherProtocol ];
var NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
