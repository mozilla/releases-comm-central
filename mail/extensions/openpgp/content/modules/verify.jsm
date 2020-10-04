/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailVerifyAttachment"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  EnigmailCryptoAPI: "chrome://openpgp/content/modules/cryptoAPI.jsm",
  EnigmailFiles: "chrome://openpgp/content/modules/files.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
});

var EnigmailVerifyAttachment = {
  attachment(verifyFile, sigFile) {
    EnigmailLog.DEBUG("verify.jsm: EnigmailVerifyAttachment.attachment:\n");

    const verifyFilePath = EnigmailFiles.getEscapedFilename(
      EnigmailFiles.getFilePathReadonly(verifyFile.QueryInterface(Ci.nsIFile))
    );
    const sigFilePath = EnigmailFiles.getEscapedFilename(
      EnigmailFiles.getFilePathReadonly(sigFile.QueryInterface(Ci.nsIFile))
    );
    const cApi = EnigmailCryptoAPI();
    return cApi.verifyAttachment(verifyFilePath, sigFilePath);
  },
};
