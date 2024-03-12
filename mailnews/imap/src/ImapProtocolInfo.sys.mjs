/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MsgProtocolInfo } from "resource:///modules/MsgProtocolInfo.sys.mjs";

/**
 * @implements {nsIMsgProtocolInfo}
 */
export class ImapProtocolInfo extends MsgProtocolInfo {
  QueryInterface = ChromeUtils.generateQI(["nsIMsgProtocolInfo"]);

  serverIID = Components.ID("{b02a4e1c-0d9e-498c-8b9d-18917ba9f65b}");

  requiresUsername = true;
  preflightPrettyNameWithEmailAddress = true;
  canDelete = true;
  canLoginAtStartUp = true;
  canDuplicate = true;
  canGetMessages = true;
  canGetIncomingMessages = true;
  defaultDoBiff = true;
  showComposeMsgLink = true;
  foldersCreatedAsync = true;

  getDefaultServerPort(isSecure) {
    return isSecure
      ? Ci.nsIImapUrl.DEFAULT_IMAPS_PORT
      : Ci.nsIImapUrl.DEFAULT_IMAP_PORT;
  }

  // @see MsgProtocolInfo.sys.mjs
  RELATIVE_PREF = "mail.root.imap-rel";
  ABSOLUTE_PREF = "mail.root.imap";
  DIR_SERVICE_PROP = "IMapMD";
}

ImapProtocolInfo.prototype.classID = Components.ID(
  "{1d9473bc-423a-4632-ad5d-802154e80f6f}"
);
