/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// Uses: chrome://openpgp/content/ui/enigmailCommon.js

"use strict";

var Cu = Components.utils;
var Cc = Components.classes;
var Ci = Components.interfaces;

// modules
/* global EnigmailData: false, EnigmailLog: false, EnigmailLocale: false, EnigmailGpg: false, EnigmailKeyEditor: false */
/* global EnigmailOS: false, EnigmailPrefs: false, EnigmailGpgAgent: false, EnigmailApp: false, EnigmailKeyRing: false */
/* global EnigmailDialog: false, EnigmailFuncs: false */

// from enigmailCommon.js:
/* global EnigGetWindowOptions: false, EnigConfirm: false, EnigGetString: false, GetEnigmailSvc: false */
/* global EnigLongAlert: false, EnigAlert: false, EnigInitCommon: false, ENIG_ACCOUNT_MANAGER_CONTRACTID: false */
/* global EnigGetPref: false, EnigSetPref: false, EnigSavePrefs: false, EnigFilePicker: false, EnigGetFilePath: false */
/* global EnigmailWindows: false, EnigCreateRevokeCert: false */

// Initialize enigmailCommon
EnigInitCommon("enigmailKeygen");

var gAccountManager = Components.classes[ENIG_ACCOUNT_MANAGER_CONTRACTID].getService(Components.interfaces.nsIMsgAccountManager);

var gUserIdentityList;
var gUserIdentityListPopup;
var gUseForSigning;

var gKeygenRequest;
var gAllData = "";
var gGeneratedKey = null;
var gUsedId;

const KEYGEN_CANCELLED = "cancelled";

function enigmailKeygenLoad() {
  EnigmailLog.DEBUG("enigmailKeygen.js: Load\n");

  gUserIdentityList = document.getElementById("userIdentity");
  gUserIdentityListPopup = document.getElementById("userIdentityPopup");
  gUseForSigning = document.getElementById("useForSigning");

  var noPassphrase = document.getElementById("noPassphrase");

  /*
  if (!EnigmailGpg.getGpgFeature("keygen-passphrase")) {
    document.getElementById("passphraseRow").setAttribute("collapsed", "true");
    noPassphrase.setAttribute("collapsed", "true");
  }
  */

  //if (EnigmailGpg.getGpgFeature("supports-ecc-keys"))
  let eccElem = document.getElementById("keyType_ecc");
  eccElem.removeAttribute("hidden");
  updateKeySizeSel(eccElem);
  document.getElementById("keyType").selectedItem = eccElem;

  if (gUserIdentityListPopup) {
    fillIdentityListPopup();
  }
  gUserIdentityList.focus();

  // restore safe setting, which you ALWAYS explicitly have to overrule,
  // if you don't want them:
  // - specify passphrase
  // - specify expiry date
  noPassphrase.checked = false;
  EnigSetPref("noPassphrase", noPassphrase.checked);
  var noExpiry = document.getElementById("noExpiry");
  noExpiry.checked = false;

  enigmailKeygenUpdate(true, false);

  var enigmailSvc = GetEnigmailSvc();
  if (!enigmailSvc) {
    EnigAlert(EnigGetString("accessError"));
  }

  if (EnigmailGpgAgent.agentType != "gpg") {
    EnigAlert(EnigGetString("onlyGPG"));
    return;
  }
}

function updateKeySizeSel(selectedObj) {
  if (selectedObj.id === "keyType_ecc") {
    document.getElementById("keySize").setAttribute("disabled", "true");
  } else {
    document.getElementById("keySize").removeAttribute("disabled");
  }
}

function enigmailOnClose() {
  var closeWin = true;
  if (gKeygenRequest) {
    closeWin = EnigConfirm(EnigGetString("keyAbort"), EnigGetString("keyMan.button.generateKeyAbort"), EnigGetString("keyMan.button.generateKeyContinue"));
  }
  if (closeWin) abortKeyGeneration();
  return closeWin;
}

function enigmailKeygenUnload() {
  EnigmailLog.DEBUG("enigmailKeygen.js: Unload\n");

  enigmailKeygenCloseRequest();
}


function enigmailKeygenUpdate(getPrefs, setPrefs) {
  EnigmailLog.DEBUG("enigmailKeygen.js: Update: " + getPrefs + ", " + setPrefs + "\n");

  var noPassphrase = document.getElementById("noPassphrase");
  var noPassphraseChecked = getPrefs ? EnigGetPref("noPassphrase") : noPassphrase.checked;

  if (setPrefs) {
    EnigSetPref("noPassphrase", noPassphraseChecked);
  }

  noPassphrase.checked = noPassphraseChecked;

  var passphrase1 = document.getElementById("passphrase");
  var passphrase2 = document.getElementById("passphraseRepeat");
  passphrase1.disabled = noPassphraseChecked;
  passphrase2.disabled = noPassphraseChecked;
}

