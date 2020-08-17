/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["MimePart"];

let { jsmime } = ChromeUtils.import("resource:///modules/jsmime.jsm");
let { MimeEncoder } = ChromeUtils.import("resource:///modules/MimeEncoder.jsm");

Cu.importGlobalProperties(["fetch"]);

/**
 * Because ACString is 8-bit string, non-ASCII character takes multiple bytes.
 * For example, 世界 is represented as \xE4\xB8\x96\xE7\x95\x8C. This function
 * converts ACString to ArrayBuffer, which can then be passed to a TextDecoder
 * or OS.File.write.
 * @param {string} str - the string to convert to an ArrayBuffer
 * @returns {ArrayBuffer}
 */
function byteStringToArrayBuffer(str) {
  let strLen = str.length;
  let buf = new ArrayBuffer(strLen);
  let arr = new Uint8Array(buf);
  for (let i = 0; i < strLen; i++) {
    arr[i] = str.charCodeAt(i);
  }
  return buf;
}

/**
 * Convert ArrayBuffer to 8-bit string.
 * @param {ArrayBuffer} buf - the ArrayBuffer to convert to a string
 * @returns {string}
 */
function arrayBufferToByteString(buf) {
  let CHUNK_SIZE = 65536;
  let arr = new Uint8Array(buf);
  let arrLen = arr.length;
  if (arrLen < CHUNK_SIZE) {
    return String.fromCharCode.apply(null, arr);
  }
  let result = "";
  for (let i = 0; i < Math.ceil(arrLen / CHUNK_SIZE); i++) {
    let chunk = arr.subarray(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    result += String.fromCharCode.apply(null, chunk);
  }
  return result;
}

/**
 * A class to represent a RFC2045 message. MimePart can be nested, each MimePart
 * can contain a list of MimePart. HTML and plain text are parts as well.
 */
class MimePart {
  /**
   * Init private properties, it's best not to access those properties directly
   * from the outside.
   */
  constructor(
    charset = "",
    contentType = "",
    forceMsgEncoding = false,
    isMainBody = false
  ) {
    this._charset = charset;
    this._contentType = contentType;
    this._forceMsgEncoding = forceMsgEncoding;
    this._isMainBody = isMainBody;

    this._headers = new Map();
    // 8-bit string to avoid converting back and forth.
    this._bodyText = "";
    this._bodyAttachment = null;
    this._separator = "";
    this._parts = [];
  }

  /**
   * Set a header.
   * @param {string} name - The header name, e.g. "Content-Type"
   * @param {string} content - The header content, e.g. "text/plain"
   */
  setHeader(name, content) {
    // _headers will be passed to jsmime, which requires header content to be an
    // array.
    this._headers.set(name, [content]);
  }

  /**
   * Set headers by an iterable.
   * @param {Iterable.<string, string>} entries - The header entries.
   */
  setHeaders(entries) {
    for (let [name, content] of entries) {
      this.setHeader(name, content);
    }
  }

  /**
   * @type {string} text - The string to use as body
   */
  set bodyText(text) {
    this._bodyText = text;
  }

  /**
   * @type {nsIMsgAttachment} attachment - The attachment to use as body
   */
  set bodyAttachment(attachment) {
    this._bodyAttachment = attachment;
  }

  /**
   * Set the content type to multipart/<subtype>.
   * @param {string} subtype - usually "alternative" or "mixed".
   */
  initMultipart(subtype) {
    this._separator = this._makePartSeparator();
    this.setHeader(
      "Content-Type",
      `multipart/${subtype}; boundary="${this._separator}"`
    );
  }

  /**
   * Add a child part.
   * @param {MimePart} part - A MimePart.
   */
  addPart(part) {
    this._parts.push(part);
  }

  /**
   * Add child parts.
   * @param {MimePart[]} parts - An array of MimePart.
   */
  addParts(parts) {
    this._parts.push(...parts);
  }

  /**
   * Fetch the attachment file to get its content type and content.
   * @returns {string}
   */
  async fetchFile() {
    let res = await fetch(this._bodyAttachment.url);
    this._contentType = res.headers.get("content-type");

    // File name can contain non-ASCII chars, encode according to RFC 2047.
    let encodedName = this._encodeHeaderParameter(
      "name",
      this._bodyAttachment.name
    );
    let encodedFileName = this._encodeHeaderParameter(
      "filename",
      this._bodyAttachment.name
    );
    this.setHeader(
      "Content-Type",
      `${this._contentType}; name="${encodedName}"`
    );
    this.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodedFileName}"`
    );

    // Determine Content-Transfer-Encoding and encode file content accordingly.
    let buf = await res.arrayBuffer();
    return arrayBufferToByteString(buf);
  }

  /**
   * Recursively write a MimePart and its parts to a file.
   * @param {OS.File} file - The output file to contain a RFC2045 message.
   */
  async write(file) {
    this._outFile = file;
    let bodyString = this._bodyText;
    // If this is an attachment part, use the attachment content as bodyString.
    if (this._bodyAttachment) {
      bodyString = await this.fetchFile();
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
      this.setHeader("Content-Transfer-Encoding", encoder.encoding);
      bodyString = encoder.encode();
    }

    // Write out headers.
    await this._writeString(
      jsmime.headeremitter.emitStructuredHeaders(this._headers, {})
    );

    // Recursively write out parts.
    if (this._parts.length) {
      // single part message
      if (!this._separator && this._parts.length === 1) {
        await this._parts[0].write(file);
        await this._writeString(`${bodyString}\r\n`);
        return;
      }

      await this._writeString("\r\n");

      // multipart message
      for (let part of this._parts) {
        await this._writeString(`--${this._separator}\r\n`);
        await part.write(file);
      }
      await this._writeString(`--${this._separator}--\r\n`);
    }

    // Write out body.
    await this._writeString(`\r\n${bodyString}\r\n`);
  }

  /**
   * Use TextEncoder.encode would be incorrect here since the argument is not
   * UTF-8 string.
   */
  async _writeString(str) {
    await this._outFile.write(new DataView(byteStringToArrayBuffer(str)));
  }

  /**
   * Use 12 hyphen characters and 24 random base64 characters as separator.
   */
  _makePartSeparator() {
    return (
      "------------" +
      btoa(
        String.fromCharCode(
          ...[...Array(18)].map(() => Math.floor(Math.random() * 256))
        )
      )
    );
  }

  /**
   * Use nsIMimeConverter to encode header parameter according to RFC 2047.
   * @param {string} name - The parameter name, e.g. "filename"
   * @param {string} value - The parameter value, e.g. "screen.png"
   */
  _encodeHeaderParameter(name, value) {
    let converter = Cc["@mozilla.org/messenger/mimeconverter;1"].getService(
      Ci.nsIMimeConverter
    );
    return converter.encodeMimePartIIStr_UTF8(
      value,
      false,
      name.length,
      Ci.nsIMimeConverter.MIME_ENCODED_WORD_SIZE
    );
  }
}
