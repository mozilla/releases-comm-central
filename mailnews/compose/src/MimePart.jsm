/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["MimePart", "MimeMultiPart"];

let { jsmime } = ChromeUtils.import("resource:///modules/jsmime.jsm");
let { MimeEncoder } = ChromeUtils.import("resource:///modules/MimeEncoder.jsm");
let { MsgUtils } = ChromeUtils.import(
  "resource:///modules/MimeMessageUtils.jsm"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MailStringUtils } = ChromeUtils.import(
  "resource:///modules/MailStringUtils.jsm"
);
var { NetUtil } = ChromeUtils.importESModule(
  "resource://gre/modules/NetUtil.sys.mjs"
);

/**
 * A class to represent a RFC2045 message. MimePart can be nested, each MimePart
 * can contain a list of MimePart. HTML and plain text are parts as well. Use
 * class MimeMultiPart for multipart/*, that's why this class doesn't expose an
 * addPart method
 */
class MimePart {
  /**
   * @param {string} contentType - Content type of the part, e.g. text/plain.
   * @param {boolean} forceMsgEncoding - A flag used to determine Content-Transfer-Encoding.
   * @param {boolean} isMainBody - The part is main part or an attachment part.
   */
  constructor(contentType = "", forceMsgEncoding = false, isMainBody = false) {
    this._charset = "UTF-8";
    this._contentType = contentType;
    this._forceMsgEncoding = forceMsgEncoding;
    this._isMainBody = isMainBody;

    this._headers = new Map();
    // 8-bit string to avoid converting back and forth.
    this._bodyText = "";
    this._bodyAttachment = null;
    this._contentDisposition = null;
    this._contentId = null;
    this._separator = "";
    this._parts = [];
  }

  /**
   * @type {BinaryString} text - The string to use as body.
   */
  set bodyText(text) {
    this._bodyText = text.replaceAll("\r\n", "\n").replaceAll("\n", "\r\n");
  }

  /**
   * @type {MimePart[]} - The child parts.
   */
  get parts() {
    return this._parts;
  }

  /**
   * @type {MimePart[]} parts - The child parts.
   */
  set parts(parts) {
    this._parts = parts;
  }

  /**
   * @type {string} - The separator string.
   */
  get separator() {
    return this._separator;
  }

  /**
   * Set a header.
   *
   * @param {string} name - The header name, e.g. "content-type".
   * @param {string} content - The header content, e.g. "text/plain".
   */
  setHeader(name, content) {
    if (!content) {
      return;
    }
    // There is no Content-Type encoder in jsmime yet. If content is not string,
    // assume it's already a structured header.
    if (name == "content-type" || typeof content != "string") {
      // _headers will be passed to jsmime, which requires header content to be
      // an array.
      this._headers.set(name, [content]);
      return;
    }
    try {
      this._headers.set(name, [
        jsmime.headerparser.parseStructuredHeader(name, content),
      ]);
    } catch (e) {
      this._headers.set(name, [content.trim()]);
    }
  }

  /**
   * Delete a header.
   *
   * @param {string} name - The header name to delete, e.g. "content-type".
   */
  deleteHeader(name) {
    this._headers.delete(name);
  }

  /**
   * Set headers by an iterable.
   *
   * @param {Iterable.<string, string>} entries - The header entries.
   */
  setHeaders(entries) {
    for (let [name, content] of entries) {
      this.setHeader(name, content);
    }
  }

  /**
   * Set an attachment as body, with optional contentDisposition and contentId.
   *
   * @param {nsIMsgAttachment} attachment - The attachment to use as body.
   * @param {string} [contentDisposition=attachment] - "attachment" or "inline".
   * @param {string} [contentId] - The url of an embedded object is cid:contentId.
   */
  setBodyAttachment(
    attachment,
    contentDisposition = "attachment",
    contentId = null
  ) {
    this._bodyAttachment = attachment;
    this._contentDisposition = contentDisposition;
    this._contentId = contentId;
  }

  /**
   * Add a child part.
   *
   * @param {MimePart} part - A MimePart.
   */
  addPart(part) {
    this._parts.push(part);
  }

  /**
   * Add child parts.
   *
   * @param {MimePart[]} parts - An array of MimePart.
   */
  addParts(parts) {
    this._parts.push(...parts);
  }

  /**
   * Pick an encoding according to _bodyText or _bodyAttachment content. Set
   * content-transfer-encoding header, then return the encoded value.
   *
   * @returns {BinaryString}
   */
  async getEncodedBodyString() {
    let bodyString = this._bodyText;
    // If this is an attachment part, use the attachment content as bodyString.
    if (this._bodyAttachment) {
      try {
        bodyString = await this._fetchAttachment();
      } catch (e) {
        MsgUtils.sendLogger.error(
          `Failed to fetch attachment; name=${this._bodyAttachment.name}, url=${this._bodyAttachment.url}, error=${e}`
        );
        throw Components.Exception(
          "Failed to fetch attachment",
          MsgUtils.NS_MSG_ERROR_ATTACHING_FILE,
          e.stack,
          this._bodyAttachment
        );
      }
    }
    if (bodyString) {
      let encoder = new MimeEncoder(
        this._charset,
        this._contentType,
        this._forceMsgEncoding,
        this._isMainBody,
        bodyString
      );
      encoder.pickEncoding();
      this.setHeader("content-transfer-encoding", encoder.encoding);
      bodyString = encoder.encode();
    } else if (this._isMainBody) {
      this.setHeader("content-transfer-encoding", "7bit");
    }
    return bodyString;
  }

