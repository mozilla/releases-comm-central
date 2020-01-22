/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

/**
 *  Module for creating PGP/MIME signed and/or encrypted messages
 *  implemented as XPCOM component
 */

var EXPORTED_SYMBOLS = ["EnigmailMimeEncrypt"];

const Cr = Components.results;

const jsmime = ChromeUtils.import("resource:///modules/jsmime.jsm").jsmime;
const EnigmailCompat = ChromeUtils.import("chrome://openpgp/content/modules/compat.jsm").EnigmailCompat;
const EnigmailFuncs = ChromeUtils.import("chrome://openpgp/content/modules/funcs.jsm").EnigmailFuncs;
const EnigmailDialog = ChromeUtils.import("chrome://openpgp/content/modules/dialog.jsm").EnigmailDialog;
const EnigmailLog = ChromeUtils.import("chrome://openpgp/content/modules/log.jsm").EnigmailLog;
const EnigmailEncryption = ChromeUtils.import("chrome://openpgp/content/modules/encryption.jsm").EnigmailEncryption;
const EnigmailMime = ChromeUtils.import("chrome://openpgp/content/modules/mime.jsm").EnigmailMime;
const EnigmailHash = ChromeUtils.import("chrome://openpgp/content/modules/hash.jsm").EnigmailHash;
const EnigmailData = ChromeUtils.import("chrome://openpgp/content/modules/data.jsm").EnigmailData;
const EnigmailConstants = ChromeUtils.import("chrome://openpgp/content/modules/constants.jsm").EnigmailConstants;
const EnigmailKeyRing = ChromeUtils.import("chrome://openpgp/content/modules/keyRing.jsm").EnigmailKeyRing;
const EnigmailLocale = ChromeUtils.import("chrome://openpgp/content/modules/locale.jsm").EnigmailLocale;

// our own contract IDs
const PGPMIME_ENCRYPT_CID = Components.ID("{96fe88f9-d2cd-466f-93e0-3a351df4c6d2}");
const PGPMIME_ENCRYPT_CONTRACTID = "@enigmail.net/compose/mimeencrypt;1";

const APPSHELL_MEDIATOR_CONTRACTID = "@mozilla.org/appshell/window-mediator;1";

// S/MIME contract IDs
const SMIME_ENCRYPT_CONTRACTID = "@mozilla.org/messengercompose/composesecure;1";
const kSmimeComposeSecureCID = "{dd753201-9a23-4e08-957f-b3616bf7e012}";

const maxBufferLen = 102400;
const MIME_SIGNED = 1;
const MIME_ENCRYPTED = 2;

var gDebugLogLevel = 0;

function PgpMimeEncrypt(sMimeSecurityInfo) {
  this.wrappedJSObject = this;

  // nsIMsgSMIMECompFields
  this.signMessage = false;
  this.requireEncryptMessage = false;

  // "securityInfo" variables
  this.sendFlags = 0;
  this.UIFlags = 0;
  this.senderEmailAddr = "";
  this.recipients = "";
  this.bccRecipients = "";
  this.originalSubject = null;
  this.keyMap = {};

  if (EnigmailCompat.isMessageUriInPgpMime()) {
    this.onDataAvailable = this.onDataAvailable68;
  }
  else {
    this.onDataAvailable = this.onDataAvailable60;
  }

  try {
    if (sMimeSecurityInfo) {
      if ("nsIMsgSMIMECompFields" in Ci) {
        sMimeSecurityInfo = sMimeSecurityInfo.QueryInterface(Ci.nsIMsgSMIMECompFields);
      }
      this.signMessage = sMimeSecurityInfo.signMessage;
      this.requireEncryptMessage = sMimeSecurityInfo.requireEncryptMessage;
    }
  }
  catch (ex) {}
}

