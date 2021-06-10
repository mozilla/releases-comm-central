/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailSend"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  EnigmailFiles: "chrome://openpgp/content/modules/files.jsm",
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  EnigmailStdlib: "chrome://openpgp/content/modules/stdlib.jsm",
  Services: "resource://gre/modules/Services.jsm",
});

var EnigmailSend = {
  /**
   * Send out an email
   *
   * @param msgData    - String: complete MIME string of email (including all headers etc.)
   * @param compFields - Object: compose fields (nsIMsgCompFields)
   * @param listener   - Object: progress listener (nsIMsgSendListener)
   *
   * @return Boolean - true: everything was OK to send the message
   */

  sendMessage(msgData, compFields, listener = null) {
    EnigmailLog.DEBUG("EnigmailSend.sendMessage()\n");
    let tmpFile, msgIdentity;
    try {
      tmpFile = EnigmailFiles.getTempDirObj();
      tmpFile.append("message.eml");
      tmpFile.createUnique(0, 0o600);
    } catch (ex) {
      return false;
    }

    EnigmailFiles.writeFileContents(tmpFile, msgData);
    EnigmailLog.DEBUG(
      "EnigmailSend.sendMessage: wrote file: " + tmpFile.path + "\n"
    );

    try {
      msgIdentity = EnigmailStdlib.getIdentityForEmail(compFields.from);
    } catch (ex) {
      msgIdentity = EnigmailStdlib.getDefaultIdentity();
    }

    if (!msgIdentity) {
      return false;
    }

    EnigmailLog.DEBUG(
      "EnigmailSend.sendMessage: identity key: " +
        msgIdentity.identity.key +
        "\n"
    );

    let acct = EnigmailFuncs.getAccountForIdentity(msgIdentity.identity);
    if (!acct) {
      return false;
    }

    EnigmailLog.DEBUG(
      "EnigmailSend.sendMessage: account key: " + acct.key + "\n"
    );

    let msgSend = Cc["@mozilla.org/messengercompose/send;1"].createInstance(
      Ci.nsIMsgSend
    );
    msgSend.sendMessageFile(
      msgIdentity.identity,
      acct.key,
      compFields,
      tmpFile,
      true, // Delete  File On Completion
      false,
      Services.io.offline
        ? Ci.nsIMsgSend.nsMsgQueueForLater
        : Ci.nsIMsgSend.nsMsgDeliverNow,
      null,
      listener,
      null,
      ""
    ); // password

    return true;
  },
};
