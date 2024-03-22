/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 *  Module for creating PGP/MIME signed and/or encrypted messages
 *  implemented as XPCOM component
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  EnigmailConstants: "chrome://openpgp/content/modules/constants.sys.mjs",
  EnigmailData: "chrome://openpgp/content/modules/data.sys.mjs",
  EnigmailEncryption: "chrome://openpgp/content/modules/encryption.sys.mjs",
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.sys.mjs",
  EnigmailLog: "chrome://openpgp/content/modules/log.sys.mjs",
  EnigmailMime: "chrome://openpgp/content/modules/mime.sys.mjs",
  jsmime: "resource:///modules/jsmime.sys.mjs",
});

// our own contract IDs
const PGPMIME_ENCRYPT_CID = Components.ID(
  "{96fe88f9-d2cd-466f-93e0-3a351df4c6d2}"
);
const PGPMIME_ENCRYPT_CONTRACTID = "@enigmail.net/compose/mimeencrypt;1";

const maxBufferLen = 102400;
const MIME_SIGNED = 1; // only one MIME layer
const MIME_ENCRYPTED = 2; // only one MIME layer, combined enc/sig data
const MIME_OUTER_ENC_INNER_SIG = 3; // use two MIME layers

var gDebugLogLevel = 1;

function PgpMimeEncrypt(sMimeSecurityInfo) {
  this.wrappedJSObject = this;

  this.signMessage = false;
  this.requireEncryptMessage = false;

  // "securityInfo" variables
  this.sendFlags = 0;
  this.UIFlags = 0;
  this.senderEmailAddr = "";
  this.recipients = "";
  this.bccRecipients = "";
  this.originalSubject = null;
  this.autocryptGossipHeaders = "";

  try {
    if (sMimeSecurityInfo) {
      this.signMessage = sMimeSecurityInfo.signMessage;
      this.requireEncryptMessage = sMimeSecurityInfo.requireEncryptMessage;
    }
  } catch (ex) {}
}

