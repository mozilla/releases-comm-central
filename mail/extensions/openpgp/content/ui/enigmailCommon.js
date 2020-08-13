/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/**
 * PLEASE NOTE: this module is legacy and must not be used for newe code - it will be removed!
 */

"use strict";

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

// enigmailCommon.js: shared JS functions for Enigmail

// WARNING: This module functions must not be loaded in overlays to standard functionality!

// Many of these components are not used in this file, but are instead used in other files that are loaded together with EnigmailCommon
var EnigmailCore = ChromeUtils.import(
  "chrome://openpgp/content/modules/core.jsm"
).EnigmailCore;
var EnigmailFuncs = ChromeUtils.import(
  "chrome://openpgp/content/modules/funcs.jsm"
).EnigmailFuncs;
var { EnigmailKey } = ChromeUtils.import(
  "chrome://openpgp/content/modules/key.jsm"
);
var { EnigmailLog } = ChromeUtils.import(
  "chrome://openpgp/content/modules/log.jsm"
);
var EnigmailPrefs = ChromeUtils.import(
  "chrome://openpgp/content/modules/prefs.jsm"
).EnigmailPrefs;
var { EnigmailOS } = ChromeUtils.import(
  "chrome://openpgp/content/modules/os.jsm"
);
var EnigmailLocale = ChromeUtils.import(
  "chrome://openpgp/content/modules/locale.jsm"
).EnigmailLocale;
var EnigmailData = ChromeUtils.import(
  "chrome://openpgp/content/modules/data.jsm"
).EnigmailData;
var EnigmailFiles = ChromeUtils.import(
  "chrome://openpgp/content/modules/files.jsm"
).EnigmailFiles;
var { EnigmailApp } = ChromeUtils.import(
  "chrome://openpgp/content/modules/app.jsm"
);
var EnigmailDialog = ChromeUtils.import(
  "chrome://openpgp/content/modules/dialog.jsm"
).EnigmailDialog;
var EnigmailWindows = ChromeUtils.import(
  "chrome://openpgp/content/modules/windows.jsm"
).EnigmailWindows;
var EnigmailTime = ChromeUtils.import(
  "chrome://openpgp/content/modules/time.jsm"
).EnigmailTime;
var EnigmailTimer = ChromeUtils.import(
  "chrome://openpgp/content/modules/timer.jsm"
).EnigmailTimer;
var EnigmailKeyRing = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyRing.jsm"
).EnigmailKeyRing;
var EnigmailTrust = ChromeUtils.import(
  "chrome://openpgp/content/modules/trust.jsm"
).EnigmailTrust;
var EnigmailConstants = ChromeUtils.import(
  "chrome://openpgp/content/modules/constants.jsm"
).EnigmailConstants;
var EnigmailErrorHandling = ChromeUtils.import(
  "chrome://openpgp/content/modules/errorHandling.jsm"
).EnigmailErrorHandling;
var EnigmailKeyServer = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyserver.jsm"
).EnigmailKeyServer;
var EnigmailEvents = ChromeUtils.import(
  "chrome://openpgp/content/modules/events.jsm"
).EnigmailEvents;
var { EnigmailGpg } = ChromeUtils.import(
  "chrome://openpgp/content/modules/gpg.jsm"
);
var EnigmailStreams = ChromeUtils.import(
  "chrome://openpgp/content/modules/streams.jsm"
).EnigmailStreams;
var EnigmailCryptoAPI = ChromeUtils.import(
  "chrome://openpgp/content/modules/cryptoAPI.jsm"
).EnigmailCryptoAPI;
var { PgpSqliteDb2 } = ChromeUtils.import(
  "chrome://openpgp/content/modules/sqliteDb.jsm"
);

var l10nCommon = new Localization(["messenger/openpgp/openpgp.ftl"], true);

var { RNP } = ChromeUtils.import("chrome://openpgp/content/modules/RNP.jsm");

// The compatible Enigmime version
var gEnigmailSvc;
var gEnigPromptSvc;