  /**
   * Use jsmime to convert _headers to string.
   *
   * @returns {string}
   */
  getHeaderString() {
    return jsmime.headeremitter.emitStructuredHeaders(this._headers, {
      useASCII: true,
      sanitizeDate: Services.prefs.getBoolPref(
        "mail.sanitize_date_header",
        false
      ),
    });
  }

  /**
   * Fetch the attached message file to get its content.
   *
   * @returns {string}
   */
  async _fetchMsgAttachment() {
    let msgService = MailServices.messageServiceFromURI(
      this._bodyAttachment.url
    );
    return new Promise((resolve, reject) => {
      let streamListener = {
        _data: "",
        _stream: null,
        onDataAvailable(request, inputStream, offset, count) {
          if (!this._stream) {
            this._stream = Cc[
              "@mozilla.org/scriptableinputstream;1"
            ].createInstance(Ci.nsIScriptableInputStream);
            this._stream.init(inputStream);
          }
          this._data += this._stream.read(count);
        },
        onStartRequest() {},
        onStopRequest(request, status) {
          if (Components.isSuccessCode(status)) {
            resolve(this._data);
          } else {
            reject(`Fetch message attachment failed with status=${status}`);
          }
        },
        QueryInterface: ChromeUtils.generateQI(["nsIStreamListener"]),
      };

      msgService.streamMessage(
        this._bodyAttachment.url,
        streamListener,
        null, // msgWindow
        null, // urlListener
        false, // convertData
        "" // additionalHeader
      );
    });
  }

  /**
   * Fetch the attachment file to get its content type and content.
   *
   * Previously, we used the Fetch API to download all attachments, but Fetch
   * doesn't support url with embedded credentials (imap://name@server). As a
   * result, it's unreliable when having two mail accounts on the same IMAP
   * server.
   *
   * @returns {string}
   */
  async _fetchAttachment() {
    let url = this._bodyAttachment.url;
    MsgUtils.sendLogger.debug(`Fetching ${url}`);

    let content = "";
    if (/^[^:]+-message:/i.test(url)) {
      content = await this._fetchMsgAttachment();
      if (!content) {
        // Message content is empty usually means it's (re)moved.
        throw new Error("Message is gone");
      }
      this._contentType = "message/rfc822";
    } else {
      let channel = Services.io.newChannelFromURI(
        Services.io.newURI(url),
        null,
        Services.scriptSecurityManager.getSystemPrincipal(),
        null,
        Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
        Ci.nsIContentPolicy.TYPE_OTHER
      );
      content = await new Promise((resolve, reject) =>
        NetUtil.asyncFetch(channel, (stream, status, request) => {
          if (!Components.isSuccessCode(status)) {
            reject(`asyncFetch failed with status=${status}`);
            return;
          }
          let data = "";
          try {
            data = NetUtil.readInputStreamToString(stream, stream.available());
          } catch (e) {
            // stream.available() throws if the file is empty.
          }
          resolve(data);
        })
      );
      this._contentType =
        this._bodyAttachment.contentType || channel.contentType;
    }

    let parmFolding = Services.prefs.getIntPref(
      "mail.strictly_mime.parm_folding",
      2
    );
    // File name can contain non-ASCII chars, encode according to RFC 2231.
    let encodedName, encodedFileName;
    if (this._bodyAttachment.name) {
      encodedName = MsgUtils.rfc2047EncodeParam(this._bodyAttachment.name);
      encodedFileName = MsgUtils.rfc2231ParamFolding(
        "filename",
        this._bodyAttachment.name
      );
    }
    this._charset = this._contentType.startsWith("text/")
      ? MailStringUtils.detectCharset(content)
      : "";

    let contentTypeParams = "";
    if (this._charset) {
      contentTypeParams += `; charset=${this._charset}`;
    }
    if (encodedName && parmFolding != 2) {
      contentTypeParams += `; name="${encodedName}"`;
    }
    this.setHeader("content-type", `${this._contentType}${contentTypeParams}`);
    if (encodedFileName) {
      this.setHeader(
        "content-disposition",
        `${this._contentDisposition}; ${encodedFileName}`
      );
    }
    if (this._contentId) {
      this.setHeader("content-id", `<${this._contentId}>`);
    }
    if (this._contentType == "text/html") {
      let contentLocation = MsgUtils.getContentLocation(
        this._bodyAttachment.url
      );
      this.setHeader("content-location", contentLocation);
    } else if (this._contentType == "application/pgp-keys") {
      this.setHeader("content-description", "OpenPGP public key");
    }

    return content;
  }
}

/**
 * A class to represent a multipart/* part inside a RFC2045 message.
 */
class MimeMultiPart extends MimePart {
  /**
   * @param {string} subtype - The multipart subtype, e.g. "alternative" or "mixed".
   */
  constructor(subtype) {
    super();
    this.subtype = subtype;
    this._separator = this._makePartSeparator();
    this.setHeader(
      "content-type",
      `multipart/${subtype}; boundary="${this._separator}"`
    );
  }

  /**
   * Use 12 hyphen characters and 24 random base64 characters as separator.
   */
  _makePartSeparator() {
    return "------------" + MsgUtils.randomString(24);
  }
}
