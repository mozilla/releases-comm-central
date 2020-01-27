/*global EnigmailLocale: false, EnigmailApp: false, Dialog: false, EnigmailTimer: false */
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
/*global Sendlater3Composing: false, MailServices: false */

var EnigmailCore = ChromeUtils.import("chrome://openpgp/content/modules/core.jsm").EnigmailCore;
var EnigmailFuncs = ChromeUtils.import("chrome://openpgp/content/modules/funcs.jsm").EnigmailFuncs;
var EnigmailLog = ChromeUtils.import("chrome://openpgp/content/modules/log.jsm").EnigmailLog;
var EnigmailPrefs = ChromeUtils.import("chrome://openpgp/content/modules/prefs.jsm").EnigmailPrefs;
var EnigmailOS = ChromeUtils.import("chrome://openpgp/content/modules/os.jsm").EnigmailOS;
var EnigmailArmor = ChromeUtils.import("chrome://openpgp/content/modules/armor.jsm").EnigmailArmor;
var EnigmailLocale = ChromeUtils.import("chrome://openpgp/content/modules/locale.jsm").EnigmailLocale;
var EnigmailFiles = ChromeUtils.import("chrome://openpgp/content/modules/files.jsm").EnigmailFiles;
var EnigmailData = ChromeUtils.import("chrome://openpgp/content/modules/data.jsm").EnigmailData;
var EnigmailApp = ChromeUtils.import("chrome://openpgp/content/modules/app.jsm").EnigmailApp;
var EnigmailDialog = ChromeUtils.import("chrome://openpgp/content/modules/dialog.jsm").EnigmailDialog;
var EnigmailTimer = ChromeUtils.import("chrome://openpgp/content/modules/timer.jsm").EnigmailTimer;
var EnigmailWindows = ChromeUtils.import("chrome://openpgp/content/modules/windows.jsm").EnigmailWindows;
var EnigmailKeyRing = ChromeUtils.import("chrome://openpgp/content/modules/keyRing.jsm").EnigmailKeyRing;
var EnigmailURIs = ChromeUtils.import("chrome://openpgp/content/modules/uris.jsm").EnigmailURIs;
var EnigmailConstants = ChromeUtils.import("chrome://openpgp/content/modules/constants.jsm").EnigmailConstants;
var EnigmailPassword = ChromeUtils.import("chrome://openpgp/content/modules/passwords.jsm").EnigmailPassword;
var EnigmailDecryption = ChromeUtils.import("chrome://openpgp/content/modules/decryption.jsm").EnigmailDecryption;
var EnigmailEncryption = ChromeUtils.import("chrome://openpgp/content/modules/encryption.jsm").EnigmailEncryption;
var EnigmailRules = ChromeUtils.import("chrome://openpgp/content/modules/rules.jsm").EnigmailRules;
var EnigmailClipboard = ChromeUtils.import("chrome://openpgp/content/modules/clipboard.jsm").EnigmailClipboard;
var EnigmailWkdLookup = ChromeUtils.import("chrome://openpgp/content/modules/wkdLookup.jsm").EnigmailWkdLookup;
var EnigmailAutocrypt = ChromeUtils.import("chrome://openpgp/content/modules/autocrypt.jsm").EnigmailAutocrypt;
var EnigmailMime = ChromeUtils.import("chrome://openpgp/content/modules/mime.jsm").EnigmailMime;
var EnigmailMsgRead = ChromeUtils.import("chrome://openpgp/content/modules/msgRead.jsm").EnigmailMsgRead;
var EnigmailMimeEncrypt = ChromeUtils.import("chrome://openpgp/content/modules/mimeEncrypt.jsm").EnigmailMimeEncrypt;
var jsmime = ChromeUtils.import("resource:///modules/jsmime.jsm").jsmime;


if (!Enigmail) var Enigmail = {};

const IOSERVICE_CONTRACTID = "@mozilla.org/network/io-service;1";
const LOCAL_FILE_CONTRACTID = "@mozilla.org/file/local;1";

