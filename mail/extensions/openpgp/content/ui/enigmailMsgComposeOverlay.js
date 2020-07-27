/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

/*globally available Thunderbird variables/object/functions: */
/*global gMsgCompose: false, getCurrentIdentity: false, gNotification: false */
/*global UpdateAttachmentBucket: false, gContentChanged: true */
/*global AddAttachments: false, AddAttachment: false, ChangeAttachmentBucketVisibility: false, GetResourceFromUri: false */
/*global Recipients2CompFields: false, Attachments2CompFields: false, DetermineConvertibility: false, gWindowLocked: false */
/*global CommandUpdate_MsgCompose: false, gSMFields: false, setSecuritySettings: false, getCurrentAccountKey: false */
/*global Sendlater3Composing: false, gCurrentIdentity: false, showMessageComposeSecurityStatus: false */
/*global gSendEncrypted: true, gOptionalEncryption: true, gSendSigned: true, gSelectedTechnologyIsPGP: true */
/*global gIsRelatedToEncryptedOriginal: true, gIsRelatedToSignedOriginal: true, gAttachMyPublicPGPKey: true */

/* import-globals-from ../BondOpenPGP.jsm */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
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
var EnigmailPrefs = ChromeUtils.import(
  "chrome://openpgp/content/modules/prefs.jsm"
).EnigmailPrefs;
var { EnigmailOS } = ChromeUtils.import(
  "chrome://openpgp/content/modules/os.jsm"
);
var EnigmailArmor = ChromeUtils.import(
  "chrome://openpgp/content/modules/armor.jsm"
).EnigmailArmor;
var EnigmailLocale = ChromeUtils.import(
  "chrome://openpgp/content/modules/locale.jsm"
).EnigmailLocale;
var EnigmailFiles = ChromeUtils.import(
  "chrome://openpgp/content/modules/files.jsm"
).EnigmailFiles;
var EnigmailData = ChromeUtils.import(
  "chrome://openpgp/content/modules/data.jsm"
).EnigmailData;
var { EnigmailApp } = ChromeUtils.import(
  "chrome://openpgp/content/modules/app.jsm"
);
var EnigmailDialog = ChromeUtils.import(
  "chrome://openpgp/content/modules/dialog.jsm"
).EnigmailDialog;
var EnigmailTimer = ChromeUtils.import(
  "chrome://openpgp/content/modules/timer.jsm"
).EnigmailTimer;
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
var EnigmailClipboard = ChromeUtils.import(
  "chrome://openpgp/content/modules/clipboard.jsm"
).EnigmailClipboard;
var EnigmailWkdLookup = ChromeUtils.import(
  "chrome://openpgp/content/modules/wkdLookup.jsm"
).EnigmailWkdLookup;
var EnigmailAutocrypt = ChromeUtils.import(
  "chrome://openpgp/content/modules/autocrypt.jsm"
).EnigmailAutocrypt;
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
var { jsmime } = ChromeUtils.import("resource:///modules/jsmime.jsm");

var l10n = new Localization(["messenger/openpgp/openpgp.ftl"], true);

// Account encryption policy values:
// const kEncryptionPolicy_Never = 0;
// 'IfPossible' was used by ns4.
// const kEncryptionPolicy_IfPossible = 1;
var kEncryptionPolicy_Always = 2;

if (!Enigmail) {
  var Enigmail = {};
}

const IOSERVICE_CONTRACTID = "@mozilla.org/network/io-service;1";
const LOCAL_FILE_CONTRACTID = "@mozilla.org/file/local;1";

