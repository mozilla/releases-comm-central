/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// Uses: chrome://openpgp/content/ui/enigmailCommon.js

"use strict";

// modules
/* global EnigmailData: false, EnigmailLog: false, EnigmailLocale: false, EnigmailGpg: false, EnigmailKeyEditor: false */
/* global EnigmailOS: false, EnigmailPrefs: false, EnigmailApp: false, EnigmailKeyRing: false */
/* global EnigmailDialog: false, EnigmailFuncs: false */

// from enigmailCommon.js:
/* global EnigGetWindowOptions: false, EnigConfirm: false, EnigGetString: false, GetEnigmailSvc: false */
/* global EnigLongAlert: false, EnigAlert: false, EnigInitCommon: false, ENIG_ACCOUNT_MANAGER_CONTRACTID: false */
/* global EnigGetPref: false, EnigSetPref: false, EnigSavePrefs: false, EnigFilePicker: false, EnigGetFilePath: false */
/* global EnigmailWindows: false, EnigCreateRevokeCert: false */

// Initialize enigmailCommon
EnigInitCommon("enigmailKeygen");

var gAccountManager = Cc[ENIG_ACCOUNT_MANAGER_CONTRACTID].getService(
  Ci.nsIMsgAccountManager
);

var EnigmailCryptoAPI = ChromeUtils.import(
  "chrome://openpgp/content/modules/cryptoAPI.jsm"
).EnigmailCryptoAPI;
var { EnigmailFiles } = ChromeUtils.import(
  "chrome://openpgp/content/modules/files.jsm"
);
var OpenPGPMasterpass = ChromeUtils.import(
  "chrome://openpgp/content/modules/masterpass.jsm"
).OpenPGPMasterpass;
var { RNP } = ChromeUtils.import("chrome://openpgp/content/modules/rnp.jsm");

var gUserIdentityList;
var gUserIdentityListPopup;

var gKeygenRequest;
var gAllData = "";
var gGeneratedKey = null;
var gUsedId;

const KEYGEN_CANCELLED = "cancelled";
const DEFAULT_FILE_PERMS = 0o600;

let revocationFilePrefix1 =
  "This is a revocation certificate for the OpenPGP key:";
let revocationFilePrefix2 = `
A revocation certificate is a kind of "kill switch" to publicly
declare that a key shall no longer be used.  It is not possible
to retract such a revocation certificate once it has been published.

Use it to revoke this key in case of a secret key compromise, or loss of
the secret key, or loss of passphrase of the secret key.

To avoid an accidental use of this file, a colon has been inserted
before the 5 dashes below.  Remove this colon with a text editor
before importing and publishing this revocation certificate.

:`;

function enigmailKeygenLoad() {
  EnigmailLog.DEBUG("enigmailKeygen.js: Load\n");

  gUserIdentityList = document.getElementById("userIdentity");
  gUserIdentityListPopup = document.getElementById("userIdentityPopup");

  //if (EnigmailGpg.getGpgFeature("supports-ecc-keys"))
  let eccElem = document.getElementById("keyType_ecc");
  eccElem.removeAttribute("hidden");
  updateKeySizeSel(eccElem);
  //document.getElementById("keyType").selectedItem = eccElem;

  if (gUserIdentityListPopup) {
    fillIdentityListPopup();
  }
  gUserIdentityList.focus();

  // restore safe setting, which you ALWAYS explicitly have to overrule,
  // if you don't want them:
  // - specify expiry date
  var noExpiry = document.getElementById("noExpiry");
  noExpiry.checked = false;

  var enigmailSvc = GetEnigmailSvc();
  if (!enigmailSvc) {
    EnigAlert(EnigGetString("accessError"));
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
    closeWin = EnigConfirm(
      EnigGetString("keyAbort"),
      EnigGetString("keyMan.button.generateKeyAbort"),
      EnigGetString("keyMan.button.generateKeyContinue")
    );
  }
  if (closeWin) {
    abortKeyGeneration();
  }
  return closeWin;
}

function enigmailKeygenUnload() {
  EnigmailLog.DEBUG("enigmailKeygen.js: Unload\n");

  enigmailKeygenCloseRequest();
}

/**
 *  create a copy of the revokation cert at a user defined location
 */
