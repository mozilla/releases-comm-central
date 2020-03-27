/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

/* Globals from Thunderbird: */
/* global gFolderDisplay: false, currentAttachments: false, gSMIMEContainer: false, gSignedUINode: false, gEncryptedUINode: false */
/* global gDBView: false, msgWindow: false, messageHeaderSink: false, gMessageListeners: false, findEmailNodeFromPopupNode: true */
/* global gExpandedHeaderView: false, CanDetachAttachments: true, gEncryptedURIService: false, FillAttachmentListPopup: false */
/* global attachmentList: false, MailOfflineMgr: false, currentHeaderData: false, ContentTypeIsSMIME: false */

/* import-globals-from ../BondOpenPGP.jsm */

var EnigmailCore = ChromeUtils.import(
  "chrome://openpgp/content/modules/core.jsm"
).EnigmailCore;
var EnigmailFuncs = ChromeUtils.import(
  "chrome://openpgp/content/modules/funcs.jsm"
).EnigmailFuncs;
var EnigmailVerify = ChromeUtils.import(
  "chrome://openpgp/content/modules/mimeVerify.jsm"
).EnigmailVerify;
var { EnigmailLog } = ChromeUtils.import(
  "chrome://openpgp/content/modules/log.jsm"
);
var EnigmailPrefs = ChromeUtils.import(
  "chrome://openpgp/content/modules/prefs.jsm"
).EnigmailPrefs;
var EnigmailLocale = ChromeUtils.import(
  "chrome://openpgp/content/modules/locale.jsm"
).EnigmailLocale;
var EnigmailWindows = ChromeUtils.import(
  "chrome://openpgp/content/modules/windows.jsm"
).EnigmailWindows;
var EnigmailDialog = ChromeUtils.import(
  "chrome://openpgp/content/modules/dialog.jsm"
).EnigmailDialog;
var EnigmailTime = ChromeUtils.import(
  "chrome://openpgp/content/modules/time.jsm"
).EnigmailTime;
var { EnigmailGpg } = ChromeUtils.import(
  "chrome://openpgp/content/modules/gpg.jsm"
);
var { EnigmailKey } = ChromeUtils.import(
  "chrome://openpgp/content/modules/key.jsm"
);
var EnigmailKeyRing = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyRing.jsm"
).EnigmailKeyRing;
var EnigmailURIs = ChromeUtils.import(
  "chrome://openpgp/content/modules/uris.jsm"
).EnigmailURIs;
var EnigmailConstants = ChromeUtils.import(
  "chrome://openpgp/content/modules/constants.jsm"
).EnigmailConstants;
var EnigmailData = ChromeUtils.import(
  "chrome://openpgp/content/modules/data.jsm"
).EnigmailData;
var EnigmailClipboard = ChromeUtils.import(
  "chrome://openpgp/content/modules/clipboard.jsm"
).EnigmailClipboard;
var EnigmailStdlib = ChromeUtils.import(
  "chrome://openpgp/content/modules/stdlib.jsm"
).EnigmailStdlib;
/*
var EnigmailWks = ChromeUtils.import(
  "chrome://openpgp/content/modules/webKey.jsm"
).EnigmailWks;
*/
var EnigmailMime = ChromeUtils.import(
  "chrome://openpgp/content/modules/mime.jsm"
).EnigmailMime;
var EnigmailMsgRead = ChromeUtils.import(
  "chrome://openpgp/content/modules/msgRead.jsm"
).EnigmailMsgRead;
var EnigmailSingletons = ChromeUtils.import(
  "chrome://openpgp/content/modules/singletons.jsm"
).EnigmailSingletons;
/*
var EnigmailAutocrypt = ChromeUtils.import(
  "chrome://openpgp/content/modules/autocrypt.jsm"
).EnigmailAutocrypt;
*/
var EnigmailCompat = ChromeUtils.import(
  "chrome://openpgp/content/modules/compat.jsm"
).EnigmailCompat;