// Maximum size of message directly processed by Enigmail
const ENIG_PROCESSINFO_CONTRACTID = "@mozilla.org/xpcom/process-info;1";
const ENIG_ENIGMAIL_CONTRACTID = "@mozdev.org/enigmail/enigmail;1";
const ENIG_STRINGBUNDLE_CONTRACTID = "@mozilla.org/intl/stringbundle;1";
const ENIG_LOCAL_FILE_CONTRACTID = "@mozilla.org/file/local;1";
const ENIG_DIRSERVICE_CONTRACTID = "@mozilla.org/file/directory_service;1";
const ENIG_MIME_CONTRACTID = "@mozilla.org/mime;1";
const ENIG_WMEDIATOR_CONTRACTID =
  "@mozilla.org/rdf/datasource;1?name=window-mediator";
const ENIG_ASS_CONTRACTID = "@mozilla.org/appshell/appShellService;1";
const ENIG_LOCALE_SVC_CONTRACTID = "@mozilla.org/intl/nslocaleservice;1";
const ENIG_DATE_FORMAT_CONTRACTID = "@mozilla.org/intl/scriptabledateformat;1";
const ENIG_THREAD_MANAGER_CID = "@mozilla.org/thread-manager;1";
const ENIG_SIMPLEURI_CONTRACTID = "@mozilla.org/network/simple-uri;1";

const ENIG_STANDARD_URL_CONTRACTID = "@mozilla.org/network/standard-url;1";
const ENIG_SCRIPTABLEINPUTSTREAM_CONTRACTID =
  "@mozilla.org/scriptableinputstream;1";
const ENIG_BINARYINPUTSTREAM_CONTRACTID = "@mozilla.org/binaryinputstream;1";
const ENIG_SAVEASCHARSET_CONTRACTID = "@mozilla.org/intl/saveascharset;1";

const ENIG_STREAMCONVERTERSERVICE_CID_STR =
  "{892FFEB0-3F80-11d3-A16C-0050041CAF44}";

const ENIG_ISCRIPTABLEUNICODECONVERTER_CONTRACTID =
  "@mozilla.org/intl/scriptableunicodeconverter";

const ENIG_IOSERVICE_CONTRACTID = "@mozilla.org/network/io-service;1";

// field ID's of key list (as described in the doc/DETAILS file in the GnuPG distribution)
const ENIG_KEY_TRUST = 1;
const ENIG_KEY_ID = 4;
const ENIG_CREATED = 5;
const ENIG_EXPIRY = 6;
const ENIG_UID_ID = 7;
const ENIG_OWNERTRUST = 8;
const ENIG_USER_ID = 9;
const ENIG_SIG_TYPE = 10;
const ENIG_KEY_USE_FOR = 11;

const ENIG_KEY_EXPIRED = "e";
const ENIG_KEY_REVOKED = "r";
const ENIG_KEY_INVALID = "i";
const ENIG_KEY_DISABLED = "d";
const ENIG_KEY_NOT_VALID =
  ENIG_KEY_EXPIRED + ENIG_KEY_REVOKED + ENIG_KEY_INVALID + ENIG_KEY_DISABLED;

// GUI List: The corresponding image to set the "active" flag / checkbox
const ENIG_IMG_NOT_SELECTED = "chrome://openpgp/content/ui/check0.png";
const ENIG_IMG_SELECTED = "chrome://openpgp/content/ui/check1.png";
const ENIG_IMG_DISABLED = "chrome://openpgp/content/ui/check2.png";

// UsePGPMimeOption values
const PGP_MIME_NEVER = 0;
const PGP_MIME_POSSIBLE = 1;
const PGP_MIME_ALWAYS = 2;

const ENIG_PGP_DESKTOP_ATT = -2082;

var gUsePGPMimeOptionList = [
  "usePGPMimeNever",
  "usePGPMimePossible",
  "usePGPMimeAlways",
];

