/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["MimeMessage"];

let { OS } = ChromeUtils.import("resource://gre/modules/osfile.jsm");
let { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
let { MimeMultiPart, MimePart } = ChromeUtils.import(
  "resource:///modules/MimePart.jsm"
);
let { MsgUtils } = ChromeUtils.import(
  "resource:///modules/MimeMessageUtils.jsm"
);

/**
 * A class to create a top MimePart and write to a tmp file. It works like this:
 * 1. collect top level MIME headers (_gatherMimeHeaders)
 * 2. collect HTML/plain main body as MimePart[] (_gatherMainParts)
 * 3. collect attachments as MimePart[] (_gatherAttachmentParts)
 * 4. construct a top MimePart with above headers and MimePart[] (_initMimePart)
 * 5. write the top MimePart to a tmp file (createMessageFile)
 * NOTE: It's possible we will want to replace nsIMsgSend with the interfaces of
 * MimeMessage. As a part of it, we will add a `send` method to this class.
 */
class MimeMessage {
  /**
   * Construct a MimeMessage.
   * @param {nsIMsgIdentity} userIdentity
   * @param {nsIMsgCompFields} compFields
   * @param {string} bodyType
   * @param {BinaryString} bodyText - This is ensured to be a 8-bit string, to
   * be handled the same as attachment content.
   * @param {nsMsgDeliverMode} deliverMode
   * @param {string} originalMsgURI
   * @param {MSG_ComposeType} compType
   * @param {nsIMsgAttachment[]} embeddedAttachments - Usually Embedded images.
   */
  constructor(
    userIdentity,
    compFields,
    bodyType,
    bodyText,
    deliverMode,
    originalMsgURI,
    compType,
    embeddedAttachments
  ) {
    this._userIdentity = userIdentity;
    this._compFields = compFields;
    this._fcc = MsgUtils.getFcc(
      userIdentity,
      compFields,
      originalMsgURI,
      compType
    );
    this._bodyType = bodyType;
    this._bodyText = bodyText;
    this._deliverMode = deliverMode;
    this._compType = compType;
    this._embeddedAttachments = embeddedAttachments;
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
    let { plainPart, htmlPart } = this._gatherMainParts();
    let embeddedParts = this._gatherEmbeddedParts();
    let attachmentParts = this._gatherAttachmentParts();

    let relatedPart = htmlPart;
    if (htmlPart && embeddedParts.length > 0) {
      relatedPart = new MimeMultiPart("related");
      relatedPart.addPart(htmlPart);
      relatedPart.addParts(embeddedParts);
    }
    let mainParts = [plainPart, relatedPart].filter(Boolean);
    let topPart;
    if (attachmentParts.length > 0) {
      // Use multipart/mixed as long as there is at least one attachment.
      topPart = new MimeMultiPart("mixed");
      if (plainPart && relatedPart) {
        // Wrap mainParts inside a multipart/alternative MimePart.
        let alternativePart = new MimeMultiPart("alternative");
        alternativePart.addParts(mainParts);
        topPart.addPart(alternativePart);
      } else {
        topPart.addParts(mainParts);
      }
      topPart.addParts(attachmentParts);
    } else {
      if (mainParts.length > 1) {
        // Mark the topPart as multipart/alternative.
        topPart = new MimeMultiPart("alternative");
      } else {
        topPart = new MimePart();
      }
      topPart.addParts(mainParts);
    }

    topPart.setHeaders(this._gatherMimeHeaders());

    return topPart;
  }

  /**
   * Collect top level headers like From/To/Subject into a Map.
   */
  _gatherMimeHeaders() {
    let messageId = this._compFields.getHeader("message-id");
    if (!messageId) {
      messageId = Cc["@mozilla.org/messengercompose/computils;1"]
        .createInstance(Ci.nsIMsgCompUtils)
        .msgGenerateMessageId(this._userIdentity);
    }
    let headers = new Map([
      ["message-id", messageId],
      ["date", new Date()],
      ["mime-version", "1.0"],
      [
        "user-agent",
        Cc["@mozilla.org/network/protocol;1?name=http"].getService(
          Ci.nsIHttpProtocolHandler
        ).userAgent,
      ],
    ]);

    for (let headerName of [...this._compFields.headerNames]) {
      // The headerName is always lowercase.
      if (
        headerName == "bcc" &&
        ![
          Ci.nsIMsgSend.nsMsgQueueForLater,
          Ci.nsIMsgSend.nsMsgSaveAsDraft,
          Ci.nsIMsgSend.nsMsgSaveAsTemplate,
        ].includes(this._deliverMode)
      ) {
        continue;
      }
      let headerContent = this._compFields.getRawHeader(headerName);
      if (headerContent) {
        headers.set(headerName, headerContent);
      }
    }
    let isDraft = [
      Ci.nsIMsgSend.nsMsgQueueForLater,
      Ci.nsIMsgSend.nsMsgDeliverBackground,
      Ci.nsIMsgSend.nsMsgSaveAsDraft,
      Ci.nsIMsgSend.nsMsgSaveAsTemplate,
    ].includes(this._deliverMode);

    let undisclosedRecipients = MsgUtils.getUndisclosedRecipients(
      this._compFields,
      this._deliverMode
    );
    if (undisclosedRecipients) {
      headers.set("to", undisclosedRecipients);
    }

    if (isDraft) {
      headers
        .set(
          "x-mozilla-draft-info",
          MsgUtils.getXMozillaDraftInfo(this._compFields)
        )
        .set("x-identity-key", this._userIdentity.key)
        .set("fcc", this._fcc);
    }

    if (messageId) {
      // MDN request header requires to have MessageID header presented in the
      // message in order to coorelate the MDN reports to the original message.
      headers
        .set(
          "disposition-notification-to",
          MsgUtils.getDispositionNotificationTo(
            this._compFields,
            this._deliverMode
          )
        )
        .set(
          "return-receipt-to",
          MsgUtils.getReturnReceiptTo(this._compFields, this._deliverMode)
        );
    }

    for (let { headerName, headerValue } of MsgUtils.getDefaultCustomHeaders(
      this._userIdentity
    )) {
      headers.set(headerName, headerValue);
    }

    let rawMftHeader = headers.get("mail-followup-to");
    // If there's already a Mail-Followup-To header, don't need to do anything.
    if (!rawMftHeader) {
      headers.set(
        "mail-followup-to",
        MsgUtils.getMailFollowupToHeader(this._compFields, this._userIdentity)
      );
    }

    let rawMrtHeader = headers.get("mail-reply-to");
    // If there's already a Mail-Reply-To header, don't need to do anything.
    if (!rawMrtHeader) {
      headers.set(
        "mail-reply-to",
        MsgUtils.getMailReplyToHeader(
          this._compFields,
          this._userIdentity,
          rawMrtHeader
        )
      );
    }

    let rawPriority = headers.get("x-priority");
    if (rawPriority) {
      headers.set("x-priority", MsgUtils.getXPriority(rawPriority));
    }

    let rawReferences = headers.get("references");
    if (rawReferences) {
      let references = MsgUtils.getReferences(rawReferences);
      // Don't reset "references" header if references is undefined.
      if (references) {
        headers.set("references", references);
      }
      headers.set("in-reply-to", MsgUtils.getInReplyTo(rawReferences));
    }
    if (
      rawReferences &&
      [
        Ci.nsIMsgCompType.ForwardInline,
        Ci.nsIMsgCompType.ForwardAsAttachment,
      ].includes(this._compType)
    ) {
      headers.set("x-forwarded-message-id", rawReferences);
    }

    let rawNewsgroups = headers.get("newsgroups");
    if (rawNewsgroups) {
      let { newsgroups, newshost } = MsgUtils.getNewsgroups(
        this._deliverMode,
        rawNewsgroups
      );
      // Don't reset "newsgroups" header if newsgroups is undefined.
      if (newsgroups) {
        headers.set("newsgroups", newsgroups);
      }
      headers.set("x-mozilla-news-host", newshost);
    }

    return headers;
  }

  /**
   * Determine if the message should include an HTML part, a plain part or both.
   * @returns {{plainPart: MimePart, htmlPart: MimePart}}
   */
  _gatherMainParts() {
    let formatFlowed = Services.prefs.getBoolPref(
      "mailnews.send_plaintext_flowed"
    );
    let formatParam = "";
    if (formatFlowed) {
      // Set format=flowed as in RFC 2646 according to the preference.
      formatParam += "; format=flowed";
    }

    let htmlPart = null;
    let plainPart = null;
    let parts = {};

    if (this._bodyType === "text/html") {
      htmlPart = new MimePart(
        this._bodyType,
        this._compFields.forceMsgEncoding,
        true
      );
      htmlPart.setHeader("content-type", "text/html; charset=UTF-8");
      htmlPart.bodyText = this._bodyText;
    } else if (this._bodyType === "text/plain") {
      plainPart = new MimePart(
        this._bodyType,
        this._compFields.forceMsgEncoding,
        true
      );
      plainPart.setHeader(
        "content-type",
        `text/plain; charset=UTF-8${formatParam}`
      );
      plainPart.bodyText = this._bodyText;
      parts.plainPart = plainPart;
    }

    // Assemble a multipart/alternative message.
    if (
      (this._compFields.forcePlainText ||
        this._compFields.useMultipartAlternative) &&
      plainPart === null &&
      htmlPart !== null
    ) {
      plainPart = new MimePart(
        "text/plain",
        this._compFields.forceMsgEncoding,
        true
      );
      plainPart.setHeader(
        "content-type",
        `text/plain; charset=UTF-8${formatParam}`
      );
      plainPart.bodyText = MsgUtils.convertToPlainText(
        this._bodyText,
        formatFlowed
      );

      parts.plainPart = plainPart;
    }

    // If useMultipartAlternative is true, send multipart/alternative message.
    // Otherwise, send the plainPart only.
    if (htmlPart) {
      if (
        (plainPart && this._compFields.useMultipartAlternative) ||
        !plainPart
      ) {
        parts.htmlPart = htmlPart;
      }
    }

    return parts;
  }

  /**
   * Collect local attachments.
   * @returns {MimePart[]}
   */
  _gatherAttachmentParts() {
    let attachments = [...this._compFields.attachments];
    let cloudParts = [];
    let localParts = [];

    for (let attachment of attachments) {
      if (attachment.sendViaCloud) {
        let part = new MimePart();
        let mozillaCloudPart = MsgUtils.getXMozillaCloudPart(
          this._deliverMode,
          attachment
        );
        part.setHeader("x-mozilla-cloud-part", mozillaCloudPart);
        part.setHeader("content-type", "application/octet-stream");
        cloudParts.push(part);
        continue;
      }
      let part = new MimePart(null, this._compFields.forceMsgEncoding, false);
      part.setBodyAttachment(attachment);
      localParts.push(part);
    }
    // Cloud attachments are handled before local attachments in the C++
    // implementation. We follow it here so that no need to change tests.
    return cloudParts.concat(localParts);
  }

  /**
   * Collect embedded objects as attachments.
   * @returns {MimePart[]}
   */
  _gatherEmbeddedParts() {
    return this._embeddedAttachments.map(attachment => {
      let part = new MimePart(null, this._compFields.forceMsgEncoding, false);
      part.setBodyAttachment(attachment, "inline", attachment.contentId);
      return part;
    });
  }
}
