/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

// This file is the component definition for a demo base implementation of a
// javascript msgFolder.

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/jsaccount/JSAccountUtils.jsm");
Components.utils.import("resource://testing-common/mailnews/testJaBaseMsgFolder.jsm");

// Constructor
function JaBaseMsgFolderConstructor() {
}

// Constructor prototype (not instance prototype).
JaBaseMsgFolderConstructor.prototype = {
  classID: JaBaseMsgFolderProperties.classID,
  _xpcom_factory: JSAccountUtils.jaFactory(JaBaseMsgFolderProperties, JaBaseMsgFolder),
}

var NSGetFactory = XPCOMUtils.generateNSGetFactory([JaBaseMsgFolderConstructor]);