PgpMimeEncrypt.prototype = {
  classDescription: "Enigmail JS Encryption Handler",
  classID: PGPMIME_ENCRYPT_CID,
  get contractID() {
    if (Components.classesByID && Components.classesByID[kSmimeComposeSecureCID]) {
      // hack needed for TB < 62: we overwrite the S/MIME encryption handler
      return SMIME_ENCRYPT_CONTRACTID;
    }
    else {
      return PGPMIME_ENCRYPT_CONTRACTID;
    }
  },
  QueryInterface: EnigmailCompat.generateQI([
    "nsIMsgComposeSecure",
    "nsIStreamListener",
    "nsIMsgSMIMECompFields" // TB < 64
  ]),

  signMessage: false,
  requireEncryptMessage: false,

  // private variables

  inStream: Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream),
  msgCompFields: null,
  smimeCompose: null,
  useSmime: false,
  outStringStream: null,

  // 0: processing headers
  // 1: processing body
  // 2: skipping header
  inputMode: 0,
  dataLength: 0,
  headerData: "",
  encapsulate: null,
  encHeader: null,
  cryptoBoundary: null,
  win: null,
  pipe: null,
  proc: null,
  statusStr: "",
  encryptedData: "",
  hashAlgorithm: null,
  pipeQueue: "",
  outQueue: "",
  closePipe: false,
  cryptoMode: 0,
  exitCode: -1,
  inspector: null,
  checkSMime: true,

  // nsIStreamListener interface
  onStartRequest: function(request) {
    EnigmailLog.DEBUG("mimeEncrypt.js: onStartRequest\n");
    this.encHeader = null;
  },

  /**
   * onDataAvailable for TB <= 66
   */
  onDataAvailable60: function(req, ctxt, stream, offset, count) {
    LOCAL_DEBUG("mimeEncrypt.js: onDataAvailable\n");
    this.inStream.init(stream);
    var data = this.inStream.read(count);
    //LOCAL_DEBUG("mimeEncrypt.js: >"+data+"<\n");

  },

  /**
   * onDataAvailable for TB >= 67
   */
  onDataAvailable68: function(req, stream, offset, count) {
    LOCAL_DEBUG("mimeEncrypt.js: onDataAvailable\n");
    this.inStream.init(stream);
    var data = this.inStream.read(count);
    //LOCAL_DEBUG("mimeEncrypt.js: >"+data+"<\n");

  },

  onStopRequest: function(request, status) {
    EnigmailLog.DEBUG("mimeEncrypt.js: onStopRequest\n");
  },

  disableSMimeCheck: function() {
    this.useSmime = false;
    this.checkSMime = false;
  },

  // nsIMsgComposeSecure interface
  requiresCryptoEncapsulation: function(msgIdentity, msgCompFields) {
    EnigmailLog.DEBUG("mimeEncrypt.js: requiresCryptoEncapsulation\n");
    try {
        if (Components.classesByID && kSmimeComposeSecureCID in Components.classesByID) {
          // TB < 64
          if (this.checkSMime) {
            // Remember to use original CID, not CONTRACTID, to avoid infinite looping!
            this.smimeCompose = Components.classesByID[kSmimeComposeSecureCID].createInstance(Ci.nsIMsgComposeSecure);
            this.useSmime = this.smimeCompose.requiresCryptoEncapsulation(msgIdentity, msgCompFields);
          }

          if (this.useSmime) return true;

          if (msgCompFields.securityInfo) {
            let securityInfo = msgCompFields.securityInfo.wrappedJSObject;
            if (!securityInfo) return false;

            for (let prop of ["sendFlags", "UIFlags", "senderEmailAddr", "recipients", "bccRecipients", "originalSubject", "keyMap"]) {
              this[prop] = securityInfo[prop];
            }
          }
          else return false;
        }
        else {
          // TB >= 64: we are not called for S/MIME
          this.disableSMimeCheck();
        }

        return (this.sendFlags & (EnigmailConstants.SEND_SIGNED |
          EnigmailConstants.SEND_ENCRYPTED |
          EnigmailConstants.SEND_VERBATIM)) !== 0;
    }
    catch (ex) {
      EnigmailLog.writeException("mimeEncrypt.js", ex);
      throw (ex);
    }
  },

  beginCryptoEncapsulation: function(outStream, recipientList, msgCompFields, msgIdentity, sendReport, isDraft) {
    EnigmailLog.DEBUG("mimeEncrypt.js: beginCryptoEncapsulation\n");

    if (this.checkSMime && (!this.smimeCompose)) {
      LOCAL_DEBUG("mimeEncrypt.js: beginCryptoEncapsulation: ERROR MsgComposeSecure not instantiated\n");
      throw Cr.NS_ERROR_FAILURE;
    }

    if (this.useSmime)
      return this.smimeCompose.beginCryptoEncapsulation(outStream, recipientList,
        msgCompFields, msgIdentity,
        sendReport, isDraft);

    if (!outStream) throw Cr.NS_ERROR_NULL_POINTER;

    try {

      this.outStream = outStream;
      this.isDraft = isDraft;

      this.msgCompFields = msgCompFields;
      this.outStringStream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(Ci.nsIStringInputStream);

      var windowManager = Cc[APPSHELL_MEDIATOR_CONTRACTID].getService(Ci.nsIWindowMediator);
      this.win = windowManager.getMostRecentWindow(null);

      if (this.sendFlags & EnigmailConstants.SEND_VERBATIM) {
        this.recipientList = recipientList;
        this.msgIdentity = msgIdentity;
        this.msgCompFields = msgCompFields;
        this.inputMode = 2;
        return null;
      }

      if (this.sendFlags & EnigmailConstants.SEND_PGP_MIME) {

        if (this.sendFlags & EnigmailConstants.SEND_ENCRYPTED) {
          // applies to encrypted and signed & encrypted
          this.cryptoMode = MIME_ENCRYPTED;
        }
        else if (this.sendFlags & EnigmailConstants.SEND_SIGNED) {
          this.cryptoMode = MIME_SIGNED;

          let hashAlgoObj = {};
          if (EnigmailHash.determineAlgorithm(this.win,
              this.UIFlags,
              this.senderEmailAddr,
              hashAlgoObj) === 0) {
            this.hashAlgorithm = hashAlgoObj.value;
          }
          else {
            if ("statusFlags" in hashAlgoObj && hashAlgoObj.statusFlags !== 0 && hashAlgoObj.errorMsg) {
              EnigmailDialog.alert(this.win, hashAlgoObj.errorMsg);
            }

            throw Cr.NS_ERROR_FAILURE;
          }
        }
      }
      else
        throw Cr.NS_ERROR_NOT_IMPLEMENTED;

      this.cryptoBoundary = EnigmailMime.createBoundary();
      this.startCryptoHeaders();

    }
    catch (ex) {
      EnigmailLog.writeException("mimeEncrypt.js", ex);
      throw (ex);
    }

    return null;
  },

  startCryptoHeaders: function() {
    EnigmailLog.DEBUG("mimeEncrypt.js: startCryptoHeaders\n");

    if (this.cryptoMode == MIME_SIGNED) this.signedHeaders1(false);
    if (this.cryptoMode == MIME_ENCRYPTED) this.encryptedHeaders();

    this.writeSecureHeaders();
  },

  writeSecureHeaders: function() {
    this.encHeader = EnigmailMime.createBoundary();

    let allHdr = "";

    if (this.sendFlags & EnigmailConstants.ENCRYPT_HEADERS) {
      let addrParser = jsmime.headerparser.parseAddressingHeader;
      let newsParser = function(s) {
        return jsmime.headerparser.parseStructuredHeader("Newsgroups", s);
      };
      let noParser = function(s) {
        return s;
      };

      let h = {
        from: {
          field: "From",
          parser: addrParser
        },
        replyTo: {
          field: "Reply-To",
          parser: addrParser
        },
        to: {
          field: "To",
          parser: addrParser
        },
        cc: {
          field: "Cc",
          parser: addrParser
        },
        newsgroups: {
          field: "Newsgroups",
          parser: newsParser
        },
        followupTo: {
          field: "Followup-To",
          parser: addrParser
        },
        messageId: {
          field: "Message-Id",
          parser: noParser
        },
        subject: {
          field: "Subject",
          parser: noParser
        }
      };

      for (let i in h) {
        if (this.msgCompFields[i] && this.msgCompFields[i].length > 0) {
          allHdr += jsmime.headeremitter.emitStructuredHeader(h[i].field, h[i].parser(this.msgCompFields[i]), {});
        }
      }

      if (this.cryptoMode == MIME_ENCRYPTED && this.originalSubject && this.originalSubject.length > 0) {
        allHdr += jsmime.headeremitter.emitStructuredHeader("subject", this.originalSubject, {});
      }

      // special handling for references and in-reply-to

      if (this.originalReferences && this.originalReferences.length > 0) {
        allHdr += jsmime.headeremitter.emitStructuredHeader("references", this.originalReferences, {});

        let bracket = this.originalReferences.lastIndexOf("<");
        if (bracket >= 0) {
          allHdr += jsmime.headeremitter.emitStructuredHeader("in-reply-to", this.originalReferences.substr(bracket), {});
        }
      }
    }

    let w = `Content-Type: multipart/mixed; boundary="${this.encHeader}"`;

    if (allHdr.length > 0) {
      w += `;\r\n protected-headers="v1"\r\n${allHdr}`;
    }
    else {
      w += '\r\n';
    }

    w += this.getAutocryptGossip() + `\r\n--${this.encHeader}\r\n`;
    this.writeToPipe(w);

    if (this.cryptoMode == MIME_SIGNED) this.writeOut(w);
  },

  getAutocryptGossip: function() {
    let gossip = "";
    if (this.cryptoMode == MIME_ENCRYPTED &&
      this.msgCompFields.hasHeader("autocrypt") &&
      this.keyMap &&
      EnigmailFuncs.getNumberOfRecipients(this.msgCompFields) > 1) {
      for (let email in this.keyMap) {
        let keyObj = EnigmailKeyRing.getKeyById(this.keyMap[email]);
        if (keyObj) {
          let k = keyObj.getMinimalPubKey(email);
          if (k.exitCode === 0) {
            let keyData = " " + k.keyData.replace(/(.{72})/g, "$1\r\n ").replace(/\r\n $/, "");
            gossip += 'Autocrypt-Gossip: addr=' + email + '; keydata=\r\n' + keyData + "\r\n";
          }
        }
      }
    }

    return gossip;
  },

  encryptedHeaders: function(isEightBit) {
    EnigmailLog.DEBUG("mimeEncrypt.js: encryptedHeaders\n");
    let subj = "";

    if (this.sendFlags & EnigmailConstants.ENCRYPT_HEADERS) {
      subj = jsmime.headeremitter.emitStructuredHeader("subject", EnigmailFuncs.getProtectedSubjectText(), {});
    }

    this.writeOut(subj +
      "Content-Type: multipart/encrypted;\r\n" +
      " protocol=\"application/pgp-encrypted\";\r\n" +
      " boundary=\"" + this.cryptoBoundary + "\"\r\n" +
      "\r\n" +
      "This is an OpenPGP/MIME encrypted message (RFC 4880 and 3156)\r\n" +
      "--" + this.cryptoBoundary + "\r\n" +
      "Content-Type: application/pgp-encrypted\r\n" +
      "Content-Description: PGP/MIME version identification\r\n" +
      "\r\n" +
      "Version: 1\r\n" +
      "\r\n" +
      "--" + this.cryptoBoundary + "\r\n" +
      "Content-Type: application/octet-stream; name=\"encrypted.asc\"\r\n" +
      "Content-Description: OpenPGP encrypted message\r\n" +
      "Content-Disposition: inline; filename=\"encrypted.asc\"\r\n" +
      "\r\n");
  },

  signedHeaders1: function(isEightBit) {
    LOCAL_DEBUG("mimeEncrypt.js: signedHeaders1\n");
    this.writeOut("Content-Type: multipart/signed; micalg=pgp-" +
      this.hashAlgorithm.toLowerCase() +
      ";\r\n" +
      " protocol=\"application/pgp-signature\";\r\n" +
      " boundary=\"" + this.cryptoBoundary + "\"\r\n" +
      (isEightBit ? "Content-Transfer-Encoding: 8bit\r\n\r\n" : "\r\n") +
      "This is an OpenPGP/MIME signed message (RFC 4880 and 3156)\r\n" +
      "--" + this.cryptoBoundary + "\r\n");
  },


  signedHeaders2: function() {
    LOCAL_DEBUG("mimeEncrypt.js: signedHeaders2\n");

    this.writeOut("\r\n--" + this.cryptoBoundary + "\r\n" +
      "Content-Type: application/pgp-signature; name=\"signature.asc\"\r\n" +
      "Content-Description: OpenPGP digital signature\r\n" +
      "Content-Disposition: attachment; filename=\"signature.asc\"\r\n\r\n");
  },

  finishCryptoHeaders: function() {
    EnigmailLog.DEBUG("mimeEncrypt.js: finishCryptoHeaders\n");

    this.writeOut("\r\n--" + this.cryptoBoundary + "--\r\n");
  },

  finishCryptoEncapsulation: function(abort, sendReport) {
    EnigmailLog.DEBUG("mimeEncrypt.js: finishCryptoEncapsulation\n");

    if (this.checkSMime && (!this.smimeCompose))
      throw Cr.NS_ERROR_NOT_INITIALIZED;

    if (this.useSmime) {
      this.smimeCompose.finishCryptoEncapsulation(abort, sendReport);
      return;
    }

    if ((this.sendFlags & EnigmailConstants.SEND_VERBATIM) !== 0) {
      this.flushOutput();
      return;
    }

    if (this.encapsulate) {
      this.writeToPipe("--" + this.encapsulate + "--\r\n");
    }

    if (this.encHeader) {
      this.writeToPipe("\r\n--" + this.encHeader + "--\r\n");
      if (this.cryptoMode == MIME_SIGNED) {
        this.writeOut("\r\n--" + this.encHeader + "--\r\n");
      }
    }

    let statusFlagsObj = {};
    let errorMsgObj = {};
    //let proc =
    EnigmailEncryption.encryptMessageStart(this.win,
      this.UIFlags,
      this.senderEmailAddr,
      this.recipients,
      this.bccRecipients,
      this.hashAlgorithm,
      this.sendFlags,
      this,
      statusFlagsObj,
      errorMsgObj);

    //if (!proc) throw Cr.NS_ERROR_FAILURE;

    try {
      this.flushInput();

      /*
      if (!this.pipe) {
        this.closePipe = true;
      }
      else {
        this.pipe.close();
      }
      */

      // wait here for proc to terminate
      //proc.wait();

      LOCAL_DEBUG("mimeEncrypt.js: finishCryptoEncapsulation: exitCode = " + this.exitCode + "\n");
      if (this.exitCode !== 0) {
        throw Cr.NS_ERROR_FAILURE;
      }

      if (this.cryptoMode == MIME_SIGNED) {
        this.signedHeaders2();
      }

      this.encryptedData = this.encryptedData.replace(/\r/g, "").replace(/\n/g, "\r\n"); // force CRLF
      this.writeOut(this.encryptedData);
      this.finishCryptoHeaders();
      this.flushOutput();
    }
    catch (ex) {
      EnigmailLog.writeException("mimeEncrypt.js", ex);
      throw (ex);
    }

  },

  mimeCryptoWriteBlock: function(buffer, length) {
    if (gDebugLogLevel > 4)
      LOCAL_DEBUG("mimeEncrypt.js: mimeCryptoWriteBlock: " + length + "\n");

    if (this.checkSMime && (!this.smimeCompose))
      throw Cr.NS_ERROR_NOT_INITIALIZED;

    if (this.useSmime) return this.smimeCompose.mimeCryptoWriteBlock(buffer, length);

    try {
      let line = buffer.substr(0, length);
      if (this.inputMode === 0) {
        if ((this.sendFlags & EnigmailConstants.SEND_VERBATIM) !== 0) {
          line = EnigmailData.decodeQuotedPrintable(line.replace("=\r\n", ""));
        }

        if ((this.sendFlags & EnigmailConstants.SEND_VERBATIM) === 0 ||
          line.match(/^(From|To|Subject|Message-ID|Date|User-Agent|MIME-Version):/i) === null) {
          this.headerData += line;
        }

        if (line.replace(/[\r\n]/g, "").length === 0) {
          this.inputMode = 1;

          if (this.cryptoMode == MIME_ENCRYPTED) {
            if (!this.encHeader) {
              let ct = this.getHeader("content-type", false);
              if ((ct.search(/text\/plain/i) === 0) || (ct.search(/text\/html/i) === 0)) {
                this.encapsulate = EnigmailMime.createBoundary();
                this.writeToPipe('Content-Type: multipart/mixed; boundary="' +
                  this.encapsulate + '"\r\n\r\n');
                this.writeToPipe("--" + this.encapsulate + "\r\n");
              }
            }
          }
          else if (this.cryptoMode == MIME_SIGNED) {
            let ct = this.getHeader("content-type", true);
            let hdr = EnigmailFuncs.getHeaderData(ct);
            hdr.boundary = hdr.boundary || "";
            hdr.boundary = hdr.boundary.replace(/['"]/g, "");
          }

          this.writeToPipe(this.headerData);
          if (this.cryptoMode == MIME_SIGNED ||
            (this.sendFlags & EnigmailConstants.SEND_VERBATIM) !== 0) {
            this.writeOut(this.headerData);
          }
        }

      }
      else if (this.inputMode == 1) {
        if (this.cryptoMode == MIME_SIGNED) {
          // special treatments for various special cases with PGP/MIME signed messages
          if (line.substr(0, 5) == "From ") {
            LOCAL_DEBUG("mimeEncrypt.js: added >From\n");
            this.writeToPipe(">");
          }
        }

        this.writeToPipe(line);
        if (this.cryptoMode == MIME_SIGNED) {
          this.writeOut(line);
        }
        else if ((this.sendFlags & EnigmailConstants.SEND_VERBATIM) !== 0) {
          this.writeOut(EnigmailData.decodeQuotedPrintable(line.replace("=\r\n", "")));
        }
      }
      else if (this.inputMode == 2) {
        if (line.replace(/[\r\n]/g, "").length === 0) {
          this.inputMode = 0;
        }
      }
    }
    catch (ex) {
      EnigmailLog.writeException("mimeEncrypt.js", ex);
      throw (ex);
    }

    return null;
  },

  writeOut: function(str) {
    if (gDebugLogLevel > 4)
      LOCAL_DEBUG("mimeEncrypt.js: writeOut: " + str.length + "\n");

    this.outQueue += str;

    if (this.outQueue.length > maxBufferLen)
      this.flushOutput();
  },

  flushOutput: function() {
    LOCAL_DEBUG("mimeEncrypt.js: flushOutput: " + this.outQueue.length + "\n");

    this.outStringStream.setData(this.outQueue, this.outQueue.length);
    var writeCount = this.outStream.writeFrom(this.outStringStream, this.outQueue.length);
    if (writeCount < this.outQueue.length) {
      LOCAL_DEBUG("mimeEncrypt.js: flushOutput: wrote " + writeCount + " instead of " + this.outQueue.length + " bytes\n");
    }
    this.outQueue = "";
  },

  writeToPipe: function(str) {
    if (gDebugLogLevel > 4)
      LOCAL_DEBUG("mimeEncrypt.js: writeToPipe: " + str.length + "\n");

    if (this.pipe) {
      this.pipeQueue += str;
      if (this.pipeQueue.length > maxBufferLen)
        this.flushInput();
    }
    else
      this.pipeQueue += str;
  },

  flushInput: function() {
    LOCAL_DEBUG("mimeEncrypt.js: flushInput\n");
    if (!this.pipe) return;
    this.pipe.write(this.pipeQueue);
    this.pipeQueue = "";
  },

  getHeader: function(hdrStr, fullHeader) {
    var foundIndex = 0;
    var res = "";
    var hdrLines = this.headerData.split(/[\r\n]+/);
    var i;
    for (i = 0; i < hdrLines.length; i++) {
      if (hdrLines[i].length > 0) {
        if (fullHeader && res !== "") {
          if (hdrLines[i].search(/^\s+/) === 0) {
            res += hdrLines[i].replace(/\s*[\r\n]*$/, "");
          }
          else
            return res;
        }
        else {
          let j = hdrLines[i].indexOf(":");
          if (j > 0) {
            let h = hdrLines[i].substr(0, j).replace(/\s*$/, "");
            let re = new RegExp("^" + hdrStr + "$", "i");
            if (h.search(re) === 0) {
              foundIndex = 1;
              res = hdrLines[i].substr(j + 1).replace(/^\s*/, "");
              if (!fullHeader) return res;
            }
          }
        }
      }
    }

    return res;
  },

  getInputForEncryption() {
    return this.pipeQueue;
  },
  
  addEncryptedOutput(s) {
    this.stdout(s);
  },

  // API for decryptMessage Listener
  stdin: function(pipe) {
    LOCAL_DEBUG("mimeEncrypt.js: stdin\n");
    if (this.pipeQueue.length > 0) {
      pipe.write(this.pipeQueue);
      this.pipeQueue = "";
    }
    if (this.closePipe) {
      pipe.close();
    }
    else {
      this.pipe = pipe;
    }
  },

  stdout: function(s) {
    LOCAL_DEBUG("mimeEncrypt.js: stdout:" + s.length + "\n");
    this.encryptedData += s;
    this.dataLength += s.length;
  },

  stderr: function(s) {
    LOCAL_DEBUG("mimeEncrypt.js: stderr\n");
    this.statusStr += s;
  },

  done: function(exitCode) {
    EnigmailLog.DEBUG("mimeEncrypt.js: done: " + exitCode + "\n");

    let retStatusObj = {};

    this.exitCode = EnigmailEncryption.encryptMessageEnd(this.senderEmailAddr,
      this.statusStr,
      exitCode,
      this.UIFlags,
      this.sendFlags,
      this.dataLength,
      retStatusObj);

    if (this.exitCode !== 0)
      EnigmailDialog.alert(this.win, retStatusObj.errorMsg);

  },
};


////////////////////////////////////////////////////////////////////
// General-purpose functions, not exported


function LOCAL_DEBUG(str) {
  if (gDebugLogLevel) EnigmailLog.DEBUG(str);
}

function initModule() {
  EnigmailLog.DEBUG("mimeEncrypt.jsm: initModule()\n");
  var env = Cc["@mozilla.org/process/environment;1"].getService(Ci.nsIEnvironment);
  var nspr_log_modules = env.get("NSPR_LOG_MODULES");
  var matches = nspr_log_modules.match(/mimeEncrypt:(\d+)/);

  if (matches && (matches.length > 1)) {
    gDebugLogLevel = matches[1];
    LOCAL_DEBUG("mimeEncrypt.js: enabled debug logging\n");
  }
}

var EnigmailMimeEncrypt = {
  Handler: PgpMimeEncrypt,

  startup: function(reason) {
    initModule();
  },
  shutdown: function(reason) {},

  createMimeEncrypt: function(sMimeSecurityInfo) {
    return new PgpMimeEncrypt(sMimeSecurityInfo);
  },

  isEnigmailCompField: function(obj) {
    return obj instanceof PgpMimeEncrypt;
  }
};
