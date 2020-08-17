/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["MimeMessage"];

let { OS } = ChromeUtils.import("resource://gre/modules/osfile.jsm");
let { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
let { MimePart } = ChromeUtils.import("resource:///modules/MimePart.jsm");

/**
 * A class to create a top MimePart and write to a tmp file.
 * Currently, only plain and/or html text without any attachments is
 * supported. It works like this:
 * 1. Collect top level MIME headers
 * 2. Construct a MimePart instance, which can be nested
 * 3. Write the MimePart to a tmp file, e.g. /tmp/nsemail.eml
 * NOTE: It's possible we will want to replace nsIMsgSend with the interfaces of
 * MimeMessage. As a part of it, we will add a `send` method to this class.
 */
class MimeMessage {
  /**
   * Construct a MimeMessage.
   * @param {nsIMsgIdentity} userIdentity
   * @param {nsIMsgCompFields} compFields
   * @param {string} bodyType
   * @param {string} bodyText
   */
  constructor(userIdentity, compFields, bodyType, bodyText) {
    this._userIdentity = userIdentity;
    this._compFields = compFields;
    this._bodyType = bodyType;
    this._bodyText = bodyText;
  }

  /**
   * Write a MimeMessage to a tmp file.
   * @returns {nsIFile}
   */
  async createMessageFile() {
    let topPart = this._initMimePart();
    let { path, file: fileWriter } = await OS.File.openUnique(
      OS.Path.join(OS.Constants.Path.tmpDir, "nsemail.eml")
    );
    await topPart.write(fileWriter);
    await fileWriter.close();

    let file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(path);
    return file;
  }

  /**
   * Create a top MimePart to represent the full message.
   * @returns {MimePart}
   */
  _initMimePart() {
    let topPart = new MimePart();
    topPart.setHeaders(this._gatherMimeHeaders());
    let mainParts = this._gatherMainParts();
    let attachmentParts = this._gatherAttachmentParts();

    if (attachmentParts.length > 0) {
      // Use multipart/mixed as long as there is at least one attachment.
      topPart.initMultipart("mixed");
      if (mainParts.length > 1) {
        // Wrap mainParts inside a multipart/alternative MimePart.
        let alternativePart = new MimePart();
        alternativePart.initMultipart("alternative");
        alternativePart.addParts(mainParts);
        topPart.addPart(alternativePart);
      } else {
        topPart.addParts(mainParts);
      }
      topPart.addParts(attachmentParts);
    } else {
      if (mainParts.length > 1) {
        // Mark the topPart as multipart/alternative.
        topPart.initMultipart("alternative");
      }
      topPart.addParts(mainParts);
    }

    return topPart;
  }

  /**
   * Collect top level headers like From/To/Subject into a Map.
   */
  _gatherMimeHeaders() {
    let messageId = this._compFields.getHeader("Message-Id");
    if (!messageId) {
      messageId = Cc["@mozilla.org/messengercompose/computils;1"]
        .createInstance(Ci.nsIMsgCompUtils)
        .msgGenerateMessageId(this._userIdentity);
    }
    let headers = new Map([
      ["Message-Id", messageId],
      ["Date", new Date()],
      ["MIME-Version", "1.0"],
      [
        "User-Agent",
        Cc["@mozilla.org/network/protocol;1?name=http"].getService(
          Ci.nsIHttpProtocolHandler
        ).userAgent,
      ],
    ]);

    for (let headerName of [...this._compFields.headerNames]) {
      let headerContent = this._compFields.getHeader(headerName);
      if (headerContent) {
        headers.set(headerName, headerContent);
      }
    }

    return headers;
  }

  /**
   * Determine if the message should include an HTML part, a plain part or both.
   * @returns {MimePart[]}
   */
  _gatherMainParts() {
    let charset = this._compFields.characterSet;
    let formatFlowed = Services.prefs.getBoolPref(
      "mailnews.send_plaintext_flowed"
    );
    let delsp = false;
    let disallowBreaks = true;
    if (charset.startsWith("ISO-2022-JP")) {
      // Make sure we honour RFC 1468. For encoding in ISO-2022-JP we need to
      // send short lines to allow 7bit transfer encoding.
      disallowBreaks = false;
      if (formatFlowed) {
        delsp = true;
      }
    }
    let charsetParams = `; charset=${charset}`;
    let formatParams = "";
    if (formatFlowed) {
      // Set format=flowed as in RFC 2646 according to the preference.
      formatParams += "; format=flowed";
    }
    if (delsp) {
      formatParams += "; delsp=yes";
    }

    // body is 8-bit string, save it directly in MimePart to avoid converting
    // back and forth.
    let htmlPart = null;
    let plainPart = null;
    let parts = [];

    if (this._bodyType === "text/html") {
      htmlPart = new MimePart(
        charset,
        this._bodyType,
        this._compFields.forceMsgEncoding,
        true
      );
      htmlPart.setHeader("Content-Type", `text/html${charsetParams}`);
      htmlPart.bodyText = this._bodyText;
    } else if (this._bodyType === "text/plain") {
      plainPart = new MimePart(
        charset,
        this._bodyType,
        this._compFields.forceMsgEncoding,
        true
      );
      plainPart.setHeader(
        "Content-Type",
        `text/plain${charsetParams}${formatParams}`
      );
      plainPart.bodyText = this._bodyText;
      parts.push(plainPart);
    }

    // Assemble a multipart/alternative message.
    if (
      (this._compFields.forcePlainText ||
        this._compFields.useMultipartAlternative) &&
      plainPart === null &&
      htmlPart !== null
    ) {
      plainPart = new MimePart(
        charset,
        "text/plain",
        this._compFields.forceMsgEncoding,
        true
      );
      plainPart.setHeader(
        "Content-Type",
        `text/plain${charsetParams}${formatParams}`
      );
      plainPart.bodyText = this._convertToPlainText(
        this._bodyText,
        formatFlowed,
        delsp,
        disallowBreaks
      );

      parts.push(plainPart);
    }

    // If useMultipartAlternative is true, send multipart/alternative message.
    // Otherwise, send the plainPart only.
    if (htmlPart) {
      if (
        (plainPart && this._compFields.useMultipartAlternative) ||
        !plainPart
      ) {
        parts.push(htmlPart);
      }
    }

    return parts;
  }

  /**
   * Collect local attachments.
   * @returns {Array.<MimePart>}
   */
  _gatherAttachmentParts() {
    let charset = this._compFields.characterSet;
    let attachments = [...this._compFields.attachments];
    let parts = [];
    for (let attachment of attachments) {
      if (attachment.sendViaCloud) {
        // TODO: handle cloud attachments.
        continue;
      }
      let part = new MimePart(
        charset,
        null,
        this._compFields.forceMsgEncoding,
        false
      );
      part.bodyAttachment = attachment;
      parts.push(part);
    }
    return parts;
  }

  /**
   * Convert html to text to form a multipart/alternative message. The output
   * depends on preference and message charset.
   */
  _convertToPlainText(
    input,
    formatFlowed,
    delsp,
    formatOutput,
    disallowBreaks
  ) {
    let wrapWidth = Services.prefs.getIntPref("mailnews.wraplength", 72);
    if (wrapWidth > 990) {
      wrapWidth = 990;
    } else if (wrapWidth < 10) {
      wrapWidth = 10;
    }

    let flags =
      Ci.nsIDocumentEncoder.OutputPersistNBSP |
      Ci.nsIDocumentEncoder.OutputFormatted;
    if (formatFlowed) {
      flags |= Ci.nsIDocumentEncoder.OutputFormatFlowed;
    }
    if (delsp) {
      flags |= Ci.nsIDocumentEncoder.OutputFormatDelSp;
    }
    if (disallowBreaks) {
      flags |= Ci.nsIDocumentEncoder.OutputDisallowLineBreaking;
    }

    let parserUtils = Cc["@mozilla.org/parserutils;1"].getService(
      Ci.nsIParserUtils
    );
    return parserUtils.convertToPlainText(input, flags, wrapWidth);
  }
}