function enigmailKeygenTerminate(exitCode) {
  EnigmailLog.DEBUG("enigmailKeygen.js: Terminate:\n");

  var curId = gUsedId;

  gKeygenRequest = null;

  if ((!gGeneratedKey) || gGeneratedKey == KEYGEN_CANCELLED) {
    if (!gGeneratedKey)
      EnigAlert(EnigGetString("keyGenFailed"));
    return;
  }

  var progMeter = document.getElementById("keygenProgress");
  progMeter.setAttribute("value", 100);

  if (gGeneratedKey) {
    if (gUseForSigning.checked) {
      curId.setBoolAttribute("enablePgp", true);
      curId.setIntAttribute("pgpKeyMode", 1);
      curId.setCharAttribute("pgpkeyId", "0x" + gGeneratedKey);

      enigmailKeygenUpdate(false, true);

      EnigSavePrefs();

      EnigmailWindows.keyManReloadKeys();

      if (EnigConfirm(EnigGetString("keygenComplete", curId.email) + "\n\n" + EnigGetString("revokeCertRecommended"), EnigGetString("keyMan.button.generateCert"))) {
        EnigCreateRevokeCert(gGeneratedKey, curId.email, closeAndReset);
      } else {
        closeAndReset();
      }
    } else {
      if (EnigConfirm(EnigGetString("genCompleteNoSign") + "\n\n" + EnigGetString("revokeCertRecommended"), EnigGetString("keyMan.button.generateCert"))) {
        EnigCreateRevokeCert(gGeneratedKey, curId.email, closeAndReset);
        genAndSaveRevCert(gGeneratedKey, curId.email).then(
          function _resolve() {
            closeAndReset();
          },
          function _reject() {
            // do nothing
          }
        );
      } else {
        closeAndReset();
      }
    }
  } else {
    EnigAlert(EnigGetString("keyGenFailed"));
    window.close();
  }
}

/**
 * generate and save a revokation certificate.
 *
 * return: Promise object
 */

function genAndSaveRevCert(keyId, uid) {
  EnigmailLog.DEBUG("enigmailKeygen.js: genAndSaveRevCert\n");

  return new Promise(
    function(resolve, reject) {

      let keyFile = EnigmailApp.getProfileDirectory();
      keyFile.append("0x" + keyId + "_rev.asc");

      // create a revokation cert in the TB profile directoy
      EnigmailKeyEditor.genRevokeCert(window, "0x" + keyId, keyFile, "1", "",
        function _revokeCertCb(exitCode, errorMsg) {
          if (exitCode !== 0) {
            EnigAlert(EnigGetString("revokeCertFailed") + "\n\n" + errorMsg);
            reject(1);
          }
          saveRevCert(keyFile, keyId, uid, resolve, reject);
        });
    }
  );
}

/**
 *  create a copy of the revokation cert at a user defined location
 */
function saveRevCert(inputKeyFile, keyId, uid, resolve, reject) {

  let defaultFileName = uid.replace(/[\\/<>]/g, "");
  defaultFileName += " (0x" + keyId + ") rev.asc";

  let outFile = EnigFilePicker(EnigGetString("saveRevokeCertAs"),
    "", true, "*.asc",
    defaultFileName, [EnigGetString("asciiArmorFile"), "*.asc"]);

  if (outFile) {
    try {
      inputKeyFile.copyToFollowingLinks(outFile.parent, outFile.leafName);
      EnigmailDialog.info(window, EnigGetString("revokeCertOK"));
    } catch (ex) {
      EnigAlert(EnigGetString("revokeCertFailed"));
      reject(2);
    }
  }
  resolve();
}

function closeAndReset() {
  EnigmailKeyRing.clearCache();
  window.close();
}

// Cleanup
function enigmailKeygenCloseRequest() {
  EnigmailLog.DEBUG("enigmailKeygen.js: CloseRequest\n");

  if (gKeygenRequest) {
    var p = gKeygenRequest;
    gKeygenRequest = null;
    p.kill(false);
  }
}

