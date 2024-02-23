/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MsgProtocolInfo } from "resource:///modules/MsgProtocolInfo.sys.mjs";

/**
 * @implements {nsIMsgProtocolInfo}
 */
export class NntpProtocolInfo extends MsgProtocolInfo {
  QueryInterface = ChromeUtils.generateQI(["nsIMsgProtocolInfo"]);

  serverIID = Components.ID("{dc4ad42f-bc98-4193-a469-0cfa95ed9bcb}");

  requiresUsername = false;
  preflightPrettyNameWithEmailAddress = false;
  canDelete = true;
  canLoginAtStartUp = true;
  canDuplicate = true;
  canGetMessages = true;
  canGetIncomingMessages = false;
  defaultDoBiff = false;
  showComposeMsgLink = false;
  foldersCreatedAsync = false;

  getDefaultServerPort(isSecure) {
    return isSecure
      ? Ci.nsINntpUrl.DEFAULT_NNTPS_PORT
      : Ci.nsINntpUrl.DEFAULT_NNTP_PORT;
  }

  // @see MsgProtocolInfo.sys.mjs
  RELATIVE_PREF = "mail.root.nntp-rel";
  ABSOLUTE_PREF = "mail.root.nntp";
  DIR_SERVICE_PROP = "NewsD";
}

NntpProtocolInfo.prototype.classID = Components.ID(
  "{7d71db22-0624-4c9f-8d70-dea6ab3ff076}"
);
