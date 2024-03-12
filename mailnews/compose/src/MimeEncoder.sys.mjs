/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const LINELENGTH_ENCODING_THRESHOLD = 990;
const MESSAGE_RFC822 = "message/rfc822";

/**
 * A class to pick Content-Transfer-Encoding for a MimePart, and encode MimePart
 * body accordingly.
 */
export class MimeEncoder {
  /**
   * Create a MimeEncoder.
   *
   * @param {string} charset
   * @param {string} contentType
   * @param {boolean} forceMsgEncoding
   * @param {boolean} isMainBody
   * @param {string} content
   */
  constructor(charset, contentType, forceMsgEncoding, isMainBody, content) {
    this._charset = charset;
    this._contentType = contentType.toLowerCase();
    this._forceMsgEncoding = forceMsgEncoding;
    this._isMainBody = isMainBody;
    this._body = content;
    this._bodySize = content.length;

    // The encoding value will be used to set Content-Transfer-Encoding header
    // and encode this._body.
    this._encoding = "";

    // Flags used to pick encoding.
    this._highBitCount = 0;
    this._unPrintableCount = 0;
    this._ctrlCount = 0;
    this._nullCount = 0;
    this._hasCr = 0;
    this._hasLf = 0;
    this._hasCrLf = 0;
    this._maxColumn = 0;
  }

  /**
   * @type {string}
   */
  get encoding() {
    return this._encoding;
  }

  /**
   * Use the combination of charset, content type and scanning this._body to
   * decide what encoding it should have.
   */
  pickEncoding() {
    this._analyzeBody();

    const strictlyMime = Services.prefs.getBoolPref("mail.strictly_mime");
    let needsB64 = false;
    let isUsingQP = false;

    // Allow users to override our percentage-wise guess on whether
    // the file is text or binary.
    const forceB64 = Services.prefs.getBoolPref("mail.file_attach_binary");

    // If the content-type is "image/" or something else known to be binary or
    // several flavors of newlines are present, use base64 unless we're attaching
    // a message (so that we don't get confused by newline conversions).
    if (
      !this._isMainBody &&
      (forceB64 ||
        this._requiresB64() ||
        this._hasCr + this._hasLf + this._hasCrLf != 1) &&
      this._contentType != MESSAGE_RFC822
    ) {
      needsB64 = true;
    } else {
      // Otherwise, we need to pick an encoding based on the contents of the
      // document.
      let encodeP = false;

      // Force quoted-printable if the sender does not allow conversion to 7bit.
      if (
        this._forceMsgEncoding ||
        this._maxColumn > LINELENGTH_ENCODING_THRESHOLD ||
        (strictlyMime && this._unPrintableCount) ||
        this._nullCount
      ) {
        if (
          this._isMainBody &&
          this._contentType == "text/plain" &&
          // From rfc3676#section-4.2, Quoted-Printable encoding SHOULD NOT be
          // used with Format=Flowed unless absolutely necessary.
          Services.prefs.getBoolPref("mailnews.send_plaintext_flowed")
        ) {
          needsB64 = true;
        } else {
          encodeP = true;
        }
      }

      // MIME requires a special case that these types never be encoded.
      if (
        this._contentType.startsWith("message") ||
        this._contentType.startsWith("multipart")
      ) {
        encodeP = false;
      }

      const manager = Cc["@mozilla.org/charset-converter-manager;1"].getService(
        Ci.nsICharsetConverterManager
      );
      let isCharsetMultiByte = false;
      try {
        isCharsetMultiByte =
          manager.getCharsetData(this._charset, ".isMultibyte") == "true";
      } catch {}

      // If the Mail charset is multibyte, we force it to use Base64 for
      // attachments.
      if (
        !this._isMainBody &&
        this._charset &&
        isCharsetMultiByte &&
        (this._contentType.startsWith("text") ||
          // text/vcard synonym
          this._contentType == "application/directory")
      ) {
        needsB64 = true;
      } else if (this._charset == "ISO-2022-JP") {
        this._encoding = "7bit";
      } else if (encodeP && this._unPrintableCount > this._bodySize / 10) {
        // If the document contains more than 10% unprintable characters,
        // then that seems like a good candidate for base64 instead of
        // quoted-printable.
        needsB64 = true;
      } else if (encodeP) {
        this._encoding = "quoted-printable";
        isUsingQP = true;
      } else if (this._highBitCount > 0) {
        this._encoding = "8bit";
      } else {
        this._encoding = "7bit";
      }
    }

    // Always base64 binary data.
    if (needsB64) {
      this._encoding = "base64";
    }

    // According to RFC 821 we must always have lines shorter than 998 bytes.
    // To encode "long lines" use a CTE that will transmit shorter lines.
    // Switch to base64 if we are not already using "quoted printable".

    // We don't do this for message/rfc822 attachments, since we can't
    // change the original Content-Transfer-Encoding of the message we're
    // attaching. We rely on the original message complying with RFC 821,
    // if it doesn't we won't either. Not ideal.
    if (
      this._contentType != MESSAGE_RFC822 &&
      this._maxColumn > LINELENGTH_ENCODING_THRESHOLD &&
      !isUsingQP
    ) {
      this._encoding = "base64";
    }
  }