function enigmailCheckPassphrase() {
  var passphraseElement = document.getElementById("passphrase");
  var passphrase2Element = document.getElementById("passphraseRepeat");

  var passphrase = passphraseElement.value;

  if (passphrase != passphrase2Element.value) {
    EnigAlert(EnigGetString("passNoMatch"));
    return null;
  }

  if (passphrase.search(/[^\x20-\x7E]/) >= 0) {
    if (!EnigmailDialog.confirmDlg(window, EnigmailLocale.getString("keygen.passCharProblem"),
        EnigmailLocale.getString("dlg.button.ignore"), EnigmailLocale.getString("dlg.button.cancel"))) {
      return null;
    }
  }
  if ((passphrase.search(/^\s/) === 0) || (passphrase.search(/\s$/) >= 0)) {
    EnigAlert(EnigGetString("passSpaceProblem"));
    return null;
  }

  return passphrase;
}



function enigmailKeygenStart() {
  EnigmailLog.DEBUG("enigmailKeygen.js: Start\n");

  if (gKeygenRequest) {
    let req = gKeygenRequest.QueryInterface(Components.interfaces.nsIRequest);
    if (req.isPending()) {
      EnigmailDialog.info(window, EnigGetString("genGoing"));
      return;
    }
  }

  gGeneratedKey = null;
  gAllData = "";

  var enigmailSvc = GetEnigmailSvc();
  if (!enigmailSvc) {
    EnigAlert(EnigGetString("accessError"));
    return;
  }

  var passphrase = "";
  // gpg >= 2.1 queries passphrase using gpg-agent only
  //if (EnigmailGpg.getGpgFeature("keygen-passphrase"))

  var noPassphraseElement = document.getElementById("noPassphrase");
  var passphraseElement = document.getElementById("passphrase");

  if (!noPassphraseElement.checked) {
    if (passphraseElement.value.trim() === "") {
      EnigmailDialog.info(window, EnigGetString("passCheckBox"));
      return;
    }

    passphrase = enigmailCheckPassphrase();
    if (passphrase === null) return;
  }

  var noExpiry = document.getElementById("noExpiry");
  var expireInput = document.getElementById("expireInput");
  var timeScale = document.getElementById("timeScale");

  var expiryTime = 0;
  if (!noExpiry.checked) {
    expiryTime = Number(expireInput.value) * Number(timeScale.value);
    if (expiryTime > 36500) {
      EnigmailDialog.info(window, EnigGetString("expiryTooLong"));
      return;
    }
    if (expiryTime <= 0) {
      EnigmailDialog.info(window, EnigGetString("expiryTooShort"));
      return;
    }
  }
  var keySize = Number(document.getElementById("keySize").value);
  var keyType = document.getElementById("keyType").value;

  var curId = getCurrentIdentity();
  gUsedId = curId;

  var userName = curId.fullName;
  var userEmail = curId.email;

  if (!userName) {
    EnigmailDialog.info(window, EnigGetString("keygen.missingUserName"));
    return;
  }

  var idString = userName;

  idString += " <" + userEmail + ">";

  var confirmMsg = EnigGetString("keyConfirm", idString);

  if (!EnigConfirm(confirmMsg, EnigGetString("keyMan.button.generateKey"))) {
    return;
  }

  try {
    const cApi = EnigmailCryptoAPI();
    let newId = cApi.sync(cApi.genKey(idString, keyType, keySize, expiryTime, passphrase));
    console.log("created new key with id: " + newId);
  } catch(ex) {
    console.log(ex);
  } 

  EnigmailWindows.keyManReloadKeys();
  closeAndReset();

  /*
  var proc = null;

  var listener = {
    onStartRequest: function() {},
    onStopRequest: function(status) {
      enigmailKeygenTerminate(status);
    },
    onDataAvailable: function(data) {
      EnigmailLog.DEBUG("enigmailKeygen.js: onDataAvailable() " + data + "\n");

      gAllData += data;
      var keyCreatedIndex = gAllData.indexOf("[GNUPG:] KEY_CREATED");
      if (keyCreatedIndex > 0) {
        gGeneratedKey = gAllData.substr(keyCreatedIndex);
        gGeneratedKey = gGeneratedKey.replace(/(.*\[GNUPG:\] KEY_CREATED . )([a-fA-F0-9]+)([\n\r].*)* /{{{remove-space-between-*-and-/-to-unconfuse-syntax-highlighting-editor}}}, "$2");
        gAllData = gAllData.replace(/\[GNUPG:\] KEY_CREATED . [a-fA-F0-9]+[\n\r]/, "");
      }
      gAllData = gAllData.replace(/[\r\n]*\[GNUPG:\] GOOD_PASSPHRASE/g, "").replace(/([\r\n]*\[GNUPG:\] PROGRESS primegen )(.)( \d+ \d+)/g, "$2");
      var progMeter = document.getElementById("keygenProgress");
      var progValue = Number(progMeter.value);
      progValue += (1 + (100 - progValue) / 200);
      if (progValue >= 95) progValue = 10;
      progMeter.setAttribute("value", progValue);
    }
  };

  try {
    gKeygenRequest = EnigmailKeyRing.generateKey(
      EnigmailData.convertFromUnicode(userName),
      "", // user id comment
      EnigmailData.convertFromUnicode(userEmail),
      expiryTime,
      keySize,
      keyType,
      EnigmailData.convertFromUnicode(passphrase),
      listener);
  } catch (ex) {
    EnigmailLog.DEBUG("enigmailKeygen.js: generateKey() failed with " + ex.toString() + "\n" + ex.stack + "\n");
  }

  if (!gKeygenRequest) {
    EnigAlert(EnigGetString("keyGenFailed"));
  }

  EnigmailLog.WRITE("enigmailKeygen.js: Start: gKeygenRequest = " + gKeygenRequest + "\n");
  */
}