// sending options:
var gEnigEncryptionModel = [
  "encryptionModelConvenient",
  "encryptionModelManually",
];
var gEnigAcceptedKeys = ["acceptedKeysValid", "acceptedKeysAll"];
var gEnigAutoSendEncrypted = [
  "autoSendEncryptedNever",
  "autoSendEncryptedIfKeys",
];
var gEnigConfirmBeforeSending = [
  "confirmBeforeSendingNever",
  "confirmBeforeSendingAlways",
  "confirmBeforeSendingIfEncrypted",
  "confirmBeforeSendingIfNotEncrypted",
  "confirmBeforeSendingIfRules",
];

const ENIG_BUTTON_POS_0 = 1;
const ENIG_BUTTON_POS_1 = 1 << 8;
const ENIG_BUTTON_POS_2 = 1 << 16;
const ENIG_BUTTON_TITLE_IS_STRING = 127;

const ENIG_HEADERMODE_KEYID = 0x01;
const ENIG_HEADERMODE_URL = 0x10;

function EnigGetFrame(win, frameName) {
  return EnigmailWindows.getFrame(win, frameName);
}

function GetEnigmailSvc() {
  if (!gEnigmailSvc) {
    gEnigmailSvc = EnigmailCore.getService(window);
  }
  return gEnigmailSvc;
}

// maxBytes == -1 => read everything
function EnigReadURLContents(url, maxBytes) {
  EnigmailLog.DEBUG(
    "enigmailCommon.js: EnigReadURLContents: url=" +
      url +
      ", " +
      maxBytes +
      "\n"
  );

  var ioServ = enigGetService(ENIG_IOSERVICE_CONTRACTID, "nsIIOService");
  if (!ioServ) {
    throw Components.Exception("", Cr.NS_ERROR_FAILURE);
  }

  var fileChannel = EnigmailStreams.createChannel(url);

  var rawInStream = fileChannel.open();

  var inStream = Cc[ENIG_BINARYINPUTSTREAM_CONTRACTID].createInstance(
    Ci.nsIBinaryInputStream
  );
  inStream.setInputStream(rawInStream);

  var available = inStream.available();
  if (maxBytes < 0 || maxBytes > available) {
    maxBytes = available;
  }

  var data = inStream.readBytes(maxBytes);

  inStream.close();

  return data;
}

// maxBytes == -1 => read whole file
function EnigReadFileContents(localFile, maxBytes) {
  EnigmailLog.DEBUG(
    "enigmailCommon.js: EnigReadFileContents: file=" +
      localFile.leafName +
      ", " +
      maxBytes +
      "\n"
  );

  if (!localFile.exists() || !localFile.isReadable()) {
    throw Components.Exception("", Cr.NS_ERROR_FAILURE);
  }

  var ioServ = enigGetService(ENIG_IOSERVICE_CONTRACTID, "nsIIOService");
  if (!ioServ) {
    throw Components.Exception("", Cr.NS_ERROR_FAILURE);
  }

  var fileURI = ioServ.newFileURI(localFile);
  return EnigReadURLContents(fileURI.asciiSpec, maxBytes);
}

///////////////////////////////////////////////////////////////////////////////

// write exception information
function EnigWriteException(referenceInfo, ex) {
  EnigmailLog.writeException(referenceInfo, ex);
}

///////////////////////////////////////////////////////////////////////////////

function EnigAlert(mesg) {
  return EnigmailDialog.alert(window, mesg);
}

/**
 * Displays an alert dialog with 3-4 optional buttons.
 * checkBoxLabel: if not null, display checkbox with text; the checkbox state is returned in checkedObj
 * button-Labels: use "&" to indicate access key
 *     use "buttonType:label" or ":buttonType" to indicate special button types
 *        (buttonType is one of cancel, help, extra1, extra2)
 * return: 0-2: button Number pressed
 *          -1: ESC or close window button pressed
 *
 */
