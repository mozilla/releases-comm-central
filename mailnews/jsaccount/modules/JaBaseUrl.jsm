/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["JaBaseUrlProperties", "JaBaseUrl"];

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;
var Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/jsaccount/JSAccountUtils.jsm");

// A partial JavaScript implementation of the base server methods.

const JaBaseUrlProperties = {

  // The CPP object that delgates to CPP or JS.
  baseContractID:     "@mozilla.org/jacppurldelegator;1",

  // Interfaces implemented by the base CPP version of this object.
  baseInterfaces:     [ Ci.nsIURI,
                        Ci.nsIURL,
                        Ci.nsIMsgMailNewsUrl,
                        Ci.nsIMsgMessageUrl,
                        Ci.msgIOverride,
                        Ci.nsISupports,
                        Ci.nsIInterfaceRequestor,
                        ],

  // We don't typically define this as a creatable component, but if we do use
  // these. Subclasses for particular account types require these defined for
  // that type.
  contractID:         "@mozilla.org/jsaccount/jaurl;1",
  classID:            Components.ID("{1E7B42CA-E6D9-408F-A4E4-8D2F82AECBBD}"),
};

function JaBaseUrl(aDelegator, aBaseInterfaces) {

// Typical boilerplate to include in all implementations.

  // Object delegating method calls to the appropriate XPCOM object.
  // Weak because it owns us.
  this._delegatorWeak = Cu.getWeakReference(aDelegator);

  // Base implementation of methods with no overrides.
  this.cppBase = aDelegator.cppBase;

  // cppBase class sees all interfaces
  aBaseInterfaces.forEach(iface => this.cppBase instanceof iface);
}

JaBaseUrl.prototype = {
// Typical boilerplate to include in all implementations.
  __proto__: JSAccountUtils.makeCppDelegator(JaBaseUrlProperties),

  // Flag this item as CPP needs to delegate to JS.
  _JsPrototypeToDelegate: true,

  // QI to the interfaces.
  QueryInterface: XPCOMUtils.generateQI(JaBaseUrlProperties.baseInterfaces),

  // Used to access an instance as JS, bypassing XPCOM.
  get wrappedJSObject() {
    return this;
  },

  // Accessor to the weak cpp delegator.
  get delegator() {
    return this._delegatorWeak.get();
  },

  // Dynamically-generated list of delegate methods.
  delegateList: null,

  // Implementation in JS  (if any) of methods in XPCOM interfaces.

};
