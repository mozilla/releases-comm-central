/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["MsgUtils"];

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");
var { jsmime } = ChromeUtils.import("resource:///modules/jsmime.jsm");

/**
 * Generate an NS_ERROR code from a MAILNEWS error code. See NS_ERROR_GENERATE
 * in nsError.h and NS_MSG_GENERATE_FAILURE in nsComposeStrings.h.
 *
 * @param {number} code - The error code in MAILNEWS module.
 * @returns {number}
 */
function generateNSError(code) {
  return (1 << 31) | ((16 + 0x45) << 16) | code;
}

/**
 * Collection of helper functions for message sending process.
 */
var MsgUtils = {
  /**
   * Error codes defined in nsComposeStrings.h
   */
  NS_ERROR_SMTP_SEND_FAILED_UNKNOWN_SERVER: generateNSError(12589),
  NS_ERROR_SMTP_SEND_FAILED_REFUSED: generateNSError(12590),
  NS_ERROR_SMTP_SEND_FAILED_INTERRUPTED: generateNSError(12591),
  NS_ERROR_SMTP_SEND_FAILED_TIMEOUT: generateNSError(12592),

  /**
   * Convert html to text to form a multipart/alternative message. The output
   * depends on preference.
   * @param {string} input - The HTML text to convert.
   * @param {boolean} formatFlowed - A flag to enable OutputFormatFlowed.
   * @retuns {string}
   */
  convertToPlainText(input, formatFlowed) {
    let wrapWidth = Services.prefs.getIntPref("mailnews.wraplength", 72);
    if (wrapWidth > 990) {
      wrapWidth = 990;
    } else if (wrapWidth < 10) {
      wrapWidth = 10;
    }

    let flags =
      Ci.nsIDocumentEncoder.OutputPersistNBSP |
      Ci.nsIDocumentEncoder.OutputFormatted |
      Ci.nsIDocumentEncoder.OutputDisallowLineBreaking;
    if (formatFlowed) {
      flags |= Ci.nsIDocumentEncoder.OutputFormatFlowed;
    }

    let parserUtils = Cc["@mozilla.org/parserutils;1"].getService(
      Ci.nsIParserUtils
    );
    return parserUtils.convertToPlainText(input, flags, wrapWidth);
  },

  /**
   * Get the list of default custom headers.
   * @param {nsIMsgIdentity} userIdentity - User identity.
   * @returns {{headerName: string, headerValue: string}[]}
   */
  getDefaultCustomHeaders(userIdentity) {
    // mail.identity.<id#>.headers pref is a comma separated value of pref names
    // containing headers to add headers are stored in
    let headerAttributes = userIdentity
      .getUnicharAttribute("headers")
      .split(",");
    let headers = [];
    for (let attr of headerAttributes) {
      // mail.identity.<id#>.header.<header name> grab all the headers
      let attrValue = userIdentity.getUnicharAttribute(`header.${attr}`);
      if (attrValue) {
        let [headerName, headerValue] = attrValue.split(":");
        headers.push({
          headerName,
          headerValue,
        });
      }
    }
    return headers;
  },

  /**
   * Get the fcc value.
   * @param {nsIMsgIdentity} userIdentity - The user identity.
   * @param {nsIMsgCompFields} compFields - The compose fields.
   * @param {string} originalMsgURI - The original message uri, can be null.
   * @param {MSG_ComposeType} compType - The compose type.
   * @returns {string}
   */
  getFcc(userIdentity, compFields, originalMsgURI, compType) {
    // If the identity pref "fcc" is set to false, then we will not do
    // any FCC operation!
    if (!userIdentity.doFcc) {
      return "";
    }
    let fcc = "";
    let useDefaultFcc = true;
    if (compFields.fcc) {
      if (compFields.fcc.startsWith("nocopy://")) {
        useDefaultFcc = false;
        fcc = "";
      } else {
        let folder = MailUtils.getExistingFolder(compFields.fcc);
        if (folder) {
          useDefaultFcc = false;
          fcc = compFields.fcc.trim();
        }
      }
    }

    // We use default FCC setting if it's not set or was set to an invalid
    // folder.
    if (useDefaultFcc) {
      // Only check whether the user wants the message in the original message
      // folder if the msgcomptype is some kind of a reply.
      if (
        originalMsgURI &&
        [
          Ci.nsIMsgCompType.Reply,
          Ci.nsIMsgCompType.ReplyAll,
          Ci.nsIMsgCompType.ReplyToGroup,
          Ci.nsIMsgCompType.ReplyToSender,
          Ci.nsIMsgCompType.ReplyToSenderAndGroup,
          Ci.nsIMsgCompType.ReplyWithTemplate,
        ].includes(compType)
      ) {
        let msgHdr = MailServices.messenger
          .messageServiceFromURI(originalMsgURI)
          .messageURIToMsgHdr(originalMsgURI);
        let folder = msgHdr.folder;
        // let canFileMessages = folder.canFileMessages
        let incomingServerType = folder.incomingServer.getCharValue("type");
        if (folder.canFileMessages && incomingServerType != "rss") {
          fcc = folder.uri;
          useDefaultFcc = false;
        }
      }

      if (useDefaultFcc) {
        let uri = this.getMsgFolderURIFromPrefs(
          userIdentity,
          Ci.nsIMsgSend.nsMsgDeliverNow
        );
        fcc = uri == "nocopy://" ? "" : uri;
      }
    }

    return fcc;
  },

  /**
   * Get the To header value. When we don't have disclosed recipient but only
   * Bcc, use the undisclosedRecipients entry from composeMsgs.properties as the
   * To header value to prevent problem with some servers.
   *
   * @param {nsIMsgCompFields} compFields - The compose fields.
   * @param {nsMsgDeliverMode} deliverMode - The deliver mode.
   * @returns {string}
   */
  getUndisclosedRecipients(compFields, deliverMode) {
    let hasDisclosedRecipient = compFields.to || compFields.cc;
    // If we are saving the message as a draft, don't bother inserting the
    // undisclosed recipients field. We'll take care of that when we really send
    // the message.
    if (
      hasDisclosedRecipient ||
      [
        Ci.nsIMsgSend.nsMsgDeliverBackground,
        Ci.nsIMsgSend.nsMsgSaveAsDraft,
        Ci.nsIMsgSend.nsMsgSaveAsTemplate,
      ].includes(deliverMode) ||
      !Services.prefs.getBoolPref("mail.compose.add_undisclosed_recipients")
    ) {
      return "";
    }
    let composeBundle = Services.strings.createBundle(
      "chrome://messenger/locale/messengercompose/composeMsgs.properties"
    );
    let undisclosedRecipients = composeBundle.GetStringFromName(
      "undisclosedRecipients"
    );
    let recipients = MailServices.headerParser.makeGroupObject(
      undisclosedRecipients,
      []
    );
    return recipients.toString();
  },

  /**
   * Get the Mail-Followup-To header value.
   * See bug #204339 and http://cr.yp.to/proto/replyto.html for details
   * @param {nsIMsgCompFields} compFields - The compose fields.
   * @param {nsIMsgIdentity} userIdentity - The user identity.
   * @returns {string}
   */
  getMailFollowupToHeader(compFields, userIdentity) {
    let mailLists = userIdentity.getUnicharAttribute(
      "subscribed_mailing_lists"
    );
    if (!mailLists || !(compFields.to || compFields.cc)) {
      return "";
    }
    let recipients = compFields.to;
    if (recipients) {
      if (compFields.cc) {
        recipients += `,${compFields.cc}`;
      }
    } else {
      recipients = compFields.cc;
    }
    let recipientsDedup = MailServices.headerParser.removeDuplicateAddresses(
      recipients
    );
    let recipientsWithoutMailList = MailServices.headerParser.removeDuplicateAddresses(
      recipientsDedup,
      mailLists
    );
    if (recipientsDedup != recipientsWithoutMailList) {
      return recipients;
    }
    return "";
  },

  /**
   * Get the Mail-Reply-To header value.
   * See bug #204339 and http://cr.yp.to/proto/replyto.html for details
   * @param {nsIMsgCompFields} compFields - The compose fields.
   * @param {nsIMsgIdentity} userIdentity - The user identity.
   * @returns {string}
   */
  getMailReplyToHeader(compFields, userIdentity) {
    let mailLists = userIdentity.getUnicharAttribute(
      "replyto_mangling_mailing_lists"
    );
    if (
      !mailLists ||
      mailLists[0] == "*" ||
      !(compFields.to || compFields.cc)
    ) {
      return "";
    }
    let recipients = compFields.to;
    if (recipients) {
      if (compFields.cc) {
        recipients += `,${compFields.cc}`;
      }
    } else {
      recipients = compFields.cc;
    }
    let recipientsDedup = MailServices.headerParser.removeDuplicateAddresses(
      recipients
    );
    let recipientsWithoutMailList = MailServices.headerParser.removeDuplicateAddresses(
      recipientsDedup,
      mailLists
    );
    if (recipientsDedup != recipientsWithoutMailList) {
      return compFields.replyTo || compFields.from;
    }
    return "";
  },

  /**
   * Get the X-Mozilla-Draft-Info header value.
   * @param {nsIMsgCompFields} compFields - The compose fields.
   * @returns {string}
   */
  getXMozillaDraftInfo(compFields) {
    let getCompField = (property, key) => {
      let value = compFields[property] ? 1 : 0;
      return `${key}=${value}; `;
    };
    let draftInfo = "internal/draft; ";
    draftInfo += getCompField("attachVCard", "vcard");

    let receiptValue = 0;
    if (compFields.returnReceipt) {
      // slight change compared to 4.x; we used to use receipt= to tell
      // whether the draft/template has request for either MDN or DNS or both
      // return receipt; since the DNS is out of the picture we now use the
      // header type + 1 to tell whether user has requested the return receipt
      receiptValue = compFields.receiptHeaderType + 1;
    }
    draftInfo += `receipt=${receiptValue}; `;

    draftInfo += getCompField("DSN", "DSN");
    draftInfo += "uuencode=0; ";
    draftInfo += getCompField("attachmentReminder", "attachmentreminder");
    draftInfo += `deliveryformat=${compFields.deliveryFormat}`;

    return draftInfo;
  },

  /**
   * Get the X-Mozilla-Cloud-Part header value.
   * @param {nsMsgDeliverMode} deliverMode - The deliver mode.
   * @param {nsIMsgAttachment} attachment - The cloud attachment.
   * @returns {string}
   */
  getXMozillaCloudPart(deliverMode, attachment) {
    let value = `cloudFile; url=${attachment.contentLocation}`;
    if (deliverMode == Ci.nsIMsgSend.nsMsgSaveAsDraft) {
      value += `; provider=${attachment.cloudFileAccountKey}`;
      value += `; file=${attachment.url}`;
    }
    value += `; name=${attachment.name}`;
    return value;
  },

  /**
   * Get the X-Mozilla-Status header value. The header value will be used to set
   * some nsMsgMessageFlags. Including the Read flag for message in a local
   * folder.
   *
   * @param {nsMsgDeliverMode} deliverMode - The deliver mode.
   * @returns {string}
   */
  getXMozillaStatus(deliverMode) {
    if (
      ![
        Ci.nsIMsgSend.nsMsgQueueForLater,
        Ci.nsIMsgSend.nsMsgSaveAsDraft,
        Ci.nsIMsgSend.nsMsgSaveAsTemplate,
        Ci.nsIMsgSend.nsMsgDeliverNow,
        Ci.nsIMsgSend.nsMsgSendUnsent,
        Ci.nsIMsgSend.nsMsgDeliverBackground,
      ].includes(deliverMode)
    ) {
      return "";
    }
    let flags = 0;
    if (deliverMode == Ci.nsIMsgSend.nsMsgQueueForLater) {
      flags |= Ci.nsMsgMessageFlags.Queued;
    } else if (
      deliverMode != Ci.nsIMsgSend.nsMsgSaveAsDraft &&
      deliverMode != Ci.nsIMsgSend.nsMsgDeliverBackground
    ) {
      flags |= Ci.nsMsgMessageFlags.Read;
    }
    return flags.toString(16).padStart(4, "0");
  },

  /**
   * Get the X-Mozilla-Status2 header value. The header value will be used to
   * set some nsMsgMessageFlags.
   *
   * @param {nsMsgDeliverMode} deliverMode - The deliver mode.
   * @returns {string}
   */
  getXMozillaStatus2(deliverMode) {
    if (
      ![
        Ci.nsIMsgSend.nsMsgQueueForLater,
        Ci.nsIMsgSend.nsMsgSaveAsDraft,
        Ci.nsIMsgSend.nsMsgSaveAsTemplate,
        Ci.nsIMsgSend.nsMsgDeliverNow,
        Ci.nsIMsgSend.nsMsgSendUnsent,
        Ci.nsIMsgSend.nsMsgDeliverBackground,
      ].includes(deliverMode)
    ) {
      return "";
    }
    let flags = 0;
    if (deliverMode == Ci.nsIMsgSend.nsMsgSaveAsTemplate) {
      flags |= Ci.nsMsgMessageFlags.Template;
    } else if (
      deliverMode == Ci.nsIMsgSend.nsMsgDeliverNow ||
      deliverMode == Ci.nsIMsgSend.nsMsgSendUnsent
    ) {
      flags &= ~Ci.nsMsgMessageFlags.MDNReportNeeded;
      flags |= Ci.nsMsgMessageFlags.MDNReportSent;
    }
    return flags.toString(16).padStart(8, "0");
  },

  /**
   * Get the Disposition-Notification-To header value.
   * @param {nsIMsgCompFields} compFields - The compose fields.
   * @param {nsMsgDeliverMode} deliverMode - The deliver mode.
   * @returns {{dnt: string, rrt: string}}
   */
  getDispositionNotificationTo(compFields, deliverMode) {
    if (
      compFields.returnReceipt &&
      deliverMode != Ci.nsIMsgSend.nsMsgSaveAsDraft &&
      deliverMode != Ci.nsIMsgSend.nsMsgSaveAsTemplate &&
      compFields.receiptHeaderType != Ci.nsIMsgMdnGenerator.eRrtType
    ) {
      return compFields.from;
    }
    return "";
  },

  /**
   * Get the Return-Receipt-To header value.
   * @param {nsIMsgCompFields} compFields - The compose fields.
   * @param {nsMsgDeliverMode} deliverMode - The deliver mode.
   * @returns {{dnt: string, rrt: string}}
   */
  getReturnReceiptTo(compFields, deliverMode) {
    if (
      compFields.returnReceipt &&
      deliverMode != Ci.nsIMsgSend.nsMsgSaveAsDraft &&
      deliverMode != Ci.nsIMsgSend.nsMsgSaveAsTemplate &&
      compFields.receiptHeaderType != Ci.nsIMsgMdnGenerator.eDntType
    ) {
      return compFields.from;
    }
    return "";
  },

  /**
   * Get the value of X-Priority header.
   * @param {string} rawPriority - Raw X-Priority content.
   * @returns {string}
   */
  getXPriority(rawPriority) {
    rawPriority = rawPriority.toLowerCase();
    let priorityValue = Ci.nsMsgPriority.Default;
    let priorityValueString = "0";
    let priorityName = "None";
    if (rawPriority.startsWith("1") || rawPriority.startsWith("highest")) {
      priorityValue = Ci.nsMsgPriority.highest;
      priorityValueString = "1";
      priorityName = "Highest";
    } else if (
      rawPriority.startsWith("2") ||
      // "high" must be tested after "highest".
      rawPriority.startsWith("high") ||
      rawPriority.startsWith("urgent")
    ) {
      priorityValue = Ci.nsMsgPriority.high;
      priorityValueString = "2";
      priorityName = "High";
    } else if (
      rawPriority.startsWith("3") ||
      rawPriority.startsWith("normal")
    ) {
      priorityValue = Ci.nsMsgPriority.normal;
      priorityValueString = "3";
      priorityName = "Normal";
    } else if (
      rawPriority.startsWith("5") ||
      rawPriority.startsWith("lowest")
    ) {
      priorityValue = Ci.nsMsgPriority.lowest;
      priorityValueString = "5";
      priorityName = "Lowest";
    } else if (
      rawPriority.startsWith("4") ||
      // "low" must be tested after "lowest".
      rawPriority.startsWith("low")
    ) {
      priorityValue = Ci.nsMsgPriority.low;
      priorityValueString = "4";
      priorityName = "Low";
    }
    if (priorityValue == Ci.nsMsgPriority.Default) {
      return "";
    }
    return `${priorityValueString} (${priorityName})`;
  },

  /**
   * Get the References header value.
   * @param {string} references - Raw References header content.
   * @returns {string}
   */
  getReferences(references) {
    if (references.length <= 986) {
      return "";
    }
    // The References header should be kept under 998 characters: if it's too
    // long, trim out the earliest references to make it smaller.
    let newReferences = "";
    let firstRef = references.indexOf("<");
    let secondRef = references.indexOf("<", firstRef + 1);
    if (secondRef > 0) {
      newReferences = references.slice(0, secondRef);
      let bracket = references.indexOf(
        "<",
        references.length + newReferences.length - 986
      );
      if (bracket > 0) {
        newReferences += references.slice(bracket);
      }
    }
    return newReferences;
  },

  /**
   * Get the In-Reply-To header value.
   * @param {string} references - Raw References header content.
   * @returns {string}
   */
  getInReplyTo(references) {
    // The In-Reply-To header is the last entry in the references header...
    let bracket = references.lastIndexOf("<");
    if (bracket > 0) {
      return references.slice(bracket);
    }
    return "";
  },

  /**
   * Get the value of Newsgroups and X-Mozilla-News-Host header.
   * @param {nsMsgDeliverMode} deliverMode - Message deliver mode.
   * @param {string} newsgroups - Raw newsgroups header content.
   * @returns {{newsgroups: string, newshost: string}}
   */
  getNewsgroups(deliverMode, newsgroups) {
    let nntpService = Cc["@mozilla.org/messenger/nntpservice;1"].getService(
      Ci.nsINntpService
    );
    let newsgroupsHeaderVal = {};
    let newshostHeaderVal = {};
    nntpService.generateNewsHeaderValsForPosting(
      newsgroups,
      newsgroupsHeaderVal,
      newshostHeaderVal
    );

    // If we are here, we are NOT going to send this now. (i.e. it is a Draft,
    // Send Later file, etc...). Because of that, we need to store what the user
    // typed in on the original composition window for use later when rebuilding
    // the headers
    if (
      deliverMode == Ci.nsIMsgSend.nsMsgDeliverNow ||
      deliverMode == Ci.nsIMsgSend.nsMsgSendUnsent
    ) {
      // This is going to be saved for later, that means we should just store
      // what the user typed into the "Newsgroup" line in the
      // HEADER_X_MOZILLA_NEWSHOST header for later use by "Send Unsent
      // Messages", "Drafts" or "Templates"
      newshostHeaderVal.value = "";
    }
    return {
      newsgroups: newsgroupsHeaderVal.value,
      newshost: newshostHeaderVal.value,
    };
  },

  /**
   * Get the Content-Location header value.
   * @param {string} baseUrl - The base url of an HTML attachment.
   * @returns {string}
   */
  getContentLocation(baseUrl) {
    let lowerBaseUrl = baseUrl.toLowerCase();
    if (
      !baseUrl.includes(":") ||
      lowerBaseUrl.startsWith("news:") ||
      lowerBaseUrl.startsWith("snews:") ||
      lowerBaseUrl.startsWith("imap:") ||
      lowerBaseUrl.startsWith("file:") ||
      lowerBaseUrl.startsWith("mailbox:")
    ) {
      return "";
    }
    let transformMap = {
      " ": "%20",
      "\t": "%09",
      "\n": "%0A",
      "\r": "%0D",
    };
    let value = "";
    for (let char of baseUrl) {
      value += transformMap[char] || char;
    }
    return value;
  },

  /**
   * Pick a charset according to content type and content.
   * @param {string} contentType - The content type.
   * @param {string} content - The content.
   * @returns {string}
   */
  pickCharset(contentType, content) {
    if (!contentType.startsWith("text")) {
      return "";
    }

    // Check the BOM.
    let charset = "";
    if (content.length >= 2) {
      let byte0 = content.charCodeAt(0);
      let byte1 = content.charCodeAt(1);
      let byte2 = content.charCodeAt(2);
      if (byte0 == 0xfe && byte1 == 0xff) {
        charset = "UTF-16BE";
      } else if (byte0 == 0xff && byte1 == 0xfe) {
        charset = "UTF-16LE";
      } else if (byte0 == 0xef && byte1 == 0xbb && byte2 == 0xbf) {
        charset = "UTF-8";
      }
    }
    if (charset) {
      return charset;
    }

    // Use mozilla::EncodingDetector.
    let compUtils = Cc[
      "@mozilla.org/messengercompose/computils;1"
    ].createInstance(Ci.nsIMsgCompUtils);
    return compUtils.detectCharset(content);
  },

  /**
   * Given a string, convert it to 'qtext' (quoted text) for RFC822 header
   * purposes.
   */
  makeFilenameQtext(srcText, stripCRLFs) {
    let size = srcText.length;
    let ret = "";
    for (let i = 0; i < size; i++) {
      let char = srcText.charAt(i);
      if (
        char == "\\" ||
        char == '"' ||
        (!stripCRLFs &&
          char == "\r" &&
          (srcText[i + 1] != "\n" ||
            (srcText[i + 1] == "\n" && i + 2 < size && srcText[i + 2] != " ")))
      ) {
        ret += "\\";
      }

      if (
        stripCRLFs &&
        char == "\r" &&
        srcText[i + 1] == "\n" &&
        i + 2 < size &&
        srcText[i + 2] == " "
      ) {
        i += 3;
      } else {
        ret += char;
      }
    }
    return ret;
  },

  /**
   * Encode parameter value according to RFC 2047.
   * @param {string} value - The parameter value.
   * @returns {string}
   */
  rfc2047EncodeParam(value) {
    let converter = Cc["@mozilla.org/messenger/mimeconverter;1"].getService(
      Ci.nsIMimeConverter
    );

    let encoded = converter.encodeMimePartIIStr_UTF8(
      value,
      false,
      0,
      Ci.nsIMimeConverter.MIME_ENCODED_WORD_SIZE
    );

    return this.makeFilenameQtext(encoded, false);
  },

  /**
   * Encode parameter value according to RFC 2231.
   * @param {string} paramName - The parameter name.
   * @param {string} paramValue - The parameter value.
   * @returns {string}
   */
  rfc2231ParamFolding(paramName, paramValue) {
    // this is to guarantee the folded line will never be greater
    // than 78 = 75 + CRLFLWSP
    const PR_MAX_FOLDING_LEN = 75;

    let needsEscape = false;
    let encoder = new TextEncoder();
    let dupParamValue = jsmime.mimeutils.typedArrayToString(
      encoder.encode(paramValue)
    );

    if (/[\x80-\xff]/.test(dupParamValue)) {
      needsEscape = true;
      dupParamValue = Services.io.escapeString(
        dupParamValue,
        Ci.nsINetUtil.ESCAPE_ALL
      );
    } else {
      dupParamValue = this.makeFilenameQtext(dupParamValue, true);
    }

    let paramNameLen = paramName.length;
    let paramValueLen = dupParamValue.length;
    paramNameLen += 5; // *=__'__'___ or *[0]*=__'__'__ or *[1]*=___ or *[0]="___"
    let foldedParam = "";

    if (paramValueLen + paramNameLen + "UTF-8".length < PR_MAX_FOLDING_LEN) {
      foldedParam = paramName;
      if (needsEscape) {
        foldedParam += "*=UTF-8''";
      } else {
        foldedParam += '="';
      }
      foldedParam += dupParamValue;
      if (!needsEscape) {
        foldedParam += '"';
      }
    } else {
      let curLineLen = 0;
      let counter = 0;
      let start = 0;
      let end = null;

      while (paramValueLen > 0) {
        curLineLen = 0;
        if (counter == 0) {
          foldedParam = paramName;
        } else {
          foldedParam += `;\r\n ${paramName}`;
        }
        foldedParam += `*${counter}`;
        curLineLen += `*${counter}`.length;
        if (needsEscape) {
          foldedParam += "*=";
          if (counter == 0) {
            foldedParam += "UTF-8''";
            curLineLen += "UTF-8".length;
          }
        } else {
          foldedParam += '="';
        }
        counter++;
        curLineLen += paramNameLen;
        if (paramValueLen <= PR_MAX_FOLDING_LEN - curLineLen) {
          end = start + paramValueLen;
        } else {
          end = start + (PR_MAX_FOLDING_LEN - curLineLen);
        }

        if (end && needsEscape) {
          // Check to see if we are in the middle of escaped char.
          // We use ESCAPE_ALL, so every third character is a '%'.
          if (end - 1 > start && dupParamValue[end - 1] == "%") {
            end -= 1;
          } else if (end - 2 > start && dupParamValue[end - 2] == "%") {
            end -= 2;
          }
          // *end is now a '%'.
          // Check if the following UTF-8 octet is a continuation.
          while (end - 3 > start && "89AB".includes(dupParamValue[end + 1])) {
            end -= 3;
          }
        }
        foldedParam += dupParamValue.slice(start, end);
        if (!needsEscape) {
          foldedParam += '"';
        }
        paramValueLen -= end - start;
        start = end;
      }
    }

    return foldedParam;
  },

  /**
   * Get the target message folder to copy to.
   * @param {nsIMsgIdentity} userIdentity - The user identity.
   * @param {nsMsgDeliverMode} deliverMode - The deliver mode.
   * @returns {string}
   */
  getMsgFolderURIFromPrefs(userIdentity, deliverMode) {
    if (
      deliverMode == Ci.nsIMsgSend.nsMsgQueueForLater ||
      deliverMode == Ci.nsIMsgSend.nsMsgDeliverBackground
    ) {
      let uri = Services.prefs.getCharPref("mail.default_sendlater_uri");
      // check if uri is unescaped, and if so, escape it and reset the pef.
      if (!uri) {
        return "anyfolder://";
      } else if (uri.includes(" ")) {
        uri.replaceAll(" ", "%20");
        Services.prefs.setCharPref("mail.default_sendlater_uri", uri);
      }
      return uri;
    } else if (deliverMode == Ci.nsIMsgSend.nsMsgSaveAsDraft) {
      return userIdentity.draftFolder;
    } else if (deliverMode == Ci.nsIMsgSend.nsMsgSaveAsTemplate) {
      return userIdentity.stationeryFolder;
    }
    if (userIdentity.doFcc) {
      return userIdentity.fccFolder;
    }
    return "";
  },
};
