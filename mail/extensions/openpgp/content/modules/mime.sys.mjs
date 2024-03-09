/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

XPCOMUtils.defineLazyModuleGetters(lazy, {
  jsmime: "resource:///modules/jsmime.jsm",
  GlodaUtils: "resource:///modules/gloda/GlodaUtils.jsm",
  MsgUtils: "resource:///modules/MimeMessageUtils.jsm",
  MimeParser: "resource:///modules/mimeParser.jsm",
});

export var EnigmailMime = {
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

  /**
   * Format a mime header
   *
   * e.g. content-type -> Content-Type
   */
  formatHeader(headerLabel) {
    return headerLabel.replace(/^.|(-.)/g, function (match) {
      return match.toUpperCase();
    });
  },

  formatMimeHeader(headerLabel, headerValue) {
    if (Array.isArray(headerValue)) {
      return headerValue
        .map(v => EnigmailMime.formatHeader(headerLabel) + ": " + v)
        .join("\r\n");
    }
    return EnigmailMime.formatHeader(headerLabel) + ": " + headerValue + "\r\n";
  },

  prettyPrintHeader(headerLabel, headerData) {
    if (Array.isArray(headerData)) {
      const h = [];
      for (const i in headerData) {
        h.push(
          EnigmailMime.formatMimeHeader(
            headerLabel,
            lazy.GlodaUtils.deMime(headerData[i])
          )
        );
      }
      return h.join("\r\n");
    }
    return EnigmailMime.formatMimeHeader(
      headerLabel,
      lazy.GlodaUtils.deMime(String(headerData))
    );
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
   * Determine if the message data contains protected headers.
   * If so, extract the corresponding field(s).
   *
   * @param {string} contentData - The message data to extract from.
   * @returns {?StructuredHeaders} the protected headers, or null.
   */
  extractProtectedHeaders(contentData) {
    let [headers, body] = lazy.MimeParser.extractHeadersAndBody(contentData);
    let contentType = headers.get("content-type");
    if (
      contentType?.type == "multipart/signed" &&
      contentType?.get("protocol") == "application/pgp-signature"
    ) {
      // Multilayer PGP/MIME Message with Protected Headers.
      // We need to look at what's signed instead.
      headers = lazy.MimeParser.extractHeaders(body);
      contentType = headers.get("content-type");
    }
    if (contentType?.get("protected-headers") != "v1") {
      return null;
    }

    // Cache the headers we want to make available to serialization.
    for (const header of ["subject", "date"]) {
      headers.get(header);
    }
    return headers;
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
};
