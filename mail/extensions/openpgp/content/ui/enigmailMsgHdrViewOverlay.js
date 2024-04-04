/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from ../../../../base/content/aboutMessage.js */
/* import-globals-from ../../../../base/content/msgHdrView.js */
/* import-globals-from ../../../smime/content/msgHdrViewSMIMEOverlay.js */

/* eslint-enable valid-jsdoc */

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  EnigmailConstants: "chrome://openpgp/content/modules/constants.sys.mjs",
  EnigmailCore: "chrome://openpgp/content/modules/core.sys.mjs",
  EnigmailDialog: "chrome://openpgp/content/modules/dialog.sys.mjs",
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.sys.mjs",
  EnigmailKey: "chrome://openpgp/content/modules/key.sys.mjs",
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.sys.mjs",
  EnigmailMime: "chrome://openpgp/content/modules/mime.sys.mjs",
  EnigmailMsgRead: "chrome://openpgp/content/modules/msgRead.sys.mjs",
  EnigmailSingletons: "chrome://openpgp/content/modules/singletons.sys.mjs",
  EnigmailURIs: "chrome://openpgp/content/modules/uris.sys.mjs",
  EnigmailVerify: "chrome://openpgp/content/modules/mimeVerify.sys.mjs",
  EnigmailWindows: "chrome://openpgp/content/modules/windows.sys.mjs",
});