Enigmail.msg = {
  editor: null,
  dirty: null, // inconsistent, other places use int. should this be zero ?
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
  identity: null,
  modifiedAttach: null,
  lastFocusedWindow: null,
  determineSendFlagId: null,
  protectHeaders: false,
  draftSubjectEncrypted: false,
  attachOwnKeyObj: {
    attachedObj: null,
    attachedKey: null,
  },

  keyLookupDone: [],

  saveDraftError: 0,
  addrOnChangeTimeout: 250,
  /* timeout when entering something into the address field */

  async composeStartup() {
    if (!BondOpenPGP.allDependenciesLoaded()) {
      return;
    }

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

    // Relabel SMIME button and menu item
    //var smimeButton = document.getElementById("button-security");
    //let toolbar = document.getElementById("composeToolbar2");

    /*
    if (smimeButton) {
      smimeButton.setAttribute("label", "S/MIME");
      if (toolbar && toolbar.getAttribute("currentset").length === 0) {
        // remove S/MIME button if the toolbar is displaying the default set
        toolbar.removeChild(smimeButton);
      }
    }
    */

    document
      .getElementById("msgIdentityPopup")
      .addEventListener("command", () => {
        this.setIdentityDefaults();
      });

    this.setIdentityDefaults();

    /*
    let numCerts = EnigmailFuncs.getNumOfX509Certs();
    this.addrOnChangeTimeout = Math.max((numCerts - 250) * 2, 250);
    EnigmailLog.DEBUG(`enigmailMsgComposeOverlay.js: composeStartup: numCerts=${numCerts}; setting timeout to ${this.addrOnChangeTimeout}\n`);
    */

    // TODO implement migration code for old prefs, possibly in configure.jsm
    // Use a new pref identityEnigmailPrefsMigrated, default false.
    // Only if we're doing this for the first time for an identity,
    // try to read old prefs and if found, store as new prefs,
    // then set identityEnigmailPrefsMigrated=true
    // Enigmail account prefs that need to be handled:
    // - defaultEncryptionPolicy
    // - autoSendEncrypted
    // - defaultSigningPolicy
    // possible values to check:
    // - Enigmail.msg.wasEnigmailAddOnInstalled()
    // - Enigmail.msg.wasEnigmailEnabledForIdentity
    // - this.identity.getIntAttribute("mimePreferOpenPGP") > 0

    Enigmail.msg.composeOpen();
    //Enigmail.msg.processFinalState();

    //Enigmail.msg.setFinalSendMode('final-pgpmimeYes');
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
        // do not process the event any futher
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
            res = (this.identity.getBoolAttribute("sign_mail"));
          }
          else {
            res = (this.identity.getIntAttribute("defaultSigningPolicy") > 0);
          }
          break;
        case 'encrypt':
          if (preferSmimeByDefault) {
            res = (this.identity.getIntAttribute("encryptionpolicy") > 0);
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
          res = this.identity.getBoolAttribute(key);
          break;
      }
      //EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.getAccDefault:   "+key+"="+res+"\n");
      return res;
    }
    else if (Enigmail.msg.isSmimeEnabled()) {
      switch (key) {
        case 'sign':
          res = this.identity.getBoolAttribute("sign_mail");
          break;
        case 'encrypt':
          res = (this.identity.getIntAttribute("encryptionpolicy") > 0);
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
    let id = getCurrentIdentity();

    return (
      id.getUnicharAttribute("signing_cert_name") !== "" ||
      id.getUnicharAttribute("encryption_cert_name") !== ""
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

    return id.getBoolAttribute("sign_mail");
  },
  */

  setIdentityDefaults() {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.setIdentityDefaults\n"
    );

    this.identity = getCurrentIdentity();

    // reset default send settings, unless we have changed them already

    // instead of sendModeDirty, use gUserTouched*

    /*
    if (!this.sendModeDirty) {
      //this.mimePreferOpenPGP = this.identity.getIntAttribute("mimePreferOpenPGP");
      //this.processAccountSpecificDefaultOptions();
      this.determineSendFlags(); // important to use identity specific settings
      //this.processFinalState();
    }
    */
  },

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
    let draftId = gMsgCompose.compFields.draftId;
    let msgUri = null;

    if (typeof draftId == "string" && draftId.length > 0) {
      // original message is draft
      msgUri = draftId.replace(/\?.*$/, "");
    } else if (
      typeof gMsgCompose.originalMsgURI == "string" &&
      gMsgCompose.originalMsgURI.length > 0
    ) {
      // original message is a "true" mail
      msgUri = gMsgCompose.originalMsgURI;
    }

    return msgUri;
  },

  getMsgHdr(msgUri) {
    if (!msgUri) {
      msgUri = this.getOriginalMsgUri();
    }
    if (msgUri) {
      let messenger = Cc["@mozilla.org/messenger;1"].getService(
        Ci.nsIMessenger
      );
      return messenger.messageServiceFromURI(msgUri).messageURIToMsgHdr(msgUri);
    }
    return null;
  },

  getMsgProperties(draft) {
    EnigmailLog.DEBUG(
      "enigmailMessengerOverlay.js: Enigmail.msg.getMsgProperties:\n"
    );

    let msgUri = this.getOriginalMsgUri();
    let self = this;
    let properties = 0;
    try {
      let msgHdr = this.getMsgHdr(msgUri);
      if (msgHdr) {
        let msgUrl = EnigmailMsgRead.getUrlFromUriSpec(msgUri);
        properties = msgHdr.getUint32Property("enigmail");
        try {
          EnigmailMime.getMimeTreeFromUrl(msgUrl.spec, false, function(
            mimeMsg
          ) {
            if (draft) {
              self.setDraftOptions(mimeMsg);
              if (self.draftSubjectEncrypted) {
                self.setOriginalSubject(msgHdr.subject, false);
              }
            } else if (EnigmailURIs.isEncryptedUri(msgUri)) {
              self.setOriginalSubject(msgHdr.subject, false);
            }
          });
        } catch (ex) {
          EnigmailLog.DEBUG(
            "enigmailMessengerOverlay.js: Enigmail.msg.getMsgProperties: excetion in getMimeTreeFromUrl\n"
          );
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

  setDraftOptions(mimeMsg) {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.setDraftOptions\n"
    );

    var stat = "";
    if (mimeMsg && mimeMsg.headers.has("x-enigmail-draft-status")) {
      stat = String(mimeMsg.headers.get("x-enigmail-draft-status").join(""));
    } else {
      return;
    }

    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.setDraftOptions: draftStatus: " +
        stat +
        "\n"
    );

    // TODO: rewrite to properly read old draft header information
    /*
    if (stat.substr(0, 1) == "N") {
      // new style drafts (Enigmail 1.7)

      var enc = "final-encryptDefault";
      switch (Number(stat.substr(1, 1))) {
        case EnigmailConstants.ENIG_NEVER:
          enc = "final-encryptNo";
          break;
        case EnigmailConstants.ENIG_ALWAYS:
          enc = "final-encryptYes";
      }

      var sig = "final-signDefault";
      switch (Number(stat.substr(2, 1))) {
        case EnigmailConstants.ENIG_NEVER:
          sig = "final-signNo";
          break;
        case EnigmailConstants.ENIG_ALWAYS:
          sig = "final-signYes";
      }

      var pgpMime = "final-pgpmimeDefault";
      switch (Number(stat.substr(3, 1))) {
        case EnigmailConstants.ENIG_NEVER:
          pgpMime = "final-pgpmimeNo";
          break;
        case EnigmailConstants.ENIG_ALWAYS:
          pgpMime = "final-pgpmimeYes";
      }

      Enigmail.msg.setFinalSendMode(enc);
      Enigmail.msg.setFinalSendMode(sig);
      Enigmail.msg.setFinalSendMode(pgpMime);

      if (stat.substr(4, 1) == "1")
        Enigmail.msg.attachOwnKeyObj.appendAttachment = true;
      if (stat.substr(5, 1) == "1")
        Enigmail.msg.draftSubjectEncrypted = true;
    }
    else {
      // drafts from older versions of Enigmail
      var flags = Number(stat);
      if (flags & EnigmailConstants.SEND_SIGNED) Enigmail.msg.setFinalSendMode('final-signYes');
      if (flags & EnigmailConstants.SEND_ENCRYPTED) Enigmail.msg.setFinalSendMode('final-encryptYes');
      if (flags & EnigmailConstants.SEND_ATTACHMENT)
        Enigmail.msg.attachOwnKeyObj.appendAttachment = true;
    }
    //Enigmail.msg.setOwnKeyStatus();
    */
  },

  setOriginalSubject(subject, forceSetting) {
    const CT = Ci.nsIMsgCompType;
    let subjElem = document.getElementById("msgSubject");
    let prefix = "";

    if (!subjElem) {
      return;
    }

    switch (gMsgCompose.type) {
      case CT.ForwardInline:
      case CT.ForwardAsAttachment:
        prefix = this.getMailPref("mail.forward_subject_prefix") + ": ";
        break;
      case CT.Reply:
      case CT.ReplyAll:
      case CT.ReplyToSender:
      case CT.ReplyToGroup:
      case CT.ReplyToSenderAndGroup:
      case CT.ReplyToList:
        if (!subject.startsWith("Re: ")) {
          prefix = "Re: ";
        }
    }

    let doSetSubject = forceSetting;
    switch (gMsgCompose.type) {
      case CT.Draft:
      case CT.Template:
      case CT.EditTemplate:
      case CT.ForwardInline:
      case CT.ForwardAsAttachment:
      case CT.EditAsNew:
        doSetSubject = true;
        break;
    }

    if (doSetSubject) {
      subject = EnigmailData.convertToUnicode(subject, "UTF-8");
      subject = jsmime.headerparser.decodeRFC2047Words(subject, "utf-8");

      if (subjElem.value == "Re: " + subject) {
        return;
      }

      let newSubj = prefix + subject;

      if (
        newSubj !== subjElem.value ||
        newSubj !== gMsgCompose.compFields.subject
      ) {
        gMsgCompose.compFields.subject = newSubj;
        subjElem.value = newSubj;
        if (typeof subjElem.oninput === "function") {
          subjElem.oninput();
        }
      }
    }
  },

  setupMenuAndToolbar() {
    /*
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.setupMenuAndToolbar\n"
    );
    let toolbarTxt = document.getElementById("enigmail-toolbar-text");
    let encBroadcaster = document.getElementById("enigmail-bc-encrypt");
    let signBroadcaster = document.getElementById("enigmail-bc-sign");
    let attachBroadcaster = document.getElementById("enigmail-bc-attach");
    let enigmailMenu = document.getElementById("menu_Enigmail");

    encBroadcaster.removeAttribute("hidden");
    signBroadcaster.removeAttribute("hidden");
    attachBroadcaster.removeAttribute("hidden");
    if (toolbarTxt) {
      toolbarTxt.removeAttribute("hidden");
    }
    enigmailMenu.removeAttribute("hidden");
    */
  },

  composeOpen() {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.composeOpen\n"
    );

    var msgFlags;
    var msgUri = null;
    var msgIsDraft = false;

    this.setupMenuAndToolbar();

    this.determineSendFlagId = null;
    //this.disableSmime = false;
    this.saveDraftError = 0;
    this.protectHeaders = EnigmailPrefs.getPref("protectedHeaders") !== 0;
    //this.enableUndoEncryption(false);

    this.displayProtectHeadersStatus();

    var toobarElem = document.getElementById("composeToolbar2");
    if (toobarElem && EnigmailOS.getOS() == "Darwin") {
      toobarElem.setAttribute("platform", "macos");
    }

    /*
    // remove overlay_source from enigmail-bc-sendprocess, which will be inherited to
    // addressCol2 and addressCol1 (those would be removed if Enigmail is uninstalled)
    let bc = document.getElementById("enigmail-bc-sendprocess");
    bc.removeAttribute("overlay_source");
    */

    var draftId = gMsgCompose.compFields.draftId;
    let selectedElement = document.activeElement;

    //if (EnigmailPrefs.getPref("keepSettingsForReply") && (!(this.sendMode & ENCRYPT)) || (typeof(draftId) == "string" && draftId.length > 0)) {
    if (typeof draftId == "string" && draftId.length > 0) {
      /* global gEncryptedURIService: false */
      /*
      if (gEncryptedURIService && gEncryptedURIService.isEncrypted(gMsgCompose.originalMsgURI)) {
        // Enable S/MIME encryption if original is known as encrypted.
        //this.setFinalSendMode('final-encryptYes');
      }
      */
      msgUri = this.getOriginalMsgUri();

      if (typeof draftId == "string" && draftId.length > 0) {
        // original message is draft
        msgIsDraft = true;
      }

      if (msgUri) {
        msgFlags = this.getMsgProperties(msgIsDraft);
        if (!msgIsDraft) {
          if (msgFlags & EnigmailConstants.DECRYPTION_OKAY) {
            EnigmailLog.DEBUG(
              "enigmailMsgComposeOverlay.js: Enigmail.msg.composeOpen: has encrypted originalMsgUri\n"
            );
            EnigmailLog.DEBUG(
              "originalMsgURI=" + gMsgCompose.originalMsgURI + "\n"
            );
            //this.setFinalSendMode('final-encryptYes');
            gIsRelatedToEncryptedOriginal = true;

            this.identity = getCurrentIdentity();
            if (this.identity.getBoolAttribute("pgpSignEncrypted")) {
              //this.setFinalSendMode('final-signYes');
            }

            //this.disableSmime = true;
          } else if (
            msgFlags &
            (EnigmailConstants.GOOD_SIGNATURE |
              EnigmailConstants.BAD_SIGNATURE |
              EnigmailConstants.UNCERTAIN_SIGNATURE)
          ) {
            //this.setSendMode('sign');
            gIsRelatedToSignedOriginal = true;
          }
        }
        this.removeAttachedKey();
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

  initRadioMenu(prefName, optionIds) {
    EnigmailLog.DEBUG(
      "enigmailMessengerOverlay.js: Enigmail.msg.initRadioMenu: " +
        prefName +
        "\n"
    );

    var prefValue = EnigmailPrefs.getPref(prefName);

    if (prefValue >= optionIds.length) {
      return;
    }

    var menuItem = document.getElementById("enigmail_" + optionIds[prefValue]);
    if (menuItem) {
      menuItem.setAttribute("checked", "true");
    }
  },

  /*
  toggleAttachOwnKey: function() {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.toggleAttachOwnKey\n");
    EnigmailCore.getService(window); // make sure Enigmail is loaded and working

    gAttachMyPublicPGPKey = !gAttachMyPublicPGPKey;

    //this.setOwnKeyStatus();
  },
  */

  /*
  toggleProtectHeaders: function() {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.toggleProtectHeaders\n");
    EnigmailCore.getService(window); // make sure Enigmail is loaded and working

    this.protectHeaders = !this.protectHeaders;

    this.displayProtectHeadersStatus();
  },
  */

  displayProtectHeadersStatus() {
    /*
    let bc = document.getElementById("enigmail-bc-protectHdr");

    if (this.protectHeaders) {
      bc.setAttribute("checked", "true");
      bc.setAttribute("tooltiptext", EnigmailLocale.getString("msgCompose.protectSubject.tooltip"));
    }
    else {
      bc.removeAttribute("checked");
      bc.setAttribute("tooltiptext", EnigmailLocale.getString("msgCompose.noSubjectProtection.tooltip"));
    }
    */
  },

  /***
   * set broadcaster to display whether the own key is attached or not
   */

  /*
  setOwnKeyStatus: function() {
    return;
    let bc = document.getElementById("enigmail-bc-attach");
    let attachIcon = document.getElementById("button-enigmail-attach");

    if (this.allowAttachOwnKey() === 0) {
      this.statusAttachOwnKey = EnigmailLocale.getString("attachOwnKeyDisabled");
    }
    else {
      if (gAttachMyPublicPGPKey) {
        bc.setAttribute("addPubkey", "true");
        bc.setAttribute("checked", "true");
        this.statusAttachOwnKey = EnigmailLocale.getString("attachOwnKeyYes");
      }
      else {
        bc.setAttribute("addPubkey", "false");
        bc.removeAttribute("checked");
        this.statusAttachOwnKey = EnigmailLocale.getString("attachOwnKeyNo");
      }
    }

    if (attachIcon)
      attachIcon.setAttribute("tooltiptext", this.statusAttachOwnKey);

  },
  */

  attachOwnKey(id) {
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
    let revokedIDs = EnigmailKeyRing.findRevokedPersonalKeysByEmail(
      gCurrentIdentity.email
    );

    if (!this.attachOwnKeyObj.attachedKey) {
      let hex = "0x" + id;
      let myID = [hex];
      let allIds = myID.concat(revokedIDs);
      var attachedObj = this.extractAndAttachKey(
        allIds,
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

  async attachKey() {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.attachKey: \n"
    );

    var resultObj = {};
    var inputObj = {};
    inputObj.dialogHeader = await document.l10n.formatValue("keys-to-export");
    inputObj.options = "multisel,allowexpired,nosending";
    window.openDialog(
      "chrome://openpgp/content/ui/enigmailKeySelection.xhtml",
      "",
      "dialog,modal,centerscreen,resizable",
      inputObj,
      resultObj
    );
    try {
      if (resultObj.cancelled) {
        return;
      }
      this.extractAndAttachKey(resultObj.userList, null, true, false);
    } catch (ex) {
      // cancel pressed -> do nothing
    }
  },

  extractAndAttachKey(
    uidArray,
    emailForFilename,
    warnOnError,
    additionalKeysAreRevocations
  ) {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.extractAndAttachKey: \n"
    );
    var enigmailSvc = EnigmailCore.getService(window);
    if (!enigmailSvc) {
      return null;
    }

    var tmpDir = EnigmailFiles.getTempDir();
    var tmpFile;
    try {
      tmpFile = Cc[LOCAL_FILE_CONTRACTID].createInstance(Ci.nsIFile);
      tmpFile.initWithPath(tmpDir);
      if (!(tmpFile.isDirectory() && tmpFile.isWritable())) {
        document.l10n.formatValue("no-temp-dir").then(value => {
          EnigmailDialog.alert(window, value);
        });
        return null;
      }
    } catch (ex) {
      EnigmailLog.writeException(
        "enigmailMsgComposeOverlay.js: Enigmail.msg.extractAndAttachKey",
        ex
      );
    }
    tmpFile.append("key.asc");
    tmpFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);

    // save file
    var exitCodeObj = {};
    var errorMsgObj = {};

    EnigmailKeyRing.extractKey(
      false,
      uidArray,
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
    var ioServ = Services.io;
    var tmpFileURI = ioServ.newFileURI(tmpFile);
    var keyAttachment = Cc[
      "@mozilla.org/messengercompose/attachment;1"
    ].createInstance(Ci.nsIMsgAttachment);
    keyAttachment.url = tmpFileURI.spec;
    if (
      (uidArray.length == 1 || additionalKeysAreRevocations) &&
      uidArray[0].search(/^(0x)?[a-fA-F0-9]+$/) === 0
    ) {
      keyAttachment.name = uidArray[0].substr(-16, 16);
      if (keyAttachment.name.search(/^0x/) < 0) {
        keyAttachment.name = "0x" + keyAttachment.name;
      }
      let withRevSuffix = "";
      if (uidArray.length > 1 && additionalKeysAreRevocations) {
        withRevSuffix = "_and_old_rev";
      }
      // let normalizedEmail = emailForFilename.replace(" ", "_");
      // emailForFilename is currently unused
      keyAttachment.name =
        "OpenPGP_" + keyAttachment.name + withRevSuffix + ".asc";
    } else {
      keyAttachment.name = "pgpkeys.asc";
    }
    keyAttachment.temporary = true;
    keyAttachment.contentType = "application/pgp-keys";

    // add attachment to msg
    this.addAttachment(keyAttachment);

    // XXX TODO: ChangeAttachmentBucketVisibility() doesn't exist.
    try {
      // TB only
      ChangeAttachmentBucketVisibility(false);
    } catch (ex) {}
    gContentChanged = true;
    return keyAttachment;
  },

  addAttachment(attachment) {
    AddAttachments([attachment]);
  },

  /*
  enableUndoEncryption: function(newStatus) {
    return;
    let eue = document.getElementById("enigmail_undo_encryption");

    if (newStatus) {
      eue.removeAttribute("disabled");
    }
    else
      eue.setAttribute("disabled", "true");
  },
  */

  /**
   *  undo the encryption or signing; get back the original (unsigned/unencrypted) text
   *
   * useEditorUndo |Number|:   > 0  use undo function of editor |n| times
   *                           0: replace text with original text
   */
  /*
  undoEncryption: function(useEditorUndo) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.undoEncryption:\n");
    if (this.processed) {
      if (useEditorUndo) {
        EnigmailTimer.setTimeout(function _f() {
          Enigmail.msg.editor.undo(useEditorUndo);
        }, 10);
      }
      else {
        this.replaceEditorText(this.processed.origText);
        this.enableUndoEncryption(false);
      }
      this.processed = null;

    }
    else {
      this.decryptQuote(true);
    }

    var node;
    var nodeNumber;
    this.removeAttachedKey();
  },
  */

  removeAttachedKey() {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.removeAttachedKey: \n"
    );

    var bucketList = document.getElementById("attachmentBucket");
    var node = bucketList.firstChild;

    if (
      bucketList &&
      bucketList.hasChildNodes() &&
      this.attachOwnKeyObj.attachedObj
    ) {
      // undo attaching own key
      while (node) {
        if (node.attachment.url == this.attachOwnKeyObj.attachedObj.url) {
          node = bucketList.removeChild(node);
          // Let's release the attachment object held by the node else it won't go away until the window is destroyed
          node.attachment = null;
          this.attachOwnKeyObj.attachedObj = null;
          this.attachOwnKeyObj.attachedKey = null;
          node = null; // exit loop
        } else {
          node = node.nextSibling;
        }
      }
      if (!bucketList.hasChildNodes()) {
        // XXX TODO: ChangeAttachmentBucketVisibility() doesn't exist.
        try {
          // TB only
          ChangeAttachmentBucketVisibility(true);
        } catch (ex) {}
      }
    }
  },

  getSecurityParams(compFields = null, doQueryInterface = false) {
    if (!compFields) {
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
    let p = Enigmail.msg.getSecurityParams();
    if (EnigmailMimeEncrypt.isEnigmailCompField(p)) {
      let si = p.wrappedJSObject;
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

  wasEnigmailAddOnInstalled() {
    return EnigmailPrefs.getPref("configuredVersion") !== "";
  },

  wasEnigmailEnabledForIdentity() {
    return this.identity.getBoolAttribute("enablePgp");
  },

  // TODO: should we use a different flag for "PGP is enabled in TB78+"?
  //       or check in combination with identityEnigmailPrefsMigrated?
  isEnigmailEnabledForIdentity() {
    //return this.identity.getBoolAttribute("enablePgp");
    return true;
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
      EnigmailCore.getService(window); // try to access Enigmail to launch the wizard if needed
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
    @param sendFlags: contains the sendFlags if the message is really processed. Optional, can be null
      - uses as INPUT:
         - this.sendMode
         - this.encryptForced, this.encryptSigned
      - uses as OUTPUT:
         - this.statusEncrypt, this.statusSign

    no return value
  */
  processFinalState(sendFlags) {
    /*
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.processFinalState()\n");

    const SIGN = EnigmailConstants.SEND_SIGNED;
    const ENCRYPT = EnigmailConstants.SEND_ENCRYPTED;


    let encReason = "";
    let signReason = "";
    let pgpEnabled = Enigmail.msg.wasEnigmailEnabledForIdentity();
    let smimeEnabled = Enigmail.msg.isSmimeEnabled();

    // ------ 1. process OpenPGP status ------

    //pgpEnabled
    //smimeEnabled



    // ------ 2. Process S/MIME status  ------
    if (gSMFields) {

        //gSMFields.requireEncryptMessage = false;
        //gSMFields.signMessage = false;

        if (!encryptSmime) {
          if (autoSendEncrypted === 1) {
            if (this.isSmimeEncryptionPossible()) {
              if (this.mimePreferOpenPGP === 0) {
                // S/MIME is preferred and encryption is possible
                encryptSmime = true;
              }
            }
          }
        }
        //gSMFields.requireEncryptMessage = true;
        //gSMFields.signMessage = true;

      // smime policy
      //if (this.identity.getIntAttribute("encryptionpolicy") > 0)

      // update the S/MIME GUI elements
      try {
        setSecuritySettings("1");
      }
      catch (ex) {}

      try {
        setSecuritySettings("2");
      }
      catch (ex) {}
    }
    */
  },

  /* check if encryption is possible (have keys for everyone or not)
   */
  async determineSendFlags() {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.focusChange: Enigmail.msg.determineSendFlags\n"
    );

    let detailsObj = {};

    if (!this.identity) {
      this.identity = getCurrentIdentity();
    }

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

      // We don't need the returned array of valid keys
      await Enigmail.hlp.validKeysForAllRecipients(
        toAddrList.join(", "),
        detailsObj
      );
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
      this.encryptForced = EnigmailConstants.ENIG_UNDEF;
      this.signForced = EnigmailConstants.ENIG_UNDEF;
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

    // TODO: rewrite to properly set draft status using new flags
    /*
    // Draft Status:
    // N (for new style) plus String of 4 numbers:
    // 1: encryption
    // 2: signing
    // 3: PGP/MIME
    // 4: attach own key
    // 5: subject encrypted

    var draftStatus = "N" +
      (gSendEncrypted && !gOptionalEncryption) +
      (gSendSigned) +
      (gAttachMyPublicPGPKey ? "1" : "0") + (doEncrypt && this.protectHeaders ? "1" : "0");

    this.setAdditionalHeader("X-Enigmail-Draft-Status", draftStatus);
    */
  },

  getSenderUserId() {
    let keyId = this.identity.getUnicharAttribute("openpgp_key_id");
    return "0x" + keyId;
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

    let si = Enigmail.msg.getSecurityParams(null, true);
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

  /**
   * check if S/MIME encryption can be enabled
   *
   * @return: Boolean - true: keys for all recipients are available
   */
  isSmimeEncryptionPossible() {
    let id = getCurrentIdentity();
    if (id.getUnicharAttribute("encryption_cert_name") === "") {
      return false;
    }

    // Enable encryption if keys for all recipients are available.
    try {
      if (!gMsgCompose.compFields.hasRecipients) {
        return false;
      }
      let addresses = Cc["@mozilla.org/messenger-smime/smimejshelper;1"]
        .createInstance(Ci.nsISMimeJSHelper)
        .getNoCertAddresses(gMsgCompose.compFields);
      return addresses.length == 0;
    } catch (e) {
      return false;
    }
  },

  /* Manage the wrapping of inline signed mails
   *
   * @wrapresultObj: Result:
   * @wrapresultObj.cancelled, true if send operation is to be cancelled, else false
   * @wrapresultObj.usePpgMime, true if message send option was changed to PGP/MIME, else false
   */

  wrapInLine(wrapresultObj) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: WrapInLine\n");
    wrapresultObj.cancelled = false;
    wrapresultObj.usePpgMime = false;
    try {
      const dce = Ci.nsIDocumentEncoder;
      var editor = gMsgCompose.editor.QueryInterface(Ci.nsIEditorMailSupport);
      var encoderFlags = dce.OutputFormatted | dce.OutputLFLineBreak;

      var wrapWidth = this.getMailPref("mailnews.wraplength");
      if (wrapWidth > 0 && wrapWidth < 68 && editor.wrapWidth > 0) {
        if (
          EnigmailDialog.confirmDlg(
            window,
            l10n.formatValueSync("minimal-line-wrapping", {
              width: wrapWidth,
            })
          )
        ) {
          wrapWidth = 68;
          EnigmailPrefs.getPrefRoot().setIntPref(
            "mailnews.wraplength",
            wrapWidth
          );
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
  saveDraftMessage() {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: saveDraftMessage()\n");

    let doEncrypt =
      Enigmail.msg.isEnigmailEnabledForIdentity() &&
      this.identity.getBoolAttribute("autoEncryptDrafts");

    this.setDraftStatus(doEncrypt);

    if (!doEncrypt) {
      EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: drafts disabled\n");

      try {
        let p = Enigmail.msg.getSecurityParams();
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
      EnigmailConstants.SAVE_MESSAGE;

    if (this.protectHeaders) {
      sendFlags |= EnigmailConstants.ENCRYPT_HEADERS;
    }

    let fromAddr = this.identity.email;
    let userIdValue = this.getSenderUserId();
    if (userIdValue) {
      fromAddr = userIdValue;
    }

    let enigmailSvc = EnigmailCore.getService(window);
    if (!enigmailSvc) {
      return true;
    }

    //if (this.preferPgpOverSmime(sendFlags) === 0) return true; // use S/MIME

    // Try to save draft

    var testExitCodeObj = {};
    var testStatusFlagsObj = {};
    var testErrorMsgObj = {};

    // encrypt test message for test recipients
    var testPlain = "Test Message";
    var testUiFlags = EnigmailConstants.UI_TEST;
    EnigmailLog.DEBUG(
      'enigmailMsgComposeOverlay.js: Enigmail.msg.saveDraft(): call encryptMessage() for fromAddr="' +
        fromAddr +
        '"\n'
    );
    EnigmailEncryption.encryptMessage(
      null,
      testUiFlags,
      testPlain,
      fromAddr,
      fromAddr,
      "",
      sendFlags | EnigmailConstants.SEND_TEST,
      testExitCodeObj,
      testStatusFlagsObj,
      testErrorMsgObj
    );

    if (
      testStatusFlagsObj.value &
      (EnigmailConstants.INVALID_RECIPIENT | EnigmailConstants.NO_SECKEY)
    ) {
      // check if own key is invalid
      if (testErrorMsgObj.value && testErrorMsgObj.value.length > 0) {
        ++this.saveDraftError;
        if (this.saveDraftError === 1) {
          document.l10n
            .formatValue("msg-compose-cannot-save-draft")
            .then(value => {
              this.notifyUser(
                3,
                value,
                "saveDraftFailed",
                testErrorMsgObj.value
              );
            });
        }
        return false;
      }
    }

    let secInfo;

    let param = Enigmail.msg.getSecurityParams();
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
    secInfo.recipients = fromAddr;
    secInfo.bccRecipients = "";
    secInfo.originalSubject = gMsgCompose.compFields.subject;
    this.dirty = true; // inconsistent, other places use int. should this be 1 ?

    if (this.protectHeaders) {
      gMsgCompose.compFields.subject = "";
    }

    return true;
  },

  createEnigmailSecurityFields(oldSecurityInfo) {
    let newSecurityInfo = EnigmailMimeEncrypt.createMimeEncrypt(
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
          this.attachOwnKey();
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

    console.debug(
      `in getEncryptionFlags, gSendEncrypted=${gSendEncrypted}, gSendSigned=${gSendSigned}`
    );

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
      f |= EnigmailConstants.SEND_TWO_MIME_LAYERS;
    }

    return f;
  },

  resetDirty() {
    let newSecurityInfo = null;

    if (this.dirty) {
      // make sure the sendFlags are reset before the message is processed
      // (it may have been set by a previously cancelled send operation!)

      let si = Enigmail.msg.getSecurityParams();

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

  determineMsgRecipients(sendFlags) {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.determineMsgRecipients: currentId=" +
        this.identity +
        ", " +
        this.identity.email +
        "\n"
    );

    let fromAddr = this.identity.email;
    let toAddrList = [];
    let recList;
    let bccAddrList = [];
    let arrLen = {};
    let splitRecipients;

    if (!Enigmail.msg.isEnigmailEnabledForIdentity()) {
      return true;
    }

    let optSendFlags = 0;
    let msgCompFields = gMsgCompose.compFields;
    let newsgroups = msgCompFields.newsgroups;

    if (EnigmailPrefs.getPref("encryptToSelf")) {
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

    splitRecipients = msgCompFields.splitRecipients;

    if (msgCompFields.to.length > 0) {
      recList = splitRecipients(msgCompFields.to, true, arrLen);
      this.addRecipients(toAddrList, recList);
    }

    if (msgCompFields.cc.length > 0) {
      recList = splitRecipients(msgCompFields.cc, true, arrLen);
      this.addRecipients(toAddrList, recList);
    }

    // special handling of bcc:
    // - note: bcc and encryption is a problem
    // - but bcc to the sender is fine
    if (msgCompFields.bcc.length > 0) {
      recList = splitRecipients(msgCompFields.bcc, true, arrLen);

      var bccLC = "";
      try {
        bccLC = EnigmailFuncs.stripEmail(msgCompFields.bcc).toLowerCase();
      } catch (ex) {}
      EnigmailLog.DEBUG(
        "enigmailMsgComposeOverlay.js: Enigmail.msg.determineMsgRecipients: BCC: " +
          bccLC +
          "\n"
      );

      // It's equal, if self's email address is the only entry in BCC.
      var selfBCC =
        this.identity.email && this.identity.email.toLowerCase() == bccLC;

      if (selfBCC) {
        EnigmailLog.DEBUG(
          "enigmailMsgComposeOverlay.js: Enigmail.msg.determineMsgRecipients: Self BCC\n"
        );
        this.addRecipients(toAddrList, recList);
      } else if (sendFlags & EnigmailConstants.SEND_ENCRYPTED) {
        EnigmailDialog.alert(
          window,
          l10n.formatValueSync("sending-hidden-rcpt")
        );
        return false;
      }
    }

    if (newsgroups) {
      toAddrList.push(newsgroups);

      if (sendFlags & EnigmailConstants.SEND_ENCRYPTED) {
        if (!EnigmailPrefs.getPref("encryptToNews")) {
          document.l10n.formatValue("sending-news").then(value => {
            EnigmailDialog.alert(window, value);
          });
          return false;
        } else if (
          !EnigmailDialog.confirmPref(
            window,
            l10n.formatValueSync("send-to-news-warning"),
            "warnOnSendingNewsgroups",
            l10n.formatValueSync("msg-compose-button-send")
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
      if (this.processed) {
        //this.undoEncryption(0);
      } else {
        this.removeAttachedKey();
      }

      return false;
    }

    return true;
  },

  prepareSecurityInfo(sendFlags, uiFlags, rcpt, newSecurityInfo, keyMap = {}) {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.prepareSecurityInfo(): Using PGP/MIME, flags=" +
        sendFlags +
        "\n"
    );

    let oldSecurityInfo = Enigmail.msg.getSecurityParams();

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

    if (this.protectHeaders) {
      sendFlags |= EnigmailConstants.ENCRYPT_HEADERS;

      if (sendFlags & EnigmailConstants.SEND_ENCRYPTED) {
        gMsgCompose.compFields.subject = "";

        if (EnigmailPrefs.getPref("protectReferencesHdr")) {
          gMsgCompose.compFields.references = "";
        }
      }
    }

    newSecurityInfo.sendFlags = sendFlags;
    newSecurityInfo.UIFlags = uiFlags;
    newSecurityInfo.senderEmailAddr = rcpt.fromAddr;
    newSecurityInfo.bccRecipients = rcpt.bccAddrStr;
    newSecurityInfo.keyMap = keyMap;

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
        return this.saveDraftMessage();
    }

    this.unsetAdditionalHeader("x-enigmail-draft-status");

    let msgCompFields = gMsgCompose.compFields;
    let newsgroups = msgCompFields.newsgroups; // Check if sending to any newsgroups

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

    this.identity = getCurrentIdentity();
    let senderKeyId = this.identity.getUnicharAttribute("openpgp_key_id");

    if ((gSendEncrypted || gSendSigned) && !senderKeyId) {
      let msgId = gSendEncrypted
        ? "cannot-send-enc-because-no-own-key"
        : "cannot-send-sig-because-no-own-key";
      let fullAlert = await document.l10n.formatValue(msgId, {
        key: this.identity.email,
      });
      EnigmailDialog.alert(window, fullAlert);
      return false;
    }

    let senderKeyIsGnuPG =
      Services.prefs.getBoolPref("mail.openpgp.allow_external_gnupg") &&
      this.identity.getBoolAttribute("is_gnupg_key_id");
    if (senderKeyIsGnuPG) {
      sendFlags |= EnigmailConstants.SEND_SENDER_KEY_EXTERNAL;
    }

    if ((gSendEncrypted || gSendSigned) && senderKeyId) {
      let senderKeyUsable = await EnigmailEncryption.determineOwnKeyUsability(
        sendFlags,
        senderKeyId,
        senderKeyIsGnuPG
      );
      if (senderKeyUsable.errorMsg) {
        let fullAlert = await document.l10n.formatValue(
          "cannot-use-own-key-because",
          {
            problem: senderKeyUsable.errorMsg,
          }
        );
        EnigmailDialog.alert(window, fullAlert);
        return false;
      }
    }

    let cannotEncryptMissingInfo = "";
    if (gSendEncrypted) {
      let canEncryptDetails = await this.determineSendFlags();
      if (canEncryptDetails.errArray.length != 0) {
        let isFirst = true;
        let allProblems = "";
        for (let obj of canEncryptDetails.errArray) {
          if (isFirst) {
            isFirst = false;
          } else {
            allProblems += ", ";
          }
          allProblems += obj.addr;
        }

        cannotEncryptMissingInfo = l10n.formatValueSync(
          "cannot-encrypt-because-missing",
          {
            problem: allProblems,
          }
        );

        // Delay showing the alert until after determineMsgRecipients()
        // has checked that BCC recipients aren't an issue.
        // A BCC problem should be notified first. Only afterwards we
        // should tell the user to get missing keys.
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
      let rcpt = this.determineMsgRecipients(sendFlags);
      if (typeof rcpt === "boolean") {
        return rcpt;
      }
      sendFlags = rcpt.sendFlags;

      if (cannotEncryptMissingInfo) {
        EnigmailDialog.alert(window, cannotEncryptMissingInfo);
        showMessageComposeSecurityStatus();
        return false;
      }

      if (this.sendPgpMime) {
        // Use PGP/MIME
        sendFlags |= EnigmailConstants.SEND_PGP_MIME;
      }

      let toAddrStr = rcpt.toAddrList.join(", ");
      let bccAddrStr = rcpt.bccAddrList.join(", ");
      let keyMap = {};

      if (gAttachMyPublicPGPKey) {
        this.attachOwnKey(senderKeyId);
      }

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

      /*
      if (!this.checkProtectHeaders(sendFlags)) {
        return false;
      }
      */

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

        this.wrapInLine(wrapresultObj);

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
          keyMap
        );
        newSecurityInfo.recipients = toAddrStr;
        newSecurityInfo.bccRecipients = bccAddrStr;
      } else if (!this.processed && sendFlags & (ENCRYPT | SIGN)) {
        // use inline PGP

        let sendInfo = {
          sendFlags,
          fromAddr: rcpt.fromAddr,
          toAddr: toAddrStr,
          bccAddr: bccAddrStr,
          uiFlags,
          bucketList: document.getElementById("attachmentBucket"),
        };

        if (!this.signInline(sendInfo)) {
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

  /*
  checkProtectHeaders(sendFlags) {
    if (!(sendFlags & EnigmailConstants.SEND_PGP_MIME)) {
      return true;
    }
    if (sendFlags & EnigmailConstants.SEND_ENCRYPTED) {
      if (
        !this.protectHeaders &&
        EnigmailPrefs.getPref("protectedHeaders") === 1
      ) {
        let enableProtection = EnigmailDialog.msgBox(window, {
          dialogTitle: EnigmailLocale.getString(
            "msgCompose.protectSubject.dialogTitle"
          ),
          msgtext: EnigmailLocale.getString(
            "msgCompose.protectSubject.question"
          ),
          iconType: EnigmailConstants.ICONTYPE_QUESTION,
          button1: EnigmailLocale.getString(
            "msgCompose.protectSubject.yesButton"
          ),
          button2:
            "extra1:" +
            EnigmailLocale.getString("msgCompose.protectSubject.noButton"),
        });

        if (enableProtection === -1) {
          return false;
        }

        EnigmailPrefs.setPref(
          "protectedHeaders",
          enableProtection === 0 ? 2 : 0
        );
        this.protectHeaders = enableProtection === 0;
        this.displayProtectHeadersStatus();
      }
    }

    return true;
  },
  */

  signInline(sendInfo) {
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

    var enigmailSvc = EnigmailCore.getService(window);
    if (!enigmailSvc) {
      return false;
    }

    try {
      if (this.getMailPref("mail.strictly_mime")) {
        if (
          EnigmailDialog.confirmPref(
            window,
            l10n.formatValueSync("quoted-printable-warn"),
            "quotedPrintableWarn"
          )
        ) {
          EnigmailPrefs.getPrefRoot().setBoolPref("mail.strictly_mime", false);
        }
      }
    } catch (ex) {}

    var sendFlowed;
    try {
      sendFlowed = this.getMailPref("mailnews.send_plaintext_flowed");
    } catch (ex) {
      sendFlowed = true;
    }
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

      //EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: escText["+encoderFlags+"] = '"+escText+"'\n");

      var charset = this.editorGetCharset();
      EnigmailLog.DEBUG(
        "enigmailMsgComposeOverlay.js: Enigmail.msg.signInline: charset=" +
          charset +
          "\n"
      );

      // Encode plaintext to charset from unicode
      var plainText = EnigmailData.convertFromUnicode(escText, charset);

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

        // Decode ciphertext from charset to unicode and overwrite
        this.replaceEditorText(
          EnigmailData.convertToUnicode(cipherText, charset)
        );

        // Save original text (for undo)
        this.processed = {
          origText,
          charset,
        };
      } else {
        // Restore original text
        this.replaceEditorText(origText);

        if (sendInfo.sendFlags & SIGN) {
          // Encryption/signing failed

          /*if (statusFlagsObj.statusMsg) {
            // check if own key is invalid
            let s = new RegExp("^(\\[GNUPG:\\] )?INV_(RECP|SGNR) [0-9]+ \\<?" + sendInfo.fromAddr + "\\>?", "m");
            if (statusFlagsObj.statusMsg.search(s) >= 0) {
              errorMsgObj.value += "\n\n" + EnigmailLocale.getString("keyError.resolutionAction");
            }
          }*/

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
      let [title, message] = await document.l10n.formatValues([
        { id: "send-aborted" },
        { id: "msg-compose-internal-error" },
      ]);
      EnigmailDialog.info(window, title + "\n" + message);
    }
  },

  getMailPref(prefName) {
    let prefRoot = EnigmailPrefs.getPrefRoot();

    var prefValue = null;
    try {
      var prefType = prefRoot.getPrefType(prefName);
      // Get pref value
      switch (prefType) {
        case prefRoot.PREF_BOOL:
          prefValue = prefRoot.getBoolPref(prefName);
          break;

        case prefRoot.PREF_INT:
          prefValue = prefRoot.getIntPref(prefName);
          break;

        case prefRoot.PREF_STRING:
          prefValue = prefRoot.getCharPref(prefName);
          break;

        default:
          prefValue = undefined;
          break;
      }
    } catch (ex) {
      // Failed to get pref value
      EnigmailLog.ERROR(
        "enigmailMsgComposeOverlay.js: Enigmail.msg.getMailPref: unknown prefName:" +
          prefName +
          " \n"
      );
    }

    return prefValue;
  },

  messageSendCheck() {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.messageSendCheck\n"
    );

    try {
      var warn = this.getMailPref("mail.warn_on_send_accel_key");

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
          EnigmailPrefs.getPrefRoot().setBoolPref(
            "mail.warn_on_send_accel_key",
            false
          );
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
    if ("otherRandomHeaders" in gMsgCompose.compFields) {
      // TB <= 36
      let h = gMsgCompose.compFields.otherRandomHeaders;
      let r = new RegExp("^(" + hdr + ":)(.*)$", "im");
      let m = h.replace(r, "").replace(/(\r\n)+/, "\r\n");
      gMsgCompose.compFields.otherRandomHeaders = m;
    } else {
      gMsgCompose.compFields.deleteHeader(hdr);
    }
  },

  // called just before sending
  modifyCompFields() {
    try {
      if (!this.identity) {
        this.identity = getCurrentIdentity();
      }

      if (Enigmail.msg.isEnigmailEnabledForIdentity()) {
        if (EnigmailPrefs.getPref("addHeaders")) {
          this.setAdditionalHeader(
            "X-Enigmail-Version",
            EnigmailApp.getVersion()
          );
        }

        this.setAutocryptHeader();
      }
    } catch (ex) {
      EnigmailLog.writeException(
        "enigmailMsgComposeOverlay.js: Enigmail.msg.modifyCompFields",
        ex
      );
    }
  },

  getCurrentIncomingServer() {
    let currentAccountKey = getCurrentAccountKey();
    let account = MailServices.accounts.getAccount(currentAccountKey);

    return account.incomingServer; /* returns nsIMsgIncomingServer */
  },

  setAutocryptHeader() {
    if (!gAttachMyPublicPGPKey) {
      return;
    }

    this.identity = getCurrentIdentity();
    let senderKeyId = this.identity.getUnicharAttribute("openpgp_key_id");
    if (!senderKeyId) {
      return;
    }

    let fromMail = this.identity.email;
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

    if (!gSelectedTechnologyIsPGP) {
      return;
    }

    let msgcomposeWindow = document.getElementById("msgcomposeWindow");
    let sendMsgType = Number(msgcomposeWindow.getAttribute("msgtype"));

    if (
      !this.sendProcess ||
      sendMsgType != Ci.nsIMsgCompDeliverMode.AutoSaveAsDraft
    ) {
      this.sendProcess = true;
      //let bc = document.getElementById("enigmail-bc-sendprocess");

      try {
        this.modifyCompFields();
        //bc.setAttribute("disabled", "true");

        const cApi = EnigmailCryptoAPI();
        let encryptResult = cApi.sync(this.prepareSendMsg(sendMsgType));
        if (!encryptResult) {
          this.resetUpdatedFields();
          event.preventDefault();
          event.stopPropagation();
        }
      } catch (ex) {
        console.debug(ex);
      }
      //bc.removeAttribute("disabled");
    } else {
      EnigmailLog.DEBUG(
        "enigmailMsgComposeOverlay.js: Enigmail.msg.sendMessageListener: sending in progress - autosave aborted\n"
      );
      event.preventDefault();
      event.stopPropagation();
    }
    this.sendProcess = false;
  },

  toggleAttribute(attrName) {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.toggleAttribute('" +
        attrName +
        "')\n"
    );

    var oldValue = EnigmailPrefs.getPref(attrName);
    EnigmailPrefs.setPref(attrName, !oldValue);
  },

  toggleAccountAttr(attrName) {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.toggleAccountAttr('" +
        attrName +
        "')\n"
    );

    var oldValue = this.identity.getBoolAttribute(attrName);
    this.identity.setBoolAttribute(attrName, !oldValue);
  },

  decryptQuote(interactive) {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.decryptQuote: " +
        interactive +
        "\n"
    );

    if (gWindowLocked || this.processed) {
      return;
    }

    var enigmailSvc = EnigmailCore.getService(window);
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

      // Delete indentation
      indentRegexp = new RegExp("^" + indentStr, "gm");

      pgpBlock = pgpBlock.replace(indentRegexp, "");
      //tail     =     tail.replace(indentRegexp, "");

      if (indentStr.match(/[ \t]*$/)) {
        indentStr = indentStr.replace(/[ \t]*$/gm, "");
        indentRegexp = new RegExp("^" + indentStr + "$", "gm");

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

    //EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.decryptQuote: pgpBlock='"+pgpBlock+"'\n");

    var charset = this.editorGetCharset();
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.decryptQuote: charset=" +
        charset +
        "\n"
    );

    // Encode ciphertext from unicode to charset
    var cipherText = EnigmailData.convertFromUnicode(pgpBlock, charset);

    if (
      !this.getMailPref("mailnews.reply_in_default_charset") &&
      blockType == "MESSAGE"
    ) {
      // set charset according to PGP block, if available (encrypted messages only)
      let armorHeaders = EnigmailArmor.getArmorHeaders(cipherText);

      if ("charset" in armorHeaders) {
        charset = armorHeaders.charset;
        gMsgCompose.SetDocumentCharset(charset);
      }
    }

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
    // Decode plaintext from charset to unicode
    plainText = EnigmailData.convertToUnicode(plainText, charset).replace(
      /\r\n/g,
      "\n"
    );

    //if (EnigmailPrefs.getPref("keepSettingsForReply")) {
    if (statusFlagsObj.value & EnigmailConstants.DECRYPTION_OKAY) {
      //this.setSendMode('encrypt');
      gIsRelatedToEncryptedOriginal = true;
      gSendEncrypted = true;
    }
    //}

    var exitCode = exitCodeObj.value;

    if (exitCode !== 0) {
      // Error processing
      var errorMsg = errorMsgObj.value;

      var statusLines = errorMsg.split(/\r?\n/);

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

    const nsIMsgCompType = Ci.nsIMsgCompType;
    var doubleDashSeparator = EnigmailPrefs.getPref("doubleDashSeparator");
    if (
      gMsgCompose.type != nsIMsgCompType.Template &&
      gMsgCompose.type != nsIMsgCompType.Draft &&
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

    var clipBoard = Services.clipboard;
    var data;
    if (clipBoard.supportsSelectionClipboard()) {
      // get the clipboard contents for selected text (X11)
      data = EnigmailClipboard.getClipboardContent(
        window,
        Ci.nsIClipboard.kSelectionClipboard
      );
    }

    // Replace encrypted quote with decrypted quote (destroys selection clipboard on X11)
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

    if (clipBoard.supportsSelectionClipboard()) {
      // restore the clipboard contents for selected text (X11)
      EnigmailClipboard.setClipboardContent(
        data,
        clipBoard.kSelectionClipboard
      );
    }

    if (interactive) {
      return;
    }

    // Position cursor
    var replyOnTop = 1;
    try {
      replyOnTop = this.identity.replyOnTop;
    } catch (ex) {}

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

    var nsISelectionController = Ci.nsISelectionController;

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
        nsISelectionController.SELECTION_NORMAL,
        nsISelectionController.SELECTION_ANCHOR_REGION,
        true
      );
    }

    //this.processFinalState();
  },

  checkInlinePgpReply(head, tail) {
    const CT = Ci.nsIMsgCompType;
    if (!this.identity) {
      return;
    }

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

          let h = head.split(/\r?\n/);
          hLines = -1;

          for (let i = 0; i < h.length; i++) {
            if (h[i].search(/[^\s>]/) >= 0) {
              hLines++;
            }
          }
        }
      }
    }

    if (hLines > 0 && (!this.identity.sigOnReply || this.identity.sigBottom)) {
      // display warning if no signature on top of message
      this.displayPartialEncryptedWarning();
    } else if (hLines > 10) {
      this.displayPartialEncryptedWarning();
    } else if (
      tail.search(/[^\s>]/) >= 0 &&
      !(this.identity.sigOnReply && this.identity.sigBottom)
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

  /**
   * Display a notification to the user at the bottom of the window
   *
   * @param priority: Number    - Priority of the message [1 = high (error) ... 3 = low (info)]
   * @param msgText: String     - Text to be displayed in notification bar
   * @param messageId: String   - Unique message type identification
   * @param detailsText: String - optional text to be displayed by clicking on "Details" button.
   *                              if null or "", then the Detail button will no be displayed.
   */
  async notifyUser(priority, msgText, messageId, detailsText) {
    let notif = document.getElementById("attachmentNotificationBox");
    if (!notif) {
      notif = gNotification.notificationbox;
    }
    let prio;

    switch (priority) {
      case 1:
        prio = notif.PRIORITY_CRITICAL_MEDIUM;
        break;
      case 3:
        prio = notif.PRIORITY_INFO_MEDIUM;
        break;
      default:
        prio = notif.PRIORITY_WARNING_MEDIUM;
    }

    let buttonArr = [];

    if (detailsText && detailsText.length > 0) {
      let [accessKey, label] = await document.l10n.formatValues([
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
    notif.appendNotification(msgText, messageId, null, prio, buttonArr);
  },

  /**
   * Display a warning message if we are replying to or forwarding
   * a partially decrypted inline-PGP email
   */
  async displayPartialEncryptedWarning() {
    let [msgLong, msgShort] = await document.l10n.formatValues([
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

  editorGetCharset() {
    EnigmailLog.DEBUG(
      "enigmailMsgComposeOverlay.js: Enigmail.msg.editorGetCharset\n"
    );
    return this.editor.documentCharacterSet;
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
    let subjElem = document.getElementById("msgSubject");
    if (subjElem) {
      let r = subjElem.value.replace(/^(Re: )+/, "Re: ");
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
      if (Enigmail.msg.processed) {
        //Enigmail.msg.undoEncryption(4);
      }
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
        let si = Enigmail.msg.getSecurityParams(null, true);
        si.signMessage = false;
        si.requireEncryptMessage = false;
      }
      else {
        EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: ECSL.ComposeBodyReady: could not disable S/MIME\n");
      }
    }
    */

    if (!isEditable || isEmpty) {
      return;
    }

    let msgHdr = Enigmail.msg.getMsgHdr();
    if (msgHdr) {
      Enigmail.msg.setOriginalSubject(msgHdr.subject, true);
    }
    Enigmail.msg.fixMessageSubject();

    if (!Enigmail.msg.timeoutId && !Enigmail.msg.dirty) {
      Enigmail.msg.timeoutId = EnigmailTimer.setTimeout(function() {
        Enigmail.msg.decryptQuote(false);
      }, 0);
    }
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