  /**
   * Encode this._body according to the value of this.encoding.
   */
  encode() {
    let output;
    if (this.encoding == "base64") {
      output = this._encodeBase64();
    } else if (this.encoding == "quoted-printable") {
      output = this._encodeQP();
    } else {
      output = this._body.replaceAll("\r\n", "\n").replaceAll("\n", "\r\n");
    }
    if (!output.endsWith("\r\n")) {
      output += "\r\n";
    }
    return output;
  }

  /**
   * Scan this._body to set flags that will be used by pickEncoding.
   */
  _analyzeBody() {
    let currentColumn = 0;
    let prevCharWasCr = false;

    for (let i = 0; i < this._bodySize; i++) {
      const ch = this._body.charAt(i);
      const charCode = this._body.charCodeAt(i);
      if (charCode > 126) {
        this._highBitCount++;
        this._unPrintableCount++;
      } else if (ch < " " && !"\t\r\n".includes(ch)) {
        this._unPrintableCount++;
        this._ctrlCount++;
        if (ch == "\0") {
          this._nullCount++;
        }
      }

      if ("\r\n".includes(ch)) {
        if (ch == "\r") {
          if (prevCharWasCr) {
            this._hasCr = 1;
          } else {
            prevCharWasCr = true;
          }
        } else if (prevCharWasCr) {
          if (currentColumn == 0) {
            this._hasCrLf = 1;
          } else {
            this._hasCr = 1;
            this._hasLf = 1;
          }
          prevCharWasCr = false;
        } else {
          this._hasLf = 1;
        }

        if (this._maxColumn < currentColumn) {
          this._maxColumn = currentColumn;
        }
        currentColumn = 0;
      } else {
        currentColumn++;
      }
    }

    if (this._maxColumn < currentColumn) {
      this._maxColumn = currentColumn;
    }
  }

  /**
   * Determine if base64 is required according to contentType.
   */
  _requiresB64() {
    if (this._contentType == "application/x-unknown-content-type") {
      // Unknown types don't necessarily require encoding.  (Note that
      // "unknown" and "application/octet-stream" aren't the same.)
      return false;
    }
    if (
      this._contentType.startsWith("image/") ||
      this._contentType.startsWith("audio/") ||
      this._contentType.startsWith("video/") ||
      this._contentType.startsWith("application/")
    ) {
      // The following types are application/ or image/ types that are actually
      // known to contain textual data (meaning line-based, not binary, where
      // CRLF conversion is desired rather than disastrous.)  So, if the type
      // is any of these, it does not *require* base64, and if we do need to
      // encode it for other reasons, we'll probably use quoted-printable.
      // But, if it's not one of these types, then we assume that any subtypes
      // of the non-"text/" types are binary data, where CRLF conversion would
      // corrupt it, so we use base64 right off the bat.
      // The reason it's desirable to ship these as text instead of just using
      // base64 all the time is mainly to preserve the readability of them for
      // non-MIME users: if I mail a /bin/sh script to someone, it might not
      // need to be encoded at all, so we should leave it readable if we can.
      // This list of types was derived from the comp.mail.mime FAQ, section
      // 10.2.2, "List of known unregistered MIME types" on 2-Feb-96.
      const typesWhichAreReallyText = [
        "application/mac-binhex40", // APPLICATION_BINHEX
        "application/pgp", // APPLICATION_PGP
        "application/pgp-keys",
        "application/x-pgp-message", // APPLICATION_PGP2
        "application/postscript", // APPLICATION_POSTSCRIPT
        "application/x-uuencode", // APPLICATION_UUENCODE
        "application/x-uue", // APPLICATION_UUENCODE2
        "application/uue", // APPLICATION_UUENCODE4
        "application/uuencode", // APPLICATION_UUENCODE3
        "application/sgml",
        "application/x-csh",
        "application/javascript",
        "application/ecmascript",
        "application/x-javascript",
        "application/x-latex",
        "application/x-macbinhex40",
        "application/x-ns-proxy-autoconfig",
        "application/x-www-form-urlencoded",
        "application/x-perl",
        "application/x-sh",
        "application/x-shar",
        "application/x-tcl",
        "application/x-tex",
        "application/x-texinfo",
        "application/x-troff",
        "application/x-troff-man",
        "application/x-troff-me",
        "application/x-troff-ms",
        "application/x-troff-ms",
        "application/x-wais-source",
        "image/x-bitmap",
        "image/x-pbm",
        "image/x-pgm",
        "image/x-portable-anymap",
        "image/x-portable-bitmap",
        "image/x-portable-graymap",
        "image/x-portable-pixmap", // IMAGE_PPM
        "image/x-ppm",
        "image/x-xbitmap", // IMAGE_XBM
        "image/x-xbm", // IMAGE_XBM2
        "image/xbm", // IMAGE_XBM3
        "image/x-xpixmap",
        "image/x-xpm",
      ];
      if (typesWhichAreReallyText.includes(this._contentType)) {
        return false;
      }
      return true;
    }
    return false;
  }

