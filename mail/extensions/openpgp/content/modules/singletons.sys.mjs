/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export var EnigmailSingletons = {
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
  urisWithNestedSignedParts: [],

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

  /**
   * Remember the given uri in our list of recently seen uris that
   * contain a nested signed part.
   *
   * @param {string} uri - The URI spec to remember.
   */
  addUriWithNestedSignedPart(uri) {
    if (
      this.urisWithNestedSignedParts.length >
      this.maxRecentSubEncryptionUrisToRemember
    ) {
      this.urisWithNestedSignedParts.shift(); // remove oldest
    }
    this.urisWithNestedSignedParts.push(uri);
  },

  /**
   * Check if the given uri was recently remembered as an uri with a
   * nested signed part.
   *
   * @param {string} uri - The URI spec to remember.
   */
  isRecentUriWithNestedSignedPart(uri) {
    return this.urisWithNestedSignedParts.includes(uri);
  },
};

EnigmailSingletons.clearLastDecryptedMessage();
