/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailMimeDecrypt"];

/**
 *  Module for handling PGP/MIME encrypted messages
 *  implemented as an XPCOM object
 */

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  EnigmailConstants: "chrome://openpgp/content/modules/constants.jsm",
  EnigmailCore: "chrome://openpgp/content/modules/core.jsm",
  EnigmailCryptoAPI: "chrome://openpgp/content/modules/cryptoAPI.jsm",
  EnigmailData: "chrome://openpgp/content/modules/data.jsm",
  EnigmailDecryption: "chrome://openpgp/content/modules/decryption.jsm",
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  EnigmailMime: "chrome://openpgp/content/modules/mime.jsm",
  EnigmailSingletons: "chrome://openpgp/content/modules/singletons.jsm",
  EnigmailURIs: "chrome://openpgp/content/modules/uris.jsm",
  EnigmailVerify: "chrome://openpgp/content/modules/mimeVerify.jsm",
  Services: "resource://gre/modules/Services.jsm",
});

XPCOMUtils.defineLazyGetter(this, "l10n", () => {
  return new Localization(["messenger/openpgp/openpgp.ftl"], true);
});

const ENCODING_DEFAULT = 0;
const ENCODING_BASE64 = 1;
const ENCODING_QP = 2;

const LAST_MSG = EnigmailSingletons.lastDecryptedMessage;

var gDebugLogLevel = 3;

var gNumProc = 0;

var EnigmailMimeDecrypt = {
  /**
   * create a new instance of a PGP/MIME decryption handler
   */
  newPgpMimeHandler() {
    return new MimeDecryptHandler();
  },

  /**
   * Return a fake empty attachment with information that the message
   * was not decrypted
   *
   * @return {String}: MIME string (HTML text)
   */
  emptyAttachment() {
    EnigmailLog.DEBUG("mimeDecrypt.jsm: emptyAttachment()\n");

    let encPart = l10n.formatValueSync(
      "mime-decrypt-encrypted-part-attachment-label"
    );
    let concealed = l10n.formatValueSync(
      "mime-decrypt-encrypted-part-concealed-data"
    );
    let retData = `Content-Type: message/rfc822; name="${encPart}.eml"
Content-Transfer-Encoding: 7bit
Content-Disposition: attachment; filename="${encPart}.eml"

Content-Type: text/html

<p><i>${concealed}</i></p>
`;
    return retData;
  },

  /**
   * Wrap the decrypted output into a message/rfc822 attachment
   *
   * @param {String} decryptingMimePartNum: requested MIME part number
   * @param {Object} uri: nsIURI object of the decrypted message
   *
   * @return {String}: prefix for message data
   */
  pretendAttachment(decryptingMimePartNum, uri) {
    if (decryptingMimePartNum === "1" || !uri) {
      return "";
    }

    let msg = "";
    let mimePartNumber = EnigmailMime.getMimePartNumber(uri.spec);

    if (mimePartNumber === decryptingMimePartNum + ".1") {
      msg =
        'Content-Type: message/rfc822; name="attachment.eml"\r\n' +
        "Content-Transfer-Encoding: 7bit\r\n" +
        'Content-Disposition: attachment; filename="attachment.eml"\r\n\r\n';

      try {
        let dbHdr = uri.QueryInterface(Ci.nsIMsgMessageUrl).messageHeader;
        if (dbHdr.subject) {
          msg += `Subject: ${dbHdr.subject}\r\n`;
        }
        if (dbHdr.author) {
          msg += `From: ${dbHdr.author}\r\n`;
        }
        if (dbHdr.recipients) {
          msg += `To: ${dbHdr.recipients}\r\n`;
        }
        if (dbHdr.ccList) {
          msg += `Cc: ${dbHdr.ccList}\r\n`;
        }
      } catch (x) {
        console.debug(x);
      }
    }

    return msg;
  },
};

////////////////////////////////////////////////////////////////////
// handler for PGP/MIME encrypted messages
// data is processed from libmime -> nsPgpMimeProxy

