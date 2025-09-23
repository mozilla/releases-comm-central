/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Module for creating PGP/MIME signed and/or encrypted messages.
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  EnigmailConstants: "chrome://openpgp/content/modules/constants.sys.mjs",
  EnigmailData: "chrome://openpgp/content/modules/data.sys.mjs",
  EnigmailEncryption: "chrome://openpgp/content/modules/encryption.sys.mjs",
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.sys.mjs",
  EnigmailMime: "chrome://openpgp/content/modules/mime.sys.mjs",
  jsmime: "resource:///modules/jsmime.sys.mjs",
  MimeParser: "resource:///modules/mimeParser.sys.mjs",
});

const MIME_SIGNED = 1; // only one MIME layer
const MIME_ENCRYPTED = 2; // only one MIME layer, combined enc/sig data
const MIME_OUTER_ENC_INNER_SIG = 3; // use two MIME layers

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
  this.headers = "";

  try {
    if (sMimeSecurityInfo) {
      this.signMessage = sMimeSecurityInfo.signMessage;
      this.requireEncryptMessage = sMimeSecurityInfo.requireEncryptMessage;
    }
  } catch (ex) {}
}

/**
 * @implements {nsIMsgComposeSecure}
 * @implements {nsIStreamListener}
 */
PgpMimeEncrypt.prototype = {
  classDescription: "Enigmail JS Encryption Handler",
  classID: Components.ID("{96fe88f9-d2cd-466f-93e0-3a351df4c6d2}"),
  contractID: "@enigmail.net/compose/mimeencrypt;1",
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
    this.encHeader = null;
  },

  onDataAvailable(req, stream) {
    this.inStream.init(stream);
  },

  onStopRequest() {},

  // nsIMsgComposeSecure interface
  requiresCryptoEncapsulation() {
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
    headers,
    msgIdentity,
    sendReport,
    isDraft
  ) {
    if (!outStream) {
      throw Components.Exception("No outStream", Cr.NS_ERROR_NULL_POINTER);
    }

    this.outStream = outStream;
    this.isDraft = isDraft;
    this.headers = headers;

    this.msgCompFields = msgCompFields;
    this.outStringStream = Cc[
      "@mozilla.org/io/string-input-stream;1"
    ].createInstance(Ci.nsIStringInputStream);

    this.win = Services.wm.getMostRecentWindow(null);

    if (this.sendFlags & lazy.EnigmailConstants.SEND_VERBATIM) {
      this.recipientList = recipientList;
      this.msgIdentity = msgIdentity;
      this.msgCompFields = msgCompFields;
      this.inputMode = 2;
      return;
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
  },

  startCryptoHeaders() {
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

    if (!this.headers) {
      throw new Error("OpenPGP message creation requires prepared headers");
    }

    let w = `Content-Type: multipart/mixed; boundary="${this.encHeader}"`;
    w += `;\r\n protected-headers="v1"\r\n${this.headers}`;

    if (
      (this.mimeStructure == MIME_ENCRYPTED ||
        this.mimeStructure == MIME_OUTER_ENC_INNER_SIG) &&
      this.originalSubject
    ) {
      w += lazy.jsmime.headeremitter.emitStructuredHeader(
        "subject",
        this.originalSubject,
        {}
      );
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
    this.appendToMessage("\r\n--" + this.outerBoundary + "--\r\n");
  },

  finishCryptoEncapsulation() {
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
      if (this.exitCode !== 0) {
        throw new Error("encryptMessageStart FAILED: " + this.exitCode);
      }
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
  },

  /**
   * @param {string} buffer - Buffer holding the data to be processed.
   * @param {integer} length - Length of the buffer (number of characters).
   */
  mimeCryptoWriteBlock(buffer, length) {
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
          const ct = "Content-Type: " + this.getHeader("content-type", true);
          const hdr = lazy.MimeParser.extractHeaders(ct).get("content-type");
          // eslint-disable-next-line no-unused-vars
          const boundary = hdr
            ?.get("boundary")
            ?.replace(/^(['"])(.*)(\1)$/, "$2");
          // FIXME: well, what about it? This ^^^  doesn't do anything...
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
  },

  appendToMessage(str) {
    this.outgoingMessageBuffer += str;

    const maxBufferLen = 102400;
    if (this.outgoingMessageBuffer.length > maxBufferLen) {
      this.flushOutput();
    }
  },

  flushOutput() {
    this.outStringStream.setByteStringData(this.outgoingMessageBuffer);
    this.outStream.writeFrom(
      this.outStringStream,
      this.outgoingMessageBuffer.length
    );
    this.outgoingMessageBuffer = "";
  },

  appendToCryptoInput(str) {
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
    this.cryptoOutput += s;
    this.cryptoOutputLength += s.length;
  },

  getCryptoOutputLength() {
    return this.cryptoOutputLength;
  },
};

export var EnigmailMimeEncrypt = {
  Handler: PgpMimeEncrypt,

  init() {},

  createMimeEncrypt(sMimeSecurityInfo) {
    return new PgpMimeEncrypt(sMimeSecurityInfo);
  },

  isEnigmailCompField(obj) {
    return obj instanceof PgpMimeEncrypt;
  },
};
