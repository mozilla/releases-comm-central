/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";
import {
  MimeTreeDecrypter,
  getMimeTreeFromUrl,
  mimeTreeToString,
} from "chrome://openpgp/content/modules/MimeTree.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  EnigmailConstants: "chrome://openpgp/content/modules/constants.sys.mjs",
  EnigmailEncryption: "chrome://openpgp/content/modules/encryption.sys.mjs",
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.sys.mjs",
  EnigmailLog: "chrome://openpgp/content/modules/log.sys.mjs",
  EnigmailMime: "chrome://openpgp/content/modules/mime.sys.mjs",
  MailUtils: "resource:///modules/MailUtils.sys.mjs",
});

XPCOMUtils.defineLazyModuleGetters(lazy, {
  MimeParser: "resource:///modules/mimeParser.jsm",
  MailServices: "resource:///modules/MailServices.jsm",
});

export var EnigmailPersistentCrypto = {
  /***
   * cryptMessage
   *
   * Decrypts a message and copy it to a folder. If targetKey is
   * not null, it encrypts a message to the target key afterwards.
   *
   * @param {nsIMsgDBHdr} hdr - message to process
   * @param {string} destFolder - target folder URI
   * @param {boolean} move - true for move, false for copy
   * @param {KeyObject} targetKey - target key if encryption is requested
   *
   * @returns {nsMsgKey} Message key of the new message
   **/
  async cryptMessage(hdr, destFolder, move, targetKey) {
    return new Promise(function (resolve, reject) {
      const msgUriSpec = hdr.folder.getUriForMsg(hdr);
      const msgUrl = lazy.EnigmailFuncs.getUrlFromUriSpec(msgUriSpec);

      const crypt = new CryptMessageIntoFolder(destFolder, move, targetKey);

      getMimeTreeFromUrl(msgUrl, true, async function (mime) {
        try {
          const newMsgKey = await crypt.messageParseCallback(mime, hdr);
          resolve(newMsgKey);
        } catch (ex) {
          reject(ex);
        }
      });
    });
  },

  changeMessageId(content, newMessageIdPrefix) {
    let [headerData, body] = lazy.MimeParser.extractHeadersAndBody(content);
    content = "";

    let newHeaders = headerData.rawHeaderText;
    if (!newHeaders.endsWith("\r\n")) {
      newHeaders += "\r\n";
    }

    headerData = undefined;

    const regExpMsgId = new RegExp("^message-id: <(.*)>", "mi");
    let msgId;
    const match = newHeaders.match(regExpMsgId);

    if (match) {
      msgId = match[1];
      newHeaders = newHeaders.replace(
        regExpMsgId,
        "Message-Id: <" + newMessageIdPrefix + "-$1>"
      );

      // Match the references header across multiple lines
      const regExpReferences = new RegExp(
        // eslint-disable-next-line no-control-regex
        "^references: .*([\r\n]*^ .*$)*",
        "mi"
      );
      const refLines = newHeaders.match(regExpReferences);
      if (refLines) {
        // Take the full match of the existing header
        const newRef = refLines[0] + " <" + msgId + ">";
        newHeaders = newHeaders.replace(regExpReferences, newRef);
      } else {
        newHeaders += "References: <" + msgId + ">\r\n";
      }
    }

    return newHeaders + "\r\n" + body;
  },

  /*
   * Copies an email message to a folder, which is a modified copy of an
   * existing message, optionally creating a new message ID.
   *
   * @param {nsIMsgDBHdr} originalMsgHdr - Header of the original message
   * @param {string} targetFolderUri - Target folder URI
   * @param {boolean} deleteOrigMsg - Should the original message be deleted?
   * @param {string} content - New message content
   * @param {string} newMessageIdPrefix - If this is non-null, create a new message ID
   *                                       by adding this prefix.
   *
   * @returns {nsMsgKey} Message key of the new message
   */
  async copyMessageToFolder(
    originalMsgHdr,
    targetFolderUri,
    deleteOrigMsg,
    content,
    newMessageIdPrefix
  ) {
    lazy.EnigmailLog.DEBUG("persistentCrypto.jsm: copyMessageToFolder()\n");
    return new Promise((resolve, reject) => {
      if (newMessageIdPrefix) {
        content = this.changeMessageId(content, newMessageIdPrefix);
      }

      // Create the temporary file where the new message will be stored.
      const tempFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
      tempFile.append("message.eml");
      tempFile.createUnique(0, 0o600);

      const outputStream = Cc[
        "@mozilla.org/network/file-output-stream;1"
      ].createInstance(Ci.nsIFileOutputStream);
      outputStream.init(tempFile, 2, 0x200, false); // open as "write only"
      outputStream.write(content, content.length);
      outputStream.close();

      // Delete file on exit, because Windows locks the file
      const extAppLauncher = Cc[
        "@mozilla.org/uriloader/external-helper-app-service;1"
      ].getService(Ci.nsPIExternalAppLauncher);
      extAppLauncher.deleteTemporaryFileOnExit(tempFile);

      const msgFolder = originalMsgHdr.folder;

      // The following technique was copied from AttachmentDeleter in Thunderbird's
      // nsMessenger.cpp. There is a "unified" listener which serves as copy and delete
      // listener. In all cases, the `OnStopCopy()` of the delete listener selects the
      // replacement message.
      // The deletion happens in `OnStopCopy()` of the copy listener for local messages
      // and in `OnStopRunningUrl()` for IMAP messages if the folder is displayed since
      // otherwise `OnStopRunningUrl()` doesn't run.

      let newKey;
      let statusCode = 0;
      const destFolder = targetFolderUri
        ? lazy.MailUtils.getExistingFolder(targetFolderUri)
        : msgFolder;

      const copyListener = {
        QueryInterface: ChromeUtils.generateQI([
          "nsIMsgCopyServiceListener",
          "nsIUrlListener",
        ]),
        GetMessageId(messageId) {
          // Maybe enable this later. Most of the Thunderbird code does not supply this.
          // messageId = { value: msgHdr.messageId };
        },
        SetMessageKey(key) {
          lazy.EnigmailLog.DEBUG(
            `persistentCrypto.jsm: copyMessageToFolder: Result of CopyFileMessage() is new message with key ${key}\n`
          );
          newKey = key;
        },
        applyFlags() {
          const newHdr = destFolder.GetMessageHeader(newKey);
          newHdr.markRead(originalMsgHdr.isRead);
          newHdr.markFlagged(originalMsgHdr.isFlagged);
          newHdr.subject = originalMsgHdr.subject;
        },
        OnStartCopy() {},
        OnStopCopy(status) {
          statusCode = status;
          if (statusCode !== 0) {
            lazy.EnigmailLog.ERROR(
              `persistentCrypto.jsm: ${statusCode} replacing message, folder="${msgFolder.name}", key=${originalMsgHdr.messageKey}/${newKey}\n`
            );
            reject();
            return;
          }

          try {
            tempFile.remove();
          } catch (ex) {}

          lazy.EnigmailLog.DEBUG(
            "persistentCrypto.jsm: copyMessageToFolder: Triggering deletion from OnStopCopy()\n"
          );
          this.applyFlags();

          if (deleteOrigMsg) {
            lazy.EnigmailLog.DEBUG(
              `persistentCrypto.jsm: copyMessageToFolder: Deleting old message with key ${originalMsgHdr.messageKey}\n`
            );
            msgFolder.deleteMessages(
              [originalMsgHdr],
              null,
              true,
              false,
              null,
              false
            );
          }
          resolve(newKey);
        },
      };

      lazy.MailServices.copy.copyFileMessage(
        tempFile,
        destFolder,
        null,
        false,
        originalMsgHdr.flags,
        "",
        copyListener,
        null
      );
    });
  },
};

