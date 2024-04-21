/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Module for handling PGP/MIME encrypted messages.
 */

import { EnigmailSingletons } from "chrome://openpgp/content/modules/singletons.sys.mjs";

import { MimeParser } from "resource:///modules/mimeParser.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  EnigmailConstants: "chrome://openpgp/content/modules/constants.sys.mjs",
  EnigmailCore: "chrome://openpgp/content/modules/core.sys.mjs",
  EnigmailCryptoAPI: "chrome://openpgp/content/modules/cryptoAPI.sys.mjs",
  EnigmailData: "chrome://openpgp/content/modules/data.sys.mjs",
  EnigmailDecryption: "chrome://openpgp/content/modules/decryption.sys.mjs",
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.sys.mjs",
  EnigmailMime: "chrome://openpgp/content/modules/mime.sys.mjs",
  EnigmailURIs: "chrome://openpgp/content/modules/uris.sys.mjs",
  EnigmailVerify: "chrome://openpgp/content/modules/mimeVerify.sys.mjs",
});
ChromeUtils.defineLazyGetter(lazy, "log", () => {
  return console.createInstance({
    prefix: "openpgp",
    maxLogLevel: "Warn",
    maxLogLevelPref: "openpgp.loglevel",
  });
});
ChromeUtils.defineLazyGetter(lazy, "l10n", () => {
  return new Localization(["messenger/openpgp/openpgp.ftl"], true);
});

const ENCODING_DEFAULT = 0;
const ENCODING_BASE64 = 1;
const ENCODING_QP = 2;

const LAST_MSG = EnigmailSingletons.lastDecryptedMessage;

export var EnigmailMimeDecrypt = {
  /**
   * Sreate a new instance of a PGP/MIME decryption handler.
   */
  newPgpMimeHandler() {
    return new MimeDecryptHandler();
  },

  /**
   * Wrap the decrypted output into a message/rfc822 attachment
   *
   * @param {string} decryptingMimePartNum - Requested MIME part number
   * @param {nsIURI} uri - nsIURI of the decrypted message.
   *
   * @returns {string} a text block containing the needed MIME headers for
   *   the MIME part.
   */
  pretendAttachment(decryptingMimePartNum, uri) {
    if (decryptingMimePartNum === "1" || !uri) {
      return "";
    }

    let msg = "";
    const mimePartNumber = lazy.EnigmailMime.getMimePartNumber(uri.spec);

    if (mimePartNumber === decryptingMimePartNum + ".1") {
      msg =
        'Content-Type: message/rfc822; name="attachment.eml"\r\n' +
        "Content-Transfer-Encoding: 7bit\r\n" +
        'Content-Disposition: attachment; filename="attachment.eml"\r\n\r\n';

      const dbHdr = uri.QueryInterface(Ci.nsIMsgMessageUrl).messageHeader;
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
    }
    return msg;
  },
};

////////////////////////////////////////////////////////////////////
// handler for PGP/MIME encrypted messages
// data is processed from libmime -> nsPgpMimeProxy

function MimeDecryptHandler() {
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
  this.msgUriSpec = null;
  this.returnStatus = null;
  this.proc = null;
  this.statusDisplayed = false;
  this.uri = null;
  this.backgroundJob = false;
  this.decryptedHeaders = null;
  this.mimePartNumber = "";
  this.allowNestedDecrypt = false;
  this.dataIsBase64 = null;
  this.base64Cache = "";
}

