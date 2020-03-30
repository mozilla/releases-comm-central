/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailSingletons"];

var EnigmailSingletons = {
  // handle to most recent message reader window
  messageReader: null,

  // information about the last PGP/MIME decrypted message (mimeDecrypt)
  lastDecryptedMessage: {},
  lastMessageDecryptTime: 0,

  clearLastDecryptedMessage() {
    let lm = this.lastDecryptedMessage;
    lm.lastMessageData = "";
    lm.lastMessageURI = null;
    lm.lastStatus = {};
  },
};

EnigmailSingletons.clearLastDecryptedMessage();