class CryptMessageIntoFolder extends MimeTreeDecrypter {
  constructor(destFolder, move, targetKey) {
    super();
    this.destFolder = destFolder;
    this.move = move;
    this.targetKey = targetKey;
  }

  /** Here is the effective action of a call to cryptMessage.
   * If no failure is seen when attempting to decrypt (!decryptFailure),
   * then we copy. (This includes plain messages that didn't need
   * decryption.)
   * The cryptoChanged flag is set only after we have successfully
   * completed a decryption (or encryption) operation, it's used to
   * decide whether we need a new message ID.
   */
  async messageParseCallback(mimeTree, msgHdr) {
    this.mimeTree = mimeTree;
    this.hdr = msgHdr;

    if (mimeTree.headers.has("subject")) {
      this.subject = mimeTree.headers.get("subject");
    }

    await this.decryptMimeTree(mimeTree);

    let msg = "";

    // Encrypt the message if a target key is given.
    if (this.targetKey) {
      msg = this.encryptToKey(mimeTree);
      if (!msg) {
        throw new Error("Failure to encrypt message");
      }
      this.cryptoChanged = true;
    } else {
      msg = mimeTreeToString(mimeTree, true);
    }

    if (this.decryptFailure) {
      throw new Error("Failure to decrypt message");
    }
    return EnigmailPersistentCrypto.copyMessageToFolder(
      this.hdr,
      this.destFolder,
      this.move,
      msg,
      this.cryptoChanged ? "decrypted-" + new Date().valueOf() : null
    );
  }

