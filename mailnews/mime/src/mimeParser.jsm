/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
// vim:set ts=2 sw=2 sts=2 et ft=javascript:

const { jsmime } = ChromeUtils.import("resource:///modules/jsmime.jsm");
const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var EXPORTED_SYMBOLS = ["MimeParser"];

// Emitter helpers, for internal functions later on.
var ExtractMimeMsgEmitter = {
  getAttachmentName(part) {
    if (
      part &&
      "headers" in part &&
      part.headers.hasOwnProperty("content-disposition")
    ) {
      let c = part.headers["content-disposition"][0];
      if (c) {
        return MimeParser.getParameter(c, "filename");
      }
    }
    return "";
  },

  // This implementation differs from EnigmailMime! It does not require the
  // content-disposition header to start with "attachment", but also treats
  // "inline" as attachments (just like MsgHdrToMimeMessage).
  isAttachment(part) {
    if (
      part &&
      "contentType" in part &&
      part.contentType.search(/^multipart\//i) === 0
    ) {
      return false;
    }

    if (
      part &&
      "headers" in part &&
      part.headers.hasOwnProperty("content-disposition")
    ) {
      let c = part.headers["content-disposition"][0];
      if (c) {
        return true;
      }
    }
    return false;
  },

  createPartObj(partName, headerMap, parent) {
    let contentType = headerMap.contentType?.type
      ? headerMap.contentType.type
      : "";

    // Convert headerMap.
    let headers = {};
    for (let [headerName, headerValue] of headerMap._rawHeaders) {
      // MsgHdrToMimeMessage always returns an array, even for single values.
      let valueArray = Array.isArray(headerValue) ? headerValue : [headerValue];
      // Decode headers and collapse all remaining whitespaces (e.g. \t).
      headers[headerName] = valueArray.map(value =>
        MailServices.mimeConverter
          .decodeMimeHeader(
            value,
            null,
            false /* override_charset */,
            true /* eatContinuations */
          )
          .replace(/[ \t\r\n]+/g, " ")
      );
    }

    return {
      partName,
      // No support for encryption.
      isEncrypted: false,
      headers,
      rawHeaderText: headerMap.rawHeaderText,
      contentType,
      body: "",
      parent,
      size: 0,
      parts: [],
    };
  },

  /** JSMime API **/
  startMessage() {
    this.allAttachments = [];
    this.mimeMsg = null;
    this.currentPartName = "";
    this.mimeTree = {
      parts: [],
      size: 0,
    };
    this.currentPart = this.mimeTree;
    this.options = this.options || {};
  },

  endMessage() {
    function removeParent(obj) {
      for (let prop in obj) {
        if (prop === "parent") {
          delete obj[prop];
        } else if (Array.isArray(prop)) {
          for (let entry of prop) {
            removeParent(entry);
          }
        } else if (typeof obj[prop] === "object") {
          removeParent(obj[prop]);
        }
      }
    }

    if (
      !Array.isArray(this.mimeTree.parts) ||
      this.mimeTree.parts.length == 0
    ) {
      return;
    }

    if (
      this.options.getMimePart &&
      this.mimeTree.parts[0].partName == this.options.getMimePart
    ) {
      this.mimeMsg = this.mimeTree.parts[0];
      this.mimeMsg.bodyAsTypedArray = jsmime.mimeutils.stringToTypedArray(
        this.mimeMsg.body
      );
      removeParent(this.mimeMsg);
    } else if (this.mimeTree.parts[0].parent) {
      // The mimeTree includes a flat parts list at its root and a hierarchical
      // parts structure at mimeTree.parts[0].parent.
      this.mimeMsg = this.mimeTree.parts[0].parent;
      // Prepare top level entry, which represents the entire message. The
      // mimeTree does not include these information, so we fake them for now.
      this.mimeMsg.contentType = "message/rfc822";
      this.mimeMsg.partName = "";
      this.mimeMsg.headers = this.mimeTree.parts[0].headers;
      this.mimeMsg.size = this.mimeTree.parts[0].size;
      this.mimeMsg.allAttachments = this.allAttachments;
      // No support for encryption.
      this.mimeMsg.isEncrypted = false;
      removeParent(this.mimeMsg);
    }
  },

  startPart(partName, headerMap) {
    partName = "1" + (partName !== "" ? "." : "") + partName;
    let newPart = this.createPartObj(partName, headerMap, this.currentPart);

    if (partName.indexOf(this.currentPartName) === 0) {
      // Found sub-part.
      this.currentPart.parts.push(newPart);
    } else {
      // Found same or higher level.
      this.currentPart.parts.push(newPart);
    }
    this.currentPartName = partName;
    this.currentPart = newPart;
  },

  endPart(partName) {
    let isAttachment = false;

    // Add the attachment name, if needed.
    if (this.isAttachment(this.currentPart)) {
      isAttachment = true;
      this.currentPart.name = this.getAttachmentName(this.currentPart);
    }
    // Add size.
    let size = this.currentPart.body.length;
    this.currentPart.size += size;
    this.currentPart.parent.size += size;
    // Remove body.
    if (
      (isAttachment && !this.options.includeAttachments) ||
      this.currentPart.body == ""
    ) {
      delete this.currentPart.body;
    }
    if (isAttachment) {
      this.allAttachments.push(this.currentPart);
    }

    this.currentPart = this.currentPart.parent;
  },

  deliverPartData(partName, data) {
    this.currentPart.body += data;
  },
};

var ExtractHeadersEmitter = {
  startPart(partNum, headers) {
    if (partNum == "") {
      this.headers = headers;
    }
  },
};

var ExtractHeadersAndBodyEmitter = {
  body: "",
  startPart: ExtractHeadersEmitter.startPart,
  deliverPartData(partNum, data) {
    if (partNum == "") {
      this.body += data;
    }
  },
};

// Sets appropriate default options for chrome-privileged environments
function setDefaultParserOptions(opts) {
  if (!("onerror" in opts)) {
    opts.onerror = Cu.reportError;
  }
}

var MimeParser = {
  /***
   * Determine an arbitrary "parameter" part of a mail header.
   *
   * @param {string} headerStr - The string containing all parts of the header.
   * @param {string} parameter - The parameter we are looking for.
   *
   *
   * 'multipart/signed; protocol="xyz"', 'protocol' --> returns "xyz"
   *
   * @return {string} String containing the value of the parameter; or "".
   */

  getParameter(headerStr, parameter) {
    parameter = parameter.toLowerCase();
    headerStr = headerStr.replace(/[\r\n]+[ \t]+/g, "");

    let hdrMap = jsmime.headerparser.parseParameterHeader(
      ";" + headerStr,
      true,
      true
    );

    for (let [key, value] of hdrMap.entries()) {
      if (parameter == key.toLowerCase()) {
        return value;
      }
    }

    return "";
  },

  /**
   * Triggers an asynchronous parse of the given input.
   *
   * The input is an input stream; the stream will be read until EOF and then
   * closed upon completion. Both blocking and nonblocking streams are
   * supported by this implementation, but it is still guaranteed that the first
   * callback will not happen before this method returns.
   *
   * @param input   An input stream of text to parse.
   * @param emitter The emitter to receive callbacks on.
   * @param opts    A set of options for the parser.
   */
  parseAsync(input, emitter, opts) {
    // Normalize the input into an input stream.
    if (!(input instanceof Ci.nsIInputStream)) {
      throw new Error("input is not a recognizable type!");
    }

    // We need a pump for the listener
    var pump = Cc["@mozilla.org/network/input-stream-pump;1"].createInstance(
      Ci.nsIInputStreamPump
    );
    pump.init(input, 0, 0, true);

    // Make a stream listener with the given emitter and use it to read from
    // the pump.
    var parserListener = MimeParser.makeStreamListenerParser(emitter, opts);
    pump.asyncRead(parserListener);
  },

  /**
   * Triggers an synchronous parse of the given input.
   *
   * The input is a string that is immediately parsed, calling all functions on
   * the emitter before this function returns.
   *
   * @param input   A string or input stream of text to parse.
   * @param emitter The emitter to receive callbacks on.
   * @param opts    A set of options for the parser.
   */
  parseSync(input, emitter, opts) {
    // We only support string parsing if we are trying to do this parse
    // synchronously.
    if (typeof input != "string") {
      throw new Error("input is not a recognizable type!");
    }
    setDefaultParserOptions(opts);
    var parser = new jsmime.MimeParser(emitter, opts);
    parser.deliverData(input);
    parser.deliverEOF();
  },

  /**
   * Returns a stream listener that feeds data into a parser.
   *
   * In addition to the functions on the emitter that the parser may use, the
   * generated stream listener will also make calls to onStartRequest and
   * onStopRequest on the emitter (if they exist).
   *
   * @param emitter The emitter to receive callbacks on.
   * @param opts    A set of options for the parser.
   */
  makeStreamListenerParser(emitter, opts) {
    var StreamListener = {
      onStartRequest(aRequest) {
        try {
          if ("onStartRequest" in emitter) {
            emitter.onStartRequest(aRequest);
          }
        } finally {
          this._parser.resetParser();
        }
      },
      onStopRequest(aRequest, aStatus) {
        this._parser.deliverEOF();
        if ("onStopRequest" in emitter) {
          emitter.onStopRequest(aRequest, aStatus);
        }
      },
      onDataAvailable(aRequest, aStream, aOffset, aCount) {
        var scriptIn = Cc[
          "@mozilla.org/scriptableinputstream;1"
        ].createInstance(Ci.nsIScriptableInputStream);
        scriptIn.init(aStream);
        // Use readBytes instead of read to handle embedded NULs properly.
        this._parser.deliverData(scriptIn.readBytes(aCount));
      },
      QueryInterface: ChromeUtils.generateQI([
        "nsIStreamListener",
        "nsIRequestObserver",
      ]),
    };
    setDefaultParserOptions(opts);
    StreamListener._parser = new jsmime.MimeParser(emitter, opts);
    return StreamListener;
  },

  /**
   * Returns a new raw MIME parser.
   *
   * Prefer one of the other methods where possible, since the input here must
   * be driven manually.
   *
   * @param emitter The emitter to receive callbacks on.
   * @param opts    A set of options for the parser.
   */
  makeParser(emitter, opts) {
    setDefaultParserOptions(opts);
    return new jsmime.MimeParser(emitter, opts);
  },

  /**
   * Returns a mimeMsg object for the given input. The returned object tries to
   * be compatible with the return value of MsgHdrToMimeMessage. Differences:
   *  - no support for encryption
   *  - calculated sizes differ slightly
   *  - allAttachments includes the content and not a URL
   *
   * The input is any type of input that would be accepted by parseSync.
   *
   * @param input   A string of text to parse.
   */
  extractMimeMsg(input, options) {
    var emitter = Object.create(ExtractMimeMsgEmitter);
    // Set default options.
    emitter.options = {
      includeAttachments: true,
      getMimePart: "",
    };
    // Overide default options.
    for (let option of Object.keys(options)) {
      emitter.options[option] = options[option];
    }

    MimeParser.parseSync(input, emitter, {
      // jsmime does not use the "1." prefix for the partName.
      pruneat: emitter.options.getMimePart
        .split(".")
        .slice(1)
        .join("."),
      bodyformat: "decode",
      stripcontinuations: true,
      strformat: "binarystring",
    });
    return emitter.mimeMsg;
  },

  /**
   * Returns a dictionary of headers for the given input.
   *
   * The input is any type of input that would be accepted by parseSync. What
   * is returned is a JS object that represents the headers of the entire
   * envelope as would be received by startPart when partNum is the empty
   * string.
   *
   * @param input   A string of text to parse.
   */
  extractHeaders(input) {
    var emitter = Object.create(ExtractHeadersEmitter);
    MimeParser.parseSync(input, emitter, { pruneat: "", bodyformat: "none" });
    return emitter.headers;
  },

  /**
   * Returns the headers and body for the given input message.
   *
   * The return value is an array whose first element is the dictionary of
   * headers (as would be returned by extractHeaders) and whose second element
   * is a binary string of the entire body of the message.
   *
   * @param input   A string of text to parse.
   */
  extractHeadersAndBody(input) {
    var emitter = Object.create(ExtractHeadersAndBodyEmitter);
    MimeParser.parseSync(input, emitter, { pruneat: "", bodyformat: "raw" });
    return [emitter.headers, emitter.body];
  },

  // Parameters for parseHeaderField

  /**
   * Parse the header as if it were unstructured.
   *
   * This results in the same string if no other options are specified. If other
   * options are specified, this causes the string to be modified appropriately.
   */
  HEADER_UNSTRUCTURED: 0x00,
  /**
   * Parse the header as if it were in the form text; attr=val; attr=val.
   *
   * Such headers include Content-Type, Content-Disposition, and most other
   * headers used by MIME as opposed to messages.
   */
  HEADER_PARAMETER: 0x02,
  /**
   * Parse the header as if it were a sequence of mailboxes.
   */
  HEADER_ADDRESS: 0x03,

  /**
   * This decodes parameter values according to RFC 2231.
   *
   * This flag means nothing if HEADER_PARAMETER is not specified.
   */
  HEADER_OPTION_DECODE_2231: 0x10,
  /**
   * This decodes the inline encoded-words that are in RFC 2047.
   */
  HEADER_OPTION_DECODE_2047: 0x20,
  /**
   * This converts the header from a raw string to proper Unicode.
   */
  HEADER_OPTION_ALLOW_RAW: 0x40,

  // Convenience for all three of the above.
  HEADER_OPTION_ALL_I18N: 0x70,

  /**
   * Parse a header field according to the specification given by flags.
   *
   * Permissible flags begin with one of the HEADER_* flags, which may be or'd
   * with any of the HEADER_OPTION_* flags to modify the result appropriately.
   *
   * If the option HEADER_OPTION_ALLOW_RAW is passed, the charset parameter, if
   * present, is the charset to fallback to if the header is not decodable as
   * UTF-8 text. If HEADER_OPTION_ALLOW_RAW is passed but the charset parameter
   * is not provided, then no fallback decoding will be done. If
   * HEADER_OPTION_ALLOW_RAW is not passed, then no attempt will be made to
   * convert charsets.
   *
   * @param text    The value of a MIME or message header to parse.
   * @param flags   A set of flags that controls interpretation of the header.
   * @param charset A default charset to assume if no information may be found.
   */
  parseHeaderField(text, flags, charset) {
    // If we have a raw string, convert it to Unicode first
    if (flags & MimeParser.HEADER_OPTION_ALLOW_RAW) {
      text = jsmime.headerparser.convert8BitHeader(text, charset);
    }

    // The low 4 bits indicate the type of the header we are parsing. All of the
    // higher-order bits are flags.
    switch (flags & 0x0f) {
      case MimeParser.HEADER_UNSTRUCTURED:
        if (flags & MimeParser.HEADER_OPTION_DECODE_2047) {
          text = jsmime.headerparser.decodeRFC2047Words(text);
        }
        return text;
      case MimeParser.HEADER_PARAMETER:
        return jsmime.headerparser.parseParameterHeader(
          text,
          (flags & MimeParser.HEADER_OPTION_DECODE_2047) != 0,
          (flags & MimeParser.HEADER_OPTION_DECODE_2231) != 0
        );
      case MimeParser.HEADER_ADDRESS:
        return jsmime.headerparser.parseAddressingHeader(
          text,
          (flags & MimeParser.HEADER_OPTION_DECODE_2047) != 0
        );
      default:
        throw new Error("Illegal type of header field");
    }
  },
};