if (!Enigmail) {
  var Enigmail = {};
}

Enigmail.hdrView = {
  //enigmailBox: null,
  lastEncryptedMsgKey: null,
  lastEncryptedUri: null,
  flexbuttonAction: null,
  isEncrypted: "",
  isSigned: "",

  hdrViewLoad() {
    EnigmailLog.DEBUG("enigmailMsgHdrViewOverlay.js: this.hdrViewLoad\n");

    // THE FOLLOWING OVERRIDES CODE IN msgHdrViewOverlay.js
    // which wouldn't work otherwise

    this.origCanDetachAttachments = CanDetachAttachments;
    CanDetachAttachments = function() {
      return (
        Enigmail.hdrView.origCanDetachAttachments() &&
        Enigmail.hdrView.enigCanDetachAttachments()
      );
    };

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

    //this.enigmailBox = document.getElementById("enigmailBox");

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
      this.isSigned = null;
      this.isEncrypted = null;
      //this.enigmailBox.setAttribute("collapsed", "true");

      Enigmail.msg.setAttachmentReveal(null);
      if (Enigmail.msg.securityInfo) {
        Enigmail.msg.securityInfo.statusFlags = 0;
        Enigmail.msg.securityInfo.msgSigned = 0;
        Enigmail.msg.securityInfo.msgEncrypted = 0;
      }

      //let enigMsgPane = document.getElementById("enigmailMsgDisplay");
      let bodyElement = document.getElementById("messagepane");
      //enigMsgPane.setAttribute("collapsed", true);
      bodyElement.removeAttribute("collapsed");
    } catch (ex) {
      console.debug(ex);
    }
  },

  setStatusText(txt) {
    let s = document.getElementById("enigmailStatusText");
    if (s) {
      s.firstChild.data = txt;
    }
  },

  updateHdrIcons(
    exitCode,
    statusFlags,
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

    //this.enigmailBox = document.getElementById("enigmailBox");

    if (
      gFolderDisplay.selectedMessageUris &&
      gFolderDisplay.selectedMessageUris.length > 0
    ) {
      this.lastEncryptedMsgKey = gFolderDisplay.selectedMessageUris[0];
    }

    if (!errorMsg) {
      errorMsg = "";
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
      // no EnigConvertGpgToUnicode() here; strings are already UTF-8
      replaceUid = replaceUid.replace(/\\[xe]3a/gi, ":");
      errorMsg = errorMsg.replace(userId, replaceUid);
    }

    var errorLines = "";
    var fullStatusInfo = "";

    if (exitCode == EnigmailConstants.POSSIBLE_PGPMIME) {
      exitCode = 0;
    } else if (errorMsg) {
      // no EnigConvertGpgToUnicode() here; strings are already UTF-8
      errorLines = errorMsg.split(/\r?\n/);
      fullStatusInfo = errorMsg;
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

    var statusInfo = "";

    if (statusFlags & EnigmailConstants.NODATA) {
      if (statusFlags & EnigmailConstants.PGP_MIME_SIGNED) {
        statusFlags |= EnigmailConstants.UNVERIFIED_SIGNATURE;
      }

      if (statusFlags & EnigmailConstants.PGP_MIME_ENCRYPTED) {
        statusFlags |= EnigmailConstants.DECRYPTION_INCOMPLETE;
      }
    }

    if (!(statusFlags & EnigmailConstants.PGP_MIME_ENCRYPTED)) {
      encMimePartNumber = "";
    }

    if (
      statusFlags & EnigmailConstants.PARTIALLY_PGP &&
      statusFlags & EnigmailConstants.BAD_SIGNATURE
    ) {
      statusFlags &= ~(
        EnigmailConstants.PARTIALLY_PGP | EnigmailConstants.BAD_SIGNATURE
      );
      if (statusFlags === 0) {
        errorMsg = "";
        fullStatusInfo = "";
      }
    }

    var msgSigned =
      statusFlags &
      (EnigmailConstants.BAD_SIGNATURE |
        EnigmailConstants.GOOD_SIGNATURE |
        EnigmailConstants.EXPIRED_KEY_SIGNATURE |
        EnigmailConstants.EXPIRED_SIGNATURE |
        EnigmailConstants.UNVERIFIED_SIGNATURE |
        EnigmailConstants.REVOKED_KEY |
        EnigmailConstants.EXPIRED_KEY_SIGNATURE |
        EnigmailConstants.EXPIRED_SIGNATURE);
    /*
    var msgEncrypted =
      statusFlags &
      (EnigmailConstants.DECRYPTION_OKAY |
        EnigmailConstants.DECRYPTION_INCOMPLETE |
        EnigmailConstants.DECRYPTION_FAILED);
    */

    /*
    if (msgSigned && statusFlags & EnigmailConstants.IMPORTED_KEY) {
      statusFlags &= ~EnigmailConstants.IMPORTED_KEY;
    }
    */

    // TODO: visualize the following signature attributes,
    // cross-check with corresponding email attributes
    // - date
    // - signer uid
    // - signer key
    // - signing and hash alg

    // - process failed decryptions first because they imply bad signature handling
    if (statusFlags & EnigmailConstants.BAD_PASSPHRASE) {
      statusInfo = EnigmailLocale.getString("badPhrase");
    } else if (statusFlags & EnigmailConstants.DECRYPTION_FAILED) {
      if (statusFlags & EnigmailConstants.MISSING_MDC) {
        statusInfo = EnigmailLocale.getString("missingMdcError");
      } else if (statusFlags & EnigmailConstants.MISSING_PASSPHRASE) {
        statusInfo = EnigmailLocale.getString("missingPassphrase");
      } else if (statusFlags & EnigmailConstants.NO_SECKEY) {
        statusInfo = EnigmailLocale.getString("needKey");
      } else {
        statusInfo = EnigmailLocale.getString("failedDecrypt");
      }
    } else if (statusFlags & EnigmailConstants.UNVERIFIED_SIGNATURE) {
      statusInfo = EnigmailLocale.getString("unverifiedSig");
    } else if (statusFlags & EnigmailConstants.GOOD_SIGNATURE) {
      statusInfo = EnigmailLocale.getString("goodSig", [keyId]);
    } else if (
      statusFlags &
      (EnigmailConstants.BAD_SIGNATURE |
        EnigmailConstants.EXPIRED_SIGNATURE |
        EnigmailConstants.EXPIRED_KEY_SIGNATURE)
    ) {
      statusInfo = EnigmailLocale.getString("unverifiedSig");
    } else if (statusFlags & EnigmailConstants.DECRYPTION_OKAY) {
      statusInfo = EnigmailLocale.getString("decryptedMsg");
    } else if (statusFlags & EnigmailConstants.DECRYPTION_INCOMPLETE) {
      statusInfo = EnigmailLocale.getString("incompleteDecrypt");
    } else if (statusFlags & EnigmailConstants.IMPORTED_KEY) {
      statusInfo = "";
      EnigmailDialog.info(window, errorMsg);
    }
    // add key infos if available
    if (keyId) {
      var si = EnigmailLocale.getString("unverifiedSig"); // "Unverified signature"
      if (statusInfo === "") {
        statusInfo += si;
      }
      if (statusFlags & EnigmailConstants.UNVERIFIED_SIGNATURE) {
        statusInfo += "\n" + EnigmailLocale.getString("keyNeeded", [keyId]); // "public key ... needed"
      } else {
        statusInfo += "\n" + EnigmailLocale.getString("keyUsed", [keyId]); // "public key ... used"
      }
    }
    //statusInfo += "\n\n" + errorMsg;

    if (
      statusFlags & EnigmailConstants.DECRYPTION_OKAY ||
      this.isEncrypted === "ok"
    ) {
      var statusMsg;
      if (xtraStatus && xtraStatus == "buggyMailFormat") {
        statusMsg = EnigmailLocale.getString("decryptedMsgWithFormatError");
      } else {
        statusMsg = EnigmailLocale.getString("decryptedMsg");
      }
      if (!statusInfo) {
        statusInfo = statusMsg;
      } else {
        statusInfo = statusMsg + "\n" + statusInfo;
      }
    }

    if (statusFlags & EnigmailConstants.PARTIALLY_PGP) {
      statusInfo = "";
    }

    // TODO: if encToDetails.length then make it available in status
    // EnigmailLocale.getString("encryptKeysNote", [encToDetails]);

    /*
    if (xtraStatus === "process-manually") {
      let buttonLabel = "";
      if (statusFlags & EnigmailConstants.UNVERIFIED_SIGNATURE) {
        statusLine = EnigmailLocale.getString("msgPart", [
          EnigmailLocale.getString("msgSigned"),
        ]);
        statusLine += EnigmailLocale.getString("verifyManually");
        buttonLabel = EnigmailLocale.getString("headerView.button.verify");
      } else {
        statusLine = EnigmailLocale.getString("msgPart", [
          EnigmailLocale.getString("msgEncrypted"),
        ]);
        statusLine += EnigmailLocale.getString("decryptManually");
        buttonLabel = EnigmailLocale.getString("headerView.button.decrypt");
      }

      Enigmail.msg.securityInfo = {};
      this.displayFlexAction(statusLine, buttonLabel, xtraStatus);
      return;
    }
    */

    let tmp = {
      statusFlags,
      keyId,
      userId,
      msgSigned,
      statusInfo,
      fullStatusInfo,
      blockSeparation,
      xtraStatus,
      encryptedMimePart: encMimePartNumber,
    };
    Enigmail.msg.securityInfo = tmp;

    //Enigmail.msg.createArtificialAutocryptHeader();

    /*
    if (statusFlags & EnigmailConstants.UNVERIFIED_SIGNATURE) {
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
          EnigmailLocale.getString("wksConfirmationReq"),
          EnigmailLocale.getString("wksConfirmationReq.button.label"),
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
   * Display Enigmail header with text and specific button
   *
   * @param {String} hdrMessage: Message to be displayed in header
   * @param {String} buttonLabel: Label of button
   * @param {String} requestType: action to be performed
   */
  displayFlexAction(hdrMessage, buttonLabel, requestType) {
    if (!Enigmail.msg.securityInfo) {
      Enigmail.msg.securityInfo = {};
    }
    Enigmail.msg.securityInfo.xtraStatus = requestType;
    Enigmail.msg.securityInfo.statusInfo = hdrMessage;

    // Thunderbird
    this.setStatusText(hdrMessage);
    //this.enigmailBox.removeAttribute("collapsed");
    //let button = document.getElementById("enigmail_flexActionButton");
    //button.setAttribute("label", buttonLabel);
    //button.removeAttribute("hidden");
    /*
    document
      .getElementById("enigmail_importKey")
      .setAttribute("hidden", "true");
    */
    /*
    this.enigmailBox.setAttribute(
      "class",
      "expandedEnigmailBox enigmailHeaderBoxLabelSignatureUnknown"
    );
    */
  },

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
      enigMsgPane.textContent = EnigmailLocale.getString(
        "wksConfirmationReq.message"
      );
    }
  },
  */

  /**
   * Try to import an autocrypt header from an unverified signature
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

    let keys = EnigmailKeyRing.getKeysByUserId(fromEmail, true);
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

  /**
   * Display the Enigmail status bar and ask for handling the Setup Message
   */
  /*
  displayAutoCryptSetupMsgHeader() {
    Enigmail.hdrView.displayFlexAction(
      EnigmailLocale.getString("autocryptSetupReq"),
      EnigmailLocale.getString("autocryptSetupReq.button.label"),
      "autocrypt-setup"
    );
    //view.enigmailBox.setAttribute("class", "expandedEnigmailBox enigmailHeaderBoxLabelSignatureUnknown");
    this.displayAutocryptMessage(true);
  },

  displayAutocryptMessage(allowImport) {
    EnigmailLog.DEBUG(
      "enigmailMsgHdrViewOverlay.js: displayAutocryptMessage()\n"
    );
  },
  */

  displayStatusBar() {
    //let statusText = document.getElementById("enigmailStatusText");
    //let icon = document.getElementById("enigToggleHeaderView2");
    let bodyElement = document.getElementById("messagepanebox");

    let secInfo = Enigmail.msg.securityInfo;
    let statusFlags = secInfo.statusFlags;
    let sMimeContainer, encryptedUINode, signedUINode;

    if (secInfo.statusInfo) {
      this.setStatusText(secInfo.statusInfo + " ");
      //this.enigmailBox.removeAttribute("collapsed");

      /*
      if (
        (secInfo.keyId &&
          statusFlags & EnigmailConstants.UNVERIFIED_SIGNATURE) ||
        statusFlags & EnigmailConstants.INLINE_KEY
      ) {
        document.getElementById("enigmail_importKey").removeAttribute("hidden");
      } else {
        document
          .getElementById("enigmail_importKey")
          .setAttribute("hidden", "true");
      }
      document
        .getElementById("enigmail_flexActionButton")
        .setAttribute("hidden", "true");
      */
    } else {
      this.setStatusText("");
      //this.enigmailBox.setAttribute("collapsed", "true");
    }

    sMimeContainer = gSMIMEContainer;
    signedUINode = gSignedUINode;
    encryptedUINode = gEncryptedUINode;

    /* eslint block-scoped-var: 0*/
    if (typeof sMimeContainer !== "object") {
      return;
    }
    if (!sMimeContainer) {
      return;
    }

    // Update icons and header-box css-class
    try {
      sMimeContainer.collapsed = false;
      signedUINode.collapsed = false;
      encryptedUINode.collapsed = false;

      if (
        statusFlags & EnigmailConstants.BAD_SIGNATURE &&
        !(statusFlags & EnigmailConstants.GOOD_SIGNATURE)
      ) {
        // Display untrusted/bad signature icon
        signedUINode.setAttribute("signed", "notok");
        /*
        this.enigmailBox.setAttribute(
          "class",
          "expandedEnigmailBox enigmailHeaderBoxLabelSignatureUnknown"
        );
        */
        this.isSigned = "notok";
      } else if (
        statusFlags & EnigmailConstants.GOOD_SIGNATURE &&
        !(
          statusFlags &
          (EnigmailConstants.REVOKED_KEY |
            EnigmailConstants.EXPIRED_KEY_SIGNATURE |
            EnigmailConstants.EXPIRED_SIGNATURE)
        )
      ) {
        let val =
          statusFlags & EnigmailConstants.TRUSTED_IDENTITY
            ? "verified"
            : "unverified";

        // Display trusted good signature icon
        signedUINode.setAttribute("signed", val);
        /*
        this.enigmailBox.setAttribute(
          "class",
          "expandedEnigmailBox enigmailHeaderBoxLabelSignatureOk"
        );
        */
        this.isSigned = val;
        bodyElement.setAttribute("enigSigned", val);
      } else if (statusFlags & EnigmailConstants.UNVERIFIED_SIGNATURE) {
        // Display unverified signature icon
        signedUINode.setAttribute("signed", "unknown");
        /*
        this.enigmailBox.setAttribute(
          "class",
          "expandedEnigmailBox enigmailHeaderBoxLabelSignatureUnknown"
        );
        */
        this.isSigned = "unknown";
      } else if (
        statusFlags &
        (EnigmailConstants.REVOKED_KEY |
          EnigmailConstants.EXPIRED_KEY_SIGNATURE |
          EnigmailConstants.EXPIRED_SIGNATURE)
      ) {
        // Display unverified signature icon
        signedUINode.setAttribute("signed", "notok");
        /*
        this.enigmailBox.setAttribute(
          "class",
          "expandedEnigmailBox enigmailHeaderBoxLabelSignatureVerified"
        );
        */
        this.isSigned = "notok";
      } else if (statusFlags & EnigmailConstants.INLINE_KEY) {
        /*
        this.enigmailBox.setAttribute(
          "class",
          "expandedEnigmailBox enigmailHeaderBoxLabelSignatureUnknown"
        );
        */
      } else {
        /*
        this.enigmailBox.setAttribute(
          "class",
          "expandedEnigmailBox enigmailHeaderBoxLabelNoSignature"
        );
        */
      }

      if (statusFlags & EnigmailConstants.DECRYPTION_OKAY) {
        EnigmailURIs.rememberEncryptedUri(this.lastEncryptedMsgKey);

        // Display encrypted icon
        encryptedUINode.setAttribute("encrypted", "ok");
        this.isEncrypted = "ok";
      } else if (
        statusFlags &
        (EnigmailConstants.DECRYPTION_INCOMPLETE |
          EnigmailConstants.DECRYPTION_FAILED)
      ) {
        // Display un-encrypted icon
        encryptedUINode.setAttribute("encrypted", "notok");
        this.isEncrypted = "notok";
        /*
        this.enigmailBox.setAttribute(
          "class",
          "expandedEnigmailBox enigmailHeaderBoxLabelSignatureNotOk"
        );
        */
      }

      // special handling after trying to fix buggy mail format (see buggyExchangeEmailContent in code)
      if (secInfo.xtraStatus && secInfo.xtraStatus == "buggyMailFormat") {
        /*
        this.enigmailBox.setAttribute(
          "class",
          "expandedEnigmailBox enigmailHeaderBoxLabelBuggyMailFormat"
        );
        */
      }
    } catch (ex) {
      EnigmailLog.writeException("displayStatusBar", ex);
    }
  },

  dispSecurityContext() {
    try {
      if (Enigmail.msg.securityInfo) {
        if (
          Enigmail.msg.securityInfo.statusFlags & EnigmailConstants.NODATA &&
          Enigmail.msg.securityInfo.statusFlags &
            (EnigmailConstants.PGP_MIME_SIGNED |
              EnigmailConstants.PGP_MIME_ENCRYPTED)
        ) {
          document
            .getElementById("enigmail_reloadMessage")
            .removeAttribute("hidden");
        } else {
          document
            .getElementById("enigmail_reloadMessage")
            .setAttribute("hidden", "true");
        }
      }

      var optList = ["pgpSecurityInfo", "copySecurityInfo"];
      for (var j = 0; j < optList.length; j++) {
        var menuElement = document.getElementById("enigmail_" + optList[j]);
        if (Enigmail.msg.securityInfo) {
          menuElement.removeAttribute("disabled");
        } else {
          menuElement.setAttribute("disabled", "true");
        }
      }

      this.setSenderStatus(
        "signSenderKey",
        "editSenderKeyTrust",
        "showPhoto",
        "dispKeyDetails"
      );
    } catch (ex) {
      EnigmailLog.ERROR(
        "error on displaying Security menu:\n" + ex.toString() + "\n"
      );
    }
  },

  updateSendersKeyMenu() {
    this.setSenderStatus(
      "keyMgmtSignKey",
      "keyMgmtKeyTrust",
      "keyMgmtShowPhoto",
      "keyMgmtDispKeyDetails",
      "importpublickey"
    );
  },

  setSenderStatus(elemSign, elemTrust, elemPhoto, elemKeyProps, elemImportKey) {
    function setElemStatus(elemName, disabledValue) {
      document
        .getElementById("enigmail_" + elemName)
        .setAttribute("disabled", !disabledValue);

      let secondElem = document.getElementById("enigmail_" + elemName + "2");
      if (secondElem) {
        secondElem.setAttribute("disabled", !disabledValue);
      }
    }

    var photo = false;
    var sign = false;
    var trust = false;
    var unknown = false;
    var signedMsg = false;
    var keyObj = null;

    if (Enigmail.msg.securityInfo) {
      if (
        Enigmail.msg.securityInfo.statusFlags &
        EnigmailConstants.PHOTO_AVAILABLE
      ) {
        photo = true;
      }
      if (Enigmail.msg.securityInfo.keyId) {
        keyObj = EnigmailKeyRing.getKeyById(Enigmail.msg.securityInfo.keyId);
      }
      if (Enigmail.msg.securityInfo.msgSigned) {
        signedMsg = true;
        if (
          !(
            Enigmail.msg.securityInfo.statusFlags &
            (EnigmailConstants.REVOKED_KEY |
              EnigmailConstants.EXPIRED_KEY_SIGNATURE |
              EnigmailConstants.UNVERIFIED_SIGNATURE)
          )
        ) {
          sign = true;
        }
        if (keyObj && keyObj.isOwnerTrustUseful()) {
          trust = true;
        }

        if (
          Enigmail.msg.securityInfo.statusFlags &
          EnigmailConstants.UNVERIFIED_SIGNATURE
        ) {
          unknown = true;
        }
      }
    }

    if (elemTrust) {
      setElemStatus(elemTrust, trust);
    }
    if (elemSign) {
      setElemStatus(elemSign, sign);
    }
    if (elemPhoto) {
      setElemStatus(elemPhoto, photo);
    }
    if (elemKeyProps) {
      setElemStatus(elemKeyProps, signedMsg && !unknown);
    }
    if (elemImportKey) {
      setElemStatus(elemImportKey, unknown);
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
      //enigmailBox: document.getElementById("enigmailBox"),
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
          Enigmail.hdrView.setStatusText("");
          /*
          this.enigmailBox.setAttribute(
            "class",
            "expandedEnigmailBox enigmailHeaderBoxLabelSignatureOk"
          );
          */

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
          /*
          this.enigmailBox.setAttribute(
            "class",
            "expandedEnigmailBox enigmailHeaderBoxLabelSignatureOk"
          );
          */
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

  messageLoad(event) {
    EnigmailLog.DEBUG("enigmailMsgHdrViewOverlay.js: this.messageLoad\n");

    Enigmail.msg.messageAutoDecrypt();
    Enigmail.msg.handleAttchmentEvent();
  },

  copyStatusInfo() {
    if (Enigmail.msg.securityInfo) {
      EnigmailClipboard.setClipboardContent(
        Enigmail.msg.securityInfo.statusInfo
      );
    }
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

    if (BondOpenPGP.allDependenciesLoaded() && selectedAttachments.length > 0) {
      this.enableContextMenuEntries(
        selectedAttachments[0],
        decryptOpenMenu,
        decryptSaveMenu,
        importMenu,
        verifyMenu
      );
    } else {
      //openMenu.setAttribute("disabled", true); /* global openMenu: false */
      //saveMenu.setAttribute("disabled", true); /* global saveMenu: false */
      decryptOpenMenu.setAttribute("disabled", true);
      decryptSaveMenu.setAttribute("disabled", true);
      importMenu.setAttribute("disabled", true);
      verifyMenu.setAttribute("disabled", true);
    }
  },

  enableContextMenuEntries(
    attachment,
    decryptOpenMenu,
    decryptSaveMenu,
    importMenu,
    verifyMenu
  ) {
    if (attachment.contentType.search(/^application\/pgp-keys/i) === 0) {
      importMenu.removeAttribute("disabled");
      decryptOpenMenu.setAttribute("disabled", true);
      decryptSaveMenu.setAttribute("disabled", true);
      verifyMenu.setAttribute("disabled", true);
    } else if (Enigmail.msg.checkEncryptedAttach(attachment)) {
      if (
        (typeof attachment.name !== "undefined" &&
          attachment.name.match(/\.asc\.(gpg|pgp)$/i)) ||
        (typeof attachment.displayName !== "undefined" &&
          attachment.displayName.match(/\.asc\.(gpg|pgp)$/i))
      ) {
        importMenu.removeAttribute("disabled");
      } else {
        importMenu.setAttribute("disabled", true);
      }
      decryptOpenMenu.removeAttribute("disabled");
      decryptSaveMenu.removeAttribute("disabled");
      if (
        EnigmailMsgRead.checkSignedAttachment(
          attachment,
          null,
          currentAttachments
        )
      ) {
        verifyMenu.removeAttribute("disabled");
      } else {
        verifyMenu.setAttribute("disabled", true);
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
      importMenu.setAttribute("disabled", true);
      decryptOpenMenu.setAttribute("disabled", true);
      decryptSaveMenu.setAttribute("disabled", true);
      verifyMenu.removeAttribute("disabled");
    } else {
      importMenu.setAttribute("disabled", true);
      decryptOpenMenu.setAttribute("disabled", true);
      decryptSaveMenu.setAttribute("disabled", true);
      verifyMenu.setAttribute("disabled", true);
    }
  },

  updateMsgDb() {
    EnigmailLog.DEBUG("enigmailMsgHdrViewOverlay.js: this.updateMsgDb\n");
    var msg = gFolderDisplay.selectedMessage;
    if (!msg || !msg.folder) {
      return;
    }

    var msgHdr = msg.folder.GetMessageHeader(msg.messageKey);

    if (this.isEncrypted === "ok") {
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
      let subj = EnigmailData.convertFromUnicode(subject, "utf-8");
      if (gFolderDisplay.selectedMessage.flags & Ci.nsMsgMessageFlags.HasRe) {
        subj = subj.replace(/^(Re: )+(.*)/, "$2");
      }
      gFolderDisplay.selectedMessage.subject = subj;
      this.updateHdrBox("subject", subject); // this needs to be the unmodified subject

      let tt = document.getElementById("threadTree");
      if (tt && "invalidate" in tt) {
        tt.invalidate();
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

      if (!uriSpec || uriSpec.search(/^enigmail:/) === 0) {
        // we cannot compare if no URI given or if URI is Enigmail-internal;
        // therefore assuming it's the current message
        return true;
      }

      let msgUriSpec = Enigmail.msg.getCurrentMsgUriSpec();

      let currUrl = EnigmailCompat.getUrlFromUriSpec(msgUriSpec);
      if (!currUrl) {
        EnigmailLog.DEBUG(
          "enigmailMsgHdrViewOverlay.js: EnigMimeHeaderSink.isCurrentMessage: could not determine URL\n"
        );
        currUrl = {
          host: "invalid",
          path: "/message",
          scheme: "enigmail",
          spec: "enigmail://invalid/message",
          schemeIs(s) {
            return s === this.scheme;
          },
        };
      }

      let currMsgId = EnigmailURIs.msgIdentificationFromUrl(currUrl);
      let gotMsgId = EnigmailURIs.msgIdentificationFromUrl(uri);

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

    updateSecurityStatus(
      unusedUriSpec,
      exitCode,
      statusFlags,
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

        let encToDetails = "";
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

      if (uriSpec && uriSpec.search(/^enigmail:message\//) === 0) {
        // display header for broken MS-Exchange message
        // Thunderbird
        let ebeb = document.getElementById("enigmailBrokenExchangeBox");
        ebeb.removeAttribute("collapsed");
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
};

window.addEventListener(
  "load-enigmail",
  Enigmail.hdrView.hdrViewLoad.bind(Enigmail.hdrView)
);