  /**
   * Base64 encoding. See RFC 2045 6.8. We use the built-in `btoa`, then ensure
   * line width is no more than 72.
   */
  _encodeBase64() {
    const encoded = btoa(this._body);
    let ret = "";
    const length = encoded.length;
    let i = 0;
    const limit = 72;
    // @see https://github.com/eslint/eslint/issues/17807
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (i * limit > length) {
        break;
      }
      ret += encoded.substr(i * limit, limit) + "\r\n";
      i++;
    }
    return ret;
  }

  /**
   * Quoted-printable encoding. See RFC 2045 6.7.
   */
  _encodeQP() {
    let currentColumn = 0;
    const hexdigits = "0123456789ABCDEF";
    let white = false;
    let out = "";

    function encodeChar(ch) {
      const charCode = ch.charCodeAt(0);
      let ret = "=";
      ret += hexdigits[charCode >> 4];
      ret += hexdigits[charCode & 0xf];
      return ret;
    }

    for (let i = 0; i < this._bodySize; i++) {
      const ch = this._body.charAt(i);
      const charCode = this._body.charCodeAt(i);
      if (ch == "\r" || ch == "\n") {
        // If it's CRLF, swallow two chars instead of one.
        if (i + 1 < this._bodySize && ch == "\r" && this._body[i + 1] == "\n") {
          i++;
        }

        // Whitespace cannot be allowed to occur at the end of the line, so we
        // back up and replace the whitespace with its code.
        if (white) {
          const whiteChar = out.slice(-1);
          out = out.slice(0, -1);
          out += encodeChar(whiteChar);
        }

        // Now write out the newline.
        out += "\r";
        out += "\n";
        white = false;
        currentColumn = 0;
      } else if (
        currentColumn == 0 &&
        (ch == "." ||
          (ch == "F" &&
            (i >= this._bodySize - 1 || this._body[i + 1] == "r") &&
            (i >= this._bodySize - 2 || this._body[i + 2] == "o") &&
            (i >= this._bodySize - 3 || this._body[i + 3] == "m") &&
            (i >= this._bodySize - 4 || this._body[i + 4] == " ")))
      ) {
        // Just to be SMTP-safe, if "." appears in column 0, encode it.
        // If this line begins with "From " (or it could but we don't have enough
        // data in the buffer to be certain), encode the 'F' in hex to avoid
        // potential problems with BSD mailbox formats.
        white = false;
        out += encodeChar(ch);
        currentColumn += 3;
      } else if (
        (charCode >= 33 && charCode <= 60) ||
        (charCode >= 62 && charCode <= 126)
      ) {
        // Printable characters except for '='
        white = false;
        out += ch;
        currentColumn++;
      } else if (ch == " " || ch == "\t") {
        // Whitespace
        white = true;
        out += ch;
        currentColumn++;
      } else {
        white = false;
        out += encodeChar(ch);
        currentColumn += 3;
      }

      if (currentColumn >= 73) {
        // Soft line break for readability
        out += "=\r\n";
        white = false;
        currentColumn = 0;
      }
    }

    return out;
  }
}
