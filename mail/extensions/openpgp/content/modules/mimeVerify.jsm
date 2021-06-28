/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailVerify"];

/**
 *  Module for handling PGP/MIME signed messages
 *  implemented as JS module
 */

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  EnigmailConstants: "chrome://openpgp/content/modules/constants.jsm",
  EnigmailCryptoAPI: "chrome://openpgp/content/modules/cryptoAPI.jsm",
  EnigmailData: "chrome://openpgp/content/modules/data.jsm",
  EnigmailDecryption: "chrome://openpgp/content/modules/decryption.jsm",
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  EnigmailMime: "chrome://openpgp/content/modules/mime.jsm",
  EnigmailSingletons: "chrome://openpgp/content/modules/singletons.jsm",
  EnigmailURIs: "chrome://openpgp/content/modules/uris.jsm",
  Services: "resource://gre/modules/Services.jsm",
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
  lastMsgWindow: null,
  lastMsgUri: null,
  manualMsgUri: null,

  currentCtHandler: EnigmailConstants.MIME_HANDLER_UNDEF,

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    var env = Cc["@mozilla.org/process/environment;1"].getService(
      Ci.nsIEnvironment
    );
    var nspr_log_modules = env.get("NSPR_LOG_MODULES");
    var matches = nspr_log_modules.match(/mimeVerify:(\d+)/);

    if (matches && matches.length > 1) {
      if (matches[1] > 2) {
        gDebugLog = true;
      }
    }
  },

  setMsgWindow(msgWindow, msgUriSpec) {
    LOCAL_DEBUG("mimeVerify.jsm: setMsgWindow: " + msgUriSpec + "\n");

    this.lastMsgWindow = msgWindow;
    this.lastMsgUri = msgUriSpec;
  },

  newVerifier(protocol) {
    EnigmailLog.DEBUG(
      "mimeVerify.jsm: newVerifier: " + (protocol || "null") + "\n"
    );

    let v = new MimeVerify(protocol);
    return v;
  },

  setManualUri(msgUriSpec) {
    LOCAL_DEBUG("mimeVerify.jsm: setManualUri: " + msgUriSpec + "\n");
    this.manualMsgUri = msgUriSpec;
  },

  getManualUri() {
    EnigmailLog.DEBUG("mimeVerify.jsm: getManualUri\n");
    return this.manualMsgUri;
  },

  /***
   * register a PGP/MIME verify object the same way PGP/MIME encrypted mail is handled
   */
  registerContentTypeHandler() {
    EnigmailLog.DEBUG("mimeVerify.jsm: registerContentTypeHandler\n");
    let reg = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);

    let pgpMimeClass = Cc["@mozilla.org/mimecth;1?type=multipart/encrypted"];

    reg.registerFactory(
      pgpMimeClass,
      "Enigmail PGP/MIME verification",
      "@mozilla.org/mimecth;1?type=multipart/signed",
      null
    );
    this.currentCtHandler = EnigmailConstants.MIME_HANDLER_PGPMIME;
  },

  unregisterContentTypeHandler() {
    EnigmailLog.DEBUG("mimeVerify.jsm: unregisterContentTypeHandler\n");
    let reg = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);

    let sMimeClass = Cc["@mozilla.org/nsCMSDecoder;1"];
    reg.registerFactory(
      sMimeClass,
      "S/MIME verification",
      "@mozilla.org/mimecth;1?type=multipart/signed",
      null
    );
    this.currentCtHandler = EnigmailConstants.MIME_HANDLER_SMIME;
  },
};

