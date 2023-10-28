/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

/* import-globals-from ../../../../components/compose/content/MsgComposeCommands.js */
/* import-globals-from ../../../../components/compose/content/addressingWidgetOverlay.js */
/* global MsgAccountManager */
/* global gCurrentIdentity */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var EnigmailCore = ChromeUtils.import(
  "chrome://openpgp/content/modules/core.jsm"
).EnigmailCore;
var EnigmailFuncs = ChromeUtils.import(
  "chrome://openpgp/content/modules/funcs.jsm"
).EnigmailFuncs;
var { EnigmailLog } = ChromeUtils.import(
  "chrome://openpgp/content/modules/log.jsm"
);
var EnigmailArmor = ChromeUtils.import(
  "chrome://openpgp/content/modules/armor.jsm"
).EnigmailArmor;
var EnigmailData = ChromeUtils.import(
  "chrome://openpgp/content/modules/data.jsm"
).EnigmailData;
var EnigmailDialog = ChromeUtils.import(
  "chrome://openpgp/content/modules/dialog.jsm"
).EnigmailDialog;
var EnigmailWindows = ChromeUtils.import(
  "chrome://openpgp/content/modules/windows.jsm"
).EnigmailWindows;
var EnigmailKeyRing = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyRing.jsm"
).EnigmailKeyRing;
var EnigmailURIs = ChromeUtils.import(
  "chrome://openpgp/content/modules/uris.jsm"
).EnigmailURIs;
var EnigmailConstants = ChromeUtils.import(
  "chrome://openpgp/content/modules/constants.jsm"
).EnigmailConstants;
var EnigmailDecryption = ChromeUtils.import(
  "chrome://openpgp/content/modules/decryption.jsm"
).EnigmailDecryption;
var EnigmailEncryption = ChromeUtils.import(
  "chrome://openpgp/content/modules/encryption.jsm"
).EnigmailEncryption;
var EnigmailWkdLookup = ChromeUtils.import(
  "chrome://openpgp/content/modules/wkdLookup.jsm"
).EnigmailWkdLookup;
var EnigmailMime = ChromeUtils.import(
  "chrome://openpgp/content/modules/mime.jsm"
).EnigmailMime;
var EnigmailMsgRead = ChromeUtils.import(
  "chrome://openpgp/content/modules/msgRead.jsm"
).EnigmailMsgRead;
var EnigmailMimeEncrypt = ChromeUtils.import(
  "chrome://openpgp/content/modules/mimeEncrypt.jsm"
).EnigmailMimeEncrypt;
const { EnigmailCryptoAPI } = ChromeUtils.import(
  "chrome://openpgp/content/modules/cryptoAPI.jsm"
);
const { OpenPGPAlias } = ChromeUtils.import(
  "chrome://openpgp/content/modules/OpenPGPAlias.jsm"
);
var { jsmime } = ChromeUtils.import("resource:///modules/jsmime.jsm");

var l10nOpenPGP = new Localization(["messenger/openpgp/openpgp.ftl"]);

// Account encryption policy values:
// const kEncryptionPolicy_Never = 0;
// 'IfPossible' was used by ns4.
// const kEncryptionPolicy_IfPossible = 1;
var kEncryptionPolicy_Always = 2;

var Enigmail = {};

const IOSERVICE_CONTRACTID = "@mozilla.org/network/io-service;1";
const LOCAL_FILE_CONTRACTID = "@mozilla.org/file/local;1";

