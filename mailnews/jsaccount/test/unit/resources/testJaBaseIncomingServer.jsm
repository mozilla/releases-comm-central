/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/**
  This file creates a JS-based override of the JaIncomingServer implementation. It
  demos a minimal JS class, and is also used in testing the additional methods
  added to JaIncomingServer.cpp that are not in nsMsgDBFolder.cpp
 */

const EXPORTED_SYMBOLS = ["JaBaseIncomingServerProperties", "JaBaseIncomingServer"];

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;
var Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/jsaccount/JSAccountUtils.jsm");

// A partial JavaScript implementation of the base server methods.

const JaBaseIncomingServerProperties = {
  baseContractID:     "@mozilla.org/jacppincomingserverdelegator;1",
  baseInterfaces:     [ Ci.nsISupports,
                        Ci.nsIMsgIncomingServer,
                        Ci.nsIInterfaceRequestor,
                        Ci.msgIOverride,
                        Ci.nsISupportsWeakReference,
                      ],
  delegateInterfaces: [ Ci.nsIMsgIncomingServer ],
  contractID:         "@mozilla.org/messenger/server;1?type=testja",
  classID:            Components.ID("{0eec03cd-da67-4949-ab2d-5fa4bdc68135}"),
};

function JaBaseIncomingServer(aDelegator, aBaseInterfaces) {
  dump("JaBaseIncomingServer\n");
  // Typical boilerplate to include in all implementations.

  // Object delegating method calls to the appropriate XPCOM object.
  // Weak because it owns us.
  this.delegator = Cu.getWeakReference(aDelegator);

  // Base implementation of methods with no overrides.
  this.cppBase = aDelegator.cppBase;

  // cppBase class sees all interfaces
  aBaseInterfaces.forEach(iface => this.cppBase instanceof iface);
}

JaBaseIncomingServer.prototype = {
  // Typical boilerplate to include in all implementations.

  // Flag this item as CPP needs to delegate to JS.
  _JsPrototypeToDelegate: true,

  // QI to the (partially implemented only) interfaces.
  QueryInterface: XPCOMUtils.generateQI(JaBaseIncomingServerProperties.delegateInterfaces),

  // Used to access an instance as JS, bypassing XPCOM.
  get wrappedJSObject() {
    return this;
  },

  // Dynamically-generated list of delegate methods.
  delegateList: null,

  // nsIMsgIncomingServer overrides.
  get localStoreType() { return "testja"},
  get localDatabaseType() { return "mailbox"},

};
