/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
// vim:set ts=2 sw=2 sts=2 et ft=javascript:

var EXPORTED_SYMBOLS = ["MimeParser"];

var { jsmime } = ChromeUtils.import("resource:///modules/jsmime.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MailStringUtils } = ChromeUtils.import(
  "resource:///modules/MailStringUtils.jsm"
);

// Emitter class, for internal functions later on.
class ExtractMimeMsgEmitter {
  constructor(options, resolveCallback, rejectCallback) {
    this.options = {
      getMimePart: "",
      decodeSubMessages: true,
      includeAttachmentData: true,
    };
    // Override default options.
    for (const option of Object.keys(options)) {
      this.options[option] = options[option];
    }
    this.resolveCallback = resolveCallback;
    this.rejectCallback = rejectCallback;
  }

  onStopRequest(statusCode) {
    if (!Components.isSuccessCode(statusCode)) {
      if (this.rejectCallback) {
        this.rejectCallback(statusCode);
      }
      return;
    }

    if (this.resolveCallback) {
      this.resolveCallback(this.mimeMsg);
    }
  }

  getAttachmentName(part) {
    if (!part || !part.hasOwnProperty("headers")) {
      return "";
    }

    if (part.headers.hasOwnProperty("content-disposition")) {
      const filename = MimeParser.getParameter(
        part.headers["content-disposition"][0],
        "filename"
      );
      if (filename) {
        return filename;
      }
    }

    if (part.headers.hasOwnProperty("content-type")) {
      const name = MimeParser.getParameter(
        part.headers["content-type"][0],
        "name"
      );
      if (name) {
        return name;
      }
    }

    return "";
  }

  // All parts of content-disposition = "attachment" and parts of removed
  // attachments with content-type = "text/x-moz-deleted" are returned as
  // attachments.
  // For content-disposition = "inline", all parts except those with content-type
  // text/plain, text/html and text/enriched are returned as attachments.
  isAttachment(part) {
    if (!part) {
      return false;
    }

    const contentType = part.contentType || "text/plain";
    if (/^multipart\//i.test(contentType)) {
      return false;
    }
    if (/^text\/x\-moz\-deleted/i.test(contentType)) {
      return true;
    }

    let contentDisposition = "";
    if (
      Array.isArray(part.headers["content-disposition"]) &&
      part.headers["content-disposition"].length > 0
    ) {
      contentDisposition = part.headers["content-disposition"][0];
    }

    if (
      /^attachment/i.test(contentDisposition) ||
      contentType.search(/^text\/plain|^text\/html|^text\/enriched/i) === -1
    ) {
      return true;
    }

    return false;
  }

  /** JSMime API */
  startMessage() {
    this.mimeTree = {
      partName: "",
      contentType: "message/rfc822",
      parts: [],
      size: 0,
      headers: {},
      attachments: [],
      // No support for encryption.
      isEncrypted: false,
    };
    // partsPath is a hierarchical stack of parts from the root to the
    // current part.
    this.partsPath = [this.mimeTree];
  }

  endMessage() {
    // Prepare the mimeMsg object, which is the final output of the emitter.
    this.mimeMsg = null;
    if (this.mimeTree.parts.length == 0) {
      return;
    }

    // Check if only a specific mime part has been requested.
    if (this.options.getMimePart) {
      if (this.mimeTree.parts[0].partName == this.options.getMimePart) {
        this.mimeMsg = this.mimeTree.parts[0];
      }
      return;
    }

    this.mimeTree.attachments.sort((a, b) => a.partName > b.partName);
    this.mimeMsg = this.mimeTree;
  }

  startPart(partNum, headerMap) {
    const contentType = headerMap.contentType?.type
      ? headerMap.contentType.type
      : "text/plain";

    let headers = {};
    for (const [headerName, headerValue] of headerMap._rawHeaders) {
      // MsgHdrToMimeMessage always returns an array, even for single values.
      const valueArray = Array.isArray(headerValue)
        ? headerValue
        : [headerValue];
      // Return a binary string, to mimic MsgHdrToMimeMessage.
      headers[headerName] = valueArray.map(value => {
        return MailStringUtils.stringToByteString(value);
      });
    }

    // Get the most recent part from the hierarchical parts stack, which is the
    // parent of the new part to by added.
    const parentPart = this.partsPath[this.partsPath.length - 1];

    // Add a leading 1 to the partNum and convert the "$" sub-message deliminator.
    const partName = "1" + (partNum ? "." : "") + partNum.replaceAll("$", ".1");

    // MsgHdrToMimeMessage differentiates between the message headers and the
    // headers of the first part. jsmime.js however returns all headers of
    // the message in the first multipart/* part: Merge all headers into the
    // parent part and only keep content-* headers.
    if (parentPart.contentType.startsWith("message/")) {
      for (const [k, v] of Object.entries(headers)) {
        if (!parentPart.headers[k]) {
          parentPart.headers[k] = v;
        }
      }
      headers = Object.fromEntries(
        Object.entries(headers).filter(h => h[0].startsWith("content-"))
      );
    }

    // Add default content-type header.
    if (!headers.hasOwnProperty("content-type")) {
      headers["content-type"] = ["text/plain"];
    }

    const newPart = {
      partName,
      body: "",
      headers,
      contentType,
      size: 0,
      parts: [],
      // No support for encryption.
      isEncrypted: false,
    };
    newPart.isAttachment = this.isAttachment(newPart);

    // Add nested new part.
    parentPart.parts.push(newPart);
    // Push the newly added part into the hierarchical parts stack.
    this.partsPath.push(newPart);
  }

