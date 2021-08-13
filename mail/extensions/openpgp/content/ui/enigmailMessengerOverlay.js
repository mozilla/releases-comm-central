/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

// TODO: check if this is safe
/* eslint-disable no-unsanitized/property */

/* Globals from Thunderbird: */
/* global ReloadMessage: false, gDBView: false, gSignatureStatus: false, gEncryptionStatus: false, showMessageReadSecurityInfo: false */
/* global gFolderDisplay: false, messenger: false, currentAttachments: false, msgWindow: false, PanelUI: false */
/* global currentHeaderData: false, gViewAllHeaders: false, gExpandedHeaderList: false, goDoCommand: false, HandleSelectedAttachments: false */
/* global statusFeedback: false, displayAttachmentsForExpandedView: false, gMessageListeners: false, gExpandedHeaderView */
/* globals gMessageNotificationBar, gMessageDisplay */

var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  BondOpenPGP: "chrome://openpgp/content/BondOpenPGP.jsm",
  EnigmailArmor: "chrome://openpgp/content/modules/armor.jsm",
  EnigmailAttachment: "chrome://openpgp/content/modules/attachment.jsm",
  EnigmailAutocrypt: "chrome://openpgp/content/modules/autocrypt.jsm",
  EnigmailConstants: "chrome://openpgp/content/modules/constants.jsm",
  EnigmailCore: "chrome://openpgp/content/modules/core.jsm",
  EnigmailData: "chrome://openpgp/content/modules/data.jsm",
  EnigmailDecryption: "chrome://openpgp/content/modules/decryption.jsm",
  EnigmailDialog: "chrome://openpgp/content/modules/dialog.jsm",
  EnigmailFixExchangeMsg: "chrome://openpgp/content/modules/fixExchangeMsg.jsm",
  EnigmailFiles: "chrome://openpgp/content/modules/files.jsm",
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.jsm",
  EnigmailKey: "chrome://openpgp/content/modules/key.jsm",
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.jsm",
  EnigmailKeyServer: "chrome://openpgp/content/modules/keyserver.jsm",
  EnigmailKeyserverURIs: "chrome://openpgp/content/modules/keyserverUris.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  EnigmailMime: "chrome://openpgp/content/modules/mime.jsm",
  EnigmailMsgRead: "chrome://openpgp/content/modules/msgRead.jsm",
  EnigmailPersistentCrypto:
    "chrome://openpgp/content/modules/persistentCrypto.jsm",
  EnigmailStdlib: "chrome://openpgp/content/modules/stdlib.jsm",
  EnigmailStreams: "chrome://openpgp/content/modules/streams.jsm",
  EnigmailURIs: "chrome://openpgp/content/modules/uris.jsm",
  EnigmailVerify: "chrome://openpgp/content/modules/mimeVerify.jsm",
  EnigmailVerifyAttachment: "chrome://openpgp/content/modules/verify.jsm",
  EnigmailWindows: "chrome://openpgp/content/modules/windows.jsm",
  // EnigmailWks: "chrome://openpgp/content/modules/webKey.jsm",
  KeyLookupHelper: "chrome://openpgp/content/modules/keyLookupHelper.jsm",
  PgpSqliteDb2: "chrome://openpgp/content/modules/sqliteDb.jsm",
});

XPCOMUtils.defineLazyGetter(this, "l10n", () => {
  return new Localization(["messenger/openpgp/openpgp.ftl"], true);
});

var Enigmail;
if (!Enigmail) {
  Enigmail = {};
}

Enigmail.getEnigmailSvc = function() {
  return EnigmailCore.getService(window);
};

