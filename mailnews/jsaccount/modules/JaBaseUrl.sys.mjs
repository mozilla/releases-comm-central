/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { JSAccountUtils } from "resource:///modules/jsaccount/JSAccountUtils.sys.mjs";

// A partial JavaScript implementation of the base server methods.

export const JaBaseUrlProperties = {
  // The CPP object that delegates to CPP or JS.
  baseContractID: "@mozilla.org/jacppurldelegator;1",

  // Interfaces implemented by the base CPP version of this object.
  baseInterfaces: [
    Ci.nsIURI,
    Ci.nsIURL,
    Ci.nsIMsgMailNewsUrl,
    Ci.nsIMsgMessageUrl,
    Ci.msgIOverride,
    Ci.nsISupports,
    Ci.nsIInterfaceRequestor,
  ],
  // Don't pass Ci.nsISupports to generateQI().
  baseInterfacesQI: [
    Ci.nsIURI,
    Ci.nsIURL,
    Ci.nsIMsgMailNewsUrl,
    Ci.nsIMsgMessageUrl,
    Ci.msgIOverride,
    Ci.nsIInterfaceRequestor,
  ],

  // We don't typically define this as a creatable component, but if we do use
  // these. Subclasses for particular account types require these defined for
  // that type.
  contractID: "@mozilla.org/jsaccount/jaurl;1",
  classID: Components.ID("{1E7B42CA-E6D9-408F-A4E4-8D2F82AECBBD}"),
};

// Typical boilerplate to include in all implementations.
export function JaBaseUrl(aDelegator, aBaseInterfaces) {
  // Object delegating method calls to the appropriate XPCOM object.
  // Weak because it owns us.
  this._delegatorWeak = Cu.getWeakReference(aDelegator);

  // Base implementation of methods with no overrides.
  this.cppBase = aDelegator.cppBase;

  // cppBase class sees all interfaces
  aBaseInterfaces.forEach(iface => this.cppBase instanceof iface);
}

// Typical boilerplate to include in all implementations.
JaBaseUrl.prototype = {
  __proto__: JSAccountUtils.makeCppDelegator(JaBaseUrlProperties),

  // Flag this item as CPP needs to delegate to JS.
  _JsPrototypeToDelegate: true,

  // QI to the interfaces.
  QueryInterface: ChromeUtils.generateQI(JaBaseUrlProperties.baseInterfacesQI),

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