// MimeVerify implementation
// verify the signature of PGP/MIME signed messages
MimeVerify.prototype = {
  dataCount: 0,
  foundMsg: false,
  startMsgStr: "",
  msgWindow: null,
  msgUriSpec: null,
  statusDisplayed: false,
  window: null,
  inStream: null,
  sigFile: null,
  sigData: "",
  mimePartNumber: "",

  QueryInterface: ChromeUtils.generateQI(["nsIStreamListener"]),

  startStreaming(window, msgWindow, msgUriSpec) {
    LOCAL_DEBUG("mimeVerify.jsm: startStreaming\n");

    this.msgWindow = msgWindow;
    this.msgUriSpec = msgUriSpec;
    this.window = window;
    var messenger = Cc["@mozilla.org/messenger;1"].getService(Ci.nsIMessenger);
    var msgSvc = messenger.messageServiceFromURI(this.msgUriSpec);

    msgSvc.streamMessage(
      this.msgUriSpec,
      this,
      this.msgWindow,
      null,
      false,
      null,
      false
    );
  },

  verifyData(window, msgWindow, msgUriSpec, data) {
    LOCAL_DEBUG("mimeVerify.jsm: streamFromChannel\n");

    this.msgWindow = msgWindow;
    this.msgUriSpec = msgUriSpec;
    this.window = window;
    this.onStartRequest();
    this.onTextData(data);
    this.onStopRequest();
  },

  parseContentType() {
    let contentTypeLine = this.mimeSvc.contentType;

    // Eat up CRLF's.
    contentTypeLine = contentTypeLine.replace(/[\r\n]/g, "");
    EnigmailLog.DEBUG(
      "mimeVerify.jsm: parseContentType: " + contentTypeLine + "\n"
    );

    let protoRx = RegExp(
      "protocol\\s*=\\s*[\\'\\\"]" + this.protocol + "[\\\"\\']",
      "i"
    );

    if (
      contentTypeLine.search(/multipart\/signed/i) >= 0 &&
      contentTypeLine.search(protoRx) > 0
    ) {
      EnigmailLog.DEBUG(
        "mimeVerify.jsm: parseContentType: found MIME signed message\n"
      );
      this.foundMsg = true;
      let hdr = EnigmailFuncs.getHeaderData(contentTypeLine);
      hdr.boundary = hdr.boundary || "";
      hdr.micalg = hdr.micalg || "";
      this.boundary = hdr.boundary.replace(/^(['"])(.*)(\1)$/, "$2");
    }
  },

  onStartRequest(request, uri) {
    EnigmailLog.DEBUG("mimeVerify.jsm: onStartRequest\n"); // always log this one

    this.mimeSvc = request.QueryInterface(Ci.nsIPgpMimeProxy);
    this.msgUriSpec = EnigmailVerify.lastMsgUri;

    if ("mimePart" in this.mimeSvc) {
      this.mimePartNumber = this.mimeSvc.mimePart;
    } else {
      this.mimePartNumber = "";
    }

    if ("messageURI" in this.mimeSvc) {
      this.uri = this.mimeSvc.messageURI;
    } else if (uri) {
      this.uri = uri.QueryInterface(Ci.nsIURI);
    }

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
        let xferEnc = this.getContentTransferEncoding();
        if (xferEnc.search(/base64/i) >= 0) {
          let bound = this.getBodyPart();
          this.keepData =
            EnigmailData.decodeBase64(
              this.keepData.substring(bound.start, bound.end)
            ) + "\n";
        } else if (xferEnc.search(/quoted-printable/i) >= 0) {
          let bound = this.getBodyPart();
          let qp = this.keepData.substring(bound.start, bound.end);
          this.keepData = EnigmailData.decodeQuotedPrintable(qp) + "\n";
        }

        // extract signature data
        let s = Math.max(this.keepData.search(/^-----BEGIN PGP /m), 0);
        let e = Math.max(
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
    let m = this.keepData.match(/^(content-transfer-encoding:)(.*)$/im);
    if (m && m.length > 2) {
      enc = m[2].trim().toLowerCase();
    }

    return enc;
  },

  findNextMimePart() {
    let startOk = false;
    let endOk = false;

    let i = this.keepData.indexOf("--" + this.boundary);
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

  onStopRequest() {
    EnigmailLog.DEBUG("mimeVerify.jsm: onStopRequest\n");

    this.msgWindow = EnigmailVerify.lastMsgWindow;
    this.msgUriSpec = EnigmailVerify.lastMsgUri;

    this.backgroundJob = false;

    // don't try to verify if no message found
    // if (this.verifyEmbedded && (!this.foundMsg)) return; // TODO - check

    if (this.readMode < 4) {
      // we got incomplete data; simply return what we got
      this.returnData(
        this.signedData.length > 0 ? this.signedData : this.keepData
      );

      return;
    }

    this.protectedHeaders = EnigmailMime.extractProtectedHeaders(
      this.signedData
    );

    if (
      this.protectedHeaders &&
      this.protectedHeaders.startPos >= 0 &&
      this.protectedHeaders.endPos > this.protectedHeaders.startPos
    ) {
      let r =
        this.signedData.substr(0, this.protectedHeaders.startPos) +
        this.signedData.substr(this.protectedHeaders.endPos);
      this.returnData(r);
    } else {
      this.returnData(this.signedData);
    }

    // return if not verifying first mime part
    if (
      this.mimePartNumber.length > 0 &&
      this.mimePartNumber.search(/^1(\.1)?$/) < 0
    ) {
      return;
    }

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
            manUrl = EnigmailFuncs.getUrlFromUriSpec(
              EnigmailVerify.getManualUri()
            );
          }

          // print a message if not message explicitly decrypted
          let currUrlSpec = this.uri.spec.replace(
            /(\?.*)(number=[0-9]*)(&.*)?$/,
            "?$2"
          );
          let manUrlSpec = manUrl.spec.replace(
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

          let url = this.msgUriSpec
            ? EnigmailFuncs.getUrlFromUriSpec(this.msgUriSpec)
            : null;

          if (url) {
            let otherId = EnigmailURIs.msgIdentificationFromUrl(url);
            let thisId = EnigmailURIs.msgIdentificationFromUrl(this.uri);

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
        EnigmailLog.writeException("mimeVerify.jsm", ex);
        EnigmailLog.DEBUG(
          "mimeVerify.jsm: error while processing " + this.msgUriSpec + "\n"
        );
      }
    }

    if (this.protocol === PGPMIME_PROTO) {
      var windowManager = Services.wm;
      var win = windowManager.getMostRecentWindow(null);

      if (!EnigmailDecryption.isReady(win)) {
        return;
      }

      let options = {
        fromAddr: EnigmailDecryption.getFromAddr(win),
        mimeSignatureData: this.sigData,
      };
      const cApi = EnigmailCryptoAPI();

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

        this.displayStatus();
      }
    }
  },

  // return data to libMime
  returnData(data) {
    EnigmailLog.DEBUG(
      "mimeVerify.jsm: returnData: " + data.length + " bytes\n"
    );

    let m = data.match(/^(content-type: +)([\w/]+)/im);
    if (m && m.length >= 3) {
      let contentType = m[2];
      if (contentType.search(/^text/i) === 0) {
        // add multipart/mixed boundary to work around TB bug (empty forwarded message)
        let bound = EnigmailMime.createBoundary();
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

  setMsgWindow(msgWindow, msgUriSpec) {
    EnigmailLog.DEBUG("mimeVerify.jsm: setMsgWindow: " + msgUriSpec + "\n");

    if (!this.msgWindow) {
      this.msgWindow = msgWindow;
      this.msgUriSpec = msgUriSpec;
    }
  },

  displayStatus() {
    EnigmailLog.DEBUG("mimeVerify.jsm: displayStatus\n");
    if (
      this.exitCode === null ||
      this.msgWindow === null ||
      this.statusDisplayed ||
      this.backgroundJob
    ) {
      return;
    }

    try {
      LOCAL_DEBUG("mimeVerify.jsm: displayStatus displaying result\n");
      let headerSink = EnigmailSingletons.messageReader;

      if (this.protectedHeaders) {
        headerSink.processDecryptionResult(
          this.uri,
          "modifyMessageHeaders",
          JSON.stringify(this.protectedHeaders.newHeaders),
          this.mimePartNumber
        );
      }

      if (headerSink) {
        headerSink.updateSecurityStatus(
          this.lastMsgUri,
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
      EnigmailLog.writeException("mimeVerify.jsm", ex);
    }
  },
};

////////////////////////////////////////////////////////////////////
// General-purpose functions, not exported

function LOCAL_DEBUG(str) {
  if (gDebugLog) {
    EnigmailLog.DEBUG(str);
  }
}