function EnigLongAlert(
  mesg,
  checkBoxLabel,
  okLabel,
  labelButton2,
  labelButton3,
  checkedObj
) {
  return EnigmailDialog.longAlert(
    window,
    mesg,
    checkBoxLabel,
    okLabel,
    labelButton2,
    labelButton3,
    checkedObj
  );
}

function EnigAlertPref(mesg, prefText) {
  return EnigmailDialog.alertPref(window, mesg, prefText);
}

// Confirmation dialog with OK / Cancel buttons (both customizable)
function EnigConfirm(mesg, okLabel, cancelLabel) {
  return EnigmailDialog.confirmDlg(window, mesg, okLabel, cancelLabel);
}

async function EnigError(mesg) {
  return gEnigPromptSvc.alert(
    window,
    l10nCommon.formatValueSync("enig-error"),
    mesg
  );
}

function EnigHelpWindow(source) {
  EnigmailWindows.openHelpWindow(source);
}

function EnigDisplayRadioPref(prefName, prefValue, optionElementIds) {
  EnigmailLog.DEBUG(
    "enigmailCommon.js: EnigDisplayRadioPref: " +
      prefName +
      ", " +
      prefValue +
      "\n"
  );

  if (prefValue >= optionElementIds.length) {
    return;
  }

  var groupElement = document.getElementById("enigmail_" + prefName);
  var optionElement = document.getElementById(optionElementIds[prefValue]);

  if (groupElement && optionElement) {
    groupElement.selectedItem = optionElement;
    groupElement.value = prefValue;
  }
}

function EnigSetRadioPref(prefName, optionElementIds) {
  EnigmailLog.DEBUG("enigmailCommon.js: EnigSetRadioPref: " + prefName + "\n");

  try {
    var groupElement = document.getElementById("enigmail_" + prefName);
    if (groupElement) {
      var optionElement = groupElement.selectedItem;
      var prefValue = optionElement.value;
      if (prefValue < optionElementIds.length) {
        EnigSetPref(prefName, prefValue);
        groupElement.value = prefValue;
      }
    }
  } catch (ex) {}
}

function EnigSavePrefs() {
  return EnigmailPrefs.savePrefs();
}

function EnigGetPref(prefName) {
  return EnigmailPrefs.getPref(prefName);
}

function EnigGetDefaultPref(prefName) {
  EnigmailLog.DEBUG(
    "enigmailCommon.js: EnigGetDefaultPref: prefName=" + prefName + "\n"
  );
  var prefValue = null;
  try {
    EnigmailPrefs.getPrefBranch().lockPref(prefName);
    prefValue = EnigGetPref(prefName);
    EnigmailPrefs.getPrefBranch().unlockPref(prefName);
  } catch (ex) {}

  return prefValue;
}

function EnigSetPref(prefName, value) {
  return EnigmailPrefs.setPref(prefName, value);
}

function EnigConvertFromUnicode(text, charset) {
  EnigmailLog.DEBUG(
    "enigmailCommon.js: EnigConvertFromUnicode: " + charset + "\n"
  );

  if (!text) {
    return "";
  }

  if (!charset) {
    charset = "utf-8";
  }

  // Encode plaintext
  try {
    var unicodeConv = Cc[
      ENIG_ISCRIPTABLEUNICODECONVERTER_CONTRACTID
    ].getService(Ci.nsIScriptableUnicodeConverter);

    unicodeConv.charset = charset;
    return unicodeConv.ConvertFromUnicode(text);
  } catch (ex) {
    EnigmailLog.DEBUG(
      "enigmailCommon.js: EnigConvertFromUnicode: caught an exception\n"
    );

    return text;
  }
}

function EnigConvertToUnicode(text, charset) {
  // EnigmailLog.DEBUG("enigmailCommon.js: EnigConvertToUnicode: "+charset+"\n");

  if (!text || !charset /*|| (charset.toLowerCase() == "iso-8859-1")*/) {
    return text;
  }

  // Encode plaintext
  try {
    var unicodeConv = Cc[
      ENIG_ISCRIPTABLEUNICODECONVERTER_CONTRACTID
    ].getService(Ci.nsIScriptableUnicodeConverter);

    unicodeConv.charset = charset;
    return unicodeConv.ConvertToUnicode(text);
  } catch (ex) {
    EnigmailLog.DEBUG(
      "enigmailCommon.js: EnigConvertToUnicode: caught an exception while converting'" +
        text +
        "' to " +
        charset +
        "\n"
    );
    return text;
  }
}