  encryptToKey(mimeTree) {
    const exitCodeObj = {};
    const statusFlagsObj = {};
    const errorMsgObj = {};
    lazy.EnigmailLog.DEBUG("persistentCrypto.jsm: Encrypting message.\n");

    const inputMsg = mimeTreeToString(mimeTree, false);

    let encmsg = "";
    try {
      encmsg = lazy.EnigmailEncryption.encryptMessage(
        null,
        0,
        inputMsg,
        "0x" + this.targetKey.fpr,
        "0x" + this.targetKey.fpr,
        "",
        lazy.EnigmailConstants.SEND_ENCRYPTED |
          lazy.EnigmailConstants.SEND_ALWAYS_TRUST,
        exitCodeObj,
        statusFlagsObj,
        errorMsgObj
      );
    } catch (ex) {
      lazy.EnigmailLog.DEBUG(
        "persistentCrypto.jsm: Encryption failed: " + ex + "\n"
      );
      return null;
    }

    // Build the pgp-encrypted mime structure
    let msg = "";

    const rfc822Headers = []; // FIXME

    // First the original headers
    for (const header in rfc822Headers) {
      if (
        header != "content-type" &&
        header != "content-transfer-encoding" &&
        header != "content-disposition"
      ) {
        msg +=
          lazy.EnigmailMime.prettyPrintHeader(header, rfc822Headers[header]) +
          "\n";
      }
    }
    // Then multipart/encrypted ct
    const boundary = lazy.EnigmailMime.createBoundary();
    msg += "Content-Transfer-Encoding: 7Bit\n";
    msg += "Content-Type: multipart/encrypted; ";
    msg +=
      'boundary="' + boundary + '"; protocol="application/pgp-encrypted"\n\n';
    msg += "This is an OpenPGP/MIME encrypted message (RFC 4880 and 3156)\n";

    // pgp-encrypted part
    msg += "--" + boundary + "\n";
    msg += "Content-Type: application/pgp-encrypted\n";
    msg += "Content-Disposition: attachment\n";
    msg += "Content-Transfer-Encoding: 7Bit\n\n";
    msg += "Version: 1\n\n";

    // the octet stream
    msg += "--" + boundary + "\n";
    msg += 'Content-Type: application/octet-stream; name="encrypted.asc"\n';
    msg += "Content-Description: OpenPGP encrypted message\n";
    msg += 'Content-Disposition: inline; filename="encrypted.asc"\n';
    msg += "Content-Transfer-Encoding: 7Bit\n\n";
    msg += encmsg;

    // Bottom boundary
    msg += "\n--" + boundary + "--\n";

    // Fix up the line endings to be a proper dosish mail
    msg = msg.replace(/\r/gi, "").replace(/\n/gi, "\r\n");

    return msg;
  }
}