Enigmail.msg = {
  editor: null,
  dirty: 0,
  // dirty means: composer contents were modified by this code, right?
  processed: null, // contains information for undo of inline signed/encrypt
  timeoutId: null, // TODO: once set, it's never reset
  sendPgpMime: true,
  //sendMode: null, // the current default for sending a message (0, SIGN, ENCRYPT, or SIGN|ENCRYPT)
  //sendModeDirty: false, // send mode or final send options changed?

  // processed strings to signal final encrypt/sign/pgpmime state:
  statusEncryptedStr: "???",
  statusSignedStr: "???",
  //statusPGPMimeStr: "???",
  //statusSMimeStr: "???",
  //statusInlinePGPStr: "???",
  statusAttachOwnKey: "???",

  sendProcess: false,
  composeBodyReady: false,
  modifiedAttach: null,
  lastFocusedWindow: null,
  draftSubjectEncrypted: false,
  attachOwnKeyObj: {
    attachedObj: null,
    attachedKey: null,
  },

  keyLookupDone: [],

  addrOnChangeTimeout: 250,
  /* timeout when entering something into the address field */

  async composeStartup() {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.composeStartup\n"
    );

    if (!gMsgCompose || !gMsgCompose.compFields) {
      EnigmailLog.DEBUG(
        "enigmailMsgComposeOverlay.js: no gMsgCompose, leaving\n"
      );
      return;
    }

    gMsgCompose.RegisterStateListener(Enigmail.composeStateListener);
    Enigmail.msg.composeBodyReady = false;

    // Listen to message sending event
    addEventListener(
      "compose-send-message",
      Enigmail.msg.sendMessageListener.bind(Enigmail.msg),
      true
    );

    await OpenPGPAlias.load().catch(console.error);

    Enigmail.msg.composeOpen();
    //Enigmail.msg.processFinalState();
  },

  // TODO: call this from global compose when options change
  enigmailComposeProcessFinalState() {
    //Enigmail.msg.processFinalState();
  },

  /*
  handleClick: function(event, modifyType) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.handleClick\n");
    switch (event.button) {
      case 2:
        // do not process the event any further
        // needed on Windows to prevent displaying the context menu
        event.preventDefault();
        this.doPgpButton();
        break;
      case 0:
        this.doPgpButton(modifyType);
        break;
    }
  },
  */

  /* return whether the account specific setting key is enabled or disabled
   */
  /*
  getAccDefault: function(key) {
    //EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.getAccDefault: identity="+this.identity.key+"("+this.identity.email+") key="+key+"\n");
    let res = null;
    let mimePreferOpenPGP = this.identity.getIntAttribute("mimePreferOpenPGP");
    let isSmimeEnabled = Enigmail.msg.isSmimeEnabled();
    let wasEnigmailEnabledForIdentity = Enigmail.msg.wasEnigmailEnabledForIdentity();
    let preferSmimeByDefault = false;

    if (isSmimeEnabled && wasEnigmailEnabledForIdentity) {
    }

    if (wasEnigmailEnabledForIdentity) {
      switch (key) {
        case 'sign':
          if (preferSmimeByDefault) {
            res = (this.identity.signMail);
          }
          else {
            res = (this.identity.getIntAttribute("defaultSigningPolicy") > 0);
          }
          break;
        case 'encrypt':
          if (preferSmimeByDefault) {
            res = (this.identity.encryptionPolicy > 0);
          }
          else {
            res = (this.identity.getIntAttribute("defaultEncryptionPolicy") > 0);
          }
          break;
        case 'sign-pgp':
          res = (this.identity.getIntAttribute("defaultSigningPolicy") > 0);
          break;
        case 'pgpMimeMode':
          res = this.identity.getBoolAttribute(key);
          break;
        case 'attachPgpKey':
          res = this.identity.attachPgpKey;
          break;
      }
      //EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.getAccDefault:   "+key+"="+res+"\n");
      return res;
    }
    else if (Enigmail.msg.isSmimeEnabled()) {
      switch (key) {
        case 'sign':
          res = this.identity.signMail;
          break;
        case 'encrypt':
          res = (this.identity.encryptionPolicy > 0);
          break;
        default:
          res = false;
      }
      return res;
    }
    else {
      // every detail is disabled if OpenPGP in general is disabled:
      switch (key) {
        case 'sign':
        case 'encrypt':
        case 'pgpMimeMode':
        case 'attachPgpKey':
        case 'sign-pgp':
          return false;
      }
    }

    // should not be reached
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.getAccDefault:   internal error: invalid key '" + key + "'\n");
    return null;
  },
  */

  /**
   * Determine if any of Enigmail (OpenPGP) or S/MIME encryption is enabled for the account
   */
  /*
  isAnyEncryptionEnabled: function() {
    let id = getCurrentIdentity();

    return ((id.getUnicharAttribute("encryption_cert_name") !== "") ||
      Enigmail.msg.wasEnigmailEnabledForIdentity());
  },
  */

  isSmimeEnabled() {
    return (
      gCurrentIdentity.getUnicharAttribute("signing_cert_name") !== "" ||
      gCurrentIdentity.getUnicharAttribute("encryption_cert_name") !== ""
    );
  },

  /**
   * Determine if any of Enigmail (OpenPGP) or S/MIME signing is enabled for the account
   */
  /*
  getSigningEnabled: function() {
    let id = getCurrentIdentity();

    return ((id.getUnicharAttribute("signing_cert_name") !== "") ||
      Enigmail.msg.wasEnigmailEnabledForIdentity());
  },
  */

  /*
  getSmimeSigningEnabled: function() {
    let id = getCurrentIdentity();

    if (!id.getUnicharAttribute("signing_cert_name")) return false;

    return id.signMail;
  },
  */

  /*
  // set the current default for sending a message
  // depending on the identity
  processAccountSpecificDefaultOptions: function() {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.processAccountSpecificDefaultOptions\n");

    const SIGN = EnigmailConstants.SEND_SIGNED;
    const ENCRYPT = EnigmailConstants.SEND_ENCRYPTED;

    this.sendMode = 0;

    if (this.getSmimeSigningEnabled()) {
      this.sendMode |= SIGN;
    }

    if (!Enigmail.msg.wasEnigmailEnabledForIdentity()) {
      return;
    }

    if (this.getAccDefault("encrypt")) {
      this.sendMode |= ENCRYPT;
    }
    if (this.getAccDefault("sign")) {
      this.sendMode |= SIGN;
    }

    //this.sendPgpMime = this.getAccDefault("pgpMimeMode");
    //console.debug("processAccountSpecificDefaultOptions sendPgpMime: " + this.sendPgpMime);
    gAttachMyPublicPGPKey = this.getAccDefault("attachPgpKey");
    this.setOwnKeyStatus();
    this.attachOwnKeyObj.attachedObj = null;
    this.attachOwnKeyObj.attachedKey = null;

    //this.finalSignDependsOnEncrypt = (this.getAccDefault("signIfEnc") || this.getAccDefault("signIfNotEnc"));
  },
  */

  getOriginalMsgUri() {
    const draftId = gMsgCompose.compFields.draftId;
    let msgUri = null;

    if (draftId) {
      // original message is draft
      msgUri = draftId.replace(/\?.*$/, "");
    } else if (gMsgCompose.originalMsgURI) {
      // original message is a "true" mail
      msgUri = gMsgCompose.originalMsgURI;
    }

    return msgUri;
  },

  getMsgHdr(msgUri) {
    try {
      if (!msgUri) {
        msgUri = this.getOriginalMsgUri();
      }
      if (msgUri) {
        return gMessenger.msgHdrFromURI(msgUri);
      }
    } catch (ex) {
      // See also bug 1635648
      console.debug("exception in getMsgHdr: " + ex);
      EnigmailLog.DEBUG(
        "enigmailMessengerOverlay.js: exception in getMsgHdr: " + ex + "\n"
      );
    }
    return null;
  },

  getMsgProperties(draft, msgUri, msgHdr, mimeMsg, obtainedDraftFlagsObj) {
    EnigmailLog.DEBUG(
      "enigmailMessengerOverlay.js: Enigmail.msg.getMsgProperties:\n"
    );
    obtainedDraftFlagsObj.value = false;

    const self = this;
    let properties = 0;
    try {
      if (msgHdr) {
        properties = msgHdr.getUint32Property("enigmail");

        if (draft) {
          if (self.getSavedDraftOptions(mimeMsg)) {
            obtainedDraftFlagsObj.value = true;
          }
          updateEncryptionDependencies();
        }
      }
    } catch (ex) {
      EnigmailLog.DEBUG(
        "enigmailMessengerOverlay.js: Enigmail.msg.getMsgProperties: got exception '" +
          ex.toString() +
          "'\n"
      );
    }

    if (EnigmailURIs.isEncryptedUri(msgUri)) {
      properties |= EnigmailConstants.DECRYPTION_OKAY;
    }

    return properties;
  },

  getSavedDraftOptions(mimeMsg) {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.getSavedDraftOptions\n"
    );
    if (!mimeMsg || !mimeMsg.headers.has("x-enigmail-draft-status")) {
      return false;
    }

    const stat = mimeMsg.headers.get("x-enigmail-draft-status").join("");
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.getSavedDraftOptions: draftStatus: " +
        stat +
        "\n"
    );

    if (stat.substr(0, 1) == "N") {
      switch (Number(stat.substr(1, 1))) {
        case 2:
          // treat as "user decision to enable encryption, disable auto"
          gUserTouchedSendEncrypted = true;
          gSendEncrypted = true;
          updateEncryptionDependencies();
          break;
        case 0:
          // treat as "user decision to disable encryption, disable auto"
          gUserTouchedSendEncrypted = true;
          gSendEncrypted = false;
          updateEncryptionDependencies();
          break;
        case 1:
        default:
          // treat as "no user decision, automatic mode"
          break;
      }

      switch (Number(stat.substr(2, 1))) {
        case 2:
          gSendSigned = true;
          gUserTouchedSendSigned = true;
          break;
        case 0:
          gUserTouchedSendSigned = true;
          gSendSigned = false;
          break;
        case 1:
        default:
          // treat as "no user decision, automatic mode, based on encryption or other prefs"
          break;
      }

      switch (Number(stat.substr(3, 1))) {
        case 1:
          break;
        case EnigmailConstants.ENIG_FORCE_SMIME:
          // 3
          gSelectedTechnologyIsPGP = false;
          break;
        case 2: // pgp/mime
        case 0: // inline
        default:
          gSelectedTechnologyIsPGP = true;
          break;
      }

      switch (Number(stat.substr(4, 1))) {
        case 1:
          gUserTouchedAttachMyPubKey = true;
          gAttachMyPublicPGPKey = true;
          break;
        case 2:
          gUserTouchedAttachMyPubKey = false;
          break;
        case 0:
        default:
          gUserTouchedAttachMyPubKey = true;
          gAttachMyPublicPGPKey = false;
          break;
      }

      switch (Number(stat.substr(4, 1))) {
        case 1:
          gUserTouchedAttachMyPubKey = true;
          gAttachMyPublicPGPKey = true;
          break;
        case 2:
          gUserTouchedAttachMyPubKey = false;
          break;
        case 0:
        default:
          gUserTouchedAttachMyPubKey = true;
          gAttachMyPublicPGPKey = false;
          break;
      }

      switch (Number(stat.substr(5, 1))) {
        case 1:
          gUserTouchedEncryptSubject = true;
          gEncryptSubject = true;
          break;
        case 2:
          gUserTouchedEncryptSubject = false;
          break;
        case 0:
        default:
          gUserTouchedEncryptSubject = true;
          gEncryptSubject = false;
          break;
      }
    }
    //Enigmail.msg.setOwnKeyStatus();
    return true;
  },

  composeOpen() {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.composeOpen\n"
    );

    let msgUri = null;
    let msgHdr = null;

    msgUri = this.getOriginalMsgUri();
    if (msgUri) {
      msgHdr = this.getMsgHdr(msgUri);
      if (msgHdr) {
        try {
          const msgUrl = EnigmailMsgRead.getUrlFromUriSpec(msgUri);
          EnigmailMime.getMimeTreeFromUrl(msgUrl.spec, false, mimeMsg => {
            Enigmail.msg.continueComposeOpenWithMimeTree(
              msgUri,
              msgHdr,
              mimeMsg
            );
          });
        } catch (ex) {
          EnigmailLog.DEBUG(
            "enigmailMessengerOverlay.js: composeOpen: exception in getMimeTreeFromUrl: " +
              ex +
              "\n"
          );
          this.continueComposeOpenWithMimeTree(msgUri, msgHdr, null);
        }
      } else {
        this.continueComposeOpenWithMimeTree(msgUri, msgHdr, null);
      }
    } else {
      this.continueComposeOpenWithMimeTree(msgUri, msgHdr, null);
    }
  },

  continueComposeOpenWithMimeTree(msgUri, msgHdr, mimeMsg) {
    const selectedElement = document.activeElement;

    const msgIsDraft =
      gMsgCompose.type === Ci.nsIMsgCompType.Draft ||
      gMsgCompose.type === Ci.nsIMsgCompType.Template;

    if (!gSendEncrypted || msgIsDraft) {
      let useEncryptionUnlessWeHaveDraftInfo = false;
      let usePGPUnlessWeKnowOtherwise = false;
      let useSMIMEUnlessWeKnowOtherwise = false;

      if (msgIsDraft) {
        const globalSaysItsEncrypted =
          gEncryptedURIService &&
          gMsgCompose.originalMsgURI &&
          gEncryptedURIService.isEncrypted(gMsgCompose.originalMsgURI);

        if (globalSaysItsEncrypted) {
          useEncryptionUnlessWeHaveDraftInfo = true;
          useSMIMEUnlessWeKnowOtherwise = true;
        }
      }

      const obtainedDraftFlagsObj = { value: false };
      if (msgUri) {
        const msgFlags = this.getMsgProperties(
          msgIsDraft,
          msgUri,
          msgHdr,
          mimeMsg,
          obtainedDraftFlagsObj
        );
        if (msgFlags & EnigmailConstants.DECRYPTION_OKAY) {
          usePGPUnlessWeKnowOtherwise = true;
          useSMIMEUnlessWeKnowOtherwise = false;
        }
        if (msgIsDraft && obtainedDraftFlagsObj.value) {
          useEncryptionUnlessWeHaveDraftInfo = false;
          usePGPUnlessWeKnowOtherwise = false;
          useSMIMEUnlessWeKnowOtherwise = false;
        }
        if (!msgIsDraft) {
          if (msgFlags & EnigmailConstants.DECRYPTION_OKAY) {
            EnigmailLog.DEBUG(
              "enigmailMsgComposeOverlay.js: Enigmail.msg.composeOpen: has encrypted originalMsgUri\n"
            );
            EnigmailLog.DEBUG(
              "originalMsgURI=" + gMsgCompose.originalMsgURI + "\n"
            );
            gSendEncrypted = true;
            updateEncryptionDependencies();
            gSelectedTechnologyIsPGP = true;
            useEncryptionUnlessWeHaveDraftInfo = false;
            usePGPUnlessWeKnowOtherwise = false;
            useSMIMEUnlessWeKnowOtherwise = false;
          }
        }
        this.removeAttachedKey();
      }

      if (useEncryptionUnlessWeHaveDraftInfo) {
        gSendEncrypted = true;
        updateEncryptionDependencies();
      }
      if (gSendEncrypted && !obtainedDraftFlagsObj.value) {
        gSendSigned = true;
      }
      if (usePGPUnlessWeKnowOtherwise) {
        gSelectedTechnologyIsPGP = true;
      } else if (useSMIMEUnlessWeKnowOtherwise) {
        gSelectedTechnologyIsPGP = false;
      }
    }

    // check for attached signature files and remove them
    var bucketList = document.getElementById("attachmentBucket");
    if (bucketList.hasChildNodes()) {
      var node = bucketList.firstChild;
      while (node) {
        if (node.attachment.contentType == "application/pgp-signature") {
          if (!this.findRelatedAttachment(bucketList, node)) {
            // Let's release the attachment object held by the node else it won't go away until the window is destroyed
            node.attachment = null;
            node = bucketList.removeChild(node);
          }
        }
        node = node.nextSibling;
      }
    }

    // If we removed all the children and the bucket wasn't meant
    // to stay open, close it.
    if (!Services.prefs.getBoolPref("mail.compose.show_attachment_pane")) {
      UpdateAttachmentBucket(bucketList.hasChildNodes());
    }

    this.warnUserIfSenderKeyExpired();

    //this.processFinalState();
    if (selectedElement) {
      selectedElement.focus();
    }
  },

  // check if an signature is related to another attachment
  findRelatedAttachment(bucketList, node) {
    // check if filename ends with .sig
    if (node.attachment.name.search(/\.sig$/i) < 0) {
      return null;
    }

    var relatedNode = bucketList.firstChild;
    var findFile = node.attachment.name.toLowerCase();
    var baseAttachment = null;
    while (relatedNode) {
      if (relatedNode.attachment.name.toLowerCase() + ".sig" == findFile) {
        baseAttachment = relatedNode.attachment;
      }
      relatedNode = relatedNode.nextSibling;
    }
    return baseAttachment;
  },

  async attachOwnKey(id) {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.attachOwnKey: " + id + "\n"
    );

    if (
      this.attachOwnKeyObj.attachedKey &&
      this.attachOwnKeyObj.attachedKey != id
    ) {
      // remove attached key if user ID changed
      this.removeAttachedKey();
    }
    const revokedIDs = EnigmailKeyRing.findRevokedPersonalKeysByEmail(
      gCurrentIdentity.email
    );

    if (!this.attachOwnKeyObj.attachedKey) {
      const hex = "0x" + id;
      var attachedObj = await this.extractAndAttachKey(
        hex,
        revokedIDs,
        gCurrentIdentity.email,
        true,
        true // one key plus revocations
      );
      if (attachedObj) {
        this.attachOwnKeyObj.attachedObj = attachedObj;
        this.attachOwnKeyObj.attachedKey = hex;
      }
    }
  },

  async extractAndAttachKey(
    primaryId,
    revokedIds,
    emailForFilename,
    warnOnError
  ) {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.extractAndAttachKey: \n"
    );
    var enigmailSvc = EnigmailCore.getService();
    if (!enigmailSvc) {
      return null;
    }

    var tmpFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
    tmpFile.append("key.asc");
    tmpFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);

    // save file
    var exitCodeObj = {};
    var errorMsgObj = {};

    await EnigmailKeyRing.extractPublicKeys(
      [], // full
      [primaryId], // reduced
      revokedIds, // minimal
      tmpFile,
      exitCodeObj,
      errorMsgObj
    );
    if (exitCodeObj.value !== 0) {
      if (warnOnError) {
        EnigmailDialog.alert(window, errorMsgObj.value);
      }
      return null;
    }

    // create attachment
    var tmpFileURI = Services.io.newFileURI(tmpFile);
    var keyAttachment = Cc[
      "@mozilla.org/messengercompose/attachment;1"
    ].createInstance(Ci.nsIMsgAttachment);
    keyAttachment.url = tmpFileURI.spec;
    keyAttachment.name = primaryId.substr(-16, 16);
    if (keyAttachment.name.search(/^0x/) < 0) {
      keyAttachment.name = "0x" + keyAttachment.name;
    }
    let withRevSuffix = "";
    if (revokedIds && revokedIds.length) {
      withRevSuffix = "_and_old_rev";
    }
    keyAttachment.name =
      "OpenPGP_" + keyAttachment.name + withRevSuffix + ".asc";
    keyAttachment.temporary = true;
    keyAttachment.contentType = "application/pgp-keys";
    keyAttachment.size = tmpFile.fileSize;

    if (
      !gAttachmentBucket.itemChildren.find(
        item => item.attachment.name == keyAttachment.name
      )
    ) {
      await this.addAttachment(keyAttachment);
    }

    gContentChanged = true;
    return keyAttachment;
  },

  addAttachment(attachment) {
    return AddAttachments([attachment]);
  },

  removeAttachedKey() {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.removeAttachedKey: \n"
    );

    const bucketList = document.getElementById("attachmentBucket");
    let node = bucketList.firstElementChild;

    if (bucketList.itemCount && this.attachOwnKeyObj.attachedObj) {
      // Undo attaching own key.
      while (node) {
        if (node.attachment.url == this.attachOwnKeyObj.attachedObj.url) {
          node = bucketList.removeChild(node);
          // Let's release the attachment object held by the node else it won't
          // go away until the window is destroyed.
          node.attachment = null;
          this.attachOwnKeyObj.attachedObj = null;
          this.attachOwnKeyObj.attachedKey = null;
          node = null; // exit loop.
        } else {
          node = node.nextSibling;
        }
      }

      // Update the visibility of the attachment pane.
      UpdateAttachmentBucket(bucketList.itemCount);
    }
  },

  getSecurityParams(compFields = null) {
    if (!compFields) {
      if (!gMsgCompose) {
        return null;
      }

      compFields = gMsgCompose.compFields;
    }

    return compFields.composeSecure;
  },

  setSecurityParams(newSecurityParams) {
    if (!gMsgCompose || !gMsgCompose.compFields) {
      return;
    }
    gMsgCompose.compFields.composeSecure = newSecurityParams;
  },

  // Used on send failure, to reset the pre-send modifications
  resetUpdatedFields() {
    this.removeAttachedKey();

    // reset subject
    const p = Enigmail.msg.getSecurityParams();
    if (p && EnigmailMimeEncrypt.isEnigmailCompField(p)) {
      const si = p.wrappedJSObject;
      if (si.originalSubject) {
        gMsgCompose.compFields.subject = si.originalSubject;
      }
    }
  },

  replaceEditorText(text) {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.replaceEditorText:\n"
    );

    this.editorSelectAll();
    // Overwrite text in clipboard for security
    // (Otherwise plaintext will be available in the clipbaord)

    if (this.editor.textLength > 0) {
      this.editorInsertText("Enigmail");
    } else {
      this.editorInsertText(" ");
    }

    this.editorSelectAll();
    this.editorInsertText(text);
  },

  /**
   * Determine if Enigmail is enabled for the account
   */

  isEnigmailEnabledForIdentity() {
    return !!gCurrentIdentity.getUnicharAttribute("openpgp_key_id");
  },

  /**
   * Determine if Autocrypt is enabled for the account
   */
  isAutocryptEnabled() {
    return false;
    /*
    if (Enigmail.msg.wasEnigmailEnabledForIdentity()) {
      let srv = this.getCurrentIncomingServer();
      return (srv ? srv.getBoolValue("enableAutocrypt") : false);
    }

    return false;
    */
  },

  /*
  doPgpButton: function(what) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.doPgpButton: what=" + what + "\n");

    if (Enigmail.msg.wasEnigmailEnabledForIdentity()) {
      EnigmailCore.getService(); // try to access Enigmail to launch the wizard if needed
    }

    // ignore settings for this account?
    try {
      if (!this.isAnyEncryptionEnabled() && !this.getSigningEnabled()) {
        return;
      }
    }
    catch (ex) {}

    switch (what) {
      case 'sign':
      case 'encrypt':
        this.setSendMode(what);
        break;

      case 'trustKeys':
        this.tempTrustAllKeys();
        break;

      case 'nothing':
        break;

      case 'displaySecuritySettings':
        this.displaySecuritySettings();
        break;
      default:
        this.displaySecuritySettings();
    }

  },
  */

  // changes the DEFAULT sendMode
  // - also called internally for saved emails
  /*
  setSendMode: function(sendMode) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.setSendMode: sendMode=" + sendMode + "\n");
    const SIGN = EnigmailConstants.SEND_SIGNED;
    const ENCRYPT = EnigmailConstants.SEND_ENCRYPTED;

    var origSendMode = this.sendMode;
    switch (sendMode) {
      case 'sign':
        this.sendMode |= SIGN;
        break;
      case 'encrypt':
        this.sendMode |= ENCRYPT;
        break;
      default:
        EnigmailDialog.alert(window, "Enigmail.msg.setSendMode - unexpected value: " + sendMode);
        break;
    }
    // sendMode changed ?
    // - sign and send are internal initializations
    if (!this.sendModeDirty && (this.sendMode != origSendMode) && sendMode != 'sign' && sendMode != 'encrypt') {
      this.sendModeDirty = true;
    }
    this.processFinalState();
  },
  */

  /**
    key function to process the final encrypt/sign/pgpmime state from all settings
   *
    @param sendFlags: contains the sendFlags if the message is really processed. Optional, can be null
      - uses as INPUT:
         - this.sendMode
         - this.encryptForced, this.encryptSigned
      - uses as OUTPUT:
         - this.statusEncrypt, this.statusSign

    no return value
  */
  processFinalState(sendFlags) {},

  /* check if encryption is possible (have keys for everyone or not)
   */
  async determineSendFlags() {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.focusChange: Enigmail.msg.determineSendFlags\n"
    );

    const detailsObj = {};
    var compFields = gMsgCompose.compFields;

    if (!Enigmail.msg.composeBodyReady) {
      compFields = Cc[
        "@mozilla.org/messengercompose/composefields;1"
      ].createInstance(Ci.nsIMsgCompFields);
    }
    Recipients2CompFields(compFields);

    // disabled, see bug 1625135
    // gMsgCompose.expandMailingLists();

    if (Enigmail.msg.isEnigmailEnabledForIdentity()) {
      var toAddrList = [];
      var arrLen = {};
      var recList;
      if (compFields.to) {
        recList = compFields.splitRecipients(compFields.to, true, arrLen);
        this.addRecipients(toAddrList, recList);
      }
      if (compFields.cc) {
        recList = compFields.splitRecipients(compFields.cc, true, arrLen);
        this.addRecipients(toAddrList, recList);
      }
      if (compFields.bcc) {
        recList = compFields.splitRecipients(compFields.bcc, true, arrLen);
        this.addRecipients(toAddrList, recList);
      }

      let addresses = [];
      try {
        addresses = EnigmailFuncs.stripEmail(toAddrList.join(", ")).split(",");
      } catch (ex) {}

      // Resolve all the email addresses if possible.
      await EnigmailKeyRing.getValidKeysForAllRecipients(addresses, detailsObj);
      //this.autoPgpEncryption = (validKeyList !== null);
    }

    // process and signal new resulting state
    //this.processFinalState();

    return detailsObj;
  },

  /*
  displaySecuritySettings: function() {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.displaySecuritySettings\n");

    var inputObj = {
      gSendEncrypted: gSendEncrypted,
      gSendSigned: gSendSigned,
      success: false,
      resetDefaults: false
    };
    window.openDialog("chrome://openpgp/content/ui/enigmailEncryptionDlg.xhtml", "", "dialog,modal,centerscreen", inputObj);

    if (!inputObj.success) return; // Cancel pressed

    if (inputObj.resetDefaults) {
      // reset everything to defaults
      this.encryptForced = 1;
      this.signForced = 1;
    }
    else {
      if (this.signForced != inputObj.sign) {
        this.dirty = 2;
        this.signForced = inputObj.sign;
      }

        this.dirty = 2;

      this.encryptForced = inputObj.encrypt;
    }

    //this.processFinalState();
  },
  */

  addRecipients(toAddrList, recList) {
    for (var i = 0; i < recList.length; i++) {
      try {
        toAddrList.push(
          EnigmailFuncs.stripEmail(recList[i].replace(/[",]/g, ""))
        );
      } catch (ex) {}
    }
  },

  setDraftStatus(doEncrypt) {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.setDraftStatus - enabling draft mode\n"
    );

    // Draft Status:
    // N (for new style) plus 5 digits:
    // 1: encryption
    // 2: signing
    // 3: PGP/MIME
    // 4: attach own key
    // 5: subject encrypted

    var draftStatus = "N";

    // Encryption:
    // 2 -> required/enabled
    // 0 -> disabled

    if (!gUserTouchedSendEncrypted && !gIsRelatedToEncryptedOriginal) {
      // After opening draft, it's allowed to use automatic decision.
      draftStatus += "1";
    } else {
      // After opening draft, use the same state that is set now.
      draftStatus += gSendEncrypted ? "2" : "0";
    }

    if (!gUserTouchedSendSigned) {
      // After opening draft, it's allowed to use automatic decision.
      draftStatus += "1";
    } else {
      // After opening draft, use the same state that is set now.
      // Signing:
      // 2 -> enabled
      // 0 -> disabled
      draftStatus += gSendSigned ? "2" : "0";
    }

    // MIME/technology
    // ENIG_FORCE_SMIME == 3 -> S/MIME
    // ENIG_FORCE_ALWAYS == 2 -> PGP/MIME
    // 0 -> PGP inline
    if (gSelectedTechnologyIsPGP) {
      // inline signing currently not implemented
      draftStatus += "2";
    } else {
      draftStatus += "3";
    }

    if (!gUserTouchedAttachMyPubKey) {
      draftStatus += "2";
    } else {
      draftStatus += gAttachMyPublicPGPKey ? "1" : "0";
    }

    if (!gUserTouchedEncryptSubject) {
      draftStatus += "2";
    } else {
      draftStatus += gSendEncrypted && gEncryptSubject ? "1" : "0";
    }

    this.setAdditionalHeader("X-Enigmail-Draft-Status", draftStatus);
  },

  getSenderUserId() {
    const keyId = gCurrentIdentity?.getUnicharAttribute("openpgp_key_id");
    return keyId ? "0x" + keyId : null;
  },

  /**
   * Determine if S/MIME or OpenPGP should be used
   *
   * @param sendFlags: Number - input send flags.
   *
   * @return: Boolean:
   *   1: use OpenPGP
   *   0: use S/MIME
   */
  /*
  preferPgpOverSmime: function(sendFlags) {

    let si = Enigmail.msg.getSecurityParams(null);
    let isSmime = !EnigmailMimeEncrypt.isEnigmailCompField(si);

    if (isSmime &&
      (sendFlags & (EnigmailConstants.SEND_SIGNED | EnigmailConstants.SEND_ENCRYPTED))) {

      if (si.requireEncryptMessage || si.signMessage) {

        if (sendFlags & EnigmailConstants.SAVE_MESSAGE) {
          // use S/MIME if it's enabled for saving drafts
          return 0;
        }
        else {
          return this.mimePreferOpenPGP;
        }
      }
    }

    return 1;
  },
  */

  /* Manage the wrapping of inline signed mails
   *
   * @wrapresultObj: Result:
   * @wrapresultObj.cancelled, true if send operation is to be cancelled, else false
   * @wrapresultObj.usePpgMime, true if message send option was changed to PGP/MIME, else false
   */

  async wrapInLine(wrapresultObj) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: WrapInLine\n");
    wrapresultObj.cancelled = false;
    wrapresultObj.usePpgMime = false;
    try {
      const dce = Ci.nsIDocumentEncoder;
      var editor = gMsgCompose.editor.QueryInterface(Ci.nsIEditorMailSupport);
      var encoderFlags = dce.OutputFormatted | dce.OutputLFLineBreak;

      var wrapWidth = Services.prefs.getIntPref("mailnews.wraplength");
      if (wrapWidth > 0 && wrapWidth < 68 && editor.wrapWidth > 0) {
        if (
          EnigmailDialog.confirmDlg(
            window,
            await l10nOpenPGP.formatValue("minimal-line-wrapping", {
              width: wrapWidth,
            })
          )
        ) {
          wrapWidth = 68;
          Services.prefs.setIntPref("mailnews.wraplength", wrapWidth);
        }
      }

      if (wrapWidth && editor.wrapWidth > 0) {
        // First use standard editor wrap mechanism:
        editor.wrapWidth = wrapWidth - 2;
        editor.rewrap(true);
        editor.wrapWidth = wrapWidth;

        // Now get plaintext from editor
        var wrapText = this.editorGetContentAs("text/plain", encoderFlags);

        // split the lines into an array
        wrapText = wrapText.split(/\r\n|\r|\n/g);

        var i = 0;
        var excess = 0;
        // inspect all lines of mail text to detect if we still have excessive lines which the "standard" editor wrapper leaves
        for (i = 0; i < wrapText.length; i++) {
          if (wrapText[i].length > wrapWidth) {
            excess = 1;
          }
        }

        if (excess) {
          EnigmailLog.DEBUG(
            "enigmailMsgComposeOverlay.js: Excess lines detected\n"
          );
          var resultObj = {};
          window.openDialog(
            "chrome://openpgp/content/ui/enigmailWrapSelection.xhtml",
            "",
            "dialog,modal,centerscreen",
            resultObj
          );
          try {
            if (resultObj.cancelled) {
              // cancel pressed -> do not send, return instead.
              wrapresultObj.cancelled = true;
              return;
            }
          } catch (ex) {
            // cancel pressed -> do not send, return instead.
            wrapresultObj.cancelled = true;
            return;
          }

          var limitedLine = "";
          var restOfLine = "";

          var WrapSelect = resultObj.Select;
          switch (WrapSelect) {
            case "0": // Selection: Force rewrap
              for (i = 0; i < wrapText.length; i++) {
                if (wrapText[i].length > wrapWidth) {
                  // If the current line is too long, limit it hard to wrapWidth and insert the rest as the next line into wrapText array
                  limitedLine = wrapText[i].slice(0, wrapWidth);
                  restOfLine = wrapText[i].slice(wrapWidth);

                  // We should add quotes at the beginning of "restOfLine", if limitedLine is a quoted line
                  // However, this would be purely academic, because limitedLine will always be "standard"-wrapped
                  // by the editor-rewrapper at the space between quote sign (>) and the quoted text.

                  wrapText.splice(i, 1, limitedLine, restOfLine);
                }
              }
              break;
            case "1": // Selection: Send as is
              break;
            case "2": // Selection: Use MIME
              wrapresultObj.usePpgMime = true;
              break;
            case "3": // Selection: Edit manually -> do not send, return instead.
              wrapresultObj.cancelled = true;
              return;
          } //switch
        }
        // Now join all lines together again and feed it back into the compose editor.
        var newtext = wrapText.join("\n");
        this.replaceEditorText(newtext);
      }
    } catch (ex) {
      EnigmailLog.DEBUG(
        "enigmailMsgComposeOverlay.js: Exception while wrapping=" + ex + "\n"
      );
    }
  },

  // Save draft message. We do not want most of the other processing for encrypted mails here...
  async saveDraftMessage(senderKeyIsGnuPG) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: saveDraftMessage()\n");

    // If we have an encryption key configured, then encrypt saved
    // drafts by default, as a precaution. This is independent from the
    // final decision of sending the message encrypted or not.
    // However, we allow the user to disable encrypted drafts.
    const doEncrypt =
      Enigmail.msg.isEnigmailEnabledForIdentity() &&
      gCurrentIdentity.autoEncryptDrafts;

    this.setDraftStatus(doEncrypt);

    if (!doEncrypt) {
      try {
        const p = Enigmail.msg.getSecurityParams();
        if (EnigmailMimeEncrypt.isEnigmailCompField(p)) {
          p.wrappedJSObject.sendFlags = 0;
        }
      } catch (ex) {
        console.debug(ex);
      }

      return true;
    }

    let sendFlags =
      EnigmailConstants.SEND_PGP_MIME |
      EnigmailConstants.SEND_ENCRYPTED |
      EnigmailConstants.SEND_ENCRYPT_TO_SELF |
      EnigmailConstants.SAVE_MESSAGE;

    if (gEncryptSubject) {
      sendFlags |= EnigmailConstants.ENCRYPT_SUBJECT;
    }
    if (senderKeyIsGnuPG) {
      sendFlags |= EnigmailConstants.SEND_SENDER_KEY_EXTERNAL;
    }

    const fromAddr = this.getSenderUserId();

    const enigmailSvc = EnigmailCore.getService();
    if (!enigmailSvc) {
      return true;
    }

    const senderKeyUsable = await EnigmailEncryption.determineOwnKeyUsability(
      sendFlags,
      fromAddr,
      senderKeyIsGnuPG
    );
    if (senderKeyUsable.errorMsg) {
      let fullAlert = await document.l10n.formatValue(
        "msg-compose-cannot-save-draft"
      );
      fullAlert += " - " + senderKeyUsable.errorMsg;
      EnigmailDialog.alert(window, fullAlert);
      return false;
    }

    //if (this.preferPgpOverSmime(sendFlags) === 0) return true; // use S/MIME

    let secInfo;

    const param = Enigmail.msg.getSecurityParams();

    if (EnigmailMimeEncrypt.isEnigmailCompField(param)) {
      secInfo = param.wrappedJSObject;
    } else {
      try {
        secInfo = EnigmailMimeEncrypt.createMimeEncrypt(param);
        if (secInfo) {
          Enigmail.msg.setSecurityParams(secInfo);
        }
      } catch (ex) {
        EnigmailLog.writeException(
          "enigmailMsgComposeOverlay.js: Enigmail.msg.saveDraftMessage",
          ex
        );
        return false;
      }
    }

    secInfo.sendFlags = sendFlags;
    secInfo.UIFlags = 0;
    secInfo.senderEmailAddr = fromAddr;
    secInfo.recipients = "";
    secInfo.bccRecipients = "";
    secInfo.originalSubject = gMsgCompose.compFields.subject;
    this.dirty = 1;

    if (sendFlags & EnigmailConstants.ENCRYPT_SUBJECT) {
      gMsgCompose.compFields.subject = "";
    }

    return true;
  },

  createEnigmailSecurityFields(oldSecurityInfo) {
    const newSecurityInfo = EnigmailMimeEncrypt.createMimeEncrypt(
      Enigmail.msg.getSecurityParams()
    );

    if (!newSecurityInfo) {
      throw Components.Exception("", Cr.NS_ERROR_FAILURE);
    }

    Enigmail.msg.setSecurityParams(newSecurityInfo);
  },

  /*
  sendSmimeEncrypted: function(msgSendType, sendFlags, isOffline) {
    let recList;
    let toAddrList = [];
    let arrLen = {};
    const DeliverMode = Ci.nsIMsgCompDeliverMode;

    switch (msgSendType) {
      case DeliverMode.SaveAsDraft:
      case DeliverMode.SaveAsTemplate:
      case DeliverMode.AutoSaveAsDraft:
        break;
      default:
        if (gAttachMyPublicPGPKey) {
          await this.attachOwnKey();
          Attachments2CompFields(gMsgCompose.compFields); // update list of attachments
        }
    }

    gSMFields.signMessage = (sendFlags & EnigmailConstants.SEND_SIGNED ? true : false);
    gSMFields.requireEncryptMessage = (sendFlags & EnigmailConstants.SEND_ENCRYPTED ? true : false);

    Enigmail.msg.setSecurityParams(gSMFields);

    let conf = this.isSendConfirmationRequired(sendFlags);

    if (conf === null) return false;
    if (conf) {
      // confirm before send requested
      let msgCompFields = gMsgCompose.compFields;
      let splitRecipients = msgCompFields.splitRecipients;

      if (msgCompFields.to.length > 0) {
        recList = splitRecipients(msgCompFields.to, true, arrLen);
        this.addRecipients(toAddrList, recList);
      }

      if (msgCompFields.cc.length > 0) {
        recList = splitRecipients(msgCompFields.cc, true, arrLen);
        this.addRecipients(toAddrList, recList);
      }

      switch (msgSendType) {
        case DeliverMode.SaveAsDraft:
        case DeliverMode.SaveAsTemplate:
        case DeliverMode.AutoSaveAsDraft:
          break;
        default:
          if (!this.confirmBeforeSend(toAddrList.join(", "), "", sendFlags, isOffline)) {
            return false;
          }
      }
    }

    return true;
  },
  */

  getEncryptionFlags() {
    let f = 0;

    if (gSendEncrypted) {
      f |= EnigmailConstants.SEND_ENCRYPTED;
    } else {
      f &= ~EnigmailConstants.SEND_ENCRYPTED;
    }

    if (gSendSigned) {
      f |= EnigmailConstants.SEND_SIGNED;
    } else {
      f &= ~EnigmailConstants.SEND_SIGNED;
    }

    if (gSendEncrypted && gSendSigned) {
      if (Services.prefs.getBoolPref("mail.openpgp.separate_mime_layers")) {
        f |= EnigmailConstants.SEND_TWO_MIME_LAYERS;
      }
    }

    if (gSendEncrypted && gEncryptSubject) {
      f |= EnigmailConstants.ENCRYPT_SUBJECT;
    }

    return f;
  },

  resetDirty() {
    let newSecurityInfo = null;

    if (this.dirty) {
      // make sure the sendFlags are reset before the message is processed
      // (it may have been set by a previously cancelled send operation!)

      const si = Enigmail.msg.getSecurityParams();

      if (EnigmailMimeEncrypt.isEnigmailCompField(si)) {
        si.sendFlags = 0;
        si.originalSubject = gMsgCompose.compFields.subject;
      } else {
        try {
          newSecurityInfo = EnigmailMimeEncrypt.createMimeEncrypt(si);
          if (newSecurityInfo) {
            newSecurityInfo.sendFlags = 0;
            newSecurityInfo.originalSubject = gMsgCompose.compFields.subject;

            Enigmail.msg.setSecurityParams(newSecurityInfo);
          }
        } catch (ex) {
          EnigmailLog.writeException(
            "enigmailMsgComposeOverlay.js: Enigmail.msg.resetDirty",
            ex
          );
        }
      }
    }

    return newSecurityInfo;
  },

  async determineMsgRecipients(sendFlags) {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.determineMsgRecipients: currentId=" +
        gCurrentIdentity +
        ", " +
        gCurrentIdentity.email +
        "\n"
    );

    let fromAddr = gCurrentIdentity.email;
    const toAddrList = [];
    let recList;
    const bccAddrList = [];
    const arrLen = {};

    if (!Enigmail.msg.isEnigmailEnabledForIdentity()) {
      return true;
    }

    let optSendFlags = 0;
    const msgCompFields = gMsgCompose.compFields;
    const newsgroups = msgCompFields.newsgroups;

    if (Services.prefs.getBoolPref("temp.openpgp.encryptToSelf")) {
      optSendFlags |= EnigmailConstants.SEND_ENCRYPT_TO_SELF;
    }

    sendFlags |= optSendFlags;

    var userIdValue = this.getSenderUserId();
    if (userIdValue) {
      fromAddr = userIdValue;
    }

    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.determineMsgRecipients:gMsgCompose=" +
        gMsgCompose +
        "\n"
    );

    const splitRecipients = msgCompFields.splitRecipients;

    if (msgCompFields.to.length > 0) {
      recList = splitRecipients(msgCompFields.to, true, arrLen);
      this.addRecipients(toAddrList, recList);
    }

    if (msgCompFields.cc.length > 0) {
      recList = splitRecipients(msgCompFields.cc, true, arrLen);
      this.addRecipients(toAddrList, recList);
    }

    // We allow sending to BCC recipients, we assume the user interface
    // has warned the user that there is no privacy of BCC recipients.
    if (msgCompFields.bcc.length > 0) {
      recList = splitRecipients(msgCompFields.bcc, true, arrLen);
      this.addRecipients(bccAddrList, recList);
    }

    if (newsgroups) {
      toAddrList.push(newsgroups);

      if (sendFlags & EnigmailConstants.SEND_ENCRYPTED) {
        if (!Services.prefs.getBoolPref("temp.openpgp.encryptToNews")) {
          document.l10n.formatValue("sending-news").then(value => {
            EnigmailDialog.alert(window, value);
          });
          return false;
        } else if (
          !EnigmailDialog.confirmBoolPref(
            window,
            await l10nOpenPGP.formatValue("send-to-news-warning"),
            "temp.openpgp.warnOnSendingNewsgroups",
            await l10nOpenPGP.formatValue("msg-compose-button-send")
          )
        ) {
          return false;
        }
      }
    }

    return {
      sendFlags,
      optSendFlags,
      fromAddr,
      toAddrList,
      bccAddrList,
    };
  },

  prepareSending(sendFlags, toAddrStr, gpgKeys, isOffline) {
    // perform confirmation dialog if necessary/requested
    if (
      sendFlags & EnigmailConstants.SEND_WITH_CHECK &&
      !this.messageSendCheck()
    ) {
      // Abort send
      if (!this.processed) {
        this.removeAttachedKey();
      }

      return false;
    }

    return true;
  },

  prepareSecurityInfo(
    sendFlags,
    uiFlags,
    rcpt,
    newSecurityInfo,
    autocryptGossipHeaders
  ) {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.prepareSecurityInfo(): Using PGP/MIME, flags=" +
        sendFlags +
        "\n"
    );

    const oldSecurityInfo = Enigmail.msg.getSecurityParams();

    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.prepareSecurityInfo: oldSecurityInfo = " +
        oldSecurityInfo +
        "\n"
    );

    if (!newSecurityInfo) {
      this.createEnigmailSecurityFields(Enigmail.msg.getSecurityParams());
      newSecurityInfo = Enigmail.msg.getSecurityParams().wrappedJSObject;
    }

    newSecurityInfo.originalSubject = gMsgCompose.compFields.subject;
    newSecurityInfo.originalReferences = gMsgCompose.compFields.references;

    if (sendFlags & EnigmailConstants.SEND_ENCRYPTED) {
      if (sendFlags & EnigmailConstants.ENCRYPT_SUBJECT) {
        gMsgCompose.compFields.subject = "";
      }

      if (Services.prefs.getBoolPref("temp.openpgp.protectReferencesHdr")) {
        gMsgCompose.compFields.references = "";
      }
    }

    newSecurityInfo.sendFlags = sendFlags;
    newSecurityInfo.UIFlags = uiFlags;
    newSecurityInfo.senderEmailAddr = rcpt.fromAddr;
    newSecurityInfo.bccRecipients = rcpt.bccAddrStr;
    newSecurityInfo.autocryptGossipHeaders = autocryptGossipHeaders;

    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.prepareSecurityInfo: securityInfo = " +
        newSecurityInfo +
        "\n"
    );
    return newSecurityInfo;
  },

  async prepareSendMsg(msgSendType) {
    // msgSendType: value from nsIMsgCompDeliverMode
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.prepareSendMsg: msgSendType=" +
        msgSendType +
        ", gSendSigned=" +
        gSendSigned +
        ", gSendEncrypted=" +
        gSendEncrypted +
        "\n"
    );

    const SIGN = EnigmailConstants.SEND_SIGNED;
    const ENCRYPT = EnigmailConstants.SEND_ENCRYPTED;
    const DeliverMode = Ci.nsIMsgCompDeliverMode;

    var ioService = Services.io;
    // EnigSend: Handle both plain and encrypted messages below
    var isOffline = ioService && ioService.offline;

    const senderKeyIsGnuPG =
      Services.prefs.getBoolPref("mail.openpgp.allow_external_gnupg") &&
      gCurrentIdentity.getBoolAttribute("is_gnupg_key_id");

    let sendFlags = this.getEncryptionFlags();

    switch (msgSendType) {
      case DeliverMode.SaveAsDraft:
      case DeliverMode.SaveAsTemplate:
      case DeliverMode.AutoSaveAsDraft:
        EnigmailLog.DEBUG(
          "enigmailMsgComposeOverlay.js: Enigmail.msg.prepareSendMsg: detected save draft\n"
        );

        // saving drafts is simpler and works differently than the rest of Enigmail.
        // All rules except account-settings are ignored.
        return this.saveDraftMessage(senderKeyIsGnuPG);
    }

    this.unsetAdditionalHeader("x-enigmail-draft-status");

    const msgCompFields = gMsgCompose.compFields;
    const newsgroups = msgCompFields.newsgroups; // Check if sending to any newsgroups

    if (
      msgCompFields.to === "" &&
      msgCompFields.cc === "" &&
      msgCompFields.bcc === "" &&
      newsgroups === ""
    ) {
      // don't attempt to send message if no recipient specified
      var bundle = document.getElementById("bundle_composeMsgs");
      EnigmailDialog.alert(window, bundle.getString("12511"));
      return false;
    }

    const senderKeyId = gCurrentIdentity.getUnicharAttribute("openpgp_key_id");

    if ((gSendEncrypted || gSendSigned) && !senderKeyId) {
      const msgId = gSendEncrypted
        ? "cannot-send-enc-because-no-own-key"
        : "cannot-send-sig-because-no-own-key";
      const fullAlert = await document.l10n.formatValue(msgId, {
        key: gCurrentIdentity.email,
      });
      EnigmailDialog.alert(window, fullAlert);
      return false;
    }

    if (senderKeyIsGnuPG) {
      sendFlags |= EnigmailConstants.SEND_SENDER_KEY_EXTERNAL;
    }

    if ((gSendEncrypted || gSendSigned) && senderKeyId) {
      const senderKeyUsable = await EnigmailEncryption.determineOwnKeyUsability(
        sendFlags,
        senderKeyId,
        senderKeyIsGnuPG
      );
      if (senderKeyUsable.errorMsg) {
        const fullAlert = await document.l10n.formatValue(
          "cannot-use-own-key-because",
          {
            problem: senderKeyUsable.errorMsg,
          }
        );
        EnigmailDialog.alert(window, fullAlert);
        return false;
      }
    }

    let cannotEncryptMissingInfo = false;
    if (gSendEncrypted) {
      const canEncryptDetails = await this.determineSendFlags();
      if (canEncryptDetails.errArray.length != 0) {
        cannotEncryptMissingInfo = true;
      }
    }

    if (gWindowLocked) {
      EnigmailDialog.alert(
        window,
        await document.l10n.formatValue("window-locked")
      );
      return false;
    }

    let newSecurityInfo = this.resetDirty();
    this.dirty = 1;

    try {
      this.modifiedAttach = null;

      // fill fromAddr, toAddrList, bcc etc
      const rcpt = await this.determineMsgRecipients(sendFlags);
      if (typeof rcpt === "boolean") {
        return rcpt;
      }
      sendFlags = rcpt.sendFlags;

      if (cannotEncryptMissingInfo) {
        showMessageComposeSecurityStatus(true);
        return false;
      }

      if (this.sendPgpMime) {
        // Use PGP/MIME
        sendFlags |= EnigmailConstants.SEND_PGP_MIME;
      }

      const toAddrStr = rcpt.toAddrList.join(", ");
      const bccAddrStr = rcpt.bccAddrList.join(", ");

      if (gAttachMyPublicPGPKey) {
        await this.attachOwnKey(senderKeyId);
      }

      const autocryptGossipHeaders = await this.getAutocryptGossip();

      /*
      if (this.preferPgpOverSmime(sendFlags) === 0) {
        // use S/MIME
        Attachments2CompFields(gMsgCompose.compFields); // update list of attachments
        sendFlags = 0;
        return true;
      }
      */

      var usingPGPMime =
        sendFlags & EnigmailConstants.SEND_PGP_MIME &&
        sendFlags & (ENCRYPT | SIGN);

      // ----------------------- Rewrapping code, taken from function "encryptInline"

      if (sendFlags & ENCRYPT && !usingPGPMime) {
        throw new Error("Sending encrypted inline not supported!");
      }
      if (sendFlags & SIGN && !usingPGPMime && gMsgCompose.composeHTML) {
        throw new Error(
          "Sending signed inline only supported for plain text composition!"
        );
      }

      // Check wrapping, if sign only and inline and plaintext
      if (
        sendFlags & SIGN &&
        !(sendFlags & ENCRYPT) &&
        !usingPGPMime &&
        !gMsgCompose.composeHTML
      ) {
        var wrapresultObj = {};

        await this.wrapInLine(wrapresultObj);

        if (wrapresultObj.usePpgMime) {
          sendFlags |= EnigmailConstants.SEND_PGP_MIME;
          usingPGPMime = EnigmailConstants.SEND_PGP_MIME;
        }
        if (wrapresultObj.cancelled) {
          return false;
        }
      }

      var uiFlags = EnigmailConstants.UI_INTERACTIVE;

      if (usingPGPMime) {
        uiFlags |= EnigmailConstants.UI_PGP_MIME;
      }

      if (sendFlags & (ENCRYPT | SIGN) && usingPGPMime) {
        // Use PGP/MIME
        newSecurityInfo = this.prepareSecurityInfo(
          sendFlags,
          uiFlags,
          rcpt,
          newSecurityInfo,
          autocryptGossipHeaders
        );
        newSecurityInfo.recipients = toAddrStr;
        newSecurityInfo.bccRecipients = bccAddrStr;
      } else if (!this.processed && sendFlags & (ENCRYPT | SIGN)) {
        // use inline PGP

        const sendInfo = {
          sendFlags,
          fromAddr: rcpt.fromAddr,
          toAddr: toAddrStr,
          bccAddr: bccAddrStr,
          uiFlags,
          bucketList: document.getElementById("attachmentBucket"),
        };

        if (!(await this.signInline(sendInfo))) {
          return false;
        }
      }

      // update the list of attachments
      Attachments2CompFields(msgCompFields);

      if (
        !this.prepareSending(
          sendFlags,
          rcpt.toAddrList.join(", "),
          toAddrStr + ", " + bccAddrStr,
          isOffline
        )
      ) {
        return false;
      }

      if (msgCompFields.characterSet != "ISO-2022-JP") {
        if (
          (usingPGPMime && sendFlags & (ENCRYPT | SIGN)) ||
          (!usingPGPMime && sendFlags & ENCRYPT)
        ) {
          try {
            // make sure plaintext is not changed to 7bit
            if (typeof msgCompFields.forceMsgEncoding == "boolean") {
              msgCompFields.forceMsgEncoding = true;
              EnigmailLog.DEBUG(
                "enigmailMsgComposeOverlay.js: Enigmail.msg.prepareSendMsg: enabled forceMsgEncoding\n"
              );
            }
          } catch (ex) {
            console.debug(ex);
          }
        }
      }
    } catch (ex) {
      EnigmailLog.writeException(
        "enigmailMsgComposeOverlay.js: Enigmail.msg.prepareSendMsg",
        ex
      );
      return false;
    }

    // The encryption process for PGP/MIME messages follows "here". It's
    // called automatically from nsMsgCompose->sendMsg().
    // registration for this is done in core.jsm: startup()

    return true;
  },

  async signInline(sendInfo) {
    // sign message using inline-PGP

    if (sendInfo.sendFlags & ENCRYPT) {
      throw new Error("Encryption not supported in inline messages!");
    }
    if (gMsgCompose.composeHTML) {
      throw new Error(
        "Signing inline only supported for plain text composition!"
      );
    }

    const dce = Ci.nsIDocumentEncoder;
    const SIGN = EnigmailConstants.SEND_SIGNED;
    const ENCRYPT = EnigmailConstants.SEND_ENCRYPTED;

    var enigmailSvc = EnigmailCore.getService();
    if (!enigmailSvc) {
      return false;
    }

    if (Services.prefs.getBoolPref("mail.strictly_mime")) {
      if (
        EnigmailDialog.confirmIntPref(
          window,
          await l10nOpenPGP.formatValue("quoted-printable-warn"),
          "temp.openpgp.quotedPrintableWarn"
        )
      ) {
        Services.prefs.setBoolPref("mail.strictly_mime", false);
      }
    }

    var sendFlowed = Services.prefs.getBoolPref(
      "mailnews.send_plaintext_flowed"
    );
    var encoderFlags = dce.OutputFormatted | dce.OutputLFLineBreak;

    // plaintext: Wrapping code has been moved to superordinate function prepareSendMsg to enable interactive format switch

    var exitCodeObj = {};
    var statusFlagsObj = {};
    var errorMsgObj = {};
    var exitCode;

    // Get plain text
    // (Do we need to set the nsIDocumentEncoder.* flags?)
    var origText = this.editorGetContentAs("text/plain", encoderFlags);
    if (!origText) {
      origText = "";
    }

    if (origText.length > 0) {
      // Sign/encrypt body text

      var escText = origText; // Copy plain text for possible escaping

      if (sendFlowed) {
        // Prevent space stuffing a la RFC 2646 (format=flowed).

        //EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: escText["+encoderFlags+"] = '"+escText+"'\n");

        escText = escText.replace(/^From /gm, "~From ");
        escText = escText.replace(/^>/gm, "|");
        escText = escText.replace(/^[ \t]+$/gm, "");
        escText = escText.replace(/^ /gm, "~ ");

        //EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: escText = '"+escText+"'\n");
        // Replace plain text and get it again
        this.replaceEditorText(escText);

        escText = this.editorGetContentAs("text/plain", encoderFlags);
      }

      // Replace plain text and get it again (to avoid linewrapping problems)
      this.replaceEditorText(escText);

      escText = this.editorGetContentAs("text/plain", encoderFlags);

      // Encode plaintext to utf-8 from unicode
      var plainText = MailStringUtils.stringToByteString(escText);

      // this will sign, not encrypt
      var cipherText = EnigmailEncryption.encryptMessage(
        window,
        sendInfo.uiFlags,
        plainText,
        sendInfo.fromAddr,
        sendInfo.toAddr,
        sendInfo.bccAddr,
        sendInfo.sendFlags,
        exitCodeObj,
        statusFlagsObj,
        errorMsgObj
      );

      exitCode = exitCodeObj.value;

      //EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: cipherText = '"+cipherText+"'\n");
      if (cipherText && exitCode === 0) {
        // Encryption/signing succeeded; overwrite plaintext

        cipherText = cipherText.replace(/\r\n/g, "\n");

        // Decode ciphertext from utf-8 to unicode and overwrite
        this.replaceEditorText(
          EnigmailData.convertToUnicode(cipherText, "utf-8")
        );

        // Save original text (for undo)
        this.processed = {
          origText,
        };
      } else {
        // Restore original text
        this.replaceEditorText(origText);

        if (sendInfo.sendFlags & SIGN) {
          // Encryption/signing failed

          this.sendAborted(window, errorMsgObj);
          return false;
        }
      }
    }

    return true;
  },

  async sendAborted(window, errorMsgObj) {
    if (errorMsgObj && errorMsgObj.value) {
      var txt = errorMsgObj.value;
      var txtLines = txt.split(/\r?\n/);
      var errorMsg = "";
      for (var i = 0; i < txtLines.length; ++i) {
        var line = txtLines[i];
        var tokens = line.split(/ /);
        // process most important business reasons for invalid recipient (and sender) errors:
        if (
          tokens.length == 3 &&
          (tokens[0] == "INV_RECP" || tokens[0] == "INV_SGNR")
        ) {
          var reason = tokens[1];
          var key = tokens[2];
          if (reason == "10") {
            errorMsg +=
              (await document.l10n.formatValue("key-not-trusted", { key })) +
              "\n";
          } else if (reason == "1") {
            errorMsg +=
              (await document.l10n.formatValue("key-not-found", { key })) +
              "\n";
          } else if (reason == "4") {
            errorMsg +=
              (await document.l10n.formatValue("key-revoked", { key })) + "\n";
          } else if (reason == "5") {
            errorMsg +=
              (await document.l10n.formatValue("key-expired", { key })) + "\n";
          }
        }
      }
      if (errorMsg !== "") {
        txt = errorMsg + "\n" + txt;
      }
      EnigmailDialog.info(
        window,
        (await document.l10n.formatValue("send-aborted")) + "\n" + txt
      );
    } else {
      const [title, message] = await document.l10n.formatValues([
        { id: "send-aborted" },
        { id: "msg-compose-internal-error" },
      ]);
      EnigmailDialog.info(window, title + "\n" + message);
    }
  },

  messageSendCheck() {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.messageSendCheck\n"
    );

    try {
      var warn = Services.prefs.getBoolPref("mail.warn_on_send_accel_key");

      if (warn) {
        var checkValue = {
          value: false,
        };
        var bundle = document.getElementById("bundle_composeMsgs");
        var buttonPressed = EnigmailDialog.getPromptSvc().confirmEx(
          window,
          bundle.getString("sendMessageCheckWindowTitle"),
          bundle.getString("sendMessageCheckLabel"),
          EnigmailDialog.getPromptSvc().BUTTON_TITLE_IS_STRING *
            EnigmailDialog.getPromptSvc().BUTTON_POS_0 +
            EnigmailDialog.getPromptSvc().BUTTON_TITLE_CANCEL *
              EnigmailDialog.getPromptSvc().BUTTON_POS_1,
          bundle.getString("sendMessageCheckSendButtonLabel"),
          null,
          null,
          bundle.getString("CheckMsg"),
          checkValue
        );
        if (buttonPressed !== 0) {
          return false;
        }
        if (checkValue.value) {
          Services.prefs.setBoolPref("mail.warn_on_send_accel_key", false);
        }
      }
    } catch (ex) {}

    return true;
  },

  /**
   * set non-standard message Header
   * (depending on TB version)
   *
   * hdr: String: header type (e.g. X-Enigmail-Version)
   * val: String: header data (e.g. 1.2.3.4)
   */
  setAdditionalHeader(hdr, val) {
    if ("otherRandomHeaders" in gMsgCompose.compFields) {
      // TB <= 36
      gMsgCompose.compFields.otherRandomHeaders += hdr + ": " + val + "\r\n";
    } else {
      gMsgCompose.compFields.setHeader(hdr, val);
    }
  },

  unsetAdditionalHeader(hdr) {
    gMsgCompose.compFields.deleteHeader(hdr);
  },

  // called just before sending
  modifyCompFields() {
    try {
      if (
        !Enigmail.msg.isEnigmailEnabledForIdentity() ||
        !gCurrentIdentity.sendAutocryptHeaders
      ) {
        return;
      }
      if ((gSendSigned || gSendEncrypted) && !gSelectedTechnologyIsPGP) {
        // If we're sending an S/MIME message, we don't want to send
        // the OpenPGP autocrypt header.
        return;
      }
      this.setAutocryptHeader();
    } catch (ex) {
      EnigmailLog.writeException(
        "enigmailMsgComposeOverlay.js: Enigmail.msg.modifyCompFields",
        ex
      );
    }
  },

  getCurrentIncomingServer() {
    const currentAccountKey = getCurrentAccountKey();
    const account = MailServices.accounts.getAccount(currentAccountKey);

    return account.incomingServer; /* returns nsIMsgIncomingServer */
  },

  /**
   * Obtain all Autocrypt-Gossip header lines that should be included in
   * the outgoing message, excluding the sender's (from) email address.
   * If there is just one recipient (ignoring the from address),
   * no headers will be returned.
   *
   * @returns {string} - All header lines including line endings,
   *                     could be the empty string.
   */
  async getAutocryptGossip() {
    const fromMail = EnigmailFuncs.stripEmail(gMsgCompose.compFields.from);
    const replyToMail = EnigmailFuncs.stripEmail(
      gMsgCompose.compFields.replyTo
    );

    let optionalReplyToGossip = "";
    if (replyToMail != fromMail) {
      optionalReplyToGossip = ", " + gMsgCompose.compFields.replyTo;
    }

    // Assumes that extractHeaderAddressMailboxes will separate all
    // entries with the sequence comma-space.
    const allEmails = MailServices.headerParser
      .extractHeaderAddressMailboxes(
        gMsgCompose.compFields.to +
          ", " +
          gMsgCompose.compFields.cc +
          optionalReplyToGossip
      )
      .split(/, /);

    // Use a Set to ensure we have each address only once.
    const uniqueEmails = new Set();
    for (const e of allEmails) {
      uniqueEmails.add(e);
    }

    // Potentially to/cc might contain the sender email address.
    // Remove it, if it's there.
    uniqueEmails.delete(fromMail);

    // When sending to yourself, only, allEmails.length is 0.
    // When sending to exactly one other person (with or without
    // "from" in to/cc), then allEmails.length is 1. In that scenario,
    // that recipient obviously already has their own key, and doesn't
    // need the gossip. The sender's key will be included in the
    // separate autocrypt (non-gossip) header.

    if (uniqueEmails.size < 2) {
      return "";
    }

    let gossip = "";
    for (const email of uniqueEmails) {
      const k = await EnigmailKeyRing.getRecipientAutocryptKeyForEmail(email);
      if (!k) {
        continue;
      }
      const keyData =
        " " + k.replace(/(.{72})/g, "$1\r\n ").replace(/\r\n $/, "");
      gossip +=
        "Autocrypt-Gossip: addr=" + email + "; keydata=\r\n" + keyData + "\r\n";
    }

    return gossip;
  },

  setAutocryptHeader() {
    const senderKeyId = gCurrentIdentity.getUnicharAttribute("openpgp_key_id");
    if (!senderKeyId) {
      return;
    }

    let fromMail = gCurrentIdentity.email;
    try {
      fromMail = EnigmailFuncs.stripEmail(gMsgCompose.compFields.from);
    } catch (ex) {}

    let keyData = EnigmailKeyRing.getAutocryptKey("0x" + senderKeyId, fromMail);

    if (keyData) {
      keyData =
        " " + keyData.replace(/(.{72})/g, "$1\r\n ").replace(/\r\n $/, "");
      this.setAdditionalHeader(
        "Autocrypt",
        "addr=" + fromMail + "; keydata=\r\n" + keyData
      );
    }
  },

  /**
   * Handle the 'compose-send-message' event from TB
   */
  sendMessageListener(event) {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.sendMessageListener\n"
    );

    const msgcomposeWindow = document.getElementById("msgcomposeWindow");
    const sendMsgType = Number(msgcomposeWindow.getAttribute("msgtype"));

    if (
      !(
        this.sendProcess &&
        sendMsgType == Ci.nsIMsgCompDeliverMode.AutoSaveAsDraft
      )
    ) {
      this.modifyCompFields();
      if (!gSelectedTechnologyIsPGP) {
        return;
      }

      this.sendProcess = true;
      //let bc = document.getElementById("enigmail-bc-sendprocess");

      try {
        const cApi = EnigmailCryptoAPI();
        const encryptResult = cApi.sync(this.prepareSendMsg(sendMsgType));
        if (!encryptResult) {
          this.resetUpdatedFields();
          event.preventDefault();
          event.stopPropagation();
        }
      } catch (ex) {
        console.error("GenericSendMessage FAILED: " + ex);
        this.resetUpdatedFields();
        event.preventDefault();
        event.stopPropagation();
      }
    } else {
      EnigmailLog.DEBUG(
        "enigmailMsgComposeOverlay.js: Enigmail.msg.sendMessageListener: sending in progress - autosave aborted\n"
      );
      event.preventDefault();
      event.stopPropagation();
    }
    this.sendProcess = false;
  },

  async decryptQuote(interactive) {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.decryptQuote: " +
        interactive +
        "\n"
    );

    if (gWindowLocked || this.processed) {
      return;
    }

    var enigmailSvc = EnigmailCore.getService();
    if (!enigmailSvc) {
      return;
    }

    const dce = Ci.nsIDocumentEncoder;
    var encoderFlags = dce.OutputFormatted | dce.OutputLFLineBreak;

    var docText = this.editorGetContentAs("text/plain", encoderFlags);

    var blockBegin = docText.indexOf("-----BEGIN PGP ");
    if (blockBegin < 0) {
      return;
    }

    // Determine indentation string
    var indentBegin = docText.substr(0, blockBegin).lastIndexOf("\n");
    var indentStr = docText.substring(indentBegin + 1, blockBegin);

    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.decryptQuote: indentStr='" +
        indentStr +
        "'\n"
    );

    var beginIndexObj = {};
    var endIndexObj = {};
    var indentStrObj = {};
    var blockType = EnigmailArmor.locateArmoredBlock(
      docText,
      0,
      indentStr,
      beginIndexObj,
      endIndexObj,
      indentStrObj
    );
    if (blockType != "MESSAGE" && blockType != "SIGNED MESSAGE") {
      return;
    }

    var beginIndex = beginIndexObj.value;
    var endIndex = endIndexObj.value;

    var head = docText.substr(0, beginIndex);
    var tail = docText.substr(endIndex + 1);

    var pgpBlock = docText.substr(beginIndex, endIndex - beginIndex + 1);
    var indentRegexp;

    if (indentStr) {
      if (indentStr == "> ") {
        // replace ">> " with "> > " to allow correct quoting
        pgpBlock = pgpBlock.replace(/^>>/gm, "> >");
      }

      // Escape regex chars.
      const escapedIndent1 = indentStr.replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&");

      // Delete indentation
      indentRegexp = new RegExp("^" + escapedIndent1, "gm");

      pgpBlock = pgpBlock.replace(indentRegexp, "");
      //tail     =     tail.replace(indentRegexp, "");

      if (indentStr.match(/[ \t]*$/)) {
        indentStr = indentStr.replace(/[ \t]*$/gm, "");
        // Escape regex chars.
        const escapedIndent2 = indentStr.replace(
          /[.*+\-?^${}()|[\]\\]/g,
          "\\$&"
        );
        indentRegexp = new RegExp("^" + escapedIndent2 + "$", "gm");

        pgpBlock = pgpBlock.replace(indentRegexp, "");
      }

      // Handle blank indented lines
      pgpBlock = pgpBlock.replace(/^[ \t]*>[ \t]*$/gm, "");
      //tail     =     tail.replace(/^[ \t]*>[ \t]*$/g, "");

      // Trim leading space in tail
      tail = tail.replace(/^\s*\n/m, "\n");
    }

    if (tail.search(/\S/) < 0) {
      // No non-space characters in tail; delete it
      tail = "";
    }

    // Encode ciphertext from unicode to utf-8
    var cipherText = MailStringUtils.stringToByteString(pgpBlock);

    // Decrypt message
    var signatureObj = {};
    signatureObj.value = "";
    var exitCodeObj = {};
    var statusFlagsObj = {};
    var userIdObj = {};
    var keyIdObj = {};
    var sigDetailsObj = {};
    var errorMsgObj = {};
    var blockSeparationObj = {};
    var encToDetailsObj = {};

    var uiFlags = EnigmailConstants.UI_UNVERIFIED_ENC_OK;

    var plainText = "";

    plainText = EnigmailDecryption.decryptMessage(
      window,
      uiFlags,
      cipherText,
      null, // date
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
    // Decode plaintext from "utf-8" to unicode
    plainText = EnigmailData.convertToUnicode(plainText, "utf-8").replace(
      /\r\n/g,
      "\n"
    );

    //if (Services.prefs.getBoolPref("temp.openpgp.keepSettingsForReply")) {
    if (statusFlagsObj.value & EnigmailConstants.DECRYPTION_OKAY) {
      //this.setSendMode('encrypt');

      // TODO : Check, when is this code reached?
      // automatic enabling encryption currently depends on
      // adjustSignEncryptAfterIdentityChanged to be always reached
      gIsRelatedToEncryptedOriginal = true;
      gSendEncrypted = true;
      updateEncryptionDependencies();
    }
    //}

    var exitCode = exitCodeObj.value;

    if (exitCode !== 0) {
      // Error processing
      var errorMsg = errorMsgObj.value;

      var statusLines = errorMsg ? errorMsg.split(/\r?\n/) : [];

      var displayMsg;
      if (statusLines && statusLines.length) {
        // Display only first ten lines of error message
        while (statusLines.length > 10) {
          statusLines.pop();
        }

        displayMsg = statusLines.join("\n");

        if (interactive) {
          EnigmailDialog.info(window, displayMsg);
        }
      }
    }

    if (blockType == "MESSAGE" && exitCode === 0 && plainText.length === 0) {
      plainText = " ";
    }

    if (!plainText) {
      if (blockType != "SIGNED MESSAGE") {
        return;
      }

      // Extract text portion of clearsign block
      plainText = EnigmailArmor.extractSignaturePart(
        pgpBlock,
        EnigmailConstants.SIGNATURE_TEXT
      );
    }

    var doubleDashSeparator = Services.prefs.getBoolPref(
      "temp.openpgp.doubleDashSeparator"
    );
    if (
      gMsgCompose.type != Ci.nsIMsgCompType.Template &&
      gMsgCompose.type != Ci.nsIMsgCompType.Draft &&
      doubleDashSeparator
    ) {
      var signOffset = plainText.search(/[\r\n]-- +[\r\n]/);

      if (signOffset < 0 && blockType == "SIGNED MESSAGE") {
        signOffset = plainText.search(/[\r\n]--[\r\n]/);
      }

      if (signOffset > 0) {
        // Strip signature portion of quoted message
        plainText = plainText.substr(0, signOffset + 1);
      }
    }

    this.editorSelectAll();

    //EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.decryptQuote: plainText='"+plainText+"'\n");

    if (head) {
      this.editorInsertText(head);
    }

    var quoteElement;

    if (indentStr) {
      quoteElement = this.editorInsertAsQuotation(plainText);
    } else {
      this.editorInsertText(plainText);
    }

    if (tail) {
      this.editorInsertText(tail);
    }

    if (statusFlagsObj.value & EnigmailConstants.DECRYPTION_OKAY) {
      this.checkInlinePgpReply(head, tail);
    }

    if (interactive) {
      return;
    }

    // Position cursor
    var replyOnTop = gCurrentIdentity.replyOnTop;

    if (!indentStr || !quoteElement) {
      replyOnTop = 1;
    }

    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.decryptQuote: replyOnTop=" +
        replyOnTop +
        ", quoteElement=" +
        quoteElement +
        "\n"
    );

    if (this.editor.selectionController) {
      var selection = this.editor.selectionController;
      selection.completeMove(false, false); // go to start;

      switch (replyOnTop) {
        case 0:
          // Position after quote
          this.editor.endOfDocument();
          if (tail) {
            for (let cPos = 0; cPos < tail.length; cPos++) {
              selection.characterMove(false, false); // move backwards
            }
          }
          break;

        case 2:
          // Select quote

          if (head) {
            for (let cPos = 0; cPos < head.length; cPos++) {
              selection.characterMove(true, false);
            }
          }
          selection.completeMove(true, true);
          if (tail) {
            for (let cPos = 0; cPos < tail.length; cPos++) {
              selection.characterMove(false, true); // move backwards
            }
          }
          break;

        default:
          // Position at beginning of document

          if (this.editor) {
            this.editor.beginningOfDocument();
          }
      }

      this.editor.selectionController.scrollSelectionIntoView(
        Ci.nsISelectionController.SELECTION_NORMAL,
        Ci.nsISelectionController.SELECTION_ANCHOR_REGION,
        true
      );
    }

    //this.processFinalState();
  },

  checkInlinePgpReply(head, tail) {
    const CT = Ci.nsIMsgCompType;
    let hLines = head.search(/[^\s>]/) < 0 ? 0 : 1;

    if (hLines > 0) {
      switch (gMsgCompose.type) {
        case CT.Reply:
        case CT.ReplyAll:
        case CT.ReplyToSender:
        case CT.ReplyToGroup:
        case CT.ReplyToSenderAndGroup:
        case CT.ReplyToList: {
          // if head contains at only a few line of text, we assume it's the
          // header above the quote (e.g. XYZ wrote:) and the user's signature

          const h = head.split(/\r?\n/);
          hLines = -1;

          for (let i = 0; i < h.length; i++) {
            if (h[i].search(/[^\s>]/) >= 0) {
              hLines++;
            }
          }
        }
      }
    }

    if (
      hLines > 0 &&
      (!gCurrentIdentity.sigOnReply || gCurrentIdentity.sigBottom)
    ) {
      // display warning if no signature on top of message
      this.displayPartialEncryptedWarning();
    } else if (hLines > 10) {
      this.displayPartialEncryptedWarning();
    } else if (
      tail.search(/[^\s>]/) >= 0 &&
      !(gCurrentIdentity.sigOnReply && gCurrentIdentity.sigBottom)
    ) {
      // display warning if no signature below message
      this.displayPartialEncryptedWarning();
    }
  },

  editorInsertText(plainText) {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.editorInsertText\n"
    );
    if (this.editor) {
      var mailEditor;
      try {
        mailEditor = this.editor.QueryInterface(Ci.nsIEditorMailSupport);
        mailEditor.insertTextWithQuotations(plainText);
      } catch (ex) {
        EnigmailLog.DEBUG(
          "enigmailMsgComposeOverlay.js: Enigmail.msg.editorInsertText: no mail editor\n"
        );
        this.editor.insertText(plainText);
      }
    }
  },

  editorInsertAsQuotation(plainText) {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.editorInsertAsQuotation\n"
    );
    if (this.editor) {
      var mailEditor;
      try {
        mailEditor = this.editor.QueryInterface(Ci.nsIEditorMailSupport);
      } catch (ex) {}

      if (!mailEditor) {
        return 0;
      }

      EnigmailLog.DEBUG(
        "enigmailMsgComposeOverlay.js: Enigmail.msg.editorInsertAsQuotation: mailEditor=" +
          mailEditor +
          "\n"
      );

      mailEditor.insertAsCitedQuotation(plainText, "", false);

      return 1;
    }
    return 0;
  },

  isSenderKeyExpired() {
    const senderKeyId = this.getSenderUserId();

    if (senderKeyId) {
      const key = EnigmailKeyRing.getKeyById(senderKeyId);
      return key?.expiryTime && Math.round(Date.now() / 1000) > key.expiryTime;
    }

    return false;
  },

  removeNotificationIfPresent(name) {
    const notif = gComposeNotification.getNotificationWithValue(name);
    if (notif) {
      gComposeNotification.removeNotification(notif);
    }
  },

  warnUserThatSenderKeyExpired() {
    const label = {
      "l10n-id": "openpgp-selection-status-error",
      "l10n-args": { key: this.getSenderUserId() },
    };

    const buttons = [
      {
        "l10n-id": "settings-context-open-account-settings-item2",
        callback() {
          MsgAccountManager(
            "am-e2e.xhtml",
            MailServices.accounts.getServersForIdentity(gCurrentIdentity)[0]
          );
          Services.wm.getMostRecentWindow("mail:3pane")?.focus();
          return true;
        },
      },
    ];

    gComposeNotification.appendNotification(
      "openpgpSenderKeyExpired",
      {
        label,
        priority: gComposeNotification.PRIORITY_WARNING_MEDIUM,
      },
      buttons
    );
  },

  warnUserIfSenderKeyExpired() {
    if (!this.isSenderKeyExpired()) {
      this.removeNotificationIfPresent("openpgpSenderKeyExpired");
      return;
    }

    this.warnUserThatSenderKeyExpired();
  },

  /**
   * Display a notification to the user at the bottom of the window
   *
   * @param priority: Number - Priority of the message [1 = high (error) ... 3 = low (info)]
   * @param msgText: String - Text to be displayed in notification bar
   * @param messageId: String - Unique message type identification
   * @param detailsText: String - optional text to be displayed by clicking on "Details" button.
   *                              if null or "", then the Detail button will no be displayed.
   */
  async notifyUser(priority, msgText, messageId, detailsText) {
    let prio;

    switch (priority) {
      case 1:
        prio = gComposeNotification.PRIORITY_CRITICAL_MEDIUM;
        break;
      case 3:
        prio = gComposeNotification.PRIORITY_INFO_MEDIUM;
        break;
      default:
        prio = gComposeNotification.PRIORITY_WARNING_MEDIUM;
    }

    const buttonArr = [];

    if (detailsText && detailsText.length > 0) {
      const [accessKey, label] = await document.l10n.formatValues([
        { id: "msg-compose-details-button-access-key" },
        { id: "msg-compose-details-button-label" },
      ]);

      buttonArr.push({
        accessKey,
        label,
        callback(aNotificationBar, aButton) {
          EnigmailDialog.info(window, detailsText);
        },
      });
    }
    gComposeNotification.appendNotification(
      messageId,
      {
        label: msgText,
        priority: prio,
      },
      buttonArr
    );
  },

  /**
   * Display a warning message if we are replying to or forwarding
   * a partially decrypted inline-PGP email
   */
  async displayPartialEncryptedWarning() {
    const [msgLong, msgShort] = await document.l10n.formatValues([
      { id: "msg-compose-partially-encrypted-inlinePGP" },
      { id: "msg-compose-partially-encrypted-short" },
    ]);

    this.notifyUser(1, msgShort, "notifyPartialDecrypt", msgLong);
  },

  editorSelectAll() {
    if (this.editor) {
      this.editor.selectAll();
    }
  },

  editorGetContentAs(mimeType, flags) {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.editorGetContentAs\n"
    );
    if (this.editor) {
      return this.editor.outputToString(mimeType, flags);
    }

    return null;
  },

  async focusChange() {
    // call original TB function
    CommandUpdate_MsgCompose();

    var focusedWindow = top.document.commandDispatcher.focusedWindow;

    // we're just setting focus to where it was before
    if (focusedWindow == Enigmail.msg.lastFocusedWindow) {
      // skip
      return;
    }

    Enigmail.msg.lastFocusedWindow = focusedWindow;
  },

  /**
   * Merge multiple  Re: Re: into one Re: in message subject
   */
  fixMessageSubject() {
    const subjElem = document.getElementById("msgSubject");
    if (subjElem) {
      const r = subjElem.value.replace(/^(Re: )+/, "Re: ");
      if (r !== subjElem.value) {
        subjElem.value = r;
        if (typeof subjElem.oninput === "function") {
          subjElem.oninput();
        }
      }
    }
  },
};