Enigmail.msg = {
  editor: null,
  dirty: null,
  processed: null,
  timeoutId: null,
  sendPgpMime: false,
  sendMode: null, // the current default for sending a message (0, SIGN, ENCRYPT, or SIGN|ENCRYPT)
  sendModeDirty: false, // send mode or final send options changed?

  // processed reasons for encryption:
  reasonEncrypted: "",
  reasonSigned: "",

  // encrypt/sign/pgpmime according to rules?
  // (1:ENIG_UNDEF(undef/maybe), 0:ENIG_NEVER(never/forceNo), 2:ENIG_ALWAYS(always/forceYes),
  //  22:ENIG_AUTO_ALWAYS, 99:ENIG_CONFLICT(conflict))
  encryptByRules: EnigmailConstants.ENIG_UNDEF,
  signByRules: EnigmailConstants.ENIG_UNDEF,
  pgpmimeByRules: EnigmailConstants.ENIG_UNDEF,

  // forced to encrypt/sign/pgpmime?
  // (1:ENIG_UNDEF(undef/maybe), 0:ENIG_NEVER(never/forceNo), 2:ENIG_ALWAYS(always/forceYes))
  encryptForced: EnigmailConstants.ENIG_UNDEF,
  signForced: EnigmailConstants.ENIG_UNDEF,
  pgpmimeForced: EnigmailConstants.ENIG_UNDEF,

  finalSignDependsOnEncrypt: false, // does signing finally depends on encryption mode?

  // resulting final encrypt/sign/pgpmime mode:
  //  (-1:ENIG_FINAL_UNDEF, 0:ENIG_FINAL_NO, 1:ENIG_FINAL_YES, 10:ENIG_FINAL_FORCENO, 11:ENIG_FINAL_FORCEYES, 99:ENIG_FINAL_CONFLICT)
  statusEncrypted: EnigmailConstants.ENIG_FINAL_UNDEF,
  statusSigned: EnigmailConstants.ENIG_FINAL_UNDEF,
  statusPGPMime: EnigmailConstants.ENIG_FINAL_UNDEF,
  statusEncryptedInStatusBar: null, // last statusEncyrpted when processing status buttons
  // to find possible broken promise of encryption

  // is OpenPGP encryption possible without displaying the key selection dialog?
  autoPgpEncryption: false,

  // processed strings to signal final encrypt/sign/pgpmime state:
  statusEncryptedStr: "???",
  statusSignedStr: "???",
  statusPGPMimeStr: "???",
  statusSMimeStr: "???",
  statusInlinePGPStr: "???",
  statusAttachOwnKey: "???",

  sendProcess: false,
  composeBodyReady: false,
  identity: null,
  enableRules: null,
  modifiedAttach: null,
  lastFocusedWindow: null,
  determineSendFlagId: null,
  trustAllKeys: false,
  protectHeaders: false,
  draftSubjectEncrypted: false,
  attachOwnKeyObj: {
    appendAttachment: false,
    attachedObj: null,
    attachedKey: null
  },

  keyLookupDone: [],

  saveDraftError: 0,
  addrOnChangeTimeout: 250,
  /* timeout when entering something into the address field */

  composeStartup: function() {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.composeStartup\n");

    function addSecurityListener(itemId, func) {
      let s = document.getElementById(itemId);
      if (s) {
        s.addEventListener("command", func.bind(Enigmail.msg), false);
      }
      else {
        EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: addSecurityListener - cannot find element " + itemId + "\n");
      }
    }

    if (!gMsgCompose || !gMsgCompose.compFields) {
      EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: no gMsgCompose, leaving\n");
      return;
    }

    gMsgCompose.RegisterStateListener(Enigmail.composeStateListener);
    Enigmail.msg.composeBodyReady = false;

    // Listen to message sending event
    addEventListener('compose-send-message', Enigmail.msg.sendMessageListener, true);

    // Relabel SMIME button and menu item
    var smimeButton = document.getElementById("button-security");
    let toolbar = document.getElementById("composeToolbar2");

    if (smimeButton) {
      smimeButton.setAttribute("label", "S/MIME");
      if (toolbar && toolbar.getAttribute("currentset").length === 0) {
        // remove S/MIME button if the toolbar is displaying the default set
        toolbar.removeChild(smimeButton);
      }
    }

    var msgId = document.getElementById("msgIdentityPopup");
    if (msgId) {
      msgId.addEventListener("command", Enigmail.msg.setIdentityCallback, false);
    }

    var subj = document.getElementById("msgSubject");
    subj.addEventListener('focus', Enigmail.msg.fireSendFlags, false);

    // listen to S/MIME changes to potentially display "conflict" message
    addSecurityListener("menu_securitySign1", Enigmail.msg.toggleSMimeSign);
    addSecurityListener("menu_securitySign2", Enigmail.msg.toggleSmimeToolbar);
    addSecurityListener("menu_securityEncryptRequire1", Enigmail.msg.toggleSMimeEncrypt);
    addSecurityListener("menu_securityEncryptRequire2", Enigmail.msg.toggleSmimeToolbar);

    /*
    let numCerts = EnigmailFuncs.getNumOfX509Certs();
    this.addrOnChangeTimeout = Math.max((numCerts - 250) * 2, 250);
    EnigmailLog.DEBUG(`enigmailMsgComposeOverlay.js: composeStartup: numCerts=${numCerts}; setting timeout to ${this.addrOnChangeTimeout}\n`);
    */

    Enigmail.msg.msgComposeReset(false); // false => not closing => call setIdentityDefaults()
    Enigmail.msg.composeOpen();
    Enigmail.msg.processFinalState();
    Enigmail.msg.updateStatusBar();
    Enigmail.msg.initialSendFlags();

    Enigmail.msg.setFinalSendMode('final-pgpmimeYes');
  },

  delayedProcessFinalState: function() {
    EnigmailTimer.setTimeout(function _f() {
        Enigmail.msg.processFinalState();
        Enigmail.msg.updateStatusBar();
      },
      100);
  },

  toggleSmimeToolbar: function(event) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.toggleSmimeToolbar\n");

    /* global toggleSignMessage: false, toggleEncryptMessage: false */
    switch (event.target.id) {
      case "menu_securitySign2":
        toggleSignMessage();
        event.stopPropagation();
        this.toggleSMimeSign();
        break;
      case "menu_securityEncryptRequire2":
        toggleEncryptMessage();
        event.stopPropagation();
        this.toggleSMimeEncrypt();
    }
  },

  toggleSMimeEncrypt: function() {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.toggleSMimeEncrypt\n");

    if (gSMFields && gSMFields.requireEncryptMessage) {
      this.encryptForced = EnigmailConstants.ENIG_ALWAYS;
      this.pgpmimeForced = EnigmailConstants.ENIG_FORCE_SMIME;
    }
    else {
      //this.encryptForced = EnigmailConstants.ENIG_FINAL_FORCENO;
      this.setFinalSendMode('final-encryptNo');

      if (!gSMFields.signMessage)
        this.pgpmimeForced = EnigmailConstants.ENIG_UNDEF;
    }
    this.delayedProcessFinalState();
  },

  toggleSMimeSign: function() {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.toggleSMimeSign\n");

    if (gSMFields && gSMFields.signMessage) {
      this.signForced = EnigmailConstants.ENIG_ALWAYS;
      this.pgpmimeForced = EnigmailConstants.ENIG_FORCE_SMIME;
    }
    else {
      this.setFinalSendMode('final-signNo');

      if (!gSMFields.requireEncryptMessage)
        this.pgpmimeForced = EnigmailConstants.ENIG_UNDEF;
    }
    this.delayedProcessFinalState();
  },

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


  setIdentityCallback: function(elementId) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.setIdentityCallback: elementId=" + elementId + "\n");

    EnigmailTimer.setTimeout(function _f() {
        Enigmail.msg.setIdentityDefaults();
      },
      100);
  },


  /* return whether the account specific setting key is enabled or disabled
   */
  getAccDefault: function(key) {
    //EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.getAccDefault: identity="+this.identity.key+"("+this.identity.email+") key="+key+"\n");
    let res = null;
    let mimePreferOpenPGP = this.identity.getIntAttribute("mimePreferOpenPGP");
    let isSmimeEnabled = this.isSmimeEnabled();
    let isEnigmailEnabled = this.isEnigmailEnabled();
    let preferSmimeByDefault = false;

    if (isSmimeEnabled && isEnigmailEnabled) {
      if (this.pgpmimeForced === EnigmailConstants.ENIG_FORCE_SMIME) {
        preferSmimeByDefault = true;
      }
      else if (this.pgpmimeForced === EnigmailConstants.ENIG_FORCE_ALWAYS) {
        preferSmimeByDefault = true;
      }
      else {
        preferSmimeByDefault = (mimePreferOpenPGP === 0);
      }
    }

    if (isEnigmailEnabled) {
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
        case 'signIfNotEnc':
          res = this.identity.getBoolAttribute("pgpSignPlain");
          break;
        case 'signIfEnc':
          res = this.identity.getBoolAttribute("pgpSignEncrypted");
          break;
        case 'attachPgpKey':
          res = this.identity.getBoolAttribute(key);
          break;
      }
      //EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.getAccDefault:   "+key+"="+res+"\n");
      return res;
    }
    else if (this.isSmimeEnabled()) {
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
        case 'signIfNotEnc':
        case 'signIfEnc':
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

  /**
   * Determine if any of Enigmail (OpenPGP) or S/MIME encryption is enabled for the account
   */
  getEncryptionEnabled: function() {
    let id = getCurrentIdentity();

    return ((id.getUnicharAttribute("encryption_cert_name") !== "") ||
      this.isEnigmailEnabled());
  },

  isSmimeEnabled: function() {
    let id = getCurrentIdentity();

    return ((id.getUnicharAttribute("signing_cert_name") !== "") ||
      (id.getUnicharAttribute("encryption_cert_name") !== ""));
  },

  /**
   * Determine if any of Enigmail (OpenPGP) or S/MIME signing is enabled for the account
   */
  getSigningEnabled: function() {
    let id = getCurrentIdentity();

    return ((id.getUnicharAttribute("signing_cert_name") !== "") ||
      this.isEnigmailEnabled());
  },

  getSmimeSigningEnabled: function() {
    let id = getCurrentIdentity();

    if (!id.getUnicharAttribute("signing_cert_name")) return false;

    return id.getBoolAttribute("sign_mail");
  },

  setIdentityDefaults: function() {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.setIdentityDefaults\n");

    this.identity = getCurrentIdentity();
    if (!this.isEnigmailEnabled()) {
      // reset status strings in menu to useful defaults
      this.statusEncryptedStr = EnigmailLocale.getString("encryptNo");
      this.statusSignedStr = EnigmailLocale.getString("signNo", [""]);
      this.statusPGPMimeStr = EnigmailLocale.getString("pgpmimeNormal");
      this.statusInlinePGPStr = EnigmailLocale.getString("inlinePGPNormal");
      this.statusSMimeStr = EnigmailLocale.getString("smimeNormal");
      this.statusAttachOwnKey = EnigmailLocale.getString("attachOwnKeyNo");
    }

    // reset default send settings, unless we have changed them already
    if (!this.sendModeDirty) {
      this.mimePreferOpenPGP = this.identity.getIntAttribute("mimePreferOpenPGP");
      this.processAccountSpecificDefaultOptions();
      this.determineSendFlags(); // important to use identity specific settings
      this.processFinalState();
      this.updateStatusBar();
    }
  },


  // set the current default for sending a message
  // depending on the identity
  processAccountSpecificDefaultOptions: function() {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.processAccountSpecificDefaultOptions\n");

    const SIGN = EnigmailConstants.SEND_SIGNED;
    const ENCRYPT = EnigmailConstants.SEND_ENCRYPTED;

    this.sendMode = 0;

    if (this.getSmimeSigningEnabled()) {
      this.sendMode |= SIGN;
      this.reasonSigned = EnigmailLocale.getString("reasonEnabledByDefault");
    }

    if (!this.isEnigmailEnabled()) {
      return;
    }

    if (this.getAccDefault("encrypt")) {
      this.sendMode |= ENCRYPT;
      this.reasonEncrypted = EnigmailLocale.getString("reasonEnabledByDefault");
    }
    if (this.getAccDefault("sign")) {
      this.sendMode |= SIGN;
      this.reasonSigned = EnigmailLocale.getString("reasonEnabledByDefault");
    }

    this.sendPgpMime = this.getAccDefault("pgpMimeMode");
    console.debug("processAccountSpecificDefaultOptions sendPgpMime: " + this.sendPgpMime);
    this.attachOwnKeyObj.appendAttachment = this.getAccDefault("attachPgpKey");
    this.setOwnKeyStatus();
    this.attachOwnKeyObj.attachedObj = null;
    this.attachOwnKeyObj.attachedKey = null;

    this.finalSignDependsOnEncrypt = (this.getAccDefault("signIfEnc") || this.getAccDefault("signIfNotEnc"));
  },

  getOriginalMsgUri: function() {
    let draftId = gMsgCompose.compFields.draftId;
    let msgUri = null;

    if (typeof(draftId) == "string" && draftId.length > 0) {
      // original message is draft
      msgUri = draftId.replace(/\?.*$/, "");
    }
    else if (typeof(gMsgCompose.originalMsgURI) == "string" && gMsgCompose.originalMsgURI.length > 0) {
      // original message is a "true" mail
      msgUri = gMsgCompose.originalMsgURI;
    }

    return msgUri;
  },

  getMsgHdr: function(msgUri) {
    if (!msgUri) {
      msgUri = this.getOriginalMsgUri();
    }
    if (msgUri) {
      let messenger = Components.classes["@mozilla.org/messenger;1"].getService(Components.interfaces.nsIMessenger);
      return messenger.messageServiceFromURI(msgUri).messageURIToMsgHdr(msgUri);
    }
    else return null;
  },

  getMsgProperties: function(draft) {
    EnigmailLog.DEBUG("enigmailMessengerOverlay.js: Enigmail.msg.getMsgProperties:\n");

    let msgUri = this.getOriginalMsgUri();
    let self = this;
    let properties = 0;
    try {
      let msgHdr = this.getMsgHdr(msgUri);
      if (msgHdr) {
        let msgUrl = EnigmailMsgRead.getUrlFromUriSpec(msgUri);
        properties = msgHdr.getUint32Property("enigmail");
        try {
          EnigmailMime.getMimeTreeFromUrl(msgUrl.spec, false, function _cb(mimeMsg) {
            if (draft) {
              self.setDraftOptions(mimeMsg);
              if (self.draftSubjectEncrypted) self.setOriginalSubject(msgHdr.subject, false);
            }
            else {
              if (EnigmailURIs.isEncryptedUri(msgUri)) self.setOriginalSubject(msgHdr.subject, false);
            }
          });
        }
        catch (ex) {
          EnigmailLog.DEBUG("enigmailMessengerOverlay.js: Enigmail.msg.getMsgProperties: excetion in getMimeTreeFromUrl\n");
        }
      }
    }
    catch (ex) {
      EnigmailLog.DEBUG("enigmailMessengerOverlay.js: Enigmail.msg.getMsgProperties: got exception '" + ex.toString() + "'\n");
    }

    if (EnigmailURIs.isEncryptedUri(msgUri)) {
      properties |= EnigmailConstants.DECRYPTION_OKAY;
    }

    return properties;
  },

  setDraftOptions: function(mimeMsg) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.setDraftOptions\n");

    var stat = "";
    if (mimeMsg && mimeMsg.headers.has("x-enigmail-draft-status")) {
      stat = String(mimeMsg.headers.get("x-enigmail-draft-status").join(""));
    }
    else {
      return;
    }

    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.setDraftOptions: draftStatus: " + stat + "\n");

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
    Enigmail.msg.setOwnKeyStatus();
  },

  setOriginalSubject: function(subject, forceSetting) {
    const CT = Components.interfaces.nsIMsgCompType;
    let subjElem = document.getElementById("msgSubject");
    let prefix = "";

    if (!subjElem) return;

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
        if (!subject.startsWith("Re: "))
          prefix = "Re: ";
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

      if (subjElem.value == "Re: " + subject) return;

      gMsgCompose.compFields.subject = prefix + subject;
      subjElem.value = prefix + subject;
      if (typeof subjElem.oninput === "function") subjElem.oninput();
    }
  },

  setupMenuAndToolbar: function() {
    return;
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.setupMenuAndToolbar\n");
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
  },

  composeOpen: function() {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.composeOpen\n");

    const SIGN = EnigmailConstants.SEND_SIGNED;
    const ENCRYPT = EnigmailConstants.SEND_ENCRYPTED;

    var msgFlags;
    var msgUri = null;
    var msgIsDraft = false;

    this.setupMenuAndToolbar();

    this.determineSendFlagId = null;
    this.disableSmime = false;
    this.saveDraftError = 0;
    this.protectHeaders = (EnigmailPrefs.getPref("protectedHeaders") === 2);
    this.enableUndoEncryption(false);

    this.displayProtectHeadersStatus();

    var toobarElem = document.getElementById("composeToolbar2");
    if (toobarElem && (EnigmailOS.getOS() == "Darwin")) {
      toobarElem.setAttribute("platform", "macos");
    }

    /*
    // remove overlay_source from enigmail-bc-sendprocess, which will be inherited to
    // addressCol2 and addressCol1 (those would be removed if Enigmail is uninstalled)
    let bc = document.getElementById("enigmail-bc-sendprocess");
    bc.removeAttribute("overlay_source");
    */

    // check rules for status bar icons on each change of the recipients
    // Thunderbird
    var adrCol = document.getElementById("addressCol2#1"); // recipients field
    if (adrCol) {
      let attr = adrCol.getAttribute("oninput");
      adrCol.setAttribute("oninput", attr + "; Enigmail.msg.addressOnChange();");
      attr = adrCol.getAttribute("onchange");
      adrCol.setAttribute("onchange", attr + "; Enigmail.msg.addressOnChange();");
      //adrCol.setAttribute("observes", "enigmail-bc-sendprocess");
    }
    adrCol = document.getElementById("addressCol1#1"); // to/cc/bcc/... field
    if (adrCol) {
      let attr = adrCol.getAttribute("oncommand");
      adrCol.setAttribute("oncommand", attr + "; Enigmail.msg.addressOnChange();");
      //adrCol.setAttribute("observes", "enigmail-bc-sendprocess");
    }

    var draftId = gMsgCompose.compFields.draftId;
    let selectedElement = document.activeElement;

    if (EnigmailPrefs.getPref("keepSettingsForReply") && (!(this.sendMode & ENCRYPT)) || (typeof(draftId) == "string" && draftId.length > 0)) {

      /* global gEncryptedURIService: false */
      if (gEncryptedURIService && gEncryptedURIService.isEncrypted(gMsgCompose.originalMsgURI)) {
        // Enable S/MIME encryption if original is known as encrypted.
        this.setFinalSendMode('final-encryptYes');
      }
      msgUri = this.getOriginalMsgUri();

      if (typeof(draftId) == "string" && draftId.length > 0) {
        // original message is draft
        msgIsDraft = true;
      }

      if (msgUri) {
        msgFlags = this.getMsgProperties(msgIsDraft);
        if (!msgIsDraft) {
          if (msgFlags & EnigmailConstants.DECRYPTION_OKAY) {
            EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.composeOpen: has encrypted originalMsgUri\n");
            EnigmailLog.DEBUG("originalMsgURI=" + gMsgCompose.originalMsgURI + "\n");
            this.setFinalSendMode('final-encryptYes');

            this.identity = getCurrentIdentity();
            if (this.identity.getBoolAttribute("pgpSignEncrypted")) {
              this.setFinalSendMode('final-signYes');
            }

            this.disableSmime = true;
          }
          else if (msgFlags & (EnigmailConstants.GOOD_SIGNATURE |
              EnigmailConstants.BAD_SIGNATURE |
              EnigmailConstants.UNVERIFIED_SIGNATURE)) {
            this.setSendMode('sign');
          }
        }
        this.removeAttachedKey();
      }
    }

    // check for attached signature files and remove them
    var bucketList = document.getElementById("attachmentBucket");
    if (bucketList.hasChildNodes()) {
      var node = bucketList.firstChild;
      let nodeNumber = 0;
      while (node) {
        if (node.attachment.contentType == "application/pgp-signature") {
          if (!this.findRelatedAttachment(bucketList, node)) {
            // Let's release the attachment object held by the node else it won't go away until the window is destroyed
            node.attachment = null;
            node = bucketList.removeChild(node);
          }
        }
        else {
          ++nodeNumber;
        }
        node = node.nextSibling;
      }
      if (!bucketList.hasChildNodes()) {
        try {
          // TB only
          UpdateAttachmentBucket(false);
        }
        catch (ex) {}
      }
    }

    try {
      // TB only
      UpdateAttachmentBucket(bucketList.hasChildNodes());
    }
    catch (ex) {}

    this.processFinalState();
    this.updateStatusBar();
    if (selectedElement) selectedElement.focus();
  },

  // check if an signature is related to another attachment
  findRelatedAttachment: function(bucketList, node) {

    // check if filename ends with .sig
    if (node.attachment.name.search(/\.sig$/i) < 0) return null;

    var relatedNode = bucketList.firstChild;
    var findFile = node.attachment.name.toLowerCase();
    var baseAttachment = null;
    while (relatedNode) {
      if (relatedNode.attachment.name.toLowerCase() + ".sig" == findFile)
        baseAttachment = relatedNode.attachment;
      relatedNode = relatedNode.nextSibling;
    }
    return baseAttachment;
  },

  initialSendFlags: function() {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.initialSendFlags\n");
    this.fireSendFlags();

    EnigmailTimer.setTimeout(function _f() {
      EnigmailLog.DEBUG("enigmailMsgComposeOverlay: re-determine send flags\n");
      try {
        this.determineSendFlags();
        this.processFinalState();
        this.updateStatusBar();
      }
      catch (ex) {
        EnigmailLog.DEBUG("enigmailMsgComposeOverlay: re-determine send flags - ERROR: " + ex.toString() + "\n");
      }
    }.bind(Enigmail.msg), 1500);
  },


  msgComposeClose: function() {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.msgComposeClose\n");

    var ioServ;
    try {
      // we should delete the original temporary files of the encrypted or signed
      // inline PGP attachments (the rest is done automatically)
      if (this.modifiedAttach) {
        ioServ = Components.classes[IOSERVICE_CONTRACTID].getService(Components.interfaces.nsIIOService);
        if (!ioServ)
          return;

        for (var i in this.modifiedAttach) {
          if (this.modifiedAttach[i].origTemp) {
            EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.msgComposeClose: deleting " + this.modifiedAttach[i].origUrl + "\n");
            var fileUri = ioServ.newURI(this.modifiedAttach[i].origUrl, null, null);
            var fileHandle = Components.classes[LOCAL_FILE_CONTRACTID].createInstance(Components.interfaces.nsIFile);
            fileHandle.initWithPath(fileUri.path);
            if (fileHandle.exists()) fileHandle.remove(false);
          }
        }
        this.modifiedAttach = null;
      }
    }
    catch (ex) {
      EnigmailLog.ERROR("enigmailMsgComposeOverlay.js: ECSL.ComposeProcessDone: could not delete all files:\n" + ex.toString() + "\n");
    }

    this.msgComposeReset(true); // true => closing => don't call setIdentityDefaults()
  },


  msgComposeReset: function(closing) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.msgComposeReset\n");

    this.dirty = 0;
    this.processed = null;
    this.timeoutId = null;

    this.modifiedAttach = null;
    this.sendMode = 0;
    this.sendModeDirty = false;
    this.reasonEncrypted = "";
    this.reasonSigned = "";
    this.encryptByRules = EnigmailConstants.ENIG_UNDEF;
    this.signByRules = EnigmailConstants.ENIG_UNDEF;
    this.pgpmimeByRules = EnigmailConstants.ENIG_UNDEF;
    this.signForced = EnigmailConstants.ENIG_UNDEF;
    this.encryptForced = EnigmailConstants.ENIG_UNDEF;
    this.pgpmimeForced = EnigmailConstants.ENIG_UNDEF;
    this.finalSignDependsOnEncrypt = false;
    this.statusSigned = EnigmailConstants.ENIG_FINAL_UNDEF;
    this.statusEncrypted = EnigmailConstants.ENIG_FINAL_UNDEF;
    this.statusPGPMime = EnigmailConstants.ENIG_FINAL_UNDEF;
    this.statusEncryptedStr = "???";
    this.statusSignedStr = "???";
    this.statusPGPMimeStr = "???";
    this.statusInlinePGPStr = "???";
    this.statusAttachOwnKey = "???";
    this.enableRules = true;
    this.identity = null;
    this.sendProcess = false;
    this.trustAllKeys = false;
    this.mimePreferOpenPGP = 0;
    this.keyLookupDone = [];

    if (!closing) {
      this.setIdentityDefaults();
    }
  },


  initRadioMenu: function(prefName, optionIds) {
    EnigmailLog.DEBUG("enigmailMessengerOverlay.js: Enigmail.msg.initRadioMenu: " + prefName + "\n");

    var encryptId;

    var prefValue = EnigmailPrefs.getPref(prefName);

    if (prefValue >= optionIds.length)
      return;

    var menuItem = document.getElementById("enigmail_" + optionIds[prefValue]);
    if (menuItem)
      menuItem.setAttribute("checked", "true");
  },


  tempTrustAllKeys: function() {
    this.trustAllKeys = !this.trustAllKeys;
  },

  toggleAttachOwnKey: function() {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.toggleAttachOwnKey\n");
    EnigmailCore.getService(window); // make sure Enigmail is loaded and working

    this.attachOwnKeyObj.appendAttachment = !this.attachOwnKeyObj.appendAttachment;

    this.setOwnKeyStatus();
  },

  toggleProtectHeaders: function() {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.toggleProtectHeaders\n");
    EnigmailCore.getService(window); // make sure Enigmail is loaded and working

    this.protectHeaders = !this.protectHeaders;

    this.displayProtectHeadersStatus();
  },

  displayProtectHeadersStatus: function() {
    return;
    let bc = document.getElementById("enigmail-bc-protectHdr");

    if (this.protectHeaders) {
      bc.setAttribute("checked", "true");
      bc.setAttribute("tooltiptext", EnigmailLocale.getString("msgCompose.protectSubject.tooltip"));
    }
    else {
      bc.removeAttribute("checked");
      bc.setAttribute("tooltiptext", EnigmailLocale.getString("msgCompose.noSubjectProtection.tooltip"));
    }
  },

  /***
   * set broadcaster to display whether the own key is attached or not
   */

  setOwnKeyStatus: function() {
    return;
    let bc = document.getElementById("enigmail-bc-attach");
    let attachIcon = document.getElementById("button-enigmail-attach");

    if (this.allowAttachOwnKey() === 0) {
      this.statusAttachOwnKey = EnigmailLocale.getString("attachOwnKeyDisabled");
    }
    else {
      if (this.attachOwnKeyObj.appendAttachment) {
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

  attachOwnKey: function() {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.attachOwnKey:\n");

    var userIdValue;

    if (this.identity.getIntAttribute("pgpKeyMode") > 0) {
      userIdValue = this.identity.getCharAttribute("pgpkeyId");

      if (this.attachOwnKeyObj.attachedKey && (this.attachOwnKeyObj.attachedKey != userIdValue)) {
        // remove attached key if user ID changed
        this.removeAttachedKey();
      }

      if (!this.attachOwnKeyObj.attachedKey) {
        var attachedObj = this.extractAndAttachKey([userIdValue], true);
        if (attachedObj) {
          this.attachOwnKeyObj.attachedObj = attachedObj;
          this.attachOwnKeyObj.attachedKey = userIdValue;
        }
      }
    }
    else {
      EnigmailLog.ERROR("enigmailMsgComposeOverlay.js: Enigmail.msg.attachOwnKey: trying to attach unknown own key!\n");
    }
  },

  attachKey: function() {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.attachKey: \n");

    var resultObj = {};
    var inputObj = {};
    inputObj.dialogHeader = EnigmailLocale.getString("keysToExport");
    inputObj.options = "multisel,allowexpired,nosending";
    if (this.trustAllKeys) {
      inputObj.options += ",trustallkeys";
    }
    var userIdValue = "";

    window.openDialog("chrome://openpgp/content/ui/enigmailKeySelection.xhtml", "", "dialog,modal,centerscreen,resizable", inputObj, resultObj);
    try {
      if (resultObj.cancelled) return;
      this.extractAndAttachKey(resultObj.userList, true);
    }
    catch (ex) {
      // cancel pressed -> do nothing
      return;
    }
  },

  extractAndAttachKey: function(uid, warnOnError) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.extractAndAttachKey: \n");
    var enigmailSvc = EnigmailCore.getService(window);
    if (!enigmailSvc)
      return null;

    var tmpDir = EnigmailFiles.getTempDir();
    var tmpFile;
    try {
      tmpFile = Components.classes[LOCAL_FILE_CONTRACTID].createInstance(Components.interfaces.nsIFile);
      tmpFile.initWithPath(tmpDir);
      if (!(tmpFile.isDirectory() && tmpFile.isWritable())) {
        EnigmailDialog.alert(window, EnigmailLocale.getString("noTempDir"));
        return null;
      }
    }
    catch (ex) {
      EnigmailLog.writeException("enigmailMsgComposeOverlay.js: Enigmail.msg.extractAndAttachKey", ex);
    }
    tmpFile.append("key.asc");
    tmpFile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0o600);

    // save file
    var exitCodeObj = {};
    var errorMsgObj = {};

    EnigmailKeyRing.extractKey(false, uid.join(" "), tmpFile, exitCodeObj, errorMsgObj);
    if (exitCodeObj.value !== 0) {
      if (warnOnError) EnigmailDialog.alert(window, errorMsgObj.value);
      return null;
    }

    // create attachment
    var ioServ = Components.classes[IOSERVICE_CONTRACTID].getService(Components.interfaces.nsIIOService);
    var tmpFileURI = ioServ.newFileURI(tmpFile);
    var keyAttachment = Components.classes["@mozilla.org/messengercompose/attachment;1"].createInstance(Components.interfaces.nsIMsgAttachment);
    keyAttachment.url = tmpFileURI.spec;
    if ((uid.length == 1) && (uid[0].search(/^(0x)?[a-fA-F0-9]+$/) === 0)) {
      keyAttachment.name = uid[0].substr(-16, 16) + ".asc";
      if (keyAttachment.name.search(/^0x/) < 0)
        keyAttachment.name = "0x" + keyAttachment.name;
    }
    else {
      keyAttachment.name = "pgpkeys.asc";
    }
    keyAttachment.temporary = true;
    keyAttachment.contentType = "application/pgp-keys";

    // add attachment to msg
    this.addAttachment(keyAttachment);

    try {
      // TB only
      ChangeAttachmentBucketVisibility(false);
    }
    catch (ex) {}
    gContentChanged = true;
    return keyAttachment;
  },

  addAttachment: function(attachment) {
    AddAttachments([attachment]);
  },

  enableUndoEncryption: function(newStatus) {
    return;
    let eue = document.getElementById("enigmail_undo_encryption");

    if (newStatus) {
      eue.removeAttribute("disabled");
    }
    else
      eue.setAttribute("disabled", "true");
  },


  /**
   *  undo the encryption or signing; get back the original (unsigned/unencrypted) text
   *
   * useEditorUndo |Number|:   > 0  use undo function of editor |n| times
   *                           0: replace text with original text
   */
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
    var bucketList = document.getElementById("attachmentBucket");
    if (this.modifiedAttach && bucketList && bucketList.hasChildNodes()) {
      // undo inline encryption of attachments
      for (var i = 0; i < this.modifiedAttach.length; i++) {
        node = bucketList.firstChild;
        nodeNumber = -1;
        while (node) {
          ++nodeNumber;
          if (node.attachment.url == this.modifiedAttach[i].newUrl) {
            if (this.modifiedAttach[i].encrypted) {
              node.attachment.url = this.modifiedAttach[i].origUrl;
              node.attachment.name = this.modifiedAttach[i].origName;
              node.attachment.temporary = this.modifiedAttach[i].origTemp;
              node.attachment.contentType = this.modifiedAttach[i].origCType;
            }
            else {
              node = bucketList.removeChild(node);
              // Let's release the attachment object held by the node else it won't go away until the window is destroyed
              node.attachment = null;
            }
            // delete encrypted file
            try {
              this.modifiedAttach[i].newFile.remove(false);
            }
            catch (ex) {}

            node = null; // next attachment please
          }
          else {
            node = node.nextSibling;
          }
        }
      }
    }

    this.removeAttachedKey();
  },


  removeAttachedKey: function() {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.removeAttachedKey: \n");

    var bucketList = document.getElementById("attachmentBucket");
    var node = bucketList.firstChild;

    if (bucketList && bucketList.hasChildNodes() && this.attachOwnKeyObj.attachedObj) {
      // undo attaching own key
      var nodeNumber = -1;
      while (node) {
        ++nodeNumber;
        if (node.attachment.url == this.attachOwnKeyObj.attachedObj.url) {
          node = bucketList.removeChild(node);
          // Let's release the attachment object held by the node else it won't go away until the window is destroyed
          node.attachment = null;
          this.attachOwnKeyObj.attachedObj = null;
          this.attachOwnKeyObj.attachedKey = null;
          node = null; // exit loop
        }
        else {
          node = node.nextSibling;
        }
      }
      if (!bucketList.hasChildNodes()) {
        try {
          // TB only
          ChangeAttachmentBucketVisibility(true);
        }
        catch (ex) {}
      }
    }
  },

  getSecurityParams: function(compFields = null, doQueryInterface = false) {
    if (!compFields)
      compFields = gMsgCompose.compFields;

    if ("securityInfo" in compFields) {
      if (doQueryInterface) {
        return compFields.securityInfo.QueryInterface(Components.interfaces.nsIMsgSMIMECompFields);
      }
      else {
        return compFields.securityInfo;
      }
    }
    else {
      return compFields.composeSecure;
    }
  },

  setSecurityParams: function(newSecurityParams) {
    if ("securityInfo" in gMsgCompose.compFields) {
      // TB < 64
      gMsgCompose.compFields.securityInfo = newSecurityParams;
    }
    else {
      gMsgCompose.compFields.composeSecure = newSecurityParams;
    }
  },


  resetUpdatedFields: function() {
    this.removeAttachedKey();

    // reset subject
    if (EnigmailMimeEncrypt.isEnigmailCompField(Enigmail.msg.getSecurityParams())) {
      let si = Enigmail.msg.getSecurityParams().wrappedJSObject;
      if (si.originalSubject) {
        gMsgCompose.compFields.subject = si.originalSubject;
      }
    }
  },


  replaceEditorText: function(text) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.replaceEditorText:\n");

    this.editorSelectAll();
    // Overwrite text in clipboard for security
    // (Otherwise plaintext will be available in the clipbaord)

    if (this.editor.textLength > 0) {
      this.editorInsertText("Enigmail");
    }
    else {
      this.editorInsertText(" ");
    }

    this.editorSelectAll();
    this.editorInsertText(text);
  },

  goAccountManager: function() {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.goAccountManager:\n");
    EnigmailCore.getService(window);
    let currentId = null;
    let account = null;
    try {
      currentId = getCurrentIdentity();
      account = EnigmailFuncs.getAccountForIdentity(currentId);
    }
    catch (ex) {}
    window.openDialog("chrome://openpgp/content/ui/editSingleAccount.xhtml", "", "dialog,modal,centerscreen", {
      identity: currentId,
      account: account
    });
    this.setIdentityDefaults();
  },

  /**
   * Determine if Enigmail is enabled for the account
   */

  isEnigmailEnabled: function() {
    return this.identity.getBoolAttribute("enablePgp");
  },

  /**
   * Determine if Autocrypt is enabled for the account
   */
  isAutocryptEnabled: function() {
    if (this.isEnigmailEnabled()) {
      let srv = this.getCurrentIncomingServer();
      return (srv ? srv.getBoolValue("enableAutocrypt") : false);
    }

    return false;
  },

  doPgpButton: function(what) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.doPgpButton: what=" + what + "\n");

    if (this.isEnigmailEnabled()) {
      EnigmailCore.getService(window); // try to access Enigmail to launch the wizard if needed
    }

    // ignore settings for this account?
    try {
      if (!this.getEncryptionEnabled() && !this.getSigningEnabled()) {
        if (EnigmailDialog.confirmDlg(window, EnigmailLocale.getString("configureNow"),
            EnigmailLocale.getString("msgCompose.button.configure"))) {
          // configure account settings for the first time
          this.goAccountManager();
          if (!this.isEnigmailEnabled()) {
            return;
          }
        }
        else {
          return;
        }
      }
    }
    catch (ex) {}

    switch (what) {
      case 'sign':
      case 'encrypt':
        this.setSendMode(what);
        break;

        // menu entries:
      case 'final-signDefault':
      case 'final-signYes':
      case 'final-signNo':
      case 'final-encryptDefault':
      case 'final-encryptYes':
      case 'final-encryptNo':
      case 'final-pgpmimeDefault':
      case 'final-pgpmimeYes':
      case 'final-pgpmimeNo':
      case 'final-useSmime':
      case 'toggle-final-sign':
      case 'toggle-final-encrypt':
      case 'toggle-final-mime':
        this.setFinalSendMode(what);
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


  // changes the DEFAULT sendMode
  // - also called internally for saved emails
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
    this.updateStatusBar();
  },


  // changes the FINAL sendMode
  // - triggered by the user interface
  setFinalSendMode: function(sendMode) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.setFinalSendMode: sendMode=" + sendMode + "\n");

    const SIGN = EnigmailConstants.SEND_SIGNED;
    const ENCRYPT = EnigmailConstants.SEND_ENCRYPTED;

    switch (sendMode) {

      // menu entries for final settings:

      case 'final-encryptDefault':
        // switch encryption to "use defaults & rules"
        if (this.encryptForced != EnigmailConstants.ENIG_UNDEF) { // if encrypt/noencrypt forced
          this.encryptForced = EnigmailConstants.ENIG_UNDEF; // back to defaults/rules
        }
        break;
      case 'final-encryptYes':
        // switch encryption to "force encryption"
        if (this.encryptForced != EnigmailConstants.ENIG_ALWAYS) { // if not forced to encrypt
          this.encryptForced = EnigmailConstants.ENIG_ALWAYS; // force to encrypt
        }
        break;
      case 'final-encryptNo':
        // switch encryption to "force no to encrypt"
        if (this.encryptForced != EnigmailConstants.ENIG_NEVER) { // if not forced not to encrypt
          this.encryptForced = EnigmailConstants.ENIG_NEVER; // force not to encrypt
        }
        break;

      case 'final-signDefault':
        // switch signing to "use defaults & rules"
        if (this.signForced != EnigmailConstants.ENIG_UNDEF) { // if sign/nosign forced
          // re-init if signing depends on encryption if this was broken before
          this.finalSignDependsOnEncrypt = (this.getAccDefault("signIfEnc") || this.getAccDefault("signIfNotEnc"));
          this.signForced = EnigmailConstants.ENIG_UNDEF; // back to defaults/rules
        }
        break;
      case 'final-signYes':
        if (this.signForced != EnigmailConstants.ENIG_ALWAYS) { // if not forced to sign
          this.signingNoLongerDependsOnEnc();
          this.signForced = EnigmailConstants.ENIG_ALWAYS; // force to sign
        }
        break;
      case 'final-signNo':
        if (this.signForced != EnigmailConstants.ENIG_NEVER) { // if not forced not to sign
          this.signingNoLongerDependsOnEnc();
          this.signForced = EnigmailConstants.ENIG_NEVER; // force not to sign
        }
        break;

      case 'final-pgpmimeDefault':
        if (this.pgpmimeForced != EnigmailConstants.ENIG_UNDEF) { // if any PGP mode forced
          this.pgpmimeForced = EnigmailConstants.ENIG_UNDEF; // back to defaults/rules
        }
        break;
      case 'final-pgpmimeYes':
        if (this.pgpmimeForced != EnigmailConstants.ENIG_ALWAYS) { // if not forced to PGP/Mime
          this.pgpmimeForced = EnigmailConstants.ENIG_ALWAYS; // force to PGP/Mime
        }
        break;
      case 'final-pgpmimeNo':
        if (this.pgpmimeForced != EnigmailConstants.ENIG_NEVER) { // if not forced not to PGP/Mime
          this.pgpmimeForced = EnigmailConstants.ENIG_NEVER; // force not to PGP/Mime
        }
        break;

      case 'final-useSmime':
        //
        this.pgpmimeForced = EnigmailConstants.ENIG_FORCE_SMIME;
        break;

        // status bar buttons:
        // - can only switch to force or not to force sign/enc

      case 'toggle-final-sign':
        this.signingNoLongerDependsOnEnc();
        switch (this.statusSigned) {
          case EnigmailConstants.ENIG_FINAL_NO:
          case EnigmailConstants.ENIG_FINAL_FORCENO:
            this.signForced = EnigmailConstants.ENIG_ALWAYS; // force to sign
            break;
          case EnigmailConstants.ENIG_FINAL_YES:
          case EnigmailConstants.ENIG_FINAL_FORCEYES:
            this.signForced = EnigmailConstants.ENIG_NEVER; // force not to sign
            break;
          case EnigmailConstants.ENIG_FINAL_CONFLICT:
            this.signForced = EnigmailConstants.ENIG_NEVER;
            break;
        }
        break;

      case 'toggle-final-encrypt':
        switch (this.statusEncrypted) {
          case EnigmailConstants.ENIG_FINAL_NO:
          case EnigmailConstants.ENIG_FINAL_FORCENO:
            this.encryptForced = EnigmailConstants.ENIG_ALWAYS; // force to encrypt
            break;
          case EnigmailConstants.ENIG_FINAL_YES:
          case EnigmailConstants.ENIG_FINAL_FORCEYES:
            this.encryptForced = EnigmailConstants.ENIG_NEVER; // force not to encrypt
            break;
          case EnigmailConstants.ENIG_FINAL_CONFLICT:
            this.encryptForced = EnigmailConstants.ENIG_NEVER;
            break;
        }
        break;

      case 'toggle-final-mime':
        switch (this.statusPGPMime) {
          case EnigmailConstants.ENIG_FINAL_NO:
          case EnigmailConstants.ENIG_FINAL_FORCENO:
            this.pgpmimeForced = EnigmailConstants.ENIG_ALWAYS; // force PGP/MIME
            break;
          case EnigmailConstants.ENIG_FINAL_YES:
          case EnigmailConstants.ENIG_FINAL_FORCEYES:
            this.pgpmimeForced = EnigmailConstants.ENIG_NEVER; // force Inline-PGP
            break;
          case EnigmailConstants.ENIG_FINAL_CONFLICT:
            this.pgpmimeForced = EnigmailConstants.ENIG_NEVER;
            break;
        }
        break;

      default:
        EnigmailDialog.alert(window, "Enigmail.msg.setFinalSendMode - unexpected value: " + sendMode);
        break;
    }

    // this is always a send mode change (only toggle effects)
    this.sendModeDirty = true;

    this.determineSendFlags();
    //this.processFinalState();
    //this.updateStatusBar();
  },

  /**
    key function to process the final encrypt/sign/pgpmime state from all settings
    @param sendFlags: contains the sendFlags if the message is really processed. Optional, can be null
      - uses as INPUT:
         - this.sendMode
         - this.encryptByRules, this.signByRules, pgpmimeByRules
         - this.encryptForced, this.encryptSigned
      - uses as OUTPUT:
         - this.statusEncrypt, this.statusSign, this.statusPGPMime

    no return value
  */
  processFinalState: function(sendFlags) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.processFinalState()\n");

    const SIGN = EnigmailConstants.SEND_SIGNED;
    const ENCRYPT = EnigmailConstants.SEND_ENCRYPTED;


    let encFinally = null;
    let encReason = "";
    let signFinally = null;
    let signReason = "";
    let pgpmimeFinally = null;
    let pgpEnabled = this.isEnigmailEnabled();
    let smimeEnabled = this.isSmimeEnabled();

    // ------ 1. process OpenPGP status ------

    // process resulting encrypt mode
    if (this.encryptForced == EnigmailConstants.ENIG_NEVER) { // force not to encrypt?
      encFinally = EnigmailConstants.ENIG_FINAL_FORCENO;
      encReason = EnigmailLocale.getString("reasonManuallyForced");
    }
    else if (this.encryptForced == EnigmailConstants.ENIG_ALWAYS) { // force to encrypt?
      encFinally = EnigmailConstants.ENIG_FINAL_FORCEYES;
      encReason = EnigmailLocale.getString("reasonManuallyForced");
    }
    else switch (this.encryptByRules) {
      case EnigmailConstants.ENIG_NEVER:
        encFinally = EnigmailConstants.ENIG_FINAL_NO;
        encReason = EnigmailLocale.getString("reasonByRecipientRules");
        break;
      case EnigmailConstants.ENIG_UNDEF:
        if (this.sendMode & ENCRYPT) {
          encFinally = EnigmailConstants.ENIG_FINAL_YES;
          if (pgpEnabled && this.getAccDefault("encrypt")) {
            encReason = EnigmailLocale.getString("reasonEnabledByDefault");
          }
        }
        else {
          encFinally = EnigmailConstants.ENIG_FINAL_NO;
        }
        break;
      case EnigmailConstants.ENIG_ALWAYS:
        encFinally = EnigmailConstants.ENIG_FINAL_YES;
        encReason = EnigmailLocale.getString("reasonByRecipientRules");
        break;
      case EnigmailConstants.ENIG_AUTO_ALWAYS:
        encFinally = EnigmailConstants.ENIG_FINAL_YES;
        encReason = EnigmailLocale.getString("reasonByAutoEncryption");
        break;
      case EnigmailConstants.ENIG_CONFLICT:
        encFinally = EnigmailConstants.ENIG_FINAL_CONFLICT;
        encReason = EnigmailLocale.getString("reasonByConflict");
        break;
    }
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js:   encrypt=" + ((this.sendMode & ENCRYPT) !== 0) + " encryptByRules=" + this.encryptByRules + " encFinally=" + encFinally + "\n");
    EnigmailLog.DEBUG("                                encReason=" + encReason + "\n");

    // process resulting sign mode
    if (this.signForced == EnigmailConstants.ENIG_NEVER) { // force not to sign?
      signFinally = EnigmailConstants.ENIG_FINAL_FORCENO;
      signReason = EnigmailLocale.getString("reasonManuallyForced");
    }
    else if (this.signForced == EnigmailConstants.ENIG_ALWAYS) { // force to sign?
      signFinally = EnigmailConstants.ENIG_FINAL_FORCEYES;
      signReason = EnigmailLocale.getString("reasonManuallyForced");
    }
    else switch (this.signByRules) {
      case EnigmailConstants.ENIG_NEVER:
        signFinally = EnigmailConstants.ENIG_FINAL_NO;
        signReason = EnigmailLocale.getString("reasonByRecipientRules");
        break;
      case EnigmailConstants.ENIG_UNDEF:
        if (this.sendMode & SIGN) {
          signFinally = EnigmailConstants.ENIG_FINAL_YES;
          if (pgpEnabled && this.getAccDefault("sign-pgp")) {
            signReason = EnigmailLocale.getString("reasonEnabledByDefault");
          }
        }
        else {
          signFinally = EnigmailConstants.ENIG_FINAL_NO;
        }
        break;
      case EnigmailConstants.ENIG_ALWAYS:
        signFinally = EnigmailConstants.ENIG_FINAL_YES;
        signReason = EnigmailLocale.getString("reasonByRecipientRules");
        break;
      case EnigmailConstants.ENIG_CONFLICT:
        signFinally = EnigmailConstants.ENIG_FINAL_CONFLICT;
        signReason = EnigmailLocale.getString("reasonByConflict");
        break;
    }
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js:   signed=" + ((this.sendMode & SIGN) !== 0) + " signByRules=" + this.signByRules + " signFinally=" + signFinally + "\n");
    EnigmailLog.DEBUG("                                signReason=" + signReason + "\n");

    // process option to finally sign if encrypted/unencrypted
    // (unless rules force not to sign)

    if (this.finalSignDependsOnEncrypt && pgpEnabled) {
      if (this.signByRules == EnigmailConstants.ENIG_UNDEF) { // if final sign mode not clear yet
        //derivedFromEncMode = true;
        switch (encFinally) {
          case EnigmailConstants.ENIG_FINAL_YES:
          case EnigmailConstants.ENIG_FINAL_FORCEYES:
            if (this.getAccDefault("signIfEnc")) {
              signFinally = EnigmailConstants.ENIG_FINAL_YES;
              signReason = EnigmailLocale.getString("reasonByEncryptionMode");
            }
            break;
          case EnigmailConstants.ENIG_FINAL_NO:
          case EnigmailConstants.ENIG_FINAL_FORCENO:
            if (this.getAccDefault("signIfNotEnc")) {
              signFinally = EnigmailConstants.ENIG_FINAL_YES;
              signReason = EnigmailLocale.getString("reasonByEncryptionMode");
            }
            break;
          case EnigmailConstants.ENIG_FINAL_CONFLICT:
            if (this.getAccDefault("signIfEnc") && this.getAccDefault("signIfNotEnc")) {
              signFinally = EnigmailConstants.ENIG_FINAL_YES;
              signReason = EnigmailLocale.getString("reasonByEncryptionMode");
            }
            else {
              signFinally = EnigmailConstants.ENIG_FINAL_CONFLICT;
            }
            break;
        }
        EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js:   derived signFinally=" + signFinally + "\n");
        EnigmailLog.DEBUG("                                signReason=" + signReason + "\n");
      }
    }

    if (pgpEnabled) {
      this.statusPGPMime = EnigmailConstants.ENIG_FINAL_UNDEF;
    }
    else if (smimeEnabled) {
      this.statusPGPMime = EnigmailConstants.ENIG_FINAL_SMIME;
    }

    // ------ 2. Process S/MIME status  ------
    if (gSMFields) {

      let r = this.tryEnablingSMime(encFinally, signFinally);
      if (this.statusPGPMime === EnigmailConstants.ENIG_FINAL_SMIME &&
        r.encFinally === EnigmailConstants.ENIG_FINAL_NO &&
        (this.identity.getIntAttribute("encryptionpolicy") > 0)) {

        r.encFinally = EnigmailConstants.ENIG_FINAL_YES;
      }

      encFinally = r.encFinally;
      signFinally = r.signFinally;

      // FIXME: check if bug 776 can be fixed here

      if (encFinally === EnigmailConstants.ENIG_FINAL_NO &&
        this.signByRules === EnigmailConstants.ENIG_UNDEF &&
        signFinally !== EnigmailConstants.ENIG_FINAL_FORCEYES &&
        signFinally !== EnigmailConstants.ENIG_FINAL_FORCENO) {

        if (this.isEnigmailEnabled() &&
          !this.identity.getBoolAttribute("sign_mail") &&
          (this.getAccDefault("signIfNotEnc") || this.identity.getIntAttribute("defaultSigningPolicy") > 0)) {
          signFinally = EnigmailConstants.ENIG_FINAL_YES;
          this.statusPGPMime = EnigmailConstants.ENIG_FINAL_UNDEF;
        }
        else if (this.isSmimeEnabled() &&
          this.identity.getIntAttribute("defaultSigningPolicy") === 0 &&
          this.identity.getBoolAttribute("sign_mail")) {
          signFinally = EnigmailConstants.ENIG_FINAL_YES;
          this.statusPGPMime = EnigmailConstants.ENIG_FINAL_SMIME;
        }
      }

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

    // ------ 3. process final resulting protocol mode (inline-PGP / PGP/MIME / S/MIME) ------

    if (this.statusPGPMime !== EnigmailConstants.ENIG_FINAL_SMIME &&
      this.statusPGPMime !== EnigmailConstants.ENIG_FINAL_FORCESMIME) {
      // process resulting PGP/MIME mode
      if (this.pgpmimeForced === EnigmailConstants.ENIG_NEVER) { // force not to PGP/Mime?
        pgpmimeFinally = EnigmailConstants.ENIG_FINAL_FORCENO;
      }
      else if (this.pgpmimeForced === EnigmailConstants.ENIG_ALWAYS) { // force to PGP/Mime?
        pgpmimeFinally = EnigmailConstants.ENIG_FINAL_FORCEYES;
      }
      else switch (this.pgpmimeByRules) {
        case EnigmailConstants.ENIG_NEVER:
          pgpmimeFinally = EnigmailConstants.ENIG_FINAL_NO;
          break;
        case EnigmailConstants.ENIG_UNDEF:
          pgpmimeFinally = ((this.sendPgpMime || (this.sendMode & EnigmailConstants.SEND_PGP_MIME)) ? EnigmailConstants.ENIG_FINAL_YES : EnigmailConstants.ENIG_FINAL_NO);
          break;
        case EnigmailConstants.ENIG_ALWAYS:
          pgpmimeFinally = EnigmailConstants.ENIG_FINAL_YES;
          break;
        case EnigmailConstants.ENIG_CONFLICT:
          pgpmimeFinally = EnigmailConstants.ENIG_FINAL_CONFLICT;
          break;
      }
      this.statusPGPMime = pgpmimeFinally;
    }

    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js:   pgpmimeByRules=" + this.pgpmimeByRules + " pgpmimeFinally=" + pgpmimeFinally + "\n");

    this.statusEncrypted = encFinally;
    this.statusSigned = signFinally;
    this.reasonEncrypted = encReason;
    this.reasonSigned = signReason;

    switch (this.statusEncrypted) {
      case EnigmailConstants.ENIG_FINAL_CONFLICT:
      case EnigmailConstants.ENIG_FINAL_FORCENO:
      case EnigmailConstants.ENIG_FINAL_YES:
        return;
    }

    switch (this.statusPGPMime) {
      case EnigmailConstants.ENIG_FINAL_SMIME:
      case EnigmailConstants.ENIG_FINAL_FORCESMIME:
        return;
    }
  },

  /**
   * Try to enable S/MIME, repsecting the various Enigmail rules
   *
   * @param encFinally:  Number - "final" encryption status before applying S/MIME
   * @param signFinally: Number - "final" signing status before applying S/MIME
   *
   * @return Object:
   *   - encFinally:  Number - new encryption status after trying S/MIME
   *   - signFinally: Number - new signing status after trying S/MIME
   */

  tryEnablingSMime: function(encFinally, signFinally) {
    let encryptSmime = false;
    let autoSendEncrypted = EnigmailPrefs.getPref("autoSendEncrypted");

    gSMFields.requireEncryptMessage = false;
    gSMFields.signMessage = false;

    // do not try S/MIME encryption if one of the following applies:
    // - OpenPGP is preferred over S/MIME, and OpenPGP is possible
    // - OpenPGP is preferred over S/MIME, and OpenPGP is enabled by rules
    // - encryption is disabled by rules and encryption is not manually enabled
    // - encryption is manually disabled
    if (this.pgpmimeForced === EnigmailConstants.ENIG_FORCE_SMIME) {
      encryptSmime = true;
    }
    else if ((this.mimePreferOpenPGP === 1 && (this.autoPgpEncryption ||
        this.encryptByRules === EnigmailConstants.ENIG_ALWAYS)) ||
      (this.encryptByRules === EnigmailConstants.ENIG_NEVER && encFinally !== EnigmailConstants.ENIG_FINAL_FORCEYES) ||
      (this.pgpmimeForced === EnigmailConstants.ENIG_NEVER || this.pgpmimeForced === EnigmailConstants.ENIG_ALWAYS) ||
      encFinally === EnigmailConstants.ENIG_FINAL_FORCENO) {
      return {
        encFinally: encFinally,
        signFinally: signFinally
      };
    }

    if (!encryptSmime) {
      if (autoSendEncrypted === 1) {
        if (this.isSmimeEncryptionPossible()) {
          if (this.mimePreferOpenPGP === 0) {
            // S/MIME is preferred and encryption is possible
            encryptSmime = true;
            encFinally = EnigmailConstants.ENIG_FINAL_YES;
          }
          else if (encFinally === EnigmailConstants.ENIG_FINAL_NO ||
            encFinally === EnigmailConstants.ENIG_FINAL_CONFLICT ||
            !this.autoPgpEncryption) {
            // Enigmail is preferred but not possible; S/MIME enc. is possible
            encryptSmime = true;
            encFinally = EnigmailConstants.ENIG_FINAL_YES;
          }
        }
      }
      else if (encFinally === EnigmailConstants.ENIG_FINAL_FORCEYES) {
        if (this.isSmimeEncryptionPossible()) {
          if (this.mimePreferOpenPGP === 0 || (!this.autoPgpEncryption)) {
            // S/MIME is preferred and encryption is possible
            // or PGP/MIME is preferred but impossible
            encryptSmime = true;
          }
        }
      }
    }

    if (encryptSmime) {
      if (this.pgpmimeForced === EnigmailConstants.ENIG_FORCE_SMIME) {
        this.statusPGPMime = EnigmailConstants.ENIG_FINAL_FORCESMIME;
      }
      else
        this.statusPGPMime = EnigmailConstants.ENIG_FINAL_SMIME;

      if (encFinally === EnigmailConstants.ENIG_FINAL_YES ||
        encFinally === EnigmailConstants.ENIG_FINAL_FORCEYES) {
        gSMFields.requireEncryptMessage = true;
      }
      if (signFinally === EnigmailConstants.ENIG_FINAL_YES ||
        signFinally === EnigmailConstants.ENIG_FINAL_FORCEYES) {
        gSMFields.signMessage = true;
      }
    }
    else {
      gSMFields.requireEncryptMessage = false;

      if ((encFinally === EnigmailConstants.ENIG_FINAL_NO || encFinally === EnigmailConstants.ENIG_FINAL_FORCENO) &&
        this.mimePreferOpenPGP === 0 &&
        !(this.autoPgpEncryption && autoSendEncrypted === 1) &&
        (signFinally === EnigmailConstants.ENIG_FINAL_YES || signFinally === EnigmailConstants.ENIG_FINAL_FORCEYES)) {
        // S/MIME is preferred
        this.statusPGPMime = EnigmailConstants.ENIG_FINAL_SMIME;
        gSMFields.signMessage = true;
      }
      else {
        gSMFields.signMessage = false;
      }
    }

    return {
      encFinally: encFinally,
      signFinally: signFinally
    };

  },

  // process icon/strings of status bar buttons and menu entries according to final encrypt/sign/pgpmime status
  // - uses as INPUT:
  //   - this.statusEncrypt, this.statusSign, this.statusPGPMime
  // - uses as OUTPUT:
  //   - resulting icon symbols
  //   - this.statusEncryptStr, this.statusSignStr, this.statusPGPMimeStr, this.statusInlinePGPStr, this.statusAttachOwnKey
  //   - this.statusSMimeStr
  updateStatusBar: function() {
    return;
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.updateStatusBar()\n");
    this.statusEncryptedInStatusBar = this.statusEncrypted; // to double check broken promise for encryption

    if (!this.identity) {
      this.identity = getCurrentIdentity();
    }

    var toolbarTxt = document.getElementById("enigmail-toolbar-text");
    var encBroadcaster = document.getElementById("enigmail-bc-encrypt");
    var signBroadcaster = document.getElementById("enigmail-bc-sign");
    var attachBroadcaster = document.getElementById("enigmail-bc-attach");

    let enc = this.getEncryptionEnabled();
    let sign = this.getSigningEnabled();
    // enigmail disabled for this identity?:
    if (!enc) {
      // hide icons if enigmail not enabled
      encBroadcaster.removeAttribute("encrypted");
      encBroadcaster.setAttribute("disabled", "true");
    }
    else {
      encBroadcaster.removeAttribute("disabled");
    }

    if (!sign) {
      signBroadcaster.removeAttribute("signed");
      signBroadcaster.setAttribute("disabled", "true");
      attachBroadcaster.setAttribute("disabled", "true");
    }
    else {
      signBroadcaster.removeAttribute("disabled");
      attachBroadcaster.removeAttribute("disabled");
    }

    if (!(enc || sign)) {
      if (toolbarTxt) {
        toolbarTxt.value = EnigmailLocale.getString("msgCompose.toolbarTxt.disabled");
        toolbarTxt.removeAttribute("class");
      }
      return;
    }

    // process resulting icon symbol and status strings for encrypt mode
    var encSymbol = null;
    var doEncrypt = false;
    var encStr = null;
    switch (this.statusEncrypted) {
      case EnigmailConstants.ENIG_FINAL_FORCENO:
        encSymbol = "forceNo";
        encStr = EnigmailLocale.getString("encryptMessageNorm");
        break;
      case EnigmailConstants.ENIG_FINAL_FORCEYES:
        doEncrypt = true;
        encSymbol = "forceYes";
        encStr = EnigmailLocale.getString("encryptMessageNorm");
        break;
      case EnigmailConstants.ENIG_FINAL_NO:
        encSymbol = "inactiveNone";
        encStr = EnigmailLocale.getString("encryptMessageAuto");
        break;
      case EnigmailConstants.ENIG_FINAL_YES:
        doEncrypt = true;
        encSymbol = "forceYes";
        encStr = EnigmailLocale.getString("encryptMessageAuto");
        break;
      case EnigmailConstants.ENIG_FINAL_CONFLICT:
        encSymbol = "inactiveConflict";
        encStr = EnigmailLocale.getString("encryptMessageAuto");
        break;
    }
    var encReasonStr = null;
    if (doEncrypt) {
      if (this.reasonEncrypted && this.reasonEncrypted !== "") {
        encReasonStr = EnigmailLocale.getString("encryptOnWithReason", [this.reasonEncrypted]);
      }
      else {
        encReasonStr = EnigmailLocale.getString("encryptOn");
      }
    }
    else {
      if (this.reasonEncrypted && this.reasonEncrypted !== "") {
        encReasonStr = EnigmailLocale.getString("encryptOffWithReason", [this.reasonEncrypted]);
      }
      else {
        encReasonStr = EnigmailLocale.getString("encryptOff");
      }
    }
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js:   encSymbol=" + encSymbol + "  encReasonStr=" + encReasonStr + "\n");

    // update encrypt icon and tooltip/menu-text
    encBroadcaster.setAttribute("encrypted", encSymbol);
    var encIcon = document.getElementById("button-enigmail-encrypt");
    if (encIcon) {
      encIcon.setAttribute("tooltiptext", encReasonStr);
    }
    this.statusEncryptedStr = encStr;
    this.setChecked("enigmail-bc-encrypt", doEncrypt);

    // process resulting icon symbol for sign mode
    var signSymbol = null;
    var doSign = false;
    var signStr = "";
    switch (this.statusSigned) {
      case EnigmailConstants.ENIG_FINAL_FORCENO:
        signSymbol = "forceNo";
        signStr = EnigmailLocale.getString("signMessageNorm");
        signReasonStr = EnigmailLocale.getString("signOffWithReason", [this.reasonSigned]);
        break;
      case EnigmailConstants.ENIG_FINAL_FORCEYES:
        doSign = true;
        signSymbol = "forceYes";
        signStr = EnigmailLocale.getString("signMessageNorm");
        signReasonStr = EnigmailLocale.getString("signOnWithReason", [this.reasonSigned]);
        break;
      case EnigmailConstants.ENIG_FINAL_NO:
        signSymbol = "inactiveNone";
        signStr = EnigmailLocale.getString("signMessageAuto");
        signReasonStr = EnigmailLocale.getString("signOffWithReason", [this.reasonSigned]);
        break;
      case EnigmailConstants.ENIG_FINAL_YES:
        doSign = true;
        signSymbol = "forceYes";
        signStr = EnigmailLocale.getString("signMessageAuto");
        signReasonStr = EnigmailLocale.getString("signOnWithReason", [this.reasonSigned]);
        break;
      case EnigmailConstants.ENIG_FINAL_CONFLICT:
        signSymbol = "inactiveConflict";
        signStr = EnigmailLocale.getString("signMessageAuto");
        signReasonStr = EnigmailLocale.getString("signOffWithReason", [this.reasonSigned]);
        break;
    }
    var signReasonStr = null;
    if (doSign) {
      if (this.reasonSigned && this.reasonSigned !== "") {
        signReasonStr = EnigmailLocale.getString("signOnWithReason", [this.reasonSigned]);
      }
      else {
        signReasonStr = signStr;
      }
    }
    else {
      if (this.reasonSigned && this.reasonSigned !== "") {
        signReasonStr = EnigmailLocale.getString("signOffWithReason", [this.reasonSigned]);
      }
      else {
        signReasonStr = signStr;
      }
    }
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js:   signSymbol=" + signSymbol + "  signReasonStr=" + signReasonStr + "\n");

    // update sign icon and tooltip/menu-text
    signBroadcaster.setAttribute("signed", signSymbol);
    var signIcon = document.getElementById("button-enigmail-sign");
    if (signIcon) {
      signIcon.setAttribute("tooltiptext", signReasonStr);
    }
    this.statusSignedStr = signStr;
    this.setChecked("enigmail-bc-sign", doSign);

    // process resulting toolbar message
    var toolbarMsg = "";
    if (doSign && doEncrypt) {
      toolbarMsg = EnigmailLocale.getString("msgCompose.toolbarTxt.signAndEncrypt");
    }
    else if (doSign) {
      toolbarMsg = EnigmailLocale.getString("msgCompose.toolbarTxt.signOnly");
    }
    else if (doEncrypt) {
      toolbarMsg = EnigmailLocale.getString("msgCompose.toolbarTxt.encryptOnly");
    }
    else {
      toolbarMsg = EnigmailLocale.getString("msgCompose.toolbarTxt.noEncryption");
    }

    if (toolbarTxt) {
      toolbarTxt.value = toolbarMsg;

      if (Enigmail.msg.getSecurityParams()) {
        let si = Enigmail.msg.getSecurityParams(null, true);
        let isSmime = !EnigmailMimeEncrypt.isEnigmailCompField(si);

        if (!doSign && !doEncrypt &&
          !(isSmime &&
            (si.signMessage || si.requireEncryptMessage))) {
          toolbarTxt.setAttribute("class", "enigmailStrong");
        }
        else {
          toolbarTxt.removeAttribute("class");
        }
      }
      else {
        toolbarTxt.removeAttribute("class");
      }
    }

    // update pgp mime/inline PGP menu-text
    if (this.statusPGPMime == EnigmailConstants.ENIG_FINAL_YES) {
      this.statusPGPMimeStr = EnigmailLocale.getString("pgpmimeAuto");
    }
    else {
      this.statusPGPMimeStr = EnigmailLocale.getString("pgpmimeNormal");
    }

    if (this.statusPGPMime == EnigmailConstants.ENIG_FINAL_NO) {
      this.statusInlinePGPStr = EnigmailLocale.getString("inlinePGPAuto");
    }
    else {
      this.statusInlinePGPStr = EnigmailLocale.getString("inlinePGPNormal");
    }

    if (this.statusPGPMime == EnigmailConstants.ENIG_FINAL_SMIME) {
      this.statusSMimeStr = EnigmailLocale.getString("smimeAuto");
    }
    else {
      this.statusSMimeStr = EnigmailLocale.getString("smimeNormal");
    }

    this.displaySMimeToolbar();

    if (this.allowAttachOwnKey() === 1) {
      attachBroadcaster.removeAttribute("disabled");
    }
    else {
      attachBroadcaster.setAttribute("disabled", "true");
    }

  },


  displaySMimeToolbar: function() {
    let s = document.getElementById("signing-status");
    let e = document.getElementById("encryption-status");

    switch (this.statusPGPMime) {
      case EnigmailConstants.ENIG_FINAL_SMIME:
      case EnigmailConstants.ENIG_FINAL_FORCESMIME:
        if (s) s.removeAttribute("collapsed");
        if (e) e.removeAttribute("collapsed");
        break;
      default:
        if (s) s.setAttribute("collapsed", "true");
        if (e) e.setAttribute("collapsed", "true");
    }
  },

  /**
   * determine if own key may be attached.
   * @result: Number:
   *          -1: account not enabled for Enigmail
   *           0: account enabled but key mode set to "by Email address"
   *           1: account enabled; key specified
   */
  allowAttachOwnKey: function() {

    let allow = -1;

    if (this.isEnigmailEnabled()) {
      allow = 0;
      if (this.identity.getIntAttribute("pgpKeyMode") > 0) {
        let keyIdValue = this.identity.getCharAttribute("pgpkeyId");
        if (keyIdValue.search(/^ *(0x)?[0-9a-fA-F]* *$/) === 0) {
          allow = 1;
        }
      }
    }

    return allow;
  },

  /* compute whether to sign/encrypt according to current rules and sendMode
   * - without any interaction, just to process resulting status bar icons
   */
  determineSendFlags: function() {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.focusChange: Enigmail.msg.determineSendFlags\n");

    let detailsObj = {};

    this.statusEncryptedInStatusBar = null; // to double check broken promise for encryption

    if (!this.identity) {
      this.identity = getCurrentIdentity();
    }

    var compFields = gMsgCompose.compFields;

    if (!Enigmail.msg.composeBodyReady) {
      compFields = Components.classes["@mozilla.org/messengercompose/composefields;1"].createInstance(Components.interfaces.nsIMsgCompFields);
    }
    Recipients2CompFields(compFields);
    gMsgCompose.expandMailingLists();

    if (this.isEnigmailEnabled()) {
      // process list of to/cc email addresses
      // - bcc email addresses are ignored, when processing whether to sign/encrypt
      var toAddrList = [];
      var arrLen = {};
      var recList;
      if (compFields.to.length > 0) {
        recList = compFields.splitRecipients(compFields.to, true, arrLen);
        this.addRecipients(toAddrList, recList);
      }
      if (compFields.cc.length > 0) {
        recList = compFields.splitRecipients(compFields.cc, true, arrLen);
        this.addRecipients(toAddrList, recList);
      }

      this.encryptByRules = EnigmailConstants.ENIG_UNDEF;
      this.signByRules = EnigmailConstants.ENIG_UNDEF;
      this.pgpmimeByRules = EnigmailConstants.ENIG_UNDEF;

      // process rules
      if (toAddrList.length > 0 && EnigmailPrefs.getPref("assignKeysByRules")) {
        var matchedKeysObj = {};
        var flagsObj = {};
        if (EnigmailRules.mapAddrsToKeys(toAddrList.join(", "),
            false, // no interaction if not all addrs have a key
            window,
            matchedKeysObj, // resulting matching keys
            flagsObj)) { // resulting flags (0/1/2/3 for each type)
          this.encryptByRules = flagsObj.encrypt;
          this.signByRules = flagsObj.sign;
          this.pgpmimeByRules = flagsObj.pgpMime;

          if (matchedKeysObj.value && matchedKeysObj.value.length > 0) {
            // replace addresses with results from rules
            toAddrList = matchedKeysObj.value.split(", ");
          }
        }
      }

      let validKeyList = Enigmail.hlp.validKeysForAllRecipients(toAddrList.join(", "), detailsObj);

      this.autoPgpEncryption = (validKeyList !== null);

      // if not clear whether to encrypt yet, check whether automatically-send-encrypted applies
      if (toAddrList.length > 0 && this.encryptByRules == EnigmailConstants.ENIG_UNDEF && EnigmailPrefs.getPref("autoSendEncrypted") == 1) {
        if (validKeyList) {
          this.encryptByRules = EnigmailConstants.ENIG_AUTO_ALWAYS;
        }
      }
    }
    else {
      this.encryptByRules = EnigmailConstants.ENIG_UNDEF;
      this.signByRules = EnigmailConstants.ENIG_UNDEF;
      this.pgpmimeByRules = EnigmailConstants.ENIG_UNDEF;
      this.autoPgpEncryption = false;
    }

    // process and signal new resulting state
    this.processFinalState();
    this.updateStatusBar();

    return detailsObj;
  },

  setChecked: function(elementId, checked) {
    let elem = document.getElementById(elementId);
    if (elem) {
      if (checked) {
        elem.setAttribute("checked", "true");
      }
      else
        elem.removeAttribute("checked");
    }
  },

  setMenuSettings: function(postfix) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.setMenuSettings: postfix=" + postfix + "\n");

    let enigmailEnabled = this.isEnigmailEnabled();
    let smimeEnabled = this.isSmimeEnabled();

    const SIGN = EnigmailConstants.SEND_SIGNED;
    const ENCRYPT = EnigmailConstants.SEND_ENCRYPTED;

    var elem = document.getElementById("enigmail_compose_sign_item" + postfix);
    if (elem) {
      elem.setAttribute("label", this.statusSignedStr);
      switch (this.statusSigned) {
        case EnigmailConstants.ENIG_FINAL_YES:
        case EnigmailConstants.ENIG_FINAL_FORCEYES:
          elem.setAttribute("checked", "true");
          break;
        default:
          elem.setAttribute("checked", "false");
      }
    }

    elem = document.getElementById("enigmail_compose_encrypt_item" + postfix);
    if (elem) {
      elem.setAttribute("label", this.statusEncryptedStr);
      switch (this.statusEncrypted) {
        case EnigmailConstants.ENIG_FINAL_YES:
        case EnigmailConstants.ENIG_FINAL_FORCEYES:
          elem.setAttribute("checked", "true");
          break;
        default:
          elem.setAttribute("checked", "false");
      }
    }

    elem = document.getElementById("enigmail_compose_pgpmime_item" + postfix);
    if (elem) {
      elem.setAttribute("label", this.statusPGPMimeStr);
      if (enigmailEnabled) {
        elem.removeAttribute("disabled");
      }
      else {
        elem.setAttribute("disabled", "true");
      }

      switch (this.statusPGPMime) {
        case EnigmailConstants.ENIG_FINAL_YES:
        case EnigmailConstants.ENIG_FINAL_FORCEYES:
          elem.setAttribute("checked", "true");
          break;
        default:
          elem.setAttribute("checked", "false");
      }

      elem = document.getElementById("enigmail_compose_inline_item" + postfix);
      if (elem) {
        elem.setAttribute("label", this.statusInlinePGPStr);
        if (enigmailEnabled) {
          elem.removeAttribute("disabled");
        }
        else {
          elem.setAttribute("disabled", "true");
        }

        switch (this.statusPGPMime) {
          case EnigmailConstants.ENIG_FINAL_NO:
          case EnigmailConstants.ENIG_FINAL_FORCENO:
          case EnigmailConstants.ENIG_FINAL_CONFLICT:
          case EnigmailConstants.ENIG_FINAL_UNDEF:
            elem.setAttribute("checked", "true");
            break;
          default:
            elem.setAttribute("checked", "false");
        }
      }

      elem = document.getElementById("enigmail_compose_smime_item" + postfix);
      if (elem) {
        elem.setAttribute("label", this.statusSMimeStr);
        if (smimeEnabled) {
          elem.removeAttribute("disabled");
        }
        else {
          elem.setAttribute("disabled", "true");
        }

        switch (this.statusPGPMime) {
          case EnigmailConstants.ENIG_FINAL_SMIME:
          case EnigmailConstants.ENIG_FINAL_FORCESMIME:
            elem.setAttribute("checked", "true");
            break;
          default:
            elem.setAttribute("checked", "false");
        }
      }

      elem = document.getElementById("enigmail_insert_own_key");
      if (elem) {
        if (this.identity.getIntAttribute("pgpKeyMode") > 0) {
          elem.setAttribute("checked", this.attachOwnKeyObj.appendAttachment.toString());
          elem.removeAttribute("disabled");
        }
        else {
          elem.setAttribute("disabled", "true");
        }
      }

      elem = document.getElementById("enigmail_encrypt_subject");
      if (elem) {
        if (enigmailEnabled) {
          elem.setAttribute("checked", this.protectHeaders ? "true" : "false");
          elem.removeAttribute("disabled");
        }
        else {
          elem.setAttribute("disabled", "true");
        }
      }
    }
  },

  displaySecuritySettings: function() {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.displaySecuritySettings\n");

    var inputObj = {
      statusEncrypted: this.statusEncrypted,
      statusSigned: this.statusSigned,
      statusPGPMime: this.statusPGPMime,
      success: false,
      resetDefaults: false
    };
    window.openDialog("chrome://openpgp/content/ui/enigmailEncryptionDlg.xhtml", "", "dialog,modal,centerscreen", inputObj);

    if (!inputObj.success) return; // Cancel pressed

    if (inputObj.resetDefaults) {
      // reset everything to defaults
      this.encryptForced = EnigmailConstants.ENIG_UNDEF;
      this.signForced = EnigmailConstants.ENIG_UNDEF;
      this.pgpmimeForced = EnigmailConstants.ENIG_UNDEF;
      this.finalSignDependsOnEncrypt = true;
    }
    else {
      if (this.signForced != inputObj.sign) {
        this.dirty = 2;
        this.signForced = inputObj.sign;
        this.finalSignDependsOnEncrypt = false;
      }

      if (this.encryptForced != inputObj.encrypt || this.pgpmimeForced != inputObj.pgpmime) {
        this.dirty = 2;
      }

      this.encryptForced = inputObj.encrypt;
      this.pgpmimeForced = inputObj.pgpmime;
    }

    this.processFinalState();
    this.updateStatusBar();
  },


  signingNoLongerDependsOnEnc: function() {
    if (this.finalSignDependsOnEncrypt) {
      EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.signingNoLongerDependsOnEnc(): unbundle final signing\n");
      this.finalSignDependsOnEncrypt = false;

      EnigmailDialog.alertPref(window, EnigmailLocale.getString("signIconClicked"), "displaySignWarn");
    }
  },


  confirmBeforeSend: function(toAddrStr, gpgKeys, sendFlags, isOffline) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.confirmBeforeSend: sendFlags=" + sendFlags + "\n");
    // get confirmation before sending message

    const SIGN = EnigmailConstants.SEND_SIGNED;
    const ENCRYPT = EnigmailConstants.SEND_ENCRYPTED;

    // get wording for message status (e.g. " SIGNED ENCRYPTED")
    var msgStatus = "";


    if (sendFlags & (ENCRYPT | SIGN)) {
      if (this.statusPGPMime === EnigmailConstants.ENIG_FINAL_SMIME ||
        this.statusPGPMime === EnigmailConstants.ENIG_FINAL_FORCESMIME) {
        msgStatus += " " + EnigmailLocale.getString("statSMIME");
      }
      else if (sendFlags & EnigmailConstants.SEND_PGP_MIME) {
        msgStatus += " " + EnigmailLocale.getString("statPGPMIME");
      }

      if (sendFlags & SIGN) {
        msgStatus += " " + EnigmailLocale.getString("statSigned");
      }
      if (sendFlags & ENCRYPT) {
        msgStatus += " " + EnigmailLocale.getString("statEncrypted");
      }
    }
    else {
      msgStatus += " " + EnigmailLocale.getString("statPlain");
    }

    // create message
    var msgConfirm = "";
    try {
      if (isOffline || sendFlags & EnigmailConstants.SEND_LATER) {
        msgConfirm = EnigmailLocale.getString("offlineSave", [msgStatus, EnigmailFuncs.stripEmail(toAddrStr).replace(/,/g, ", ")]);
      }
      else {
        msgConfirm = EnigmailLocale.getString("onlineSend", [msgStatus, EnigmailFuncs.stripEmail(toAddrStr).replace(/,/g, ", ")]);
      }
    }
    catch (ex) {}

    // add list of keys
    if (sendFlags & ENCRYPT) {
      gpgKeys = gpgKeys.replace(/^, /, "").replace(/, $/, "");

      // make gpg keys unique
      let keyList = gpgKeys.split(/[, ]+/).reduce(function _f(p, key) {
        if (p.indexOf(key) < 0) p.push(key);
        return p;
      }, []);

      if (this.statusPGPMime !== EnigmailConstants.ENIG_FINAL_SMIME &&
        this.statusPGPMime !== EnigmailConstants.ENIG_FINAL_FORCESMIME) {
        msgConfirm += "\n\n" + EnigmailLocale.getString("encryptKeysNote", [keyList.join(", ")]);
      }
    }

    return EnigmailDialog.confirmDlg(window, msgConfirm,
      EnigmailLocale.getString((isOffline || sendFlags & EnigmailConstants.SEND_LATER) ?
        "msgCompose.button.save" : "msgCompose.button.send"));
  },


  addRecipients: function(toAddrList, recList) {
    for (var i = 0; i < recList.length; i++) {
      try {
        toAddrList.push(EnigmailFuncs.stripEmail(recList[i].replace(/[",]/g, "")));
      }
      catch (ex) {}
    }
  },

  setDraftStatus: function(doEncrypt) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.setDraftStatus - enabling draft mode\n");

    // Draft Status:
    // N (for new style) plus String of 4 numbers:
    // 1: encryption
    // 2: signing
    // 3: PGP/MIME
    // 4: attach own key
    // 5: subject encrypted

    var draftStatus = "N" + this.encryptForced + this.signForced + this.pgpmimeForced +
      (this.attachOwnKeyObj.appendAttachment ? "1" : "0") + (doEncrypt && this.protectHeaders ? "1" : "0");

    this.setAdditionalHeader("X-Enigmail-Draft-Status", draftStatus);
  },

  getForceRecipientDlg: function() {
    // force add-rule dialog for each missing key?:
    let forceRecipientSettings = false;
    // if keys are ONLY assigned by rules, force add-rule dialog for each missing key
    if (EnigmailPrefs.getPref("assignKeysByRules") &&
      !EnigmailPrefs.getPref("assignKeysByEmailAddr") &&
      !EnigmailPrefs.getPref("assignKeysManuallyIfMissing") &&
      !EnigmailPrefs.getPref("assignKeysManuallyAlways")) {
      forceRecipientSettings = true;
    }
    return forceRecipientSettings;
  },

  getSenderUserId: function() {
    var userIdValue = null;

    if (this.identity.getIntAttribute("pgpKeyMode") > 0) {
      userIdValue = this.identity.getCharAttribute("pgpkeyId");

      if (!userIdValue) {

        var mesg = EnigmailLocale.getString("composeSpecifyEmail");

        var valueObj = {
          value: userIdValue
        };

        if (EnigmailDialog.promptValue(window, mesg, valueObj)) {
          userIdValue = valueObj.value;
        }
      }

      if (userIdValue) {
        this.identity.setCharAttribute("pgpkeyId", userIdValue);

      }
      else {
        this.identity.setIntAttribute("pgpKeyMode", 0);
      }
    }

    if (typeof(userIdValue) != "string") {
      EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.getSenderUserId: type of userIdValue=" + typeof(userIdValue) + "\n");
      userIdValue = this.identity.email;
    }

    if (this.identity.getIntAttribute("pgpKeyMode") === 0) {
      let key = EnigmailKeyRing.getSecretKeyByEmail(userIdValue);
      if (key) {
        userIdValue = "0x" + key.fpr;
      }
    }
    return userIdValue;
  },


  /* process rules and find keys for passed email addresses
   * This is THE core method to prepare sending encryptes emails.
   * - it processes the recipient rules (if not disabled)
   * - it
   *
   * @sendFlags:    Longint - all current combined/processed send flags (incl. optSendFlags)
   * @optSendFlags: Longint - may only be SEND_ALWAYS_TRUST or SEND_ENCRYPT_TO_SELF
   * @gotSendFlags: Longint - initial sendMode of encryptMsg() (0 or SIGN or ENCRYPT or SIGN|ENCRYPT)
   * @fromAddr:     String - from email
   * @toAddrList:   Array  - both to and cc receivers
   * @bccAddrList:  Array  - bcc receivers
   * @return:       Object:
   *                - sendFlags (Longint)
   *                - toAddrStr  comma separated string of unprocessed to/cc emails
   *                - bccAddrStr comma separated string of unprocessed to/cc emails
   *                or null (cancel sending the email)
   */
  keySelection: function(enigmailSvc, sendFlags, optSendFlags, gotSendFlags, fromAddr, toAddrList, bccAddrList) {
    EnigmailLog.DEBUG("=====> keySelection()\n");
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.keySelection()\n");

    const SIGN = EnigmailConstants.SEND_SIGNED;
    const ENCRYPT = EnigmailConstants.SEND_ENCRYPTED;

    let toAddrStr = toAddrList.join(", ");
    let bccAddrStr = bccAddrList.join(", ");
    let keyMap = {};

    // NOTE: If we only have bcc addresses, we currently do NOT process rules and select keys at all
    //       This is GOOD because sending keys for bcc addresses makes bcc addresses visible
    //       (thus compromising the concept of bcc)
    //       THUS, we disable encryption even though all bcc receivers might want to have it encrypted.
    if (toAddrStr.length === 0) {
      EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.keySelection(): skip key selection because we neither have \"to\" nor \"cc\" addresses\n");

      if (this.statusPGPMime == EnigmailConstants.ENIG_FINAL_YES ||
        this.statusPGPMime == EnigmailConstants.ENIG_FINAL_FORCEYES) {
        sendFlags |= EnigmailConstants.SEND_PGP_MIME;
      }
      else if (this.statusPGPMime == EnigmailConstants.ENIG_FINAL_NO ||
        this.statusPGPMime == EnigmailConstants.ENIG_FINAL_FORCENO ||
        this.statusPGPMime == EnigmailConstants.ENIG_FINAL_CONFLICT) {
        sendFlags &= ~EnigmailConstants.SEND_PGP_MIME;
      }

      return {
        sendFlags: sendFlags,
        toAddrStr: toAddrStr,
        bccAddrStr: bccAddrStr,
        keyMap: keyMap
      };
    }

    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.keySelection(): toAddrStr=\"" + toAddrStr + "\" bccAddrStr=\"" + bccAddrStr + "\"\n");

    var forceRecipientSettings = this.getForceRecipientDlg();

    // REPEAT 1 or 2 times:
    // NOTE: The only way to call this loop twice is to come to the "continue;" statement below,
    //       which forces a second iteration (with forceRecipientSettings==true)
    var doRulesProcessingAgain;
    do {
      doRulesProcessingAgain = false;

      // process rules if not disabled
      // - enableRules: rules not temporarily disabled
      // REPLACES email addresses by keys in its result !!!
      var refreshKeyList = true;
      if (EnigmailPrefs.getPref("assignKeysByRules") && this.enableRules) {
        let result = this.processRules(forceRecipientSettings, sendFlags, optSendFlags, toAddrStr, bccAddrStr);
        if (!result) {
          return null;
        }
        sendFlags = result.sendFlags;
        optSendFlags = result.optSendFlags;
        toAddrStr = result.toAddr; // replace email addresses with rules by the corresponding keys
        bccAddrStr = result.bccAddr; // replace email addresses with rules by the corresponding keys
        refreshKeyList = !result.didRefreshKeyList; // if key list refreshed we don't have to do it again
        keyMap = result.keyMap;
      }

      // if encryption is requested for the email:
      // - encrypt test message for default encryption
      // - might trigger a second iteration through this loop
      //   - if during its dialog for manual key selection "create per-recipient rules" is pressed
      //   to force manual settings for missing keys
      // LEAVES remaining email addresses not covered by rules as they are
      /*
      if (sendFlags & ENCRYPT) {
        let result = this.encryptTestMessage(enigmailSvc, sendFlags, optSendFlags,
          fromAddr, toAddrStr, bccAddrStr, bccAddrList, refreshKeyList);
        if (!result) {
          return null;
        }
        sendFlags = result.sendFlags;
        toAddrStr = result.toAddrStr;
        bccAddrStr = result.bccAddrStr;
        if (result.doRulesProcessingAgain) { // start rule processing again ?
          doRulesProcessingAgain = true;
          if (result.createNewRule) {
            forceRecipientSettings = true;
          }
        }
      }
      */
    } while (doRulesProcessingAgain);

    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.keySelection(): return toAddrStr=\"" + toAddrStr + "\" bccAddrStr=\"" + bccAddrStr + "\"\n");
    EnigmailLog.DEBUG("  <=== keySelection()\n");
    return {
      sendFlags: sendFlags,
      toAddrStr: toAddrStr,
      bccAddrStr: bccAddrStr,
      keyMap: keyMap
    };
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


  /**
   * check if S/MIME encryption can be enabled
   *
   * @return: Boolean - true: keys for all recipients are available
   */
  isSmimeEncryptionPossible: function() {
    let id = getCurrentIdentity();

    if (id.getUnicharAttribute("encryption_cert_name") === "") return false;

    // enable encryption if keys for all recipients are available

    let missingCount = {};
    let emailAddresses = {};

    try {
      if (!gMsgCompose.compFields.hasRecipients) return false;
      Components.classes["@mozilla.org/messenger-smime/smimejshelper;1"]
        .createInstance(Components.interfaces.nsISMimeJSHelper)
        .getNoCertAddresses(gMsgCompose.compFields,
          missingCount,
          emailAddresses);
    }
    catch (e) {
      return false;
    }

    if (missingCount.value === 0) {
      return true;
    }

    return false;
  },

  /**
   * try to apply the OpenPGP rules
   *
   * @forceRecipientSetting: Boolean - force manual selection for each missing key?
   * @sendFlags:             Integer - all current combined/processed send flags (incl. optSendFlags)
   * @optSendFlags:          Integer - may only be SEND_ALWAYS_TRUST or SEND_ENCRYPT_TO_SELF
   * @toAddrStr:             String  - comma separated string of keys and unprocessed to/cc emails
   * @bccAddrStr:            String  - comma separated string of keys and unprocessed bcc emails
   * @return:       { sendFlags, toAddr, bccAddr }
   *                or null (cancel sending the email)
   */
  processRules: function(forceRecipientSettings, sendFlags, optSendFlags, toAddrStr, bccAddrStr) {
    EnigmailLog.DEBUG("=====> processRules()\n");
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.processRules(): toAddrStr=\"" + toAddrStr + "\" bccAddrStr=\"" + bccAddrStr + "\" forceRecipientSettings=" +
      forceRecipientSettings + "\n");

    // process defaults
    const SIGN = EnigmailConstants.SEND_SIGNED;
    const ENCRYPT = EnigmailConstants.SEND_ENCRYPTED;
    let didRefreshKeyList = false; // return value to signal whether the key list was refreshed

    // get keys for to and cc addresses:
    // - matchedKeysObj will contain the keys and the remaining toAddrStr elements
    let matchedKeysObj = {}; // returned value for matched keys
    let details = {};
    let keyMap = {};
    let flagsObj = {}; // returned value for flags
    if (!EnigmailRules.mapAddrsToKeys(toAddrStr,
        forceRecipientSettings, // true => start dialog for addrs without any key
        window,
        matchedKeysObj,
        flagsObj)) {
      return null;
    }
    if (matchedKeysObj.value) {
      toAddrStr = matchedKeysObj.value;
      EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.processRules(): after mapAddrsToKeys() toAddrStr=\"" + toAddrStr + "\"\n");

      if (matchedKeysObj.addrKeysList) {
        for (let i = 0; i < matchedKeysObj.addrKeysList.length; i++) {
          keyMap[matchedKeysObj.addrKeysList[i].addr] = matchedKeysObj.addrKeysList[i].keys;
        }
      }
    }
    this.encryptByRules = flagsObj.encrypt;
    this.signByRules = flagsObj.sign;
    this.pgpmimeByRules = flagsObj.pgpMime;

    // if not clear whether to encrypt yet, check whether automatically-send-encrypted applies
    // - check whether bcc is empty here? if (bccAddrStr.length === 0)
    let validKeyList = Enigmail.hlp.validKeysForAllRecipients(toAddrStr, details);
    if (validKeyList) {
      if (toAddrStr.length > 0 && this.encryptByRules == EnigmailConstants.ENIG_UNDEF && EnigmailPrefs.getPref("autoSendEncrypted") == 1) {
        this.encryptByRules = EnigmailConstants.ENIG_AUTO_ALWAYS;
        toAddrStr = validKeyList.join(", ");
      }

      for (let i in details.keyMap) {
        if (i.search(/^0x[0-9A-F]+$/i) < 0) {
          keyMap[i] = details.keyMap[i];
        }
      }
    }

    // process final state
    this.processFinalState(sendFlags);

    // final handling of conflicts:
    // - pgpMime conflicts always result into pgpMime = 0/'never'
    if (this.statusPGPMime == EnigmailConstants.ENIG_FINAL_CONFLICT) {
      this.statusPGPMime = EnigmailConstants.ENIG_FINAL_NO;
    }
    // - encrypt/sign conflicts result into result 0/'never'
    //   with possible dialog to give a corresponding feedback
    var conflictFound = false;
    if (this.statusEncrypted == EnigmailConstants.ENIG_FINAL_CONFLICT) {
      this.statusEncrypted = EnigmailConstants.ENIG_FINAL_NO;
      conflictFound = true;
    }
    if (this.statusSigned == EnigmailConstants.ENIG_FINAL_CONFLICT) {
      this.statusSigned = EnigmailConstants.ENIG_FINAL_NO;
      conflictFound = true;
    }
    if (conflictFound) {
      if (!Enigmail.hlp.processConflicts(this.statusEncrypted == EnigmailConstants.ENIG_FINAL_YES || this.statusEncrypted == EnigmailConstants.ENIG_FINAL_FORCEYES,
          this.statusSigned == EnigmailConstants.ENIG_FINAL_YES || this.statusSigned == EnigmailConstants.ENIG_FINAL_FORCEYES)) {
        return null;
      }
    }

    // process final sendMode
    //  ENIG_FINAL_CONFLICT no longer possible
    switch (this.statusEncrypted) {
      case EnigmailConstants.ENIG_FINAL_NO:
      case EnigmailConstants.ENIG_FINAL_FORCENO:
        sendFlags &= ~ENCRYPT;
        break;
      case EnigmailConstants.ENIG_FINAL_YES:
      case EnigmailConstants.ENIG_FINAL_FORCEYES:
        sendFlags |= ENCRYPT;
        break;
    }
    switch (this.statusSigned) {
      case EnigmailConstants.ENIG_FINAL_NO:
      case EnigmailConstants.ENIG_FINAL_FORCENO:
        sendFlags &= ~SIGN;
        break;
      case EnigmailConstants.ENIG_FINAL_YES:
      case EnigmailConstants.ENIG_FINAL_FORCEYES:
        sendFlags |= SIGN;
        break;
    }
    switch (this.statusPGPMime) {
      case EnigmailConstants.ENIG_FINAL_NO:
      case EnigmailConstants.ENIG_FINAL_FORCENO:
        sendFlags &= ~EnigmailConstants.SEND_PGP_MIME;
        break;
      case EnigmailConstants.ENIG_FINAL_YES:
      case EnigmailConstants.ENIG_FINAL_FORCEYES:
        sendFlags |= EnigmailConstants.SEND_PGP_MIME;
        break;
    }

    // get keys according to rules for bcc addresses:
    // - matchedKeysObj will contain the keys and the remaining bccAddrStr elements
    // - NOTE: bcc recipients are ignored when in general computing whether to sign or encrypt or pgpMime
    if (!EnigmailRules.mapAddrsToKeys(bccAddrStr,
        forceRecipientSettings, // true => start dialog for addrs without any key
        window,
        matchedKeysObj,
        flagsObj)) {
      return null;
    }
    if (matchedKeysObj.value) {
      bccAddrStr = matchedKeysObj.value;
      EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.processRules(): after mapAddrsToKeys() bccAddrStr=\"" + bccAddrStr + "\"\n");
    }

    EnigmailLog.DEBUG("  <=== processRules()\n");
    return {
      sendFlags: sendFlags,
      optSendFlags: optSendFlags,
      toAddr: toAddrStr,
      bccAddr: bccAddrStr,
      didRefreshKeyList: didRefreshKeyList,
      keyMap: keyMap
    };
  },


  /* encrypt a test message to see whether we have all necessary keys
   *
   * @sendFlags:    all current combined/processed send flags (incl. optSendFlags)
   * @optSendFlags: may only be SEND_ALWAYS_TRUST or SEND_ENCRYPT_TO_SELF
   * @fromAddr:     from email
   * @toAddrStr:    comma separated string of keys and unprocessed to/cc emails
   * @bccAddrStr:   comma separated string of keys and unprocessed bcc emails
   * @bccAddrList:  bcc receivers
   * @return:       doRulesProcessingAgain: start with rule processing once more
   *                or null (cancel sending the email)
   */
  encryptTestMessage: function(enigmailSvc, sendFlags, optSendFlags, fromAddr, toAddrStr, bccAddrStr, bccAddrList, refresh) {
    EnigmailLog.DEBUG("=====> encryptTestMessage()\n");

    const SIGN = EnigmailConstants.SEND_SIGNED;
    const ENCRYPT = EnigmailConstants.SEND_ENCRYPTED;

    var testCipher = null;
    var testExitCodeObj = {};
    var testStatusFlagsObj = {};
    var testErrorMsgObj = {};

    // get keys for remaining email addresses
    // - NOTE: This should not be necessary; however, in GPG there is a problem:
    //         Only the first key found for an email is used.
    //         If this is invalid, no other keys are tested.
    //         Thus, WE make it better here in enigmail until the bug is fixed.
    var details = {}; // will contain msgList[] afterwards
    if (EnigmailPrefs.getPref("assignKeysByEmailAddr")) {
      var validKeyList = Enigmail.hlp.validKeysForAllRecipients(toAddrStr, details);
      if (validKeyList) {
        toAddrStr = validKeyList.join(", ");
      }
    }

    // encrypt test message for test recipients
    var testPlain = "Test Message";
    var testUiFlags = EnigmailConstants.UI_TEST;
    var testSendFlags = EnigmailConstants.SEND_TEST | ENCRYPT | optSendFlags;
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptTestMessage(): call encryptMessage() for fromAddr=\"" + fromAddr + "\" toAddrStr=\"" + toAddrStr + "\" bccAddrStr=\"" +
      bccAddrStr + "\"\n");
    testCipher = EnigmailEncryption.encryptMessage(window, testUiFlags, testPlain,
      fromAddr, toAddrStr, bccAddrStr,
      testSendFlags,
      testExitCodeObj,
      testStatusFlagsObj,
      testErrorMsgObj);

    if (testStatusFlagsObj.value & (EnigmailConstants.INVALID_RECIPIENT | EnigmailConstants.NO_SECKEY)) {
      // check if own key is invalid
      EnigmailDialog.alert(window, testErrorMsgObj.value);
      return null;
    }

    // if
    // - "always ask/manually" (even if all keys were found) or
    // - unless "ask for missing keys":
    //   - we have an invalid recipient or
    //   - we could not resolve any/all keys
    //     (due to disabled "assignKeysByEmailAddr"" or multiple keys with same trust for a recipient)
    // start the dialog for user selected keys
    if (EnigmailPrefs.getPref("assignKeysManuallyAlways") ||
      (((testStatusFlagsObj.value & EnigmailConstants.INVALID_RECIPIENT) ||
          toAddrStr.indexOf('@') >= 0) &&
        EnigmailPrefs.getPref("assignKeysManuallyIfMissing")) ||
      (details && details.errArray && details.errArray.length > 0)
    ) {

      // check for invalid recipient keys
      var resultObj = {
        foundKeys: false
      };
      var inputObj = {};
      inputObj.toAddr = toAddrStr;
      inputObj.invalidAddr = Enigmail.hlp.getInvalidAddress(testErrorMsgObj.value);
      if (details && details.errArray && details.errArray.length > 0) {
        inputObj.errArray = details.errArray;
      }

      // prepare dialog options:
      inputObj.options = "multisel";
      if (EnigmailPrefs.getPref("assignKeysByRules")) {
        inputObj.options += ",rulesOption"; // enable button to create per-recipient rule
      }
      if (EnigmailPrefs.getPref("assignKeysManuallyAlways")) {
        inputObj.options += ",noforcedisp";
      }
      if (!(sendFlags & SIGN)) {
        inputObj.options += ",unsigned";
      }
      if (this.trustAllKeys) {
        inputObj.options += ",trustallkeys";
      }
      if (sendFlags & EnigmailConstants.SEND_LATER) {
        let sendLaterLabel = EnigmailLocale.getString("sendLaterCmd.label");
        inputObj.options += ",sendlabel=" + sendLaterLabel;
      }
      inputObj.options += ",";
      inputObj.dialogHeader = EnigmailLocale.getString("recipientsSelectionHdr");

      // perform key selection dialog:
      window.openDialog("chrome://openpgp/content/ui/enigmailKeySelection.xhtml", "",
        "dialog,modal,centerscreen,resizable", inputObj, resultObj);

      // process result from key selection dialog:
      try {
        // CANCEL:
        if (resultObj.cancelled) {
          return null;
        }


        // repeat checking of rules etc. (e.g. after importing new key)
        if (resultObj.repeatEvaluation) {
          // THIS is the place that triggers a second iteration
          let returnObj = {
            doRulesProcessingAgain: true,
            createNewRule: false,
            sendFlags: sendFlags,
            toAddrStr: toAddrStr,
            bccAddrStr: bccAddrStr
          };

          // "Create per recipient rule(s)":
          if (resultObj.perRecipientRules && this.enableRules) {
            // do an extra round because the user wants to set a PGP rule
            returnObj.createNewRule = true;
          }

          return returnObj;
        }

        // process OK button:
        if (resultObj.encrypt) {
          sendFlags |= ENCRYPT; // should anyway be set
          if (bccAddrList.length > 0) {
            toAddrStr = "";
            bccAddrStr = resultObj.userList.join(", ");
          }
          else {
            toAddrStr = resultObj.userList.join(", ");
            bccAddrStr = "";
          }
        }
        else {
          // encryption explicitely turned off
          sendFlags &= ~ENCRYPT;
          // counts as forced non-encryption
          // (no internal error if different state was processed before)
          this.statusEncrypted = EnigmailConstants.ENIG_FINAL_NO;
          this.statusEncryptedInStatusBar = EnigmailConstants.ENIG_FINAL_NO;
        }
        if (resultObj.sign) {
          sendFlags |= SIGN;
        }
        else {
          sendFlags &= ~SIGN;
        }
        testCipher = "ok";
        testExitCodeObj.value = 0;
      }
      catch (ex) {
        // cancel pressed -> don't send mail
        return null;
      }
    }
    // If test encryption failed and never ask manually, turn off default encryption
    if ((!testCipher || (testExitCodeObj.value !== 0)) &&
      !EnigmailPrefs.getPref("assignKeysManuallyIfMissing") &&
      !EnigmailPrefs.getPref("assignKeysManuallyAlways")) {
      sendFlags &= ~ENCRYPT;
      this.statusEncrypted = EnigmailConstants.ENIG_FINAL_NO;
      this.statusEncryptedInStatusBar = EnigmailConstants.ENIG_FINAL_NO;
      EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptTestMessage: No default encryption because test failed\n");
    }
    EnigmailLog.DEBUG("  <=== encryptTestMessage()\n");
    return {
      doRulesProcessingAgain: false,
      createNewRule: false,
      sendFlags: sendFlags,
      toAddrStr: toAddrStr,
      bccAddrStr: bccAddrStr
    };
  },

  /* Manage the wrapping of inline signed mails
   *
   * @wrapresultObj: Result:
   * @wrapresultObj.cancelled, true if send operation is to be cancelled, else false
   * @wrapresultObj.usePpgMime, true if message send option was changed to PGP/MIME, else false
   */

  wrapInLine: function(wrapresultObj) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: WrapInLine\n");
    wrapresultObj.cancelled = false;
    wrapresultObj.usePpgMime = false;
    try {
      const dce = Components.interfaces.nsIDocumentEncoder;
      var editor = gMsgCompose.editor.QueryInterface(Components.interfaces.nsIEditorMailSupport);
      var encoderFlags = dce.OutputFormatted | dce.OutputLFLineBreak;

      var wrapWidth = this.getMailPref("mailnews.wraplength");
      if (wrapWidth > 0 && wrapWidth < 68 && editor.wrapWidth > 0) {
        if (EnigmailDialog.confirmDlg(window, EnigmailLocale.getString("minimalLineWrapping", [wrapWidth]))) {
          wrapWidth = 68;
          EnigmailPrefs.getPrefRoot().setIntPref("mailnews.wraplength", wrapWidth);
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
          EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Excess lines detected\n");
          var resultObj = {};
          window.openDialog("chrome://openpgp/content/ui/enigmailWrapSelection.xhtml", "", "dialog,modal,centerscreen", resultObj);
          try {
            if (resultObj.cancelled) {
              // cancel pressed -> do not send, return instead.
              wrapresultObj.cancelled = true;
              return;
            }
          }
          catch (ex) {
            // cancel pressed -> do not send, return instead.
            wrapresultObj.cancelled = true;
            return;
          }

          var quote = "";
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
    }
    catch (ex) {
      EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Exception while wrapping=" + ex + "\n");
    }

  },

  // Save draft message. We do not want most of the other processing for encrypted mails here...
  saveDraftMessage: function() {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: saveDraftMessage()\n");


    let doEncrypt = this.isEnigmailEnabled() && this.identity.getBoolAttribute("autoEncryptDrafts");

    this.setDraftStatus(doEncrypt);

    if (!doEncrypt) {
      EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: drafts disabled\n");

      try {
        if (EnigmailMimeEncrypt.isEnigmailCompField(Enigmail.msg.getSecurityParams())) {
          Enigmail.msg.getSecurityParams().wrappedJSObject.sendFlags = 0;
        }
      }
      catch (ex) {}

      return true;
    }

    let sendFlags = EnigmailConstants.SEND_PGP_MIME | EnigmailConstants.SEND_ENCRYPTED | EnigmailConstants.SAVE_MESSAGE | EnigmailConstants.SEND_ALWAYS_TRUST;

    if (this.protectHeaders) {
      sendFlags |= EnigmailConstants.ENCRYPT_HEADERS;
    }

    let fromAddr = this.identity.email;
    let userIdValue = this.getSenderUserId();
    if (userIdValue) {
      fromAddr = userIdValue;
    }

    let enigmailSvc = EnigmailCore.getService(window);
    if (!enigmailSvc) return true;

    if (this.preferPgpOverSmime(sendFlags) === 0) return true; // use S/MIME

    // Try to save draft

    var testCipher = null;
    var testExitCodeObj = {};
    var testStatusFlagsObj = {};
    var testErrorMsgObj = {};

    // encrypt test message for test recipients
    var testPlain = "Test Message";
    var testUiFlags = EnigmailConstants.UI_TEST;
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.saveDraft(): call encryptMessage() for fromAddr=\"" + fromAddr + "\"\n");
    testCipher = EnigmailEncryption.encryptMessage(null, testUiFlags, testPlain,
      fromAddr, fromAddr, "",
      sendFlags | EnigmailConstants.SEND_TEST,
      testExitCodeObj,
      testStatusFlagsObj,
      testErrorMsgObj);

    if (testStatusFlagsObj.value & (EnigmailConstants.INVALID_RECIPIENT | EnigmailConstants.NO_SECKEY)) {
      // check if own key is invalid
      if (testErrorMsgObj.value && testErrorMsgObj.value.length > 0) {
        ++this.saveDraftError;
        if (this.saveDraftError === 1) {
          this.notifyUser(3, EnigmailLocale.getString("msgCompose.cannotSaveDraft"), "saveDraftFailed",
            testErrorMsgObj.value);
        }
        return false;
      }
    }

    let secInfo;

    if (EnigmailMimeEncrypt.isEnigmailCompField(Enigmail.msg.getSecurityParams())) {
      secInfo = Enigmail.msg.getSecurityParams().wrappedJSObject;
    }
    else {
      try {
        secInfo = EnigmailMimeEncrypt.createMimeEncrypt(Enigmail.msg.getSecurityParams());
        if (secInfo) {
          Enigmail.msg.setSecurityParams(secInfo);
        }
      }
      catch (ex) {
        EnigmailLog.writeException("enigmailMsgComposeOverlay.js: Enigmail.msg.saveDraftMessage", ex);
        return false;
      }
    }

    secInfo.sendFlags = sendFlags;
    secInfo.UIFlags = 0;
    secInfo.senderEmailAddr = fromAddr;
    secInfo.recipients = fromAddr;
    secInfo.bccRecipients = "";
    secInfo.originalSubject = gMsgCompose.compFields.subject;
    this.dirty = true;

    if (this.protectHeaders) {
      gMsgCompose.compFields.subject = "";
    }

    return true;
  },

  createEnigmailSecurityFields: function(oldSecurityInfo) {
    let newSecurityInfo = EnigmailMimeEncrypt.createMimeEncrypt(Enigmail.msg.getSecurityParams());

    if (!newSecurityInfo)
      throw Components.results.NS_ERROR_FAILURE;

    Enigmail.msg.setSecurityParams(newSecurityInfo);
  },

  isSendConfirmationRequired: function(sendFlags) {
    // process whether final confirmation is necessary

    const SIGN = EnigmailConstants.SEND_SIGNED;
    const ENCRYPT = EnigmailConstants.SEND_ENCRYPTED;

    let confirm = false;
    let confPref = EnigmailPrefs.getPref("confirmBeforeSending");
    switch (confPref) {
      case 0: // never
        confirm = false;
        break;
      case 1: // always
        confirm = true;
        break;
      case 2: // if send encrypted
        confirm = ((sendFlags & ENCRYPT) == ENCRYPT);
        break;
      case 3: // if send unencrypted
        confirm = ((sendFlags & ENCRYPT) === 0);
        break;
      case 4: // if encryption changed due to rules
        confirm = ((sendFlags & ENCRYPT) != (this.sendMode & ENCRYPT));
        break;
    }

    // double check that no internal error did result in broken promise of encryption
    // - if NOT send encrypted
    //   - although encryption was
    //     - the recent processed resulting encryption status or
    //     - was signaled in the status bar but is not the outcome now
    if ((sendFlags & ENCRYPT) === 0 &&
      this.statusPGPMime !== EnigmailConstants.ENIG_FINAL_SMIME &&
      this.statusPGPMime !== EnigmailConstants.ENIG_FINAL_FORCESMIME &&
      (this.statusEncrypted == EnigmailConstants.ENIG_FINAL_YES ||
        this.statusEncrypted == EnigmailConstants.ENIG_FINAL_FORCEYES ||
        this.statusEncryptedInStatusBar == EnigmailConstants.ENIG_FINAL_YES ||
        this.statusEncryptedInStatusBar == EnigmailConstants.ENIG_FINAL_FORCEYES)) {
      EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.isSendConfirmationRequired: promised encryption did not succeed\n");
      if (!EnigmailDialog.confirmDlg(window,
          EnigmailLocale.getString("msgCompose.internalEncryptionError"),
          EnigmailLocale.getString("msgCompose.button.sendAnyway"))) {
        return null; // cancel sending
      }
      // without canceling sending, force firnal confirmation
      confirm = true;
    }

    return confirm;
  },

  compileFromAndTo: function() {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.compileFromAndTo\n");
    let compFields = gMsgCompose.compFields;
    let toAddrList = [];
    let recList;
    let arrLen = {};

    if (!Enigmail.msg.composeBodyReady) {
      compFields = Components.classes["@mozilla.org/messengercompose/composefields;1"].createInstance(Components.interfaces.nsIMsgCompFields);
    }
    Recipients2CompFields(compFields);
    gMsgCompose.expandMailingLists();

    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: to='" + compFields.to + "'\n");
    if (compFields.to.length > 0) {
      toAddrList = EnigmailFuncs.parseEmails(compFields.to, false);
    }

    if (compFields.cc.length > 0) {
      toAddrList = toAddrList.concat(EnigmailFuncs.parseEmails(compFields.cc, false));
    }

    if (compFields.bcc.length > 0) {
      toAddrList = toAddrList.concat(EnigmailFuncs.parseEmails(compFields.bcc, false));
    }

    for (let addr of toAddrList) {
      // determine incomplete addresses --> do not attempt pEp encryption
      if (addr.email.search(/.@./) < 0) return null;
    }

    this.identity = getCurrentIdentity();
    let from = {
      email: this.identity.email,
      name: this.identity.fullName
    };
    return {
      from: from,
      toAddrList: toAddrList
    };
  },

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
        if (this.attachOwnKeyObj.appendAttachment) {
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

  getEncryptionFlags: function(msgSendType) {
    let gotSendFlags = this.sendMode;
    let sendFlags = 0;

    console.debug(`in getEncryptionFlags, statusEnc=${this.statusEncrypted}, statusSign=${this.statusSigned}`);

    // here we process the final state:
    if (this.statusEncrypted == EnigmailConstants.ENIG_FINAL_YES ||
      this.statusEncrypted == EnigmailConstants.ENIG_FINAL_FORCEYES) {
      gotSendFlags |= EnigmailConstants.SEND_ENCRYPTED;
    }
    else if (this.statusEncrypted == EnigmailConstants.ENIG_FINAL_FORCENO) {
      gotSendFlags &= ~EnigmailConstants.SEND_ENCRYPTED;
    }

    if (this.statusSigned == EnigmailConstants.ENIG_FINAL_YES ||
      this.statusSigned == EnigmailConstants.ENIG_FINAL_FORCEYES) {
      gotSendFlags |= EnigmailConstants.SEND_SIGNED;
    }
    else if (this.statusSigned == EnigmailConstants.ENIG_FINAL_FORCENO) {
      gotSendFlags &= ~EnigmailConstants.SEND_SIGNED;
    }

    if (gotSendFlags & EnigmailConstants.SEND_SIGNED)
      sendFlags |= EnigmailConstants.SEND_SIGNED;
    if (gotSendFlags & EnigmailConstants.SEND_ENCRYPTED)
      sendFlags |= EnigmailConstants.SEND_ENCRYPTED;

    if (msgSendType === Ci.nsIMsgCompDeliverMode.Later) {
      EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.getEncryptionFlags: adding SEND_LATER\n");
      sendFlags |= EnigmailConstants.SEND_LATER;
    }

    return {
      sendFlags: sendFlags,
      gotSendFlags: gotSendFlags
    };
  },

  resetDirty: function() {
    let newSecurityInfo = null;

    if (this.dirty) {
      // make sure the sendFlags are reset before the message is processed
      // (it may have been set by a previously cancelled send operation!)

      let si = Enigmail.msg.getSecurityParams();

      if (EnigmailMimeEncrypt.isEnigmailCompField(si)) {
        si.sendFlags = 0;
        si.originalSubject = gMsgCompose.compFields.subject;
      }
      else {
        try {
          newSecurityInfo = EnigmailMimeEncrypt.createMimeEncrypt(si);
          if (newSecurityInfo) {
            newSecurityInfo.sendFlags = 0;
            newSecurityInfo.originalSubject = gMsgCompose.compFields.subject;

            Enigmail.msg.setSecurityParams(newSecurityInfo);
          }
        }
        catch (ex) {
          EnigmailLog.writeException("enigmailMsgComposeOverlay.js: Enigmail.msg.resetDirty", ex);
        }
      }
    }

    return newSecurityInfo;
  },

  determineMsgRecipients: function(sendFlags) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.determineMsgRecipients: currentId=" + this.identity +
      ", " + this.identity.email + "\n");

    let promptSvc = EnigmailDialog.getPromptSvc();
    let fromAddr = this.identity.email;
    let toAddrList = [];
    let recList;
    let bccAddrList = [];
    let arrLen = {};
    let splitRecipients;

    if (!this.isEnigmailEnabled()) return true;

    let optSendFlags = 0;
    let msgCompFields = gMsgCompose.compFields;
    let newsgroups = msgCompFields.newsgroups;

    // request or preference to always accept (even non-authenticated) keys?
    if (this.trustAllKeys) {
      optSendFlags |= EnigmailConstants.SEND_ALWAYS_TRUST;
    }
    else {
      let acceptedKeys = EnigmailPrefs.getPref("acceptedKeys");
      switch (acceptedKeys) {
        case 0: // accept valid/authenticated keys only
          break;
        case 1: // accept all but revoked/disabled/expired keys
          optSendFlags |= EnigmailConstants.SEND_ALWAYS_TRUST;
          break;
        default:
          EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.determineMsgRecipients: INVALID VALUE for acceptedKeys: \"" + acceptedKeys + "\"\n");
          break;
      }
    }

    if (EnigmailPrefs.getPref("encryptToSelf")) {
      optSendFlags |= EnigmailConstants.SEND_ENCRYPT_TO_SELF;
    }

    sendFlags |= optSendFlags;

    var userIdValue = this.getSenderUserId();
    if (userIdValue) {
      fromAddr = userIdValue;
    }

    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.determineMsgRecipients:gMsgCompose=" + gMsgCompose + "\n");

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
      }
      catch (ex) {}
      EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.determineMsgRecipients: BCC: " + bccLC + "\n");

      var selfBCC = this.identity.email && (this.identity.email.toLowerCase() == bccLC);

      if (selfBCC) {
        EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.determineMsgRecipients: Self BCC\n");
        this.addRecipients(toAddrList, recList);

      }
      else if (sendFlags & EnigmailConstants.SEND_ENCRYPTED) {
        // BCC and encryption

        var dummy = {
          value: null
        };

        var hideBccUsers = promptSvc.confirmEx(window,
          EnigmailLocale.getString("enigConfirm"),
          EnigmailLocale.getString("sendingHiddenRcpt"), (promptSvc.BUTTON_TITLE_IS_STRING * promptSvc.BUTTON_POS_0) +
          (promptSvc.BUTTON_TITLE_CANCEL * promptSvc.BUTTON_POS_1) +
          (promptSvc.BUTTON_TITLE_IS_STRING * promptSvc.BUTTON_POS_2),
          EnigmailLocale.getString("sendWithShownBcc"),
          null,
          EnigmailLocale.getString("sendWithHiddenBcc"),
          null,
          dummy);
        switch (hideBccUsers) {
          case 2:
            this.addRecipients(bccAddrList, recList);
            this.addRecipients(toAddrList, recList);
            break;
          case 0:
            this.addRecipients(toAddrList, recList);
            break;
          case 1:
            return false;
        }
      }
    }

    if (newsgroups) {
      toAddrList.push(newsgroups);

      if (sendFlags & EnigmailConstants.SEND_ENCRYPTED) {
        if (!EnigmailPrefs.getPref("encryptToNews")) {
          EnigmailDialog.alert(window, EnigmailLocale.getString("sendingNews"));
          return false;
        }
        else if (!EnigmailDialog.confirmPref(window,
            EnigmailLocale.getString("sendToNewsWarning"),
            "warnOnSendingNewsgroups",
            EnigmailLocale.getString("msgCompose.button.send"))) {
          return false;
        }
      }
    }

    return {
      sendFlags: sendFlags,
      optSendFlags: optSendFlags,
      fromAddr: fromAddr,
      toAddrList: toAddrList,
      bccAddrList: bccAddrList
    };
  },

  appendInlineAttachments: function(sendFlags) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: appendInlineAttachments()\n");

    let bucketList = document.getElementById("attachmentBucket");
    let hasAttachments = ((bucketList && bucketList.hasChildNodes()) || gMsgCompose.compFields.attachVCard);
    let inlineEncAttach = false;

    if (hasAttachments &&
      (sendFlags & (EnigmailConstants.SEND_ENCRYPTED | EnigmailConstants.SEND_SIGNED)) &&
      !(sendFlags & EnigmailConstants.SEND_PGP_MIME)) {

      let inputObj = {
        pgpMimePossible: true,
        inlinePossible: true,
        restrictedScenario: false,
        reasonForCheck: ""
      };
      // init reason for dialog to be able to use the right labels
      if (sendFlags & EnigmailConstants.SEND_ENCRYPTED) {
        if (sendFlags & EnigmailConstants.SEND_SIGNED) {
          inputObj.reasonForCheck = "encryptAndSign";
        }
        else {
          inputObj.reasonForCheck = "encrypt";
        }
      }
      else {
        if (sendFlags & EnigmailConstants.SEND_SIGNED) {
          inputObj.reasonForCheck = "sign";
        }
      }

      // determine if attachments are all local files (currently the only
      // supported kind of attachments)
      let node = bucketList.firstChild;
      while (node) {
        if (node.attachment.url.substring(0, 7) != "file://") {
          inputObj.inlinePossible = false;
        }
        node = node.nextSibling;
      }

      if (inputObj.pgpMimePossible || inputObj.inlinePossible) {
        let resultObj = {
          selected: EnigmailPrefs.getPref("encryptAttachments")
        };

        //skip or not
        var skipCheck = EnigmailPrefs.getPref("encryptAttachmentsSkipDlg");
        if (skipCheck == 1) {
          if ((resultObj.selected == 2 && inputObj.pgpMimePossible === false) || (resultObj.selected == 1 && inputObj.inlinePossible === false)) {
            //add var to disable remember box since we're dealing with restricted scenarios...
            inputObj.restrictedScenario = true;
            resultObj.selected = -1;
            window.openDialog("chrome://openpgp/content/ui/enigmailAttachmentsDialog.xhtml", "", "dialog,modal,centerscreen", inputObj, resultObj);
          }
        }
        else {
          resultObj.selected = -1;
          window.openDialog("chrome://openpgp/content/ui/enigmailAttachmentsDialog.xhtml", "", "dialog,modal,centerscreen", inputObj, resultObj);
        }
        if (resultObj.selected < 0) {
          // dialog cancelled
          return null;
        }
        else if (resultObj.selected == 1) {
          // encrypt attachments
          inlineEncAttach = true;
        }
        else if (resultObj.selected == 2) {
          // send as PGP/MIME
          sendFlags |= EnigmailConstants.SEND_PGP_MIME;
        }
        else if (resultObj.selected == 3) {
          // cancel the encryption/signing for the whole message
          sendFlags &= ~EnigmailConstants.SEND_ENCRYPTED;
          sendFlags &= ~EnigmailConstants.SEND_SIGNED;
        }
      }
      else {
        if (sendFlags & EnigmailConstants.SEND_ENCRYPTED) {
          if (!EnigmailDialog.confirmDlg(window,
              EnigmailLocale.getString("attachWarning"),
              EnigmailLocale.getString("msgCompose.button.send")))
            return null;
        }
      }
    }

    return {
      inlineEncAttach: inlineEncAttach
    };
  },

  prepareSending: function(sendFlags, toAddrStr, gpgKeys, isOffline) {
    let confirm = this.isSendConfirmationRequired(sendFlags);
    if (confirm === null) return false;
    // perform confirmation dialog if necessary/requested
    if (confirm) {
      if (!this.confirmBeforeSend(toAddrStr, gpgKeys, sendFlags, isOffline)) {
        if (this.processed) {
          this.undoEncryption(0);
        }
        else {
          this.removeAttachedKey();
        }
        return false;
      }
    }
    else if ((sendFlags & EnigmailConstants.SEND_WITH_CHECK) &&
      !this.messageSendCheck()) {
      // Abort send
      if (this.processed) {
        this.undoEncryption(0);
      }
      else {
        this.removeAttachedKey();
      }

      return false;
    }

    return true;
  },

  prepareSecurityInfo: function(sendFlags, uiFlags, rcpt, newSecurityInfo, keyMap = {}) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.prepareSecurityInfo(): Using PGP/MIME, flags=" + sendFlags + "\n");

    let oldSecurityInfo = Enigmail.msg.getSecurityParams();

    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.prepareSecurityInfo: oldSecurityInfo = " + oldSecurityInfo + "\n");

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

    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.prepareSecurityInfo: securityInfo = " + newSecurityInfo + "\n");
    return newSecurityInfo;
  },

  encryptMsg: function(msgSendType) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptMsg: msgSendType=" + msgSendType + ", Enigmail.msg.sendMode=" + this.sendMode + ", Enigmail.msg.statusEncrypted=" +
      this.statusEncrypted +
      "\n");

    const SIGN = EnigmailConstants.SEND_SIGNED;
    const ENCRYPT = EnigmailConstants.SEND_ENCRYPTED;
    const DeliverMode = Components.interfaces.nsIMsgCompDeliverMode;
    let promptSvc = EnigmailDialog.getPromptSvc();

    var ioService = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
    // EnigSend: Handle both plain and encrypted messages below
    var isOffline = (ioService && ioService.offline);

    let {
      sendFlags,
      gotSendFlags
    } = this.getEncryptionFlags(msgSendType);

    if (this.statusPGPMime == EnigmailConstants.ENIG_FINAL_SMIME ||
      this.statusPGPMime == EnigmailConstants.ENIG_FINAL_FORCESMIME) {

      return this.sendSmimeEncrypted(msgSendType, sendFlags, isOffline);
    }

    switch (msgSendType) {
      case DeliverMode.SaveAsDraft:
      case DeliverMode.SaveAsTemplate:
      case DeliverMode.AutoSaveAsDraft:
        EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptMsg: detected save draft\n");

        // saving drafts is simpler and works differently than the rest of Enigmail.
        // All rules except account-settings are ignored.
        return this.saveDraftMessage();
    }

    this.unsetAdditionalHeader("x-enigmail-draft-status");

    let msgCompFields = gMsgCompose.compFields;
    let newsgroups = msgCompFields.newsgroups; // Check if sending to any newsgroups

    if (msgCompFields.to === "" && msgCompFields.cc === "" &&
      msgCompFields.bcc === "" && newsgroups === "") {
      // don't attempt to send message if no recipient specified
      var bundle = document.getElementById("bundle_composeMsgs");
      EnigmailDialog.alert(window, bundle.getString("12511"));
      return false;
    }

    this.identity = getCurrentIdentity();

    if (gWindowLocked) {
      EnigmailDialog.alert(window, EnigmailLocale.getString("windowLocked"));
      return false;
    }

    let newSecurityInfo = this.resetDirty();
    this.dirty = 1;

    let enigmailSvc = EnigmailCore.getService(window);
    if (!enigmailSvc) {
      var msg = EnigmailLocale.getString("sendUnencrypted");
      if (EnigmailCore.getEnigmailService() && EnigmailCore.getEnigmailService().initializationError) {
        msg = EnigmailCore.getEnigmailService().initializationError + "\n\n" + msg;
      }

      return EnigmailDialog.confirmDlg(window, msg, EnigmailLocale.getString("msgCompose.button.send"));
    }

    try {

      this.modifiedAttach = null;

      // fill fromAddr, toAddrList, bcc etc
      let rcpt = this.determineMsgRecipients(sendFlags);
      if (typeof(rcpt) === "boolean") {
        return rcpt;
      }
      sendFlags = rcpt.sendFlags;

      if (this.sendPgpMime) {
        // Use PGP/MIME
        sendFlags |= EnigmailConstants.SEND_PGP_MIME;
      }

      let result = this.keySelection(enigmailSvc,
        sendFlags, // all current combined/processed send flags (incl. optSendFlags)
        rcpt.optSendFlags, // may only be SEND_ALWAYS_TRUST or SEND_ENCRYPT_TO_SELF
        gotSendFlags, // initial sendMode (0 or SIGN or ENCRYPT or SIGN|ENCRYPT)
        rcpt.fromAddr, rcpt.toAddrList, rcpt.bccAddrList);
      if (!result) {
        return false;
      }

      sendFlags = result.sendFlags;
      let toAddrStr = result.toAddrStr;
      let bccAddrStr = result.bccAddrStr;
      let keyMap = result.keyMap;

      if (this.attachOwnKeyObj.appendAttachment) {
        this.attachOwnKey();
      }

      if (this.preferPgpOverSmime(sendFlags) === 0) {
        // use S/MIME
        Attachments2CompFields(gMsgCompose.compFields); // update list of attachments
        sendFlags = 0;
        return true;
      }

      let attach = this.appendInlineAttachments(sendFlags);
      if (!attach) {
        return false;
      }
      let inlineEncAttach = attach.inlineEncAttach;

      var usingPGPMime = (sendFlags & EnigmailConstants.SEND_PGP_MIME) &&
        (sendFlags & (ENCRYPT | SIGN));

      if (!this.checkProtectHeaders(sendFlags)) {
        return false;
      }

      // ----------------------- Rewrapping code, taken from function "encryptInline"

      // Check wrapping, if sign only and inline and plaintext
      if ((sendFlags & SIGN) && !(sendFlags & ENCRYPT) && !(usingPGPMime) && !(gMsgCompose.composeHTML)) {
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

      if (usingPGPMime)
        uiFlags |= EnigmailConstants.UI_PGP_MIME;

      if ((sendFlags & (ENCRYPT | SIGN)) && usingPGPMime) {
        // Use PGP/MIME
        newSecurityInfo = this.prepareSecurityInfo(sendFlags, uiFlags, rcpt, newSecurityInfo, keyMap);
        newSecurityInfo.recipients = toAddrStr;
        newSecurityInfo.bccRecipients = bccAddrStr;
      }
      else if (!this.processed && (sendFlags & (ENCRYPT | SIGN))) {
        // use inline PGP

        let sendInfo = {
          sendFlags: sendFlags,
          inlineEncAttach: inlineEncAttach,
          fromAddr: rcpt.fromAddr,
          toAddr: toAddrStr,
          bccAddr: bccAddrStr,
          uiFlags: uiFlags,
          bucketList: document.getElementById("attachmentBucket")
        };

        if (!this.encryptInline(sendInfo)) {
          return false;
        }
      }

      // update the list of attachments
      Attachments2CompFields(msgCompFields);

      if (!this.prepareSending(sendFlags,
          rcpt.toAddrList.join(", "),
          toAddrStr + ", " + bccAddrStr,
          isOffline
        )) {
          return false;
      }

      if (msgCompFields.characterSet != "ISO-2022-JP") {
        if ((usingPGPMime &&
            ((sendFlags & (ENCRYPT | SIGN)))) || ((!usingPGPMime) && (sendFlags & ENCRYPT))) {
          try {
            // make sure plaintext is not changed to 7bit
            if (typeof(msgCompFields.forceMsgEncoding) == "boolean") {
              msgCompFields.forceMsgEncoding = true;
              EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptMsg: enabled forceMsgEncoding\n");
            }
          }
          catch (ex) {
            console.debug(ex)
          }
        }
      }
    }
    catch (ex) {
      EnigmailLog.writeException("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptMsg", ex);
      let msg = EnigmailLocale.getString("signFailed");
      if (EnigmailCore.getEnigmailService() && EnigmailCore.getEnigmailService().initializationError) {
        msg += "\n" + EnigmailCore.getEnigmailService().initializationError;
      }
      return EnigmailDialog.confirmDlg(window, msg, EnigmailLocale.getString("msgCompose.button.sendUnencrypted"));
    }

    // The encryption process for PGP/MIME messages follows "here". It's
    // called automatically from nsMsgCompose->sendMsg().
    // registration for this is done in core.jsm: startup()

    return true;
  },

  checkProtectHeaders: function(sendFlags) {
    if (!(sendFlags & EnigmailConstants.SEND_PGP_MIME)) return true;
    if (sendFlags & EnigmailConstants.SEND_ENCRYPTED) {

      if ((!this.protectHeaders) && EnigmailPrefs.getPref("protectedHeaders") === 1) {
        let enableProtection = EnigmailDialog.msgBox(window, {
          dialogTitle: EnigmailLocale.getString("msgCompose.protectSubject.dialogTitle"),
          msgtext: EnigmailLocale.getString("msgCompose.protectSubject.question"),
          iconType: EnigmailConstants.ICONTYPE_QUESTION,
          button1: EnigmailLocale.getString("msgCompose.protectSubject.yesButton"),
          button2: "extra1:" + EnigmailLocale.getString("msgCompose.protectSubject.noButton")
        });

        if (enableProtection === -1) return false;

        EnigmailPrefs.setPref("protectedHeaders", enableProtection === 0 ? 2 : 0);
        this.protectHeaders = (enableProtection === 0);
        this.displayProtectHeadersStatus();
      }
    }

    return true;
  },

  encryptInline: function(sendInfo) {
    // sign/encrypt message using inline-PGP

    const dce = Components.interfaces.nsIDocumentEncoder;
    const SIGN = EnigmailConstants.SEND_SIGNED;
    const ENCRYPT = EnigmailConstants.SEND_ENCRYPTED;

    var enigmailSvc = EnigmailCore.getService(window);
    if (!enigmailSvc) return false;

    if (gMsgCompose.composeHTML) {
      var errMsg = EnigmailLocale.getString("hasHTML");
      EnigmailDialog.alertCount(window, "composeHtmlAlertCount", errMsg);
    }

    try {
      var convert = DetermineConvertibility();
      if (convert == Components.interfaces.nsIMsgCompConvertible.No) {
        if (!EnigmailDialog.confirmDlg(window,
            EnigmailLocale.getString("strippingHTML"),
            EnigmailLocale.getString("msgCompose.button.sendAnyway"))) {
          return false;
        }
      }
    }
    catch (ex) {
      EnigmailLog.writeException("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptInline", ex);
    }

    try {
      if (this.getMailPref("mail.strictly_mime")) {
        if (EnigmailDialog.confirmPref(window,
            EnigmailLocale.getString("quotedPrintableWarn"), "quotedPrintableWarn")) {
          EnigmailPrefs.getPrefRoot().setBoolPref("mail.strictly_mime", false);
        }
      }
    }
    catch (ex) {}


    var sendFlowed;
    try {
      sendFlowed = this.getMailPref("mailnews.send_plaintext_flowed");
    }
    catch (ex) {
      sendFlowed = true;
    }
    var encoderFlags = dce.OutputFormatted | dce.OutputLFLineBreak;

    var editor = gMsgCompose.editor.QueryInterface(Components.interfaces.nsIEditorMailSupport);
    var wrapWidth = 72;

    if (!(sendInfo.sendFlags & ENCRYPT)) {
      // signed messages only
      if (gMsgCompose.composeHTML) {
        // enforce line wrapping here
        // otherwise the message isn't signed correctly
        try {
          wrapWidth = this.getMailPref("editor.htmlWrapColumn");

          if (wrapWidth > 0 && wrapWidth < 68 && gMsgCompose.wrapLength > 0) {
            if (EnigmailDialog.confirmDlg(window, EnigmailLocale.getString("minimalLineWrapping", [wrapWidth]))) {
              EnigmailPrefs.getPrefRoot().setIntPref("editor.htmlWrapColumn", 68);
            }
          }
          if (EnigmailPrefs.getPref("wrapHtmlBeforeSend")) {
            if (wrapWidth) {
              editor.wrapWidth = wrapWidth - 2; // prepare for the worst case: a 72 char's long line starting with '-'
              editor.rewrap(false);
            }
          }
        }
        catch (ex) {}
      }
      else {
        // plaintext: Wrapping code has been moved to superordinate function encryptMsg to enable interactive format switch
      }
    }

    var exitCodeObj = {};
    var statusFlagsObj = {};
    var errorMsgObj = {};
    var exitCode;

    // Get plain text
    // (Do we need to set the nsIDocumentEncoder.* flags?)
    var origText = this.editorGetContentAs("text/plain",
      encoderFlags);
    if (!origText)
      origText = "";

    if (origText.length > 0) {
      // Sign/encrypt body text

      var escText = origText; // Copy plain text for possible escaping

      if (sendFlowed && !(sendInfo.sendFlags & ENCRYPT)) {
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

      // Encrypt plaintext
      var charset = this.editorGetCharset();
      EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptMsg: charset=" + charset + "\n");

      // Encode plaintext to charset from unicode
      var plainText = (sendInfo.sendFlags & ENCRYPT) ?
        EnigmailData.convertFromUnicode(origText, charset) :
        EnigmailData.convertFromUnicode(escText, charset);

      var cipherText = EnigmailEncryption.encryptMessage(window, sendInfo.uiFlags, plainText,
        sendInfo.fromAddr, sendInfo.toAddr, sendInfo.bccAddr,
        sendInfo.sendFlags,
        exitCodeObj, statusFlagsObj,
        errorMsgObj);

      exitCode = exitCodeObj.value;

      //EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: cipherText = '"+cipherText+"'\n");
      if (cipherText && (exitCode === 0)) {
        // Encryption/signing succeeded; overwrite plaintext

        if (gMsgCompose.composeHTML) {
          // workaround for Thunderbird bug (TB adds an extra space in front of the text)
          cipherText = "\n" + cipherText;
        }
        else
          cipherText = cipherText.replace(/\r\n/g, "\n");

        if ((sendInfo.sendFlags & ENCRYPT) && charset &&
          (charset.search(/^us-ascii$/i) !== 0)) {
          // Add Charset armor header for encrypted blocks
          cipherText = cipherText.replace(/(-----BEGIN PGP MESSAGE----- *)(\r?\n)/, "$1$2Charset: " + charset + "$2");
        }

        // Decode ciphertext from charset to unicode and overwrite
        this.replaceEditorText(EnigmailData.convertToUnicode(cipherText, charset));
        this.enableUndoEncryption(true);

        // Save original text (for undo)
        this.processed = {
          "origText": origText,
          "charset": charset
        };

      }
      else {
        // Restore original text
        this.replaceEditorText(origText);
        this.enableUndoEncryption(false);

        if (sendInfo.sendFlags & (ENCRYPT | SIGN)) {
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

    if (sendInfo.inlineEncAttach) {
      // encrypt attachments
      this.modifiedAttach = [];
      exitCode = this.encryptAttachments(sendInfo.bucketList, this.modifiedAttach,
        window, sendInfo.uiFlags, sendInfo.fromAddr, sendInfo.toAddr, sendInfo.bccAddr,
        sendInfo.sendFlags, errorMsgObj);
      if (exitCode !== 0) {
        this.modifiedAttach = null;
        this.sendAborted(window, errorMsgObj);
        if (this.processed) {
          this.undoEncryption(0);
        }
        else {
          this.removeAttachedKey();
        }
        return false;
      }
    }
    return true;
  },


  sendAborted: function(window, errorMsgObj) {
    if (errorMsgObj && errorMsgObj.value) {
      var txt = errorMsgObj.value;
      var txtLines = txt.split(/\r?\n/);
      var errorMsg = "";
      for (var i = 0; i < txtLines.length; ++i) {
        var line = txtLines[i];
        var tokens = line.split(/ /);
        // process most important business reasons for invalid recipient (and sender) errors:
        if (tokens.length == 3 && (tokens[0] == "INV_RECP" || tokens[0] == "INV_SGNR")) {
          var reason = tokens[1];
          var key = tokens[2];
          if (reason == "10") {
            errorMsg += EnigmailLocale.getString("keyNotTrusted", [key]) + "\n";
          }
          else if (reason == "1") {
            errorMsg += EnigmailLocale.getString("keyNotFound", [key]) + "\n";
          }
          else if (reason == "4") {
            errorMsg += EnigmailLocale.getString("keyRevoked", [key]) + "\n";
          }
          else if (reason == "5") {
            errorMsg += EnigmailLocale.getString("keyExpired", [key]) + "\n";
          }
        }
      }
      if (errorMsg !== "") {
        txt = errorMsg + "\n" + txt;
      }
      EnigmailDialog.info(window, EnigmailLocale.getString("sendAborted") + txt);
    }
    else {
      EnigmailDialog.info(window, EnigmailLocale.getString("sendAborted") + "\n" +
        EnigmailLocale.getString("msgCompose.internalError"));
    }
  },


  getMailPref: function(prefName) {
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
    }
    catch (ex) {
      // Failed to get pref value
      EnigmailLog.ERROR("enigmailMsgComposeOverlay.js: Enigmail.msg.getMailPref: unknown prefName:" + prefName + " \n");
    }

    return prefValue;
  },

  messageSendCheck: function() {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.messageSendCheck\n");

    try {
      var warn = this.getMailPref("mail.warn_on_send_accel_key");

      if (warn) {
        var checkValue = {
          value: false
        };
        var bundle = document.getElementById("bundle_composeMsgs");
        var buttonPressed = EnigmailDialog.getPromptSvc().confirmEx(window,
          bundle.getString('sendMessageCheckWindowTitle'),
          bundle.getString('sendMessageCheckLabel'), (EnigmailDialog.getPromptSvc().BUTTON_TITLE_IS_STRING * EnigmailDialog.getPromptSvc().BUTTON_POS_0) +
          (EnigmailDialog.getPromptSvc().BUTTON_TITLE_CANCEL * EnigmailDialog.getPromptSvc().BUTTON_POS_1),
          bundle.getString('sendMessageCheckSendButtonLabel'),
          null, null,
          bundle.getString('CheckMsg'),
          checkValue);
        if (buttonPressed !== 0) {
          return false;
        }
        if (checkValue.value) {
          EnigmailPrefs.getPrefRoot().setBoolPref("mail.warn_on_send_accel_key", false);
        }
      }
    }
    catch (ex) {}

    return true;
  },


  /**
   * set non-standard message Header
   * (depending on TB version)
   *
   * hdr: String: header type (e.g. X-Enigmail-Version)
   * val: String: header data (e.g. 1.2.3.4)
   */
  setAdditionalHeader: function(hdr, val) {
    if ("otherRandomHeaders" in gMsgCompose.compFields) {
      // TB <= 36
      gMsgCompose.compFields.otherRandomHeaders += hdr + ": " + val + "\r\n";
    }
    else {
      gMsgCompose.compFields.setHeader(hdr, val);
    }
  },

  unsetAdditionalHeader: function(hdr) {
    if ("otherRandomHeaders" in gMsgCompose.compFields) {
      // TB <= 36
      let h = gMsgCompose.compFields.otherRandomHeaders;
      let r = new RegExp("^(" + hdr + ":)(.*)$", "im");
      let m = h.replace(r, "").replace(/(\r\n)+/, "\r\n");
      gMsgCompose.compFields.otherRandomHeaders = m;
    }
    else {
      gMsgCompose.compFields.deleteHeader(hdr);
    }
  },

  modifyCompFields: function() {

    try {

      if (!this.identity) {
        this.identity = getCurrentIdentity();
      }

      if (this.isEnigmailEnabled()) {
        if (EnigmailPrefs.getPref("addHeaders")) {
          this.setAdditionalHeader("X-Enigmail-Version", EnigmailApp.getVersion());
        }

        this.setAutocryptHeader();
      }
    }
    catch (ex) {
      EnigmailLog.writeException("enigmailMsgComposeOverlay.js: Enigmail.msg.modifyCompFields", ex);
    }
  },

  getCurrentIncomingServer: function() {
    let currentAccountKey = getCurrentAccountKey();
    let account = MailServices.accounts.getAccount(currentAccountKey);

    return account.incomingServer; /* returns nsIMsgIncomingServer */
  },

  setAutocryptHeader: function() {
    if (!this.isAutocryptEnabled()) return;

    this.identity = getCurrentIdentity();
    let fromMail = this.identity.email;

    try {
      fromMail = EnigmailFuncs.stripEmail(gMsgCompose.compFields.from);
    }
    catch (ex) {}

    let key;
    if (this.identity.getIntAttribute("pgpKeyMode") > 0) {
      key = EnigmailKeyRing.getKeyById(this.identity.getCharAttribute("pgpkeyId"));
    }
    else {
      key = EnigmailKeyRing.getSecretKeyByEmail(this.identity.email);
    }

    if (key) {
      let srv = this.getCurrentIncomingServer();
      let prefMutual = (srv.getIntValue("acPreferEncrypt") > 0 ? "; prefer-encrypt=mutual" : "");

      let k = key.getMinimalPubKey(fromMail);
      if (k.exitCode === 0) {
        let keyData = " " + k.keyData.replace(/(.{72})/g, "$1\r\n ").replace(/\r\n $/, "");
        this.setAdditionalHeader('Autocrypt', 'addr=' + fromMail + prefMutual + '; keydata=\r\n' + keyData);
      }
    }
  },

  /**
   * Handle the 'compose-send-message' event from TB
   */
  sendMessageListener: function(event) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.sendMessageListener\n");

    // Do nothing if a compatible version of the "SendLater" addon is installed.
    // SendLater will call handleSendMessageEvent when needed.

    try {
      if (typeof(Sendlater3Composing.callEnigmail) === "function") {
        return;
      }
    }
    catch (ex) {}

    Enigmail.msg.handleSendMessageEvent(event);
  },

  /**
   * Perform handling of the compose-send-message' event from TB (or SendLater)
   */
  handleSendMessageEvent: function(event) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.handleSendMessageEvent\n");
    let msgcomposeWindow = document.getElementById("msgcomposeWindow");
    let sendMsgType = Number(msgcomposeWindow.getAttribute("msgtype"));

    if (!(this.sendProcess && sendMsgType == Components.interfaces.nsIMsgCompDeliverMode.AutoSaveAsDraft)) {
      this.sendProcess = true;
      //let bc = document.getElementById("enigmail-bc-sendprocess");

      try {
        this.modifyCompFields();
        //bc.setAttribute("disabled", "true");
        if (!this.encryptMsg(sendMsgType)) {
          this.resetUpdatedFields();
          event.preventDefault();
          event.stopPropagation();
        }
      }
      catch (ex) {
        console.debug(ex);
      }
      //bc.removeAttribute("disabled");
    }
    else {
      EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.sendMessageListener: sending in progress - autosave aborted\n");
      event.preventDefault();
      event.stopPropagation();
    }
    this.sendProcess = false;
  },


  // encrypt attachments when sending inline PGP mails
  // It's quite a hack: the attachments are stored locally
  // and the attachments list is modified to pick up the
  // encrypted file(s) instead of the original ones.
  encryptAttachments: function(bucketList, newAttachments, window, uiFlags,
    fromAddr, toAddr, bccAddr, sendFlags,
    errorMsgObj) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptAttachments\n");

    const SIGN = EnigmailConstants.SEND_SIGNED;
    const ENCRYPT = EnigmailConstants.SEND_ENCRYPTED;

    var ioServ;
    var fileTemplate;
    errorMsgObj.value = "";

    try {
      ioServ = Components.classes[IOSERVICE_CONTRACTID].getService(Components.interfaces.nsIIOService);
      if (!ioServ)
        return -1;
    }
    catch (ex) {
      return -1;
    }

    var tmpDir = EnigmailFiles.getTempDir();
    var extAppLauncher = Components.classes["@mozilla.org/mime;1"].getService(Components.interfaces.nsPIExternalAppLauncher);

    try {
      fileTemplate = Components.classes[LOCAL_FILE_CONTRACTID].createInstance(Components.interfaces.nsIFile);
      fileTemplate.initWithPath(tmpDir);
      if (!(fileTemplate.isDirectory() && fileTemplate.isWritable())) {
        errorMsgObj.value = EnigmailLocale.getString("noTempDir");
        return -1;
      }
      fileTemplate.append("encfile");
    }
    catch (ex) {
      errorMsgObj.value = EnigmailLocale.getString("noTempDir");
      return -1;
    }
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptAttachments tmpDir=" + tmpDir + "\n");
    var enigmailSvc = EnigmailCore.getService(window);
    if (!enigmailSvc)
      return null;

    var exitCodeObj = {};
    var statusFlagsObj = {};

    var node = bucketList.firstChild;
    while (node) {
      var origUrl = node.attachment.url;
      if (origUrl.substring(0, 7) != "file://") {
        // this should actually never happen since it is pre-checked!
        errorMsgObj.value = "The attachment '" + node.attachment.name + "' is not a local file";
        return -1;
      }

      // transform attachment URL to platform-specific file name
      var origUri = ioServ.newURI(origUrl, null, null);
      var origFile = origUri.QueryInterface(Components.interfaces.nsIFileURL);
      if (node.attachment.temporary) {
        try {
          var origLocalFile = Components.classes[LOCAL_FILE_CONTRACTID].createInstance(Components.interfaces.nsIFile);
          origLocalFile.initWithPath(origFile.file.path);
          extAppLauncher.deleteTemporaryFileOnExit(origLocalFile);
        }
        catch (ex) {}
      }

      var newFile = fileTemplate.clone();
      var txtMessage;
      try {
        newFile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0x180);
        txtMessage = EnigmailEncryption.encryptAttachment(window, fromAddr, toAddr, bccAddr, sendFlags,
          origFile.file, newFile,
          exitCodeObj, statusFlagsObj,
          errorMsgObj);
      }
      catch (ex) {}

      if (exitCodeObj.value !== 0) {
        return exitCodeObj.value;
      }

      var fileInfo = {
        origFile: origFile,
        origUrl: node.attachment.url,
        origName: node.attachment.name,
        origTemp: node.attachment.temporary,
        origCType: node.attachment.contentType
      };

      // transform platform specific new file name to file:// URL
      var newUri = ioServ.newFileURI(newFile);
      fileInfo.newUrl = newUri.asciiSpec;
      fileInfo.newFile = newFile;
      fileInfo.encrypted = (sendFlags & ENCRYPT);

      newAttachments.push(fileInfo);
      node = node.nextSibling;
    }

    var i = 0;
    if (sendFlags & ENCRYPT) {
      // if we got here, all attachments were encrpted successfully,
      // so we replace their names & urls
      node = bucketList.firstChild;

      while (node) {
        node.attachment.url = newAttachments[i].newUrl;
        node.attachment.name += EnigmailPrefs.getPref("inlineAttachExt");
        node.attachment.contentType = "application/octet-stream";
        node.attachment.temporary = true;

        ++i;
        node = node.nextSibling;
      }
    }
    else {
      // for inline signing we need to add new attachments for every
      // signed file
      for (i = 0; i < newAttachments.length; i++) {
        // create new attachment
        var fileAttachment = Components.classes["@mozilla.org/messengercompose/attachment;1"].createInstance(Components.interfaces.nsIMsgAttachment);
        fileAttachment.temporary = true;
        fileAttachment.url = newAttachments[i].newUrl;
        fileAttachment.name = newAttachments[i].origName + EnigmailPrefs.getPref("inlineSigAttachExt");

        // add attachment to msg
        this.addAttachment(fileAttachment);
      }

    }
    return 0;
  },

  toggleAttribute: function(attrName) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.toggleAttribute('" + attrName + "')\n");

    var menuElement = document.getElementById("enigmail_" + attrName);

    var oldValue = EnigmailPrefs.getPref(attrName);
    EnigmailPrefs.setPref(attrName, !oldValue);
  },

  toggleAccountAttr: function(attrName) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.toggleAccountAttr('" + attrName + "')\n");

    var oldValue = this.identity.getBoolAttribute(attrName);
    this.identity.setBoolAttribute(attrName, !oldValue);

  },

  decryptQuote: function(interactive) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.decryptQuote: " + interactive + "\n");

    if (gWindowLocked || this.processed)
      return;

    var enigmailSvc = EnigmailCore.getService(window);
    if (!enigmailSvc)
      return;

    const dce = Components.interfaces.nsIDocumentEncoder;
    var encoderFlags = dce.OutputFormatted | dce.OutputLFLineBreak;

    var docText = this.editorGetContentAs("text/plain", encoderFlags);

    var blockBegin = docText.indexOf("-----BEGIN PGP ");
    if (blockBegin < 0)
      return;

    // Determine indentation string
    var indentBegin = docText.substr(0, blockBegin).lastIndexOf("\n");
    var indentStr = docText.substring(indentBegin + 1, blockBegin);

    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.decryptQuote: indentStr='" + indentStr + "'\n");

    var beginIndexObj = {};
    var endIndexObj = {};
    var indentStrObj = {};
    var blockType = EnigmailArmor.locateArmoredBlock(docText, 0, indentStr, beginIndexObj, endIndexObj, indentStrObj);
    if ((blockType != "MESSAGE") && (blockType != "SIGNED MESSAGE"))
      return;

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
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.decryptQuote: charset=" + charset + "\n");

    // Encode ciphertext from unicode to charset
    var cipherText = EnigmailData.convertFromUnicode(pgpBlock, charset);

    if ((!this.getMailPref("mailnews.reply_in_default_charset")) && (blockType == "MESSAGE")) {
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

    plainText = EnigmailDecryption.decryptMessage(window, uiFlags, cipherText,
      signatureObj, exitCodeObj, statusFlagsObj,
      keyIdObj, userIdObj, sigDetailsObj,
      errorMsgObj, blockSeparationObj, encToDetailsObj);
    // Decode plaintext from charset to unicode
    plainText = EnigmailData.convertToUnicode(plainText, charset).replace(/\r\n/g, "\n");
    if (EnigmailPrefs.getPref("keepSettingsForReply")) {
      if (statusFlagsObj.value & EnigmailConstants.DECRYPTION_OKAY)
        this.setSendMode('encrypt');
    }

    var exitCode = exitCodeObj.value;

    if (exitCode !== 0) {
      // Error processing
      var errorMsg = errorMsgObj.value;

      var statusLines = errorMsg.split(/\r?\n/);

      var displayMsg;
      if (statusLines && statusLines.length) {
        // Display only first ten lines of error message
        while (statusLines.length > 10)
          statusLines.pop();

        displayMsg = statusLines.join("\n");

        if (interactive)
          EnigmailDialog.info(window, displayMsg);
      }
    }

    if (blockType == "MESSAGE" && exitCode === 0 && plainText.length === 0) {
      plainText = " ";
    }

    if (!plainText) {
      if (blockType != "SIGNED MESSAGE")
        return;

      // Extract text portion of clearsign block
      plainText = EnigmailArmor.extractSignaturePart(pgpBlock, EnigmailConstants.SIGNATURE_TEXT);
    }

    const nsIMsgCompType = Components.interfaces.nsIMsgCompType;
    var doubleDashSeparator = EnigmailPrefs.getPref("doubleDashSeparator");
    if (gMsgCompose.type != nsIMsgCompType.Template &&
      gMsgCompose.type != nsIMsgCompType.Draft &&
      doubleDashSeparator) {
      var signOffset = plainText.search(/[\r\n]-- +[\r\n]/);

      if (signOffset < 0 && blockType == "SIGNED MESSAGE") {
        signOffset = plainText.search(/[\r\n]--[\r\n]/);
      }

      if (signOffset > 0) {
        // Strip signature portion of quoted message
        plainText = plainText.substr(0, signOffset + 1);
      }
    }

    var clipBoard = Components.classes["@mozilla.org/widget/clipboard;1"].getService(Components.interfaces.nsIClipboard);
    var data;
    if (clipBoard.supportsSelectionClipboard()) {
      // get the clipboard contents for selected text (X11)
      data = EnigmailClipboard.getClipboardContent(window, Components.interfaces.nsIClipboard.kSelectionClipboard);
    }

    // Replace encrypted quote with decrypted quote (destroys selection clipboard on X11)
    this.editorSelectAll();

    //EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.decryptQuote: plainText='"+plainText+"'\n");

    if (head)
      this.editorInsertText(head);

    var quoteElement;

    if (indentStr) {
      quoteElement = this.editorInsertAsQuotation(plainText);

    }
    else {
      this.editorInsertText(plainText);
    }

    if (tail)
      this.editorInsertText(tail);

    if (statusFlagsObj.value & EnigmailConstants.DECRYPTION_OKAY) {
      this.checkInlinePgpReply(head, tail);
    }

    if (clipBoard.supportsSelectionClipboard()) {
      // restore the clipboard contents for selected text (X11)
      EnigmailClipboard.setClipboardContent(data, clipBoard.kSelectionClipboard);
    }

    if (interactive)
      return;

    // Position cursor
    var replyOnTop = 1;
    try {
      replyOnTop = this.identity.replyOnTop;
    }
    catch (ex) {}

    if (!indentStr || !quoteElement)
      replyOnTop = 1;

    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.decryptQuote: replyOnTop=" + replyOnTop + ", quoteElement=" + quoteElement + "\n");

    var nsISelectionController = Components.interfaces.nsISelectionController;

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

      this.editor.selectionController.scrollSelectionIntoView(nsISelectionController.SELECTION_NORMAL,
        nsISelectionController.SELECTION_ANCHOR_REGION,
        true);
    }

    this.processFinalState();
    this.updateStatusBar();
  },

  checkInlinePgpReply: function(head, tail) {
    const CT = Components.interfaces.nsIMsgCompType;
    if (!this.identity) return;

    let hLines = (head.search(/[^\s>]/) < 0 ? 0 : 1);

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
            if (h[i].search(/[^\s>]/) >= 0) hLines++;
          }
        }
      }
    }

    if (hLines > 0 && (!this.identity.sigOnReply || this.identity.sigBottom)) {
      // display warning if no signature on top of message
      this.displayPartialEncryptedWarning();
    }
    else if (hLines > 10) {
      this.displayPartialEncryptedWarning();
    }
    else if (tail.search(/[^\s>]/) >= 0 && !(this.identity.sigOnReply && this.identity.sigBottom)) {
      // display warning if no signature below message
      this.displayPartialEncryptedWarning();
    }
  },

  editorInsertText: function(plainText) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.editorInsertText\n");
    if (this.editor) {
      var mailEditor;
      try {
        mailEditor = this.editor.QueryInterface(Components.interfaces.nsIEditorMailSupport);
        mailEditor.insertTextWithQuotations(plainText);
      }
      catch (ex) {
        EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.editorInsertText: no mail editor\n");
        this.editor.insertText(plainText);
      }
    }
  },

  editorInsertAsQuotation: function(plainText) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.editorInsertAsQuotation\n");
    if (this.editor) {
      var mailEditor;
      try {
        mailEditor = this.editor.QueryInterface(Components.interfaces.nsIEditorMailSupport);
      }
      catch (ex) {}

      if (!mailEditor)
        return 0;

      EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.editorInsertAsQuotation: mailEditor=" + mailEditor + "\n");

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
  notifyUser: function(priority, msgText, messageId, detailsText) {
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
      buttonArr.push({
        accessKey: EnigmailLocale.getString("msgCompose.detailsButton.accessKey"),
        label: EnigmailLocale.getString("msgCompose.detailsButton.label"),
        callback: function(aNotificationBar, aButton) {
          EnigmailDialog.info(window, detailsText);
        }
      });
    }
    notif.appendNotification(msgText, messageId, null, prio, buttonArr);
  },

  /**
   * Display a warning message if we are replying to or forwarding
   * a partially decrypted inline-PGP email
   */
  displayPartialEncryptedWarning: function() {
    let msgLong = EnigmailLocale.getString("msgCompose.partiallyEncrypted.inlinePGP");

    this.notifyUser(1, EnigmailLocale.getString("msgCompose.partiallyEncrypted.short"), "notifyPartialDecrypt", msgLong);
  },

  editorSelectAll: function() {
    if (this.editor) {
      this.editor.selectAll();
    }
  },

  editorGetCharset: function() {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.editorGetCharset\n");
    return this.editor.documentCharacterSet;
  },

  editorGetContentAs: function(mimeType, flags) {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.editorGetContentAs\n");
    if (this.editor) {
      return this.editor.outputToString(mimeType, flags);
    }

    return null;
  },

  addrOnChangeTimer: null,

  addressOnChange: function() {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.addressOnChange\n");
    if (!this.addrOnChangeTimer) {
      var self = this;
      this.addrOnChangeTimer = EnigmailTimer.setTimeout(function _f() {
        self.fireSendFlags();
        self.addrOnChangeTimer = null;
      }, Enigmail.msg.addrOnChangeTimeout);
    }
  },

  focusChange: function() {
    // call original TB function
    CommandUpdate_MsgCompose();

    var focusedWindow = top.document.commandDispatcher.focusedWindow;

    // we're just setting focus to where it was before
    if (focusedWindow == Enigmail.msg.lastFocusedWindow) {
      // skip
      return;
    }

    Enigmail.msg.lastFocusedWindow = focusedWindow;

    Enigmail.msg.fireSendFlags();
  },

  fireSendFlags: function() {
    try {
      EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: Enigmail.msg.fireSendFlags\n");
      if (!this.determineSendFlagId) {
        let self = this;
        this.determineSendFlagId = EnigmailTimer.setTimeout(
          function _sendFlagWrapper() {
            try {
              self.determineSendFlags();
              self.fireSearchKeys();
            }
            catch (x) {}
            self.determineSendFlagId = null;
          },
          0);
      }
    }
    catch (ex) {}
  },

  /**
   * Merge multiple  Re: Re: into one Re: in message subject
   */
  fixMessageSubject: function() {
    let subjElem = document.getElementById("msgSubject");
    if (subjElem) {
      let r = subjElem.value.replace(/^(Re: )+/, "Re: ");
      if (r !== subjElem.value) {
        subjElem.value = r;
        if (typeof subjElem.oninput === "function") subjElem.oninput();
      }
    }
  },

  fireSearchKeys: function() {
    if (this.isEnigmailEnabled()) {

      if (this.searchKeysTimeout) return;

      let self = this;

      this.searchKeysTimeout = EnigmailTimer.setTimeout(function _f() {
          self.searchKeysTimeout = null;
          Enigmail.msg.findMissingKeys();
        },
        5000); // 5 Seconds
    }
  },

  /**
   * Determine if all addressees have a valid key ID; if not, attempt to
   * import them via WKD or Autocrypt.
   */
  findMissingKeys: async function() {

    try {
      EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: findMissingKeys()\n");

      let missingKeys = this.determineSendFlags();

      if ("errArray" in missingKeys && missingKeys.errArray.length > 0) {
        let missingEmails = missingKeys.errArray.map(function(i) {
          return i.addr.toLowerCase().trim();
        });

        let lookupList = [];

        // only search for keys not checked before
        for (let k of missingEmails) {
          if (this.keyLookupDone.indexOf(k) < 0) {
            lookupList.push(k);
            this.keyLookupDone.push(k);
          }
        }

        if (lookupList.length > 0) {
          try {
            let foundKeys;

            if (this.isAutocryptEnabled()) {
              foundKeys = await EnigmailAutocrypt.importAutocryptKeys(lookupList, this.encryptForced === EnigmailConstants.ENIG_ALWAYS);
              EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: findMissingKeys: got " + foundKeys.length + " autocrypt keys\n");
              if (foundKeys.length > 0) {
                this.determineSendFlags();
              }
            }

            if (EnigmailPrefs.getPref("autoWkdLookup") === 0) return;
            if (foundKeys.length >= lookupList.length) return;

            foundKeys = await EnigmailWkdLookup.findKeys(lookupList);
            EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: findMissingKeys: wkd got " + foundKeys + "\n");
            if (foundKeys) {
              this.determineSendFlags();
            }
          }
          catch (err) {
            EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: findMissingKeys: error " + err + "\n");
          }
        }
      }
    }
    catch (ex) {}
  }
};