function EnigConvertGpgToUnicode(text) {
  return EnigmailData.convertGpgToUnicode(text);
}

function EnigFormatFpr(fingerprint) {
  return EnigmailKey.formatFpr(fingerprint);
}

/////////////////////////
// Console stuff
/////////////////////////

// return the options passed to a window
function EnigGetWindowOptions() {
  var winOptions = [];
  if (window.location.search) {
    var optList = window.location.search.substr(1).split(/&/);
    for (var i = 0; i < optList.length; i++) {
      var anOption = optList[i].split(/=/);
      winOptions[anOption[0]] = unescape(anOption[1]);
    }
  }
  return winOptions;
}

function EnigRulesEditor() {
  EnigmailWindows.openRulesEditor();
}

function EngmailCardDetails() {
  EnigmailWindows.openCardDetails();
}

// retrieves a localized string from the enigmail.properties stringbundle
function EnigGetString(aStr) {
  var argList = [];
  // unfortunately arguments.shift() doesn't work, so we use a workaround

  if (arguments.length > 1) {
    for (var i = 1; i < arguments.length; i++) {
      argList.push(arguments[i]);
    }
  }
  return EnigmailLocale.getString(aStr, arguments.length > 1 ? argList : null);
}

//get path for temporary directory (e.g. /tmp, C:\TEMP)
function EnigGetTempDir() {
  return EnigmailFiles.getTempDir();
}

// get the OS platform
function EnigGetOS() {
  return EnigmailOS.getOS();
}

function EnigGetVersion() {
  return EnigmailApp.getVersion();
}

function EnigFilePicker(
  title,
  displayDir,
  save,
  defaultExtension,
  defaultName,
  filterPairs
) {
  return EnigmailDialog.filePicker(
    window,
    title,
    displayDir,
    save,
    defaultExtension,
    defaultName,
    filterPairs
  );
}

// get keys from keyserver
function EnigDownloadKeys(inputObj, resultObj) {
  return EnigmailWindows.downloadKeys(window, inputObj, resultObj);
}

function EnigGetTrustCode(keyObj) {
  return EnigmailTrust.getTrustCode(keyObj);
}

function EnigEditKeyTrust(userIdArr, keyIdArr) {
  return EnigmailWindows.editKeyTrust(window, userIdArr, keyIdArr);
}

function EnigEditKeyExpiry(userIdArr, keyIdArr) {
  return EnigmailWindows.editKeyExpiry(window, userIdArr, keyIdArr);
}

function EnigDisplayKeyDetails(keyId, refresh) {
  return EnigmailWindows.openKeyDetails(window, keyId, refresh);
}

function EnigSignKey(userId, keyId) {
  return EnigmailWindows.signKey(window, userId, keyId);
}

function EnigChangeKeyPwd(keyId, userId) {
  throw new Error("Not implemented");
}

function EnigRevokeKey(keyObj, callbackFunc) {
  var enigmailSvc = GetEnigmailSvc();
  if (!enigmailSvc) {
    return;
  }

  if (keyObj.keyTrust == "r") {
    Services.prompt.alert(
      null,
      document.title,
      l10nCommon.formatValueSync("already-revoked")
    );
    return;
  }

  let promptFlags =
    Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_IS_STRING +
    Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_CANCEL;

  let confirm = Services.prompt.confirmEx(
    window,
    l10nCommon.formatValueSync("openpgp-key-revoke-title"),
    l10nCommon.formatValueSync("revoke-key-question", {
      identity: `0x${keyObj.keyId} - ${keyObj.userId}`,
    }),
    promptFlags,
    l10nCommon.formatValueSync("key-man-button-revoke-key"),
    null,
    null,
    null,
    {}
  );

  if (confirm != 0) {
    return;
  }

  RNP.revokeKey(keyObj.fpr);
  callbackFunc(true);

  Services.prompt.alert(
    null,
    l10nCommon.formatValueSync("openpgp-key-revoke-success"),
    l10nCommon.formatValueSync("after-revoke-info")
  );
}

