/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = ["EnigmailVerify"];

/**
 *  Module for handling PGP/MIME signed messages implemented as JS module.
 */

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const lazy = {};

const { EnigmailConstants } = ChromeUtils.import(
  "chrome://openpgp/content/modules/constants.jsm"
);

XPCOMUtils.defineLazyModuleGetters(lazy, {
  EnigmailCore: "chrome://openpgp/content/modules/core.jsm",
  EnigmailCryptoAPI: "chrome://openpgp/content/modules/cryptoAPI.jsm",
  EnigmailData: "chrome://openpgp/content/modules/data.jsm",
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  EnigmailMime: "chrome://openpgp/content/modules/mime.jsm",
  EnigmailSingletons: "chrome://openpgp/content/modules/singletons.jsm",
  EnigmailURIs: "chrome://openpgp/content/modules/uris.jsm",
});

const PGPMIME_PROTO = "application/pgp-signature";

var gDebugLog = false;

// MimeVerify Constructor
function MimeVerify(protocol) {
  if (!protocol) {
    protocol = PGPMIME_PROTO;
  }

  this.protocol = protocol;
  this.verifyEmbedded = false;
  this.partiallySigned = false;
  this.exitCode = null;
  this.inStream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
    Ci.nsIScriptableInputStream
  );
}

var EnigmailVerify = {
  _initialized: false,
  lastMsgUri: null,
  manualMsgUri: null,

  currentCtHandler: EnigmailConstants.MIME_HANDLER_UNDEF,

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    const nspr_log_modules = Services.env.get("NSPR_LOG_MODULES");
    const matches = nspr_log_modules.match(/mimeVerify:(\d+)/);

    if (matches && matches.length > 1) {
      if (matches[1] > 2) {
        gDebugLog = true;
      }
    }
  },

  setLastMsgUri(msgUriSpec) {
    LOCAL_DEBUG("mimeVerify.jsm: setLastMsgUri: " + msgUriSpec + "\n");
    this.lastMsgUri = msgUriSpec;
  },

  newVerifier(protocol) {
    lazy.EnigmailLog.DEBUG(
      "mimeVerify.jsm: newVerifier: " + (protocol || "null") + "\n"
    );

    const v = new MimeVerify(protocol);
    return v;
  },

  setManualUri(msgUriSpec) {
    LOCAL_DEBUG("mimeVerify.jsm: setManualUri: " + msgUriSpec + "\n");
    this.manualMsgUri = msgUriSpec;
  },

  getManualUri() {
    lazy.EnigmailLog.DEBUG("mimeVerify.jsm: getManualUri\n");
    return this.manualMsgUri;
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
    lazy.EnigmailLog.DEBUG("mimeVerify.jsm: registerPGPMimeHandler\n");

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
    lazy.EnigmailLog.DEBUG("mimeVerify.jsm: unregisterPGPMimeHandler\n");

    const reg = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
    if (this.currentCtHandler == EnigmailConstants.MIME_HANDLER_PGPMIME) {
      reg.unregisterFactory(this.pgpMimeFactory.classID, this.pgpMimeFactory);
    }

    this.currentCtHandler = EnigmailConstants.MIME_HANDLER_SMIME;
  },
};