PgpMimeEncrypt.prototype = {
  classDescription: "Enigmail JS Encryption Handler",
  classID: PGPMIME_ENCRYPT_CID,
  get contractID() {
    return PGPMIME_ENCRYPT_CONTRACTID;
  },
  QueryInterface: ChromeUtils.generateQI([
    "nsIMsgComposeSecure",
    "nsIStreamListener",
  ]),

  signMessage: false,
  requireEncryptMessage: false,

  // private variables

  inStream: Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
    Ci.nsIScriptableInputStream
  ),
  msgCompFields: null,
  outStringStream: null,

  // 0: processing headers
  // 1: processing body
  // 2: skipping header
  inputMode: 0,
  headerData: "",
  encapsulate: null,
  encHeader: null,
  outerBoundary: null,
  innerBoundary: null,
  win: null,
  //statusStr: "",
  cryptoOutputLength: 0,
  cryptoOutput: "",
  hashAlgorithm: "SHA256", // TODO: coordinate with RNP.sys.mjs
  cryptoInputBuffer: "",
  outgoingMessageBuffer: "",
  mimeStructure: 0,
  exitCode: -1,
  inspector: null,

  // nsIStreamListener interface
  onStartRequest() {
    lazy.EnigmailLog.DEBUG("mimeEncrypt.js: onStartRequest\n");
    this.encHeader = null;
  },

  onDataAvailable(req, stream) {
    LOCAL_DEBUG("mimeEncrypt.js: onDataAvailable\n");
    this.inStream.init(stream);
    //var data = this.inStream.read(count);
    //LOCAL_DEBUG("mimeEncrypt.js: >"+data+"<\n");
  },

  onStopRequest() {
    lazy.EnigmailLog.DEBUG("mimeEncrypt.js: onStopRequest\n");
  },

  // nsIMsgComposeSecure interface
  requiresCryptoEncapsulation() {
    lazy.EnigmailLog.DEBUG("mimeEncrypt.js: requiresCryptoEncapsulation\n");
    return (
      (this.sendFlags &
        (lazy.EnigmailConstants.SEND_SIGNED |
          lazy.EnigmailConstants.SEND_ENCRYPTED |
          lazy.EnigmailConstants.SEND_VERBATIM)) !==
      0
    );
  },

  beginCryptoEncapsulation(
    outStream,
    recipientList,
    msgCompFields,
    msgIdentity,
    sendReport,
    isDraft
  ) {
    lazy.EnigmailLog.DEBUG("mimeEncrypt.js: beginCryptoEncapsulation\n");

    if (!outStream) {
      throw Components.Exception("", Cr.NS_ERROR_NULL_POINTER);
    }

    try {
      this.outStream = outStream;
      this.isDraft = isDraft;

      this.msgCompFields = msgCompFields;
      this.outStringStream = Cc[
        "@mozilla.org/io/string-input-stream;1"
      ].createInstance(Ci.nsIStringInputStream);

      var windowManager = Services.wm;
      this.win = windowManager.getMostRecentWindow(null);

      if (this.sendFlags & lazy.EnigmailConstants.SEND_VERBATIM) {
        this.recipientList = recipientList;
        this.msgIdentity = msgIdentity;
        this.msgCompFields = msgCompFields;
        this.inputMode = 2;
        return null;
      }

      if (this.sendFlags & lazy.EnigmailConstants.SEND_PGP_MIME) {
        if (this.sendFlags & lazy.EnigmailConstants.SEND_ENCRYPTED) {
          // applies to encrypted and signed & encrypted
          if (this.sendFlags & lazy.EnigmailConstants.SEND_TWO_MIME_LAYERS) {
            this.mimeStructure = MIME_OUTER_ENC_INNER_SIG;
            this.innerBoundary = lazy.EnigmailMime.createBoundary();
          } else {
            this.mimeStructure = MIME_ENCRYPTED;
          }
        } else if (this.sendFlags & lazy.EnigmailConstants.SEND_SIGNED) {
          this.mimeStructure = MIME_SIGNED;
        }
      } else {
        throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
      }

      this.outerBoundary = lazy.EnigmailMime.createBoundary();
      this.startCryptoHeaders();
    } catch (ex) {
      lazy.EnigmailLog.ERROR(ex);
      throw ex;
    }

    return null;
  },

  startCryptoHeaders() {
    lazy.EnigmailLog.DEBUG("mimeEncrypt.js: startCryptoHeaders\n");

    switch (this.mimeStructure) {
      case MIME_SIGNED:
        this.signedHeaders1(false);
        break;
      case MIME_ENCRYPTED:
      case MIME_OUTER_ENC_INNER_SIG:
        this.encryptedHeaders();
        break;
    }

    this.writeSecureHeaders();
  },

  writeSecureHeaders() {
    this.encHeader = lazy.EnigmailMime.createBoundary();

    let allHdr = "";

    const addrParser = lazy.jsmime.headerparser.parseAddressingHeader;
    const newsParser = function (s) {
      return lazy.jsmime.headerparser.parseStructuredHeader("Newsgroups", s);
    };
    const noParser = function (s) {
      return s;
    };

    const h = {
      from: {
        field: "From",
        parser: addrParser,
      },
      replyTo: {
        field: "Reply-To",
        parser: addrParser,
      },
      to: {
        field: "To",
        parser: addrParser,
      },
      cc: {
        field: "Cc",
        parser: addrParser,
      },
      newsgroups: {
        field: "Newsgroups",
        parser: newsParser,
      },
      followupTo: {
        field: "Followup-To",
        parser: addrParser,
      },
      messageId: {
        field: "Message-Id",
        parser: noParser,
      },
      subject: {
        field: "Subject",
        parser: noParser,
      },
    };

    let alreadyAddedSubject = false;

    if (
      (this.mimeStructure == MIME_ENCRYPTED ||
        this.mimeStructure == MIME_OUTER_ENC_INNER_SIG) &&
      this.originalSubject &&
      this.originalSubject.length > 0
    ) {
      alreadyAddedSubject = true;
      allHdr += lazy.jsmime.headeremitter.emitStructuredHeader(
        "subject",
        this.originalSubject,
        {}
      );
    }

    for (const i in h) {
      if (h[i].field == "Subject" && alreadyAddedSubject) {
        continue;
      }
      if (this.msgCompFields[i] && this.msgCompFields[i].length > 0) {
        allHdr += lazy.jsmime.headeremitter.emitStructuredHeader(
          h[i].field,
          h[i].parser(this.msgCompFields[i]),
          {}
        );
      }
    }

    // special handling for references and in-reply-to

    if (this.originalReferences && this.originalReferences.length > 0) {
      allHdr += lazy.jsmime.headeremitter.emitStructuredHeader(
        "references",
        this.originalReferences,
        {}
      );

      const bracket = this.originalReferences.lastIndexOf("<");
      if (bracket >= 0) {
        allHdr += lazy.jsmime.headeremitter.emitStructuredHeader(
          "in-reply-to",
          this.originalReferences.substr(bracket),
          {}
        );
      }
    }

    let w = `Content-Type: multipart/mixed; boundary="${this.encHeader}"`;

    if (allHdr.length > 0) {
      w += `;\r\n protected-headers="v1"\r\n${allHdr}`;
    } else {
      w += "\r\n";
    }

    if (this.autocryptGossipHeaders) {
      w += this.autocryptGossipHeaders;
    }

    w += `\r\n--${this.encHeader}\r\n`;
    this.appendToCryptoInput(w);

    if (this.mimeStructure == MIME_SIGNED) {
      this.appendToMessage(w);
    }
  },

  encryptedHeaders() {
    lazy.EnigmailLog.DEBUG("mimeEncrypt.js: encryptedHeaders\n");
    let subj = "";

    if (this.sendFlags & lazy.EnigmailConstants.ENCRYPT_SUBJECT) {
      subj = lazy.jsmime.headeremitter.emitStructuredHeader(
        "subject",
        lazy.EnigmailFuncs.getProtectedSubjectText(),
        {}
      );
    }
    this.appendToMessage(
      subj +
        "Content-Type: multipart/encrypted;\r\n" +
        ' protocol="application/pgp-encrypted";\r\n' +
        ' boundary="' +
        this.outerBoundary +
        '"\r\n' +
        "\r\n" +
        "This is an OpenPGP/MIME encrypted message (RFC 4880 and 3156)\r\n" +
        "--" +
        this.outerBoundary +
        "\r\n" +
        "Content-Type: application/pgp-encrypted\r\n" +
        "Content-Description: PGP/MIME version identification\r\n" +
        "\r\n" +
        "Version: 1\r\n" +
        "\r\n" +
        "--" +
        this.outerBoundary +
        "\r\n" +
        'Content-Type: application/octet-stream; name="encrypted.asc"\r\n' +
        "Content-Description: OpenPGP encrypted message\r\n" +
        'Content-Disposition: inline; filename="encrypted.asc"\r\n' +
        "\r\n"
    );
  },

  signedHeaders1(isEightBit = false) {
    LOCAL_DEBUG("mimeEncrypt.js: signedHeaders1\n");
    let boundary;
    if (this.mimeStructure == MIME_OUTER_ENC_INNER_SIG) {
      boundary = this.innerBoundary;
    } else {
      boundary = this.outerBoundary;
    }
    const sigHeader =
      "Content-Type: multipart/signed; micalg=pgp-" +
      this.hashAlgorithm.toLowerCase() +
      ";\r\n" +
      ' protocol="application/pgp-signature";\r\n' +
      ' boundary="' +
      boundary +
      '"\r\n' +
      (isEightBit ? "Content-Transfer-Encoding: 8bit\r\n\r\n" : "\r\n") +
      "This is an OpenPGP/MIME signed message (RFC 4880 and 3156)\r\n" +
      "--" +
      boundary +
      "\r\n";
    if (this.mimeStructure == MIME_OUTER_ENC_INNER_SIG) {
      this.appendToCryptoInput(sigHeader);
    } else {
      this.appendToMessage(sigHeader);
    }
  },

  signedHeaders2() {
    LOCAL_DEBUG("mimeEncrypt.js: signedHeaders2\n");
    let boundary;
    if (this.mimeStructure == MIME_OUTER_ENC_INNER_SIG) {
      boundary = this.innerBoundary;
    } else {
      boundary = this.outerBoundary;
    }
    const sigHeader =
      "\r\n--" +
      boundary +
      "\r\n" +
      'Content-Type: application/pgp-signature; name="OpenPGP_signature.asc"\r\n' +
      "Content-Description: OpenPGP digital signature\r\n" +
      'Content-Disposition: attachment; filename="OpenPGP_signature.asc"\r\n\r\n';
    if (this.mimeStructure == MIME_OUTER_ENC_INNER_SIG) {
      this.appendToCryptoInput(sigHeader);
    } else {
      this.appendToMessage(sigHeader);
    }
  },

  finishCryptoHeaders() {
    lazy.EnigmailLog.DEBUG("mimeEncrypt.js: finishCryptoHeaders\n");

    this.appendToMessage("\r\n--" + this.outerBoundary + "--\r\n");
  },

  finishCryptoEncapsulation() {
    lazy.EnigmailLog.DEBUG("mimeEncrypt.js: finishCryptoEncapsulation\n");

    if ((this.sendFlags & lazy.EnigmailConstants.SEND_VERBATIM) !== 0) {
      this.flushOutput();
      return;
    }

    if (this.encapsulate) {
      this.appendToCryptoInput("--" + this.encapsulate + "--\r\n");
    }

    if (this.encHeader) {
      this.appendToCryptoInput("\r\n--" + this.encHeader + "--\r\n");
      if (this.mimeStructure == MIME_SIGNED) {
        this.appendToMessage("\r\n--" + this.encHeader + "--\r\n");
      }
    }

    const statusFlagsObj = {};
    const errorMsgObj = {};
    this.exitCode = 0;

    if (this.mimeStructure == MIME_OUTER_ENC_INNER_SIG) {
      // prepare the inner crypto layer (the signature)
      const sendFlagsWithoutEncrypt =
        this.sendFlags & ~lazy.EnigmailConstants.SEND_ENCRYPTED;

      this.exitCode = lazy.EnigmailEncryption.encryptMessageStart(
        this.win,
        this.UIFlags,
        this.senderEmailAddr,
        this.recipients,
        this.bccRecipients,
        this.hashAlgorithm,
        sendFlagsWithoutEncrypt,
        this,
        statusFlagsObj,
        errorMsgObj
      );
      if (!this.exitCode) {
        // success
        const innerSignedMessage = this.cryptoInputBuffer;
        this.cryptoInputBuffer = "";

        this.signedHeaders1(false);
        this.appendToCryptoInput(innerSignedMessage);
        this.signedHeaders2();
        this.cryptoOutput = this.cryptoOutput
          .replace(/\r/g, "")
          .replace(/\n/g, "\r\n"); // force CRLF
        this.appendToCryptoInput(this.cryptoOutput);
        this.appendToCryptoInput("\r\n--" + this.innerBoundary + "--\r\n");
        this.cryptoOutput = "";
      }
    }

    if (!this.exitCode) {
      // no failure yet
      let encryptionFlags = this.sendFlags;
      if (this.mimeStructure == MIME_OUTER_ENC_INNER_SIG) {
        // remove signature flag, because we already signed
        encryptionFlags = encryptionFlags & ~lazy.EnigmailConstants.SEND_SIGNED;
      }
      this.exitCode = lazy.EnigmailEncryption.encryptMessageStart(
        this.win,
        this.UIFlags,
        this.senderEmailAddr,
        this.recipients,
        this.bccRecipients,
        this.hashAlgorithm,
        encryptionFlags,
        this,
        statusFlagsObj,
        errorMsgObj
      );
    }

    try {
      LOCAL_DEBUG(
        "mimeEncrypt.js: finishCryptoEncapsulation: exitCode = " +
          this.exitCode +
          "\n"
      );
      if (this.exitCode !== 0) {
        throw new Error(
          "failure in finishCryptoEncapsulation, exitCode: " + this.exitCode
        );
      }

      if (this.mimeStructure == MIME_SIGNED) {
        this.signedHeaders2();
      }

      this.cryptoOutput = this.cryptoOutput
        .replace(/\r/g, "")
        .replace(/\n/g, "\r\n"); // force CRLF

      this.appendToMessage(this.cryptoOutput);
      this.finishCryptoHeaders();
      this.flushOutput();
    } catch (ex) {
      lazy.EnigmailLog.ERROR(ex);
      throw ex;
    }
  },

  mimeCryptoWriteBlock(buffer, length) {
    if (gDebugLogLevel > 4) {
      LOCAL_DEBUG("mimeEncrypt.js: mimeCryptoWriteBlock: " + length + "\n");
    }

    try {
      let line = buffer.substr(0, length);
      if (this.inputMode === 0) {
        if ((this.sendFlags & lazy.EnigmailConstants.SEND_VERBATIM) !== 0) {
          line = lazy.EnigmailData.decodeQuotedPrintable(
            line.replace("=\r\n", "")
          );
        }

        if (
          (this.sendFlags & lazy.EnigmailConstants.SEND_VERBATIM) === 0 ||
          line.match(
            /^(From|To|Subject|Message-ID|Date|User-Agent|MIME-Version):/i
          ) === null
        ) {
          this.headerData += line;
        }

        if (line.replace(/[\r\n]/g, "").length === 0) {
          this.inputMode = 1;

          if (
            this.mimeStructure == MIME_ENCRYPTED ||
            this.mimeStructure == MIME_OUTER_ENC_INNER_SIG
          ) {
            if (!this.encHeader) {
              const ct = this.getHeader("content-type", false);
              if (
                ct.search(/text\/plain/i) === 0 ||
                ct.search(/text\/html/i) === 0
              ) {
                this.encapsulate = lazy.EnigmailMime.createBoundary();
                this.appendToCryptoInput(
                  'Content-Type: multipart/mixed; boundary="' +
                    this.encapsulate +
                    '"\r\n\r\n'
                );
                this.appendToCryptoInput("--" + this.encapsulate + "\r\n");
              }
            }
          } else if (this.mimeStructure == MIME_SIGNED) {
            const ct = this.getHeader("content-type", true);
            const hdr = lazy.EnigmailFuncs.getHeaderData(ct);
            hdr.boundary = hdr.boundary || "";
            hdr.boundary = hdr.boundary.replace(/^(['"])(.*)(\1)$/, "$2");
          }

          this.appendToCryptoInput(this.headerData);
          if (
            this.mimeStructure == MIME_SIGNED ||
            (this.sendFlags & lazy.EnigmailConstants.SEND_VERBATIM) !== 0
          ) {
            this.appendToMessage(this.headerData);
          }
        }
      } else if (this.inputMode == 1) {
        if (this.mimeStructure == MIME_SIGNED) {
          // special treatments for various special cases with PGP/MIME signed messages
          if (line.substr(0, 5) == "From ") {
            LOCAL_DEBUG("mimeEncrypt.js: added >From\n");
            this.appendToCryptoInput(">");
          }
        }

        this.appendToCryptoInput(line);
        if (this.mimeStructure == MIME_SIGNED) {
          this.appendToMessage(line);
        } else if (
          (this.sendFlags & lazy.EnigmailConstants.SEND_VERBATIM) !==
          0
        ) {
          this.appendToMessage(
            lazy.EnigmailData.decodeQuotedPrintable(line.replace("=\r\n", ""))
          );
        }
      } else if (this.inputMode == 2) {
        if (line.replace(/[\r\n]/g, "").length === 0) {
          this.inputMode = 0;
        }
      }
    } catch (ex) {
      console.warn("Write crypto block FAILED!", ex);
      throw ex;
    }

    return null;
  },

  appendToMessage(str) {
    if (gDebugLogLevel > 4) {
      LOCAL_DEBUG("mimeEncrypt.js: appendToMessage: " + str.length + "\n");
    }

    this.outgoingMessageBuffer += str;

    if (this.outgoingMessageBuffer.length > maxBufferLen) {
      this.flushOutput();
    }
  },

  flushOutput() {
    LOCAL_DEBUG(
      "mimeEncrypt.js: flushOutput: " + this.outgoingMessageBuffer.length + "\n"
    );

    this.outStringStream.setData(
      this.outgoingMessageBuffer,
      this.outgoingMessageBuffer.length
    );
    var writeCount = this.outStream.writeFrom(
      this.outStringStream,
      this.outgoingMessageBuffer.length
    );
    if (writeCount < this.outgoingMessageBuffer.length) {
      LOCAL_DEBUG(
        "mimeEncrypt.js: flushOutput: wrote " +
          writeCount +
          " instead of " +
          this.outgoingMessageBuffer.length +
          " bytes\n"
      );
    }
    this.outgoingMessageBuffer = "";
  },

  appendToCryptoInput(str) {
    if (gDebugLogLevel > 4) {
      LOCAL_DEBUG("mimeEncrypt.js: appendToCryptoInput: " + str.length + "\n");
    }

    this.cryptoInputBuffer += str;
  },

  getHeader(hdrStr, fullHeader) {
    var res = "";
    var hdrLines = this.headerData.split(/[\r\n]+/);
    for (let i = 0; i < hdrLines.length; i++) {
      if (hdrLines[i].length > 0) {
        if (fullHeader && res !== "") {
          if (hdrLines[i].search(/^\s+/) === 0) {
            res += hdrLines[i].replace(/\s*[\r\n]*$/, "");
          } else {
            return res;
          }
        } else {
          const j = hdrLines[i].indexOf(":");
          if (j > 0) {
            const h = hdrLines[i].substr(0, j).replace(/\s*$/, "");
            if (h.toLowerCase() == hdrStr.toLowerCase()) {
              res = hdrLines[i].substr(j + 1).replace(/^\s*/, "");
              if (!fullHeader) {
                return res;
              }
            }
          }
        }
      }
    }

    return res;
  },

  getInputForCrypto() {
    return this.cryptoInputBuffer;
  },

  addCryptoOutput(s) {
    LOCAL_DEBUG("mimeEncrypt.js: addCryptoOutput:" + s.length + "\n");
    this.cryptoOutput += s;
    this.cryptoOutputLength += s.length;
  },

  getCryptoOutputLength() {
    return this.cryptoOutputLength;
  },

  // API for decryptMessage Listener
  stdin() {
    throw new Error("unexpected");
  },

  stderr() {
    throw new Error("unexpected");
    //this.statusStr += s;
  },
};

////////////////////////////////////////////////////////////////////
// General-purpose functions, not exported

function LOCAL_DEBUG(str) {
  if (gDebugLogLevel) {
    lazy.EnigmailLog.DEBUG(str);
  }
}

export var EnigmailMimeEncrypt = {
  Handler: PgpMimeEncrypt,

  init() {
    lazy.EnigmailLog.DEBUG("mimeEncrypt.sys.mjs: initModule()\n");
    const nspr_log_modules = Services.env.get("NSPR_LOG_MODULES");
    const matches = nspr_log_modules.match(/mimeEncrypt:(\d+)/);

    if (matches && matches.length > 1) {
      gDebugLogLevel = matches[1];
      LOCAL_DEBUG("mimeEncrypt.js: enabled debug logging\n");
    }
  },

  createMimeEncrypt(sMimeSecurityInfo) {
    return new PgpMimeEncrypt(sMimeSecurityInfo);
  },

  isEnigmailCompField(obj) {
    return obj instanceof PgpMimeEncrypt;
  },
};
