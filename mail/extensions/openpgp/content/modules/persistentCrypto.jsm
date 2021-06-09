/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var EXPORTED_SYMBOLS = ["EnigmailPersistentCrypto"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  EnigmailArmor: "chrome://openpgp/content/modules/armor.jsm",
  EnigmailConstants: "chrome://openpgp/content/modules/constants.jsm",
  EnigmailCore: "chrome://openpgp/content/modules/core.jsm",
  EnigmailData: "chrome://openpgp/content/modules/data.jsm",
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.jsm",
  EnigmailEncryption: "chrome://openpgp/content/modules/encryption.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  EnigmailMime: "chrome://openpgp/content/modules/mime.jsm",
  EnigmailStdlib: "chrome://openpgp/content/modules/stdlib.jsm",
  EnigmailFixExchangeMsg:
    "chrome://openpgp/content/modules/fixExchangeMessage.jsm",
  EnigmailDecryption: "chrome://openpgp/content/modules/decryption.jsm",
  EnigmailDialog: "chrome://openpgp/content/modules/dialog.jsm",
  GlodaUtils: "resource:///modules/gloda/GlodaUtils.jsm",
  jsmime: "resource:///modules/jsmime.jsm",
  MailServices: "resource:///modules/MailServices.jsm",
  MailUtils: "resource:///modules/MailUtils.jsm",
  setTimeout: "resource://gre/modules/Timer.jsm",
});

XPCOMUtils.defineLazyGetter(this, "l10n", () => {
  return new Localization(["messenger/openpgp/openpgp.ftl"], true);
});

/*
 *  Decrypt a message and copy it to a folder
 *
 * @param nsIMsgDBHdr hdr   Header of the message
 * @param String destFolder   Folder URI
 * @param Boolean move      If true the original message will be deleted
 *
 * @return a Promise that we do that
 */
var EnigmailPersistentCrypto = {
  /***
   *  dispatchMessages
   *
   *  Because Thunderbird throws all messages at once at us thus we have to rate limit the dispatching
   *  of the message processing. Because there is only a negligible performance gain when dispatching
   *  several message at once we serialize to not overwhelm low power devices.
   *
   *  If targetFolder is null the message will be copied / moved in the same folder as the original
   *  message.
   *
   *  If targetKey is not null the message will be encrypted again to the targetKey.
   *
   *  The function is implemented asynchronously.
   *
   *  Parameters
   *   aMsgHdrs:     Array of nsIMsgDBHdr
   *   targetFolder: String; target folder URI or null
   *   copyListener: listener for async request (nsIMsgCopyServiceListener)
   *   move:         Boolean: type of action; true = "move" / false = "copy"
   *   targetKey:    KeyObject of target key if encryption is requested
   *
   **/

  dispatchMessages(aMsgHdrs, targetFolder, copyListener, move, targetKey) {
    EnigmailLog.DEBUG("persistentCrypto.jsm: dispatchMessages()\n");

    let enigmailSvc = EnigmailCore.getService();
    if (copyListener && !enigmailSvc) {
      // could not initiate Enigmail - do nothing
      copyListener.OnStopCopy(0);
      return;
    }

    if (copyListener) {
      copyListener.OnStartCopy();
    }
    let promise = EnigmailPersistentCrypto.cryptMessage(
      aMsgHdrs[0],
      targetFolder,
      move,
      targetKey
    );

    let processNext = function(data) {
      aMsgHdrs.splice(0, 1);
      if (aMsgHdrs.length > 0) {
        EnigmailPersistentCrypto.dispatchMessages(
          aMsgHdrs,
          targetFolder,
          copyListener,
          move,
          targetKey
        );
      } else {
        // last message was finished processing
        if (copyListener) {
          copyListener.OnStopCopy(0);
        }
        EnigmailLog.DEBUG("persistentCrypto.jsm: dispatchMessages - DONE\n");
      }
    };

    promise.then(processNext);

    promise.catch(function(err) {
      processNext(null);
    });
  },

  /***
   *  cryptMessage
   *
   *  Decrypts a message. If targetKey is not null it
   *  encrypts a message to the target key afterwards.
   *
   *  Parameters
   *   hdr:        nsIMsgDBHdr of the message to encrypt
   *   destFolder: String; target folder URI
   *   move:       Boolean: type of action; true = "move" / false = "copy"
   *   targetKey:  KeyObject of target key if encryption is requested
   **/
  cryptMessage(hdr, destFolder, move, targetKey) {
    return new Promise(function(resolve, reject) {
      let msgUriSpec = hdr.folder.getUriForMsg(hdr);
      let msgUrl = EnigmailFuncs.getUrlFromUriSpec(msgUriSpec);

      const crypt = new CryptMessageIntoFolder(
        destFolder,
        move,
        resolve,
        targetKey
      );

      try {
        EnigmailMime.getMimeTreeFromUrl(msgUrl, true, function(mime) {
          crypt.messageParseCallback(mime, hdr);
        });
      } catch (ex) {
        reject("msgHdrsDeleteoMimeMessage failed: " + ex.toString());
      }
    });
  },
};