MimeDecryptHandler.prototype = {
  inStream: Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
    Ci.nsIScriptableInputStream
  ),

  onStartRequest(request) {
    lazy.EnigmailCore.init();

    this.initOk = true;
    const mimeSvc = request.QueryInterface(Ci.nsIPgpMimeProxy);
    this.mimePartNumber = mimeSvc.mimePart;
    this.allowNestedDecrypt = mimeSvc.allowNestedDecrypt;

    if (this.allowNestedDecrypt) {
      // We want to ignore signature status of the top level part "1".
      // Unfortunately, because of our streaming approach to process
      // MIME content, the parent MIME part was already processed,
      // and it could have already called into the header sink to set
      // the signature status. Or, an async job could be currently
      // running, and the call into the header sink could happen in
      // the near future.
      // That means, we must inform the header sink to forget status
      // information it might have already received for MIME part "1",
      // an in addition, remember that future information for "1" should
      // be ignored.

      mimeSvc.mailChannel?.smimeSink.ignoreStatusFrom("1");
      mimeSvc.mailChannel?.openpgpSink.ignoreStatusFrom("1");
    }

    this.uri = mimeSvc.messageURI;

    this.pipe = null;
    this.closePipe = false;
    this.exitCode = null;
    this.msgUriSpec = lazy.EnigmailVerify.lastMsgUri;

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
    this.decryptedHeaders = null;
    this.xferEncoding = ENCODING_DEFAULT;
    this.boundary = lazy.EnigmailMime.getBoundary(mimeSvc.contentType);

    const now = Date.now();
    const timeoutReached =
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
          data = data.replace(/;.*/, "").toLowerCase().trim();
          if (data.search(/base64/i) >= 0) {
            this.xferEncoding = ENCODING_BASE64;
          } else if (data.search(/quoted-printable/i) >= 0) {
            this.xferEncoding = ENCODING_QP;
          }
        }
        // else: PGP/MIME main part body
      } else if (this.xferEncoding == ENCODING_QP) {
        this.cacheData(lazy.EnigmailData.decodeQuotedPrintable(data));
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
          const lines = data.replace(/\r\n/g, "\n").split(/\n/);

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
   * Try to determine if data is base64 encoded.
   *
   * @param {string} str - String to test.
   * @returns {boolean} true if base64 encoded.
   */
  isBase64Encoding(str) {
    str = str.replace(/[\r\n]/, "");
    if (str.search(/^[A-Za-z0-9+/=]+$/) === 0) {
      const excess = str.length % 4;
      str = str.substring(0, str.length - excess);

      try {
        atob(str);
        // if the conversion succeeds, we have a base64 encoded message
        return true;
      } catch (ex) {
        // not a base64 encoded
      }
    }
    return false;
  },

  /**
   * Cache encrypted data.
   *
   * @param {string} str - The data to cache.
   */
  cacheData(str) {
    this.outQueue += str;
  },

  processBase64Message() {
    try {
      this.base64Cache = lazy.EnigmailData.decodeBase64(this.base64Cache);
    } catch (ex) {
      // if decoding failed, try non-encoded version
    }

    const lines = this.base64Cache.replace(/\r\n/g, "\n").split(/\n/);
    for (let i = 0; i < lines.length; i++) {
      this.processData(lines[i] + "\r\n");
    }
  },

  /**
   * Determine if we are reloading the same message as the previous one.
   *
   * @returns {boolean} true if we're reloading the same message.
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

    const currMsg = lazy.EnigmailURIs.msgIdentificationFromUrl(this.uri);

    if (
      LAST_MSG.lastMessageURI.folder === currMsg.folder &&
      LAST_MSG.lastMessageURI.msgNum === currMsg.msgNum
    ) {
      return true;
    }

    return false;
  },

  onStopRequest(request) {
    if (!this.initOk) {
      return;
    }

    if (this.dataIsBase64) {
      this.processBase64Message();
    }

    const mimeSvc = request.QueryInterface(Ci.nsIPgpMimeProxy);
    this.msgUriSpec = lazy.EnigmailVerify.lastMsgUri;

    const href = Services.wm.getMostRecentWindow(null)?.document?.location.href;

    if (
      href == "about:blank" ||
      href == "chrome://messenger/content/viewSource.xhtml"
    ) {
      return;
    }

    const url = {};
    const currMsg = lazy.EnigmailURIs.msgIdentificationFromUrl(this.uri);

    this.backgroundJob = false;

    if (this.uri) {
      // return if not decrypting currently displayed message (except if
      // printing, replying, etc)

      this.backgroundJob =
        this.uri.spec.search(/[&?]header=(print|quotebody)/) >= 0;

      try {
        if (this.msgUriSpec) {
          url.value = lazy.EnigmailFuncs.getUrlFromUriSpec(this.msgUriSpec);
        }

        if (
          this.uri.spec.search(/[&?]header=[^&]+/) > 0 &&
          this.uri.spec.search(/[&?]examineEncryptedParts=true/) < 0
        ) {
          if (
            this.uri.spec.search(/[&?]header=(filter|enigmailFilter)(&.*)?$/) >
            0
          ) {
            return;
          }
        }

        if (
          this.uri.spec.search(/[&?]header=[^&]+/) < 0 &&
          this.uri.spec.search(/[&?]part=[.0-9]+/) < 0 &&
          this.uri.spec.search(/[&?]examineEncryptedParts=true/) < 0
        ) {
          if (this.uri && url && url.value) {
            const fixedQueryRef = this.uri.pathQueryRef.replace(
              /&number=0$/,
              ""
            );
            if (
              url.value.host !== this.uri.host ||
              url.value.pathQueryRef !== fixedQueryRef
            ) {
              return;
            }
          }
        }
      } catch (ex) {
        lazy.log.warn(`Error processing ${this.msgUriSpec} FAILED.`, ex);
      }
    }

    const spec = this.uri ? this.uri.spec : null;
    if (
      !this.allowNestedDecrypt &&
      !lazy.EnigmailMime.isRegularMimeStructure(
        this.mimePartNumber,
        spec,
        false
      )
    ) {
      EnigmailSingletons.addUriWithNestedEncryptedPart(this.msgUriSpec);
      // ignore, do not display
      lazy.log.debug(
        `Found uri with nested encrypted part: ${this.msgUriSpec}`
      );
      return;
    }

    if (!this.isReloadingLastMessage()) {
      if (this.xferEncoding == ENCODING_BASE64) {
        this.outQueue = lazy.EnigmailData.decodeBase64(this.outQueue) + "\n";
      }

      lazy.EnigmailCore.init();

      // limit output to 100 times message size to avoid DoS attack
      const maxOutput = this.outQueue.length * 100;

      lazy.log.debug(`Starting decryption: ${this.msgUriSpec}`);
      const options = { maxOutputLength: maxOutput };
      if (mimeSvc.mailChannel) {
        const { headerNames, headerValues } = mimeSvc.mailChannel;
        for (var i = 0; i < headerNames.length; i++) {
          if (headerNames[i] == "From") {
            const fromAddr = lazy.EnigmailFuncs.stripEmail(headerValues[i]);
            // Ignore address if domain contains a comment (in brackets).
            if (!fromAddr.match(/[a-zA-Z0-9]@.*[\(\)]/)) {
              options.fromAddr = fromAddr;
            }
            break;
          }
        }
      }

      if (!options.fromAddr) {
        options.fromAddr = lazy.EnigmailDecryption.getFromAddr(
          Services.wm.getMostRecentWindow(null)
        );
      }

      // The processing of a contained signed message must be able to
      // check that this parent object is encrypted. We set the msg ID
      // early, despite the full results not yet being available.
      LAST_MSG.lastMessageURI = currMsg;
      LAST_MSG.mimePartNumber = this.mimePartNumber;

      const cApi = lazy.EnigmailCryptoAPI();
      this.returnStatus = cApi.sync(cApi.decryptMime(this.outQueue, options));

      if (!this.returnStatus) {
        this.returnStatus = {
          decryptedData: "",
          exitCode: -1,
          statusFlags: lazy.EnigmailConstants.DECRYPTION_FAILED,
        };
      }

      if (
        this.returnStatus.statusFlags & lazy.EnigmailConstants.DECRYPTION_OKAY
      ) {
        this.returnStatus.statusFlags |=
          lazy.EnigmailConstants.PGP_MIME_ENCRYPTED;
      }

      if (this.returnStatus.exitCode) {
        // Failure
        if (this.returnStatus.decryptedData) {
          // However, we got decrypted data.
          // Did we get any verification failure flags?
          // If yes, then conclude only verification failed.
          if (
            this.returnStatus.statusFlags &
            (lazy.EnigmailConstants.BAD_SIGNATURE |
              lazy.EnigmailConstants.UNCERTAIN_SIGNATURE |
              lazy.EnigmailConstants.EXPIRED_SIGNATURE |
              lazy.EnigmailConstants.EXPIRED_KEY_SIGNATURE)
          ) {
            lazy.log.debug(
              `Decrypting MIME succeeded, but verification failed.`
            );
            this.returnStatus.statusFlags |=
              lazy.EnigmailConstants.DECRYPTION_OKAY;
          } else {
            lazy.log.debug(`Decrypting MIME failed.`);
            this.returnStatus.statusFlags |=
              lazy.EnigmailConstants.DECRYPTION_FAILED;
          }
        } else {
          lazy.log.debug("Decrypting MIME failure. Got no data.");
          this.returnStatus.statusFlags |=
            lazy.EnigmailConstants.DECRYPTION_FAILED;
        }
      }

      this.decryptedData = this.returnStatus.decryptedData;
      this.handleResult(this.returnStatus.exitCode);

      const decError =
        this.returnStatus.statusFlags &
        lazy.EnigmailConstants.DECRYPTION_FAILED;

      // Don't return decrypted data if decryption failed (because it's likely
      // an MDC error), unless we are called for permanent decryption.
      if (decError) {
        this.decryptedData = "";
      }

      this.displayStatus(mimeSvc.mailChannel?.openpgpSink);

      // HACK: remove filename from 1st HTML and plaintext parts to make TB
      // display message without attachment.
      this.decryptedData = this.decryptedData.replace(
        /^Content-Disposition: inline; filename="msg.txt"/m,
        "Content-Disposition: inline"
      );
      this.decryptedData = this.decryptedData.replace(
        /^Content-Disposition: inline; filename="msg.html"/m,
        "Content-Disposition: inline"
      );

      const prefix = EnigmailMimeDecrypt.pretendAttachment(
        this.mimePartNumber,
        this.uri
      );
      this.returnData(mimeSvc, prefix + this.decryptedData);

      // Don't remember the last message if it contains an embedded PGP/MIME
      // message to avoid ending up in a loop.
      if (
        this.mimePartNumber === "1" &&
        this.decryptedData.search(
          /^Content-Type:[\t ]+multipart\/encrypted/im
        ) < 0 &&
        !decError
      ) {
        LAST_MSG.lastMessageData = this.decryptedData;
        LAST_MSG.lastStatus = this.returnStatus;
        LAST_MSG.lastStatus.decryptedHeaders = this.decryptedHeaders;
      } else {
        LAST_MSG.lastMessageURI = null;
        LAST_MSG.lastMessageData = "";
      }

      this.decryptedData = "";
      this.proc = null;
    } else {
      this.returnStatus = LAST_MSG.lastStatus;
      this.decryptedHeaders = LAST_MSG.lastStatus.decryptedHeaders;
      this.mimePartNumber = LAST_MSG.mimePartNumber;
      this.exitCode = 0;
      this.displayStatus(mimeSvc.mailChannel?.openpgpSink);
      this.returnData(mimeSvc, LAST_MSG.lastMessageData);
    }
  },

  /**
   * Display decryption status.
   *
   * @param {nsIMsgOpenPGPSink} sink - The sink to use.
   */
  displayStatus(sink) {
    if (this.exitCode === null || this.statusDisplayed) {
      lazy.log.debug("No decryption status to display.");
      return;
    }

    try {
      lazy.log.debug(`Will display status for ${this.uri?.spec}`);
      if (sink && this.uri && !this.backgroundJob) {
        if (this.decryptedHeaders) {
          sink.modifyMessageHeaders(
            this.uri.spec,
            JSON.stringify(
              Object.fromEntries(this.decryptedHeaders._cachedHeaders)
            ),
            this.mimePartNumber
          );
        }

        sink.updateSecurityStatus(
          this.exitCode,
          this.returnStatus.statusFlags,
          this.returnStatus.extStatusFlags,
          this.returnStatus.keyId,
          this.returnStatus.userId,
          this.returnStatus.sigDetails,
          this.returnStatus.errorMsg,
          this.returnStatus.blockSeparation,
          this.uri.spec,
          JSON.stringify({
            encryptedTo: this.returnStatus.encToDetails,
            packetDump:
              "packetDump" in this.returnStatus
                ? this.returnStatus.packetDump
                : "",
          }),
          this.mimePartNumber
        );
      } else if (sink) {
        // not attachment...
        this.updateHeadersInMsgDb();
      }
      this.statusDisplayed = true;
    } catch (ex) {
      lazy.log.error("Displaying status FAILED.", ex);
    }
  },

  handleResult(exitCode) {
    // ensure newline at the end of the stream
    if (!this.decryptedData.endsWith("\n")) {
      this.decryptedData += "\r\n";
    }

    this.extractEncryptedHeaders();
    this.extractAutocryptGossip();

    let mightNeedWrapper = true;

    // It's unclear which scenario this check is supposed to fix.
    // Based on a comment in mimeVerify (which seems code seems to be
    // derived from), it might be intended to fix forwarding of empty
    // messages. Not sure this is still necessary. We should check if
    // this code can be removed.
    const i = this.decryptedData.search(/\n\r?\n/);
    // It's unknown why this test checks for > instead of >=
    if (i > 0) {
      var hdr = this.decryptedData.substr(0, i).split(/\r?\n/);
      for (let j = 0; j < hdr.length; j++) {
        if (hdr[j].search(/^\s*content-type:\s+text\/(plain|html)/i) >= 0) {
          lazy.log.debug(`Adding multipart/mixed around ${hdr[j]}`);
          this.addWrapperToDecryptedResult();
          mightNeedWrapper = false;
          break;
        }
      }
    }

    // If there is no Content-Type header prior to the first double
    // newline sequence (which is interpreted as the separator between
    // a header section and the body), then assume the first section is
    // actually NOT an email header, but rather part of the message body.
    // To ensure all data is shown to the user, to ensure the initial
    // paragraph isn't hidden, we wrap a text/plain content-type header
    // around the result data.
    if (mightNeedWrapper) {
      const headerBoundaryPosition = this.decryptedData.search(/\n\r?\n/);
      if (
        headerBoundaryPosition >= 0 &&
        !/^Content-Type:/im.test(
          this.decryptedData.substr(0, headerBoundaryPosition)
        )
      ) {
        this.decryptedData =
          "Content-Type: text/plain; charset=utf-8\r\n\r\n" +
          this.decryptedData;
      }
    }

    this.exitCode = exitCode;
  },

  addWrapperToDecryptedResult() {
    const wrapper = lazy.EnigmailMime.createBoundary();

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
  },

  extractContentType(data) {
    const i = data.search(/\n\r?\n/);
    if (i <= 0) {
      return null;
    }

    const headers = Cc["@mozilla.org/messenger/mimeheaders;1"].createInstance(
      Ci.nsIMimeHeaders
    );
    headers.initialize(data.substr(0, i));
    return headers.extractHeader("content-type", false);
  },

  /**
   * Return (send) data to libmime.
   */
  returnData(mimeSvc, data) {
    let proto = null;
    const ct = this.extractContentType(data);
    if (ct && ct.search(/multipart\/signed/i) >= 0) {
      proto = lazy.EnigmailMime.getProtocol(ct);
    }

    if (
      proto &&
      proto.search(/application\/(pgp|pkcs7|x-pkcs7)-signature/i) >= 0
    ) {
      try {
        // Using direct verification.
        mimeSvc.contentType = ct;
        mimeSvc.mimePart = mimeSvc.mimePart + ".1";
        const veri = lazy.EnigmailVerify.newVerifier(proto);
        veri.onStartRequest(mimeSvc, this.uri);
        veri.onTextData(data);
        veri.onStopRequest(mimeSvc, 0);
      } catch (ex) {
        lazy.log.error("Return data FAILED.", ex);
      }
    } else {
      try {
        mimeSvc.outputDecryptedData(data, data.length);
      } catch (ex) {
        lazy.log.error("Output decrypted data FAILED.", ex);
      }
    }
  },

  /**
   * @param {nsIMsgOpenPGPSink} sink - The sink to use.
   */
  handleManualDecrypt(sink) {
    if (sink && this.uri && !this.backgroundJob) {
      sink.updateSecurityStatus(
        lazy.EnigmailConstants.POSSIBLE_PGPMIME,
        0,
        0,
        "",
        "",
        "",
        lazy.l10n.formatValueSync("possibly-pgp-mime"),
        "",
        this.uri.spec,
        null,
        ""
      );
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

    if (this.decryptedHeaders?.has("subject")) {
      try {
        const msgDbHdr = this.uri.QueryInterface(
          Ci.nsIMsgMessageUrl
        ).messageHeader;
        msgDbHdr.subject = this.decryptedHeaders.get("subject");
      } catch (e) {
        lazy.log.error(`Updating subject FAILED for ${this.uri.spec}`);
      }
    }
  },

  extractEncryptedHeaders() {
    this.decryptedHeaders = lazy.EnigmailMime.extractProtectedHeaders(
      this.decryptedData
    );
  },

  /**
   * Process the Autocrypt-Gossip header lines.
   */
  async extractAutocryptGossip() {
    const gossipHeaders =
      // TODO: already available as this.decryptedHeaders.get("autocrypt-gossip")
      MimeParser.extractHeaders(this.decryptedData).get("autocrypt-gossip") ||
      [];
    for (const h of gossipHeaders) {
      try {
        const keyData = atob(
          MimeParser.getParameter(h.replace(/ /g, ""), "keydata")
        );
        if (keyData) {
          LAST_MSG.gossip.push(keyData);
        }
      } catch {}
    }
  },
};
