/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

/* Globals from Thunderbird: */
/* global setMessageEncryptionStateButton */
/* global gFolderDisplay: false, currentAttachments: false */
/* global gDBView: false, msgWindow: false, messageHeaderSink: false, gMessageListeners: false, findEmailNodeFromPopupNode: true */
/* global gExpandedHeaderView: false, CanDetachAttachments: true, gEncryptedURIService: false, FillAttachmentListPopup: false */
/* global attachmentList: false, MailOfflineMgr: false, currentHeaderData: false, ContentTypeIsSMIME: false */

/* import-globals-from ../BondOpenPGP.jsm */

var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  // EnigmailAutocrypt: "chrome://openpgp/content/modules/autocrypt.jsm",
  EnigmailClipboard: "chrome://openpgp/content/modules/clipboard.jsm",
  EnigmailConstants: "chrome://openpgp/content/modules/constants.jsm",
  EnigmailCore: "chrome://openpgp/content/modules/core.jsm",
  EnigmailData: "chrome://openpgp/content/modules/data.jsm",
  EnigmailDialog: "chrome://openpgp/content/modules/dialog.jsm",
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.jsm",
  EnigmailGpg: "chrome://openpgp/content/modules/gpg.jsm",
  EnigmailKey: "chrome://openpgp/content/modules/key.jsm",
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  EnigmailMime: "chrome://openpgp/content/modules/mime.jsm",
  EnigmailMsgRead: "chrome://openpgp/content/modules/msgRead.jsm",
  EnigmailSingletons: "chrome://openpgp/content/modules/singletons.jsm",
  EnigmailStdlib: "chrome://openpgp/content/modules/stdlib.jsm",
  EnigmailURIs: "chrome://openpgp/content/modules/uris.jsm",
  EnigmailVerify: "chrome://openpgp/content/modules/mimeVerify.jsm",
  EnigmailWindows: "chrome://openpgp/content/modules/windows.jsm",
  // EnigmailWks: "chrome://openpgp/content/modules/webKey.jsm",
});

if (!Enigmail) {
  var Enigmail = {};
}

