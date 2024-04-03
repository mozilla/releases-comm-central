/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Module for handling PGP/MIME signed messages.
 */

import { EnigmailConstants } from "chrome://openpgp/content/modules/constants.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  EnigmailCore: "chrome://openpgp/content/modules/core.sys.mjs",
  EnigmailCryptoAPI: "chrome://openpgp/content/modules/cryptoAPI.sys.mjs",
  EnigmailData: "chrome://openpgp/content/modules/data.sys.mjs",
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.sys.mjs",
  EnigmailMime: "chrome://openpgp/content/modules/mime.sys.mjs",
  EnigmailSingletons: "chrome://openpgp/content/modules/singletons.sys.mjs",
  EnigmailURIs: "chrome://openpgp/content/modules/uris.sys.mjs",
});
ChromeUtils.defineLazyGetter(lazy, "log", () => {
  return console.createInstance({
    prefix: "openpgp",
    maxLogLevel: "Warn",
    maxLogLevelPref: "openpgp.loglevel",
  });
});

export var EnigmailVerify = {
  _initialized: false,
  lastMsgUri: null,

  currentCtHandler: EnigmailConstants.MIME_HANDLER_UNDEF,

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
  },

  setLastMsgUri(msgUriSpec) {
    this.lastMsgUri = msgUriSpec;
  },

  newVerifier(protocol) {
    const v = new MimeVerify(protocol);
    return v;
  },

  pgpMimeFactory: {
    classID: Components.ID("{4f4400a8-9bcc-4b9d-9d53-d2437b377e29}"),
    createInstance(iid) {
      return Cc[
        "@mozilla.org/mimecth;1?type=multipart/encrypted"
      ].createInstance(iid);
    },
  },

  /**
   * Sets the PGPMime content type handler as the registered handler.
   */
  registerPGPMimeHandler() {
    if (this.currentCtHandler == EnigmailConstants.MIME_HANDLER_PGPMIME) {
      return;
    }

    const reg = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
    reg.registerFactory(
      this.pgpMimeFactory.classID,
      "PGP/MIME verification",
      "@mozilla.org/mimecth;1?type=multipart/signed",
      this.pgpMimeFactory
    );

    this.currentCtHandler = EnigmailConstants.MIME_HANDLER_PGPMIME;
  },

  /**
   * Clears the PGPMime content type handler registration. If no factory is
   * registered, S/MIME works.
   */
  unregisterPGPMimeHandler() {
    const reg = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
    if (this.currentCtHandler == EnigmailConstants.MIME_HANDLER_PGPMIME) {
      reg.unregisterFactory(this.pgpMimeFactory.classID, this.pgpMimeFactory);
    }

    this.currentCtHandler = EnigmailConstants.MIME_HANDLER_SMIME;
  },
};

/**
 * MimeVerify constructor.
 * @param {?string} protocol - Type, like application/pgp-signature.
 */
function MimeVerify(protocol) {
  this.protocol = protocol || "application/pgp-signature";
  this.verifyEmbedded = false;
  this.partiallySigned = false;
  this.exitCode = null;
  this.inStream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
    Ci.nsIScriptableInputStream
  );
}

/**
 * MimeVerify implementation.
 * Used to verify the signature of PGP/MIME signed messages.
 * @implements {nsIStreamListener}
 */