function EnigGetLocalFileApi() {
  return Ci.nsIFile;
}

function EnigShowPhoto(keyId, userId, photoNumber) {
  EnigmailWindows.showPhoto(window, keyId, userId, photoNumber);
}

function EnigGetFilePath(nsFileObj) {
  return EnigmailFiles.getFilePath(nsFileObj);
}

function EnigCreateRevokeCert(keyId, userId, callbackFunc) {
  throw new Error("Not implemented");

  /*
  var defaultFileName = userId.replace(/[<>]/g, "");
  defaultFileName += " (0x" + keyId + ") rev.asc";
  var outFile = EnigFilePicker(EnigGetString("saveRevokeCertAs"),
    "", true, "*.asc",
    defaultFileName, [EnigGetString("asciiArmorFile"), "*.asc"]);
  if (!outFile) return -1;

  var enigmailSvc = GetEnigmailSvc();
  if (!enigmailSvc)
    return -1;

  return 0;
  */
}

// return the label of trust for a given trust code
function EnigGetTrustLabel(trustCode) {
  return EnigmailTrust.getTrustLabel(trustCode);
}

function EnigGetDateTime(dateNum, withDate, withTime) {
  return EnigmailTime.getDateTime(dateNum, withDate, withTime);
}

function enigCreateInstance(aURL, aInterface) {
  return Cc[aURL].createInstance(Ci[aInterface]);
}

function enigGetService(aURL, aInterface) {
  // determine how 'aInterface' is passed and handle accordingly
  switch (typeof aInterface) {
    case "object":
      return Cc[aURL].getService(aInterface);
    case "string":
      return Cc[aURL].getService(Ci[aInterface]);
    default:
      return Cc[aURL].getService();
  }
}

function EnigCollapseAdvanced(obj, attribute, dummy) {
  return EnigmailFuncs.collapseAdvanced(obj, attribute, dummy);
}

/**
 * EnigOpenUrlExternally
 *
 * forces a uri to be loaded in an external browser
 *
 * @uri nsIUri object
 */
function EnigOpenUrlExternally(uri) {
  let eps = Cc["@mozilla.org/uriloader/external-protocol-service;1"].getService(
    Ci.nsIExternalProtocolService
  );

  eps.loadURI(uri, null);
}

function EnigOpenURL(event, hrefObj) {
  try {
    var ioservice = Services.io;
    var iUri = ioservice.newURI(hrefObj.href);

    EnigOpenUrlExternally(iUri);
    event.preventDefault();
    event.stopPropagation();
  } catch (ex) {}
}

function EnigGetHttpUri(aEvent) {
  function hRefForClickEvent(aEvent, aDontCheckInputElement) {
    var href;
    var isKeyCommand = aEvent.type == "command";
    var target = isKeyCommand
      ? document.commandDispatcher.focusedElement
      : aEvent.target;

    if (
      target instanceof HTMLAnchorElement ||
      target instanceof HTMLAreaElement ||
      target instanceof HTMLLinkElement
    ) {
      if (target.hasAttribute("href")) {
        href = target.href;
      }
    } else if (!aDontCheckInputElement && target instanceof HTMLInputElement) {
      if (target.form && target.form.action) {
        href = target.form.action;
      }
    } else {
      // we may be nested inside of a link node
      var linkNode = aEvent.originalTarget;
      while (linkNode && !(linkNode instanceof HTMLAnchorElement)) {
        linkNode = linkNode.parentNode;
      }

      if (linkNode) {
        href = linkNode.href;
      }
    }

    return href;
  }

  // getHttpUri main function

  let href = hRefForClickEvent(aEvent);
  if (!href) {
    return null;
  }

  EnigmailLog.DEBUG(
    "enigmailAbout.js: interpretHtmlClick: href='" + href + "'\n"
  );

  var ioServ = Services.io;
  var uri = ioServ.newURI(href);

  if (
    Cc["@mozilla.org/uriloader/external-protocol-service;1"]
      .getService(Ci.nsIExternalProtocolService)
      .isExposedProtocol(uri.scheme) &&
    (uri.schemeIs("http") || uri.schemeIs("https"))
  ) {
    return uri;
  }

  return null;
}

