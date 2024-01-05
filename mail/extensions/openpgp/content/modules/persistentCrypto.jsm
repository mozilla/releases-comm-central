/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var EXPORTED_SYMBOLS = ["EnigmailPersistentCrypto"];

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
const { MimeParser } = ChromeUtils.import("resource:///modules/mimeParser.jsm");

const lazy = {};

XPCOMUtils.defineLazyModuleGetters(lazy, {
  EnigmailArmor: "chrome://openpgp/content/modules/armor.jsm",
  EnigmailConstants: "chrome://openpgp/content/modules/constants.jsm",
  EnigmailData: "chrome://openpgp/content/modules/data.jsm",
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.jsm",
  EnigmailEncryption: "chrome://openpgp/content/modules/encryption.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  EnigmailMime: "chrome://openpgp/content/modules/mime.jsm",
  EnigmailFixExchangeMsg:
    "chrome://openpgp/content/modules/fixExchangeMessage.jsm",
  EnigmailDecryption: "chrome://openpgp/content/modules/decryption.jsm",
  GlodaUtils: "resource:///modules/gloda/GlodaUtils.jsm",
  jsmime: "resource:///modules/jsmime.jsm",
  MailUtils: "resource:///modules/MailUtils.jsm",
  MailCryptoUtils: "resource:///modules/MailCryptoUtils.jsm",
});

ChromeUtils.defineLazyGetter(lazy, "l10n", () => {
  return new Localization(["messenger/openpgp/openpgp.ftl"], true);
});

