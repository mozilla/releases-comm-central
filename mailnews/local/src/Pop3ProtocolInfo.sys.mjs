/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MsgProtocolInfo } from "resource:///modules/MsgProtocolInfo.sys.mjs";

/**
 * @implements {nsIMsgProtocolInfo}
 */
export class Pop3ProtocolInfo extends MsgProtocolInfo {
  QueryInterface = ChromeUtils.generateQI(["nsIMsgProtocolInfo"]);

  serverIID = Components.ID("{f99fdbf7-2e79-4ce3-9d94-7af3763b82fc}");

  requiresUsername = true;
  preflightPrettyNameWithEmailAddress = true;
  canDelete = true;
  canLoginAtStartUp = true;
  canDuplicate = true;
  canGetMessages = true;
  canGetIncomingMessages = true;
  defaultDoBiff = true;
  showComposeMsgLink = true;
  foldersCreatedAsync = false;

  getDefaultServerPort(isSecure) {
    return isSecure
      ? Ci.nsIPop3URL.DEFAULT_POP3S_PORT
      : Ci.nsIPop3URL.DEFAULT_POP3_PORT;
  }

  // @see MsgProtocolInfo.sys.mjs
  RELATIVE_PREF = "mail.root.pop3-rel";
  ABSOLUTE_PREF = "mail.root.pop3";
  DIR_SERVICE_PROP = "MailD";
}

Pop3ProtocolInfo.prototype.classID = Components.ID(
  "{7689942f-cbd1-42ad-87b9-44128354f55d}"
);