Enigmail.hdrView = {
  lastEncryptedMsgKey: null,
  lastEncryptedUri: null,
  flexbuttonAction: null,

  msgSignedStateString: null,
  msgEncryptedStateString: null,
  msgSignatureState: EnigmailConstants.MSG_SIG_NONE,
  msgEncryptionState: EnigmailConstants.MSG_ENC_NONE,
  msgSignatureKeyId: "",
  msgSignatureDate: null,
  msgEncryptionKeyId: null,
  msgEncryptionAllKeyIds: null,
  msgHasKeyAttached: false,

  ignoreStatusFromMimePart: "",
  receivedStatusFromParts: new Set(),
  packetDump: "",

  reset() {
    this.msgSignedStateString = null;
    this.msgEncryptedStateString = null;
    this.msgSignatureState = EnigmailConstants.MSG_SIG_NONE;
    this.msgEncryptionState = EnigmailConstants.MSG_ENC_NONE;
    this.msgSignatureKeyId = "";
    this.msgSignatureDate = null;
    this.msgEncryptionKeyId = null;
    this.msgEncryptionAllKeyIds = null;
    this.msgHasKeyAttached = false;
    for (const value of ["decryptionFailed", "brokenExchange"]) {
      Enigmail.msg.removeNotification(value);
    }
    this.ignoreStatusFromMimePart = "";
    this.receivedStatusFromParts = new Set();
    this.packetDump = "";
  },

  hdrViewLoad() {
    this.msgHdrViewLoad();
    const attCtx = document.getElementById("attachmentItemContext");
    if (attCtx) {
      attCtx.addEventListener(
        "popupshowing",
        this.onShowAttachmentContextMenu.bind(Enigmail.hdrView)
      );
    }
  },

  statusBarHide() {
    /* elements might not have been set yet, so we try and ignore */
    try {
      this.reset();
      if (Enigmail.msg.securityInfo) {
        Enigmail.msg.securityInfo.statusFlags = 0;
      }

      const bodyElement = document.getElementById("messagepane");
      bodyElement.removeAttribute("collapsed");
    } catch (ex) {
      console.warn(ex);
    }
  },

  updatePgpStatus(
    exitCode,
    statusFlags,
    extStatusFlags,
    keyId,
    userId,
    sigDetails,
    errorMsg,
    blockSeparation,
    extraDetails,
    mimePartNumber
  ) {
    if (errorMsg) {
      console.warn(`OpenPGP status: ${errorMsg}`);
    }

    if (gMessageURI) {
      this.lastEncryptedMsgKey = gMessageURI;
    }

    if (exitCode == EnigmailConstants.POSSIBLE_PGPMIME) {
      exitCode = 0;
    }

    let encryptedMimePart = "";
    if (statusFlags & EnigmailConstants.PGP_MIME_ENCRYPTED) {
      encryptedMimePart = mimePartNumber;
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
      // unhandled status IMPORTED_KEY
      statusFlags &= ~EnigmailConstants.IMPORTED_KEY;
    }

    // TODO: visualize the following signature attributes,
    // cross-check with corresponding email attributes
    // - date
    // - signer uid
    // - signer key
    // - signing and hash alg

    this.msgSignatureKeyId = keyId;

    if (extraDetails) {
      const o = JSON.parse(extraDetails);
      if ("encryptedTo" in o) {
        this.msgEncryptionKeyId = o.encryptedTo.myRecipKey;
        this.msgEncryptionAllKeyIds = o.encryptedTo.allRecipKeys;
      }
      if ("packetDump" in o && o.packetDump) {
        this.packetDump = o.packetDump;
      }
    }

    this.msgSignatureDate = sigDetails?.sigDate;

    Enigmail.msg.securityInfo = {
      statusFlags,
      extStatusFlags,
      keyId,
      userId,
      msgSigned,
      blockSeparation,
      extraDetails,
      encryptedMimePart,
    };

    //Enigmail.msg.createArtificialAutocryptHeader();

    /*
    if (statusFlags & EnigmailConstants.UNCERTAIN_SIGNATURE) {
      this.tryImportAutocryptHeader();
    }
    */

    this.updateStatusFlags(mimePartNumber);
    this.updateMsgDb();
  },

  /**
   * Update the various variables that track the OpenPGP status of
   * the current message.
   *
   * @param {string} triggeredByMimePartNumber - the MIME part that
   *   was processed and has triggered this status update request.
   */
  async updateStatusFlags(triggeredByMimePartNumber) {
    const secInfo = Enigmail.msg.securityInfo;
    const statusFlags = secInfo.statusFlags;
    const extStatusFlags =
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
        await Enigmail.msg.notificationBox.appendNotification(
          "decryptionFailed",
          {
            label: await document.l10n.formatValue(infoId),
            image: "chrome://global/skin/icons/warning.svg",
            priority: Enigmail.msg.notificationBox.PRIORITY_CRITICAL_MEDIUM,
          },
          null
        );
      }

      this.msgSignatureState = EnigmailConstants.MSG_SIG_NONE;
    } else if (statusFlags & EnigmailConstants.DECRYPTION_OKAY) {
      EnigmailURIs.rememberEncryptedUri(this.lastEncryptedMsgKey);
      encrypted = "ok";
      this.msgEncryptionState = EnigmailConstants.MSG_ENC_OK;
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
      } else if (extStatusFlags & EnigmailConstants.EXT_SIGNING_TIME_MISMATCH) {
        this.msgSignatureState =
          EnigmailConstants.MSG_SIG_INVALID_DATE_MISMATCH;
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
    this.updateVisibleSecurityStatus(triggeredByMimePartNumber);

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

  /**
   * Should be called as soon as it is known that the message has
   * an OpenPGP key attached.
   */
  notifyHasKeyAttached() {
    this.msgHasKeyAttached = true;
    this.updateVisibleSecurityStatus();
  },

  /**
   * Should be called whenever more information about the OpenPGP
   * message state became available, such as encryption or signature
   * status, or the availability of an attached key.
   *
   * @param {string} [triggeredByMimePartNumber] - Number of the
   *   MIME part that was processed and has triggered this status update
   *   request.
   */
  updateVisibleSecurityStatus(triggeredByMimePartNumber = undefined) {
    setMessageCryptoBox(
      "OpenPGP",
      this.msgEncryptedStateString,
      this.msgSignedStateString,
      this.msgHasKeyAttached,
      triggeredByMimePartNumber
    );
  },

  editKeyExpiry() {
    EnigmailWindows.editKeyExpiry(
      window,
      [Enigmail.msg.securityInfo.userId],
      [Enigmail.msg.securityInfo.keyId]
    );
    ReloadMessage();
  },

  editKeyTrust() {
    const key = EnigmailKeyRing.getKeyById(Enigmail.msg.securityInfo.keyId);

    EnigmailWindows.editKeyTrust(
      window,
      [Enigmail.msg.securityInfo.userId],
      [key.keyId]
    );
    ReloadMessage();
  },

  signKey() {
    const key = EnigmailKeyRing.getKeyById(Enigmail.msg.securityInfo.keyId);

    EnigmailWindows.signKey(
      window,
      Enigmail.msg.securityInfo.userId,
      key.keyId,
      null
    );
    ReloadMessage();
  },

  msgHdrViewLoad() {
    this.messageListener = {
      onStartHeaders() {
        Enigmail.hdrView.statusBarHide();
        EnigmailVerify.setLastMsgUri(Enigmail.msg.getCurrentMsgUriSpec());

        const msgFrame = document.getElementById("messagepane").contentDocument;

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
      },

      onEndHeaders() {},

      onEndAttachments() {
        try {
          EnigmailVerify.setLastMsgUri(null);
        } catch (ex) {}

        Enigmail.hdrView.messageLoad();
      },

      beforeStartHeaders() {
        return true;
      },
    };

    gMessageListeners.push(this.messageListener);

    // fire the handlers since some windows open directly with a visible message
    this.messageListener.onStartHeaders();
    this.messageListener.onEndAttachments();
  },

  messageUnload() {
    if (Enigmail.hdrView.flexbuttonAction === null) {
      this.forgetEncryptedMsgKey();
    }
  },

  async messageLoad() {
    await Enigmail.msg.messageDecrypt(null, true);
    Enigmail.msg.handleAttachmentEvent();
  },

  dispKeyDetails() {
    if (!Enigmail.msg.securityInfo) {
      return;
    }

    const key = EnigmailKeyRing.getKeyById(Enigmail.msg.securityInfo.keyId);

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

  onShowAttachmentContextMenu() {
    const contextMenu = document.getElementById("attachmentItemContext");
    const separator = document.getElementById("openpgpCtxItemsSeparator");
    const decryptOpenMenu = document.getElementById("enigmail_ctxDecryptOpen");
    const decryptSaveMenu = document.getElementById("enigmail_ctxDecryptSave");
    const importMenu = document.getElementById("enigmail_ctxImportKey");
    const verifyMenu = document.getElementById("enigmail_ctxVerifyAtt");

    if (contextMenu.attachments.length == 1) {
      const attachment = contextMenu.attachments[0];

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

      separator.hidden =
        decryptOpenMenu.hidden &&
        decryptSaveMenu.hidden &&
        importMenu.hidden &&
        verifyMenu.hidden;
    } else {
      decryptOpenMenu.hidden = true;
      decryptSaveMenu.hidden = true;
      importMenu.hidden = true;
      verifyMenu.hidden = true;
      separator.hidden = true;
    }
  },

  updateMsgDb() {
    var msg = gMessage;
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
    let canDetach = true;
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

  /**
   * Modify the subject (got from encrypted headers).
   *
   * @param {string} subject - Subject.
   * @param {nsIMsgDBHdr} hdr - The message we're setting subject for.
   */
  setSubject(subject, hdr) {
    // Strip multiple localized Re: prefixes. This emulates NS_MsgStripRE().
    const prefixes = Services.prefs
      .getComplexValue("mailnews.localizedRe", Ci.nsIPrefLocalizedString)
      .data.split(",")
      .filter(Boolean);
    if (!prefixes.includes("Re")) {
      prefixes.push("Re");
    }
    // Construct a regular expression like this: ^(Re: |Aw: )+
    let newSubject = subject.replace(
      new RegExp(`^(${prefixes.join(": |")}: )+`, "i"),
      ""
    );
    const hadRe = newSubject != subject;

    // Update the message.
    hdr.subject = newSubject;
    const oldFlags = gMessage.flags;
    if (hadRe) {
      hdr.flags |= Ci.nsMsgMessageFlags.HasRe;
      newSubject = "Re: " + newSubject;
    }

    if (hdr == gMessage) {
      document.title = newSubject;
      currentHeaderData.subject.headerValue = newSubject;
      document.getElementById("expandedsubjectBox").headerValue = newSubject;
    }

    // This even works if the flags haven't changed. Causes repaint in all thread trees.
    hdr.folder?.msgDatabase.notifyHdrChangeAll(hdr, oldFlags, hdr.flags, {});
  },

  updateHdrBox(header, value) {
    const e = document.getElementById("expanded" + header + "Box");
    if (e) {
      e.headerValue = value;
    }
  },
};

/** @implements {nsIMsgOpenPGPSink} */
var openpgpSink = {
  QueryInterface: ChromeUtils.generateQI(["nsIMsgOpenPGPSink"]),

  /**
   * Request that OpenPGP security status from the given MIME part
   * shall be ignored (not shown in the UI). If status for that
   * MIME part was already received, then reset the status.
   *
   * @param {string} originMimePartNumber - Ignore security status
   *   of this MIME part.
   */
  ignoreStatusFrom(originMimePartNumber) {
    Enigmail.hdrView.ignoreStatusFromMimePart = originMimePartNumber;
    if (Enigmail.hdrView.receivedStatusFromParts.has(originMimePartNumber)) {
      Enigmail.hdrView.reset();
      Enigmail.hdrView.ignoreStatusFromMimePart = originMimePartNumber;
    }
  },

  /**
   * Modify message headers.
   *
   * @param {string} uri - URI spec for the message (part).
   * @param {string} headerData - Header data in JSON format.
   * @param {string} mimePartNumber - MIME part number.
   */
  modifyMessageHeaders(uri, headerData, mimePartNumber) {
    const msgURI = Services.io.newURI(uri).QueryInterface(Ci.nsIMsgMessageUrl);
    if (!this.displaySubPart(mimePartNumber, msgURI.spec)) {
      return;
    }

    let msg = msgURI.messageHeader;
    if (!msg && this.isCurrentMessage(uri)) {
      // .eml messages opened from file://
      msg = gMessage;
    }
    if (!msg) {
      return;
    }

    const hdr = JSON.parse(headerData);
    if ("subject" in hdr) {
      Enigmail.hdrView.setSubject(hdr.subject, msg);
    }

    if ("date" in hdr) {
      // FIXME: more work needed to update the UI. See setSubject.
      msg.date = Date.parse(hdr.date) * 1000;
    }
  },

  async updateSecurityStatus(
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
    if (
      Enigmail.hdrView.ignoreStatusFromMimePart != "" &&
      mimePartNumber == Enigmail.hdrView.ignoreStatusFromMimePart
    ) {
      return;
    }

    Enigmail.hdrView.receivedStatusFromParts.add(mimePartNumber);

    if (!this.isCurrentMessage(uri)) {
      return;
    }
    if (!this.displaySubPart(mimePartNumber, uri)) {
      return;
    }
    if (this.hasUnauthenticatedParts(mimePartNumber)) {
      statusFlags |= EnigmailConstants.PARTIALLY_PGP;
    }

    Enigmail.hdrView.updatePgpStatus(
      exitCode,
      statusFlags,
      extStatusFlags,
      keyId,
      userId,
      sigDetails,
      errorMsg,
      blockSeparation,
      extraDetails,
      mimePartNumber
    );
  },

  /**
   * @param {string} uri - URI to handle.
   */
  handleSMimeMessage(uri) {
    if (
      Enigmail.hdrView.msgSignedStateString != null ||
      Enigmail.hdrView.msgEncryptedStateString != null
    ) {
      // If we already processed an OpenPGP part, then we are handling
      // a message with an inner S/MIME part. We must not reload
      // the message here, because we'd run into an endless loop.
      return;
    }
    if (this.isCurrentMessage(uri)) {
      EnigmailVerify.unregisterPGPMimeHandler();
      Enigmail.msg.messageReload(false);
    }
  },

  /**
   * Check if this is the current message.
   *
   * @param {string} spec - URI spec to check.
   * @returns {boolean} true if the uri is for the current message.
   */
  isCurrentMessage(spec) {
    // FIXME: it would be nicer to just be able to compare the URI specs.
    // That does currently not work for all cases, e.g.
    // mailbox:///...data/eml/signed-encrypted-autocrypt-gossip.eml?type=application/x-message-display&number=0 vs.
    // file:///...data/eml/signed-encrypted-autocrypt-gossip.eml?type=application/x-message-display

    const uri = Services.io.newURI(spec).QueryInterface(Ci.nsIMsgMessageUrl);
    const uri2 = EnigmailFuncs.getUrlFromUriSpec(gMessageURI);
    if (uri.host != uri2.host) {
      return false;
    }

    const id = EnigmailURIs.msgIdentificationFromUrl(uri);
    const id2 = EnigmailURIs.msgIdentificationFromUrl(uri2);
    return id.folder === id2.folder && id.msgNum === id2.msgNum;
  },

  /**
   * Determine if a given mime part number should be displayed.
   * Returns true if one of these conditions is true:
   *  - this is the 1st displayed block of the message
   *  - the message part displayed corresponds to the decrypted part
   *
   * @param {string} mimePartNumber - The MIME part number that was
   *   decrypted/verified
   * @param {string} uriSpec - The URI spec that is being displayed.
   */
  displaySubPart(mimePartNumber, uriSpec) {
    if (!mimePartNumber || !uriSpec) {
      return true;
    }
    const part = EnigmailMime.getMimePartNumber(uriSpec);

    if (part.length === 0) {
      // only display header if 1st message part
      if (mimePartNumber.search(/^1(\.1)*$/) < 0) {
        return false;
      }
    } else {
      const r = EnigmailFuncs.compareMimePartLevel(mimePartNumber, part);

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
   * Determine if there are message parts that are not encrypted
   *
   * @param {string} mimePartNumber - The MIME part number that was authenticated.
   * @returns {boolean} true if there are siblings.
   */
  hasUnauthenticatedParts(mimePartNumber) {
    function hasUnauthenticatedSiblings(
      mimeSubTree,
      mimePartToCheck,
      parentOfMimePartToCheck
    ) {
      if (mimeSubTree.partNum === parentOfMimePartToCheck) {
        // If this is an encrypted message that is the parent of mimePartToCheck,
        // then we know that all its childs (including mimePartToCheck) are authenticated.
        if (
          mimeSubTree.fullContentType.search(
            /^multipart\/encrypted.{1,255}protocol="?application\/pgp-encrypted"?/i
          ) === 0
        ) {
          return false;
        }
      }
      if (
        mimeSubTree.partNum.indexOf(parentOfMimePartToCheck) == 0 &&
        mimeSubTree.partNum !== mimePartToCheck
      ) {
        // This is a sibling (same parent, different part number).
        return true;
      }

      for (const i in mimeSubTree.subParts) {
        if (
          hasUnauthenticatedSiblings(
            mimeSubTree.subParts[i],
            mimePartToCheck,
            parentOfMimePartToCheck
          )
        ) {
          return true;
        }
      }
      return false;
    }
    if (!mimePartNumber || !Enigmail.msg.mimeParts) {
      return false;
    }

    let parentNum = "";
    if (mimePartNumber.includes(".")) {
      parentNum = mimePartNumber.replace(/\.\d+$/, "");
    }

    return hasUnauthenticatedSiblings(
      Enigmail.msg.mimeParts,
      mimePartNumber,
      parentNum
    );
  },

  /**
   * Determine if a given MIME part number is a multipart/related message or a child thereof
   *
   * @param {MimeTreePart} mimePart - The MIME Part object to evaluate from
   *   the MIME tree.
   * @param {string} searchPartNum - The part number to determine.
   */
  isMultipartRelated(mimePart, searchPartNum) {
    if (
      searchPartNum.indexOf(mimePart.partNum) == 0 &&
      mimePart.partNum.length <= searchPartNum.length
    ) {
      if (mimePart.fullContentType.search(/^multipart\/related/i) === 0) {
        return true;
      }

      for (const i in mimePart.subParts) {
        if (this.isMultipartRelated(mimePart.subParts[i], searchPartNum)) {
          return true;
        }
      }
    }
    return false;
  },
};

window.addEventListener(
  "load-enigmail",
  Enigmail.hdrView.hdrViewLoad.bind(Enigmail.hdrView)
);
