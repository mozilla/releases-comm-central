/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["MessageSend"];

var { OS } = ChromeUtils.import("resource://gre/modules/osfile.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { jsmime } = ChromeUtils.import("resource:///modules/jsmime.jsm");
var { MimeMessage } = ChromeUtils.import("resource:///modules/MimeMessage.jsm");
var { MsgUtils } = ChromeUtils.import(
  "resource:///modules/MimeMessageUtils.jsm"
);

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
    deliverMode,
    msgToReplace,
    bodyType,
    body,
    attachments,
    preloadedAttachments,
    parentWindow,
    progress,
    listener,
    smtpPassword,
    originalMsgURI,
    type
  ) {
    this._userIdentity = userIdentity;
    this._compFields = compFields;
    this._deliverMode = deliverMode;
    this._msgToReplace = msgToReplace;
    this._sendProgress = progress;
    this._smtpPassword = smtpPassword;
    this._sendListener = listener;
    this._parentWindow = parentWindow;
    this._shouldRemoveMessageFile = true;

    this._sendReport = Cc[
      "@mozilla.org/messengercompose/sendreport;1"
    ].createInstance(Ci.nsIMsgSendReport);
    this._composeBundle = Services.strings.createBundle(
      "chrome://messenger/locale/messengercompose/composeMsgs.properties"
    );

    // Initialize the error reporting mechanism.
    this.sendReport.reset();
    this.sendReport.deliveryMode = deliverMode;
    this._setStatusMessage(
      this._composeBundle.GetStringFromName("assemblingMailInformation")
    );
    this.sendReport.currentProcess = Ci.nsIMsgSendReport.process_BuildMessage;

    this._setStatusMessage(
      this._composeBundle.GetStringFromName("assemblingMessage")
    );

    let {
      embeddedAttachments,
      embeddedObjects,
    } = this._gatherEmbeddedAttachments(editor);
    let bodyText = this._getBodyFromEditor(editor) || body;
    this._restoreEditorContent(embeddedObjects);
    this._message = new MimeMessage(
      userIdentity,
      compFields,
      bodyType,
      bodyText,
      deliverMode,
      originalMsgURI,
      type,
      embeddedAttachments
    );

    // nsMsgKey_None from MailNewsTypes.h.
    this._messageKey = 0xffffffff;
    this._createAndSendMessage();
  },

  sendMessageFile(
    userIdentity,
    accountKey,
    compFields,
    messageFile,
    deleteSendFileOnCompletion,
    digest,
    deliverMode,
    msgToReplace,
    listener,
    statusFeedback,
    smtpPassword
  ) {
    this._userIdentity = userIdentity;
    this._compFields = compFields;
    this._deliverMode = deliverMode;
    this._msgToReplace = msgToReplace;
    this._smtpPassword = smtpPassword;
    this._sendListener = listener;

    this._sendReport = Cc[
      "@mozilla.org/messengercompose/sendreport;1"
    ].createInstance(Ci.nsIMsgSendReport);
    this._composeBundle = Services.strings.createBundle(
      "chrome://messenger/locale/messengercompose/composeMsgs.properties"
    );

    // Initialize the error reporting mechanism.
    this.sendReport.reset();
    this.sendReport.deliveryMode = deliverMode;
    this._setStatusMessage(
      this._composeBundle.GetStringFromName("assemblingMailInformation")
    );
    this.sendReport.currentProcess = Ci.nsIMsgSendReport.process_BuildMessage;

    this._setStatusMessage(
      this._composeBundle.GetStringFromName("assemblingMessage")
    );

    // nsMsgKey_None from MailNewsTypes.h.
    this._messageKey = 0xffffffff;

    this._deliverMessage(messageFile);
  },

  abort() {
    if (this._aborting) {
      return;
    }
    this._aborting = true;
    if (this._smtpRequest?.value) {
      this._smtpRequest.value.cancel(Ci.NS_ERROR_ABORT);
      this._smtpRequest = null;
    }
    if (this._msgCopy) {
      MailServices.copy.NotifyCompletion(
        this._copyFile,
        this._msgCopy,
        Ci.NS_ERROR_ABORT
      );
    }
    this._cleanup();
    this._aborting = false;
  },

  getDefaultPrompt() {
    if (this._parentWindow) {
      let prompter = Cc["@mozilla.org/prompter;1"].getService(
        Ci.nsIPromptFactory
      );
      return prompter.getPrompt(this._parentWindow, Ci.nsIPrompt);
    }
    // If we cannot find a prompter, try the mail3Pane window.
    let prompt;
    try {
      prompt = MailServices.mailSession.topmostMsgWindow.promptDialog;
    } catch (e) {
      console.warn(
        `topmostMsgWindow.promptDialog failed with 0x${e.result.toString(
          16
        )}\n${e.stack}`
      );
    }
    return prompt;
  },

  fail(exitCode, errorMsg) {
    let prompt = this.getDefaultPrompt();
    if (!Components.isSuccessCode(exitCode) && prompt) {
      this._sendReport.setError(
        Ci.nsIMsgSendReport.process_Current,
        exitCode,
        false
      );
      this._sendReport.setMessage(
        Ci.nsIMsgSendReport.process_Current,
        errorMsg,
        false
      );
      this._sendReport.displayReport(prompt, true, true);
    }
    this.abort();
  },

  getPartForDomIndex(domIndex) {
    throw Components.Exception(
      "getPartForDomIndex not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  },

  getProgress() {
    return this._sendProgress;
  },

  notifyListenerOnStartSending(msgId, msgSize) {
    if (this._sendListener) {
      this._sendListener.onStartSending(msgId, msgSize);
    }
  },

  notifyListenerOnStartCopy() {
    if (this._sendListener) {
      this._sendListener
        .QueryInterface(Ci.nsIMsgCopyServiceListener)
        .OnStartCopy();
    }
  },

  notifyListenerOnProgressCopy(progress, progressMax) {
    if (this._sendListener) {
      this._sendListener
        .QueryInterface(Ci.nsIMsgCopyServiceListener)
        .OnProgress(progress, progressMax);
    }
  },

  notifyListenerOnStopCopy(status) {
    this._msgCopy = null;

    if (this._sendListener) {
      try {
        this._sendListener
          .QueryInterface(Ci.nsIMsgCopyServiceListener)
          .OnStopCopy(status);
      } catch (e) {
        // Ignore the return value of OnStopCopy. Non-zero nsresult will throw
        // when going through XPConnect. In this case, we don't care about it.
        console.warn(
          `OnStopCopy failed with 0x${e.result.toString(16)}\n${e.stack}`
        );
      }
    }

    this._cleanup();
  },

  notifyListenerOnStopSending(msgId, status, msg, returnFile) {
    if (this._sendListener) {
      try {
        this._sendListener.onStopSending(msgId, status, msg, returnFile);
      } catch (e) {
        // Ignore the return value of OnStopSending.
        console.warn(
          `OnStopSending failed with 0x${e.result.toString(16)}\n${e.stack}`
        );
      }
    }
  },

  sendDeliveryCallback(url, isNewsDelivery, exitCode) {
    let newExitCode = exitCode;
    switch (exitCode) {
      case Cr.NS_ERROR_UNKNOWN_HOST:
      case Cr.NS_ERROR_UNKNOWN_PROXY_HOST:
        newExitCode = MsgUtils.NS_ERROR_SMTP_SEND_FAILED_UNKNOWN_SERVER;
        break;
      case Cr.NS_ERROR_CONNECTION_REFUSED:
      case Cr.NS_ERROR_PROXY_CONNECTION_REFUSED:
        newExitCode = MsgUtils.NS_ERROR_SMTP_SEND_FAILED_REFUSED;
        break;
      case Cr.NS_ERROR_NET_INTERRUPT:
      case Cr.NS_ERROR_ABORT:
        newExitCode = MsgUtils.NS_ERROR_SMTP_SEND_FAILED_INTERRUPTED;
        break;
      case Cr.NS_ERROR_NET_TIMEOUT:
      case Cr.NS_ERROR_NET_RESET:
        newExitCode = MsgUtils.NS_ERROR_SMTP_SEND_FAILED_TIMEOUT;
        break;
      default:
        break;
    }
    if (!Components.isSuccessCode(newExitCode)) {
      this.fail(
        newExitCode,
        MsgUtils.getErrorMessage(
          this._userIdentity,
          this._composeBundle,
          newExitCode
        )
      );
    }
    this.notifyListenerOnStopSending(null, newExitCode, null, null);
    if (Components.isSuccessCode(newExitCode)) {
      this._sendToMagicFolder();
    }
  },

  get folderUri() {
    return this._folderUri;
  },

  /**
   * @type {nsMsgKey}
   */
  set messageKey(key) {
    this._messageKey = key;
  },

  /**
   * @type {nsMsgKey}
   */
  get messageKey() {
    return this._messageKey;
  },

  get sendReport() {
    return this._sendReport;
  },

  /**
   * Create a local file from MimeMessage, then pass it to _deliverMessage.
   */
  async _createAndSendMessage() {
    this._setStatusMessage(
      this._composeBundle.GetStringFromName("creatingMailMessage")
    );
    let messageFile = await this._message.createMessageFile();
    await this._deliverMessage(messageFile);
  },

  _setStatusMessage(msg) {
    if (this._sendProgress) {
      this._sendProgress.onStatusChange(null, null, Cr.NS_OK, msg);
    }
  },

  /**
   * Deliver a message.
   *
   * @param {nsIFile} file - The message file to deliver.
   */
  async _deliverMessage(file) {
    this._messageFile = file;
    if (
      [
        Ci.nsIMsgSend.nsMsgQueueForLater,
        Ci.nsIMsgSend.nsMsgDeliverBackground,
        Ci.nsIMsgSend.nsMsgSaveAsDraft,
        Ci.nsIMsgSend.nsMsgSaveAsTemplate,
      ].includes(this._deliverMode)
    ) {
      await this._sendToMagicFolder(file);
      return;
    }
    this._deliverFileAsMail(file);
  },

  /**
   * Copy a message to Draft/Sent or other folder depending on pref and
   * deliverMode.
   */
  async _sendToMagicFolder() {
    this._folderUri = MsgUtils.getMsgFolderURIFromPrefs(
      this._userIdentity,
      this._deliverMode
    );
    let msgCopy = Cc["@mozilla.org/messengercompose/msgcopy;1"].createInstance(
      Ci.nsIMsgCopy
    );
    this._msgCopy = msgCopy;
    this._copyFile = this._messageFile;
    if (this._folderUri.startsWith("mailbox:")) {
      let { path, file: fileWriter } = await OS.File.openUnique(
        OS.Path.join(OS.Constants.Path.tmpDir, "nscopy.tmp")
      );
      // Add a `From - Date` line, so that nsLocalMailFolder.cpp won't add a
      // dummy envelope. The date string will be parsed by PR_ParseTimeString.
      await fileWriter.write(
        new TextEncoder().encode(`From - ${new Date().toUTCString()}\r\n`)
      );
      let xMozillaStatus = MsgUtils.getXMozillaStatus(this._deliverMode);
      let xMozillaStatus2 = MsgUtils.getXMozillaStatus2(this._deliverMode);
      if (xMozillaStatus) {
        await fileWriter.write(
          new TextEncoder().encode(`X-Mozilla-Status: ${xMozillaStatus}\r\n`)
        );
      }
      if (xMozillaStatus2) {
        await fileWriter.write(
          new TextEncoder().encode(`X-Mozilla-Status2: ${xMozillaStatus2}\r\n`)
        );
      }
      await fileWriter.write(await OS.File.read(this._messageFile.path));
      await fileWriter.close();
      this._copyFile = Cc["@mozilla.org/file/local;1"].createInstance(
        Ci.nsIFile
      );
      this._copyFile.initWithPath(path);
    }
    // Notify nsMsgCompose about the saved folder.
    if (this._sendListener) {
      this._sendListener.onGetDraftFolderURI(this._folderUri);
    }
    try {
      msgCopy.startCopyOperation(
        this._userIdentity,
        this._copyFile,
        this._deliverMode,
        this,
        this._folderUri,
        this._msgToReplace
      );
    } catch (e) {
      // Ignore the nserror, just notify OnStopCopy.
      this.notifyListenerOnStopCopy(0);
      console.warn(
        `startCopyOperation failed with 0x${e.result.toString(16)}\n${e.stack}`
      );
    }
  },

  _cleanup() {
    if (this._copyFile && this._copyFile != this._messageFile) {
      OS.File.remove(this._copyFile.path);
      this._copyFile = null;
    }
    if (this._messageFile && this._shouldRemoveMessageFile) {
      OS.File.remove(this._messageFile.path);
      this._messageFile = null;
    }
  },

  /**
   * Send a message file to smtp service. Far from complete.
   * TODO: actually send the message to cc/bcc.
   */
  _deliverFileAsMail(file) {
    let to = this._compFields.to || this._compFields.bcc || "";
    let converter = Cc["@mozilla.org/messenger/mimeconverter;1"].getService(
      Ci.nsIMimeConverter
    );
    to = encodeURIComponent(
      converter.encodeMimePartIIStr_UTF8(
        to,
        true,
        0,
        Ci.nsIMimeConverter.MIME_ENCODED_WORD_SIZE
      )
    );
    let deliveryListener = new MsgDeliveryListener(this, false);
    this._smtpRequest = {};
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
      this._smtpRequest
    );
  },

  /**
   * Collect embedded objects as attachments.
   * @returns {{embeddedAttachments: nsIMsgAttachment[], embeddedObjects: []}}
   */
  _gatherEmbeddedAttachments(editor) {
    let embeddedAttachments = [];
    let embeddedObjects = [];

    if (!editor || !editor.document) {
      return { embeddedAttachments, embeddedObjects };
    }
    let nodes = [];
    nodes.push(...editor.document.querySelectorAll("img"));
    nodes.push(...editor.document.querySelectorAll("a"));
    let body = editor.document.querySelector("body[background]");
    if (body) {
      nodes.push(body);
    }

    let urlCidCache = {};
    for (let element of nodes) {
      let isImage = false;
      let url;
      let name;
      let mozDoNotSend = element.getAttribute("moz-do-not-send");
      if (mozDoNotSend && mozDoNotSend.toLowerCase() != "false") {
        // Only empty or moz-do-not-send="false" may be accepted later.
        continue;
      }
      if (element.tagName == "BODY" && element.background) {
        isImage = true;
        url = element.background;
      } else if (element.tagName == "IMG" && element.src) {
        isImage = true;
        url = element.src;
        name = element.name;
      } else if (element.tagName == "A" && element.href) {
        url = element.href;
        name = element.name;
      } else {
        continue;
      }
      let acceptObject = false;
      // Before going further, check what scheme we're dealing with. Files need to
      // be converted to data URLs during composition. "Attaching" means
      // sending as a cid: part instead of original URL.
      if (/^https?:\/\//i.test(url)) {
        acceptObject =
          isImage &&
          Services.prefs.getBoolPref("mail.compose.attach_http_images", false);
      }
      if (/^(data|news|snews|nntp):/i.test(url)) {
        acceptObject = true;
      }
      if (!acceptObject) {
        continue;
      }

      let cid;
      if (urlCidCache[url]) {
        // If an url has already been inserted as MimePart, just reuse the cid.
        cid = urlCidCache[url];
      } else {
        cid = MsgUtils.makeContentId(
          this._userIdentity,
          embeddedAttachments.length + 1
        );
        urlCidCache[url] = cid;

        let attachment = Cc[
          "@mozilla.org/messengercompose/attachment;1"
        ].createInstance(Ci.nsIMsgAttachment);
        attachment.name = name || MsgUtils.pickFileNameFromUrl(url);
        attachment.contentId = cid;
        attachment.url = url;
        embeddedAttachments.push(attachment);
      }
      embeddedObjects.push({
        element,
        url,
      });

      let newUrl = `cid:${cid}`;
      if (element.tagName == "BODY") {
        element.background = newUrl;
      } else if (element.tagName == "IMG") {
        element.src = newUrl;
      } else if (element.tagName == "A") {
        element.href = newUrl;
      }
    }
    return { embeddedAttachments, embeddedObjects };
  },

  /**
   * Restore embedded objects in editor to their original urls.
   * @param {{element: Element, url: string}[]} - An array of embedded objects.
   */
  _restoreEditorContent(embeddedObjects) {
    for (let { element, url } of embeddedObjects) {
      if (element.tagName == "BODY") {
        element.background = url;
      } else if (element.tagName == "IMG") {
        element.src = url;
      } else if (element.tagName == "A") {
        element.href = url;
      }
    }
  },

  /**
   * Get the message body from an editor. This returns a BinaryString because:
   * 1. The body argument of createAndSendMessage is BinaryString.
   * 2. An attachment content is BinaryString.
   * 3. Body text and attachment contents are handled in the same way by
   * MimeEncoder to pick encoding and encode.
   * @param {nsIEditor} editor - The editor instance.
   * @returns {BinaryString}
   */
  _getBodyFromEditor(editor) {
    if (!editor) {
      return "";
    }

    let flags =
      Ci.nsIDocumentEncoder.OutputFormatted |
      Ci.nsIDocumentEncoder.OutputNoFormattingInPre |
      Ci.nsIDocumentEncoder.OutputDisallowLineBreaking;
    // bodyText is UTF-16 string.
    let bodyText = editor.outputToString("text/html", flags);

    // No need to do conversion if forcing plain text.
    if (!this._compFields.forcePlainText) {
      let cs = Cc["@mozilla.org/txttohtmlconv;1"].getService(
        Ci.mozITXTToHTMLConv
      );
      let csFlags = Ci.mozITXTToHTMLConv.kURLs;
      if (Services.prefs.getBoolPref("mail.send_struct", false)) {
        csFlags |= Ci.mozITXTToHTMLConv.kStructPhrase;
      }
      bodyText = cs.scanHTML(bodyText, csFlags);
    }

    // Convert UTF-16 string to byte string.
    return jsmime.mimeutils.typedArrayToString(
      new TextEncoder().encode(bodyText)
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
