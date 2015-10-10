/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var Cc = Components.classes;
var Ci = Components.interfaces;

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

var APPLICATION_CID = Components.ID("f265021a-7f1d-4b4b-bdc6-9aedca4d8f13");
var APPLICATION_CONTRACTID = "@mozilla.org/steel/application;1";

//=================================================
// Factory - Treat Application as a singleton
// XXX This is required, because we're registered for the 'JavaScript global
// privileged property' category, whose handler always calls createInstance.
// See bug 386535.
var gSingleton = null;
var ApplicationFactory = {
  createInstance: function af_ci(aOuter, aIID) {
    if (aOuter != null)
      throw Components.results.NS_ERROR_NO_AGGREGATION;

    if (gSingleton == null) {
      gSingleton = new Application();
    }

    return gSingleton.QueryInterface(aIID);
  }
};

#include ../../mozilla/toolkit/components/exthelper/extApplication.js

function Application() {
  this.initToolkitHelpers();
}

Application.prototype = {
  // set the proto, defined in extApplication.js
  __proto__: extApplication.prototype,

  classID: APPLICATION_CID,

  // redefine the default factory for XPCOMUtils
  _xpcom_factory: ApplicationFactory,

  // for nsISupports
  QueryInterface : XPCOMUtils.generateQI([Ci.steelIApplication,
                                          Ci.extIApplication,
					  Ci.nsIObserver,
                                          Ci.nsISupportsWeakReference]),

  classInfo: XPCOMUtils.generateCI({classID: APPLICATION_CID,
				    contractID: APPLICATION_CONTRACTID,
				    interfaces: [Ci.steelIApplication,
						 Ci.extIApplication,
						 Ci.nsIObserver],
				    flags: Ci.nsIClassInfo.SINGLETON}),

  // for steelIApplication
  platformIsMac: "nsILocalFileMac" in Ci,
  platformIsLinux: (("@mozilla.org/gnome-gconf-service;1" in Cc) ||
                   ("@mozilla.org/gio-service;1" in Cc) ||
                    (Cc["@mozilla.org/system-info;1"].getService(Ci.nsIPropertyBag2)
                       .getProperty("name") == "Linux")),
  platformIsWindows: "@mozilla.org/windows-registry-key;1" in Cc
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([Application]);

