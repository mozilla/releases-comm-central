/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  MailUtils: "resource:///modules/MailUtils.sys.mjs",
  MimeMessage: "resource:///modules/MimeMessage.sys.mjs",
  MsgUtils: "resource:///modules/MimeMessageUtils.sys.mjs",
  jsmime: "resource:///modules/jsmime.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

// nsMsgKey_None from MailNewsTypes.h.
const nsMsgKey_None = 0xffffffff;

/**
 * A class to manage sending processes.
 *
 * @implements {nsIMsgSend}
 * @implements {nsIWebProgressListener}
 */
export class MessageSend {
  QueryInterface = ChromeUtils.generateQI([
    "nsIMsgSend",
    "nsIWebProgressListener",
  ]);
  classID = Components.ID("{028b9c1e-8d0a-4518-80c2-842e07846eaa}");

  async createAndSendMessage(
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
    parentWindow,
    progress,
    listener,
    smtpPassword,
    originalMsgURI,
    compType
  ) {
    this._userIdentity = userIdentity;
    this._accountKey = accountKey || this._accountKeyForIdentity(userIdentity);
    this._compFields = compFields;
    this._dontDeliver = dontDeliver;
    this._deliverMode = deliverMode;
    this._msgToReplace = msgToReplace;
    this._sendProgress = progress;
    this._smtpPassword = smtpPassword;
    this._sendListener = listener;
    this._parentWindow = parentWindow;
    this._originalMsgURI = originalMsgURI;
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

    this._fcc = lazy.MsgUtils.getFcc(
      userIdentity,
      compFields,
      originalMsgURI,
      compType
    );
    const { embeddedAttachments, embeddedObjects } =
      this._gatherEmbeddedAttachments(editor);

    let bodyText = this._getBodyFromEditor(editor) || body;
    // Convert to a binary string. This is because MimeMessage requires it and:
    // 1. An attachment content is BinaryString.
    // 2. Body text and attachment contents are handled in the same way by
    // MimeEncoder to pick encoding and encode.
    bodyText = lazy.jsmime.mimeutils.typedArrayToString(
      new TextEncoder().encode(bodyText)
    );

    this._restoreEditorContent(embeddedObjects);
    this._message = new lazy.MimeMessage(
      userIdentity,
      compFields,
      this._fcc,
      bodyType,
      bodyText,
      deliverMode,
      originalMsgURI,
      compType,
      embeddedAttachments,
      this.sendReport
    );

    this._messageKey = nsMsgKey_None;

    this._setStatusMessage(
      this._composeBundle.GetStringFromName("creatingMailMessage")
    );
    lazy.MsgUtils.sendLogger.debug("Creating message file");
    let messageFile;
    try {
      // Create a local file from MimeMessage, then pass it to _deliverMessage.
      messageFile = await this._message.createMessageFile();
    } catch (e) {
      lazy.MsgUtils.sendLogger.error(e);
      let errorMsg = "";
      if (e.result == lazy.MsgUtils.NS_MSG_ERROR_ATTACHING_FILE) {
        errorMsg = this._composeBundle.formatStringFromName(
          "errorAttachingFile",
          [e.data.name || e.data.url]
        );
      }
      this.fail(e.result || Cr.NS_ERROR_FAILURE, errorMsg);
      this.notifyListenerOnStopSending(null, e.result, null, null);
      return null;
    }
    this._setStatusMessage(
      this._composeBundle.GetStringFromName("assemblingMessageDone")
    );
    lazy.MsgUtils.sendLogger.debug("Message file created");
    return this._deliverMessage(messageFile);
  }

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
    this._accountKey = accountKey || this._accountKeyForIdentity(userIdentity);
    this._compFields = compFields;
    this._deliverMode = deliverMode;
    this._msgToReplace = msgToReplace;
    this._smtpPassword = smtpPassword;
    this._sendListener = listener;
    this._statusFeedback = statusFeedback;
    this._shouldRemoveMessageFile = deleteSendFileOnCompletion;

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

    this._fcc = lazy.MsgUtils.getFcc(
      userIdentity,
      compFields,
      null,
      Ci.nsIMsgCompType.New
    );

    // nsMsgKey_None from MailNewsTypes.h.
    this._messageKey = 0xffffffff;