function CryptMessageIntoFolder(destFolder, move, resolve, targetKey) {
  this.destFolder = destFolder;
  this.move = move;
  this.resolve = resolve;
  this.targetKey = targetKey;
  this.messageDecrypted = false;

  this.mimeTree = null;
  this.decryptionTasks = [];
  this.subject = "";
}

CryptMessageIntoFolder.prototype = {
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
        // do nothing (still better than destroying the message)
        this.resolve(true);
        return;
      }
      this.messageDecrypted = true;
    } else if (this.messageDecrypted) {
      msg = this.mimeToString(mimeTree, true);
    }

    if (this.messageDecrypted) {
      this.resolve(await this.storeMessage(msg));
    } else {
      this.resolve(true);
    }
  },

  encryptToKey(mimeTree) {
    let exitCodeObj = {};
    let statusFlagsObj = {};
    let errorMsgObj = {};
    EnigmailLog.DEBUG("persistentCrypto.jsm: Encrypting message.\n");

    let inputMsg = this.mimeToString(mimeTree, false);

    let encmsg = "";
    try {
      encmsg = EnigmailEncryption.encryptMessage(
        null,
        0,
        inputMsg,
        "0x" + this.targetKey.fpr,
        "0x" + this.targetKey.fpr,
        "",
        EnigmailConstants.SEND_ENCRYPTED | EnigmailConstants.SEND_ALWAYS_TRUST,
        exitCodeObj,
        statusFlagsObj,
        errorMsgObj
      );
    } catch (ex) {
      EnigmailLog.DEBUG(
        "persistentCrypto.jsm: Encryption failed: " + ex + "\n"
      );
      return null;
    }

    // Build the pgp-encrypted mime structure
    let msg = "";

    let rfc822Headers = []; // FIXME

    // First the original headers
    for (let header in rfc822Headers) {
      if (
        header != "content-type" &&
        header != "content-transfer-encoding" &&
        header != "content-disposition"
      ) {
        msg += prettyPrintHeader(header, rfc822Headers[header]) + "\n";
      }
    }
    // Then multipart/encrypted ct
    let boundary = EnigmailMime.createBoundary();
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
    EnigmailLog.DEBUG("persistentCrypto.jsm: decryptMimeTree:\n");

    if (this.isBrokenByExchange(mimePart)) {
      this.fixExchangeMessage(mimePart);
    }

    if (this.isPgpMime(mimePart)) {
      this.decryptPGPMIME(mimePart);
    } else if (isAttachment(mimePart)) {
      this.decryptAttachment(mimePart);
    } else {
      this.decryptINLINE(mimePart);
    }

    for (let i in mimePart.subParts) {
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
    EnigmailLog.DEBUG("persistentCrypto.jsm: isBrokenByExchange:\n");

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
        EnigmailLog.DEBUG(
          "persistentCrypto.jsm: isBrokenByExchange: found message broken by MS-Exchange\n"
        );
        return true;
      }
    } catch (ex) {}

    return false;
  },

  isPgpMime(mimePart) {
    EnigmailLog.DEBUG("persistentCrypto.jsm: isPgpMime()\n");

    try {
      if (mimePart.headers.has("content-type")) {
        if (
          mimePart.headers.get("content-type").type.toLowerCase() ===
            "multipart/encrypted" &&
          mimePart.headers
            .get("content-type")
            .get("protocol")
            .toLowerCase() === "application/pgp-encrypted" &&
          mimePart.subParts.length === 2
        ) {
          return true;
        }
      }
    } catch (x) {}
    return false;
  },

  async decryptPGPMIME(mimePart) {
    EnigmailLog.DEBUG(
      "persistentCrypto.jsm: decryptPGPMIME(" + mimePart.partNum + ")\n"
    );

    if (!mimePart.subParts[1]) {
      throw new Error("Not a correct PGP/MIME message");
    }

    const uiFlags =
      EnigmailConstants.UI_INTERACTIVE |
      EnigmailConstants.UI_UNVERIFIED_ENC_OK |
      EnigmailConstants.UI_IGNORE_MDC_ERROR;
    let exitCodeObj = {};
    let statusFlagsObj = {};
    let userIdObj = {};
    let sigDetailsObj = {};
    let errorMsgObj = {};
    let keyIdObj = {};
    let blockSeparationObj = {
      value: "",
    };
    let encToDetailsObj = {};
    var signatureObj = {};
    signatureObj.value = "";

    let data = EnigmailDecryption.decryptMessage(
      null,
      uiFlags,
      mimePart.subParts[1].body,
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
      if (statusFlagsObj.value & EnigmailConstants.DISPLAY_MESSAGE) {
        EnigmailDialog.alert(null, errorMsgObj.value);
        throw new Error("Decryption impossible");
      }
    }

    EnigmailLog.DEBUG(
      "persistentCrypto.jsm: analyzeDecryptedData: got " +
        data.length +
        " bytes\n"
    );

    if (EnigmailLog.getLogLevel() > 5) {
      EnigmailLog.DEBUG("*** start data ***\n'" + data + "'\n***end data***\n");
    }

    if (data.length === 0) {
      // fail if no data found
      return;
    }

    let bodyIndex = data.search(/\n\s*\r?\n/);
    if (bodyIndex < 0) {
      bodyIndex = 0;
    } else {
      ++bodyIndex;
    }

    if (data.substr(bodyIndex).search(/\r?\n$/) === 0) {
      return;
    }

    let m = Cc["@mozilla.org/messenger/mimeheaders;1"].createInstance(
      Ci.nsIMimeHeaders
    );
    m.initialize(data.substr(0, bodyIndex));
    let ct = m.extractHeader("content-type", false) || "";
    let part = mimePart.partNum;

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
      }
    }

    let boundary = getBoundary(mimePart);
    if (!boundary) {
      boundary = EnigmailMime.createBoundary();
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

    this.messageDecrypted = true;
  },

  decryptAttachment(mimePart) {
    EnigmailLog.DEBUG("persistentCrypto.jsm: decryptAttachment()\n");
    throw new Error("Not implemented");

    /*
    let attachmentHead = mimePart.body.substr(0, 30);
    if (attachmentHead.search(/-----BEGIN PGP \w{5,10} KEY BLOCK-----/) >= 0) {
      // attachment appears to be a PGP key file, we just go-a-head
      return;
    }

    let attachmentName = getAttachmentName(mimePart);
    attachmentName = attachmentName ? attachmentName.replace(/\.(pgp|asc|gpg)$/, "") : "";

    EnigmailLog.DEBUG("persistentCrypto.jsm: decryptAttachment: decrypted to " + listener.stdoutData.length + " bytes\n");
    if (statusFlagsObj.encryptedFileName && statusFlagsObj.encryptedFileName.length > 0) {
      attachmentName = statusFlagsObj.encryptedFileName;
    }

    this.decryptedMessage = true;
    mimePart.body = listener.stdoutData;
    mimePart.headers._rawHeaders.set("content-disposition", `attachment; filename="${attachmentName}"`);
    mimePart.headers._rawHeaders.set("content-transfer-encoding", ["base64"]);
    let origCt = mimePart.headers.get("content-type");
    let ct = origCt.type;


    for (let i of origCt.entries()) {
      if (i[0].toLowerCase() === "name") {
        i[1] = i[1].replace(/\.(pgp|asc|gpg)$/, "");
      }
      ct += `; ${i[0]}="${i[1]}"`;
    }

    mimePart.headers._rawHeaders.set("content-type", [ct]);
    */
  },

  async decryptINLINE(mimePart) {
    EnigmailLog.DEBUG("persistentCrypto.jsm: decryptINLINE()\n");

    if ("decryptedPgpMime" in mimePart && mimePart.decryptedPgpMime) {
      return 0;
    }

    if ("body" in mimePart && mimePart.body.length > 0) {
      let ct = getContentType(mimePart);

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
        EnigmailConstants.UI_INTERACTIVE |
        EnigmailConstants.UI_UNVERIFIED_ENC_OK |
        EnigmailConstants.UI_IGNORE_MDC_ERROR;

      var plaintexts = [];
      var blocks = EnigmailArmor.locateArmoredBlocks(mimePart.body);
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
          let ciphertext = mimePart.body.substring(
            blocks[i].begin,
            blocks[i].end + 1
          );

          if (ciphertext.length === 0) {
            break;
          }

          let hdr = ciphertext.search(/(\r\r|\n\n|\r\n\r\n)/);
          if (hdr > 0) {
            let chset = ciphertext.substr(0, hdr).match(/^(charset:)(.*)$/im);
            if (chset && chset.length == 3) {
              charset = chset[2].trim();
            }
          }
          plaintext = EnigmailDecryption.decryptMessage(
            null,
            uiFlags,
            ciphertext,
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
            if (statusFlagsObj.value & EnigmailConstants.DISPLAY_MESSAGE) {
              EnigmailDialog.alert(null, errorMsgObj.value);
              this.messageDecrypted = false;
              return -1;
            }

            if (
              statusFlagsObj.value &
              (EnigmailConstants.DECRYPTION_FAILED |
                EnigmailConstants.MISSING_MDC)
            ) {
              EnigmailLog.DEBUG(
                "persistentCrypto.jsm: decryptINLINE: no MDC protection, decrypting anyway\n"
              );
            }
            if (statusFlagsObj.value & EnigmailConstants.DECRYPTION_FAILED) {
              // since we cannot find out if the user wants to cancel
              // we should ask
              let msg = await l10n.formatValue(
                "converter-decrypt-body-failed",
                {
                  subject: this.subject,
                }
              );

              if (
                !EnigmailDialog.confirmDlg(
                  null,
                  msg,
                  l10n.formatValueSync("dlg-button-retry"),
                  l10n.formatValueSync("dlg-button-skip")
                )
              ) {
                this.messageDecrypted = false;
                return -1;
              }
            } else if (
              statusFlagsObj.value & EnigmailConstants.DECRYPTION_INCOMPLETE
            ) {
              this.messageDecrypted = false;
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
            let m = EnigmailMime.extractSubjectFromBody(plaintext);
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
      let j = decryptedMessage.search(/[^\x01-\x7F]/); // eslint-disable-line no-control-regex
      if (j >= 0) {
        mimePart.headers._rawHeaders.set("content-transfer-encoding", [
          "base64",
        ]);
      } else {
        mimePart.headers._rawHeaders.set("content-transfer-encoding", ["8bit"]);
      }
      mimePart.body = decryptedMessage;

      let origCharset = getCharset(getHeaderValue(mimePart, "content-type"));
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

      this.messageDecrypted = true;
      return 1;
    }

    let ct = getContentType(mimePart);
    EnigmailLog.DEBUG(
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
    EnigmailLog.DEBUG(
      "persistentCrypto.jsm: mimeToString: part: '" + mimePart.partNum + "'\n"
    );

    let msg = "";
    let rawHdr = mimePart.headers._rawHeaders;

    if (includeHeaders && rawHdr.size > 0) {
      for (let hdr of rawHdr.keys()) {
        msg += formatMimeHeader(hdr, rawHdr.get(hdr)) + "\r\n";
      }

      msg += "\r\n";
    }

    if (mimePart.body.length > 0) {
      let encoding = getTransferEncoding(mimePart);
      if (!encoding) {
        encoding = "8bit";
      }

      if (encoding === "quoted-printable") {
        mimePart.headers._rawHeaders.set("content-transfer-encoding", [
          "base64",
        ]);
        encoding = "base64";
      }

      if (encoding === "base64") {
        msg += EnigmailData.encodeBase64(mimePart.body);
      } else {
        msg += mimePart.body;
      }
    }

    if (mimePart.subParts.length > 0) {
      let boundary = EnigmailMime.getBoundary(
        rawHdr.get("content-type").join("")
      );

      for (let i in mimePart.subParts) {
        msg += `--${boundary}\r\n`;
        msg += this.mimeToString(mimePart.subParts[i], true);
        if (msg.search(/[\r\n]$/) < 0) {
          msg += "\r\n";
        }
      }

      msg += `--${boundary}--\r\n`;
    }
    return msg;
  },

  storeMessage(msg) {
    let self = this;

    return new Promise((resolve, reject) => {
      //XXX Do we wanna use the tmp for this?
      let tempFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
      tempFile.append("message.eml");
      tempFile.createUnique(0, 384); // == 0600, octal is deprecated

      // ensure that file gets deleted on exit, if something goes wrong ...
      let extAppLauncher = Cc["@mozilla.org/mime;1"].getService(
        Ci.nsPIExternalAppLauncher
      );

      let foStream = Cc[
        "@mozilla.org/network/file-output-stream;1"
      ].createInstance(Ci.nsIFileOutputStream);
      foStream.init(tempFile, 2, 0x200, false); // open as "write only"
      foStream.write(msg, msg.length);
      foStream.close();

      extAppLauncher.deleteTemporaryFileOnExit(tempFile);

      //
      //  This was taken from the HeaderToolsLite Example Addon "original by Frank DiLecce"
      //
      // this is interesting: nsIMsgFolder.copyFileMessage seems to have a bug on Windows, when
      // the nsIFile has been already used by foStream (because of Windows lock system?), so we
      // must initialize another nsIFile object, pointing to the temporary file
      let fileSpec = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      fileSpec.initWithPath(tempFile.path);

      let copyListener = {
        QueryInterface: ChromeUtils.generateQI(["nsIMsgCopyServiceListener"]),
        GetMessageId(messageId) {},
        OnProgress(progress, progressMax) {},
        OnStartCopy() {
          EnigmailLog.DEBUG(
            "persistentCrypto.jsm: copyListener: OnStartCopy()\n"
          );
        },
        SetMessageKey(key) {
          EnigmailLog.DEBUG(
            "persistentCrypto.jsm: copyListener: SetMessageKey(" + key + ")\n"
          );
        },
        OnStopCopy(statusCode) {
          EnigmailLog.DEBUG(
            "persistentCrypto.jsm: copyListener: OnStopCopy()\n"
          );
          if (statusCode !== 0) {
            EnigmailLog.DEBUG(
              "persistentCrypto.jsm: Error copying message: " +
                statusCode +
                "\n"
            );
            try {
              tempFile.remove(false);
            } catch (ex) {
              try {
                fileSpec.remove(false);
              } catch (e2) {
                EnigmailLog.DEBUG(
                  "persistentCrypto.jsm: Could not delete temp file\n"
                );
              }
            }
            resolve(true);
            return;
          }
          EnigmailLog.DEBUG("persistentCrypto.jsm: Copy complete\n");

          if (self.move) {
            deleteOriginalMail(self.hdr);
          }

          try {
            tempFile.remove(false);
          } catch (ex) {
            try {
              fileSpec.remove(false);
            } catch (e2) {
              EnigmailLog.DEBUG(
                "persistentCrypto.jsm: Could not delete temp file\n"
              );
            }
          }

          EnigmailLog.DEBUG("persistentCrypto.jsm: Cave Johnson. We're done\n");
          resolve(true);
        },
      };

      EnigmailLog.DEBUG("persistentCrypto.jsm: copySvc ready for copy\n");
      try {
        if (self.mimeTree.headers.has("subject")) {
          self.hdr.subject = self.mimeTree.headers.get("subject");
        }
      } catch (ex) {}

      MailServices.copy.copyFileMessage(
        fileSpec,
        MailUtils.getExistingFolder(self.destFolder),
        null,
        false,
        0,
        "",
        copyListener,
        null
      );
    });
  },

  fixExchangeMessage(mimePart) {
    EnigmailLog.DEBUG("persistentCrypto.jsm: fixExchangeMessage()\n");

    let msg = this.mimeToString(mimePart, true);

    try {
      let fixedMsg = EnigmailFixExchangeMsg.getRepairedMessage(msg);
      let replacement = EnigmailMime.getMimeTree(fixedMsg, true);

      for (let i in replacement) {
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
  return headerLabel.replace(/^.|(-.)/g, function(match) {
    return match.toUpperCase();
  });
}

function formatMimeHeader(headerLabel, headerValue) {
  if (Array.isArray(headerValue)) {
    headerValue = headerValue.join("");
  }
  if (headerLabel.search(/^(sender|from|reply-to|to|cc|bcc)$/i) === 0) {
    return (
      formatHeader(headerLabel) +
      ": " +
      EnigmailMime.formatHeaderData(
        EnigmailMime.formatEmailAddress(headerValue)
      )
    );
  }
  return (
    formatHeader(headerLabel) +
    ": " +
    EnigmailMime.formatHeaderData(EnigmailMime.encodeHeaderValue(headerValue))
  );
}

function prettyPrintHeader(headerLabel, headerData) {
  if (Array.isArray(headerData)) {
    let h = [];
    for (let i in headerData) {
      h.push(formatMimeHeader(headerLabel, GlodaUtils.deMime(headerData[i])));
    }
    return h.join("\r\n");
  }
  return formatMimeHeader(headerLabel, GlodaUtils.deMime(String(headerData)));
}

function getHeaderValue(mimeStruct, header) {
  EnigmailLog.DEBUG("persistentCrypto.jsm: getHeaderValue: '" + header + "'\n");

  try {
    if (mimeStruct.headers.has(header)) {
      let hdrVal = mimeStruct.headers.get(header);
      if (typeof hdrVal == "string") {
        return hdrVal;
      }
      return mimeStruct.headers[header].join(" ");
    }
    return "";
  } catch (ex) {
    EnigmailLog.DEBUG(
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
    EnigmailLog.DEBUG("persistentCrypto.jsm: getContentType: " + e + "\n");
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
    EnigmailLog.DEBUG("persistentCrypto.jsm: getBoundary: " + e + "\n");
  }
  return null;
}

function getCharset(mime) {
  try {
    if (mime && "headers" in mime && mime.headers.has("content-type")) {
      let c = mime.headers.get("content-type").get("charset");
      if (c) {
        return c.toLowerCase();
      }
    }
  } catch (e) {
    EnigmailLog.DEBUG("persistentCrypto.jsm: getCharset: " + e + "\n");
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
      let c = mime.headers._rawHeaders.get("content-transfer-encoding")[0];
      if (c) {
        return c.toLowerCase();
      }
    }
  } catch (e) {
    EnigmailLog.DEBUG("persistentCrypto.jsm: getTransferEncoding: " + e + "\n");
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
        let c = mime.headers.get("content-disposition")[0];
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

function getPepSubject(mimeString) {
  EnigmailLog.DEBUG("persistentCrypto.jsm: getPepSubject()\n");

  let subject = null;

  let emitter = {
    ct: "",
    firstPlainText: false,
    startPart(partNum, headers) {
      EnigmailLog.DEBUG(
        "persistentCrypto.jsm: getPepSubject.startPart: partNum=" +
          partNum +
          "\n"
      );
      try {
        this.ct = String(headers.getRawHeader("content-type")).toLowerCase();
        if (!subject && !this.firstPlainText) {
          let s = headers.getRawHeader("subject");
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
      EnigmailLog.DEBUG(
        "persistentCrypto.jsm: getPepSubject.deliverPartData: partNum=" +
          partNum +
          " ct=" +
          this.ct +
          "\n"
      );
      if (!this.firstPlainText && this.ct.search(/^text\/plain/) === 0) {
        // check data
        this.firstPlainText = true;

        let o = EnigmailMime.extractSubjectFromBody(data);
        if (o) {
          subject = o.subject;
        }
      }
    },
  };

  let opt = {
    strformat: "unicode",
    bodyformat: "decode",
  };

  try {
    let p = new jsmime.MimeParser(emitter, opt);
    p.deliverData(mimeString);
  } catch (ex) {}

  return subject;
}

/**
 * Lazy deletion of original messages
 */
function deleteOriginalMail(msgHdr) {
  EnigmailLog.DEBUG(
    "persistentCrypto.jsm: deleteOriginalMail(" + msgHdr.messageKey + ")\n"
  );

  let delMsg = function() {
    try {
      EnigmailLog.DEBUG(
        "persistentCrypto.jsm: deleting original message " +
          msgHdr.messageKey +
          "\n"
      );
      EnigmailStdlib.msgHdrsDelete([msgHdr]);
    } catch (e) {
      EnigmailLog.DEBUG(
        "persistentCrypto.jsm: deletion failed. Error: " + e.toString() + "\n"
      );
    }
  };

  setTimeout(delMsg, 500);
}