Enigmail.hdrView = {
  lastEncryptedMsgKey: null,
  lastEncryptedUri: null,
  flexbuttonAction: null,

  msgSignedStateString: null,
  msgEncryptedStateString: null,
  msgSignatureState: EnigmailConstants.MSG_SIG_NONE,
  msgEncryptionState: EnigmailConstants.MSG_ENC_NONE,
  msgSignatureKeyId: "",
  msgEncryptionKeyId: null,
  msgEncryptionAllKeyIds: null,

  alreadyWrappedCDA: false,

  reset() {
    this.msgSignedStateString = null;
    this.msgEncryptedStateString = null;
    this.msgSignatureState = EnigmailConstants.MSG_SIG_NONE;
    this.msgEncryptionState = EnigmailConstants.MSG_ENC_NONE;
    this.msgSignatureKeyId = "";
    this.msgEncryptionKeyId = null;
    this.msgEncryptionAllKeyIds = null;
    for (let value of ["decryptionFailed", "brokenExchange"]) {
      Enigmail.msg.removeNotification(value);
    }
  },

  hdrViewLoad() {
    EnigmailLog.DEBUG("enigmailMsgHdrViewOverlay.js: this.hdrViewLoad\n");

    // THE FOLLOWING OVERRIDES CODE IN msgHdrViewOverlay.js
    // which wouldn't work otherwise

    if (!this.alreadyWrappedCDA) {
      this.alreadyWrappedCDA = true;
      this.origCanDetachAttachments = CanDetachAttachments;
      CanDetachAttachments = function() {
        return (
          Enigmail.hdrView.origCanDetachAttachments() &&
          Enigmail.hdrView.enigCanDetachAttachments()
        );
      };
    }

    this.msgHdrViewLoad();

    /*
    // Override SMIME ui
    let signedHdrElement = document.getElementById("signedHdrIcon");
    if (signedHdrElement) {
      signedHdrElement.setAttribute(
        "onclick",
        "Enigmail.msg.viewSecurityInfo(event, true);"
      );
    }

    let encryptedHdrElement = document.getElementById("encryptedHdrIcon");
    if (encryptedHdrElement) {
      encryptedHdrElement.setAttribute(
        "onclick",
        "Enigmail.msg.viewSecurityInfo(event, true);"
      );
    }
    */

    let addrPopup = document.getElementById("emailAddressPopup");
    if (addrPopup) {
      addrPopup.addEventListener(
        "popupshowing",
        Enigmail.hdrView.displayAddressPopup.bind(addrPopup)
      );
    }

    // Thunderbird
    let attCtx = document.getElementById("attachmentItemContext");
    if (attCtx) {
      attCtx.addEventListener(
        "popupshowing",
        this.onShowAttachmentContextMenu.bind(Enigmail.hdrView)
      );
    }
  },

  displayAddressPopup(event) {
    let target = event.target;
    EnigmailFuncs.collapseAdvanced(target, "hidden");
  },

  statusBarHide() {
    /* elements might not have been set yet, so we try and ignore */
    try {
      this.reset();

      Enigmail.msg.setAttachmentReveal(null);
      if (Enigmail.msg.securityInfo) {
        Enigmail.msg.securityInfo.statusFlags = 0;
      }

      let bodyElement = document.getElementById("messagepane");
      bodyElement.removeAttribute("collapsed");
    } catch (ex) {
      console.debug(ex);
    }
  },

  updateHdrIcons(
    exitCode,
    statusFlags,
    extStatusFlags,
    keyId,
    userId,
    sigDetails,
    errorMsg,
    blockSeparation,
    encToDetails,
    xtraStatus,
    encMimePartNumber
  ) {
    EnigmailLog.DEBUG(
      "enigmailMsgHdrViewOverlay.js: this.updateHdrIcons: exitCode=" +
        exitCode +
        ", statusFlags=" +
        statusFlags +
        ", extStatusFlags=" +
        extStatusFlags +
        ", keyId=" +
        keyId +
        ", userId=" +
        userId +
        ", " +
        errorMsg +
        "\n"
    );

    /*
    if (
      Enigmail.msg.securityInfo &&
      Enigmail.msg.securityInfo.xtraStatus &&
      Enigmail.msg.securityInfo.xtraStatus === "wks-request"
    ) {
      return;
    }
    */

    if (
      gFolderDisplay.selectedMessageUris &&
      gFolderDisplay.selectedMessageUris.length > 0
    ) {
      this.lastEncryptedMsgKey = gFolderDisplay.selectedMessageUris[0];
    }

    if (!errorMsg) {
      errorMsg = "";
    } else {
      console.debug("OpenPGP error status: " + errorMsg);
    }

    var replaceUid = null;
    if (keyId && gFolderDisplay.selectedMessage) {
      replaceUid = EnigmailMsgRead.matchUidToSender(
        keyId,
        gFolderDisplay.selectedMessage.author
      );
    }

    if (!replaceUid) {
      replaceUid = userId.replace(/\n.*$/gm, "");
    }

    if (
      Enigmail.msg.savedHeaders &&
      "x-pgp-encoding-format" in Enigmail.msg.savedHeaders &&
      Enigmail.msg.savedHeaders["x-pgp-encoding-format"].search(
        /partitioned/i
      ) === 0
    ) {
      if (currentAttachments && currentAttachments.length) {
        Enigmail.msg.setAttachmentReveal(currentAttachments);
      }
    }

    if (userId && replaceUid) {
      // no EnigmailData.convertGpgToUnicode here; strings are already UTF-8
      replaceUid = replaceUid.replace(/\\[xe]3a/gi, ":");
      errorMsg = errorMsg.replace(userId, replaceUid);
    }

    var errorLines = "";

    if (exitCode == EnigmailConstants.POSSIBLE_PGPMIME) {
      exitCode = 0;
    } else if (errorMsg) {
      // no EnigmailData.convertGpgToUnicode here; strings are already UTF-8
      errorLines = errorMsg.split(/\r?\n/);
    }

    if (errorLines && errorLines.length > 22) {
      // Retain only first twenty lines and last two lines of error message
      var lastLines =
        errorLines[errorLines.length - 2] +
        "\n" +
        errorLines[errorLines.length - 1] +
        "\n";

      while (errorLines.length > 20) {
        errorLines.pop();
      }

      errorMsg = errorLines.join("\n") + "\n...\n" + lastLines;
    }

    if (!(statusFlags & EnigmailConstants.PGP_MIME_ENCRYPTED)) {
      encMimePartNumber = "";
    }

    var msgSigned =
      statusFlags &
      (EnigmailConstants.BAD_SIGNATURE |
        EnigmailConstants.GOOD_SIGNATURE |
        EnigmailConstants.EXPIRED_KEY_SIGNATURE |
        EnigmailConstants.EXPIRED_SIGNATURE |
        EnigmailConstants.UNCERTAIN_SIGNATURE |
        EnigmailConstants.REVOKED_KEY |
        EnigmailConstants.EXPIRED_KEY_SIGNATURE |
        EnigmailConstants.EXPIRED_SIGNATURE);

    if (msgSigned && statusFlags & EnigmailConstants.IMPORTED_KEY) {
      console.debug("unhandled status IMPORTED_KEY");
      statusFlags &= ~EnigmailConstants.IMPORTED_KEY;
    }

    // TODO: visualize the following signature attributes,
    // cross-check with corresponding email attributes
    // - date
    // - signer uid
    // - signer key
    // - signing and hash alg

    this.msgSignatureKeyId = keyId;

    if (encToDetails) {
      this.msgEncryptionKeyId = encToDetails.myRecipKey;
      this.msgEncryptionAllKeyIds = encToDetails.allRecipKeys;
    }

    let tmp = {
      statusFlags,
      extStatusFlags,
      keyId,
      userId,
      msgSigned,
      blockSeparation,
      xtraStatus,
      encryptedMimePart: encMimePartNumber,
    };
    Enigmail.msg.securityInfo = tmp;

    //Enigmail.msg.createArtificialAutocryptHeader();

    /*
    if (statusFlags & EnigmailConstants.UNCERTAIN_SIGNATURE) {
      this.tryImportAutocryptHeader();
    }
    */

    this.displayStatusBar();
    this.updateMsgDb();
  },

  /**
   * Check whether we got a WKS request
   */
  /*
  checkWksConfirmRequest(jsonStr) {
    let requestObj;
    try {
      requestObj = JSON.parse(jsonStr);
    } catch (ex) {
      EnigmailLog.DEBUG(
        "enigmailMsgHdrViewOverlay.js: checkWksConfirmRequest parsing JSON failed\n"
      );
      return;
    }

    if (
      "type" in requestObj &&
      requestObj.type.toLowerCase() === "confirmation-request"
    ) {
      EnigmailWks.getWksClientPathAsync(window, function(wksClientPath) {
        if (!wksClientPath) {
          return;
        }

        Enigmail.hdrView.displayFlexAction(
          "Web Key Directory Confirmation Request",
          "Confirm Request",
          "wks-request"
        );
        Enigmail.hdrView.displayWksMessage();
      });
    } else {
      EnigmailLog.DEBUG(
        "enigmailMsgHdrViewOverlay.js: checkWksConfirmRequest failed condition\n"
      );
    }
  },
  */

  /**
   * Display a localized message in lieu of the original message text
   */
  /*
  displayWksMessage() {
    EnigmailLog.DEBUG("enigmailMsgHdrViewOverlay.js: displayWksMessage()\n");

    if (Enigmail.msg.securityInfo.xtraStatus === "wks-request") {
      let enigMsgPane = document.getElementById("enigmailMsgDisplay");
      let bodyElement = document.getElementById("messagepane");
      bodyElement.setAttribute("collapsed", true);
      enigMsgPane.removeAttribute("collapsed");
      enigMsgPane.textContent = "This message has been sent by your email provider to confirm deployment of your OpenPGP public key\nin their Web Key Directory.\nProviding your public key helps others to discover your key and thus being able to encrypt messages to you.\n\nIf you want to deploy your key in the Web Key Directory now, please click on the button "Confirm Request" in the status bar.\nOtherwise, simply ignore this message."
      );
    }
  },
  */

  /**
   * Try to import an autocrypt header from an uncertain signature
   * (i.e. the sender's key is not available)
   */
  /*
  tryImportAutocryptHeader() {
    EnigmailLog.DEBUG(
      "enigmailMsgHdrViewOverlay.js: tryImportAutocryptHeader()\n"
    );

    if (!("autocrypt" in currentHeaderData)) {
      return;
    }
    if (!Enigmail.msg.isAutocryptEnabled()) {
      return;
    }
    if (!("from" in currentHeaderData)) {
      return;
    }

    let fromEmail = "";
    try {
      fromEmail = EnigmailFuncs.stripEmail(
        currentHeaderData.from.headerValue
      ).toLowerCase();
    } catch (ex) {
      console.debug(ex);
    }

    let keys = EnigmailKeyRing.getKeysByEmail(fromEmail, true);
    if (keys.length > 0) {
      return;
    }

    EnigmailAutocrypt.importAutocryptKeys([fromEmail]).then(foundKeys => {
      EnigmailLog.DEBUG(
        "enigmailMsgComposeOverlay.js: tryImportAutocryptHeader: got " +
          foundKeys.length +
          " autocrypt keys\n"
      );
      if (foundKeys.length > 0) {
        let k = EnigmailKeyRing.getKeyById(Enigmail.msg.securityInfo.keyId);
        if (k) {
          gDBView.reloadMessageWithAllParts();
        }
      }
    });
  },
  */

  async displayStatusBar() {
    let secInfo = Enigmail.msg.securityInfo;
    let statusFlags = secInfo.statusFlags;
    let extStatusFlags =
      "extStatusFlags" in secInfo ? secInfo.extStatusFlags : 0;

    let signed;
    let encrypted;

    if (
      statusFlags &
      (EnigmailConstants.DECRYPTION_FAILED |
        EnigmailConstants.DECRYPTION_INCOMPLETE)
    ) {
      encrypted = "notok";
      let unhideBar = false;
      let infoId;
      if (statusFlags & EnigmailConstants.NO_SECKEY) {
        this.msgEncryptionState = EnigmailConstants.MSG_ENC_NO_SECRET_KEY;

        unhideBar = true;
        infoId = "openpgp-cannot-decrypt-because-missing-key";
      } else {
        this.msgEncryptionState = EnigmailConstants.MSG_ENC_FAILURE;
        if (statusFlags & EnigmailConstants.MISSING_MDC) {
          unhideBar = true;
          infoId = "openpgp-cannot-decrypt-because-mdc";
        }
      }

      if (unhideBar) {
        Enigmail.msg.notificationBox.appendNotification(
          await document.l10n.formatValue(infoId),
          "decryptionFailed",
          "chrome://global/skin/icons/warning.svg",
          Enigmail.msg.notificationBox.PRIORITY_CRITICAL_MEDIUM,
          null
        );
      }

      this.msgSignatureState = EnigmailConstants.MSG_SIG_NONE;
    } else if (statusFlags & EnigmailConstants.DECRYPTION_OKAY) {
      EnigmailURIs.rememberEncryptedUri(this.lastEncryptedMsgKey);
      encrypted = "ok";
      this.msgEncryptionState = EnigmailConstants.MSG_ENC_OK;
      if (secInfo.xtraStatus && secInfo.xtraStatus == "buggyMailFormat") {
        console.log(
          await document.l10n.formatValue("decrypted-msg-with-format-error")
        );
      }
    }

    if (
      statusFlags &
      (EnigmailConstants.BAD_SIGNATURE |
        EnigmailConstants.REVOKED_KEY |
        EnigmailConstants.EXPIRED_KEY_SIGNATURE |
        EnigmailConstants.EXPIRED_SIGNATURE)
    ) {
      if (statusFlags & EnigmailConstants.INVALID_RECIPIENT) {
        this.msgSignatureState = EnigmailConstants.MSG_SIG_INVALID_KEY_REJECTED;
      } else {
        this.msgSignatureState = EnigmailConstants.MSG_SIG_INVALID;
      }
      signed = "notok";
    } else if (statusFlags & EnigmailConstants.GOOD_SIGNATURE) {
      if (statusFlags & EnigmailConstants.TRUSTED_IDENTITY) {
        this.msgSignatureState = EnigmailConstants.MSG_SIG_VALID_KEY_VERIFIED;
        signed = "verified";
      } else if (extStatusFlags & EnigmailConstants.EXT_SELF_IDENTITY) {
        signed = "ok";
        this.msgSignatureState = EnigmailConstants.MSG_SIG_VALID_SELF;
      } else {
        signed = "unverified";
        this.msgSignatureState = EnigmailConstants.MSG_SIG_VALID_KEY_UNVERIFIED;
      }
    } else if (statusFlags & EnigmailConstants.UNCERTAIN_SIGNATURE) {
      signed = "unknown";
      if (statusFlags & EnigmailConstants.INVALID_RECIPIENT) {
        signed = "mismatch";
        this.msgSignatureState =
          EnigmailConstants.MSG_SIG_UNCERTAIN_UID_MISMATCH;
      } else if (statusFlags & EnigmailConstants.NO_PUBKEY) {
        this.msgSignatureState =
          EnigmailConstants.MSG_SIG_UNCERTAIN_KEY_UNAVAILABLE;
        Enigmail.msg.notifySigKeyMissing(secInfo.keyId);
      } else {
        this.msgSignatureState =
          EnigmailConstants.MSG_SIG_UNCERTAIN_KEY_NOT_ACCEPTED;
      }
    }
    // (statusFlags & EnigmailConstants.INLINE_KEY) ???

    if (encrypted) {
      this.msgEncryptedStateString = encrypted;
    }
    if (signed) {
      this.msgSignedStateString = signed;
    }
    setMessageEncryptionStateButton(
      "OpenPGP",
      this.msgEncryptedStateString,
      this.msgSignedStateString
    );

    /*
    // special handling after trying to fix buggy mail format (see buggyExchangeEmailContent in code)
    if (secInfo.xtraStatus && secInfo.xtraStatus == "buggyMailFormat") {
    }
    */

    if (encrypted) {
      // For telemetry purposes.
      window.dispatchEvent(
        new CustomEvent("secureMsgLoaded", {
          detail: {
            key: "encrypted-openpgp",
            data: encrypted,
          },
        })
      );
    }
    if (signed) {
      window.dispatchEvent(
        new CustomEvent("secureMsgLoaded", {
          detail: {
            key: "signed-openpgp",
            data: signed,
          },
        })
      );
    }
  },

  editKeyExpiry() {
    EnigmailWindows.editKeyExpiry(
      window,
      [Enigmail.msg.securityInfo.userId],
      [Enigmail.msg.securityInfo.keyId]
    );
    gDBView.reloadMessageWithAllParts();
  },

  editKeyTrust() {
    let key = EnigmailKeyRing.getKeyById(Enigmail.msg.securityInfo.keyId);

    EnigmailWindows.editKeyTrust(
      window,
      [Enigmail.msg.securityInfo.userId],
      [key.keyId]
    );
    gDBView.reloadMessageWithAllParts();
  },

  signKey() {
    let key = EnigmailKeyRing.getKeyById(Enigmail.msg.securityInfo.keyId);

    EnigmailWindows.signKey(
      window,
      Enigmail.msg.securityInfo.userId,
      key.keyId,
      null
    );
    gDBView.reloadMessageWithAllParts();
  },

  msgHdrViewLoad() {
    EnigmailLog.DEBUG("enigmailMsgHdrViewOverlay.js: this.msgHdrViewLoad\n");

    this.messageListener = {
      onStartHeaders() {
        EnigmailLog.DEBUG(
          "enigmailMsgHdrViewOverlay.js: _listener_onStartHeaders\n"
        );

        try {
          Enigmail.hdrView.statusBarHide();
          EnigmailVerify.setMsgWindow(
            msgWindow,
            Enigmail.msg.getCurrentMsgUriSpec()
          );

          let msgFrame = document.getElementById("messagepane").contentDocument;

          if (msgFrame) {
            msgFrame.addEventListener(
              "unload",
              Enigmail.hdrView.messageUnload.bind(Enigmail.hdrView),
              true
            );
            msgFrame.addEventListener(
              "load",
              Enigmail.hdrView.messageLoad.bind(Enigmail.hdrView),
              true
            );
          }

          Enigmail.hdrView.forgetEncryptedMsgKey();
          Enigmail.hdrView.setWindowCallback();
        } catch (ex) {
          console.debug(ex);
        }
      },

      onEndHeaders() {
        EnigmailLog.DEBUG(
          "enigmailMsgHdrViewOverlay.js: _listener_onEndHeaders\n"
        );

        try {
          Enigmail.hdrView.statusBarHide();
        } catch (ex) {}
      },

      beforeStartHeaders() {
        return true;
      },
    };

    gMessageListeners.push(this.messageListener);

    // fire the handlers since some windows open directly with a visible message
    this.messageListener.onStartHeaders();
    this.messageListener.onEndHeaders();
  },

  messageUnload(event) {
    EnigmailLog.DEBUG("enigmailMsgHdrViewOverlay.js: this.messageUnload\n");
    if (Enigmail.hdrView.flexbuttonAction === null) {
      if (Enigmail.msg.securityInfo && Enigmail.msg.securityInfo.xtraStatus) {
        Enigmail.msg.securityInfo.xtraStatus = "";
      }
      this.forgetEncryptedMsgKey();
    }
  },

  async messageLoad(event) {
    EnigmailLog.DEBUG("enigmailMsgHdrViewOverlay.js: this.messageLoad\n");

    await Enigmail.msg.messageAutoDecrypt();
    Enigmail.msg.handleAttchmentEvent();
  },

  showPhoto() {
    if (!Enigmail.msg.securityInfo) {
      return;
    }

    let key = EnigmailKeyRing.getKeyById(Enigmail.msg.securityInfo.keyId);

    EnigmailWindows.showPhoto(
      window,
      key.keyId,
      Enigmail.msg.securityInfo.userId
    );
  },

  dispKeyDetails() {
    if (!Enigmail.msg.securityInfo) {
      return;
    }

    let key = EnigmailKeyRing.getKeyById(Enigmail.msg.securityInfo.keyId);

    EnigmailWindows.openKeyDetails(window, key.keyId, false);
  },

  forgetEncryptedMsgKey() {
    if (Enigmail.hdrView.lastEncryptedMsgKey) {
      EnigmailURIs.forgetEncryptedUri(Enigmail.hdrView.lastEncryptedMsgKey);
      Enigmail.hdrView.lastEncryptedMsgKey = null;
    }

    if (Enigmail.hdrView.lastEncryptedUri && gEncryptedURIService) {
      gEncryptedURIService.forgetEncrypted(Enigmail.hdrView.lastEncryptedUri);
      Enigmail.hdrView.lastEncryptedUri = null;
    }
  },

  onShowAttachmentContextMenu(event) {
    EnigmailLog.DEBUG(
      "enigmailMsgHdrViewOverlay.js: this.onShowAttachmentContextMenu\n"
    );

    let contextMenu, selectedAttachments;
    // Thunderbird
    contextMenu = document.getElementById("attachmentItemContext");
    selectedAttachments = contextMenu.attachments;

    var decryptOpenMenu = document.getElementById("enigmail_ctxDecryptOpen");
    var decryptSaveMenu = document.getElementById("enigmail_ctxDecryptSave");
    var importMenu = document.getElementById("enigmail_ctxImportKey");
    var verifyMenu = document.getElementById("enigmail_ctxVerifyAtt");

    if (BondOpenPGP.isEnabled() && selectedAttachments.length > 0) {
      this.enableContextMenuEntries(
        selectedAttachments[0],
        decryptOpenMenu,
        decryptSaveMenu,
        importMenu,
        verifyMenu
      );
    } else {
      decryptOpenMenu.hidden = true;
      decryptSaveMenu.hidden = true;
      importMenu.hidden = true;
      verifyMenu.hidden = true;
    }
  },

  enableContextMenuEntries(
    attachment,
    decryptOpenMenu,
    decryptSaveMenu,
    importMenu,
    verifyMenu
  ) {
    if (/^application\/pgp-keys/i.test(attachment.contentType)) {
      importMenu.hidden = false;

      decryptOpenMenu.hidden = true;
      decryptSaveMenu.hidden = true;
      verifyMenu.hidden = true;
    } else if (Enigmail.msg.checkEncryptedAttach(attachment)) {
      if (
        (typeof attachment.name !== "undefined" &&
          attachment.name.match(/\.asc\.(gpg|pgp)$/i)) ||
        (typeof attachment.displayName !== "undefined" &&
          attachment.displayName.match(/\.asc\.(gpg|pgp)$/i))
      ) {
        importMenu.hidden = false;
      } else {
        importMenu.hidden = true;
      }
      decryptOpenMenu.hidden = false;
      decryptSaveMenu.hidden = false;
      if (
        EnigmailMsgRead.checkSignedAttachment(
          attachment,
          null,
          currentAttachments
        )
      ) {
        verifyMenu.hidden = false;
      } else {
        verifyMenu.hidden = true;
      }
      if (typeof attachment.displayName == "undefined") {
        if (!attachment.name) {
          attachment.name = "message.pgp";
        }
      } else if (!attachment.displayName) {
        attachment.displayName = "message.pgp";
      }
    } else if (
      EnigmailMsgRead.checkSignedAttachment(
        attachment,
        null,
        currentAttachments
      )
    ) {
      importMenu.hidden = true;
      decryptOpenMenu.hidden = true;
      decryptSaveMenu.hidden = true;

      verifyMenu.hidden = false;
    } else {
      importMenu.hidden = true;
      decryptOpenMenu.hidden = true;
      decryptSaveMenu.hidden = true;
      verifyMenu.hidden = true;
    }
  },

  updateMsgDb() {
    EnigmailLog.DEBUG("enigmailMsgHdrViewOverlay.js: this.updateMsgDb\n");
    var msg = gFolderDisplay.selectedMessage;
    if (!msg || !msg.folder) {
      return;
    }

    var msgHdr = msg.folder.GetMessageHeader(msg.messageKey);

    if (this.msgEncryptionState === EnigmailConstants.MSG_ENC_OK) {
      Enigmail.msg.securityInfo.statusFlags |=
        EnigmailConstants.DECRYPTION_OKAY;
    }
    msgHdr.setUint32Property("enigmail", Enigmail.msg.securityInfo.statusFlags);
  },

  enigCanDetachAttachments() {
    EnigmailLog.DEBUG(
      "enigmailMsgHdrViewOverlay.js: this.enigCanDetachAttachments\n"
    );

    var canDetach = true;
    if (
      Enigmail.msg.securityInfo &&
      typeof Enigmail.msg.securityInfo.statusFlags != "undefined"
    ) {
      canDetach = !(
        Enigmail.msg.securityInfo.statusFlags &
        (EnigmailConstants.PGP_MIME_SIGNED |
          EnigmailConstants.PGP_MIME_ENCRYPTED)
      );
    }
    return canDetach;
  },

  fillAttachmentListPopup(item) {
    EnigmailLog.DEBUG(
      "enigmailMsgHdrViewOverlay.js: Enigmail.hdrView.fillAttachmentListPopup\n"
    );
    FillAttachmentListPopup(item);

    if (!this.enigCanDetachAttachments()) {
      for (var i = 0; i < item.childNodes.length; i++) {
        if (item.childNodes[i].className == "menu-iconic") {
          var mnu = item.childNodes[i].firstChild.firstChild;
          while (mnu) {
            if (
              mnu
                .getAttribute("oncommand")
                .search(/(detachAttachment|deleteAttachment)/) >= 0
            ) {
              mnu.setAttribute("disabled", true);
            }
            mnu = mnu.nextSibling;
          }
        }
      }
    }
  },

  setSubject(subject) {
    if (
      gFolderDisplay.selectedMessages.length === 1 &&
      gFolderDisplay.selectedMessage
    ) {
      // Strip multiple localised Re: prefixes. This emulates NS_MsgStripRE().
      let newSubject = subject;
      let prefixes = Services.prefs.getStringPref("mailnews.localizedRe", "Re");
      prefixes = prefixes.split(",");
      if (!prefixes.includes("Re")) {
        prefixes.push("Re");
      }
      // Construct a regular expression like this: ^(Re: |Aw: )+
      let regEx = new RegExp(`^(${prefixes.join(": |")}: )+`, "i");
      newSubject = newSubject.replace(regEx, "");
      let hadRe = newSubject != subject;

      // Update the header pane.
      this.updateHdrBox("subject", hadRe ? "Re: " + newSubject : newSubject);

      // Update the thread pane.
      let tree = gFolderDisplay.tree;
      let msgHdr = gFolderDisplay.selectedMessage;
      msgHdr.subject = EnigmailData.convertFromUnicode(newSubject, "utf-8");

      // Set the corred HasRe flag and refresh the row.
      let oldFlags = msgHdr.flags;
      if (hadRe && !(oldFlags & Ci.nsMsgMessageFlags.HasRe)) {
        let newFlags = oldFlags | Ci.nsMsgMessageFlags.HasRe;
        msgHdr.flags = newFlags;
        if (tree && tree.view) {
          tree.view.db.NotifyHdrChangeAll(msgHdr, oldFlags, newFlags, {});
        }
      } else if (tree && tree.view && tree.view.selection) {
        tree.invalidateRow(tree.view.selection.currentIndex);
      }
    }
  },

  updateHdrBox(header, value) {
    let e = document.getElementById("expanded" + header + "Box");
    if (e) {
      e.headerValue = value;
    }
  },

  setWindowCallback() {
    EnigmailLog.DEBUG("enigmailMsgHdrViewOverlay.js: setWindowCallback\n");

    EnigmailSingletons.messageReader = this.headerPane;
  },

  headerPane: {
    isCurrentMessage(uri) {
      let uriSpec = uri ? uri.spec : null;

      EnigmailLog.DEBUG(
        "enigmailMsgHdrViewOverlay.js: EnigMimeHeaderSink.isCurrentMessage: uri.spec=" +
          uriSpec +
          "\n"
      );

      if (!uriSpec) {
        // We cannot compare if no URI, => assume it's the current message.
        return true;
      }

      let msgUriSpec = Enigmail.msg.getCurrentMsgUriSpec();
      let currUrl = EnigmailFuncs.getUrlFromUriSpec(msgUriSpec);
      if (!currUrl) {
        return false;
      }

      let currMsgId = EnigmailURIs.msgIdentificationFromUrl(currUrl);
      let gotMsgId = EnigmailURIs.msgIdentificationFromUrl(uri);

      if (!gotMsgId) {
        return false;
      }

      EnigmailLog.DEBUG(
        "enigmailMsgHdrViewOverlay.js: EnigMimeHeaderSink.isCurrentMessage: url=" +
          currUrl.spec +
          "\n"
      );

      if (
        uri.host == currUrl.host &&
        currMsgId.folder === gotMsgId.folder &&
        currMsgId.msgNum === gotMsgId.msgNum
      ) {
        EnigmailLog.DEBUG(
          "enigmailMsgHdrViewOverlay.js: EnigMimeHeaderSink.isCurrentMessage: true\n"
        );
        return true;
      }

      EnigmailLog.DEBUG(
        "enigmailMsgHdrViewOverlay.js: EnigMimeHeaderSink.isCurrentMessage: false\n"
      );
      return false;
    },

    /**
     * Determine if a given MIME part number is a multipart/related message or a child thereof
     *
     * @param mimePart:      Object - The MIME Part object to evaluate from the MIME tree
     * @param searchPartNum: String - The part number to determine
     */
    isMultipartRelated(mimePart, searchPartNum) {
      if (
        searchPartNum.indexOf(mimePart.partNum) == 0 &&
        mimePart.partNum.length <= searchPartNum.length
      ) {
        if (mimePart.fullContentType.search(/^multipart\/related/i) === 0) {
          return true;
        }

        for (let i in mimePart.subParts) {
          if (this.isMultipartRelated(mimePart.subParts[i], searchPartNum)) {
            return true;
          }
        }
      }
      return false;
    },

    /**
     * Determine if a given mime part number should be displayed.
     * Returns true if one of these conditions is true:
     *  - this is the 1st displayed block of the message
     *  - the message part displayed corresonds to the decrypted part
     *
     * @param mimePartNumber: String - the MIME part number that was decrypted/verified
     * @param uriSpec:        String - the URI spec that is being displayed
     */
    displaySubPart(mimePartNumber, uriSpec) {
      if (!mimePartNumber || !uriSpec) {
        return true;
      }
      let part = EnigmailMime.getMimePartNumber(uriSpec);

      if (part.length === 0) {
        // only display header if 1st message part
        if (mimePartNumber.search(/^1(\.1)*$/) < 0) {
          return false;
        }
      } else {
        let r = EnigmailFuncs.compareMimePartLevel(mimePartNumber, part);

        // analyzed mime part is contained in viewed message part
        if (r === 2) {
          if (mimePartNumber.substr(part.length).search(/^\.1(\.1)*$/) < 0) {
            return false;
          }
        } else if (r !== 0) {
          return false;
        }

        if (Enigmail.msg.mimeParts) {
          if (this.isMultipartRelated(Enigmail.msg.mimeParts, mimePartNumber)) {
            return false;
          }
        }
      }
      return true;
    },

    /**
     * Determine if there are message parts that are not signed/encrypted
     *
     * @param mimePartNumber String - the MIME part number that was authenticated
     *
     * @return Boolean: true: there are siblings / false: no siblings
     */
    hasUnauthenticatedParts(mimePartNumber) {
      function hasSiblings(mimePart, searchPartNum, parentNum) {
        if (mimePart.partNum === parentNum) {
          // if we're a direct child of a PGP/MIME encrypted message, we know that everything
          // is authenticated on this level
          if (
            mimePart.fullContentType.search(
              /^multipart\/encrypted.{1,255}protocol="?application\/pgp-encrypted"?/i
            ) === 0
          ) {
            return false;
          }
        }
        if (
          mimePart.partNum.indexOf(parentNum) == 0 &&
          mimePart.partNum !== searchPartNum
        ) {
          return true;
        }

        for (let i in mimePart.subParts) {
          if (hasSiblings(mimePart.subParts[i], searchPartNum, parentNum)) {
            return true;
          }
        }

        return false;
      }

      let parentNum = mimePartNumber.replace(/\.\d+$/, "");
      if (mimePartNumber.search(/\./) < 0) {
        parentNum = "";
      }

      if (mimePartNumber && Enigmail.msg.mimeParts) {
        if (hasSiblings(Enigmail.msg.mimeParts, mimePartNumber, parentNum)) {
          return true;
        }
      }

      return false;
    },

    async updateSecurityStatus(
      unusedUriSpec,
      exitCode,
      statusFlags,
      extStatusFlags,
      keyId,
      userId,
      sigDetails,
      errorMsg,
      blockSeparation,
      uri,
      extraDetails,
      mimePartNumber
    ) {
      // uriSpec is not used for Enigmail anymore. It is here becaue other addons and pEp rely on it

      EnigmailLog.DEBUG(
        "enigmailMsgHdrViewOverlay.js: updateSecurityStatus: mimePart=" +
          mimePartNumber +
          "\n"
      );

      let uriSpec = uri ? uri.spec : null;

      if (this.isCurrentMessage(uri)) {
        if (statusFlags & EnigmailConstants.DECRYPTION_OKAY) {
          if (gEncryptedURIService) {
            // remember encrypted message URI to enable TB prevention against EFAIL attack
            Enigmail.hdrView.lastEncryptedUri =
              gFolderDisplay.selectedMessageUris[0];
            gEncryptedURIService.rememberEncrypted(
              Enigmail.hdrView.lastEncryptedUri
            );
          }
        }

        if (!this.displaySubPart(mimePartNumber, uriSpec)) {
          return;
        }
        if (this.hasUnauthenticatedParts(mimePartNumber)) {
          EnigmailLog.DEBUG(
            "enigmailMsgHdrViewOverlay.js: updateSecurityStatus: found unauthenticated part\n"
          );
          statusFlags |= EnigmailConstants.PARTIALLY_PGP;
        }

        let encToDetails = null;

        if (extraDetails && extraDetails.length > 0) {
          try {
            let o = JSON.parse(extraDetails);
            if ("encryptedTo" in o) {
              encToDetails = o.encryptedTo;
            }
          } catch (x) {
            console.debug(x);
          }
        }

        Enigmail.hdrView.updateHdrIcons(
          exitCode,
          statusFlags,
          extStatusFlags,
          keyId,
          userId,
          sigDetails,
          errorMsg,
          blockSeparation,
          encToDetails,
          null,
          mimePartNumber
        );
      }
    },

    processDecryptionResult(uri, actionType, processData, mimePartNumber) {
      EnigmailLog.DEBUG(
        "enigmailMsgHdrViewOverlay.js: EnigMimeHeaderSink.processDecryptionResult:\n"
      );
      EnigmailLog.DEBUG(
        "enigmailMsgHdrViewOverlay.js: actionType= " +
          actionType +
          ", mimePart=" +
          mimePartNumber +
          "\n"
      );

      let msg = gFolderDisplay.selectedMessage;
      if (!msg) {
        return;
      }
      if (
        !this.isCurrentMessage(uri) ||
        gFolderDisplay.selectedMessages.length !== 1
      ) {
        return;
      }

      switch (actionType) {
        case "modifyMessageHeaders":
          this.modifyMessageHeaders(uri, processData, mimePartNumber);
          break;
        /*
        case "wksConfirmRequest":
          Enigmail.hdrView.checkWksConfirmRequest(processData);
        */
      }
    },

    modifyMessageHeaders(uri, headerData, mimePartNumber) {
      EnigmailLog.DEBUG(
        "enigmailMsgHdrViewOverlay.js: EnigMimeHeaderSink.modifyMessageHeaders:\n"
      );

      let uriSpec = uri ? uri.spec : null;
      let hdr;

      try {
        hdr = JSON.parse(headerData);
      } catch (ex) {
        EnigmailLog.DEBUG(
          "enigmailMsgHdrViewOverlay.js: modifyMessageHeaders: - no headers to display\n"
        );
        return;
      }

      if (typeof hdr !== "object") {
        return;
      }
      if (!this.displaySubPart(mimePartNumber, uriSpec)) {
        return;
      }

      let msg = gFolderDisplay.selectedMessage;

      if ("subject" in hdr) {
        Enigmail.hdrView.setSubject(hdr.subject);
      }

      if ("date" in hdr) {
        msg.date = Date.parse(hdr.date) * 1000;
      }
      /*
            if ("newsgroups" in hdr) {
              updateHdrBox("newsgroups", hdr.newsgroups);
            }

            if ("followup-to" in hdr) {
              updateHdrBox("followup-to", hdr["followup-to"]);
            }

            if ("from" in hdr) {
              gExpandedHeaderView.from.outputFunction(gExpandedHeaderView.from, hdr.from);
              msg.setStringProperty("Enigmail-From", hdr.from);
            }

            if ("to" in hdr) {
              gExpandedHeaderView.to.outputFunction(gExpandedHeaderView.to, hdr.to);
              msg.setStringProperty("Enigmail-To", hdr.to);
            }

            if ("cc" in hdr) {
              gExpandedHeaderView.cc.outputFunction(gExpandedHeaderView.cc, hdr.cc);
              msg.setStringProperty("Enigmail-Cc", hdr.cc);
            }

            if ("reply-to" in hdr) {
              gExpandedHeaderView["reply-to"].outputFunction(gExpandedHeaderView["reply-to"], hdr["reply-to"]);
              msg.setStringProperty("Enigmail-ReplyTo", hdr["reply-to"]);
            }
      */
    },

    handleSMimeMessage(uri) {
      if (this.isCurrentMessage(uri)) {
        EnigmailVerify.unregisterContentTypeHandler();
        Enigmail.msg.messageReload(false);
      }
    },

    maxWantedNesting() {
      EnigmailLog.DEBUG(
        "enigmailMsgHdrViewOverlay.js: EnigMimeHeaderSink.maxWantedNesting:\n"
      );
      return this._smimeHeaderSink.maxWantedNesting();
    },

    signedStatus(aNestingLevel, aSignatureStatus, aSignerCert) {
      EnigmailLog.DEBUG(
        "enigmailMsgHdrViewOverlay.js: EnigMimeHeaderSink.signedStatus:\n"
      );
      return this._smimeHeaderSink.signedStatus(
        aNestingLevel,
        aSignatureStatus,
        aSignerCert
      );
    },

    encryptionStatus(aNestingLevel, aEncryptionStatus, aRecipientCert) {
      EnigmailLog.DEBUG(
        "enigmailMsgHdrViewOverlay.js: EnigMimeHeaderSink.encryptionStatus:\n"
      );
      return this._smimeHeaderSink.encryptionStatus(
        aNestingLevel,
        aEncryptionStatus,
        aRecipientCert
      );
    },
  },

  /*
  onUnloadEnigmail() {
    window.removeEventListener("load-enigmail", Enigmail.hdrView.hdrViewLoad);
    for (let i = 0; i < gMessageListeners.length; i++) {
      if (gMessageListeners[i] === Enigmail.hdrView.messageListener) {
        gMessageListeners.splice(i, 1);
        break;
      }
    }

    let signedHdrElement = document.getElementById("signedHdrIcon");
    if (signedHdrElement) {
      signedHdrElement.setAttribute(
        "onclick",
        "showMessageReadSecurityInfo();"
      );
    }

    let encryptedHdrElement = document.getElementById("encryptedHdrIcon");
    if (encryptedHdrElement) {
      encryptedHdrElement.setAttribute(
        "onclick",
        "showMessageReadSecurityInfo();"
      );
    }

    let addrPopup = document.getElementById("emailAddressPopup");
    if (addrPopup) {
      addrPopup.removeEventListener(
        "popupshowing",
        Enigmail.hdrView.displayAddressPopup
      );
    }

    let attCtx = document.getElementById("attachmentItemContext");
    if (attCtx) {
      attCtx.removeEventListener(
        "popupshowing",
        this.onShowAttachmentContextMenu
      );
    }

    let msgFrame = EnigmailWindows.getFrame(window, "messagepane");
    if (msgFrame) {
      msgFrame.removeEventListener(
        "unload",
        Enigmail.hdrView.messageUnload,
        true
      );
      msgFrame.removeEventListener("load", Enigmail.hdrView.messageLoad);
    }

    CanDetachAttachments = Enigmail.hdrView.origCanDetachAttachments;
  },
  */
};

window.addEventListener(
  "load-enigmail",
  Enigmail.hdrView.hdrViewLoad.bind(Enigmail.hdrView)
);
