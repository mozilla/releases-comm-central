/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

// This file is the component definition for a demo base implementation of a
// javascript nsIMsgProtocolInfo implementation.

export function TestJaMsgProtocolInfo() {
  dump("testJaMsgProtocolInfo");
  // nsIFile object to be used for the default local path.
  this._defaultLocalPath = null;
}

TestJaMsgProtocolInfo.prototype = {
  // Flag this item as CPP needs to delegate to JS.
  _JsPrototypeToDelegate: true,

  get defaultLocalPath() {
    if (this._defaultLocalPath) {
      return this._defaultLocalPath;
    }
    // Setup a default location, "TestFoo" directory in profile.
    const NS_APP_USER_PROFILE_50_DIR = "ProfD";
    const typedir = Services.dirsvc.get(NS_APP_USER_PROFILE_50_DIR, Ci.nsIFile);
    typedir.append("TestFoo");
    if (!typedir.exists()) {
      typedir.create(Ci.nsIFile.DIRECTORY_TYPE, parseInt("0700", 8));
    }
    this._defaultLocalPath = typedir;
    return typedir;
  },
  set defaultLocalPath(defaultLocalPath) {
    this._defaultLocalPath = defaultLocalPath;
  },
  // serverIID is used in AccountWizard.js, if missing will just report an error.
  get serverIID() {
    return null;
  },
  get requiresUsername() {
    return false;
  },
  get preflightPrettyNameWithEmailAddress() {
    return false;
  },
  get canDelete() {
    return true;
  },
  get canLoginAtStartUp() {
    return false;
  },
  get canDuplicate() {
    return false;
  },
  getDefaultServerPort: isSecure => 0,
  get canGetMessages() {
    return false;
  },
  get canGetIncomingMessages() {
    return false;
  },
  get defaultDoBiff() {
    return false;
  },
  get showComposeMsgLink() {
    return false;
  },
  get foldersCreatedAsync() {
    return false;
  },

  QueryInterface: ChromeUtils.generateQI(["nsIMsgProtocolInfo"]),
};