var EnigmailPersistentCrypto = {
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

      lazy.EnigmailMime.getMimeTreeFromUrl(msgUrl, true, async function (mime) {
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
    let [headerData, body] = MimeParser.extractHeadersAndBody(content);
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

      MailServices.copy.copyFileMessage(
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

function CryptMessageIntoFolder(destFolder, move, targetKey) {
  this.destFolder = destFolder;
  this.move = move;
  this.targetKey = targetKey;
  this.cryptoChanged = false;
  this.decryptFailure = false;

  this.mimeTree = null;
  this.decryptionTasks = [];
  this.subject = "";
}

CryptMessageIntoFolder.prototype = {
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
      msg = this.mimeToString(mimeTree, true);
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
  },

  encryptToKey(mimeTree) {
    const exitCodeObj = {};
    const statusFlagsObj = {};
    const errorMsgObj = {};
    lazy.EnigmailLog.DEBUG("persistentCrypto.jsm: Encrypting message.\n");

    const inputMsg = this.mimeToString(mimeTree, false);

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
        msg += prettyPrintHeader(header, rfc822Headers[header]) + "\n";
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
  },

  /**
   *  Walk through the MIME message structure and decrypt the body if there is something to decrypt
   */
  async decryptMimeTree(mimePart) {
    lazy.EnigmailLog.DEBUG("persistentCrypto.jsm: decryptMimeTree:\n");

    if (this.isBrokenByExchange(mimePart)) {
      this.fixExchangeMessage(mimePart);
    }

    if (this.isSMIME(mimePart)) {
      this.decryptSMIME(mimePart);
    } else if (this.isPgpMime(mimePart)) {
      this.decryptPGPMIME(mimePart);
    } else if (isAttachment(mimePart)) {
      this.pgpDecryptAttachment(mimePart);
    } else {
      this.decryptINLINE(mimePart);
    }

    for (const i in mimePart.subParts) {
      await this.decryptMimeTree(mimePart.subParts[i]);
    }
  },

  /***
   *
   * Detect if mime part is PGP/MIME message that got modified by MS-Exchange:
   *
   * - multipart/mixed Container with
   *   - application/pgp-encrypted Attachment with name "PGPMIME Version Identification"
   *   - application/octet-stream Attachment with name "encrypted.asc" having the encrypted content in base64
   * - see:
   *   - https://doesnotexist-openpgp-integration.thunderbird/forum/viewtopic.php?f=4&t=425
   *   - https://sourceforge.net/p/enigmail/forum/support/thread/4add2b69/
   */

  isBrokenByExchange(mime) {
    lazy.EnigmailLog.DEBUG("persistentCrypto.jsm: isBrokenByExchange:\n");

    try {
      if (
        mime.subParts &&
        mime.subParts.length === 3 &&
        mime.fullContentType.toLowerCase().includes("multipart/mixed") &&
        mime.subParts[0].subParts.length === 0 &&
        mime.subParts[0].fullContentType.search(/multipart\/encrypted/i) < 0 &&
        mime.subParts[0].fullContentType.toLowerCase().includes("text/plain") &&
        mime.subParts[1].fullContentType
          .toLowerCase()
          .includes("application/pgp-encrypted") &&
        mime.subParts[1].fullContentType
          .toLowerCase()
          .search(/multipart\/encrypted/i) < 0 &&
        mime.subParts[1].fullContentType
          .toLowerCase()
          .search(/PGPMIME Versions? Identification/i) >= 0 &&
        mime.subParts[2].fullContentType
          .toLowerCase()
          .includes("application/octet-stream") &&
        mime.subParts[2].fullContentType.toLowerCase().includes("encrypted.asc")
      ) {
        lazy.EnigmailLog.DEBUG(
          "persistentCrypto.jsm: isBrokenByExchange: found message broken by MS-Exchange\n"
        );
        return true;
      }
    } catch (ex) {}

    return false;
  },

  decryptSMIME(mimePart) {
    const encrypted = lazy.MailCryptoUtils.binaryStringToTypedArray(
      mimePart.body
    );

    const cmsDecoderJS = Cc["@mozilla.org/nsCMSDecoderJS;1"].createInstance(
      Ci.nsICMSDecoderJS
    );
    const decrypted = cmsDecoderJS.decrypt(encrypted);

    if (decrypted.length === 0) {
      // fail if no data found
      this.decryptFailure = true;
      return;
    }

    let data = "";
    for (const c of decrypted) {
      data += String.fromCharCode(c);
    }

    if (lazy.EnigmailLog.getLogLevel() > 5) {
      lazy.EnigmailLog.DEBUG(
        "*** start data ***\n'" + data + "'\n***end data***\n"
      );
    }

    // Search for the separator between headers and message body.
    let bodyIndex = data.search(/\n\s*\r?\n/);
    if (bodyIndex < 0) {
      // not found, body starts at beginning.
      bodyIndex = 0;
    } else {
      // found, body starts after the headers.
      const wsSize = data.match(/\n\s*\r?\n/);
      bodyIndex += wsSize[0].length;
    }

    if (data.substr(bodyIndex).search(/\r?\n$/) === 0) {
      return;
    }

    const m = Cc["@mozilla.org/messenger/mimeheaders;1"].createInstance(
      Ci.nsIMimeHeaders
    );
    // headers are found from the beginning up to the start of the body
    m.initialize(data.substr(0, bodyIndex));

    mimePart.headers._rawHeaders.set("content-type", [
      m.extractHeader("content-type", false) || "",
    ]);

    mimePart.headers._rawHeaders.delete("content-transfer-encoding");
    mimePart.headers._rawHeaders.delete("content-disposition");
    mimePart.headers._rawHeaders.delete("content-description");

    mimePart.subParts = [];
    mimePart.body = data.substr(bodyIndex);

    this.cryptoChanged = true;
  },

  isSMIME(mimePart) {
    if (!mimePart.headers.has("content-type")) {
      return false;
    }

    return (
      mimePart.headers.get("content-type").type.toLowerCase() ===
        "application/pkcs7-mime" &&
      mimePart.headers.get("content-type").get("smime-type").toLowerCase() ===
        "enveloped-data" &&
      mimePart.subParts.length === 0
    );
  },

  isPgpMime(mimePart) {
    lazy.EnigmailLog.DEBUG("persistentCrypto.jsm: isPgpMime()\n");

    try {
      if (mimePart.headers.has("content-type")) {
        if (
          mimePart.headers.get("content-type").type.toLowerCase() ===
            "multipart/encrypted" &&
          mimePart.headers.get("content-type").get("protocol").toLowerCase() ===
            "application/pgp-encrypted" &&
          mimePart.subParts.length === 2
        ) {
          return true;
        }
      }
    } catch (x) {}
    return false;
  },

  async decryptPGPMIME(mimePart) {
    lazy.EnigmailLog.DEBUG(
      "persistentCrypto.jsm: decryptPGPMIME(" + mimePart.partNum + ")\n"
    );

    if (!mimePart.subParts[1]) {
      throw new Error("Not a correct PGP/MIME message");
    }

    const uiFlags =
      lazy.EnigmailConstants.UI_INTERACTIVE |
      lazy.EnigmailConstants.UI_UNVERIFIED_ENC_OK |
      lazy.EnigmailConstants.UI_IGNORE_MDC_ERROR;
    const exitCodeObj = {};
    const statusFlagsObj = {};
    const userIdObj = {};
    const sigDetailsObj = {};
    const errorMsgObj = {};
    const keyIdObj = {};
    const blockSeparationObj = {
      value: "",
    };
    const encToDetailsObj = {};
    var signatureObj = {};
    signatureObj.value = "";

    const data = lazy.EnigmailDecryption.decryptMessage(
      null,
      uiFlags,
      mimePart.subParts[1].body,
      null, // date
      signatureObj,
      exitCodeObj,
      statusFlagsObj,
      keyIdObj,
      userIdObj,
      sigDetailsObj,
      errorMsgObj,
      blockSeparationObj,
      encToDetailsObj
    );

    if (!data || data.length === 0) {
      if (statusFlagsObj.value & lazy.EnigmailConstants.DISPLAY_MESSAGE) {
        Services.prompt.alert(null, null, errorMsgObj.value);
        throw new Error("Decryption impossible");
      }
    }

    lazy.EnigmailLog.DEBUG(
      "persistentCrypto.jsm: analyzeDecryptedData: got " +
        data.length +
        " bytes\n"
    );

    if (lazy.EnigmailLog.getLogLevel() > 5) {
      lazy.EnigmailLog.DEBUG(
        "*** start data ***\n'" + data + "'\n***end data***\n"
      );
    }

    if (data.length === 0) {
      // fail if no data found
      this.decryptFailure = true;
      return;
    }

    let bodyIndex = data.search(/\n\s*\r?\n/);
    if (bodyIndex < 0) {
      bodyIndex = 0;
    } else {
      const wsSize = data.match(/\n\s*\r?\n/);
      bodyIndex += wsSize[0].length;
    }

    if (data.substr(bodyIndex).search(/\r?\n$/) === 0) {
      return;
    }

    const m = Cc["@mozilla.org/messenger/mimeheaders;1"].createInstance(
      Ci.nsIMimeHeaders
    );
    m.initialize(data.substr(0, bodyIndex));
    let ct = m.extractHeader("content-type", false) || "";
    const part = mimePart.partNum;

    if (part.length > 0 && part.search(/[^01.]/) < 0) {
      if (ct.search(/protected-headers/i) >= 0) {
        if (m.hasHeader("subject")) {
          let subject = m.extractHeader("subject", false) || "";
          subject = subject.replace(/^(Re: )+/, "Re: ");
          this.mimeTree.headers._rawHeaders.set("subject", [subject]);
        }
      } else if (this.mimeTree.headers.get("subject") === "p≡p") {
        let subject = getPepSubject(data);
        if (subject) {
          subject = subject.replace(/^(Re: )+/, "Re: ");
          this.mimeTree.headers._rawHeaders.set("subject", [subject]);
        }
      } else if (
        !(statusFlagsObj.value & lazy.EnigmailConstants.GOOD_SIGNATURE) &&
        /^multipart\/signed/i.test(ct)
      ) {
        // RFC 3156, Section 6.1 message
        const innerMsg = lazy.EnigmailMime.getMimeTree(data, false);
        if (innerMsg.subParts.length > 0) {
          ct = innerMsg.subParts[0].fullContentType;
          const hdrMap = innerMsg.subParts[0].headers._rawHeaders;
          if (ct.search(/protected-headers/i) >= 0 && hdrMap.has("subject")) {
            let subject = innerMsg.subParts[0].headers._rawHeaders
              .get("subject")
              .join("");
            subject = subject.replace(/^(Re: )+/, "Re: ");
            this.mimeTree.headers._rawHeaders.set("subject", [subject]);
          }
        }
      }
    }

    let boundary = getBoundary(mimePart);
    if (!boundary) {
      boundary = lazy.EnigmailMime.createBoundary();
    }

    // append relevant headers
    mimePart.headers.get("content-type").type = "multipart/mixed";
    mimePart.headers._rawHeaders.set("content-type", [
      'multipart/mixed; boundary="' + boundary + '"',
    ]);
    mimePart.subParts = [
      {
        body: data,
        decryptedPgpMime: true,
        partNum: mimePart.partNum + ".1",
        headers: {
          _rawHeaders: new Map(),
          get() {
            return null;
          },
          has() {
            return false;
          },
        },
        subParts: [],
      },
    ];

    this.cryptoChanged = true;
  },

  pgpDecryptAttachment(mimePart) {
    lazy.EnigmailLog.DEBUG("persistentCrypto.jsm: pgpDecryptAttachment()\n");
    const attachmentHead = mimePart.body.substr(0, 30);
    if (attachmentHead.search(/-----BEGIN PGP \w{5,10} KEY BLOCK-----/) >= 0) {
      // attachment appears to be a PGP key file, skip
      return;
    }

    const uiFlags =
      lazy.EnigmailConstants.UI_INTERACTIVE |
      lazy.EnigmailConstants.UI_UNVERIFIED_ENC_OK |
      lazy.EnigmailConstants.UI_IGNORE_MDC_ERROR;
    const exitCodeObj = {};
    const statusFlagsObj = {};
    const userIdObj = {};
    const sigDetailsObj = {};
    const errorMsgObj = {};
    const keyIdObj = {};
    const blockSeparationObj = {
      value: "",
    };
    const encToDetailsObj = {};
    var signatureObj = {};
    signatureObj.value = "";

    let attachmentName = getAttachmentName(mimePart);
    attachmentName = attachmentName
      ? attachmentName.replace(/\.(pgp|asc|gpg)$/, "")
      : "";

    const data = lazy.EnigmailDecryption.decryptMessage(
      null,
      uiFlags,
      mimePart.body,
      null, // date
      signatureObj,
      exitCodeObj,
      statusFlagsObj,
      keyIdObj,
      userIdObj,
      sigDetailsObj,
      errorMsgObj,
      blockSeparationObj,
      encToDetailsObj
    );

    if (data || statusFlagsObj.value & lazy.EnigmailConstants.DECRYPTION_OKAY) {
      lazy.EnigmailLog.DEBUG(
        "persistentCrypto.jsm: pgpDecryptAttachment: decryption OK\n"
      );
    } else if (
      statusFlagsObj.value &
      (lazy.EnigmailConstants.DECRYPTION_FAILED |
        lazy.EnigmailConstants.MISSING_MDC)
    ) {
      lazy.EnigmailLog.DEBUG(
        "persistentCrypto.jsm: pgpDecryptAttachment: decryption without MDC protection\n"
      );
    } else if (
      statusFlagsObj.value & lazy.EnigmailConstants.DECRYPTION_FAILED
    ) {
      lazy.EnigmailLog.DEBUG(
        "persistentCrypto.jsm: pgpDecryptAttachment: decryption failed\n"
      );
      // Enigmail prompts the user here, but we just keep going.
    } else if (
      statusFlagsObj.value & lazy.EnigmailConstants.DECRYPTION_INCOMPLETE
    ) {
      // failure; message not complete
      lazy.EnigmailLog.DEBUG(
        "persistentCrypto.jsm: pgpDecryptAttachment: decryption incomplete\n"
      );
      return;
    } else {
      // there is nothing to be decrypted
      lazy.EnigmailLog.DEBUG(
        "persistentCrypto.jsm: pgpDecryptAttachment: no decryption required\n"
      );
      return;
    }

    lazy.EnigmailLog.DEBUG(
      "persistentCrypto.jsm: pgpDecryptAttachment: decrypted to " +
        data.length +
        " bytes\n"
    );
    if (statusFlagsObj.encryptedFileName) {
      attachmentName = statusFlagsObj.encryptedFileName;
    }

    this.decryptedMessage = true;
    mimePart.body = data;
    mimePart.headers._rawHeaders.set(
      "content-disposition",
      `attachment; filename="${attachmentName}"`
    );
    mimePart.headers._rawHeaders.set("content-transfer-encoding", ["base64"]);
    const origCt = mimePart.headers.get("content-type");
    let ct = origCt.type;

    for (const i of origCt.entries()) {
      if (i[0].toLowerCase() === "name") {
        i[1] = i[1].replace(/\.(pgp|asc|gpg)$/, "");
      }
      ct += `; ${i[0]}="${i[1]}"`;
    }

    mimePart.headers._rawHeaders.set("content-type", [ct]);
  },

  async decryptINLINE(mimePart) {
    lazy.EnigmailLog.DEBUG("persistentCrypto.jsm: decryptINLINE()\n");

    if ("decryptedPgpMime" in mimePart && mimePart.decryptedPgpMime) {
      return 0;
    }

    if ("body" in mimePart && mimePart.body.length > 0) {
      const ct = getContentType(mimePart);

      if (ct === "text/html") {
        mimePart.body = this.stripHTMLFromArmoredBlocks(mimePart.body);
      }

      var exitCodeObj = {};
      var statusFlagsObj = {};
      var userIdObj = {};
      var sigDetailsObj = {};
      var errorMsgObj = {};
      var keyIdObj = {};
      var blockSeparationObj = {
        value: "",
      };
      var encToDetailsObj = {};
      var signatureObj = {};
      signatureObj.value = "";

      const uiFlags =
        lazy.EnigmailConstants.UI_INTERACTIVE |
        lazy.EnigmailConstants.UI_UNVERIFIED_ENC_OK |
        lazy.EnigmailConstants.UI_IGNORE_MDC_ERROR;

      var plaintexts = [];
      var blocks = lazy.EnigmailArmor.locateArmoredBlocks(mimePart.body);
      var tmp = [];

      for (let i = 0; i < blocks.length; i++) {
        if (blocks[i].blocktype == "MESSAGE") {
          tmp.push(blocks[i]);
        }
      }

      blocks = tmp;

      if (blocks.length < 1) {
        return 0;
      }

      let charset = "utf-8";

      for (let i = 0; i < blocks.length; i++) {
        let plaintext = null;
        do {
          const ciphertext = mimePart.body.substring(
            blocks[i].begin,
            blocks[i].end + 1
          );

          if (ciphertext.length === 0) {
            break;
          }

          const hdr = ciphertext.search(/(\r\r|\n\n|\r\n\r\n)/);
          if (hdr > 0) {
            const chset = ciphertext.substr(0, hdr).match(/^(charset:)(.*)$/im);
            if (chset && chset.length == 3) {
              charset = chset[2].trim();
            }
          }
          plaintext = lazy.EnigmailDecryption.decryptMessage(
            null,
            uiFlags,
            ciphertext,
            null, // date
            signatureObj,
            exitCodeObj,
            statusFlagsObj,
            keyIdObj,
            userIdObj,
            sigDetailsObj,
            errorMsgObj,
            blockSeparationObj,
            encToDetailsObj
          );
          if (!plaintext || plaintext.length === 0) {
            if (statusFlagsObj.value & lazy.EnigmailConstants.DISPLAY_MESSAGE) {
              Services.prompt.alert(null, null, errorMsgObj.value);
              this.cryptoChanged = false;
              this.decryptFailure = true;
              return -1;
            }

            if (
              statusFlagsObj.value &
              (lazy.EnigmailConstants.DECRYPTION_FAILED |
                lazy.EnigmailConstants.MISSING_MDC)
            ) {
              lazy.EnigmailLog.DEBUG(
                "persistentCrypto.jsm: decryptINLINE: no MDC protection, decrypting anyway\n"
              );
            }
            if (
              statusFlagsObj.value & lazy.EnigmailConstants.DECRYPTION_FAILED
            ) {
              // since we cannot find out if the user wants to cancel
              // we should ask
              const msg = await lazy.l10n.formatValue(
                "converter-decrypt-body-failed",
                {
                  subject: this.subject,
                }
              );

              if (
                Services.prompt.confirmEx(
                  null,
                  null,
                  msg,
                  Services.prompt.STD_OK_CANCEL_BUTTONS,
                  lazy.l10n.formatValueSync("dlg-button-retry"),
                  lazy.l10n.formatValueSync("dlg-button-skip"),
                  null,
                  null,
                  {}
                )
              ) {
                this.cryptoChanged = false;
                this.decryptFailure = true;
                return -1;
              }
            } else if (
              statusFlagsObj.value &
              lazy.EnigmailConstants.DECRYPTION_INCOMPLETE
            ) {
              this.cryptoChanged = false;
              this.decryptFailure = true;
              return -1;
            } else {
              plaintext = " ";
            }
          }

          if (ct === "text/html") {
            plaintext = plaintext.replace(/\n/gi, "<br/>\n");
          }

          let subject = "";
          if (this.mimeTree.headers.has("subject")) {
            subject = this.mimeTree.headers.get("subject");
          }

          if (
            i == 0 &&
            subject === "pEp" &&
            mimePart.partNum.length > 0 &&
            mimePart.partNum.search(/[^01.]/) < 0
          ) {
            const m = lazy.EnigmailMime.extractSubjectFromBody(plaintext);
            if (m) {
              plaintext = m.messageBody;
              this.mimeTree.headers._rawHeaders.set("subject", [m.subject]);
            }
          }

          if (plaintext) {
            plaintexts.push(plaintext);
          }
        } while (!plaintext || plaintext === "");
      }

      var decryptedMessage =
        mimePart.body.substring(0, blocks[0].begin) + plaintexts[0];
      for (let i = 1; i < blocks.length; i++) {
        decryptedMessage +=
          mimePart.body.substring(blocks[i - 1].end + 1, blocks[i].begin + 1) +
          plaintexts[i];
      }

      decryptedMessage += mimePart.body.substring(
        blocks[blocks.length - 1].end + 1
      );

      // enable base64 encoding if non-ASCII character(s) found
      const j = decryptedMessage.search(/[^\x01-\x7F]/); // eslint-disable-line no-control-regex
      if (j >= 0) {
        mimePart.headers._rawHeaders.set("content-transfer-encoding", [
          "base64",
        ]);
      } else {
        mimePart.headers._rawHeaders.set("content-transfer-encoding", ["8bit"]);
      }
      mimePart.body = decryptedMessage;

      const origCharset = getCharset(mimePart, "content-type");
      if (origCharset) {
        mimePart.headers_rawHeaders.set(
          "content-type",
          getHeaderValue(mimePart, "content-type").replace(origCharset, charset)
        );
      } else {
        mimePart.headers._rawHeaders.set(
          "content-type",
          getHeaderValue(mimePart, "content-type") + "; charset=" + charset
        );
      }

      this.cryptoChanged = true;
      return 1;
    }

    const ct = getContentType(mimePart);
    lazy.EnigmailLog.DEBUG(
      "persistentCrypto.jsm: Decryption skipped:  " + ct + "\n"
    );

    return 0;
  },

  stripHTMLFromArmoredBlocks(text) {
    var index = 0;
    var begin = text.indexOf("-----BEGIN PGP");
    var end = text.indexOf("-----END PGP");

    while (begin > -1 && end > -1) {
      let sub = text.substring(begin, end);

      sub = sub.replace(/(<([^>]+)>)/gi, "");
      sub = sub.replace(/&[A-z]+;/gi, "");

      text = text.substring(0, begin) + sub + text.substring(end);

      index = end + 10;
      begin = text.indexOf("-----BEGIN PGP", index);
      end = text.indexOf("-----END PGP", index);
    }

    return text;
  },

  /******
   *
   *    We have the technology we can rebuild.
   *
   *    Function to reassemble the message from the MIME Tree
   *    into a String.
   *
   ******/

  mimeToString(mimePart, includeHeaders) {
    lazy.EnigmailLog.DEBUG(
      "persistentCrypto.jsm: mimeToString: part: '" + mimePart.partNum + "'\n"
    );

    let msg = "";
    const rawHdr = mimePart.headers._rawHeaders;

    if (includeHeaders && rawHdr.size > 0) {
      for (const hdr of rawHdr.keys()) {
        const formatted = formatMimeHeader(hdr, rawHdr.get(hdr));
        msg += formatted;
        if (!formatted.endsWith("\r\n")) {
          msg += "\r\n";
        }
      }

      msg += "\r\n";
    }

    if (mimePart.body.length > 0) {
      let encoding = getTransferEncoding(mimePart);
      if (!encoding) {
        encoding = "8bit";
      }

      if (encoding === "base64") {
        msg += lazy.EnigmailData.encodeBase64(mimePart.body);
      } else {
        const charset = getCharset(mimePart, "content-type");
        if (charset) {
          msg += lazy.EnigmailData.convertFromUnicode(mimePart.body, charset);
        } else {
          msg += mimePart.body;
        }
      }
    }

    if (mimePart.subParts.length > 0) {
      const boundary = lazy.EnigmailMime.getBoundary(
        rawHdr.get("content-type").join("")
      );

      for (const i in mimePart.subParts) {
        msg += `--${boundary}\r\n`;
        msg += this.mimeToString(mimePart.subParts[i], true);
        if (msg.search(/[\r\n]$/) < 0) {
          msg += "\r\n";
        }
        msg += "\r\n";
      }

      msg += `--${boundary}--\r\n`;
    }
    return msg;
  },

  fixExchangeMessage(mimePart) {
    lazy.EnigmailLog.DEBUG("persistentCrypto.jsm: fixExchangeMessage()\n");

    const msg = this.mimeToString(mimePart, true);

    try {
      const fixedMsg = lazy.EnigmailFixExchangeMsg.getRepairedMessage(msg);
      const replacement = lazy.EnigmailMime.getMimeTree(fixedMsg, true);

      for (const i in replacement) {
        mimePart[i] = replacement[i];
      }
    } catch (ex) {}
  },
};

/**
 * Format a mime header
 *
 * e.g. content-type -> Content-Type
 */

function formatHeader(headerLabel) {
  return headerLabel.replace(/^.|(-.)/g, function (match) {
    return match.toUpperCase();
  });
}

function formatMimeHeader(headerLabel, headerValue) {
  if (Array.isArray(headerValue)) {
    return headerValue
      .map(v => formatHeader(headerLabel) + ": " + v)
      .join("\r\n");
  }
  return formatHeader(headerLabel) + ": " + headerValue + "\r\n";
}

function prettyPrintHeader(headerLabel, headerData) {
  if (Array.isArray(headerData)) {
    const h = [];
    for (const i in headerData) {
      h.push(
        formatMimeHeader(headerLabel, lazy.GlodaUtils.deMime(headerData[i]))
      );
    }
    return h.join("\r\n");
  }
  return formatMimeHeader(
    headerLabel,
    lazy.GlodaUtils.deMime(String(headerData))
  );
}

function getHeaderValue(mimeStruct, header) {
  lazy.EnigmailLog.DEBUG(
    "persistentCrypto.jsm: getHeaderValue: '" + header + "'\n"
  );

  try {
    if (mimeStruct.headers.has(header)) {
      const hdrVal = mimeStruct.headers.get(header);
      if (typeof hdrVal == "string") {
        return hdrVal;
      }
      return mimeStruct.headers[header].join(" ");
    }
    return "";
  } catch (ex) {
    lazy.EnigmailLog.DEBUG(
      "persistentCrypto.jsm: getHeaderValue: header not present\n"
    );
    return "";
  }
}

function getContentType(mime) {
  try {
    if (mime && "headers" in mime && mime.headers.has("content-type")) {
      return mime.headers.get("content-type").type.toLowerCase();
    }
  } catch (e) {
    lazy.EnigmailLog.DEBUG("persistentCrypto.jsm: getContentType: " + e + "\n");
  }
  return null;
}

// return the content of the boundary parameter
function getBoundary(mime) {
  try {
    if (mime && "headers" in mime && mime.headers.has("content-type")) {
      return mime.headers.get("content-type").get("boundary");
    }
  } catch (e) {
    lazy.EnigmailLog.DEBUG("persistentCrypto.jsm: getBoundary: " + e + "\n");
  }
  return null;
}

function getCharset(mime) {
  try {
    if (mime && "headers" in mime && mime.headers.has("content-type")) {
      const c = mime.headers.get("content-type").get("charset");
      if (c) {
        return c.toLowerCase();
      }
    }
  } catch (e) {
    lazy.EnigmailLog.DEBUG("persistentCrypto.jsm: getCharset: " + e + "\n");
  }
  return null;
}

function getTransferEncoding(mime) {
  try {
    if (
      mime &&
      "headers" in mime &&
      mime.headers._rawHeaders.has("content-transfer-encoding")
    ) {
      const c = mime.headers._rawHeaders.get("content-transfer-encoding")[0];
      if (c) {
        return c.toLowerCase();
      }
    }
  } catch (e) {
    lazy.EnigmailLog.DEBUG(
      "persistentCrypto.jsm: getTransferEncoding: " + e + "\n"
    );
  }
  return "8Bit";
}

function isAttachment(mime) {
  try {
    if (mime && "headers" in mime) {
      if (mime.fullContentType.search(/^multipart\//i) === 0) {
        return false;
      }
      if (mime.fullContentType.search(/^text\//i) < 0) {
        return true;
      }

      if (mime.headers.has("content-disposition")) {
        const c = mime.headers.get("content-disposition")[0];
        if (c) {
          if (c.search(/^attachment/i) === 0) {
            return true;
          }
        }
      }
    }
  } catch (x) {}
  return false;
}

/**
 * If the given MIME part is an attachment, return its filename.
 *
 * @param mime: a MIME part
 * @return:     the filename or null
 */
function getAttachmentName(mime) {
  if ("headers" in mime && mime.headers.has("content-disposition")) {
    const c = mime.headers.get("content-disposition")[0];
    if (/^attachment/i.test(c)) {
      return lazy.EnigmailMime.getParameter(c, "filename");
    }
  }
  return null;
}

function getPepSubject(mimeString) {
  lazy.EnigmailLog.DEBUG("persistentCrypto.jsm: getPepSubject()\n");

  let subject = null;

  const emitter = {
    ct: "",
    firstPlainText: false,
    startPart(partNum, headers) {
      lazy.EnigmailLog.DEBUG(
        "persistentCrypto.jsm: getPepSubject.startPart: partNum=" +
          partNum +
          "\n"
      );
      try {
        this.ct = String(headers.getRawHeader("content-type")).toLowerCase();
        if (!subject && !this.firstPlainText) {
          const s = headers.getRawHeader("subject");
          if (s) {
            subject = String(s);
            this.firstPlainText = true;
          }
        }
      } catch (ex) {
        this.ct = "";
      }
    },

    endPart(partNum) {},

    deliverPartData(partNum, data) {
      lazy.EnigmailLog.DEBUG(
        "persistentCrypto.jsm: getPepSubject.deliverPartData: partNum=" +
          partNum +
          " ct=" +
          this.ct +
          "\n"
      );
      if (!this.firstPlainText && this.ct.search(/^text\/plain/) === 0) {
        // check data
        this.firstPlainText = true;

        const o = lazy.EnigmailMime.extractSubjectFromBody(data);
        if (o) {
          subject = o.subject;
        }
      }
    },
  };

  const opt = {
    strformat: "unicode",
    bodyformat: "decode",
  };

  try {
    const p = new lazy.jsmime.MimeParser(emitter, opt);
    p.deliverData(mimeString);
  } catch (ex) {}

  return subject;
}