// MimeVerify implementation
// verify the signature of PGP/MIME signed messages
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
    lazy.EnigmailLog.DEBUG(
      "mimeVerify.jsm: parseContentType: " + contentTypeLine + "\n"
    );

    const protoRx = RegExp(
      "protocol\\s*=\\s*[\\'\\\"]" + this.protocol + "[\\\"\\']",
      "i"
    );

    if (
      contentTypeLine.search(/multipart\/signed/i) >= 0 &&
      contentTypeLine.search(protoRx) > 0
    ) {
      lazy.EnigmailLog.DEBUG(
        "mimeVerify.jsm: parseContentType: found MIME signed message\n"
      );
      this.foundMsg = true;
      const hdr = lazy.EnigmailFuncs.getHeaderData(contentTypeLine);
      hdr.boundary = hdr.boundary || "";
      hdr.micalg = hdr.micalg || "";
      this.boundary = hdr.boundary.replace(/^(['"])(.*)(\1)$/, "$2");
    }
  },

  onStartRequest(request, uri) {
    lazy.EnigmailLog.DEBUG("mimeVerify.jsm: onStartRequest\n"); // always log this one

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

  onDataAvailable(req, stream, offset, count) {
    LOCAL_DEBUG("mimeVerify.jsm: onDataAvailable: " + count + "\n");
    if (count > 0) {
      this.inStream.init(stream);
      var data = this.inStream.read(count);
      this.onTextData(data);
    }
  },

  onTextData(data) {
    LOCAL_DEBUG("mimeVerify.jsm: onTextData\n");

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
      if (this.protocol === PGPMIME_PROTO) {
        const xferEnc = this.getContentTransferEncoding();
        if (xferEnc.search(/base64/i) >= 0) {
          const bound = this.getBodyPart();
          this.keepData =
            lazy.EnigmailData.decodeBase64(
              this.keepData.substring(bound.start, bound.end)
            ) + "\n";
        } else if (xferEnc.search(/quoted-printable/i) >= 0) {
          const bound = this.getBodyPart();
          const qp = this.keepData.substring(bound.start, bound.end);
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

  // determine content-transfer encoding of mime part, assuming that whole
  // message is in this.keepData
  getContentTransferEncoding() {
    let enc = "7bit";
    const m = this.keepData.match(/^(content-transfer-encoding:)(.*)$/im);
    if (m && m.length > 2) {
      enc = m[2].trim().toLowerCase();
    }

    return enc;
  },

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

  onStopRequest(request) {
    lazy.EnigmailLog.DEBUG("mimeVerify.jsm: onStopRequest\n");

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
      return;
    }

    if (this.uri) {
      // return if not decrypting currently displayed message (except if
      // printing, replying, etc)

      this.backgroundJob =
        this.uri.spec.search(/[&?]header=(print|quotebody)/) >= 0;

      try {
        if (!Services.prefs.getBoolPref("temp.openpgp.autoDecrypt")) {
          // "decrypt manually" mode
          let manUrl = {};

          if (EnigmailVerify.getManualUri()) {
            manUrl = lazy.EnigmailFuncs.getUrlFromUriSpec(
              EnigmailVerify.getManualUri()
            );
          }

          // print a message if not message explicitly decrypted
          const currUrlSpec = this.uri.spec.replace(
            /(\?.*)(number=[0-9]*)(&.*)?$/,
            "?$2"
          );
          const manUrlSpec = manUrl.spec.replace(
            /(\?.*)(number=[0-9]*)(&.*)?$/,
            "?$2"
          );

          if (!this.backgroundJob && currUrlSpec != manUrlSpec) {
            return; // this.handleManualDecrypt();
          }
        }

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
        lazy.EnigmailLog.writeException("mimeVerify.jsm", ex);
        lazy.EnigmailLog.DEBUG(
          "mimeVerify.jsm: error while processing " + this.msgUriSpec + "\n"
        );
      }
    }

    if (this.protocol === PGPMIME_PROTO) {
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
        this.displayStatus(mimeSvc.mailChannel?.smimeHeaderSink);
      }
    }
  },

  // return data to libMime
  returnData(data) {
    lazy.EnigmailLog.DEBUG(
      "mimeVerify.jsm: returnData: " + data.length + " bytes\n"
    );

    const m = data.match(/^(content-type: +)([\w/]+)/im);
    if (m && m.length >= 3) {
      const contentType = m[2];
      if (contentType.search(/^text/i) === 0) {
        // add multipart/mixed boundary to work around TB bug (empty forwarded message)
        const bound = lazy.EnigmailMime.createBoundary();
        data =
          'Content-Type: multipart/mixed; boundary="' +
          bound +
          '"\n' +
          "Content-Disposition: inline\n\n--" +
          bound +
          "\n" +
          data +
          "\n--" +
          bound +
          "--\n";
      }
    }

    this.mimeSvc.outputDecryptedData(data, data.length);
  },

  displayStatus(headerSink) {
    lazy.EnigmailLog.DEBUG("mimeVerify.jsm: displayStatus\n");
    if (this.exitCode === null || this.statusDisplayed || this.backgroundJob) {
      return;
    }

    try {
      LOCAL_DEBUG("mimeVerify.jsm: displayStatus displaying result\n");
      if (headerSink) {
        if (this.protectedHeaders) {
          headerSink.modifyMessageHeaders(
            this.uri,
            JSON.stringify(
              Object.fromEntries(this.protectedHeaders._cachedHeaders)
            ),
            this.mimePartNumber
          );
        }

        headerSink.updateSecurityStatus(
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
      }
      this.statusDisplayed = true;
    } catch (ex) {
      lazy.EnigmailLog.writeException("mimeVerify.jsm", ex);
    }
  },
};

////////////////////////////////////////////////////////////////////
// General-purpose functions, not exported

function LOCAL_DEBUG(str) {
  if (gDebugLog) {
    lazy.EnigmailLog.DEBUG(str);
  }
}
