/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
let { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
let { OS } = ChromeUtils.import("resource://gre/modules/osfile.jsm");
let { MimePart } = ChromeUtils.import("resource:///modules/MimePart.jsm");

const EXPORTED_SYMBOLS = ["MessageSend"];

/**
 * A work in progress rewriting of nsMsgSend.cpp.
 * Set `user_pref("mailnews.send.jsmodule", true);` to use this module.
 *
 * @implements {nsIMsgSend}
 */
function MessageSend() {}

MessageSend.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIMsgSend"]),
  classID: Components.ID("{028b9c1e-8d0a-4518-80c2-842e07846eaa}"),

  createAndSendMessage(
    editor,
    userIdentity,
    accountKey,
    compFields,
    isDigest,
    dontDeliver,
    mode,
    msgToReplace,
    bodyType,
    body,
    attachments,
    preloadedAttachments,
    parentWindow,
    progress,
    listener,
    password,
    originalMsgURI,
    type
  ) {
    this._compFields = compFields;
    this._userIdentity = userIdentity;
    this._sendProgress = progress;
    this._smtpPassword = password;
    this._sendListener = listener;

    this._sendReport = Cc[
      "@mozilla.org/messengercompose/sendreport;1"
    ].createInstance(Ci.nsIMsgSendReport);
    this._composeBundle = Services.strings.createBundle(
      "chrome://messenger/locale/messengercompose/composeMsgs.properties"
    );

    this._createAndSendMessage(...arguments);
  },

  sendMessageFile(
    userIdentity,
    accountKey,
    compFields,
    sendIFile,
    deleteSendFileOnCompletion,
    digest,
    mode,
    msgToReplace,
    listener,
    statusFeedback,
    password
  ) {
    throw Components.Exception(
      "sendMessageFile not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  },

  abort() {
    throw Components.Exception(
      "abort not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  },

  getPartForDomIndex(domIndex) {
    throw Components.Exception(
      "getPartForDomIndex not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  },

  getProgress() {
    throw Components.Exception(
      "getProgress not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  },

  notifyListenerOnStartSending(msgId, msgSize) {
    if (this._sendListener) {
      this._sendListener.onStartSending(msgId, msgSize);
    }
  },

  notifyListenerOnStopCopy(status) {
    if (this._sendListener) {
      let copyListener = this._sendListener.QueryInterface(
        Ci.nsIMsgCopyServiceListener
      );
      copyListener.OnStopCopy(status);
    }
  },

  notifyListenerOnStopSending(msgId, status, msg, returnFile) {
    if (this._sendListener) {
      this._sendListener.onStopSending(msgId, status, msg, returnFile);
    }
  },

  sendDeliveryCallback(url, isNewsDelivery, exitCode) {
    this.notifyListenerOnStopSending(null, exitCode, null, null);
    this.notifyListenerOnStopCopy(exitCode);
  },

  get folderUri() {
    throw Components.Exception(
      "folderUri getter not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  },

  get messageKey() {
    throw Components.Exception(
      "messageKey getter not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  },

  get sendReport() {
    return this._sendReport;
  },

  /**
   * Currently, only plain and/or html text without any attachments is
   * supported. It works like this:
   * 1. Collect top level MIME headers
   * 2. Construct a MimePart instance, which can be nested
   * 3. Write the MimePart to a tmp file, e.g. /tmp/nsemail.eml
   * 4. Pass the file to this._deliverMessage
   */
  async _createAndSendMessage(
    editor,
    userIdentity,
    accountKey,
    compFields,
    isDigest,
    dontDeliver,
    mode,
    msgToReplace,
    bodyType,
    body,
    attachments,
    preloadedAttachments,
    parentWindow,
    progress,
    listener,
    password,
    originalMsgURI,
    type
  ) {
    // Initialize the error reporting mechanism.
    this.sendReport.reset();
    this.sendReport.deliveryMode = mode;
    this._setStatusMessage(
      this._composeBundle.GetStringFromName("assemblingMailInformation")
    );
    this.sendReport.currentProcess = Ci.nsIMsgSendReport.process_BuildMessage;

    let topPart = new MimePart();
    topPart.setHeaders(this._gatherMimeHeaders());

    let charset = compFields.characterSet;
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
    let bodyText = body;
    let htmlPart = null;
    let plainPart = null;

    if (bodyType === "text/html") {
      htmlPart = new MimePart(
        charset,
        bodyType,
        this._compFields.forceMsgEncoding,
        true
      );
      htmlPart.setHeader("Content-Type", `text/html${charsetParams}`);
      htmlPart.bodyText = bodyText;
    } else if (bodyType === "text/plain") {
      plainPart = new MimePart(
        charset,
        bodyType,
        this._compFields.forceMsgEncoding,
        true
      );
      plainPart.setHeader(
        "Content-Type",
        `text/plain${charsetParams}${formatParams}`
      );
      plainPart.bodyText = bodyText;
      topPart.addPart(plainPart);
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
        bodyText,
        formatFlowed,
        delsp,
        disallowBreaks
      );

      topPart.addPart(plainPart);
    }

    // If useMultipartAlternative is true, send multipart/alternative message.
    // Otherwise, send the plainPart only.
    if (htmlPart) {
      if (plainPart) {
        if (this._compFields.useMultipartAlternative) {
          topPart.initMultipart("alternative");
          topPart.addPart(htmlPart);
        }
      } else {
        topPart.addPart(htmlPart);
      }
    }

    // Save a RFC2045 message to a tmp file on disk.
    this._setStatusMessage(
      this._composeBundle.GetStringFromName("creatingMailMessage")
    );

    let { path, file: fileWriter } = await OS.File.openUnique(
      OS.Path.join(OS.Constants.Path.tmpDir, "nsemail.eml")
    );
    await topPart.write(fileWriter);
    await fileWriter.close();

    this._setStatusMessage(
      this._composeBundle.GetStringFromName("assemblingMessageDone")
    );

    let file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(path);
    this._deliverMessage(file);
  },

  /**
   * Collect top level headers like From/To/Subject into a Map.
   */
  _gatherMimeHeaders() {
    this._setStatusMessage(
      this._composeBundle.GetStringFromName("assemblingMessage")
    );
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
  },

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
  },

  _setStatusMessage(msg) {
    if (this._sendProgress) {
      this._sendProgress.onStatusChange(null, null, Cr.NS_OK, msg);
    }
  },

  /**
   * Deliver a message. Far from complete.
   * TODO: implement saving to the Sent/Draft folder. Other details.
   */
  _deliverMessage(file) {
    this._deliverFileAsMail(file);
  },

  /**
   * Send a message file to smtp service. Far from complete.
   * TODO: handle cc/bcc. Other details.
   */
  _deliverFileAsMail(file) {
    let to = this._compFields.to || "";
    let deliveryListener = new MsgDeliveryListener(this, false);
    MailServices.smtp.sendMailMessage(
      file,
      to,
      this._userIdentity,
      this._compFields.from,
      this._smtpPassword,
      deliveryListener,
      null,
      null,
      this._compFields.DSN,
      {},
      {}
    );
  },
};

/**
 * A listener to be passed to the SMTP service.
 *
 * @implements {nsIUrlListener}
 */
function MsgDeliveryListener(msgSend, isNewsDelivery) {
  this._msgSend = msgSend;
  this._isNewsDelivery = isNewsDelivery;
}

MsgDeliveryListener.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIUrlListener"]),

  OnStartRunningUrl(url) {
    this._msgSend.notifyListenerOnStartSending(null, 0);
  },

  OnStopRunningUrl(url, exitCode) {
    let mailUrl = url.QueryInterface(Ci.nsIMsgMailNewsUrl);
    mailUrl.UnRegisterListener(this);

    this._msgSend.sendDeliveryCallback(url, this._isNewsDelivery, exitCode);
  },
};
