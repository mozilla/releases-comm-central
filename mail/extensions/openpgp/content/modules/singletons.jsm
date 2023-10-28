/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailSingletons"];

var EnigmailSingletons = {
  // information about the last PGP/MIME decrypted message (mimeDecrypt)
  lastDecryptedMessage: {},
  lastMessageDecryptTime: 0,

  clearLastDecryptedMessage() {
    const lm = this.lastDecryptedMessage;
    lm.lastMessageData = "";
    lm.lastMessageURI = null;
    lm.mimePartNumber = "";
    lm.lastStatus = {};
    lm.gossip = [];
  },

  isLastDecryptedMessagePart(folder, msgNum, mimePartNumber) {
    const reval =
      this.lastDecryptedMessage.lastMessageURI &&
      this.lastDecryptedMessage.lastMessageURI.folder == folder &&
      this.lastDecryptedMessage.lastMessageURI.msgNum == msgNum &&
      this.lastDecryptedMessage.mimePartNumber == mimePartNumber;
    return reval;
  },

  urisWithNestedEncryptedParts: [],

  maxRecentSubEncryptionUrisToRemember: 10,

  addUriWithNestedEncryptedPart(uri) {
    if (
      this.urisWithNestedEncryptedParts.length >
      this.maxRecentSubEncryptionUrisToRemember
    ) {
      this.urisWithNestedEncryptedParts.shift(); // remove oldest
    }
    this.urisWithNestedEncryptedParts.push(uri);
  },

  isRecentUriWithNestedEncryptedPart(uri) {
    return this.urisWithNestedEncryptedParts.includes(uri);
  },
};

EnigmailSingletons.clearLastDecryptedMessage();