function abortKeyGeneration() {
  gGeneratedKey = KEYGEN_CANCELLED;
  enigmailKeygenCloseRequest();
}

function enigmailKeygenCancel() {
  EnigmailLog.DEBUG("enigmailKeygen.js: Cancel\n");
  var closeWin = false;

  if (gKeygenRequest) {
    closeWin = EnigConfirm(EnigGetString("keyAbort"), EnigGetString("keyMan.button.generateKeyAbort"), EnigGetString("keyMan.button.generateKeyContinue"));
    if (closeWin) abortKeyGeneration();
  } else {
    closeWin = true;
  }

  if (closeWin) window.close();
}

function onNoExpiry() {
  var noExpiry = document.getElementById("noExpiry");
  var expireInput = document.getElementById("expireInput");
  var timeScale = document.getElementById("timeScale");

  expireInput.disabled = noExpiry.checked;
  timeScale.disabled = noExpiry.checked;
}


function queryISupArray(supportsArray, iid) {
  var result = [];
  var i;
  // Gecko > 20
  for (i = 0; i < supportsArray.length; i++) {
    result.push(supportsArray.queryElementAt(i, iid));
  }

  return result;
}

function getCurrentIdentity() {
  var item = gUserIdentityList.selectedItem;
  var identityKey = item.getAttribute('id');

  var identity = gAccountManager.getIdentity(identityKey);

  return identity;
}

function fillIdentityListPopup() {
  EnigmailLog.DEBUG("enigmailKeygen.js: fillIdentityListPopup\n");

  try {
    var idSupports = gAccountManager.allIdentities;
    var identities = queryISupArray(idSupports,
      Components.interfaces.nsIMsgIdentity);

    EnigmailLog.DEBUG("enigmailKeygen.js: fillIdentityListPopup: " + identities + "\n");

    // Default identity
    let defIdentity = EnigmailFuncs.getDefaultIdentity();

    EnigmailLog.DEBUG("enigmailKeygen.js: fillIdentityListPopup: default=" + defIdentity.key + "\n");

    var selected = false;
    for (var i = 0; i < identities.length; i++) {
      var identity = identities[i];

      EnigmailLog.DEBUG("id.valid=" + identity.valid + "\n");
      if (!identity.valid || !identity.email)
        continue;

      var serverSupports, inServer;
      // Gecko >= 20
      serverSupports = gAccountManager.getServersForIdentity(identity);
      if (serverSupports.length > 0) {
        inServer = serverSupports.queryElementAt(0, Components.interfaces.nsIMsgIncomingServer);
      }

      if (inServer) {
        var accountName = " - " + inServer.prettyName;

        EnigmailLog.DEBUG("enigmailKeygen.js: accountName=" + accountName + "\n");
        EnigmailLog.DEBUG("enigmailKeygen.js: email=" + identity.email + "\n");

        var item = document.createXULElement('menuitem');
        //      item.setAttribute('label', identity.identityName);
        item.setAttribute('label', identity.identityName + accountName);
        item.setAttribute('class', 'identity-popup-item');
        item.setAttribute('accountname', accountName);
        item.setAttribute('id', identity.key);
        item.setAttribute('email', identity.email);

        gUserIdentityListPopup.appendChild(item);

        if (!selected)
          gUserIdentityList.selectedItem = item;

        if (identity.key == defIdentity.key) {
          gUserIdentityList.selectedItem = item;
          selected = true;
        }
      }
    }
  }
  catch(ex) {
    EnigmailLog.writeException("enigmailKeygen.js: fillIdentityListPopup: exception\n", ex);
  }
}