Enigmail.composeStateListener = {
  NotifyComposeFieldsReady: function() {
    // Note: NotifyComposeFieldsReady is only called when a new window is created (i.e. not in case a window object is reused).
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: ECSL.NotifyComposeFieldsReady\n");

    try {
      Enigmail.msg.editor = gMsgCompose.editor.QueryInterface(Components.interfaces.nsIEditor);
    }
    catch (ex) {}

    if (!Enigmail.msg.editor)
      return;

    Enigmail.msg.fixMessageSubject();

    function enigDocStateListener() {}

    enigDocStateListener.prototype = {
      QueryInterface: function(iid) {
        if (!iid.equals(Components.interfaces.nsIDocumentStateListener) &&
          !iid.equals(Components.interfaces.nsISupports))
          throw Components.results.NS_ERROR_NO_INTERFACE;

        return this;
      },

      NotifyDocumentCreated: function() {
        EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: EDSL.NotifyDocumentCreated\n");
      },

      NotifyDocumentWillBeDestroyed: function() {
        EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: EDSL.enigDocStateListener.NotifyDocumentWillBeDestroyed\n");
      },

      NotifyDocumentStateChanged: function(nowDirty) {
        EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: EDSL.enigDocStateListener.NotifyDocumentStateChanged\n");
      }
    };

    var docStateListener = new enigDocStateListener();

    Enigmail.msg.editor.addDocumentStateListener(docStateListener);
  },

  ComposeProcessDone: function(aResult) {
    // Note: called after a mail was sent (or saved)
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: ECSL.ComposeProcessDone: " + aResult + "\n");

    if (aResult != Components.results.NS_OK) {
      if (Enigmail.msg.processed) {
        Enigmail.msg.undoEncryption(4);
      }
      Enigmail.msg.removeAttachedKey();
    }

    // ensure that securityInfo is set back to S/MIME flags (especially required if draft was saved)
    if (gSMFields) Enigmail.msg.setSecurityParams(gSMFields);
  },

  NotifyComposeBodyReady: function() {
    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: ECSL.ComposeBodyReady\n");

    var isEmpty,
      isEditable;

    isEmpty = Enigmail.msg.editor.documentIsEmpty;
    isEditable = Enigmail.msg.editor.isDocumentEditable;
    Enigmail.msg.composeBodyReady = true;

    EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: ECSL.ComposeBodyReady: isEmpty=" + isEmpty + ", isEditable=" + isEditable + "\n");

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

    if (!isEditable || isEmpty)
      return;

    let msgHdr = Enigmail.msg.getMsgHdr();
    if (msgHdr) {
      Enigmail.msg.setOriginalSubject(msgHdr.subject, true);
    }
    Enigmail.msg.fixMessageSubject();

    if (!Enigmail.msg.timeoutId && !Enigmail.msg.dirty) {
      Enigmail.msg.timeoutId = EnigmailTimer.setTimeout(function() {
          Enigmail.msg.decryptQuote(false);
        },
        0);
    }

  },

  SaveInFolderDone: function(folderURI) {
    //EnigmailLog.DEBUG("enigmailMsgComposeOverlay.js: ECSL.SaveInFolderDone\n");
  }
};


