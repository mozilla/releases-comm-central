/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

function imProtocolInfo() { }

imProtocolInfo.prototype = {

  defaultLocalPath: null,
  get serverIID() { return null; },
  get requiresUsername() { return true; },
  get preflightPrettyNameWithEmailAddress() { return false; },
  get canDelete() { return true; },
  // Even though IM accounts can login at startup, canLoginAtStartUp
  // should be false as it's used to decide if new messages should be
  // fetched at startup and that concept of message doesn't apply to
  // IM accounts.
  get canLoginAtStartUp() { return false; },
  get canDuplicate() { return false; },
  getDefaultServerPort: () =>  0,
  get canGetMessages() { return false; },
  get canGetIncomingMessages() { return false; },
  get defaultDoBiff() { return false; },
  get showComposeMsgLink() { return false; },
  get foldersCreatedAsync() { return false; },

  classDescription: "IM Msg Protocol Info implementation",
  classID: Components.ID("{13118758-dad2-418c-a03d-1acbfed0cd01}"),
  contractID: "@mozilla.org/messenger/protocol/info;1?type=im",
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIMsgProtocolInfo])
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([imProtocolInfo]);