function MimeDecryptHandler() {
  EnigmailLog.DEBUG("mimeDecrypt.jsm: MimeDecryptHandler()\n"); // always log this one
  this.mimeSvc = null;
  this.initOk = false;
  this.boundary = "";
  this.pipe = null;
  this.closePipe = false;
  this.statusStr = "";
  this.outQueue = "";
  this.dataLength = 0;
  this.bytesWritten = 0;
  this.mimePartCount = 0;
  this.headerMode = 0;
  this.xferEncoding = ENCODING_DEFAULT;
  this.matchedPgpDelimiter = 0;
  this.exitCode = null;
  this.msgWindow = null;
  this.msgUriSpec = null;
  this.returnStatus = null;
  this.proc = null;
  this.statusDisplayed = false;
  this.uri = null;
  this.backgroundJob = false;
  this.decryptedHeaders = {};
  this.mimePartNumber = "";
  this.dataIsBase64 = null;
  this.base64Cache = "";
}

MimeDecryptHandler.prototype = {
  inStream: Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
    Ci.nsIScriptableInputStream
  ),

  onStartRequest(request, uri) {
    if (!EnigmailCore.getService()) {
      // Ensure Enigmail is initialized
      return;
    }
    EnigmailLog.DEBUG("mimeDecrypt.jsm: onStartRequest\n"); // always log this one

    ++gNumProc;
    if (gNumProc > Services.prefs.getIntPref("temp.openpgp.maxNumProcesses")) {
      EnigmailLog.DEBUG(
        "mimeDecrypt.jsm: number of parallel requests above threshold - ignoring requst\n"
      );
      return;
    }

    this.initOk = true;
    this.mimeSvc = request.QueryInterface(Ci.nsIPgpMimeProxy);
    if ("mimePart" in this.mimeSvc) {
      this.mimePartNumber = this.mimeSvc.mimePart;
    } else {
      this.mimePartNumber = "";
    }

    if ("messageURI" in this.mimeSvc) {
      this.uri = this.mimeSvc.messageURI;
      if (this.uri) {
        EnigmailLog.DEBUG(
          "mimeDecrypt.jsm: onStartRequest: uri='" + this.uri.spec + "'\n"
        );
      } else {
        EnigmailLog.DEBUG("mimeDecrypt.jsm: onStartRequest: uri=null\n");
      }
    } else if (uri) {
      this.uri = uri.QueryInterface(Ci.nsIURI);
      EnigmailLog.DEBUG(
        "mimeDecrypt.jsm: onStartRequest: uri='" + this.uri.spec + "'\n"
      );
    }
    this.pipe = null;
    this.closePipe = false;
    this.exitCode = null;
    this.msgWindow = EnigmailVerify.lastMsgWindow;
    this.msgUriSpec = EnigmailVerify.lastMsgUri;

    this.statusDisplayed = false;
    this.returnStatus = null;
    this.dataLength = 0;
    this.decryptedData = "";
    this.mimePartCount = 0;
    this.bytesWritten = 0;
    this.matchedPgpDelimiter = 0;
    this.dataIsBase64 = null;
    this.base64Cache = "";
    this.outQueue = "";
    this.statusStr = "";
    this.headerMode = 0;
    this.decryptedHeaders = {};
    this.xferEncoding = ENCODING_DEFAULT;
    this.boundary = EnigmailMime.getBoundary(this.mimeSvc.contentType);

    let now = Date.now();
    let timeoutReached =
      EnigmailSingletons.lastMessageDecryptTime &&
      now - EnigmailSingletons.lastMessageDecryptTime > 10000;
    if (timeoutReached || !this.isReloadingLastMessage()) {
      EnigmailSingletons.clearLastDecryptedMessage();
      EnigmailSingletons.lastMessageDecryptTime = now;
    }
  },

  processData(data) {
    // detect MIME part boundary
    if (data.includes(this.boundary)) {
      LOCAL_DEBUG("mimeDecrypt.jsm: processData: found boundary\n");
      ++this.mimePartCount;
      this.headerMode = 1;
      return;
    }

    // found PGP/MIME "body"
    if (this.mimePartCount == 2) {
      if (this.headerMode == 1) {
        // we are in PGP/MIME main part headers
        if (data.search(/\r|\n/) === 0) {
          // end of Mime-part headers reached
          this.headerMode = 2;
        } else if (data.search(/^content-transfer-encoding:\s*/i) >= 0) {
          // extract content-transfer-encoding
          data = data.replace(/^content-transfer-encoding:\s*/i, "");
          data = data
            .replace(/;.*/, "")
            .toLowerCase()
            .trim();
          if (data.search(/base64/i) >= 0) {
            this.xferEncoding = ENCODING_BASE64;
          } else if (data.search(/quoted-printable/i) >= 0) {
            this.xferEncoding = ENCODING_QP;
          }
        }
        // else: PGP/MIME main part body
      } else if (this.xferEncoding == ENCODING_QP) {
        this.cacheData(EnigmailData.decodeQuotedPrintable(data));
      } else {
        this.cacheData(data);
      }
    }
  },

  onDataAvailable(req, stream, offset, count) {
    // get data from libmime
    if (!this.initOk) {
      return;
    }
    this.inStream.init(stream);

    if (count > 0) {
      var data = this.inStream.read(count);

      if (this.mimePartCount == 0 && this.dataIsBase64 === null) {
        // try to determine if this could be a base64 encoded message part
        this.dataIsBase64 = this.isBase64Encoding(data);
      }

      if (!this.dataIsBase64) {
        if (data.search(/[\r\n][^\r\n]+[\r\n]/) >= 0) {
          // process multi-line data line by line
          let lines = data.replace(/\r\n/g, "\n").split(/\n/);

          for (let i = 0; i < lines.length; i++) {
            this.processData(lines[i] + "\r\n");
          }
        } else {
          this.processData(data);
        }
      } else {
        this.base64Cache += data;
      }
    }
  },

  /**
   * Try to determine if data is base64 endoded
   */
  isBase64Encoding(str) {
    let ret = false;

    str = str.replace(/[\r\n]/, "");
    if (str.search(/^[A-Za-z0-9+/=]+$/) === 0) {
      let excess = str.length % 4;
      str = str.substring(0, str.length - excess);

      try {
        atob(str);
        // if the conversion succeds, we have a base64 encoded message
        ret = true;
      } catch (ex) {
        // not a base64 encoded
        console.debug(ex);
      }
    }

    return ret;
  },

  // cache encrypted data
  cacheData(str) {
    if (gDebugLogLevel > 4) {
      LOCAL_DEBUG("mimeDecrypt.jsm: cacheData: " + str.length + "\n");
    }

    this.outQueue += str;
  },

  processBase64Message() {
    LOCAL_DEBUG("mimeDecrypt.jsm: processBase64Message\n");

    try {
      this.base64Cache = EnigmailData.decodeBase64(this.base64Cache);
    } catch (ex) {
      // if decoding failed, try non-encoded version
      console.debug(ex);
    }

    let lines = this.base64Cache.replace(/\r\n/g, "\n").split(/\n/);

    for (let i = 0; i < lines.length; i++) {
      this.processData(lines[i] + "\r\n");
    }
  },

  /**
   * Determine if we are reloading the same message as the previous one
   *
   * @return Boolean
   */
  isReloadingLastMessage() {
    if (!this.uri) {
      return false;
    }
    if (!LAST_MSG.lastMessageURI) {
      return false;
    }
    if ("lastMessageData" in LAST_MSG && LAST_MSG.lastMessageData === "") {
      return false;
    }
    if (this.isUrlEnigmailConvert()) {
      return false;
    }

    let currMsg = EnigmailURIs.msgIdentificationFromUrl(this.uri);

    if (
      LAST_MSG.lastMessageURI.folder === currMsg.folder &&
      LAST_MSG.lastMessageURI.msgNum === currMsg.msgNum
    ) {
      return true;
    }

    return false;
  },

  isUrlEnigmailConvert() {
    if (!this.uri) {
      return false;
    }

    return this.uri.spec.search(/[&?]header=enigmailConvert/) >= 0;
  },

  onStopRequest(request, status, dummy) {
    LOCAL_DEBUG("mimeDecrypt.jsm: onStopRequest\n");
    --gNumProc;
    if (!this.initOk) {
      return;
    }

    if (this.dataIsBase64) {
      this.processBase64Message();
    }

    this.msgWindow = EnigmailVerify.lastMsgWindow;
    this.msgUriSpec = EnigmailVerify.lastMsgUri;

    let url = {};
    let currMsg = EnigmailURIs.msgIdentificationFromUrl(this.uri);

    this.backgroundJob = false;

    if (this.uri) {
      // return if not decrypting currently displayed message (except if
      // printing, replying, etc)

      this.backgroundJob =
        this.uri.spec.search(/[&?]header=(print|quotebody|enigmailConvert)/) >=
        0;

      try {
        if (!Services.prefs.getBoolPref("temp.openpgp.autoDecrypt")) {
          // "decrypt manually" mode
          let manUrl = {};

          if (EnigmailVerify.getManualUri()) {
            manUrl.value = EnigmailFuncs.getUrlFromUriSpec(
              EnigmailVerify.getManualUri()
            );
          }

          // print a message if not message explicitly decrypted
          let currUrlSpec = this.uri.spec.replace(
            /(\?.*)(number=[0-9]*)(&.*)?$/,
            "?$2"
          );
          let manUrlSpec = manUrl.value.spec.replace(
            /(\?.*)(number=[0-9]*)(&.*)?$/,
            "?$2"
          );

          if (!this.backgroundJob && currUrlSpec.indexOf(manUrlSpec) !== 0) {
            this.handleManualDecrypt();
            return;
          }
        }

        if (this.msgUriSpec) {
          url.value = EnigmailFuncs.getUrlFromUriSpec(this.msgUriSpec);
        }

        if (
          this.uri.spec.search(/[&?]header=[^&]+/) > 0 &&
          this.uri.spec.search(/[&?]examineEncryptedParts=true/) < 0
        ) {
          if (
            this.uri.spec.search(/[&?]header=(filter|enigmailFilter)(&.*)?$/) >
            0
          ) {
            EnigmailLog.DEBUG(
              "mimeDecrypt.jsm: onStopRequest: detected incoming message processing\n"
            );
            return;
          }
        }

        if (
          this.uri.spec.search(/[&?]header=[^&]+/) < 0 &&
          this.uri.spec.search(/[&?]part=[.0-9]+/) < 0 &&
          this.uri.spec.search(/[&?]examineEncryptedParts=true/) < 0
        ) {
          if (this.uri && url && url.value) {
            let fixedQueryRef = this.uri.pathQueryRef.replace(/&number=0$/, "");
            if (
              url.value.host !== this.uri.host ||
              url.value.pathQueryRef !== fixedQueryRef
            ) {
              return;
            }
          }
        }
      } catch (ex) {
        console.debug(ex);
        EnigmailLog.writeException("mimeDecrypt.js", ex);
        EnigmailLog.DEBUG(
          "mimeDecrypt.jsm: error while processing " + this.msgUriSpec + "\n"
        );
      }
    }

    let spec = this.uri ? this.uri.spec : null;
    EnigmailLog.DEBUG(
      `mimeDecrypt.jsm: checking MIME structure for ${this.mimePartNumber} / ${spec}\n`
    );

    if (
      !EnigmailMime.isRegularMimeStructure(this.mimePartNumber, spec, false)
    ) {
      if (!this.isUrlEnigmailConvert()) {
        this.returnData(EnigmailMimeDecrypt.emptyAttachment());
      } else {
        throw new Error(
          "Cannot decrypt messages with mixed (encrypted/non-encrypted) content"
        );
      }
      return;
    }

    if (!this.isReloadingLastMessage()) {
      if (this.xferEncoding == ENCODING_BASE64) {
        this.outQueue = EnigmailData.decodeBase64(this.outQueue) + "\n";
      }

      let win = this.msgWindow;

      if (!EnigmailDecryption.isReady(win)) {
        return;
      }

      // limit output to 100 times message size to avoid DoS attack
      let maxOutput = this.outQueue.length * 100;

      EnigmailLog.DEBUG("mimeDecryp.jsm: starting decryption\n");
      //EnigmailLog.DEBUG(this.outQueue + "\n");

      let options = {
        fromAddr: EnigmailDecryption.getFromAddr(win),
        maxOutputLength: maxOutput,
      };

      if (!options.fromAddr) {
        var win2 = Services.wm.getMostRecentWindow(null);
        options.fromAddr = EnigmailDecryption.getFromAddr(win2);
      }

      const cApi = EnigmailCryptoAPI();
      EnigmailLog.DEBUG("mimeDecrypt.jsm: got API: " + cApi.api_name + "\n");
      this.returnStatus = cApi.sync(cApi.decryptMime(this.outQueue, options));

      if (!this.returnStatus) {
        this.returnStatus = {
          decryptedData: "",
          exitCode: -1,
          statusFlags: EnigmailConstants.DECRYPTION_FAILED,
        };
      }

      if (this.returnStatus.statusFlags & EnigmailConstants.DECRYPTION_OKAY) {
        this.returnStatus.statusFlags |= EnigmailConstants.PGP_MIME_ENCRYPTED;
      }

      if (this.returnStatus.exitCode) {
        // Failure
        if (this.returnStatus.decryptedData.length) {
          // However, we got decrypted data.
          // Did we get any verification failure flags?
          // If yes, then conclude only verification failed.
          if (
            this.returnStatus.statusFlags &
            (EnigmailConstants.BAD_SIGNATURE |
              EnigmailConstants.UNCERTAIN_SIGNATURE |
              EnigmailConstants.EXPIRED_SIGNATURE |
              EnigmailConstants.EXPIRED_KEY_SIGNATURE)
          ) {
            this.returnStatus.statusFlags |= EnigmailConstants.DECRYPTION_OKAY;
          } else {
            this.returnStatus.statusFlags |=
              EnigmailConstants.DECRYPTION_FAILED;
          }
        } else {
          // no data
          this.returnStatus.statusFlags |= EnigmailConstants.DECRYPTION_FAILED;
        }
      }

      this.decryptedData = this.returnStatus.decryptedData;
      this.handleResult(this.returnStatus.exitCode);

      let decError =
        this.returnStatus.statusFlags & EnigmailConstants.DECRYPTION_FAILED;

      if (!this.isUrlEnigmailConvert()) {
        // don't return decrypted data if decryption failed (because it's likely an MDC error),
        // unless we are called for permanent decryption
        if (decError) {
          this.decryptedData = "";
        }
      }

      this.displayStatus();

      // HACK: remove filename from 1st HTML and plaintext parts to make TB display message without attachment
      this.decryptedData = this.decryptedData.replace(
        /^Content-Disposition: inline; filename="msg.txt"/m,
        "Content-Disposition: inline"
      );
      this.decryptedData = this.decryptedData.replace(
        /^Content-Disposition: inline; filename="msg.html"/m,
        "Content-Disposition: inline"
      );

      let prefix = EnigmailMimeDecrypt.pretendAttachment(
        this.mimePartNumber,
        this.uri
      );
      this.returnData(prefix + this.decryptedData);

      // don't remember the last message if it contains an embedded PGP/MIME message
      // to avoid ending up in a loop
      if (
        this.mimePartNumber === "1" &&
        this.decryptedData.search(
          /^Content-Type:[\t ]+multipart\/encrypted/im
        ) < 0 &&
        !decError
      ) {
        LAST_MSG.lastMessageData = this.decryptedData;
        LAST_MSG.lastMessageURI = currMsg;
        LAST_MSG.lastStatus = this.returnStatus;
        LAST_MSG.lastStatus.decryptedHeaders = this.decryptedHeaders;
        LAST_MSG.lastStatus.mimePartNumber = this.mimePartNumber;
      } else {
        LAST_MSG.lastMessageURI = null;
        LAST_MSG.lastMessageData = "";
      }

      this.decryptedData = "";
      EnigmailLog.DEBUG("mimeDecrypt.jsm: onStopRequest: process terminated\n"); // always log this one
      this.proc = null;
    } else {
      this.returnStatus = LAST_MSG.lastStatus;
      this.decryptedHeaders = LAST_MSG.lastStatus.decryptedHeaders;
      this.mimePartNumber = LAST_MSG.lastStatus.mimePartNumber;
      this.exitCode = 0;
      this.displayStatus();
      this.returnData(LAST_MSG.lastMessageData);
    }
  },

  displayStatus() {
    EnigmailLog.DEBUG("mimeDecrypt.jsm: displayStatus()\n");

    if (
      this.exitCode === null ||
      this.msgWindow === null ||
      this.statusDisplayed
    ) {
      EnigmailLog.DEBUG("mimeDecrypt.jsm: displayStatus: nothing to display\n");
      return;
    }

    let uriSpec = this.uri ? this.uri.spec : null;

    try {
      EnigmailLog.DEBUG(
        "mimeDecrypt.jsm: displayStatus for uri " + uriSpec + "\n"
      );
      let headerSink = EnigmailSingletons.messageReader;

      if (headerSink && this.uri && !this.backgroundJob) {
        headerSink.processDecryptionResult(
          this.uri,
          "modifyMessageHeaders",
          JSON.stringify(this.decryptedHeaders),
          this.mimePartNumber
        );

        headerSink.updateSecurityStatus(
          this.msgUriSpec,
          this.exitCode,
          this.returnStatus.statusFlags,
          this.returnStatus.extStatusFlags,
          this.returnStatus.keyId,
          this.returnStatus.userId,
          this.returnStatus.sigDetails,
          this.returnStatus.errorMsg,
          this.returnStatus.blockSeparation,
          this.uri,
          JSON.stringify({
            encryptedTo: this.returnStatus.encToDetails,
          }),
          this.mimePartNumber
        );
      } else {
        this.updateHeadersInMsgDb();
      }
      this.statusDisplayed = true;
    } catch (ex) {
      console.debug(ex);
      EnigmailLog.writeException("mimeDecrypt.jsm", ex);
    }
    LOCAL_DEBUG("mimeDecrypt.jsm: displayStatus done\n");
  },

  handleResult(exitCode) {
    LOCAL_DEBUG("mimeDecrypt.jsm: done: " + exitCode + "\n");

    if (gDebugLogLevel > 4) {
      LOCAL_DEBUG(
        "mimeDecrypt.jsm: done: decrypted data='" + this.decryptedData + "'\n"
      );
    }

    // ensure newline at the end of the stream
    if (!this.decryptedData.endsWith("\n")) {
      this.decryptedData += "\r\n";
    }

    try {
      this.extractEncryptedHeaders();
      //this.extractAutocryptGossip();
    } catch (ex) {
      console.debug(ex);
    }

    let i = this.decryptedData.search(/\n\r?\n/);
    if (i > 0) {
      var hdr = this.decryptedData.substr(0, i).split(/\r?\n/);
      for (let j = 0; j < hdr.length; j++) {
        if (hdr[j].search(/^\s*content-type:\s+text\/(plain|html)/i) >= 0) {
          LOCAL_DEBUG(
            "mimeDecrypt.jsm: done: adding multipart/mixed around " +
              hdr[j] +
              "\n"
          );

          this.addWrapperToDecryptedResult();
          break;
        }
      }
    }

    this.exitCode = exitCode;
  },

  addWrapperToDecryptedResult() {
    if (!this.isUrlEnigmailConvert()) {
      let wrapper = EnigmailMime.createBoundary();

      this.decryptedData =
        'Content-Type: multipart/mixed; boundary="' +
        wrapper +
        '"\r\n' +
        "Content-Disposition: inline\r\n\r\n" +
        "--" +
        wrapper +
        "\r\n" +
        this.decryptedData +
        "\r\n" +
        "--" +
        wrapper +
        "--\r\n";
    }
  },

  extractContentType(data) {
    let i = data.search(/\n\r?\n/);
    if (i <= 0) {
      return null;
    }

    let headers = Cc["@mozilla.org/messenger/mimeheaders;1"].createInstance(
      Ci.nsIMimeHeaders
    );
    headers.initialize(data.substr(0, i));
    return headers.extractHeader("content-type", false);
  },

  // return data to libMime
  returnData(data) {
    EnigmailLog.DEBUG(
      "mimeDecrypt.jsm: returnData: " + data.length + " bytes\n"
    );

    let proto = null;
    let ct = this.extractContentType(data);
    if (ct && ct.search(/multipart\/signed/i) >= 0) {
      proto = EnigmailMime.getProtocol(ct);
    }

    if (
      proto &&
      proto.search(/application\/(pgp|pkcs7|x-pkcs7)-signature/i) >= 0
    ) {
      try {
        EnigmailLog.DEBUG(
          "mimeDecrypt.jsm: returnData: using direct verification\n"
        );
        this.mimeSvc.contentType = ct;
        if ("mimePart" in this.mimeSvc) {
          this.mimeSvc.mimePart = this.mimeSvc.mimePart + ".1";
        }
        let veri = EnigmailVerify.newVerifier(proto);
        veri.onStartRequest(this.mimeSvc, this.uri);
        veri.onTextData(data);
        veri.onStopRequest(null, 0);
      } catch (ex) {
        console.debug(ex);
        EnigmailLog.ERROR(
          "mimeDecrypt.jsm: returnData(): mimeSvc.onDataAvailable failed:\n" +
            ex.toString()
        );
      }
    } else {
      try {
        this.mimeSvc.outputDecryptedData(data, data.length);
      } catch (ex) {
        console.debug(ex);
        EnigmailLog.ERROR(
          "mimeDecrypt.jsm: returnData(): cannot send decrypted data to MIME processing:\n" +
            ex.toString()
        );
      }
    }
  },

  handleManualDecrypt() {
    try {
      let headerSink = EnigmailSingletons.messageReader;

      if (headerSink && this.uri && !this.backgroundJob) {
        headerSink.updateSecurityStatus(
          this.msgUriSpec,
          EnigmailConstants.POSSIBLE_PGPMIME,
          0,
          0,
          "",
          "",
          "",
          l10n.formatValueSync("possibly-pgp-mime"),
          "",
          this.uri,
          null,
          ""
        );
      }
    } catch (ex) {
      console.debug(ex);
    }

    return 0;
  },

  updateHeadersInMsgDb() {
    if (this.mimePartNumber !== "1") {
      return;
    }
    if (!this.uri) {
      return;
    }

    if (this.decryptedHeaders && "subject" in this.decryptedHeaders) {
      try {
        let msgDbHdr = this.uri.QueryInterface(Ci.nsIMsgMessageUrl)
          .messageHeader;
        msgDbHdr.subject = EnigmailData.convertFromUnicode(
          this.decryptedHeaders.subject,
          "utf-8"
        );
      } catch (x) {
        console.debug(x);
      }
    }
  },

  extractEncryptedHeaders() {
    let r = EnigmailMime.extractProtectedHeaders(this.decryptedData);
    if (!r) {
      return;
    }

    this.decryptedHeaders = r.newHeaders;
    if (r.startPos >= 0 && r.endPos > r.startPos) {
      this.decryptedData =
        this.decryptedData.substr(0, r.startPos) +
        this.decryptedData.substr(r.endPos);
    }
  },

  /*
  async extractAutocryptGossip() {
    let m1 = this.decryptedData.search(/^--/m);
    let m2 = this.decryptedData.search(/\r?\n\r?\n/);
    let m = Math.max(m1, m2);

    let hdr = Cc["@mozilla.org/messenger/mimeheaders;1"].createInstance(
      Ci.nsIMimeHeaders
    );
    hdr.initialize(this.decryptedData.substr(0, m));

    let gossip = hdr.getHeader("autocrypt-gossip") || [];
    EnigmailLog.DEBUG(
      `mimeDecrypt.jsm: extractAutocryptGossip: found ${gossip.length} headers\n`
    );

    let msgDate = null;
    try {
      msgDate = this.uri.QueryInterface(Ci.nsIMsgMessageUrl).messageHeader
        .dateInSeconds;
    } catch (x) {
      console.debug(x);
    }

    for (let i in gossip) {
      let addr = EnigmailMime.getParameter(gossip[i], "addr");
      try {
        let r = await EnigmailAutocrypt.processAutocryptHeader(
          addr,
          [gossip[i].replace(/ /g, "")],
          msgDate,
          true,
          true
        );
        EnigmailLog.DEBUG(`mimeDecrypt.jsm: extractAutocryptGossip: r=${r}\n`);
      } catch (x) {
        console.debug(x);
        EnigmailLog.DEBUG(
          `mimeDecrypt.jsm: extractAutocryptGossip: Error: ${x}\n`
        );
      }
    }
  },
  */
};

////////////////////////////////////////////////////////////////////
// General-purpose functions, not exported

function LOCAL_DEBUG(str) {
  if (gDebugLogLevel) {
    EnigmailLog.DEBUG(str);
  }
}