Enigmail.composeStateListener = {
  NotifyComposeFieldsReady() {
    // Note: NotifyComposeFieldsReady is only called when a new window is created (i.e. not in case a window object is reused).
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: ECSL.NotifyComposeFieldsReady\n"
    );

    try {
      Enigmail.msg.editor = gMsgCompose.editor.QueryInterface(Ci.nsIEditor);
    } catch (ex) {}

    if (!Enigmail.msg.editor) {
      return;
    }

    Enigmail.msg.fixMessageSubject();

    function enigDocStateListener() {}

    enigDocStateListener.prototype = {
      QueryInterface: ChromeUtils.generateQI(["nsIDocumentStateListener"]),

      NotifyDocumentWillBeDestroyed() {
        EnigmailLog.DEBUG(
          "enigmailMsgComposeOverlay.js: EDSL.enigDocStateListener.NotifyDocumentWillBeDestroyed\n"
        );
      },

      NotifyDocumentStateChanged(nowDirty) {
        EnigmailLog.DEBUG(
          "enigmailMsgComposeOverlay.js: EDSL.enigDocStateListener.NotifyDocumentStateChanged\n"
        );
      },
    };

    var docStateListener = new enigDocStateListener();

    Enigmail.msg.editor.addDocumentStateListener(docStateListener);
  },

  ComposeProcessDone(aResult) {
    // Note: called after a mail was sent (or saved)
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: ECSL.ComposeProcessDone: " + aResult + "\n"
    );

    if (aResult != Cr.NS_OK) {
      Enigmail.msg.removeAttachedKey();
    }

    // ensure that securityInfo is set back to S/MIME flags (especially required if draft was saved)
    if (gSMFields) {
      Enigmail.msg.setSecurityParams(gSMFields);
    }
  },

  NotifyComposeBodyReady() {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: ECSL.ComposeBodyReady\n");

    var isEmpty, isEditable;

    isEmpty = Enigmail.msg.editor.documentIsEmpty;
    isEditable = Enigmail.msg.editor.isDocumentEditable;
    Enigmail.msg.composeBodyReady = true;

    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: ECSL.ComposeBodyReady: isEmpty=" +
        isEmpty +
        ", isEditable=" +
        isEditable +
        "\n"
    );

    /*
    if (Enigmail.msg.disableSmime) {
      if (gMsgCompose && gMsgCompose.compFields && Enigmail.msg.getSecurityParams()) {
        let si = Enigmail.msg.getSecurityParams(null);
        si.signMessage = false;
        si.requireEncryptMessage = false;
      }
      else {
        EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: ECSL.ComposeBodyReady: could not disable S/MIME\n");
      }
    }
    */

    if (isEditable && !isEmpty) {
      if (!Enigmail.msg.timeoutId && !Enigmail.msg.dirty) {
        Enigmail.msg.timeoutId = setTimeout(function () {
          Enigmail.msg.decryptQuote(false);
        }, 0);
      }
    }

    // This must be called by the last registered NotifyComposeBodyReady()
    // stateListener. We need this in order to know when the entire init
    // sequence of the composeWindow has finished, so the WebExtension compose
    // API can do its final modifications.
    window.composeEditorReady = true;
    window.dispatchEvent(new CustomEvent("compose-editor-ready"));
  },

  SaveInFolderDone(folderURI) {
    //EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: ECSL.SaveInFolderDone\n");
  },
};

window.addEventListener(
  "load",
  Enigmail.msg.composeStartup.bind(Enigmail.msg),
  {
    capture: false,
    once: true,
  }
);

window.addEventListener("compose-window-unload", () => {
  if (gMsgCompose) {
    gMsgCompose.UnregisterStateListener(Enigmail.composeStateListener);
  }
});