MimeVerify.prototype = {
  dataCount: 0,
  foundMsg: false,
  startMsgStr: "",
  window: null,
  msgUriSpec: null,
  statusDisplayed: false,
  inStream: null,
  sigFile: null,
  sigData: "",
  mimePartNumber: "",

  QueryInterface: ChromeUtils.generateQI(["nsIStreamListener"]),

  parseContentType() {
    let contentTypeLine = this.mimeSvc.contentType;

    // Eat up CRLF's.
    contentTypeLine = contentTypeLine.replace(/[\r\n]/g, "");
    lazy.log.debug(`Parsed contentTypeLine: ${contentTypeLine}`);

    const protoRx = RegExp(
      "protocol\\s*=\\s*[\\'\\\"]" + this.protocol + "[\\\"\\']",
      "i"
    );

    if (
      contentTypeLine.search(/multipart\/signed/i) >= 0 &&
      contentTypeLine.search(protoRx) > 0
    ) {
      this.foundMsg = true;
      const hdr = lazy.EnigmailFuncs.getHeaderData(contentTypeLine);
      hdr.boundary = hdr.boundary || "";
      hdr.micalg = hdr.micalg || "";
      lazy.log.debug(`Found signed MIME message; micalg=${hdr.micalg}`);
      this.boundary = hdr.boundary.replace(/^(['"])(.*)(\1)$/, "$2");
    }
  },

  /** @param {nsIRequest} request */
  onStartRequest(request) {
    this.mimeSvc = request.QueryInterface(Ci.nsIPgpMimeProxy);
    this.msgUriSpec = EnigmailVerify.lastMsgUri;
    this.mimePartNumber = this.mimeSvc.mimePart;
    this.uri = this.mimeSvc.messageURI;

    this.dataCount = 0;
    this.foundMsg = false;
    this.backgroundJob = false;
    this.startMsgStr = "";
    this.boundary = "";
    this.proc = null;
    this.closePipe = false;
    this.pipe = null;
    this.readMode = 0;
    this.keepData = "";
    this.last80Chars = "";
    this.signedData = "";
    this.statusStr = "";
    this.returnStatus = null;
    this.statusDisplayed = false;
    this.protectedHeaders = null;
    this.parseContentType();
  },

  /**
   * @param {nsIRequest} req - Source of the data.
   * @param {nsIInputStream} stream
   * @param {integer} offset - Number of bytes that were sent in previous
   *   onDataAvailable calls for this request. In other words, the sum of all
   *   previous count parameters.
   * @param {integer} count - Nmber of bytes available in the stream.
   */
  onDataAvailable(req, stream, offset, count) {
    if (count > 0) {
      this.inStream.init(stream);
      const data = this.inStream.read(count);
      this.onTextData(data);
    }
  },

  /** @param {string} data */
  onTextData(data) {
    this.dataCount += data.length;

    this.keepData += data;
    if (this.readMode === 0) {
      // header data
      let i = this.findNextMimePart();
      if (i >= 0) {
        i += 2 + this.boundary.length;
        if (this.keepData[i] == "\n") {
          ++i;
        } else if (this.keepData[i] == "\r") {
          ++i;
          if (this.keepData[i] == "\n") {
            ++i;
          }
        }

        this.keepData = this.keepData.substr(i);
        data = this.keepData;
        this.readMode = 1;
      } else {
        this.keepData = data.substr(-this.boundary.length - 3);
      }
    }

    if (this.readMode === 1) {
      // "real data"
      if (data.includes("-")) {
        // only check current line for speed reasons
        let i = this.findNextMimePart();
        if (i >= 0) {
          // end of "read data found"
          if (this.keepData[i - 2] == "\r" && this.keepData[i - 1] == "\n") {
            --i;
          }

          this.signedData = this.keepData.substr(0, i - 1);
          this.keepData = this.keepData.substr(i);
          this.readMode = 2;
        }
      } else {
        return;
      }
    }

    if (this.readMode === 2) {
      let i = this.keepData.indexOf("--" + this.boundary + "--");
      if (i >= 0) {
        // ensure that we keep everything until we got the "end" boundary
        if (this.keepData[i - 2] == "\r" && this.keepData[i - 1] == "\n") {
          --i;
        }
        this.keepData = this.keepData.substr(0, i - 1);
        this.readMode = 3;
      }
    }

    if (this.readMode === 3) {
      // signature data
      if (this.protocol === "application/pgp-signature") {
        const xferEnc = this.getContentTransferEncoding();
        if (xferEnc.search(/base64/i) >= 0) {
          const { start, end } = this.getBodyPart();
          this.keepData =
            lazy.EnigmailData.decodeBase64(
              this.keepData.substring(start, end)
            ) + "\n";
        } else if (xferEnc.search(/quoted-printable/i) >= 0) {
          const { start, end } = this.getBodyPart();
          const qp = this.keepData.substring(start, end);
          this.keepData = lazy.EnigmailData.decodeQuotedPrintable(qp) + "\n";
        }

        // extract signature data
        const s = Math.max(this.keepData.search(/^-----BEGIN PGP /m), 0);
        const e = Math.max(
          this.keepData.search(/^-----END PGP /m),
          this.keepData.length - 30
        );
        this.sigData = this.keepData.substring(s, e + 30);
      } else {
        this.sigData = "";
      }

      this.keepData = "";
      this.readMode = 4; // ignore any further data
    }
  },

  /**
   * @returns {object} body
   * @returns {integer} body.start
   * @returns {integer} body.end
   */
  getBodyPart() {
    let start = this.keepData.search(/(\n\n|\r\n\r\n)/);
    if (start < 0) {
      start = 0;
    }
    let end = this.keepData.indexOf("--" + this.boundary + "--") - 1;
    if (end < 0) {
      end = this.keepData.length;
    }

    return {
      start,
      end,
    };
  },

  /**
   * Determine content-transfer-encoding of mime part, assuming that whole
   * message is in this.keepData.
   * @returns {string} the content-transfer-encoding.
   */
  getContentTransferEncoding() {
    let enc = "7bit";
    const m = this.keepData.match(/^(content-transfer-encoding:)(.*)$/im);
    if (m && m.length > 2) {
      enc = m[2].trim().toLowerCase();
    }

    return enc;
  },

  /**
   * @returns {integer} the index of next part (or -1 if not found).
   */
  findNextMimePart() {
    let startOk = false;
    let endOk = false;

    const i = this.keepData.indexOf("--" + this.boundary);
    if (i === 0) {
      startOk = true;
    }
    if (i > 0) {
      if (this.keepData[i - 1] == "\r" || this.keepData[i - 1] == "\n") {
        startOk = true;
      }
    }

    if (!startOk) {
      return -1;
    }

    if (i + this.boundary.length + 2 < this.keepData.length) {
      if (
        this.keepData[i + this.boundary.length + 2] == "\r" ||
        this.keepData[i + this.boundary.length + 2] == "\n" ||
        this.keepData.substr(i + this.boundary.length + 2, 2) == "--"
      ) {
        endOk = true;
      }
    }
    // else
    // endOk = true;

    if (i >= 0 && startOk && endOk) {
      return i;
    }
    return -1;
  },

  /**
   * @param {string} queryMimePartNumber - MIME part number, e.g. "1", "1.1.1".
   * @param {string} loadedUriSpec - The URI spec loaded.
   * @returns {boolean} true if the part is an allow siganture part.
   */
  isAllowedSigPart(queryMimePartNumber, loadedUriSpec) {
    // allowed are:
    // - the top part 1
    // - the child 1.1 if 1 is an encryption layer
    // - a part that is the one we are loading
    // - a part that is the first child of the one we are loading,
    //   and the child we are loading is an encryption layer

    if (queryMimePartNumber.length === 0) {
      return false;
    }

    if (queryMimePartNumber === "1") {
      return true;
    }

    if (queryMimePartNumber == "1.1" || queryMimePartNumber == "1.1.1") {
      if (!this.uri) {
        // We aren't loading in message displaying, but some other
        // context, could be e.g. forwarding.
        return false;
      }

      // If we are processing "1.1", it means we're the child of the
      // top mime part. Don't process the signature unless the top
      // level mime part is an encryption layer.
      // If we are processing "1.1.1", then potentially the top level
      // mime part was a signature and has been ignored, and "1.1"
      // might be an encrypted part that was allowed.

      const currMsg = lazy.EnigmailURIs.msgIdentificationFromUrl(this.uri);
      const parentToCheck = queryMimePartNumber == "1.1.1" ? "1.1" : "1";
      if (
        lazy.EnigmailSingletons.isLastDecryptedMessagePart(
          currMsg.folder,
          currMsg.msgNum,
          parentToCheck
        )
      ) {
        return true;
      }
    }

    if (!loadedUriSpec) {
      return false;
    }

    // is the message a subpart of a complete attachment?
    const msgPart = lazy.EnigmailMime.getMimePartNumber(loadedUriSpec);

    if (msgPart.length > 0) {
      if (queryMimePartNumber === msgPart + ".1") {
        return true;
      }

      const currMsg = lazy.EnigmailURIs.msgIdentificationFromUrl(this.uri);
      if (
        queryMimePartNumber === msgPart + ".1.1" &&
        lazy.EnigmailSingletons.isLastDecryptedMessagePart(
          currMsg.folder,
          currMsg.msgNum,
          msgPart + ".1"
        )
      ) {
        return true;
      }
    }

    return false;
  },

  /** @param {nsIRequest} request */
  onStopRequest(request) {
    const mimeSvc = request.QueryInterface(Ci.nsIPgpMimeProxy);
    this.msgUriSpec = EnigmailVerify.lastMsgUri;

    this.backgroundJob = false;

    // don't try to verify if no message found
    // if (this.verifyEmbedded && (!this.foundMsg)) return; // TODO - check

    const href = Services.wm.getMostRecentWindow(null)?.document?.location.href;

    if (
      href == "about:blank" ||
      href == "chrome://messenger/content/viewSource.xhtml"
    ) {
      return;
    }

    if (this.readMode < 4) {
      // we got incomplete data; simply return what we got
      this.returnData(
        this.signedData.length > 0 ? this.signedData : this.keepData
      );

      return;
    }

    this.protectedHeaders = lazy.EnigmailMime.extractProtectedHeaders(
      this.signedData
    );
    this.returnData(this.signedData);

    if (!this.isAllowedSigPart(this.mimePartNumber, this.msgUriSpec)) {
      lazy.EnigmailSingletons.addUriWithNestedSignedPart(this.msgUriSpec);
      return;
    }

    if (this.uri) {
      // return if not decrypting currently displayed message (except if
      // printing, replying, etc)

      this.backgroundJob =
        this.uri.spec.search(/[&?]header=(print|quotebody)/) >= 0;

      try {
        if (
          this.uri.spec.search(/[&?]header=[a-zA-Z0-9]*$/) < 0 &&
          this.uri.spec.search(/[&?]part=[.0-9]+/) < 0 &&
          this.uri.spec.search(/[&?]examineEncryptedParts=true/) < 0
        ) {
          if (this.uri.spec.search(/[&?]header=filter&.*$/) > 0) {
            return;
          }

          const url = this.msgUriSpec
            ? lazy.EnigmailFuncs.getUrlFromUriSpec(this.msgUriSpec)
            : null;

          if (url) {
            const otherId = lazy.EnigmailURIs.msgIdentificationFromUrl(url);
            const thisId = lazy.EnigmailURIs.msgIdentificationFromUrl(this.uri);

            if (
              url.host !== this.uri.host ||
              otherId.folder !== thisId.folder ||
              otherId.msgNum !== thisId.msgNum
            ) {
              return;
            }
          }
        }
      } catch (ex) {
        lazy.log.error(`Processing ${this.msgUriSpec} FAILED.`, ex);
      }
    }

    if (this.protocol === "application/pgp-signature") {
      lazy.EnigmailCore.init();

      const options = { mimeSignatureData: this.sigData };
      if (mimeSvc.mailChannel) {
        const { headerNames, headerValues } = mimeSvc.mailChannel;
        let gotFromAddr, gotMsgDate;
        for (let i = 0; i < headerNames.length; i++) {
          if (!gotFromAddr && headerNames[i] == "From") {
            const fromAddr = lazy.EnigmailFuncs.stripEmail(headerValues[i]);
            // Ignore address if domain contains a comment (in brackets).
            if (!fromAddr.match(/[a-zA-Z0-9]@.*[\(\)]/)) {
              options.fromAddr = fromAddr;
            }
            gotFromAddr = true;
          } else if (!gotMsgDate && headerNames[i] == "Date") {
            options.msgDate = new Date(headerValues[i]);
            gotMsgDate = true;
          }
          if (gotFromAddr && gotMsgDate) {
            break;
          }
        }
      }

      const cApi = lazy.EnigmailCryptoAPI();

      // ensure all lines end with CRLF as specified in RFC 3156, section 5
      if (this.signedData.search(/[^\r]\n/) >= 0) {
        this.signedData = this.signedData
          .replace(/\r\n/g, "\n")
          .replace(/\n/g, "\r\n");
      }

      this.returnStatus = cApi.sync(cApi.verifyMime(this.signedData, options));

      if (!this.returnStatus) {
        this.exitCode = -1;
      } else {
        this.exitCode = this.returnStatus.exitCode;

        this.returnStatus.statusFlags |= EnigmailConstants.PGP_MIME_SIGNED;

        if (this.partiallySigned) {
          this.returnStatus.statusFlags |= EnigmailConstants.PARTIALLY_PGP;
        }

        const mimeSvc = request.QueryInterface(Ci.nsIPgpMimeProxy);
        this.displayStatus(mimeSvc.mailChannel?.openpgpSink);
      }
    }
  },

  /**
   * Return data to libmime.
   */
  returnData(data) {
    const m = data.match(/^(content-type: +)([\w/]+)/im);
    if (m && m.length >= 3) {
      const contentType = m[2];
      if (contentType.search(/^text/i) === 0) {
        // add multipart/mixed boundary to work around TB bug (empty forwarded message)
        const boundary = lazy.EnigmailMime.createBoundary();
        data =
          'Content-Type: multipart/mixed; boundary="' +
          boundary +
          '"\n' +
          "Content-Disposition: inline\n\n--" +
          boundary +
          "\n" +
          data +
          "\n--" +
          boundary +
          "--\n";
      }
    }

    this.mimeSvc.outputDecryptedData(data, data.length);
  },

  /**
   * @param {nsIMsgOpenPGPSink} sink
   */
  displayStatus(sink) {
    if (this.exitCode === null || this.statusDisplayed || this.backgroundJob) {
      return;
    }

    if (!sink) {
      return;
    }

    if (this.protectedHeaders) {
      sink.modifyMessageHeaders(
        this.uri.spec,
        JSON.stringify(
          Object.fromEntries(this.protectedHeaders._cachedHeaders)
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
          "packetDump" in this.returnStatus ? this.returnStatus.packetDump : "",
      }),
      this.mimePartNumber
    );

    this.statusDisplayed = true;
  },
};
