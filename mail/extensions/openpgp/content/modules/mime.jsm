/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailMime"];

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const lazy = {};

XPCOMUtils.defineLazyModuleGetters(lazy, {
  EnigmailData: "chrome://openpgp/content/modules/data.jsm",
  EnigmailStreams: "chrome://openpgp/content/modules/streams.jsm",
  jsmime: "resource:///modules/jsmime.jsm",
  MsgUtils: "resource:///modules/MimeMessageUtils.jsm",
  MailStringUtils: "resource:///modules/MailStringUtils.jsm",
});

var EnigmailMime = {
  /***
   * create a string of random characters suitable to use for a boundary in a
   * MIME message following RFC 2045
   *
   * @return: string to use as MIME boundary
   * @see {MimeMultiPart._makePartSeparator}
   */
  createBoundary() {
    return "------------" + lazy.MsgUtils.randomString(24);
  },

  /***
   * determine the "boundary" part of a mail content type.
   *
   * @contentTypeStr: the string containing all parts of a content-type.
   *               (e.g. multipart/mixed; boundary="xyz") --> returns "xyz"
   *
   * @return: String containing the boundary parameter; or ""
   */

  getBoundary(contentTypeStr) {
    return EnigmailMime.getParameter(contentTypeStr, "boundary");
  },

  /***
   * determine the "protocol" part of a mail content type.
   *
   * @contentTypeStr: the string containing all parts of a content-type.
   *               (e.g. multipart/signed; protocol="xyz") --> returns "xyz"
   *
   * @return: String containing the protocol parameter; or ""
   */

  getProtocol(contentTypeStr) {
    return EnigmailMime.getParameter(contentTypeStr, "protocol");
  },

  /***
   * determine an arbitrary "parameter" part of a mail header.
   *
   * @param headerStr: the string containing all parts of the header.
   * @param parameter: the parameter we are looking for
   *
   *
   * 'multipart/signed; protocol="xyz"', 'protocol' --> returns "xyz"
   *
   * @return: String containing the parameter; or ""
   */

  getParameter(headerStr, parameter) {
    const paramsArr = EnigmailMime.getAllParameters(headerStr);
    parameter = parameter.toLowerCase();
    if (parameter in paramsArr) {
      return paramsArr[parameter];
    }
    return "";
  },

  /***
   * get all parameter attributes of a mail header.
   *
   * @param headerStr: the string containing all parts of the header.
   *
   * @return: Array of Object containing the key value pairs
   *
   * 'multipart/signed; protocol="xyz"'; boundary="xxx"
   *  --> returns [ ["protocol": "xyz"], ["boundary": "xxx"] ]
   */

  getAllParameters(headerStr) {
    headerStr = headerStr.replace(/[\r\n]+[ \t]+/g, "");
    const hdrMap = lazy.jsmime.headerparser.parseParameterHeader(
      ";" + headerStr,
      true,
      true
    );

    const paramArr = [];
    const i = hdrMap.entries();
    let p = i.next();
    while (p.value) {
      paramArr[p.value[0].toLowerCase()] = p.value[1];
      p = i.next();
    }

    return paramArr;
  },

  /**
   * Determine the "charset" part of a mail content type.
   *
   * @param {string} contentTypeStr - the string containing all parts of a
   *   content-type (e.g. multipart/mixed; charset="utf-8") --> returns "utf-8"
   *
   * @returns {?string} A string containing the charset parameter; or null
   */
  getCharset(contentTypeStr) {
    return EnigmailMime.getParameter(contentTypeStr, "charset");
  },

  /**
   * Extract the subject from the 1st line of the message body, if the message body starts
   * with: "Subject: ...\r?\n\r?\n".
   *
   * @param msgBody - String: message body
   *
   * @returns
   * if subject is found:
   *  Object:
   *    - messageBody - String: message body without subject
   *    - subject     - String: extracted subject
   *
   * if subject not found: null
   */
  extractSubjectFromBody(msgBody) {
    const m = msgBody.match(/^(\r?\n?Subject: [^\r\n]+\r?\n\r?\n)/i);
    if (m && m.length > 0) {
      let subject = m[0].replace(/[\r\n]/g, "");
      subject = subject.substr(9);
      msgBody = msgBody.substr(m[0].length);

      return {
        messageBody: msgBody,
        subject,
      };
    }

    return null;
  },

  /***
   * Determine if the message data contains a first mime part with
   * content-type = "text/rfc822-headers"
   * If so, extract the corresponding field(s).
   *
   * @param {string} contentData - The message data to extract from
   * @returns {object} headers
   * @returns {object} headers.newHeaders
   * @returns {integer} headers.startPos
   * @returns {integer} headers.endPos
   * @returns {integer} headers.securityLevel
   */
  extractProtectedHeaders(contentData) {
    // find first MIME delimiter. Anything before that delimiter is the top MIME structure
    const m = contentData.search(/^--/m);

    const protectedHdr = [
      "subject",
      "date",
      "from",
      "to",
      "cc",
      "reply-to",
      "references",
      "newsgroups",
      "followup-to",
      "message-id",
    ];
    const newHeaders = {};

    // read headers of first MIME part and extract the boundary parameter
    const outerHdr = Cc["@mozilla.org/messenger/mimeheaders;1"].createInstance(
      Ci.nsIMimeHeaders
    );
    outerHdr.initialize(contentData.substr(0, m));

    let ct = outerHdr.extractHeader("content-type", false) || "";
    if (ct === "") {
      return null;
    }

    let startPos = -1,
      endPos = -1,
      bound = "";

    if (ct.search(/^multipart\//i) === 0) {
      // multipart/xyz message type
      if (m < 5) {
        return null;
      }

      bound = EnigmailMime.getBoundary(ct);
      if (bound === "") {
        return null;
      }

      // Escape regex chars in the boundary.
      bound = bound.replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&");
      // search for "outer" MIME delimiter(s)
      const r = new RegExp("^--" + bound, "mg");

      startPos = -1;
      endPos = -1;

      // 1st match: start of 1st MIME-subpart
      let match = r.exec(contentData);
      if (match && match.index) {
        startPos = match.index;
      }

      // 2nd  match: end of 1st MIME-subpart
      match = r.exec(contentData);
      if (match && match.index) {
        endPos = match.index;
      }

      if (startPos < 0 || endPos < 0) {
        return null;
      }
    } else {
      startPos = contentData.length;
      endPos = 0;
    }

    const headers = Cc["@mozilla.org/messenger/mimeheaders;1"].createInstance(
      Ci.nsIMimeHeaders
    );
    headers.initialize(contentData.substring(0, startPos));

    // we got a potentially protected header. Let's check ...
    ct = headers.extractHeader("content-type", false) || "";
    if (this.getParameter(ct, "protected-headers").search(/^v1$/i) !== 0) {
      return null;
    }

    for (const i in protectedHdr) {
      if (headers.hasHeader(protectedHdr[i])) {
        const extracted = headers.extractHeader(protectedHdr[i], true);
        newHeaders[protectedHdr[i]] =
          lazy.jsmime.headerparser.decodeRFC2047Words(extracted) || undefined;
      }
    }

    // contentBody holds the complete 1st MIME part
    let contentBody = contentData.substring(
      startPos + bound.length + 3,
      endPos
    );
    const i = contentBody.search(/^[A-Za-z]/m); // skip empty lines
    if (i > 0) {
      contentBody = contentBody.substr(i);
    }

    headers.initialize(contentBody);

    const innerCt = headers.extractHeader("content-type", false) || "";

    if (innerCt.search(/^text\/rfc822-headers/i) === 0) {
      const charset = EnigmailMime.getCharset(innerCt);
      const ctt =
        headers.extractHeader("content-transfer-encoding", false) || "";

      // determine where the headers end and the MIME-subpart body starts
      let bodyStartPos = contentBody.search(/\r?\n\s*\r?\n/) + 1;

      if (bodyStartPos < 10) {
        return null;
      }

      bodyStartPos += contentBody.substr(bodyStartPos).search(/^[A-Za-z]/m);

      let ctBodyData = contentBody.substr(bodyStartPos);

      if (ctt.search(/^base64/i) === 0) {
        ctBodyData = lazy.EnigmailData.decodeBase64(ctBodyData) + "\n";
      } else if (ctt.search(/^quoted-printable/i) === 0) {
        ctBodyData = lazy.EnigmailData.decodeQuotedPrintable(ctBodyData) + "\n";
      }

      if (charset) {
        ctBodyData = lazy.EnigmailData.convertToUnicode(ctBodyData, charset);
      }

      // get the headers of the MIME-subpart body --> that's the ones we need
      const bodyHdr = Cc["@mozilla.org/messenger/mimeheaders;1"].createInstance(
        Ci.nsIMimeHeaders
      );
      bodyHdr.initialize(ctBodyData);

      for (const i in protectedHdr) {
        const extracted = bodyHdr.extractHeader(protectedHdr[i], true);
        if (bodyHdr.hasHeader(protectedHdr[i])) {
          newHeaders[protectedHdr[i]] =
            lazy.jsmime.headerparser.decodeRFC2047Words(extracted) || undefined;
        }
      }
    } else {
      startPos = -1;
      endPos = -1;
    }

    return {
      newHeaders,
      startPos,
      endPos,
      securityLevel: 0,
    };
  },

  /**
   * Get the part number from a URI spec (e.g. mailbox:///folder/xyz?part=1.2.3.5)
   *
   * @param spec: String - the URI spec to inspect
   *
   * @returns String: the mime part number (or "" if none found)
   */
  getMimePartNumber(spec) {
    const m = spec.match(/([\?&]part=)(\d+(\.\d+)*)/);

    if (m && m.length >= 3) {
      return m[2];
    }

    return "";
  },

  /**
   * Try to determine if the message structure is a known MIME structure,
   * based on the MIME part number and the uriSpec.
   *
   * @param mimePartNumber: String - the MIME part we are requested to decrypt
   * @param uriSpec:        String - the URI spec of the message (or msg part) loaded by TB
   *
   * @returns Boolean: true: regular message structure, MIME part is safe to be decrypted
   *                  false: otherwise
   */
  isRegularMimeStructure(mimePartNumber, uriSpec, acceptSubParts = false) {
    if (mimePartNumber.length === 0) {
      return true;
    }

    if (acceptSubParts && mimePartNumber.search(/^1(\.1)*$/) === 0) {
      return true;
    }
    if (mimePartNumber === "1") {
      return true;
    }

    if (!uriSpec) {
      return true;
    }

    // is the message a subpart of a complete attachment?
    const msgPart = this.getMimePartNumber(uriSpec);
    if (msgPart.length > 0) {
      // load attached messages
      if (
        mimePartNumber.indexOf(msgPart) === 0 &&
        mimePartNumber.substr(msgPart.length).search(/^(\.1)+$/) === 0
      ) {
        return true;
      }

      // load attachments of attached messages
      if (
        msgPart.indexOf(mimePartNumber) === 0 &&
        uriSpec.search(/[\?&]filename=/) > 0
      ) {
        return true;
      }
    }

    return false;
  },

  /**
   * Parse a MIME message and return a tree structure of TreeObject
   *
   * @param url:         String   - the URL to load and parse
   * @param getBody:     Boolean  - if true, delivers the body text of each MIME part
   * @param callbackFunc Function - the callback function that is called asynchronously
   *                                when parsing is complete.
   *                                Function signature: callBackFunc(TreeObject)
   *
   * @returns undefined
   */
  getMimeTreeFromUrl(url, getBody = false, callbackFunc) {
    function onData(data) {
      const tree = getMimeTree(data, getBody);
      callbackFunc(tree);
    }

    const chan = lazy.EnigmailStreams.createChannel(url);
    const bufferListener = lazy.EnigmailStreams.newStringStreamListener(onData);
    chan.asyncOpen(bufferListener, null);
  },

  getMimeTree,
};

/**
 * Parse a MIME message and return a tree structure of TreeObject.
 *
 * TreeObject contains the following main parts:
 *     - partNum: String
 *     - headers: Map, containing all headers.
 *         Special headers for contentType and charset
 *     - body: String, if getBody == true
 *     - subParts: Array of TreeObject
 *
 * @param {string} mimeStr - A MIME structure to parse.
 * @param {boolean} getBody - If true, delivers the body text of each MIME part.
 * @returns {?object} tree - TreeObject
 * @returns {string} tree.partNum
 * @returns {Map} tree.headers - Map, containing all headers
 * @returns {Map} tree.body - Body, if getBody == true.
 * @returns {object[]} tree.subParts Array of TreeObject
 */
function getMimeTree(mimeStr, getBody = false) {
  const mimeTree = {
    partNum: "",
    headers: null,
    body: "",
    parent: null,
    subParts: [],
  };
  let currentPart = "";
  let currPartNum = "";

  const jsmimeEmitter = {
    createPartObj(partNum, headers, parent) {
      let ct;

      if (headers.has("content-type")) {
        ct = headers.contentType.type;
        const it = headers.get("content-type").entries();
        for (const i of it) {
          ct += "; " + i[0] + '="' + i[1] + '"';
        }
      }

      return {
        partNum,
        headers,
        fullContentType: ct,
        body: "",
        parent,
        subParts: [],
      };
    },

    /** JSMime API */
    startMessage() {
      currentPart = mimeTree;
    },

    endMessage() {},

    startPart(partNum, headers) {
      partNum = "1" + (partNum !== "" ? "." : "") + partNum;
      const newPart = this.createPartObj(partNum, headers, currentPart);

      if (partNum.indexOf(currPartNum) === 0) {
        // found sub-part
        currentPart.subParts.push(newPart);
      } else {
        // found same or higher level
        currentPart.subParts.push(newPart);
      }
      currPartNum = partNum;
      currentPart = newPart;
    },
    endPart(partNum) {
      currentPart = currentPart.parent;
    },

    deliverPartData(partNum, data) {
      if (typeof data === "string") {
        currentPart.body += data;
      } else {
        currentPart.body += lazy.MailStringUtils.uint8ArrayToByteString(data);
      }
    },
  };

  const opt = {
    strformat: "unicode",
    bodyformat: getBody ? "decode" : "none",
    stripcontinuations: false,
  };

  try {
    const p = new lazy.jsmime.MimeParser(jsmimeEmitter, opt);
    p.deliverData(mimeStr);
    return mimeTree.subParts[0];
  } catch (ex) {
    return null;
  }
}