/**
 * Unload Enigmail for update or uninstallation
 */
Enigmail.composeUnload = function _unload_Enigmail() {
  window.removeEventListener("unload-enigmail", Enigmail.composeUnload, false);
  window.removeEventListener("load-enigmail", Enigmail.msg.composeStartup, false);
  window.removeEventListener("compose-window-unload", Enigmail.msg.msgComposeClose, true);
  window.removeEventListener('compose-send-message', Enigmail.msg.sendMessageListener, true);

  gMsgCompose.UnregisterStateListener(Enigmail.composeStateListener);

  let msgId = document.getElementById("msgIdentityPopup");
  if (msgId) {
    msgId.removeEventListener("command", Enigmail.msg.setIdentityCallback, false);
  }

  let subj = document.getElementById("msgSubject");
  subj.removeEventListener('focus', Enigmail.msg.fireSendFlags, false);

  // check rules for status bar icons on each change of the recipients
  let rep = new RegExp("; Enigmail.msg.addressOnChange\\(this\\);");
  var adrCol = document.getElementById("addressCol2#1"); // recipients field
  if (adrCol) {
    let attr = adrCol.getAttribute("oninput");
    adrCol.setAttribute("oninput", attr.replace(rep, ""));
    attr = adrCol.getAttribute("onchange");
    adrCol.setAttribute("onchange", attr.replace(rep, ""));
  }
  adrCol = document.getElementById("addressCol1#1"); // to/cc/bcc/... field
  if (adrCol) {
    let attr = adrCol.getAttribute("oncommand");
    adrCol.setAttribute("oncommand", attr.replace(rep, ""));
  }

  // finally unload Enigmail entirely
  Enigmail = undefined;
};

addEventListener("load", Enigmail.msg.composeStartup, { capture: false, once: true });

window.addEventListener("unload-enigmail",
  Enigmail.composeUnload.bind(Enigmail.msg),
  false);

window.addEventListener('compose-window-unload',
  Enigmail.msg.msgComposeClose.bind(Enigmail.msg),
  true);

// Listen to message sending event
//window.addEventListener('compose-send-message',
//  Enigmail.msg.sendMessageListener.bind(Enigmail.msg),
//  true);
