/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["IMProtocolInfo"];

function IMProtocolInfo() {}

IMProtocolInfo.prototype = {
  defaultLocalPath: null,
  get serverIID() {
    return null;
  },
  get requiresUsername() {
    return true;
  },
  get preflightPrettyNameWithEmailAddress() {
    return false;
  },
  get canDelete() {
    return true;
  },
  // Even though IM accounts can login at startup, canLoginAtStartUp
  // should be false as it's used to decide if new messages should be
  // fetched at startup and that concept of message doesn't apply to
  // IM accounts.
  get canLoginAtStartUp() {
    return false;
  },
  get canDuplicate() {
    return false;
  },
  getDefaultServerPort: () => 0,
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
