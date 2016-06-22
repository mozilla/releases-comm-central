/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

// This file is the component definition for a demo base implementation of a
// javascript IncomingServer.

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/jsaccount/JSAccountUtils.jsm");
Components.utils.import("resource://testing-common/mailnews/testJaBaseIncomingServer.jsm");
dump("\n\ntestJaBaseIncomingServerComponent.js\n\n");

// Constructor
function JaBaseIncomingServerConstructor() {
  dump("JaBaseIncomingServerConstructor\n");
}

// Constructor prototype (not instance prototype).
JaBaseIncomingServerConstructor.prototype = {
  classID: JaBaseIncomingServerProperties.classID,
  _xpcom_factory: JSAccountUtils.jaFactory(JaBaseIncomingServerProperties, JaBaseIncomingServer),
}

var NSGetFactory = XPCOMUtils.generateNSGetFactory([JaBaseIncomingServerConstructor]);
