/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

// This file is the component definition for a demo base implementation of a
// javascript nsIMsgProtocolInfo implementation.

var {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

function testJaMsgProtocolInfo() {
  dump("testJaMsgProtocolInfo");
  // nsIFile object to be used for the default local path.
  this._defaultLocalPath = null;
}

testJaMsgProtocolInfo.prototype = {
  // Flag this item as CPP needs to delegate to JS.
  _JsPrototypeToDelegate: true,

  get defaultLocalPath() {
    if (this._defaultLocalPath)
      return this._defaultLocalPath;
    // Setup a default location, "TestFoo" directory in profile.
    const NS_APP_USER_PROFILE_50_DIR = "ProfD";
    let typedir = Services.dirsvc.get(NS_APP_USER_PROFILE_50_DIR, Ci.nsIFile);
    typedir.append("TestFoo");
    if (!typedir.exists())
      typedir.create(Ci.nsIFile.DIRECTORY_TYPE, parseInt("0600", 8));
    this._defaultLocalPath = typedir;
    return typedir;
  },
  set defaultLocalPath(defaultLocalPath) {
    this._defaultLocalPath = defaultLocalPath;
  },
  // serverIID is used in AccountWizard.js, if missing will just report an error.
  get serverIID() { return null; },
  get requiresUsername() { return false; },
  get preflightPrettyNameWithEmailAddress() { return false; },
  get canDelete() { return true; },
  get canLoginAtStartUp() { return false; },
  get canDuplicate() { return false; },
  getDefaultServerPort: (isSecure) =>  0,
  get canGetMessages() { return false; },
  get canGetIncomingMessages() { return false; },
  get defaultDoBiff() { return false; },
  get showComposeMsgLink() { return false; },
  get foldersCreatedAsync() { return false; },

  classDescription: "testja Msg Protocol Info implementation",
  classID: Components.ID("{74b9b9c3-9594-41c4-b9f0-326e5daac2e0}"),
  contractID: "@mozilla.org/messenger/protocol/info;1?type=testja",
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIMsgProtocolInfo])
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([testJaMsgProtocolInfo]);