function saveRevCert(inputKeyFile, keyId, uid, resolve, reject) {
  let defaultFileName = uid.replace(/[\\/<>]/g, "");
  defaultFileName += " (0x" + keyId + ") rev.asc";

  let outFile = EnigFilePicker(
    EnigGetString("saveRevokeCertAs"),
    "",
    true,
    "*.asc",
    defaultFileName,
    [EnigGetString("asciiArmorFile"), "*.asc"]
  );

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

function enigmailKeygenStart() {
  EnigmailLog.DEBUG("enigmailKeygen.js: Start\n");

  if (gKeygenRequest) {
    let req = gKeygenRequest.QueryInterface(Ci.nsIRequest);
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
    let newId = null;
    const cApi = EnigmailCryptoAPI();
    newId = cApi.sync(
      cApi.genKey(
        idString,
        keyType,
        keySize,
        expiryTime,
        OpenPGPMasterpass.retrieveOpenPGPPassword()
      )
    );
    console.log("created new key with id: " + newId);
    gGeneratedKey = newId;
  } catch (ex) {
    console.log(ex);
  }

  EnigmailWindows.keyManReloadKeys();

  gKeygenRequest = null;

  var progMeter = document.getElementById("keygenProgress");
  progMeter.setAttribute("value", 100);

  if (!gGeneratedKey || gGeneratedKey == KEYGEN_CANCELLED) {
    EnigAlert(EnigGetString("keyGenFailed"));
  } else {
    console.debug("saving new key id " + gGeneratedKey);
    curId.setCharAttribute("openpgp_key_id", gGeneratedKey);
    EnigSavePrefs();
  }

  closeAndReset();

  let rev = RNP.getNewRevocation("0x" + gGeneratedKey);
  if (!rev) {
    throw new Error("failed to obtain revocation for key " + gGeneratedKey);
  }

  let revFull =
    revocationFilePrefix1 +
    "\n\n" +
    gGeneratedKey +
    "\n" +
    revocationFilePrefix2 +
    rev;

  let revFile = EnigmailApp.getProfileDirectory();
  revFile.append("0x" + gGeneratedKey + "_rev.asc");

  // create a revokation cert in the TB profile directoy
  EnigmailFiles.writeFileContents(revFile, revFull, DEFAULT_FILE_PERMS);
}

function abortKeyGeneration() {
  gGeneratedKey = KEYGEN_CANCELLED;
  enigmailKeygenCloseRequest();
}

function enigmailKeygenCancel() {
  EnigmailLog.DEBUG("enigmailKeygen.js: Cancel\n");
  var closeWin = false;

  if (gKeygenRequest) {
    closeWin = EnigConfirm(
      EnigGetString("keyAbort"),
      EnigGetString("keyMan.button.generateKeyAbort"),
      EnigGetString("keyMan.button.generateKeyContinue")
    );
    if (closeWin) {
      abortKeyGeneration();
    }
  } else {
    closeWin = true;
  }

  if (closeWin) {
    window.close();
  }
}

function onNoExpiry() {
  var noExpiry = document.getElementById("noExpiry");
  var expireInput = document.getElementById("expireInput");
  var timeScale = document.getElementById("timeScale");

  expireInput.disabled = noExpiry.checked;
  timeScale.disabled = noExpiry.checked;
}

function getCurrentIdentity() {
  var item = gUserIdentityList.selectedItem;
  var identityKey = item.getAttribute("id");

  var identity = gAccountManager.getIdentity(identityKey);

  return identity;
}

function fillIdentityListPopup() {
  EnigmailLog.DEBUG("enigmailKeygen.js: fillIdentityListPopup\n");

  try {
    var identities = gAccountManager.allIdentities;

    EnigmailLog.DEBUG(
      "enigmailKeygen.js: fillIdentityListPopup: " + identities + "\n"
    );

    // Default identity
    let defIdentity = EnigmailFuncs.getDefaultIdentity();

    EnigmailLog.DEBUG(
      "enigmailKeygen.js: fillIdentityListPopup: default=" +
        defIdentity.key +
        "\n"
    );

    var selected = false;
    for (var i = 0; i < identities.length; i++) {
      var identity = identities[i];

      EnigmailLog.DEBUG("id.valid=" + identity.valid + "\n");
      if (!identity.valid || !identity.email) {
        continue;
      }

      var serverSupports, inServer;
      // Gecko >= 20
      serverSupports = gAccountManager.getServersForIdentity(identity);
      if (serverSupports.length > 0) {
        inServer = serverSupports.queryElementAt(0, Ci.nsIMsgIncomingServer);
      }

      if (inServer) {
        var accountName = " - " + inServer.prettyName;

        EnigmailLog.DEBUG(
          "enigmailKeygen.js: accountName=" + accountName + "\n"
        );
        EnigmailLog.DEBUG("enigmailKeygen.js: email=" + identity.email + "\n");

        var item = document.createXULElement("menuitem");
        //      item.setAttribute('label', identity.identityName);
        item.setAttribute("label", identity.identityName + accountName);
        item.setAttribute("class", "identity-popup-item");
        item.setAttribute("accountname", accountName);
        item.setAttribute("id", identity.key);
        item.setAttribute("email", identity.email);

        gUserIdentityListPopup.appendChild(item);

        if (!selected) {
          gUserIdentityList.selectedItem = item;
        }

        if (identity.key == defIdentity.key) {
          gUserIdentityList.selectedItem = item;
          selected = true;
        }
      }
    }
  } catch (ex) {
    EnigmailLog.writeException(
      "enigmailKeygen.js: fillIdentityListPopup: exception\n",
      ex
    );
  }
}