/**
 * GUI List: Set the "active" flag and the corresponding image
 */
function EnigSetActive(element, status) {
  if (status >= 0) {
    element.setAttribute("active", status.toString());
  }

  switch (status) {
    case 0:
      element.setAttribute("src", ENIG_IMG_NOT_SELECTED);
      break;
    case 1:
      element.setAttribute("src", ENIG_IMG_SELECTED);
      break;
    case 2:
      element.setAttribute("src", ENIG_IMG_DISABLED);
      break;
    default:
      element.setAttribute("active", -1);
  }
}

/**
 * Receive a GUI List and remove all entries
 *
 * @param  XML-DOM  (it will be changed!)
 */
function EnigCleanGuiList(guiList) {
  while (guiList.firstChild) {
    guiList.firstChild.remove();
  }
}

/**
 * create a new treecell element
 *
 * @param String label of the cell
 *
 * @return treecell node
 */
function createCell(label) {
  var cell = document.createXULElement("treecell");
  cell.setAttribute("label", label);
  return cell;
}

/**
 * Process the output of GPG and return the key details
 *
 * @param   String  Values separated by colons and linebreaks
 *
 * @return  Object with the following keys:
 *    gUserId: Main user ID
 *    calcTrust,
 *    ownerTrust,
 *    fingerprint,
 *    showPhoto,
 *    uidList: List of Pseudonyms and E-Mail-Addresses,
 *    subkeyList: List of Subkeys
 */
function EnigGetKeyDetails(sigListStr) {
  var gUserId;
  var calcTrust;
  var ownerTrust;
  var fingerprint;
  var creationDate;
  var expiryDate;
  var uidList = [];
  var subkeyList = [];
  var showPhoto = false;

  var sigList = sigListStr.split(/[\n\r]+/);
  for (var i = 0; i < sigList.length; i++) {
    var aLine = sigList[i].split(/:/);
    switch (aLine[0]) {
      case "pub":
        gUserId = EnigConvertGpgToUnicode(aLine[9]);
        calcTrust = aLine[1];
        if (aLine[11].includes("D")) {
          calcTrust = "d";
        }
        ownerTrust = aLine[8];
        creationDate = EnigmailTime.getDateTime(aLine[5], true, false);
        expiryDate = EnigmailTime.getDateTime(aLine[6], true, false);
        subkeyList.push(aLine);
        if (!gUserId) {
          gUserId = EnigConvertGpgToUnicode(aLine[9]);
        } else if (uidList !== false) {
          uidList.push(aLine);
        }
        break;
      case "uid":
        if (!gUserId) {
          gUserId = EnigConvertGpgToUnicode(aLine[9]);
        } else if (uidList !== false) {
          uidList.push(aLine);
        }
        break;
      case "uat":
        // User Attributes with "1 " in field 9 determine JPEG pictures
        if (aLine[9].search("1 ") === 0) {
          showPhoto = true;
        }
        break;
      case "sub":
        subkeyList.push(aLine);
        break;
      case "fpr":
        if (!fingerprint) {
          fingerprint = aLine[9];
        }
        break;
    }
  }

  var keyDetails = {
    gUserId,
    calcTrust,
    ownerTrust,
    fingerprint,
    showPhoto,
    uidList,
    creationDate,
    expiryDate,
    subkeyList,
  };
  return keyDetails;
}