  endPart(partNum) {
    let deleteBody = false;
    // Get the most recent part from the hierarchical parts stack.
    let currentPart = this.partsPath[this.partsPath.length - 1];

    // Add size.
    const partSize = currentPart.size;

    if (currentPart.isAttachment) {
      currentPart.name = this.getAttachmentName(currentPart);
      this.mimeTree.attachments.push({ ...currentPart });
      deleteBody = !this.options.getMimePart;
    }

    if (deleteBody || currentPart.body == "") {
      delete currentPart.body;
    }

    // Remove content-disposition and content-transfer-encoding headers.
    currentPart.headers = Object.fromEntries(
      Object.entries(currentPart.headers).filter(
        h =>
          !["content-disposition", "content-transfer-encoding"].includes(h[0])
      )
    );

    // Set the parent of this part to be the new current part.
    this.partsPath.pop();

    // Add the size of this part to its parent as well.
    currentPart = this.partsPath[this.partsPath.length - 1];
    currentPart.size += partSize;
  }

  /**
   * The data parameter is either a string or a Uint8Array.
   */
  deliverPartData(partNum, data) {
    // Get the most recent part from the hierarchical parts stack.
    const currentPart = this.partsPath[this.partsPath.length - 1];
    currentPart.size += data.length;

    if (!this.options.includeAttachmentData && currentPart.isAttachment) {
      return;
    }

    if (typeof data === "string") {
      currentPart.body += data;
    } else {
      currentPart.body += MailStringUtils.uint8ArrayToByteString(data);
    }
  }
}

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

    const hdrMap = jsmime.headerparser.parseParameterHeader(
      ";" + headerStr,
      true,
      true
    );

    for (const [key, value] of hdrMap.entries()) {
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
   * @typedef MimeParseOptions
   * @property {boolean} [decodeSubMessages] - decode attached messages, instead
   *   of returning them as attachments
   * @property {boolean} [includeAttachmentData] - include the data of attachments
   */

  /**
   * Returns a mimeMsg object for the given input string. The returned object
   * tries to be compatible with the return value of MsgHdrToMimeMessage.
   *
   * Differences:
   *  - no support for encryption
   *  - returned attachments include the body and not the URL
   *  - returned attachments match either allInlineAttachments or
   *    allUserAttachments (decodeSubMessages = false)
   *  - does not eat TABs in headers, if they follow a CRLF
   *
   * The input is any type of input that would be accepted by parseSync.
   *
   * @param {string} input - A string of text to parse.
   * @param {MimeParseOptions} options
   *
   * @return {MimeMessagePart}
   */
  extractMimeMsg(input, options) {
    const emitter = new ExtractMimeMsgEmitter(options);
    MimeParser.parseSync(input, emitter, {
      // jsmime does not use the "1." prefix for the partName.
      // jsmime uses "$." as sub-message deliminator.
      pruneat: emitter.options.getMimePart
        .split(".")
        .slice(1)
        .join(".")
        .replaceAll(".1.", "$."),
      decodeSubMessages: emitter.options.decodeSubMessages,
      bodyformat: "decode",
      stripcontinuations: true,
      strformat: "unicode",
    });
    return emitter.mimeMsg;
  },

  /**
   * Returns a Promise for a mimeMsg object for the given msgUri. Uses the same
   * parser as extractMimeMsg(), but the message is streamed.
   *
   * @param {string} msgUri - Uri of message to parse.
   * @param {MimeParseOptions} options
   *
   * @return {Promise<MimeMessagePart>}
   */
  streamMimeMsg(msgUri, options) {
    const {
      promise: promiseMimeMsg,
      resolve: resolveCallback,
      reject: rejectCallback,
    } = Promise.withResolvers();

    const emitter = new ExtractMimeMsgEmitter(
      options,
      resolveCallback,
      rejectCallback
    );
    const parserListener = MimeParser.makeStreamListenerParser(emitter, {
      // jsmime does not use the "1." prefix for the partName.
      // jsmime uses "$." as sub-message deliminator.
      pruneat: emitter.options.getMimePart
        .split(".")
        .slice(1)
        .join(".")
        .replaceAll(".1.", "$."),
      decodeSubMessages: emitter.options.decodeSubMessages,
      bodyformat: "decode",
      stripcontinuations: true,
      strformat: "unicode",
    });

    MailServices.messageServiceFromURI(msgUri).streamMessage(
      msgUri,
      parserListener,
      null, // aMsgWindow
      null, // aUrlListener
      false, // aConvertData
      "" //aAdditionalHeader
    );

    return promiseMimeMsg;
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