Enigmail.msg = {
  decryptedMessage: null,
  securityInfo: null,
  lastSaveDir: "",
  messagePane: null,
  decryptButton: null,
  savedHeaders: null,
  removeListener: false,
  enableExperiments: false,
  headersList: [
    "content-transfer-encoding",
    "x-enigmail-version",
    "x-pgp-encoding-format",
    //"autocrypt-setup-message",
  ],
  buggyExchangeEmailContent: null, // for HACK for MS-EXCHANGE-Server Problem
  buggyMailType: null,
  changedAttributes: [],
  lastSMimeReloadURI: "",
  allAttachmentsDone: false,
  messageDecryptDone: false,
  showPartialDecryptionReminder: false,

  get notificationBox() {
    return gMessageNotificationBar.msgNotificationBar;
  },

  removeNotification(value) {
    let item = this.notificationBox.getNotificationWithValue(value);
    // Remove the notification only if the user didn't previously close it.
    if (item) {
      this.notificationBox.removeNotification(item, true);
    }
  },

  messengerStartup() {
    if (!BondOpenPGP.isEnabled()) {
      return;
    }

    Enigmail.msg.messagePane = document.getElementById("messagepane");

    EnigmailLog.DEBUG("enigmailMessengerOverlay.js: Startup\n");

    Enigmail.msg.savedHeaders = null;

    Enigmail.msg.decryptButton = document.getElementById(
      "button-enigmail-decrypt"
    );

    setTimeout(function() {
      // if nothing happened, then load all keys after 1 hour
      // to trigger the key check
      EnigmailKeyRing.getAllKeys();
    }, 3600 * 1000); // 1 hour

    // Need to add event listener to Enigmail.msg.messagePane to make it work
    // Adding to msgFrame doesn't seem to work
    Enigmail.msg.messagePane.addEventListener(
      "unload",
      Enigmail.msg.messageFrameUnload.bind(Enigmail.msg),
      true
    );

    this.treeController = {
      supportsCommand(command) {
        // EnigmailLog.DEBUG("enigmailMessengerOverlay.js: treeCtrl: supportsCommand: "+command+"\n");
        switch (command) {
          case "button_enigmail_decrypt":
            return true;
        }
        return false;
      },
      isCommandEnabled(command) {
        // EnigmailLog.DEBUG("enigmailMessengerOverlay.js: treeCtrl: isCommandEnabled: "+command+"\n");
        try {
          if (gFolderDisplay.messageDisplay.visible) {
            if (gFolderDisplay.selectedCount != 1) {
              Enigmail.hdrView.statusBarHide();
            }
            return gFolderDisplay.selectedCount == 1;
          }
          Enigmail.hdrView.statusBarHide();
        } catch (ex) {}
        return false;
      },
      doCommand(command) {
        //EnigmailLog.DEBUG("enigmailMessengerOverlay.js: treeCtrl: doCommand: "+command+"\n");
        // nothing
      },
      onEvent(event) {
        // EnigmailLog.DEBUG("enigmailMessengerOverlay.js: treeCtrl: onEvent: "+command+"\n");
        // nothing
      },
    };

    top.controllers.appendController(this.treeController);

    EnigmailMsgRead.ensureExtraAddonHeaders();
    gMessageListeners.push(Enigmail.msg.messageListener);
    Enigmail.msg.messageListener.onEndHeaders();
  },

  messageListener: {
    onStartHeaders() {
      Enigmail.hdrView.reset();
      Enigmail.msg.mimeParts = null;

      /*
      if ("autocrypt" in gExpandedHeaderView) {
        delete gExpandedHeaderView.autocrypt;
      }
      */
      if ("openpgp" in gExpandedHeaderView) {
        delete gExpandedHeaderView.openpgp;
      }
    },
    onEndHeaders() {},
    onEndAttachments() {},
  },

  /*
  viewSecurityInfo(event, displaySmimeMsg) {
    EnigmailLog.DEBUG("enigmailMessengerOverlay.js: viewSecurityInfo\n");

    if (event && event.button !== 0) {
      return;
    }

    if (gSignatureStatus >= 0 || gEncryptionStatus >= 0) {
      showMessageReadSecurityInfo();
    } else if (Enigmail.msg.securityInfo) {
      this.viewOpenpgpInfo();
    } else {
      showMessageReadSecurityInfo();
    }
  },
  */

  clearLastMessage() {
    const { EnigmailSingletons } = ChromeUtils.import(
      "chrome://openpgp/content/modules/singletons.jsm"
    );
    EnigmailSingletons.clearLastDecryptedMessage();
  },

  messageReload(noShowReload) {
    EnigmailLog.DEBUG(
      "enigmailMessengerOverlay.js: messageReload: " + noShowReload + "\n"
    );

    this.clearLastMessage();
    ReloadMessage();
  },

  messengerClose() {
    EnigmailLog.DEBUG("enigmailMessengerOverlay.js: messengerClose()\n");
  },

  reloadCompleteMsg() {
    this.clearLastMessage();
    gDBView.reloadMessageWithAllParts();
  },

  setAttachmentReveal(attachmentList) {
    EnigmailLog.DEBUG("enigmailMessengerOverlay.js: setAttachmentReveal\n");

    var revealBox = document.getElementById("enigmailRevealAttachments");
    if (revealBox) {
      // there are situations when evealBox is not yet present
      revealBox.setAttribute("hidden", !attachmentList ? "true" : "false");
    }
  },

  messageCleanup() {
    EnigmailLog.DEBUG("enigmailMessengerOverlay.js: messageCleanup\n");
    for (let value of [
      "decryptInlinePGReminder",
      "decryptInlinePG",
      "brokenExchangeProgress",
    ]) {
      this.removeNotification(value);
    }
    Enigmail.msg.showPartialDecryptionReminder = false;

    let element = document.getElementById("openpgpKeyBox");
    if (element) {
      element.hidden = true;
    }
    element = document.getElementById("hasConflictingKeyOpenPGP");
    if (element) {
      element.setAttribute("hidden", true);
    }
    element = document.getElementById("signatureKeyBox");
    if (element) {
      element.hidden = true;
      element.removeAttribute("keyid");
    }

    this.setAttachmentReveal(null);

    Enigmail.msg.decryptedMessage = null;
    Enigmail.msg.securityInfo = null;

    Enigmail.msg.allAttachmentsDone = false;
    Enigmail.msg.messageDecryptDone = false;

    let cryptoBox = document.getElementById("cryptoBox");
    if (cryptoBox) {
      cryptoBox.removeAttribute("decryptDone");
    }

    Enigmail.msg.authorEmailFetched = false;
    Enigmail.msg.authorEmail = "";
    Enigmail.msg.attachedKeys = [];
    Enigmail.msg.attachedSenderEmailKeysIndex = [];

    Enigmail.msg.autoProcessPgpKeyAttachmentTransactionID++;
    Enigmail.msg.autoProcessPgpKeyAttachmentCount = 0;
    Enigmail.msg.autoProcessPgpKeyAttachmentProcessed = 0;
    Enigmail.msg.unhideMissingSigKeyBoxIsTODO = false;
    Enigmail.msg.missingSigKey = null;
  },

  messageFrameUnload() {
    EnigmailLog.DEBUG("enigmailMessengerOverlay.js: messageFrameUnload\n");
    Enigmail.msg.savedHeaders = null;
    Enigmail.msg.messageCleanup();
  },

  getCurrentMsgUriSpec() {
    try {
      // Thunderbird
      if (gFolderDisplay.selectedMessages.length != 1) {
        return "";
      }

      var uriSpec = gFolderDisplay.selectedMessageUris[0];
      //EnigmailLog.DEBUG("enigmailMessengerOverlay.js: getCurrentMsgUriSpec: uriSpec="+uriSpec+"\n");

      return uriSpec;
    } catch (ex) {
      return "";
    }
  },

  getCurrentMsgUrl() {
    var uriSpec = this.getCurrentMsgUriSpec();
    return EnigmailMsgRead.getUrlFromUriSpec(uriSpec);
  },

  updateOptionsDisplay() {
    EnigmailLog.DEBUG("enigmailMessengerOverlay.js: updateOptionsDisplay: \n");
    var optList = ["autoDecrypt"];

    for (let j = 0; j < optList.length; j++) {
      let menuElement = document.getElementById("enigmail_" + optList[j]);
      menuElement.setAttribute(
        "checked",
        Services.prefs.getBoolPref("temp.openpgp.autoDecrypt")
          ? "true"
          : "false"
      );

      menuElement = document.getElementById("enigmail_" + optList[j] + "2");
      if (menuElement) {
        menuElement.setAttribute(
          "checked",
          Services.prefs.getBoolPref("temp.openpgp.autoDecrypt")
            ? "true"
            : "false"
        );
      }
    }

    optList = ["decryptverify"];
    for (let j = 0; j < optList.length; j++) {
      let menuElement = document.getElementById("enigmail_" + optList[j]);
      if (Enigmail.msg.decryptButton && Enigmail.msg.decryptButton.disabled) {
        menuElement.setAttribute("disabled", "true");
      } else {
        menuElement.removeAttribute("disabled");
      }

      menuElement = document.getElementById("enigmail_" + optList[j] + "2");
      if (menuElement) {
        if (Enigmail.msg.decryptButton && Enigmail.msg.decryptButton.disabled) {
          menuElement.setAttribute("disabled", "true");
        } else {
          menuElement.removeAttribute("disabled");
        }
      }
    }
  },

  setMainMenuLabel() {
    let o = ["menu_Enigmail", "appmenu-Enigmail"];

    let m0 = document.getElementById(o[0]);
    let m1 = document.getElementById(o[1]);

    m1.setAttribute("enigmaillabel", m0.getAttribute("enigmaillabel"));

    for (let menuId of o) {
      let menu = document.getElementById(menuId);

      if (menu) {
        let lbl = menu.getAttribute("enigmaillabel");
        menu.setAttribute("label", lbl);
      }
    }
  },

  prepareAppMenu() {
    let menu = document.querySelector("#appMenu-mainView > vbox");
    if (!menu) {
      return;
    }

    // don't try to add Enigmail menu more than once
    if (document.getElementById("appmenu-Enigmail")) {
      return;
    }

    let tsk = document.getElementById("appmenu_tasksMenu");
    let e = document.createXULElement("toolbarbutton");
    e.setAttribute("label", "xxEnigmail");
    e.id = "appmenu-Enigmail";
    e.setAttribute(
      "class",
      "subviewbutton subviewbutton-nav subviewbutton-iconic"
    );
    e.setAttribute("closemenu", "none");
    e.setAttribute(
      "oncommand",
      "Enigmail.msg.displayAppmenu('appMenu-enigmailView', this)"
    );
    e.setAttribute("overlay_source", "enigmail");
    menu.insertBefore(e, tsk);
  },

  displayAppmenu(targetId, targetObj) {
    let menuElem = document.getElementById("appmenu_enigmailMenuPlaceholder");
    this.displayMainMenu(menuElem);
    PanelUI.showSubView(targetId, targetObj);
  },

  displayMainMenu(menuPopup) {
    let obj = menuPopup.firstChild;

    while (obj) {
      if (
        obj.getAttribute("enigmailtype") == "enigmail" ||
        obj.getAttribute("advanced") == "true"
      ) {
        obj.removeAttribute("hidden");
      }

      obj = obj.nextSibling;
    }

    EnigmailFuncs.collapseAdvanced(
      menuPopup,
      "hidden",
      Enigmail.msg.updateOptionsDisplay()
    );
  },

  /**
   * Determine if Autocrypt is enabled for the currently selected message
   */
  /*
  isAutocryptEnabled() {
    try {
      let email = EnigmailFuncs.stripEmail(
        gFolderDisplay.selectedMessage.recipients
      );
      let maybeIdent = EnigmailStdlib.getIdentityForEmail(email);

      if (maybeIdent && maybeIdent.identity) {
        let acct = EnigmailFuncs.getAccountForIdentity(maybeIdent.identity);
        return acct.incomingServer.getBoolValue("enableAutocrypt");
      }
    } catch (ex) {}

    return false;
  },
  */

  messageImport() {
    EnigmailLog.DEBUG("enigmailMessengerOverlay.js: messageImport:\n");

    return this.messageParse(
      true,
      true,
      "",
      this.getCurrentMsgUriSpec(),
      false
    );
  },

  /***
   * check that handler for multipart/signed is set to Enigmail.
   * if handler is different, change it and reload message
   *
   * @return: - true if handler is OK
   *          - false if handler was changed and message is reloaded
   */
  checkPgpmimeHandler() {
    let uriSpec = this.getCurrentMsgUriSpec();
    if (uriSpec !== this.lastSMimeReloadURI) {
      if (
        EnigmailVerify.currentCtHandler !==
        EnigmailConstants.MIME_HANDLER_PGPMIME
      ) {
        this.lastSMimeReloadURI = uriSpec;
        EnigmailVerify.registerContentTypeHandler();
        this.messageReload();
        return false;
      }
    }

    return true;
  },

  // callback function for automatic decryption
  async messageAutoDecrypt() {
    EnigmailLog.DEBUG("enigmailMessengerOverlay.js: messageAutoDecrypt:\n");
    await Enigmail.msg.messageDecrypt(null, true);
  },

  async notifyMessageDecryptDone() {
    Enigmail.msg.messageDecryptDone = true;
    Enigmail.msg.processAfterAttachmentsAndDecrypt();

    document.dispatchEvent(
      new CustomEvent("openpgpprocessed", {
        detail: { messageDecryptDone: true },
      })
    );

    // Show the partial inline encryption reminder only if the decryption action
    // came from a partially inline encrypted message.
    if (Enigmail.msg.showPartialDecryptionReminder) {
      Enigmail.msg.showPartialDecryptionReminder = false;

      this.notificationBox.appendNotification(
        await document.l10n.formatValue("openpgp-reminder-partial-display"),
        "decryptInlinePGReminder",
        null,
        this.notificationBox.PRIORITY_INFO_HIGH,
        null
      );
    }
  },

  // analyse message header and decrypt/verify message
  async messageDecrypt(event, isAuto) {
    EnigmailLog.DEBUG(
      "enigmailMessengerOverlay.js: messageDecrypt: " + event + "\n"
    );

    event = !!event;

    this.mimeParts = null;

    if (!isAuto) {
      EnigmailVerify.setManualUri(this.getCurrentMsgUriSpec());
    }

    let contentType = "text/plain";
    if ("content-type" in currentHeaderData) {
      contentType = currentHeaderData["content-type"].headerValue;
    }

    // don't parse message if we know it's a PGP/MIME message
    if (
      contentType.search(/^multipart\/encrypted(;|$)/i) === 0 &&
      contentType.search(/application\/pgp-encrypted/i) > 0
    ) {
      this.movePEPsubject();
      await this.messageDecryptCb(event, isAuto, null);
      this.notifyMessageDecryptDone();
      return;
    } else if (
      contentType.search(/^multipart\/signed(;|$)/i) === 0 &&
      contentType.search(/application\/pgp-signature/i) > 0
    ) {
      this.movePEPsubject();
      await this.messageDecryptCb(event, isAuto, null);
      this.notifyMessageDecryptDone();
      return;
    }

    try {
      EnigmailMime.getMimeTreeFromUrl(
        this.getCurrentMsgUrl().spec,
        false,
        async function(mimeMsg) {
          await Enigmail.msg.messageDecryptCb(event, isAuto, mimeMsg);
          Enigmail.msg.notifyMessageDecryptDone();
        }
      );
    } catch (ex) {
      EnigmailLog.DEBUG(
        "enigmailMessengerOverlay.js: messageDecrypt: exception: " +
          ex.toString() +
          "\n"
      );
      await this.messageDecryptCb(event, isAuto, null);
      this.notifyMessageDecryptDone();
    }
  },

  /***
   * walk through the (sub-) mime tree and determine PGP/MIME encrypted and signed message parts
   *
   * @param mimePart:  parent object to walk through
   * @param resultObj: object containing two arrays. The resultObj must be pre-initialized by the caller
   *                    - encrypted
   *                    - signed
   */
  enumerateMimeParts(mimePart, resultObj) {
    EnigmailLog.DEBUG(
      'enumerateMimeParts: partNum="' + mimePart.partNum + '"\n'
    );
    EnigmailLog.DEBUG("                    " + mimePart.fullContentType + "\n");
    EnigmailLog.DEBUG(
      "                    " + mimePart.subParts.length + " subparts\n"
    );

    try {
      var ct = mimePart.fullContentType;
      if (typeof ct == "string") {
        ct = ct.replace(/[\r\n]/g, " ");
        if (ct.search(/multipart\/signed.*application\/pgp-signature/i) >= 0) {
          resultObj.signed.push(mimePart.partNum);
        } else if (ct.search(/application\/pgp-encrypted/i) >= 0) {
          resultObj.encrypted.push(mimePart.partNum);
        }
      }
    } catch (ex) {
      // catch exception if no headers or no content-type defined.
    }

    var i;
    for (i in mimePart.subParts) {
      this.enumerateMimeParts(mimePart.subParts[i], resultObj);
    }
  },

  async messageDecryptCb(event, isAuto, mimeMsg) {
    EnigmailLog.DEBUG("enigmailMessengerOverlay.js: messageDecryptCb:\n");

    this.buggyExchangeEmailContent = null; // reinit HACK for MS-EXCHANGE-Server Problem

    let enigmailSvc;
    let contentType = "";
    try {
      if (!mimeMsg) {
        EnigmailLog.DEBUG(
          "enigmailMessengerOverlay.js: messageDecryptCb: mimeMsg is null\n"
        );
        try {
          contentType = currentHeaderData["content-type"].headerValue;
        } catch (ex) {
          contentType = "text/plain";
        }
        mimeMsg = {
          partNum: "1",
          headers: {
            has() {
              return false;
            },
            contentType: {
              type: contentType,
              mediatype: "",
              subtype: "",
            },
          },
          fullContentType: contentType,
          body: "",
          parent: null,
          subParts: [],
        };
      }

      // Copy selected headers
      Enigmail.msg.savedHeaders = {
        autocrypt: [],
      };

      for (let h in currentHeaderData) {
        if (h.search(/^autocrypt\d*$/) === 0) {
          Enigmail.msg.savedHeaders.autocrypt.push(
            currentHeaderData[h].headerValue
          );
        }
      }

      if (!mimeMsg.fullContentType) {
        mimeMsg.fullContentType = "text/plain";
      }

      Enigmail.msg.savedHeaders["content-type"] = mimeMsg.fullContentType;
      this.mimeParts = mimeMsg;

      for (var index = 0; index < Enigmail.msg.headersList.length; index++) {
        var headerName = Enigmail.msg.headersList[index];
        var headerValue = "";

        if (mimeMsg.headers.has(headerName)) {
          let h = mimeMsg.headers.get(headerName);
          if (Array.isArray(h)) {
            headerValue = h.join("");
          } else {
            headerValue = h;
          }
        }
        Enigmail.msg.savedHeaders[headerName] = headerValue;
        EnigmailLog.DEBUG(
          "enigmailMessengerOverlay.js: header " +
            headerName +
            ": '" +
            headerValue +
            "'\n"
        );
      }

      var msgSigned =
        mimeMsg.fullContentType.search(/^multipart\/signed/i) === 0 &&
        EnigmailMime.getProtocol(mimeMsg.fullContentType).search(
          /^application\/pgp-signature/i
        ) === 0;
      var msgEncrypted =
        mimeMsg.fullContentType.search(/^multipart\/encrypted/i) === 0 &&
        EnigmailMime.getProtocol(mimeMsg.fullContentType).search(
          /^application\/pgp-encrypted/i
        ) === 0;
      var resultObj = {
        encrypted: [],
        signed: [],
      };

      if (mimeMsg.subParts.length > 0) {
        this.enumerateMimeParts(mimeMsg, resultObj);
        EnigmailLog.DEBUG(
          "enigmailMessengerOverlay.js: embedded objects: " +
            resultObj.encrypted.join(", ") +
            " / " +
            resultObj.signed.join(", ") +
            "\n"
        );

        msgSigned = msgSigned || resultObj.signed.length > 0;
        msgEncrypted = msgEncrypted || resultObj.encrypted.length > 0;

        /*
        if (
          "autocrypt-setup-message" in Enigmail.msg.savedHeaders &&
          Enigmail.msg.savedHeaders["autocrypt-setup-message"].toLowerCase() ===
            "v1"
        ) {
          if (
            currentAttachments[0].contentType.search(
              /^application\/autocrypt-setup$/i
            ) === 0
          ) {
            Enigmail.hdrView.displayAutoCryptSetupMsgHeader();
            return;
          }
        }
        */

        // HACK for Zimbra OpenPGP Zimlet
        // Zimbra illegally changes attachment content-type to application/pgp-encrypted which interfers with below
        // see https://sourceforge.net/p/enigmail/bugs/600/

        try {
          if (
            mimeMsg.subParts.length > 1 &&
            mimeMsg.headers.has("x-mailer") &&
            mimeMsg.headers.get("x-mailer")[0].includes("ZimbraWebClient") &&
            mimeMsg.subParts[0].fullContentType.includes("text/plain") &&
            mimeMsg.fullContentType.includes("multipart/mixed") &&
            mimeMsg.subParts[1].fullContentType.includes(
              "application/pgp-encrypted"
            )
          ) {
            await this.messageParse(
              event,
              false,
              Enigmail.msg.savedHeaders["content-transfer-encoding"],
              this.getCurrentMsgUriSpec(),
              isAuto
            );
            return;
          }
        } catch (ex) {
          console.debug(ex);
        }

        // HACK for MS-EXCHANGE-Server Problem:
        // check for possible bad mime structure due to buggy exchange server:
        // - multipart/mixed Container with
        //   - application/pgp-encrypted Attachment with name "PGPMIME Versions Identification"
        //   - application/octet-stream Attachment with name "encrypted.asc" having the encrypted content in base64
        // - see:
        //   - http://www.mozilla-enigmail.org/forum/viewtopic.php?f=4&t=425
        //   - http://sourceforge.net/p/enigmail/forum/support/thread/4add2b69/

        // iPGMail produces a similar broken structure, see here:
        //   - https://sourceforge.net/p/enigmail/forum/support/thread/afc9c246/#5de7

        if (
          mimeMsg.subParts.length == 3 &&
          mimeMsg.fullContentType.search(/multipart\/mixed/i) >= 0 &&
          mimeMsg.subParts[0].fullContentType.search(/multipart\/encrypted/i) <
            0 &&
          mimeMsg.subParts[0].fullContentType.search(/text\/(plain|html)/i) >=
            0 &&
          mimeMsg.subParts[1].fullContentType.search(
            /application\/pgp-encrypted/i
          ) >= 0
        ) {
          if (
            mimeMsg.subParts[1].fullContentType.search(
              /multipart\/encrypted/i
            ) < 0 &&
            mimeMsg.subParts[1].fullContentType.search(
              /PGP\/?MIME Versions? Identification/i
            ) >= 0 &&
            mimeMsg.subParts[2].fullContentType.search(
              /application\/octet-stream/i
            ) >= 0 &&
            mimeMsg.subParts[2].fullContentType.search(/encrypted.asc/i) >= 0
          ) {
            this.buggyMailType = "exchange";
          } else {
            this.buggyMailType = "iPGMail";
          }

          // signal that the structure matches to save the content later on
          EnigmailLog.DEBUG(
            "enigmailMessengerOverlay: messageDecryptCb: enabling MS-Exchange hack\n"
          );
          this.buggyExchangeEmailContent = "???";

          this.buggyMailHeader();
          return;
        }
      }

      var contentEncoding = "";
      var msgUriSpec = this.getCurrentMsgUriSpec();

      if (Enigmail.msg.savedHeaders) {
        contentType = Enigmail.msg.savedHeaders["content-type"];
        contentEncoding =
          Enigmail.msg.savedHeaders["content-transfer-encoding"];
      }

      let smime =
        contentType.search(
          /multipart\/signed; protocol="application\/pkcs7-signature/i
        ) >= 0;
      if (!smime && (msgSigned || msgEncrypted)) {
        // PGP/MIME messages
        enigmailSvc = Enigmail.getEnigmailSvc();
        if (!enigmailSvc) {
          return;
        }

        if (!Enigmail.msg.checkPgpmimeHandler()) {
          return;
        }

        if (isAuto && !Services.prefs.getBoolPref("temp.openpgp.autoDecrypt")) {
          if (EnigmailVerify.getManualUri() != this.getCurrentMsgUriSpec()) {
            // decryption set to manual
            Enigmail.hdrView.updateHdrIcons(
              EnigmailConstants.POSSIBLE_PGPMIME,
              0, // exitCode, statusFlags
              0,
              "",
              "", // keyId, userId
              "", // sigDetails
              await l10n.formatValue("possibly-pgp-mime"), // infoMsg
              null, // blockSeparation
              null, // encToDetails
              null
            ); // xtraStatus
          }
        } else if (!isAuto) {
          Enigmail.msg.messageReload(false);
        }
        return;
      }

      // inline-PGP messages
      if (!isAuto || Services.prefs.getBoolPref("temp.openpgp.autoDecrypt")) {
        await this.messageParse(
          event,
          false,
          contentEncoding,
          msgUriSpec,
          isAuto
        );
      }
    } catch (ex) {
      EnigmailLog.writeException(
        "enigmailMessengerOverlay.js: messageDecryptCb",
        ex
      );
    }
  },

  /**
   * Display header about reparing buggy MS-Exchange messages.
   */
  async buggyMailHeader() {
    let uri = this.getCurrentMsgUrl();
    Enigmail.hdrView.headerPane.updateSecurityStatus(
      "",
      0,
      0,
      0,
      "",
      "",
      "",
      "",
      "",
      uri,
      "",
      "1"
    );

    // Warn that we can't fix a message that was opened from a local file.
    if (!gFolderDisplay.selectedMessage.folder) {
      Enigmail.msg.notificationBox.appendNotification(
        await document.l10n.formatValue("openpgp-broken-exchange-opened"),
        "brokenExchange",
        null,
        Enigmail.msg.notificationBox.PRIORITY_WARNING_MEDIUM,
        null
      );
      return;
    }

    let buttons = [
      {
        "l10n-id": "openpgp-broken-exchange-repair",
        popup: null,
        callback(notification, button) {
          Enigmail.msg.fixBuggyExchangeMail();
          return false; // Close notification.
        },
      },
    ];

    Enigmail.msg.notificationBox.appendNotification(
      await document.l10n.formatValue("openpgp-broken-exchange-info"),
      "brokenExchange",
      null,
      Enigmail.msg.notificationBox.PRIORITY_WARNING_MEDIUM,
      buttons
    );
  },

  getFirstPGPMessageType(msgText) {
    let indexEncrypted = msgText.indexOf("-----BEGIN PGP MESSAGE-----");
    let indexSigned = msgText.indexOf("-----BEGIN PGP SIGNED MESSAGE-----");
    if (indexEncrypted >= 0) {
      if (
        indexSigned == -1 ||
        (indexSigned >= 0 && indexEncrypted < indexSigned)
      ) {
        return "encrypted";
      }
    }

    if (indexSigned >= 0) {
      return "signed";
    }

    return "";
  },

  trimIfEncrypted(msgText) {
    // If it's an encrypted message, we want to trim (at least) the
    // separator line between the header and the content.
    // However, trimming all lines should be safe.

    if (Enigmail.msg.getFirstPGPMessageType(msgText) == "encrypted") {
      // \xA0 is non-breaking-space
      msgText = msgText.replace(/^[ \t\xA0]+/gm, "");
    }
    return msgText;
  },

  async messageParse(
    interactive,
    importOnly,
    contentEncoding,
    msgUriSpec,
    isAuto,
    pbMessageIndex = "0"
  ) {
    EnigmailLog.DEBUG(
      "enigmailMessengerOverlay.js: messageParse: " + interactive + "\n"
    );

    var bodyElement = this.getBodyElement(pbMessageIndex);
    EnigmailLog.DEBUG(
      "enigmailMessengerOverlay.js: bodyElement=" + bodyElement + "\n"
    );

    if (!bodyElement) {
      return;
    }

    let topElement = bodyElement;
    var findStr = /* interactive ? null : */ "-----BEGIN PGP";
    var msgText = null;
    var foundIndex = -1;

    let bodyElementFound = false;
    let hasHeadOrTailNode = false;

    if (bodyElement.firstChild) {
      let node = bodyElement.firstChild;
      while (node) {
        if (
          node.firstChild &&
          node.firstChild.nodeName.toUpperCase() == "LEGEND" &&
          node.firstChild.className == "mimeAttachmentHeaderName"
        ) {
          // we reached the area where inline attachments are displayed
          // --> don't try to decrypt displayed inline attachments
          break;
        }
        if (node.nodeName === "DIV") {
          if (bodyElementFound) {
            hasHeadOrTailNode = true;
            break;
          }

          foundIndex = node.textContent.indexOf(findStr);

          if (foundIndex < 0) {
            hasHeadOrTailNode = true;
            node = node.nextSibling;
            continue;
          }

          if (foundIndex >= 0) {
            if (
              node.textContent.indexOf(findStr + " LICENSE AUTHORIZATION") ==
              foundIndex
            ) {
              foundIndex = -1;
              node = node.nextSibling;
              continue;
            }
          }

          if (foundIndex === 0) {
            bodyElement = node;
            bodyElementFound = true;
          } else if (
            foundIndex > 0 &&
            node.textContent.substr(foundIndex - 1, 1).search(/[\r\n]/) === 0
          ) {
            bodyElement = node;
            bodyElementFound = true;
          }
        }
        node = node.nextSibling;
      }
    }

    if (foundIndex >= 0 && !this.hasInlineQuote(topElement)) {
      let beginIndex = {};
      let endIndex = {};
      let indentStr = {};

      if (
        Enigmail.msg.savedHeaders["content-type"].search(/^text\/html/i) === 0
      ) {
        let p = Cc["@mozilla.org/parserutils;1"].createInstance(
          Ci.nsIParserUtils
        );
        const de = Ci.nsIDocumentEncoder;
        msgText = p.convertToPlainText(
          topElement.innerHTML,
          de.OutputRaw | de.OutputBodyOnly,
          0
        );
      } else {
        msgText = bodyElement.textContent;
      }

      if (!isAuto) {
        let blockType = EnigmailArmor.locateArmoredBlock(
          msgText,
          0,
          "",
          beginIndex,
          endIndex,
          indentStr
        );
        if (!blockType) {
          msgText = "";
        } else {
          msgText = msgText.substring(beginIndex.value, endIndex.value + 1);
        }
      }

      msgText = this.trimIfEncrypted(msgText);
    }

    if (!msgText) {
      // No PGP content

      // but this might be caused by the HACK for MS-EXCHANGE-Server Problem
      // - so return only if:
      if (
        !this.buggyExchangeEmailContent ||
        this.buggyExchangeEmailContent == "???"
      ) {
        return;
      }

      EnigmailLog.DEBUG(
        "enigmailMessengerOverlay.js: messageParse: got buggyExchangeEmailContent = " +
          this.buggyExchangeEmailContent.substr(0, 50) +
          "\n"
      );

      // fix the whole invalid email by replacing the contents by the decoded text
      // as plain inline format
      if (this.displayBuggyExchangeMail()) {
        return;
      }

      msgText = this.buggyExchangeEmailContent;

      msgText = msgText.replace(/\r\n/g, "\n");
      msgText = msgText.replace(/\r/g, "\n");

      // content is in encrypted.asc part:
      let idx = msgText.search(
        /Content-Type: application\/octet-stream; name="encrypted.asc"/i
      );
      if (idx >= 0) {
        msgText = msgText.slice(idx);
      }
      // check whether we have base64 encoding
      var isBase64 = false;
      idx = msgText.search(/Content-Transfer-Encoding: base64/i);
      if (idx >= 0) {
        isBase64 = true;
      }
      // find content behind part header
      idx = msgText.search(/\n\n/);
      if (idx >= 0) {
        msgText = msgText.slice(idx);
      }
      // remove stuff behind content block (usually a final boundary row)
      idx = msgText.search(/\n\n--/);
      if (idx >= 0) {
        msgText = msgText.slice(0, idx + 1);
      }
      // decode base64 if it is encoded that way
      if (isBase64) {
        try {
          msgText = EnigmailData.decodeBase64(msgText);
        } catch (ex) {
          EnigmailLog.writeException(
            "enigmailMessengerOverlay.js: decodeBase64() ",
            ex
          );
        }
        //EnigmailLog.DEBUG("nach base64 decode: \n" + msgText + "\n");
      }
    }

    var charset = msgWindow ? msgWindow.mailCharacterSet : "";
    if (charset != "UTF-8") {
      // Encode ciphertext to charset from unicode
      msgText = EnigmailData.convertFromUnicode(msgText, charset);
    }

    if (isAuto) {
      let ht = hasHeadOrTailNode || this.hasHeadOrTailBesidesInlinePGP(msgText);
      if (ht) {
        let infoId;
        let buttonId;
        if (ht & EnigmailConstants.UNCERTAIN_SIGNATURE) {
          infoId = "openpgp-partially-signed";
          buttonId = "openpgp-partial-verify-button";
        } else {
          infoId = "openpgp-partially-encrypted";
          buttonId = "openpgp-partial-decrypt-button";
        }

        let [description, buttonLabel] = await document.l10n.formatValues([
          { id: infoId },
          { id: buttonId },
        ]);

        let buttons = [
          {
            label: buttonLabel,
            popup: null,
            callback(aNotification, aButton) {
              Enigmail.msg.processOpenPGPSubset();
              return false; // Close notification.
            },
          },
        ];

        this.notificationBox.appendNotification(
          description,
          "decryptInlinePG",
          null,
          this.notificationBox.PRIORITY_INFO_HIGH,
          buttons
        );
        return;
      }
    }

    var mozPlainText = bodyElement.innerHTML.search(/class="moz-text-plain"/);

    if (mozPlainText >= 0 && mozPlainText < 40) {
      // workaround for too much expanded emoticons in plaintext msg
      var r = new RegExp(
        /( )(;-\)|:-\)|;\)|:\)|:-\(|:\(|:-\\|:-P|:-D|:-\[|:-\*|>:o|8-\)|:-\$|:-X|=-O|:-!|O:-\)|:'\()( )/g
      );
      if (msgText.search(r) >= 0) {
        EnigmailLog.DEBUG(
          "enigmailMessengerOverlay.js: messageParse: performing emoticons fixing\n"
        );
        msgText = msgText.replace(r, "$2");
      }
    }

    // ignoring text following armored block

    //EnigmailLog.DEBUG("enigmailMessengerOverlay.js: msgText='"+msgText+"'\n");

    var mailNewsUrl = EnigmailMsgRead.getUrlFromUriSpec(msgUriSpec);

    var urlSpec = mailNewsUrl ? mailNewsUrl.spec : "";

    let retry = 1;

    await Enigmail.msg.messageParseCallback(
      msgText,
      contentEncoding,
      charset,
      interactive,
      importOnly,
      urlSpec,
      "",
      retry,
      "", // head
      "", // tail
      msgUriSpec,
      isAuto,
      pbMessageIndex
    );
  },

  hasInlineQuote(node) {
    if (node.innerHTML.search(/<blockquote.*-----BEGIN PGP /i) < 0) {
      return false;
    }

    return EnigmailMsgRead.searchQuotedPgp(node);
  },

  hasHeadOrTailBesidesInlinePGP(msgText) {
    let startIndex = msgText.search(/-----BEGIN PGP (SIGNED )?MESSAGE-----/m);
    let endIndex = msgText.indexOf("-----END PGP");
    let hasHead = false;
    let hasTail = false;
    let crypto = 0;

    if (startIndex > 0) {
      let pgpMsg = msgText.match(/(-----BEGIN PGP (SIGNED )?MESSAGE-----)/m)[0];
      if (pgpMsg.search(/SIGNED/) > 0) {
        crypto = EnigmailConstants.UNCERTAIN_SIGNATURE;
      } else {
        crypto = EnigmailConstants.DECRYPTION_FAILED;
      }
      let startSection = msgText.substr(0, startIndex - 1);
      hasHead = startSection.search(/\S/) >= 0;
    }

    if (endIndex > startIndex) {
      let nextLine = msgText.substring(endIndex).search(/[\n\r]/);
      if (nextLine > 0) {
        hasTail = msgText.substring(endIndex + nextLine).search(/\S/) >= 0;
      }
    }

    if (hasHead || hasTail) {
      return EnigmailConstants.PARTIALLY_PGP | crypto;
    }

    return 0;
  },

  async processOpenPGPSubset() {
    Enigmail.msg.showPartialDecryptionReminder = true;
    await this.messageDecrypt(null, false);
  },

  getBodyElement() {
    let msgFrame = document.getElementById("messagepane");
    if (!msgFrame || !msgFrame.contentDocument) {
      return null;
    }
    return msgFrame.contentDocument.getElementsByTagName("body")[0];
  },

  async messageParseCallback(
    msgText,
    contentEncoding,
    charset,
    interactive,
    importOnly,
    messageUrl,
    signature,
    retry,
    head,
    tail,
    msgUriSpec,
    isAuto,
    pbMessageIndex
  ) {
    EnigmailLog.DEBUG(
      "enigmailMessengerOverlay.js: messageParseCallback: " +
        interactive +
        ", " +
        interactive +
        ", importOnly=" +
        importOnly +
        ", charset=" +
        charset +
        ", msgUrl=" +
        messageUrl +
        ", retry=" +
        retry +
        ", signature='" +
        signature +
        "'\n"
    );

    if (!msgText) {
      return;
    }

    var enigmailSvc = Enigmail.getEnigmailSvc();
    if (!enigmailSvc) {
      return;
    }

    var plainText;
    var exitCode;
    var newSignature = "";
    var statusFlags = 0;
    var extStatusFlags = 0;

    var errorMsgObj = {
      value: "",
    };
    var keyIdObj = {};
    var userIdObj = {};
    var sigDetailsObj = {};
    var encToDetailsObj = {};

    var blockSeparationObj = {
      value: "",
    };

    if (importOnly) {
      // Import public key
      this.importKeyFromMsgBody(msgText);
      return;
    }
    let armorHeaders = EnigmailArmor.getArmorHeaders(msgText);
    if ("charset" in armorHeaders) {
      charset = armorHeaders.charset;
      EnigmailLog.DEBUG(
        "enigmailMessengerOverlay.js: messageParseCallback: OVERRIDING charset=" +
          charset +
          "\n"
      );
    }

    var exitCodeObj = {};
    var statusFlagsObj = {};
    var signatureObj = {};
    signatureObj.value = signature;

    var uiFlags = interactive
      ? EnigmailConstants.UI_INTERACTIVE |
        // EnigmailConstants.UI_ALLOW_KEY_IMPORT |
        EnigmailConstants.UI_UNVERIFIED_ENC_OK
      : 0;

    plainText = EnigmailDecryption.decryptMessage(
      window,
      uiFlags,
      msgText,
      signatureObj,
      exitCodeObj,
      statusFlagsObj,
      keyIdObj,
      userIdObj,
      sigDetailsObj,
      errorMsgObj,
      blockSeparationObj,
      encToDetailsObj
    );

    //EnigmailLog.DEBUG("enigmailMessengerOverlay.js: messageParseCallback: plainText='"+plainText+"'\n");

    exitCode = exitCodeObj.value;
    newSignature = signatureObj.value;

    if (plainText === "" && exitCode === 0) {
      plainText = " ";
    }

    statusFlags = statusFlagsObj.value;
    extStatusFlags = statusFlagsObj.ext;

    EnigmailLog.DEBUG(
      "enigmailMessengerOverlay.js: messageParseCallback: newSignature='" +
        newSignature +
        "'\n"
    );

    var errorMsg = errorMsgObj.value;

    if (importOnly) {
      if (interactive && errorMsg) {
        EnigmailDialog.alert(window, errorMsg);
      }
      return;
    }

    var displayedUriSpec = Enigmail.msg.getCurrentMsgUriSpec();
    if (!msgUriSpec || displayedUriSpec == msgUriSpec) {
      if (exitCode && !statusFlags) {
        // Failure, but we don't know why it failed.
        // Peek inside msgText, and check what kind of content it is,
        // so we can show a minimal error.

        let msgType = Enigmail.msg.getFirstPGPMessageType(msgText);
        if (msgType == "encrypted") {
          statusFlags = EnigmailConstants.DECRYPTION_FAILED;
        } else if (msgType == "signed") {
          statusFlags = EnigmailConstants.BAD_SIGNATURE;
        }
      }

      Enigmail.hdrView.updateHdrIcons(
        exitCode,
        statusFlags,
        extStatusFlags,
        keyIdObj.value,
        userIdObj.value,
        sigDetailsObj.value,
        errorMsg,
        null, // blockSeparation
        encToDetailsObj.value,
        null
      ); // xtraStatus
    }

    var noSecondTry =
      EnigmailConstants.GOOD_SIGNATURE |
      EnigmailConstants.EXPIRED_SIGNATURE |
      EnigmailConstants.EXPIRED_KEY_SIGNATURE |
      EnigmailConstants.EXPIRED_KEY |
      EnigmailConstants.REVOKED_KEY |
      EnigmailConstants.NO_PUBKEY |
      EnigmailConstants.NO_SECKEY |
      EnigmailConstants.IMPORTED_KEY |
      EnigmailConstants.MISSING_PASSPHRASE |
      EnigmailConstants.BAD_PASSPHRASE |
      EnigmailConstants.UNKNOWN_ALGO |
      EnigmailConstants.DECRYPTION_OKAY |
      EnigmailConstants.OVERFLOWED;

    if (exitCode !== 0 && !(statusFlags & noSecondTry)) {
      // Bad signature/armor
      if (retry == 1) {
        msgText = EnigmailData.convertFromUnicode(msgText, "UTF-8");
        await Enigmail.msg.messageParseCallback(
          msgText,
          contentEncoding,
          charset,
          interactive,
          importOnly,
          messageUrl,
          signature,
          retry + 1,
          head,
          tail,
          msgUriSpec,
          isAuto,
          pbMessageIndex
        );
        return;
      } else if (retry == 2) {
        // Try to verify signature by accessing raw message text directly
        // (avoid recursion by setting retry parameter to false on callback)
        newSignature = "";
        await Enigmail.msg.msgDirectDecrypt(
          interactive,
          importOnly,
          contentEncoding,
          charset,
          newSignature,
          0,
          head,
          tail,
          msgUriSpec,
          Enigmail.msg.messageParseCallback,
          isAuto
        );
        return;
      } else if (retry == 3) {
        msgText = EnigmailData.convertFromUnicode(msgText, "UTF-8");
        await Enigmail.msg.messageParseCallback(
          msgText,
          contentEncoding,
          charset,
          interactive,
          importOnly,
          messageUrl,
          null,
          retry + 1,
          head,
          tail,
          msgUriSpec,
          isAuto,
          pbMessageIndex
        );
        return;
      }
    }

    if (!plainText) {
      // Show the subset that we cannot process, together with status.
      plainText = msgText;
    }

    if (retry >= 2) {
      plainText = EnigmailData.convertFromUnicode(
        EnigmailData.convertToUnicode(plainText, "UTF-8"),
        charset
      );
    }

    // TODO: what is blockSeparation ? How to emulate with RNP?
    /*
    if (blockSeparationObj.value.includes(" ")) {
      var blocks = blockSeparationObj.value.split(/ /);
      var blockInfo = blocks[0].split(/:/);
      plainText =
        EnigmailData.convertFromUnicode(
          "*Parts of the message have NOT been signed nor encrypted*",
          charset
        ) +
        "\n\n" +
        plainText.substr(0, blockInfo[1]) +
        "\n\n" +
        "*Multiple message blocks found -- decryption/verification aborted*";
    }
    */

    // Save decrypted message status, headers, and content
    var headerList = {
      subject: "",
      from: "",
      date: "",
      to: "",
      cc: "",
    };

    var index, headerName;

    if (!gViewAllHeaders) {
      for (index = 0; index < headerList.length; index++) {
        headerList[index] = "";
      }
    } else {
      for (index = 0; index < gExpandedHeaderList.length; index++) {
        headerList[gExpandedHeaderList[index].name] = "";
      }

      for (headerName in currentHeaderData) {
        headerList[headerName] = "";
      }
    }

    for (headerName in headerList) {
      if (currentHeaderData[headerName]) {
        headerList[headerName] = currentHeaderData[headerName].headerValue;
      }
    }

    // WORKAROUND
    if (headerList.cc == headerList.to) {
      headerList.cc = "";
    }

    var hasAttachments = currentAttachments && currentAttachments.length;
    var attachmentsEncrypted = true;

    for (index in currentAttachments) {
      if (!Enigmail.msg.checkEncryptedAttach(currentAttachments[index])) {
        if (
          !EnigmailMsgRead.checkSignedAttachment(
            currentAttachments,
            index,
            currentAttachments
          )
        ) {
          attachmentsEncrypted = false;
        }
      }
    }

    Enigmail.msg.decryptedMessage = {
      url: messageUrl,
      uri: msgUriSpec,
      headerList,
      hasAttachments,
      attachmentsEncrypted,
      charset,
      plainText,
    };

    // don't display decrypted message if message selection has changed
    displayedUriSpec = Enigmail.msg.getCurrentMsgUriSpec();
    if (msgUriSpec && displayedUriSpec && displayedUriSpec != msgUriSpec) {
      return;
    }

    // Create and load one-time message URI
    var messageContent = Enigmail.msg.getDecryptedMessage(
      "message/rfc822",
      false
    );

    var node;
    var bodyElement = Enigmail.msg.getBodyElement(pbMessageIndex);

    if (bodyElement.firstChild) {
      node = bodyElement.firstChild;

      let divFound = false;

      while (node) {
        if (node.nodeName == "DIV") {
          if (divFound) {
            node.innerHTML = "";
          } else {
            // for safety reasons, we replace the complete visible message with
            // the decrypted or signed part (bug 983)
            divFound = true;
            node.innerHTML = EnigmailFuncs.formatPlaintextMsg(
              EnigmailData.convertToUnicode(messageContent, charset)
            );
            Enigmail.msg.movePEPsubject();
          }
        }
        node = node.nextSibling;
      }

      if (divFound) {
        return;
      }

      let preFound = false;

      // if no <DIV> node is found, try with <PRE> (bug 24762)
      node = bodyElement.firstChild;
      while (node) {
        if (node.nodeName == "PRE") {
          if (preFound) {
            node.innerHTML = "";
          } else {
            preFound = true;
            node.innerHTML = EnigmailFuncs.formatPlaintextMsg(
              EnigmailData.convertToUnicode(messageContent, charset)
            );
            Enigmail.msg.movePEPsubject();
          }
        }
        node = node.nextSibling;
      }

      if (preFound) {
        return;
      }

      // HACK for MS-EXCHANGE-Server Problem:
      // - remove empty text/plain part
      //   and set message content as inner text
      // - missing:
      //   - signal in statusFlags so that we warn in Enigmail.hdrView.updateHdrIcons()
      if (this.buggyExchangeEmailContent) {
        if (this.displayBuggyExchangeMail()) {
          return;
        }

        EnigmailLog.DEBUG(
          "enigmailMessengerOverlay: messageParseCallback: got broken MS-Exchange mime message\n"
        );
        messageContent = messageContent.replace(
          /^\s{0,2}Content-Transfer-Encoding: quoted-printable\s*Content-Type: text\/plain;\s*charset=windows-1252/i,
          ""
        );
        node = bodyElement.firstChild;
        while (node) {
          if (node.nodeName == "DIV") {
            node.innerHTML = EnigmailFuncs.formatPlaintextMsg(
              EnigmailData.convertToUnicode(messageContent, charset)
            );
            Enigmail.hdrView.updateHdrIcons(
              exitCode,
              statusFlags,
              extStatusFlags,
              keyIdObj.value,
              userIdObj.value,
              sigDetailsObj.value,
              errorMsg,
              null, // blockSeparation
              encToDetailsObj.value,
              "buggyMailFormat"
            );
            return;
          }
          node = node.nextSibling;
        }
      }
    }

    EnigmailLog.ERROR(
      "enigmailMessengerOverlay.js: no node found to replace message display\n"
    );
  },

  importAttachedSenderKey() {
    for (let info of Enigmail.msg.attachedSenderEmailKeysIndex) {
      EnigmailKeyRing.importKeyDataWithConfirmation(
        window,
        [info.keyInfo],
        Enigmail.msg.attachedKeys[info.idx],
        true,
        ["0x" + info.keyInfo.fpr]
      );
    }
  },

  async searchSignatureKey() {
    let keyId = document
      .getElementById("signatureKeyBox")
      .getAttribute("keyid");
    if (!keyId) {
      return;
    }
    KeyLookupHelper.lookupAndImportByKeyID(window, keyId, true, null);
  },

  notifySigKeyMissing(keyId) {
    Enigmail.msg.missingSigKey = keyId;
    if (
      Enigmail.msg.allAttachmentsDone &&
      Enigmail.msg.messageDecryptDone &&
      Enigmail.msg.autoProcessPgpKeyAttachmentProcessed ==
        Enigmail.msg.autoProcessPgpKeyAttachmentCount
    ) {
      Enigmail.msg.unhideMissingSigKeyBox();
    } else {
      Enigmail.msg.unhideMissingSigKeyBoxIsTODO = true;
    }
  },

  unhideMissingSigKeyBox() {
    let sigKeyIsAttached = false;
    for (let info of Enigmail.msg.attachedSenderEmailKeysIndex) {
      if (info.keyInfo.keyId == Enigmail.msg.missingSigKey) {
        sigKeyIsAttached = true;
        break;
      }
    }
    if (!sigKeyIsAttached) {
      let b = document.getElementById("signatureKeyBox");
      b.removeAttribute("hidden");
      b.setAttribute("keyid", Enigmail.msg.missingSigKey);
    }
  },

  importKeyFromMsgBody(msgData) {
    let beginIndexObj = {};
    let endIndexObj = {};
    let indentStrObj = {};
    let blockType = EnigmailArmor.locateArmoredBlock(
      msgData,
      0,
      "",
      beginIndexObj,
      endIndexObj,
      indentStrObj
    );
    if (!blockType || blockType !== "PUBLIC KEY BLOCK") {
      return;
    }

    let keyData = msgData.substring(beginIndexObj.value, endIndexObj.value);

    let errorMsgObj = {};
    let preview = EnigmailKey.getKeyListFromKeyBlock(
      keyData,
      errorMsgObj,
      true,
      true,
      false
    );
    if (preview && errorMsgObj.value === "") {
      EnigmailKeyRing.importKeyDataWithConfirmation(
        window,
        preview,
        keyData,
        false
      );
    } else {
      document.l10n.formatValue("preview-failed").then(value => {
        EnigmailDialog.alert(window, value + "\n" + errorMsgObj.value);
      });
    }
  },

  /**
   * Extract the subject from the 1st content line and move it to the subject line
   */
  movePEPsubject() {
    EnigmailLog.DEBUG("enigmailMessengerOverlay.js: movePEPsubject:\n");

    let bodyElement = this.getBodyElement();

    if (
      bodyElement.textContent.search(/^\r?\n?Subject: [^\r\n]+\r?\n\r?\n/i) ===
        0 &&
      "subject" in currentHeaderData &&
      currentHeaderData.subject.headerValue === "pEp"
    ) {
      if (gFolderDisplay.selectedMessage) {
        let m = EnigmailMime.extractSubjectFromBody(bodyElement.textContent);
        if (m) {
          let node = bodyElement.firstChild;
          let found = false;

          while (!found && node) {
            if (node.nodeName == "DIV") {
              node.innerHTML = EnigmailFuncs.formatPlaintextMsg(m.messageBody);
              found = true;
            }
            node = node.nextSibling;
          }

          // if no <DIV> node is found, try with <PRE> (bug 24762)
          node = bodyElement.firstChild;
          while (!found && node) {
            if (node.nodeName == "PRE") {
              node.innerHTML = EnigmailFuncs.formatPlaintextMsg(m.messageBody);
              found = true;
            }
            node = node.nextSibling;
          }

          Enigmail.hdrView.setSubject(m.subject);
        }
      }
    }
  },

  /**
   * Fix broken PGP/MIME messages from MS-Exchange by replacing the broken original
   * message with a fixed copy.
   *
   * no return
   */
  async fixBuggyExchangeMail() {
    EnigmailLog.DEBUG("enigmailMessengerOverlay.js: fixBuggyExchangeMail:\n");

    this.notificationBox.appendNotification(
      await document.l10n.formatValue("openpgp-broken-exchange-wait"),
      "brokenExchangeProgress",
      null,
      this.notificationBox.PRIORITY_INFO_HIGH,
      null
    );

    let msg = gFolderDisplay.messageDisplay.displayedMessage;
    EnigmailFixExchangeMsg.fixExchangeMessage(msg, this.buggyMailType)
      .then(msgKey => {
        // Display the new message which now has the key msgKey.
        EnigmailLog.DEBUG(
          "enigmailMessengerOverlay.js: fixBuggyExchangeMail: _success: msgKey=" +
            msgKey +
            "\n"
        );
        gFolderDisplay.view.dbView.selectMsgByKey(msgKey);
      })
      .catch(async () => {
        EnigmailDialog.alert(
          window,
          await l10n.formatValue("fix-broken-exchange-msg-failed")
        );
      });

    // Remove the brokenExchangeProgress notification at the end of the process.
    this.removeNotification("brokenExchangeProgress");
  },

  /**
   * Hide attachments containing OpenPGP keys
   */
  hidePgpKeys() {
    let keys = [];
    for (let i = 0; i < currentAttachments.length; i++) {
      if (
        currentAttachments[i].contentType.search(/^application\/pgp-keys/i) ===
        0
      ) {
        keys.push(i);
      }
    }

    if (keys.length > 0) {
      let attachmentList = document.getElementById("attachmentList");

      for (let i = keys.length; i > 0; i--) {
        currentAttachments.splice(keys[i - 1], 1);
      }

      if (attachmentList) {
        // delete all keys from attachment list
        while (attachmentList.firstChild) {
          attachmentList.firstChild.remove();
        }

        // build new attachment list

        /* global gBuildAttachmentsForCurrentMsg: true */
        let orig = gBuildAttachmentsForCurrentMsg;
        gBuildAttachmentsForCurrentMsg = false;
        displayAttachmentsForExpandedView();
        gBuildAttachmentsForCurrentMsg = orig;
      }
    }
  },

  /**
   * Attempt to work around bug with headers of MS-Exchange message.
   * Reload message content
   *
   * @return: true:  message displayed
   *          false: could not handle message
   */
  displayBuggyExchangeMail() {
    EnigmailLog.DEBUG(
      "enigmailMessengerOverlay.js: displayBuggyExchangeMail\n"
    );
    let hdrs = Cc["@mozilla.org/messenger/mimeheaders;1"].createInstance(
      Ci.nsIMimeHeaders
    );
    hdrs.initialize(this.buggyExchangeEmailContent);
    let ct = hdrs.extractHeader("content-type", true);

    if (ct && ct.search(/^text\/plain/i) === 0) {
      /* 
      // xxx msgText not really used. It used to be put into
      //  EnigmailURIs.createMessageURI as contentData... but that was also never accessed?
      // 
      let bi = this.buggyExchangeEmailContent.search(/\r?\n/);
      let boundary = this.buggyExchangeEmailContent.substr(2, bi - 2);
      let startMsg = this.buggyExchangeEmailContent.search(/\r?\n\r?\n/);
      let msgText;

      if (this.buggyMailType == "exchange") {
        msgText =
          'Content-Type: multipart/encrypted; protocol="application/pgp-encrypted"; boundary="' +
          boundary +
          '"\r\n' +
          this.buggyExchangeEmailContent.substr(startMsg);
      } else {
        msgText =
          'Content-Type: multipart/encrypted; protocol="application/pgp-encrypted"; boundary="' +
          boundary +
          '"\r\n' +
          "\r\n" +
          boundary +
          "\r\n" +
          "Content-Type: application/pgp-encrypted\r\n" +
          "Content-Description: PGP/MIME version identification\r\n\r\n" +
          "Version: 1\r\n\r\n" +
          this.buggyExchangeEmailContent
            .substr(startMsg)
            .replace(
              /^Content-Type: +application\/pgp-encrypted/im,
              "Content-Type: application/octet-stream"
            );
      }
      */

      let enigmailSvc = Enigmail.getEnigmailSvc();
      if (!enigmailSvc) {
        return false;
      }

      let uri = Services.io.newURI(this.getCurrentMsgUrl());

      EnigmailVerify.setMsgWindow(msgWindow, null);
      messenger.loadURL(window, uri);

      let atv = document.getElementById("attachmentView");
      if (atv) {
        atv.setAttribute("collapsed", "true");
      }

      return true;
    }

    return false;
  },

  // check if the attachment could be encrypted
  checkEncryptedAttach(attachment) {
    return (
      EnigmailMsgRead.getAttachmentName(attachment).match(
        /\.(gpg|pgp|asc)$/i
      ) ||
      (attachment.contentType.match(/^application\/pgp(-.*)?$/i) &&
        attachment.contentType.search(/^application\/pgp-signature/i) < 0)
    );
  },

  getDecryptedMessage(contentType, includeHeaders) {
    EnigmailLog.DEBUG(
      "enigmailMessengerOverlay.js: getDecryptedMessage: " +
        contentType +
        ", " +
        includeHeaders +
        "\n"
    );

    if (!Enigmail.msg.decryptedMessage) {
      return "No decrypted message found!\n";
    }

    var enigmailSvc = Enigmail.getEnigmailSvc();
    if (!enigmailSvc) {
      return "";
    }

    var headerList = Enigmail.msg.decryptedMessage.headerList;
    var statusLine = Enigmail.msg.securityInfo
      ? Enigmail.msg.securityInfo.statusLine
      : "";
    var contentData = "";
    var headerName;

    if (contentType == "message/rfc822") {
      // message/rfc822

      if (includeHeaders) {
        try {
          var msg = gFolderDisplay.selectedMessage;
          if (msg) {
            let msgHdr = {
              From: msg.author,
              Subject: msg.subject,
              To: msg.recipients,
              Cc: msg.ccList,
              Date: new Services.intl.DateTimeFormat(undefined, {
                dateStyle: "short",
                timeStyle: "short",
              }).format(new Date(msg.dateInSeconds * 1000)),
            };

            if (gFolderDisplay.selectedMessageIsNews) {
              if (currentHeaderData.newsgroups) {
                msgHdr.Newsgroups = currentHeaderData.newsgroups.headerValue;
              }
            }

            for (let headerName in msgHdr) {
              if (msgHdr[headerName] && msgHdr[headerName].length > 0) {
                contentData += headerName + ": " + msgHdr[headerName] + "\r\n";
              }
            }
          }
        } catch (ex) {
          // the above seems to fail every now and then
          // so, here is the fallback
          for (let headerName in headerList) {
            let headerValue = headerList[headerName];
            contentData += headerName + ": " + headerValue + "\r\n";
          }
        }

        contentData += "Content-Type: text/plain";

        if (Enigmail.msg.decryptedMessage.charset) {
          contentData += "; charset=" + Enigmail.msg.decryptedMessage.charset;
        }

        contentData += "\r\n";
      }

      contentData += "\r\n";

      if (
        Enigmail.msg.decryptedMessage.hasAttachments &&
        !Enigmail.msg.decryptedMessage.attachmentsEncrypted
      ) {
        contentData += EnigmailData.convertFromUnicode(
          l10n.formatValueSync("enig-content-note") + "\r\n\r\n",
          Enigmail.msg.decryptedMessage.charset
        );
      }

      contentData += Enigmail.msg.decryptedMessage.plainText;
    } else {
      // text/html or text/plain

      if (contentType == "text/html") {
        contentData +=
          '<meta http-equiv="Content-Type" content="text/html; charset=' +
          Enigmail.msg.decryptedMessage.charset +
          '">\r\n';
        contentData += "<html><head></head><body>\r\n";
      }

      if (statusLine) {
        if (contentType == "text/html") {
          contentData +=
            EnigmailMsgRead.escapeTextForHTML(statusLine, false) +
            "<br>\r\n<hr>\r\n";
        } else {
          contentData += statusLine + "\r\n\r\n";
        }
      }

      if (includeHeaders) {
        for (headerName in headerList) {
          let headerValue = headerList[headerName];

          if (headerValue) {
            if (contentType == "text/html") {
              contentData +=
                "<b>" +
                EnigmailMsgRead.escapeTextForHTML(headerName, false) +
                ":</b> " +
                EnigmailMsgRead.escapeTextForHTML(headerValue, false) +
                "<br>\r\n";
            } else {
              contentData += headerName + ": " + headerValue + "\r\n";
            }
          }
        }
      }

      if (contentType == "text/html") {
        contentData +=
          "<pre>" +
          EnigmailMsgRead.escapeTextForHTML(
            Enigmail.msg.decryptedMessage.plainText,
            false
          ) +
          "</pre>\r\n";

        contentData += "</body></html>\r\n";
      } else {
        contentData += "\r\n" + Enigmail.msg.decryptedMessage.plainText;
      }

      if (AppConstants.platform != "win") {
        contentData = contentData.replace(/\r\n/g, "\n");
      }
    }

    return contentData;
  },

  async msgDirectDecrypt(
    interactive,
    importOnly,
    contentEncoding,
    charset,
    signature,
    bufferSize,
    head,
    tail,
    msgUriSpec,
    callbackFunction,
    isAuto
  ) {
    EnigmailLog.WRITE(
      "enigmailMessengerOverlay.js: msgDirectDecrypt: contentEncoding=" +
        contentEncoding +
        ", signature=" +
        signature +
        "\n"
    );
    let mailNewsUrl = this.getCurrentMsgUrl();
    if (!mailNewsUrl) {
      return;
    }

    let PromiseStreamListener = function() {
      this._promise = new Promise((resolve, reject) => {
        this._resolve = resolve;
        this._reject = reject;
      });
      this._data = null;
      this._stream = null;
    };

    PromiseStreamListener.prototype = {
      QueryInterface: ChromeUtils.generateQI(["nsIStreamListener"]),

      onStartRequest(request) {
        this.data = "";
        this.inStream = Cc[
          "@mozilla.org/scriptableinputstream;1"
        ].createInstance(Ci.nsIScriptableInputStream);
      },

      onStopRequest(request, statusCode) {
        if (statusCode != Cr.NS_OK) {
          this._reject(`Streaming failed: ${statusCode}`);
          return;
        }

        let start = this.data.indexOf("-----BEGIN PGP");
        let end = this.data.indexOf("-----END PGP");

        if (start >= 0 && end > start) {
          let tStr = this.data.substr(end);
          let n = tStr.indexOf("\n");
          let r = tStr.indexOf("\r");
          let lEnd = -1;
          if (n >= 0 && r >= 0) {
            lEnd = Math.min(r, n);
          } else if (r >= 0) {
            lEnd = r;
          } else if (n >= 0) {
            lEnd = n;
          }

          if (lEnd >= 0) {
            end += lEnd;
          }

          let data = Enigmail.msg.trimIfEncrypted(
            this.data.substring(start, end + 1)
          );
          EnigmailLog.DEBUG(
            "enigmailMessengerOverlay.js: data: >" + data.substr(0, 100) + "<\n"
          );

          let currentMsgURL = Enigmail.msg.getCurrentMsgUrl();
          let urlSpec = currentMsgURL ? currentMsgURL.spec : "";

          let l = urlSpec.length;
          if (urlSpec.substr(0, l) != mailNewsUrl.spec.substr(0, l)) {
            EnigmailLog.ERROR(
              "enigmailMessengerOverlay.js: Message URL mismatch " +
                currentMsgURL +
                " vs. " +
                urlSpec +
                "\n"
            );
            this._reject(`Msg url mismatch: ${currentMsgURL} vs ${urlSpec}`);
            return;
          }

          Enigmail.msg
            .messageParseCallback(
              data,
              contentEncoding,
              charset,
              interactive,
              importOnly,
              mailNewsUrl.spec,
              signature,
              3,
              head,
              tail,
              msgUriSpec,
              isAuto
            )
            .then(() => this._resolve(this.data));
        }
      },

      onDataAvailable(request, stream, off, count) {
        this.inStream.init(stream);
        this.data += this.inStream.read(count);
      },

      get promise() {
        return this._promise;
      },
    };

    let streamListener = new PromiseStreamListener();
    let msgSvc = messenger.messageServiceFromURI(msgUriSpec);
    msgSvc.streamMessage(
      msgUriSpec,
      streamListener,
      msgWindow,
      null,
      false,
      null,
      false
    );
    await streamListener;
  },

  revealAttachments(index) {
    if (!index) {
      index = 0;
    }

    if (index < currentAttachments.length) {
      this.handleAttachment(
        "revealName/" + index.toString(),
        currentAttachments[index]
      );
    }
  },

  // handle the attachment view toggle
  handleAttchmentEvent() {
    let attList = document.getElementById("attachmentList");

    let clickFunc = function(event) {
      Enigmail.msg.attachmentListClick("attachmentList", event);
    };

    if (attList && attList.itemCount > 0) {
      for (let i = 0; i < attList.itemCount; i++) {
        let att = attList.getItemAtIndex(i);
        att.addEventListener("click", clickFunc, true);
      }
    }
  },

  // handle a selected attachment (decrypt & open or save)
  handleAttachmentSel(actionType, selectedItem = null) {
    if (!BondOpenPGP.isEnabled()) {
      return;
    }

    EnigmailLog.DEBUG(
      "enigmailMessengerOverlay.js: handleAttachmentSel: actionType=" +
        actionType +
        "\n"
    );

    let selectedAttachments, anAttachment, contextMenu;

    // Thunderbird
    contextMenu = document.getElementById("attachmentItemContext");

    if (contextMenu) {
      // Thunderbird
      selectedAttachments = contextMenu.attachments;
      anAttachment = selectedAttachments[0];
    }

    switch (actionType) {
      case "saveAttachment":
      case "openAttachment":
      case "importKey":
      case "revealName":
        this.handleAttachment(actionType, anAttachment);
        break;
      case "verifySig":
        this.verifyDetachedSignature(anAttachment);
        break;
    }
  },

  /**
   * save the original file plus the signature file to disk and then verify the signature
   */
  async verifyDetachedSignature(anAttachment) {
    EnigmailLog.DEBUG(
      "enigmailMessengerOverlay.js: verifyDetachedSignature: url=" +
        anAttachment.url +
        "\n"
    );

    var enigmailSvc = Enigmail.getEnigmailSvc();
    if (!enigmailSvc) {
      return;
    }

    var origAtt, signatureAtt;
    var isEncrypted = false;

    if (
      EnigmailMsgRead.getAttachmentName(anAttachment).search(/\.sig$/i) > 0 ||
      anAttachment.contentType.search(/^application\/pgp-signature/i) === 0
    ) {
      // we have the .sig file; need to know the original file;

      signatureAtt = anAttachment;
      var origName = EnigmailMsgRead.getAttachmentName(anAttachment).replace(
        /\.sig$/i,
        ""
      );

      for (let i = 0; i < currentAttachments.length; i++) {
        if (
          origName == EnigmailMsgRead.getAttachmentName(currentAttachments[i])
        ) {
          origAtt = currentAttachments[i];
          break;
        }
      }

      if (!origAtt) {
        for (let i = 0; i < currentAttachments.length; i++) {
          if (
            origName ==
            EnigmailMsgRead.getAttachmentName(currentAttachments[i]).replace(
              /\.pgp$/i,
              ""
            )
          ) {
            isEncrypted = true;
            origAtt = currentAttachments[i];
            break;
          }
        }
      }
    } else {
      // we have a supposedly original file; need to know the .sig file;

      origAtt = anAttachment;
      var attachName = EnigmailMsgRead.getAttachmentName(anAttachment);
      var sigName = attachName + ".sig";

      for (let i = 0; i < currentAttachments.length; i++) {
        if (
          sigName == EnigmailMsgRead.getAttachmentName(currentAttachments[i])
        ) {
          signatureAtt = currentAttachments[i];
          break;
        }
      }

      if (!signatureAtt && attachName.search(/\.pgp$/i) > 0) {
        sigName = attachName.replace(/\.pgp$/i, ".sig");
        for (let i = 0; i < currentAttachments.length; i++) {
          if (
            sigName == EnigmailMsgRead.getAttachmentName(currentAttachments[i])
          ) {
            isEncrypted = true;
            signatureAtt = currentAttachments[i];
            break;
          }
        }
      }
    }

    if (!signatureAtt) {
      EnigmailDialog.alert(
        window,
        l10n.formatValueSync("attachment-no-match-to-signature", {
          attachment: EnigmailMsgRead.getAttachmentName(origAtt),
        })
      );
      return;
    }
    if (!origAtt) {
      EnigmailDialog.alert(
        window,
        l10n.formatValueSync("attachment-no-match-from-signature", {
          attachment: EnigmailMsgRead.getAttachmentName(signatureAtt),
        })
      );
      return;
    }

    // open
    var tmpDir = EnigmailFiles.getTempDir();
    var outFile1, outFile2;
    outFile1 = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    outFile1.initWithPath(tmpDir);
    if (!(outFile1.isDirectory() && outFile1.isWritable())) {
      EnigmailDialog.alert(window, l10n.formatValueSync("no-temp-dir"));
      return;
    }
    outFile1.append(EnigmailMsgRead.getAttachmentName(origAtt));
    outFile1.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
    EnigmailFiles.writeUrlToFile(origAtt.url, outFile1);

    if (isEncrypted) {
      // Try to decrypt message if we suspect the message is encrypted. If it fails we will just verify the encrypted data.
      EnigmailDecryption.decryptAttachment(
        window,
        outFile1,
        EnigmailMsgRead.getAttachmentName(origAtt),
        EnigmailFiles.readBinaryFile(outFile1),
        {},
        {},
        {}
      );
    }

    outFile2 = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    outFile2.initWithPath(tmpDir);
    outFile2.append(EnigmailMsgRead.getAttachmentName(signatureAtt));
    outFile2.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
    EnigmailFiles.writeUrlToFile(signatureAtt.url, outFile2);

    var promise = EnigmailVerifyAttachment.attachment(outFile1, outFile2);
    promise.then(async function(message) {
      EnigmailDialog.info(
        window,
        l10n.formatValueSync("signature-verified-ok", {
          attachment: EnigmailMsgRead.getAttachmentName(origAtt),
        }) +
          "\n\n" +
          message
      );
    });
    promise.catch(async function(err) {
      EnigmailDialog.alert(
        window,
        l10n.formatValueSync("signature-verify-failed", {
          attachment: EnigmailMsgRead.getAttachmentName(origAtt),
        }) +
          "\n\n" +
          err
      );
    });

    outFile1.remove(false);
    outFile2.remove(false);
  },

  handleAttachment(actionType, anAttachment) {
    EnigmailLog.DEBUG(
      "enigmailMessengerOverlay.js: handleAttachment: actionType=" +
        actionType +
        ", anAttachment(url)=" +
        anAttachment.url +
        "\n"
    );

    var argumentsObj = {
      actionType,
      attachment: anAttachment,
      forceBrowser: false,
      data: "",
    };

    var f = function(data) {
      argumentsObj.data = data;
      Enigmail.msg.decryptAttachmentCallback([argumentsObj]);
    };

    var bufferListener = EnigmailStreams.newStringStreamListener(f);
    var ioServ = Services.io;
    var msgUri = ioServ.newURI(argumentsObj.attachment.url);

    var channel = EnigmailStreams.createChannel(msgUri);
    channel.asyncOpen(bufferListener, msgUri);
  },

  setAttachmentName(attachment, newLabel, index) {
    EnigmailLog.DEBUG(
      "enigmailMessengerOverlay.js: setAttachmentName (" + newLabel + "):\n"
    );

    var attList = document.getElementById("attachmentList");
    if (attList) {
      var attNode = attList.firstChild;
      while (attNode) {
        if (attNode.getAttribute("name") == attachment.name) {
          attNode.setAttribute("name", newLabel);
        }
        attNode = attNode.nextSibling;
      }
    }

    if (typeof attachment.displayName == "undefined") {
      attachment.name = newLabel;
    } else {
      attachment.displayName = newLabel;
    }

    if (index && index.length > 0) {
      this.revealAttachments(parseInt(index, 10) + 1);
    }
  },

  async decryptAttachmentCallback(cbArray) {
    EnigmailLog.DEBUG(
      "enigmailMessengerOverlay.js: decryptAttachmentCallback:\n"
    );

    var callbackArg = cbArray[0];

    var exitCodeObj = {};
    var statusFlagsObj = {};
    var errorMsgObj = {};
    var exitStatus = -1;

    var outFile;
    var origFilename;
    var rawFileName = EnigmailMsgRead.getAttachmentName(
      callbackArg.attachment
    ).replace(/\.(asc|pgp|gpg)$/i, "");

    // TODO: We don't have code yet to extract the original filename
    // from an encrypted data block.
    /*
    if (callbackArg.actionType != "importKey") {
      origFilename = EnigmailAttachment.getFileName(window, callbackArg.data);
      if (origFilename && origFilename.length > rawFileName.length) {
        rawFileName = origFilename;
      }
    }
    */

    if (callbackArg.actionType == "saveAttachment") {
      outFile = EnigmailDialog.filePicker(
        window,
        l10n.formatValueSync("save-attachment-header"),
        Enigmail.msg.lastSaveDir,
        true,
        false,
        "",
        rawFileName,
        null
      );
      if (!outFile) {
        return;
      }
    } else if (callbackArg.actionType.substr(0, 10) == "revealName") {
      if (origFilename && origFilename.length > 0) {
        Enigmail.msg.setAttachmentName(
          callbackArg.attachment,
          origFilename + ".pgp",
          callbackArg.actionType.substr(11, 10)
        );
      }
      Enigmail.msg.setAttachmentReveal(null);
      return;
    } else {
      // open
      var tmpDir = EnigmailFiles.getTempDir();
      try {
        outFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
        outFile.initWithPath(tmpDir);
        if (!(outFile.isDirectory() && outFile.isWritable())) {
          errorMsgObj.value = l10n.formatValueSync("no-temp-dir");
          return;
        }
        outFile.append(rawFileName);
        outFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
      } catch (ex) {
        errorMsgObj.value = l10n.formatValueSync("no-temp-dir");
        return;
      }
    }

    if (callbackArg.actionType == "importKey") {
      var preview = EnigmailKey.getKeyListFromKeyBlock(
        callbackArg.data,
        errorMsgObj,
        true,
        true,
        false
      );

      if (errorMsgObj.value !== "" || !preview || preview.length === 0) {
        // try decrypting the attachment
        exitStatus = EnigmailDecryption.decryptAttachment(
          window,
          outFile,
          EnigmailMsgRead.getAttachmentName(callbackArg.attachment),
          callbackArg.data,
          exitCodeObj,
          statusFlagsObj,
          errorMsgObj
        );
        if (exitStatus && exitCodeObj.value === 0) {
          // success decrypting, let's try again
          callbackArg.data = EnigmailFiles.readBinaryFile(outFile);
          preview = EnigmailKey.getKeyListFromKeyBlock(
            callbackArg.data,
            errorMsgObj,
            true,
            true,
            false
          );
        }
      }

      if (preview && errorMsgObj.value === "") {
        EnigmailKeyRing.importKeyDataWithConfirmation(
          window,
          preview,
          callbackArg.data,
          false
        );
      } else {
        document.l10n.formatValue("preview-failed").then(value => {
          EnigmailDialog.alert(window, value + "\n" + errorMsgObj.value);
        });
      }
      outFile.remove(true);
      return;
    }

    exitStatus = EnigmailDecryption.decryptAttachment(
      window,
      outFile,
      EnigmailMsgRead.getAttachmentName(callbackArg.attachment),
      callbackArg.data,
      exitCodeObj,
      statusFlagsObj,
      errorMsgObj
    );

    if (!exitStatus || exitCodeObj.value !== 0) {
      exitStatus = false;
      if (
        statusFlagsObj.value & EnigmailConstants.DECRYPTION_OKAY &&
        statusFlagsObj.value & EnigmailConstants.UNCERTAIN_SIGNATURE
      ) {
        if (callbackArg.actionType == "openAttachment") {
          let [title, button] = await document.l10n.formatValues([
            { id: "decrypt-ok-no-sig" },
            { id: "msg-ovl-button-cont-anyway" },
          ]);

          exitStatus = EnigmailDialog.confirmDlg(window, title, button);
        } else {
          EnigmailDialog.info(
            window,
            await document.l10n.formatValue("decrypt-ok-no-sig")
          );
        }
      } else {
        let msg = await document.l10n.formatValue("failed-decrypt");
        if (errorMsgObj.errorMsg) {
          msg += "\n\n" + errorMsgObj.errorMsg;
        }
        EnigmailDialog.info(window, msg);
        exitStatus = false;
      }
    }
    if (exitStatus) {
      if (statusFlagsObj.value & EnigmailConstants.IMPORTED_KEY) {
        if (exitCodeObj.keyList) {
          let importKeyList = exitCodeObj.keyList.map(function(a) {
            return a.id;
          });
          EnigmailDialog.keyImportDlg(window, importKeyList);
        }
      } else if (statusFlagsObj.value & EnigmailConstants.DISPLAY_MESSAGE) {
        HandleSelectedAttachments("open");
      } else if (
        statusFlagsObj.value & EnigmailConstants.DISPLAY_MESSAGE ||
        callbackArg.actionType == "openAttachment"
      ) {
        var ioServ = Services.io;
        var outFileUri = ioServ.newFileURI(outFile);
        var fileExt = outFile.leafName.replace(/(.*\.)(\w+)$/, "$2");
        if (fileExt && !callbackArg.forceBrowser) {
          var extAppLauncher = Cc["@mozilla.org/mime;1"].getService(
            Ci.nsPIExternalAppLauncher
          );
          extAppLauncher.deleteTemporaryFileOnExit(outFile);

          try {
            var mimeService = Cc["@mozilla.org/mime;1"].getService(
              Ci.nsIMIMEService
            );
            var fileMimeType = mimeService.getTypeFromFile(outFile);
            var fileMimeInfo = mimeService.getFromTypeAndExtension(
              fileMimeType,
              fileExt
            );

            fileMimeInfo.launchWithFile(outFile);
          } catch (ex) {
            // if the attachment file type is unknown, an exception is thrown,
            // so let it be handled by a browser window
            Enigmail.msg.loadExternalURL(outFileUri.asciiSpec);
          }
        } else {
          // open the attachment using an external application
          Enigmail.msg.loadExternalURL(outFileUri.asciiSpec);
        }
      }
    }
  },

  loadExternalURL(url) {
    messenger.launchExternalURL(url);
  },

  // retrieves the most recent navigator window (opens one if need be)
  loadURLInNavigatorWindow(url, aOpenFlag) {
    EnigmailLog.DEBUG(
      "enigmailMessengerOverlay.js: loadURLInNavigatorWindow: " +
        url +
        ", " +
        aOpenFlag +
        "\n"
    );

    var navWindow;

    // if this is a browser window, just use it
    if ("document" in top) {
      var possibleNavigator = top.document.getElementById("main-window");
      if (
        possibleNavigator &&
        possibleNavigator.getAttribute("windowtype") == "navigator:browser"
      ) {
        navWindow = top;
      }
    }

    // if not, get the most recently used browser window
    if (!navWindow) {
      var wm = Services.wm;
      navWindow = wm.getMostRecentWindow("navigator:browser");
    }

    if (navWindow) {
      if ("loadURI" in navWindow) {
        navWindow.loadURI(url);
      } else {
        navWindow._content.location.href = url;
      }
    } else if (aOpenFlag) {
      // if no browser window available and it's ok to open a new one, do so
      navWindow = window.open(url, "Enigmail");
    }

    EnigmailLog.DEBUG(
      "enigmailMessengerOverlay.js: loadURLInNavigatorWindow: navWindow=" +
        navWindow +
        "\n"
    );

    return navWindow;
  },

  // handle double click events on Attachments
  attachmentListClick(elementId, event) {
    EnigmailLog.DEBUG(
      "enigmailMessengerOverlay.js: attachmentListClick: event=" + event + "\n"
    );

    var attachment = event.target.attachment;
    if (this.checkEncryptedAttach(attachment)) {
      if (event.button === 0 && event.detail == 2) {
        // double click
        this.handleAttachment("openAttachment", attachment);
        event.stopPropagation();
      }
    }
  },

  // create a decrypted copy of all selected messages in a target folder

  decryptToFolder(destFolder) {
    let msgHdrs = gFolderDisplay ? gFolderDisplay.selectedMessages : null;
    if (!msgHdrs || msgHdrs.length === 0) {
      return;
    }

    EnigmailPersistentCrypto.dispatchMessages(
      msgHdrs,
      destFolder.URI,
      false,
      false
    );
  },

  async searchKeysOnInternet(aHeaderNode) {
    let address = aHeaderNode
      .closest("mail-emailaddress")
      .getAttribute("emailAddress");

    KeyLookupHelper.lookupAndImportByEmail(window, address, true, null);
  },

  importKeyFromKeyserver() {
    var pubKeyId = "0x" + Enigmail.msg.securityInfo.keyId;
    var inputObj = {
      searchList: [pubKeyId],
      autoKeyServer: Services.prefs.getBoolPref(
        "temp.openpgp.autoKeyServerSelection"
      )
        ? Services.prefs
            .getCharPref("temp.openpgp.keyserver")
            .split(/[ ,;]/g)[0]
        : null,
    };
    var resultObj = {};
    EnigmailWindows.downloadKeys(window, inputObj, resultObj);

    if (resultObj.importedKeys > 0) {
      return true;
    }

    return false;
  },

  /**
   * Create an artificial Autocrypt: header if there was no such header on the message
   * and the message was signed
   */
  /*
  createArtificialAutocryptHeader() {
    EnigmailLog.DEBUG(
      "enigmailMessengerOverlay.js: createArtificialAutocryptHeader\n"
    );

    if ("autocrypt" in currentHeaderData) {
      return;
    }

    let created = false;
    let dateValue = "",
      fromValue = "";

    if ("date" in currentHeaderData) {
      dateValue = currentHeaderData.date.headerValue;
    }
    if ("from" in currentHeaderData) {
      fromValue = currentHeaderData.from.headerValue;
    }

    if (Enigmail.msg.securityInfo && Enigmail.msg.securityInfo.statusFlags) {
      let securityInfo = Enigmail.msg.securityInfo;
      let keyObj = EnigmailKeyRing.getKeyById(securityInfo.keyId);
      if (keyObj && keyObj.getEncryptionValidity().keyValid) {
        if (securityInfo.statusFlags & EnigmailConstants.GOOD_SIGNATURE) {
          let hdrData =
            "addr=" +
            EnigmailFuncs.stripEmail(fromValue) +
            (securityInfo.statusFlags & EnigmailConstants.DECRYPTION_OKAY ||
            securityInfo.statusFlags & EnigmailConstants.PGP_MIME_ENCRYPTED
              ? "; prefer-encrypt=mutual"
              : "") +
            "; _enigmail_artificial=yes; _enigmail_fpr=" +
            keyObj.fpr +
            '; keydata="LQ=="';

          created = true;

          EnigmailAutocrypt.processAutocryptHeader(
            fromValue,
            [hdrData],
            dateValue,
            Enigmail.msg.isAutocryptEnabled()
          );
        }
      }
    }

    if (!created) {
      let hdrData =
        "addr=" +
        EnigmailFuncs.stripEmail(fromValue) +
        '; prefer-encrypt=reset; _enigmail_artificial=yes; keydata="LQ=="';

      EnigmailAutocrypt.processAutocryptHeader(
        fromValue,
        [hdrData],
        dateValue,
        Enigmail.msg.isAutocryptEnabled()
      );
    }
  },
  */

  /*
  flexActionRequest() {
    switch (Enigmail.msg.securityInfo.xtraStatus) {
      case "wks-request":
        this.confirmWksRequest();
        break;
      case "autocrypt-setup":
        this.performAutocryptSetup();
        break;
      case "process-manually":
        this.messageDecrypt(null, false);
        break;
    }
  },
  */

  /*
  confirmWksRequest() {
    EnigmailLog.DEBUG("enigmailMessengerOverlay.js: confirmWksRequest()\n");
    try {
      var msg = gFolderDisplay.selectedMessage;
      if (!(!msg || !msg.folder)) {
        var msgHdr = msg.folder.GetMessageHeader(msg.messageKey);
        let email = EnigmailFuncs.stripEmail(msgHdr.recipients);
        let maybeIdent = EnigmailStdlib.getIdentityForEmail(email);

        if (maybeIdent && maybeIdent.identity) {
          EnigmailStdlib.msgHdrsModifyRaw([msgHdr], function(data) {
            EnigmailWks.confirmKey(maybeIdent.identity, data, window, function(
              ret
            ) {
              if (ret) {
                EnigmailDialog.info(
                  window,
                  "Confirmation email sent."
                );
              } else {
                EnigmailDialog.alert(
                  window,
                  "Sending the confirmation email failed."
                );
              }
            });
            return null;
          });
        } else {
          EnigmailDialog.alert(
            window,
            "This key is not linked to any of your email accounts. Please add an account for at least one of the following email addresse(s):\n\n%S".replace("%S", email)
          );
        }
      }
    } catch (e) {
      EnigmailLog.DEBUG(e + "\n");
    }
  },
  */

  performAutocryptSetup(passwd = null) {
    EnigmailLog.DEBUG("enigmailMessengerOverlay.js: performAutocryptSetup()\n");

    EnigmailDialog.alert(
      window,
      "EnigmailAutocrypt.handleBackupMessage not implemented"
    );
  },

  onUnloadEnigmail() {
    //EnigmailLog.DEBUG("enigmailMessengerOverlay.js: onUnloadEnigmail()\n");

    window.removeEventListener("unload", Enigmail.msg.messengerClose);
    window.removeEventListener(
      "unload-enigmail",
      Enigmail.msg.onUnloadEnigmail
    );
    window.removeEventListener("load-enigmail", Enigmail.msg.messengerStartup);

    this.messageCleanup();

    if (this.messagePane) {
      this.messagePane.removeEventListener(
        "unload",
        Enigmail.msg.messageFrameUnload,
        true
      );
    }

    for (let c of this.changedAttributes) {
      let elem = document.getElementById(c.id);
      if (elem) {
        elem.setAttribute(c.attrib, c.value);
      }
    }

    if (this.treeController) {
      top.controllers.removeController(this.treeController);
    }

    for (let i = 0; i < gMessageListeners.length; i++) {
      if (gMessageListeners[i] === Enigmail.msg.messageListener) {
        gMessageListeners.splice(i, 1);
        break;
      }
    }
    this.messengerClose();

    if (Enigmail.columnHandler) {
      Enigmail.columnHandler.onUnloadEnigmail();
    }
    if (Enigmail.hdrView) {
      Enigmail.hdrView.onUnloadEnigmail();
    }

    Enigmail = undefined;
  },

  commonProcessAttachedKey(keyData, isBinaryAutocrypt) {
    if (!keyData) {
      return;
    }
    let errorMsgObj = {};
    let preview = EnigmailKey.getKeyListFromKeyBlock(
      keyData,
      errorMsgObj,
      true,
      true,
      false
    );

    if (!preview || !preview.length || errorMsgObj.value) {
      return;
    }

    this.fetchAuthorEmail();

    let addedToIndex = false;
    let nextIndex = Enigmail.msg.attachedKeys.length;

    for (let newKey of preview) {
      let oldKey = EnigmailKeyRing.getKeyById(newKey.fpr);
      if (!oldKey) {
        if (newKey.keyTrust == "r" || newKey.keyTrust == "e") {
          continue;
        }

        if (!this.hasUserIdForEmail(newKey.userIds, this.authorEmail)) {
          continue;
        }

        let info = {
          fpr: "0x" + newKey.fpr,
          idx: nextIndex,
          keyInfo: newKey,
          binary: isBinaryAutocrypt,
        };
        Enigmail.msg.attachedSenderEmailKeysIndex.push(info);
        addedToIndex = true;
        continue;
      }

      if (oldKey.keyCreated != newKey.keyCreated) {
        continue;
      }

      let newHasNewValidity =
        oldKey.expiryTime < newKey.expiryTime ||
        (oldKey.keyTrust != "r" && newKey.keyTrust == "r");

      if (!newHasNewValidity) {
        continue;
      }

      if (
        !EnigmailKeyRing.importKeyDataSilent(
          window,
          keyData,
          isBinaryAutocrypt,
          "0x" + newKey.fpr
        )
      ) {
        console.debug(
          "EnigmailKeyRing.importKeyDataSilent failed 0x" + newKey.fpr
        );
      }
    }

    if (addedToIndex) {
      Enigmail.msg.attachedKeys.push(keyData);
    }
  },

  /**
   * Show the import key notification.
   */
  async unhideImportKeyBox() {
    // If the crypto button area is still collapsed it means the message wasn't
    // encrypted and doesn't have a signature, but since we have an autocrypt
    // header, we need to show the button to allow users to access the info.
    let cryptoBox = document.getElementById("cryptoBox");
    if (cryptoBox.collapsed) {
      cryptoBox.collapsed = false;
      cryptoBox.setAttribute("tech", "OpenPGP");
      document
        .getElementById("encryptionTechBtn")
        .querySelector("span").textContent = "OpenPGP";
    }

    // Check if the proposed key to import was previously accepted.
    let hasAreadyAcceptedOther = await PgpSqliteDb2.hasAnyPositivelyAcceptedKeyForEmail(
      Enigmail.msg.authorEmail
    );
    if (hasAreadyAcceptedOther) {
      let conflictDescription = document.getElementById(
        "hasConflictingKeyOpenPGP"
      );
      document.l10n.setAttributes(
        conflictDescription,
        "openpgp-be-careful-new-key",
        { email: Enigmail.msg.authorEmail }
      );
      conflictDescription.removeAttribute("hidden");
    }

    document.getElementById("openpgpKeyBox").removeAttribute("hidden");
  },

  async processAfterAttachmentsAndDecrypt() {
    if (!Enigmail.msg.allAttachmentsDone || !Enigmail.msg.messageDecryptDone) {
      return;
    }

    if (
      Enigmail.msg.autoProcessPgpKeyAttachmentProcessed <
      Enigmail.msg.autoProcessPgpKeyAttachmentCount
    ) {
      return;
    }

    if (Enigmail.msg.unhideMissingSigKeyBoxIsTODO) {
      Enigmail.msg.unhideMissingSigKeyBox();
    }

    // We have already processed all attached pgp-keys, we're ready
    // to make final decisions on how to notify the user about
    // available or missing keys.

    if (Enigmail.msg.attachedSenderEmailKeysIndex.length) {
      this.unhideImportKeyBox();
      // If we already found a good key for the sender's email
      // in attachments, then ignore the autocrypt header.
      return;
    }

    let senderAutocryptKey = null;
    if (
      Enigmail.msg.savedHeaders &&
      "autocrypt" in Enigmail.msg.savedHeaders &&
      Enigmail.msg.savedHeaders.autocrypt.length > 0 &&
      "from" in currentHeaderData
    ) {
      senderAutocryptKey = EnigmailAutocrypt.getKeyFromHeader(
        currentHeaderData.from.headerValue,
        Enigmail.msg.savedHeaders.autocrypt
      );
    }

    if (!senderAutocryptKey) {
      return;
    }

    let keyData = EnigmailData.decodeBase64(senderAutocryptKey);
    this.commonProcessAttachedKey(keyData, true);

    if (Enigmail.msg.attachedSenderEmailKeysIndex.length) {
      this.unhideImportKeyBox();
    }
  },

  async notifyEndAllAttachments() {
    Enigmail.msg.allAttachmentsDone = true;

    if (!Enigmail.msg.autoProcessPgpKeyAttachmentCount) {
      Enigmail.msg.processAfterAttachmentsAndDecrypt();
    }
  },

  authorEmailFetched: false,
  authorEmail: "",
  attachedKeys: [],
  attachedSenderEmailKeysIndex: [], // each: {idx (to-attachedKeys), keyInfo, binary}

  fetchAuthorEmail() {
    if (this.authorEmailFetched) {
      return;
    }

    // This message may have already disappeared.
    if (!gMessageDisplay.displayedMessage) {
      return;
    }

    this.authorEmailFetched = true;

    let addresses = MailServices.headerParser.parseEncodedHeader(
      gMessageDisplay.displayedMessage.author
    );
    if (!addresses.length) {
      return;
    }

    this.authorEmail = addresses[0].email;
  },

  hasUserIdForEmail(userIds, authorEmail) {
    authorEmail = authorEmail.toLowerCase();

    for (let id of userIds) {
      if (id.type !== "uid") {
        continue;
      }

      if (
        EnigmailFuncs.getEmailFromUserID(id.userId).toLowerCase() == authorEmail
      ) {
        return true;
      }
    }
    return false;
  },

  async autoProcessPgpKeyCallback(callbackArg) {
    if (
      callbackArg.transaction !=
      Enigmail.msg.autoProcessPgpKeyAttachmentTransactionID
    ) {
      return;
    }

    this.commonProcessAttachedKey(callbackArg.data, false);

    Enigmail.msg.autoProcessPgpKeyAttachmentProcessed++;

    if (
      Enigmail.msg.autoProcessPgpKeyAttachmentProcessed ==
      Enigmail.msg.autoProcessPgpKeyAttachmentCount
    ) {
      Enigmail.msg.processAfterAttachmentsAndDecrypt();
    }
  },

  autoProcessPgpKeyAttachmentTransactionID: 0,
  autoProcessPgpKeyAttachmentCount: 0,
  autoProcessPgpKeyAttachmentProcessed: 0,
  unhideMissingSigKeyBoxIsTODO: false,
  unhideMissingSigKey: null,

  autoProcessPgpKeyAttachment(attachment) {
    if (attachment.contentType != "application/pgp-keys") {
      return;
    }

    Enigmail.msg.autoProcessPgpKeyAttachmentCount++;

    var argumentsObj = {
      attachment,
      data: "",
      transaction: Enigmail.msg.autoProcessPgpKeyAttachmentTransactionID,
    };

    var bufferListener = EnigmailStreams.newStringStreamListener(data => {
      argumentsObj.data = data;
      Enigmail.msg.autoProcessPgpKeyCallback(argumentsObj);
    });
    var msgUri = Services.io.newURI(argumentsObj.attachment.url);

    var channel = EnigmailStreams.createChannel(msgUri);
    channel.asyncOpen(bufferListener, msgUri);
  },
};

window.addEventListener(
  "load-enigmail",
  Enigmail.msg.messengerStartup.bind(Enigmail.msg)
);
window.addEventListener(
  "unload",
  Enigmail.msg.messengerClose.bind(Enigmail.msg)
);
window.addEventListener(
  "unload-enigmail",
  Enigmail.msg.onUnloadEnigmail.bind(Enigmail.msg)
);