    return this._deliverMessage(messageFile);
  }

  // @see nsIMsgSend
  createRFC822Message(
    userIdentity,
    compFields,
    bodyType,
    bodyText,
    isDraft,
    attachedFiles,
    embeddedObjects,
    listener
  ) {
    this._userIdentity = userIdentity;
    this._compFields = compFields;
    this._dontDeliver = true;
    this._sendListener = listener;

    this._sendReport = Cc[
      "@mozilla.org/messengercompose/sendreport;1"
    ].createInstance(Ci.nsIMsgSendReport);
    this._composeBundle = Services.strings.createBundle(
      "chrome://messenger/locale/messengercompose/composeMsgs.properties"
    );

    // Initialize the error reporting mechanism.
    this.sendReport.reset();
    const deliverMode = isDraft
      ? Ci.nsIMsgSend.nsMsgSaveAsDraft
      : Ci.nsIMsgSend.nsMsgDeliverNow;
    this.sendReport.deliveryMode = deliverMode;

    // Convert nsIMsgAttachedFile[] to nsIMsgAttachment[]
    for (const file of attachedFiles) {
      const attachment = Cc[
        "@mozilla.org/messengercompose/attachment;1"
      ].createInstance(Ci.nsIMsgAttachment);
      attachment.name = file.realName;
      attachment.url = file.origUrl.spec;
      attachment.contentType = file.type;
      compFields.addAttachment(attachment);
    }

    // Convert nsIMsgEmbeddedImageData[] to nsIMsgAttachment[]
    const embeddedAttachments = embeddedObjects.map(obj => {
      const attachment = Cc[
        "@mozilla.org/messengercompose/attachment;1"
      ].createInstance(Ci.nsIMsgAttachment);
      attachment.name = obj.name;
      attachment.contentId = obj.cid;
      attachment.url = obj.uri.spec;
      return attachment;
    });

    this._message = new lazy.MimeMessage(
      userIdentity,
      compFields,
      null,
      bodyType,
      bodyText,
      deliverMode,
      null,
      Ci.nsIMsgCompType.New,
      embeddedAttachments,
      this.sendReport
    );

    this._messageKey = nsMsgKey_None;

    // Create a local file from MimeMessage, then pass it to _deliverMessage.
    this._message
      .createMessageFile()
      .then(messageFile => this._deliverMessage(messageFile));
  }

  // nsIWebProgressListener.
  onLocationChange(webProgress, request, location, flags) {}
  onProgressChange(
    webProgress,
    request,
    curSelfProgress,
    maxSelfProgress,
    curTotalProgress,
    maxTotalProgress
  ) {}
  onStatusChange(webProgress, request, status, message) {}
  onSecurityChange(webProgress, request, state) {}
  onContentBlockingEvent(webProgress, request, event) {}
  onStateChange(webProgress, request, stateFlags, status) {
    if (
      stateFlags & Ci.nsIWebProgressListener.STATE_STOP &&
      !Components.isSuccessCode(status)
    ) {
      lazy.MsgUtils.sendLogger.debug("onStateChange with failure. Aborting.");
      this._isRetry = false;
      this.abort();
    }
  }

  abort() {
    if (this._aborting) {
      return;
    }
    this._aborting = true;
    if (this._smtpRequest?.value) {
      this._smtpRequest.value.cancel(Cr.NS_ERROR_ABORT);
      this._smtpRequest = null;
    }
    if (this._msgCopy) {
      MailServices.copy.notifyCompletion(
        this._copyFile,
        this._msgCopy.dstFolder,
        Cr.NS_ERROR_ABORT
      );
    } else {
      // If already in the fcc step, notifyListenerOnStopCopy will do the clean up.
      this._cleanup();
    }
    if (!this._failed) {
      // Emit stopsending event if the sending is cancelled by user, so that
      // listeners can do necessary clean up, e.g. reset the sending button.
      this.notifyListenerOnStopSending(null, Cr.NS_ERROR_ABORT, null, null);
    }
    this._aborting = false;
  }

  fail(exitCode, errorMsg) {
    this._failed = true;
    if (!Components.isSuccessCode(exitCode) && exitCode != Cr.NS_ERROR_ABORT) {
      lazy.MsgUtils.sendLogger.error(
        `Sending failed; ${errorMsg}, exitCode=${exitCode}, originalMsgURI=${this._originalMsgURI}`
      );
      this._sendReport.setError(
        Ci.nsIMsgSendReport.process_Current,
        exitCode,
        false
      );
      if (errorMsg) {
        this._sendReport.setMessage(
          Ci.nsIMsgSendReport.process_Current,
          errorMsg,
          false
        );
      }
      exitCode = this._sendReport.displayReport(this._parentWindow, true, true);
    }
    this.abort();

    return exitCode;
  }

  getPartForDomIndex(domIndex) {
    throw Components.Exception(
      "getPartForDomIndex not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  getProgress() {
    return this._sendProgress;
  }

  /**
   * NOTE: This is a copy of the C++ code, msgId and msgSize are only
   * placeholders. Maybe refactor this after nsMsgSend is gone.
   */
  notifyListenerOnStartSending(msgId, msgSize) {
    lazy.MsgUtils.sendLogger.debug("notifyListenerOnStartSending");
    if (this._sendListener) {
      this._sendListener.onStartSending(msgId, msgSize);
    }
  }

  notifyListenerOnStartCopy() {
    lazy.MsgUtils.sendLogger.debug("notifyListenerOnStartCopy");
    if (this._sendListener instanceof Ci.nsIMsgCopyServiceListener) {
      this._sendListener.OnStartCopy();
    }
  }

  notifyListenerOnProgressCopy(progress, progressMax) {
    lazy.MsgUtils.sendLogger.debug("notifyListenerOnProgressCopy");
    if (this._sendListener instanceof Ci.nsIMsgCopyServiceListener) {
      this._sendListener.OnProgress(progress, progressMax);
    }
  }

  notifyListenerOnStopCopy(status) {
    lazy.MsgUtils.sendLogger.debug(
      `notifyListenerOnStopCopy; status=${status}`
    );
    this._msgCopy = null;

    if (!this._isRetry) {
      const statusMsgEntry = Components.isSuccessCode(status)
        ? "copyMessageComplete"
        : "copyMessageFailed";
      this._setStatusMessage(
        this._composeBundle.GetStringFromName(statusMsgEntry)
      );
    } else if (Components.isSuccessCode(status)) {
      // We got here via retry and the save to sent, drafts or template
      // succeeded so take down our progress dialog. We don't need it any more.
      this._sendProgress.unregisterListener(this);
      this._sendProgress.closeProgressDialog(false);
      this._isRetry = false;
    }

    if (!Components.isSuccessCode(status)) {
      const localFoldersAccountName =
        MailServices.accounts.localFoldersServer.prettyName;
      const folder = lazy.MailUtils.getOrCreateFolder(this._folderUri);
      const accountName = folder?.server.prettyName;
      if (!this._fcc || !localFoldersAccountName || !accountName) {
        this.fail(Cr.NS_OK, null);
        return;
      }

      const params = [folder.name, accountName, localFoldersAccountName];
      let promptMsg;
      switch (this._deliverMode) {
        case Ci.nsIMsgSend.nsMsgDeliverNow:
        case Ci.nsIMsgSend.nsMsgSendUnsent:
          promptMsg = this._composeBundle.formatStringFromName(
            "promptToSaveSentLocally2",
            params
          );
          break;
        case Ci.nsIMsgSend.nsMsgSaveAsDraft:
          promptMsg = this._composeBundle.formatStringFromName(
            "promptToSaveDraftLocally2",
            params
          );
          break;
        case Ci.nsIMsgSend.nsMsgSaveAsTemplate:
          promptMsg = this._composeBundle.formatStringFromName(
            "promptToSaveTemplateLocally2",
            params
          );
          break;
      }
      if (promptMsg) {
        const showCheckBox = { value: false };
        const buttonFlags =
          Ci.nsIPrompt.BUTTON_POS_0 * Ci.nsIPrompt.BUTTON_TITLE_IS_STRING +
          Ci.nsIPrompt.BUTTON_POS_1 * Ci.nsIPrompt.BUTTON_TITLE_DONT_SAVE +
          Ci.nsIPrompt.BUTTON_POS_2 * Ci.nsIPrompt.BUTTON_TITLE_SAVE;
        const dialogTitle =
          this._composeBundle.GetStringFromName("SaveDialogTitle");
        const buttonLabelRety =
          this._composeBundle.GetStringFromName("buttonLabelRetry2");
        const buttonPressed = Services.prompt.confirmEx(
          this._parentWindow,
          dialogTitle,
          promptMsg,
          buttonFlags,
          buttonLabelRety,
          null,
          null,
          null,
          showCheckBox
        );
        if (buttonPressed == 0) {
          // retry button clicked
          // Check we have a progress dialog.
          if (
            this._sendProgress.processCanceledByUser &&
            Services.prefs.getBoolPref("mailnews.show_send_progress")
          ) {
            const progress = Cc[
              "@mozilla.org/messenger/progress;1"
            ].createInstance(Ci.nsIMsgProgress);

            const params = Cc[
              "@mozilla.org/messengercompose/composeprogressparameters;1"
            ].createInstance(Ci.nsIMsgComposeProgressParams);
            params.subject = this._parentWindow.gMsgCompose.compFields.subject;
            params.deliveryMode = this._deliverMode;

            progress.openProgressDialog(
              this._parentWindow,
              this._sendProgress.msgWindow,
              "chrome://messenger/content/messengercompose/sendProgress.xhtml",
              false,
              params
            );

            progress.onStateChange(
              null,
              null,
              Ci.nsIWebProgressListener.STATE_START,
              Cr.NS_OK
            );

            // We want to hear when this is cancelled.
            progress.registerListener(this);

            this._sendProgress = progress;
            this._isRetry = true;
          }
          // Ensure statusFeedback is set so progress percent bargraph occurs.
          this._sendProgress.msgWindow.statusFeedback = this._sendProgress;

          this._mimeDoFcc();
          return;
        } else if (buttonPressed == 2) {
          try {
            // Try to save to Local Folders/<account name>. Pass null to save
            // to local folders and not the configured fcc.
            this._mimeDoFcc(null, true, Ci.nsIMsgSend.nsMsgDeliverNow);
            return;
          } catch (e) {
            Services.prompt.alert(
              this._parentWindow,
              null,
              this._composeBundle.GetStringFromName("saveToLocalFoldersFailed")
            );
          }
        }
      }
      this.fail(Cr.NS_OK, null);
    }

    if (
      !this._fcc2Handled &&
      this._messageKey != nsMsgKey_None &&
      [Ci.nsIMsgSend.nsMsgDeliverNow, Ci.nsIMsgSend.nsMsgSendUnsent].includes(
        this._deliverMode
      )
    ) {
      try {
        this._filterSentMessage();
      } catch (e) {
        this.onStopOperation(e.result);
      }
      return;
    }

    this._doFcc2();
  }

  notifyListenerOnStopSending(msgId, status, msg, returnFile) {
    lazy.MsgUtils.sendLogger.debug(
      `notifyListenerOnStopSending; status=${status}`
    );
    try {
      this._sendListener?.onStopSending(msgId, status, msg, returnFile);
    } catch (e) {}
  }

  notifyListenerOnTransportSecurityError(msgId, status, secInfo, location) {
    lazy.MsgUtils.sendLogger.debug(
      `notifyListenerOnTransportSecurityError; status=${status}, location=${location}`
    );
    if (!this._sendListener) {
      return;
    }
    try {
      this._sendListener.onTransportSecurityError(
        msgId,
        status,
        secInfo,
        location
      );
    } catch (e) {}
  }

  /**
   * Called by nsIMsgFilterService.
   */
  onStopOperation(status) {
    lazy.MsgUtils.sendLogger.debug(`onStopOperation; status=${status}`);
    if (Components.isSuccessCode(status)) {
      this._setStatusMessage(
        this._composeBundle.GetStringFromName("filterMessageComplete")
      );
    } else {
      this._setStatusMessage(
        this._composeBundle.GetStringFromName("filterMessageFailed")
      );
      Services.prompt.alert(
        this._parentWindow,
        null,
        this._composeBundle.GetStringFromName("errorFilteringMsg")
      );
    }

    this._doFcc2();
  }

  /**
   * Handle the exit code of message delivery.
   *
   * @param {nsIURI} url - The delivered message uri.
   * @param {boolean} isNewsDelivery - The message was delivered to newsgroup.
   * @param {nsreault} exitCode - The exit code of message delivery.
   */
  _deliveryExitProcessing(url, isNewsDelivery, exitCode) {
    lazy.MsgUtils.sendLogger.debug(
      `Delivery exit processing; exitCode=${exitCode}`
    );
    if (!Components.isSuccessCode(exitCode)) {
      let isNSSError = false;
      const errorName = lazy.MsgUtils.getErrorStringName(exitCode);
      let errorMsg;
      if (
        [
          lazy.MsgUtils.NS_ERROR_SMTP_SEND_FAILED_UNKNOWN_SERVER,
          lazy.MsgUtils.NS_ERROR_SMTP_SEND_FAILED_REFUSED,
          lazy.MsgUtils.NS_ERROR_SMTP_SEND_FAILED_INTERRUPTED,
          lazy.MsgUtils.NS_ERROR_SMTP_SEND_FAILED_TIMEOUT,
          lazy.MsgUtils.NS_ERROR_SMTP_PASSWORD_UNDEFINED,
          lazy.MsgUtils.NS_ERROR_SMTP_AUTH_FAILURE,
          lazy.MsgUtils.NS_ERROR_SMTP_AUTH_GSSAPI,
          lazy.MsgUtils.NS_ERROR_SMTP_AUTH_MECH_NOT_SUPPORTED,
          lazy.MsgUtils.NS_ERROR_SMTP_AUTH_CHANGE_ENCRYPT_TO_PLAIN_NO_SSL,
          lazy.MsgUtils.NS_ERROR_SMTP_AUTH_CHANGE_ENCRYPT_TO_PLAIN_SSL,
          lazy.MsgUtils.NS_ERROR_SMTP_AUTH_CHANGE_PLAIN_TO_ENCRYPT,
          lazy.MsgUtils.NS_ERROR_STARTTLS_FAILED_EHLO_STARTTLS,
        ].includes(exitCode)
      ) {
        errorMsg = lazy.MsgUtils.formatStringWithSMTPHostName(
          this._userIdentity,
          this._composeBundle,
          errorName
        );
      } else {
        const nssErrorsService = Cc[
          "@mozilla.org/nss_errors_service;1"
        ].getService(Ci.nsINSSErrorsService);
        try {
          // This is a server security issue as determined by the Mozilla
          // platform. To the Mozilla security message string, appended a string
          // having additional information with the server name encoded.
          errorMsg = nssErrorsService.getErrorMessage(exitCode);
          errorMsg +=
            "\n" +
            lazy.MsgUtils.formatStringWithSMTPHostName(
              this._userIdentity,
              this._composeBundle,
              "smtpSecurityIssue"
            );
          isNSSError = true;
        } catch (e) {
          if (url.errorMessage) {
            // url.errorMessage is an already localized message, usually
            // combined with the error message from SMTP server.
            errorMsg = url.errorMessage;
          } else if (errorName != "sendFailed") {
            // Not the default string. A mailnews error occurred that does not
            // require the server name to be encoded. Just print the descriptive
            // string.
            errorMsg = this._composeBundle.GetStringFromName(errorName);
          } else {
            errorMsg = this._composeBundle.GetStringFromName(
              "sendFailedUnexpected"
            );
            // nsIStringBundle.formatStringFromName doesn't work with %X.
            errorMsg.replace("%X", `0x${exitCode.toString(16)}`);
            errorMsg =
              "\n" +
              lazy.MsgUtils.formatStringWithSMTPHostName(
                this._userIdentity,
                this._composeBundle,
                "smtpSendFailedUnknownReason"
              );
          }
        }
      }
      if (isNSSError) {
        const u = url.QueryInterface(Ci.nsIMsgMailNewsUrl);
        this.notifyListenerOnTransportSecurityError(
          null,
          exitCode,
          u.failedSecInfo,
          u.asciiHostPort
        );
      }
      this.notifyListenerOnStopSending(null, exitCode, null, null);
      this.fail(exitCode, errorMsg);
      return;
    }

    if (
      isNewsDelivery &&
      (this._compFields.to || this._compFields.cc || this._compFields.bcc)
    ) {
      this._deliverAsMail();
      return;
    }

    this.notifyListenerOnStopSending(
      this._compFields.messageId,
      exitCode,
      null,
      null
    );

    this._doFcc();
  }

  sendDeliveryCallback(url, isNewsDelivery, exitCode) {
    if (isNewsDelivery) {
      if (
        !Components.isSuccessCode(exitCode) &&
        exitCode != Cr.NS_ERROR_ABORT &&
        !lazy.MsgUtils.isMsgError(exitCode)
      ) {
        exitCode = lazy.MsgUtils.NS_ERROR_POST_FAILED;
      }
      return this._deliveryExitProcessing(url, isNewsDelivery, exitCode);
    }
    if (!Components.isSuccessCode(exitCode)) {
      switch (exitCode) {
        case Cr.NS_ERROR_UNKNOWN_HOST:
        case Cr.NS_ERROR_UNKNOWN_PROXY_HOST:
          exitCode = lazy.MsgUtils.NS_ERROR_SMTP_SEND_FAILED_UNKNOWN_SERVER;
          break;
        case Cr.NS_ERROR_CONNECTION_REFUSED:
        case Cr.NS_ERROR_PROXY_CONNECTION_REFUSED:
          exitCode = lazy.MsgUtils.NS_ERROR_SMTP_SEND_FAILED_REFUSED;
          break;
        case Cr.NS_ERROR_NET_INTERRUPT:
          exitCode = lazy.MsgUtils.NS_ERROR_SMTP_SEND_FAILED_INTERRUPTED;
          break;
        case Cr.NS_ERROR_NET_TIMEOUT:
        case Cr.NS_ERROR_NET_RESET:
          exitCode = lazy.MsgUtils.NS_ERROR_SMTP_SEND_FAILED_TIMEOUT;
          break;
        default:
          break;
      }
    }
    return this._deliveryExitProcessing(url, isNewsDelivery, exitCode);
  }

  get folderUri() {
    return this._folderUri;
  }

  get messageId() {
    return this._compFields.messageId;
  }

  /**
   * @type {nsMsgKey}
   */
  set messageKey(key) {
    this._messageKey = key;
  }

  /**
   * @type {nsMsgKey}
   */
  get messageKey() {
    return this._messageKey;
  }

  get sendReport() {
    return this._sendReport;
  }

  _setStatusMessage(msg) {
    if (this._sendProgress) {
      this._sendProgress.onStatusChange(null, null, Cr.NS_OK, msg);
    }
  }

  /**
   * Deliver a message.
   *
   * @param {nsIFile} file - The message file to deliver.
   */
  async _deliverMessage(file) {
    if (this._dontDeliver) {
      this.notifyListenerOnStopSending(null, Cr.NS_OK, null, file);
      return;
    }

    this._messageFile = file;
    if (
      [
        Ci.nsIMsgSend.nsMsgQueueForLater,
        Ci.nsIMsgSend.nsMsgDeliverBackground,
        Ci.nsIMsgSend.nsMsgSaveAsDraft,
        Ci.nsIMsgSend.nsMsgSaveAsTemplate,
      ].includes(this._deliverMode)
    ) {
      await this._mimeDoFcc();
      return;
    }

    const warningSize = Services.prefs.getIntPref(
      "mailnews.message_warning_size"
    );
    if (warningSize > 0 && file.fileSize > warningSize) {
      const messenger = Cc["@mozilla.org/messenger;1"].createInstance(
        Ci.nsIMessenger
      );
      const msg = this._composeBundle.formatStringFromName(
        "largeMessageSendWarning",
        [messenger.formatFileSize(file.fileSize)]
      );
      if (!Services.prompt.confirm(this._parentWindow, null, msg)) {
        this.fail(lazy.MsgUtils.NS_ERROR_BUT_DONT_SHOW_ALERT, msg);
        throw Components.Exception(
          "Cancelled sending large message",
          Cr.NS_ERROR_FAILURE
        );
      }
    }

    this._deliveryFile = await this._createDeliveryFile();
    if (this._compFields.newsgroups) {
      this._deliverAsNews();
      return;
    }
    await this._deliverAsMail();
  }

  /**
   * Strip Bcc header, create the file to be actually delivered.
   *
   * @returns {nsIFile}
   */
  async _createDeliveryFile() {
    if (!this._compFields.bcc) {
      return this._messageFile;
    }
    const deliveryFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
    deliveryFile.append("nsemail.tmp");
    deliveryFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
    const content = await IOUtils.read(this._messageFile.path);
    const bodyIndex = content.findIndex(
      (el, index) =>
        // header and body are separated by \r\n\r\n
        el == 13 &&
        content[index + 1] == 10 &&
        content[index + 2] == 13 &&
        content[index + 3] == 10
    );
    const header = new TextDecoder("UTF-8").decode(content.slice(0, bodyIndex));
    let lastLinePruned = false;
    let headerToWrite = "";
    for (const line of header.split("\r\n")) {
      if (line.startsWith("Bcc") || (line.startsWith(" ") && lastLinePruned)) {
        lastLinePruned = true;
        continue;
      }
      lastLinePruned = false;
      headerToWrite += `${line}\r\n`;
    }
    const encodedHeader = new TextEncoder().encode(headerToWrite);
    // Prevent extra \r\n, which was already added to the last head line.
    const body = content.slice(bodyIndex + 2);
    const combinedContent = new Uint8Array(encodedHeader.length + body.length);
    combinedContent.set(encodedHeader);
    combinedContent.set(body, encodedHeader.length);
    await IOUtils.write(deliveryFile.path, combinedContent);
    return deliveryFile;
  }

  /**
   * Create the file to be copied to the Sent folder, add X-Mozilla-Status and
   * X-Mozilla-Status2 if needed.
   *
   * @returns {nsIFile}
   */
  async _createCopyFile() {
    if (!this._folderUri.startsWith("mailbox:")) {
      return this._messageFile;
    }

    // Add a `From - Date` line, so that nsLocalMailFolder.cpp won't add a
    // dummy envelope. The date string will be parsed by PR_ParseTimeString.
    // TODO: this should not be added to Maildir, see bug 1686852.
    let contentToWrite = `From - ${new Date().toUTCString()}\r\n`;
    const xMozillaStatus = lazy.MsgUtils.getXMozillaStatus(this._deliverMode);
    const xMozillaStatus2 = lazy.MsgUtils.getXMozillaStatus2(this._deliverMode);
    if (xMozillaStatus) {
      contentToWrite += `X-Mozilla-Status: ${xMozillaStatus}\r\n`;
    }
    if (xMozillaStatus2) {
      contentToWrite += `X-Mozilla-Status2: ${xMozillaStatus2}\r\n`;
    }

    // Create a separate copy file when there are extra headers.
    const copyFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
    copyFile.append("nscopy.tmp");
    copyFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
    await IOUtils.writeUTF8(copyFile.path, contentToWrite);
    await IOUtils.write(
      copyFile.path,
      await IOUtils.read(this._messageFile.path),
      {
        mode: "append",
      }
    );
    return copyFile;
  }

  /**
   * Start copy operation according to this._fcc value.
   */
  async _doFcc() {
    if (!this._fcc || !lazy.MsgUtils.canSaveToFolder(this._fcc)) {
      this.notifyListenerOnStopCopy(Cr.NS_OK);
      return;
    }
    this.sendReport.currentProcess = Ci.nsIMsgSendReport.process_Copy;
    this._mimeDoFcc(this._fcc, false, Ci.nsIMsgSend.nsMsgDeliverNow);
  }

  /**
   * Copy a message to a folder, or fallback to a folder depending on pref and
   * deliverMode, usually Drafts/Sent.
   *
   * @param {string} [fccHeader=this._fcc] - The target folder uri to copy the
   * message to.
   * @param {boolean} [throwOnError=false] - By default notifyListenerOnStopCopy
   * is called on error. When throwOnError is true, the caller can handle the
   * error by itself.
   * @param {nsMsgDeliverMode} [deliverMode=this._deliverMode] - The deliver mode.
   */
  async _mimeDoFcc(
    fccHeader = this._fcc,
    throwOnError = false,
    deliverMode = this._deliverMode
  ) {
    let folder;
    let folderUri;
    if (fccHeader) {
      folder = lazy.MailUtils.getExistingFolder(fccHeader);
    }
    if (
      [Ci.nsIMsgSend.nsMsgDeliverNow, Ci.nsIMsgSend.nsMsgSendUnsent].includes(
        deliverMode
      ) &&
      folder
    ) {
      this._folderUri = fccHeader;
    } else if (fccHeader == null) {
      // Set fcc_header to a special folder in Local Folders "account" since can't
      // save to Sent mbox, typically because imap connection is down. This
      // folder is created if it doesn't yet exist.
      const rootFolder = MailServices.accounts.localFoldersServer.rootMsgFolder;
      folderUri = rootFolder.URI + "/";

      // Now append the special folder name folder to the local folder uri.
      if (
        [
          Ci.nsIMsgSend.nsMsgDeliverNow,
          Ci.nsIMsgSend.nsMsgSendUnsent,
          Ci.nsIMsgSend.nsMsgSaveAsDraft,
          Ci.nsIMsgSend.nsMsgSaveAsTemplate,
        ].includes(this._deliverMode)
      ) {
        // Typically, this appends "Sent-", "Drafts-" or "Templates-" to folder
        // and then has the account name appended, e.g., .../Sent-MyImapAccount.
        const folder = lazy.MailUtils.getOrCreateFolder(this._folderUri);
        folderUri += folder.name + "-";
      }
      if (this._fcc) {
        // Get the account name where the "save to" failed.
        const accountName = lazy.MailUtils.getOrCreateFolder(this._fcc).server
          .prettyName;

        // Now append the imap account name (escaped) to the folder uri.
        folderUri += accountName;
        this._folderUri = folderUri;
      }
    } else {
      this._folderUri = lazy.MsgUtils.getMsgFolderURIFromPrefs(
        this._userIdentity,
        this._deliverMode
      );
      if (
        (this._deliverMode == Ci.nsIMsgSend.nsMsgSaveAsDraft &&
          this._compFields.draftId) ||
        (this._deliverMode == Ci.nsIMsgSend.nsMsgSaveAsTemplate &&
          this._compFields.templateId)
      ) {
        // Turn the draft/template ID into a folder URI string.
        const messenger = Cc["@mozilla.org/messenger;1"].createInstance(
          Ci.nsIMessenger
        );
        try {
          // This can fail if the user renames/removed/moved the folder.
          folderUri = messenger.msgHdrFromURI(
            this._deliverMode == Ci.nsIMsgSend.nsMsgSaveAsDraft
              ? this._compFields.draftId
              : this._compFields.templateId
          ).folder.URI;
        } catch (ex) {
          console.warn(ex);
        }
        // Only accept it if it's a subfolder of the identity's draft/template folder.
        if (folderUri?.startsWith(this._folderUri)) {
          this._folderUri = folderUri;
        }
      }
    }
    lazy.MsgUtils.sendLogger.debug(
      `Processing fcc; folderUri=${this._folderUri}`
    );

    this._msgCopy = Cc[
      "@mozilla.org/messengercompose/msgcopy;1"
    ].createInstance(Ci.nsIMsgCopy);
    this._copyFile = await this._createCopyFile();
    lazy.MsgUtils.sendLogger.debug("fcc file created");

    // Notify nsMsgCompose about the saved folder.
    if (this._sendListener) {
      this._sendListener.onGetDraftFolderURI(
        this._compFields.messageId,
        this._folderUri
      );
    }
    folder = lazy.MailUtils.getOrCreateFolder(this._folderUri);
    const statusMsg = this._composeBundle.formatStringFromName(
      "copyMessageStart",
      [folder?.name || "?"]
    );
    this._setStatusMessage(statusMsg);
    lazy.MsgUtils.sendLogger.debug("startCopyOperation");
    try {
      this._msgCopy.startCopyOperation(
        this._userIdentity,
        this._copyFile,
        this._deliverMode,
        this,
        this._folderUri,
        this._msgToReplace
      );
    } catch (e) {
      lazy.MsgUtils.sendLogger.warn(
        `startCopyOperation failed with ${e.result}`
      );
      if (throwOnError) {
        throw Components.Exception("startCopyOperation failed", e.result);
      }
      this.notifyListenerOnStopCopy(e.result);
    }
  }

  /**
   * Handle the fcc2 field. Then notify OnStopCopy and clean up.
   */
  _doFcc2() {
    // Handle fcc2 only once.
    if (!this._fcc2Handled && this._compFields.fcc2) {
      lazy.MsgUtils.sendLogger.debug("Processing fcc2");
      this._fcc2Handled = true;
      this._mimeDoFcc(
        this._compFields.fcc2,
        false,
        Ci.nsIMsgSend.nsMsgDeliverNow
      );
      return;
    }

    // NOTE: When nsMsgCompose receives OnStopCopy, it will release nsIMsgSend
    // instance and close the compose window, which prevents the Promise from
    // resolving in MsgComposeCommands.js. Use setTimeout to work around it.
    lazy.setTimeout(() => {
      try {
        if (this._sendListener instanceof Ci.nsIMsgCopyServiceListener) {
          this._sendListener.OnStopCopy(0);
        }
      } catch (e) {
        // Ignore the return value of OnStopCopy. Non-zero nsresult will throw
        // when going through XPConnect. In this case, we don't care about it.
        console.warn(
          `OnStopCopy failed with 0x${e.result.toString(16)}\n${e.stack}`
        );
      }
      this._cleanup();
    });
  }

  /**
   * Run filters on the just sent message.
   */
  _filterSentMessage() {
    this.sendReport.currentProcess = Ci.nsIMsgSendReport.process_Filter;
    const folder = lazy.MailUtils.getExistingFolder(this._folderUri);
    const msgHdr = folder.GetMessageHeader(this._messageKey);
    const msgWindow = this._sendProgress?.msgWindow;
    return MailServices.filters.applyFilters(
      Ci.nsMsgFilterType.PostOutgoing,
      [msgHdr],
      folder,
      msgWindow,
      this
    );
  }

  _cleanup() {
    lazy.MsgUtils.sendLogger.debug("Clean up temporary files");
    if (this._copyFile && this._copyFile != this._messageFile) {
      IOUtils.remove(this._copyFile.path).catch(console.error);
      this._copyFile = null;
    }
    if (this._deliveryFile && this._deliveryFile != this._messageFile) {
      IOUtils.remove(this._deliveryFile.path).catch(console.error);
      this._deliveryFile = null;
    }
    if (this._messageFile && this._shouldRemoveMessageFile) {
      IOUtils.remove(this._messageFile.path).catch(console.error);
      this._messageFile = null;
    }
  }

  /**
   * Send this._deliveryFile to smtp service.
   */
  async _deliverAsMail() {
    this.sendReport.currentProcess = Ci.nsIMsgSendReport.process_SMTP;
    this._setStatusMessage(
      this._composeBundle.GetStringFromName("sendingMessage")
    );
    const recipients = [
      this._compFields.to,
      this._compFields.cc,
      this._compFields.bcc,
    ].filter(Boolean);
    this._collectAddressesToAddressBook(recipients);
    const converter = Cc["@mozilla.org/messenger/mimeconverter;1"].getService(
      Ci.nsIMimeConverter
    );
    const encodedRecipients = converter.encodeMimePartIIStr_UTF8(
      recipients.join(","),
      true,
      0,
      Ci.nsIMimeConverter.MIME_ENCODED_WORD_SIZE
    );
    lazy.MsgUtils.sendLogger.debug(
      `Delivering mail message <${this._compFields.messageId}>`
    );
    const deliveryListener = new MsgDeliveryListener(this, false);
    const msgStatus =
      this._sendProgress instanceof Ci.nsIMsgStatusFeedback
        ? this._sendProgress
        : this._statusFeedback;
    this._smtpRequest = {};
    // Do async call. This is necessary to ensure _smtpRequest is set so that
    // cancel function can be obtained.
    await MailServices.smtp.wrappedJSObject.sendMailMessage(
      this._deliveryFile,
      encodedRecipients,
      this._userIdentity,
      this._compFields.from,
      this._smtpPassword,
      deliveryListener,
      msgStatus,
      null,
      this._compFields.DSN,
      this._compFields.messageId,
      {},
      this._smtpRequest
    );
  }

  /**
   * Send this._deliveryFile to nntp service.
   */
  _deliverAsNews() {
    this.sendReport.currentProcess = Ci.nsIMsgSendReport.process_NNTP;
    lazy.MsgUtils.sendLogger.debug("Delivering news message");
    const deliveryListener = new MsgDeliveryListener(this, true);
    let msgWindow;
    try {
      msgWindow =
        this._sendProgress?.msgWindow ||
        MailServices.mailSession.topmostMsgWindow;
    } catch (e) {}
    MailServices.nntp.postMessage(
      this._deliveryFile,
      this._compFields.newsgroups,
      this._accountKey,
      deliveryListener,
      msgWindow,
      null
    );
  }

  /**
   * Collect outgoing addresses to address book.
   *
   * @param {string[]} recipients - Outgoing addresses including to/cc/bcc.
   */
  _collectAddressesToAddressBook(recipients) {
    const createCard = Services.prefs.getBoolPref(
      "mail.collect_email_address_outgoing",
      false
    );

    const addressCollector = Cc[
      "@mozilla.org/addressbook/services/addressCollector;1"
    ].getService(Ci.nsIAbAddressCollector);
    for (const recipient of recipients) {
      addressCollector.collectAddress(recipient, createCard);
    }
  }

  /**
   * Check if link text is equivalent to the href.
   *
   * @param {string} text - The innerHTML of a <a> element.
   * @param {string} href - The href of a <a> element.
   * @returns {boolean} true if text is equivalent to href.
   */
  _isLinkFreeText(text, href) {
    href = href.trim();
    if (href.startsWith("mailto:")) {
      return this._isLinkFreeText(text, href.slice("mailto:".length));
    }
    text = text.trim();
    return (
      text == href ||
      (text.endsWith("/") && text.slice(0, -1) == href) ||
      (href.endsWith("/") && href.slice(0, -1) == text)
    );
  }

  /**
   * Collect embedded objects as attachments.
   *
   * @returns {object} collected
   * @returns {nsIMsgAttachment[]} collected.embeddedAttachments
   * @returns {object[]} collected.embeddedObjects objects {element, url}
   */
  _gatherEmbeddedAttachments(editor) {
    const embeddedAttachments = [];
    const embeddedObjects = [];

    if (!editor || !editor.document) {
      return { embeddedAttachments, embeddedObjects };
    }
    const nodes = [];
    nodes.push(...editor.document.querySelectorAll("img"));
    nodes.push(...editor.document.querySelectorAll("a"));
    const body = editor.document.querySelector("body[background]");
    if (body) {
      nodes.push(body);
    }

    const urlCidCache = {};
    for (const element of nodes) {
      if (element.tagName == "A" && element.href) {
        if (this._isLinkFreeText(element.innerHTML, element.href)) {
          // Set this special classname, which is recognized by nsIParserUtils,
          // so that links are not duplicated in text/plain.
          element.classList.add("moz-txt-link-freetext");
        }
      }
      let isImage = false;
      let url;
      let name;
      const mozDoNotSend = element.getAttribute("moz-do-not-send");
      if (mozDoNotSend && mozDoNotSend != "false") {
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
          (isImage &&
            Services.prefs.getBoolPref(
              "mail.compose.attach_http_images",
              false
            )) ||
          mozDoNotSend == "false";
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
        cid = lazy.MsgUtils.makeContentId(
          this._userIdentity,
          embeddedAttachments.length + 1
        );
        urlCidCache[url] = cid;

        const attachment = Cc[
          "@mozilla.org/messengercompose/attachment;1"
        ].createInstance(Ci.nsIMsgAttachment);
        attachment.name = name || lazy.MsgUtils.pickFileNameFromUrl(url);
        attachment.contentId = cid;
        attachment.url = url;
        embeddedAttachments.push(attachment);
      }
      embeddedObjects.push({
        element,
        url,
      });

      const newUrl = `cid:${cid}`;
      if (element.tagName == "BODY") {
        element.background = newUrl;
      } else if (element.tagName == "IMG") {
        element.src = newUrl;
      } else if (element.tagName == "A") {
        element.href = newUrl;
      }
    }
    return { embeddedAttachments, embeddedObjects };
  }

  /**
   * Restore embedded objects in editor to their original urls.
   *
   * @param {object[]} embeddedObjects - An array of embedded objects.
   * @param {Element} embeddedObjects.element
   * @param {string} embeddedObjects.url
   */
  _restoreEditorContent(embeddedObjects) {
    for (const { element, url } of embeddedObjects) {
      if (element.tagName == "BODY") {
        element.background = url;
      } else if (element.tagName == "IMG") {
        element.src = url;
      } else if (element.tagName == "A") {
        element.href = url;
      }
    }
  }

  /**
   * Get the message body from an editor.
   *
   * @param {nsIEditor} editor - The editor instance.
   * @returns {string}
   */
  _getBodyFromEditor(editor) {
    if (!editor) {
      return "";
    }

    const flags =
      Ci.nsIDocumentEncoder.OutputFormatted |
      Ci.nsIDocumentEncoder.OutputNoFormattingInPre |
      Ci.nsIDocumentEncoder.OutputDisallowLineBreaking;
    // bodyText is UTF-16 string.
    let bodyText = editor.outputToString("text/html", flags);

    // No need to do conversion if forcing plain text.
    if (!this._compFields.forcePlainText) {
      const cs = Cc["@mozilla.org/txttohtmlconv;1"].getService(
        Ci.mozITXTToHTMLConv
      );
      let csFlags = Ci.mozITXTToHTMLConv.kURLs;
      if (Services.prefs.getBoolPref("mail.send_struct", false)) {
        csFlags |= Ci.mozITXTToHTMLConv.kStructPhrase;
      }
      bodyText = cs.scanHTML(bodyText, csFlags);
    }

    return bodyText;
  }

  /**
   * Get the first account key of an identity.
   *
   * @param {nsIMsgIdentity} identity - The identity.
   * @returns {string}
   */
  _accountKeyForIdentity(identity) {
    const servers = MailServices.accounts.getServersForIdentity(identity);
    return servers.length
      ? MailServices.accounts.findAccountForServer(servers[0])?.key
      : null;
  }
}

/**
 * A listener to be passed to the SMTP service.
 *
 * @implements {nsIUrlListener}
 */
class MsgDeliveryListener {
  QueryInterface = ChromeUtils.generateQI(["nsIUrlListener"]);

  /**
   * @param {nsIMsgSend} msgSend - Send instance to use.
   * @param {boolean} isNewsDelivery - Whether this is an nntp message delivery.
   */
  constructor(msgSend, isNewsDelivery) {
    this._msgSend = msgSend;
    this._isNewsDelivery = isNewsDelivery;
  }

  OnStartRunningUrl(url) {
    this._msgSend.notifyListenerOnStartSending(null, 0);
  }

  OnStopRunningUrl(url, exitCode) {
    lazy.MsgUtils.sendLogger.debug(`OnStopRunningUrl; exitCode=${exitCode}`);
    const mailUrl = url.QueryInterface(Ci.nsIMsgMailNewsUrl);
    mailUrl.UnRegisterListener(this);

    this._msgSend.sendDeliveryCallback(url, this._isNewsDelivery, exitCode);
  }
}
