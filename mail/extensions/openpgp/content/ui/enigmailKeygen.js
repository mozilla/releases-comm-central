/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// Uses: chrome://openpgp/content/ui/enigmailCommon.js

"use strict";

// modules
/* global EnigmailData: false, EnigmailLog: false, EnigmailGpg: false, EnigmailKeyEditor: false */
/* global EnigmailOS: false, EnigmailPrefs: false, EnigmailKeyRing: false */
/* global EnigmailDialog: false, EnigmailFuncs: false */

// from enigmailCommon.js:
/* global EnigGetWindowOptions: false, EnigConfirm: false, GetEnigmailSvc: false */
/* global EnigLongAlert: false, EnigAlert: false */
/* global EnigGetPref: false, EnigSetPref: false, EnigSavePrefs: false, EnigFilePicker: false, EnigGetFilePath: false */
/* global EnigmailWindows: false, EnigCreateRevokeCert: false */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var { EnigmailCryptoAPI } = ChromeUtils.import(
  "chrome://openpgp/content/modules/cryptoAPI.jsm"
);
var { EnigmailFiles } = ChromeUtils.import(
  "chrome://openpgp/content/modules/files.jsm"
);
var { OpenPGPMasterpass } = ChromeUtils.import(
  "chrome://openpgp/content/modules/masterpass.jsm"
);
var { RNP } = ChromeUtils.import("chrome://openpgp/content/modules/RNP.jsm");

var l10n = new Localization(["messenger/openpgp/openpgp.ftl"], true);

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
A revocation certificate is kind of a "kill switch" to publicly
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

  updateKeySizeSel();

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
    throw new Error("GetEnigmailSvc failed");
  }
}

function updateKeySizeSel() {
  if (document.getElementById("keyType").value == "ECC") {
    document.getElementById("keySize").setAttribute("disabled", "true");
  } else {
    document.getElementById("keySize").removeAttribute("disabled");
  }
}

function enigmailOnClose() {
  var closeWin = true;
  if (gKeygenRequest) {
    closeWin = EnigConfirm(
      l10n.formatValueSync("key-abort"),
      l10n.formatValueSync("key-man-button-generate-key-abort"),
      l10n.formatValueSync("key-man-button-generate-key-continue")
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
async function saveRevCert(inputKeyFile, keyId, uid, resolve, reject) {
  let defaultFileName = uid.replace(/[\\/<>]/g, "");
  defaultFileName += " (0x" + keyId + ") rev.asc";

  let [title, fileType] = await document.l10n.formatValues([
    { id: "save-revoke-cert-as" },
    { id: "ascii-armor-file" },
  ]);

  let outFile = EnigFilePicker(title, "", true, "*.asc", defaultFileName, [
    fileType,
    "*.asc",
  ]);

  if (outFile) {
    try {
      inputKeyFile.copyToFollowingLinks(outFile.parent, outFile.leafName);
      EnigmailDialog.info(
        window,
        await document.l10n.formatValue("revoke-cert-ok")
      );
    } catch (ex) {
      EnigAlert(await document.l10n.formatValue("revoke-cert-failed"));
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

async function enigmailKeygenStart() {
  EnigmailLog.DEBUG("enigmailKeygen.js: Start\n");

  if (gKeygenRequest) {
    let req = gKeygenRequest.QueryInterface(Ci.nsIRequest);
    if (req.isPending()) {
      EnigmailDialog.info(window, await document.l10n.formatValue("gen-going"));
      return;
    }
  }

  gGeneratedKey = null;
  gAllData = "";

  var enigmailSvc = GetEnigmailSvc();
  if (!enigmailSvc) {
    throw new Error("GetEnigmailSvc failed");
  }

  var noExpiry = document.getElementById("noExpiry");
  var expireInput = document.getElementById("expireInput");
  var timeScale = document.getElementById("timeScale");

  var expiryTime = 0;
  if (!noExpiry.checked) {
    expiryTime = Number(expireInput.value) * Number(timeScale.value);
    if (expiryTime > 36500) {
      EnigmailDialog.info(
        window,
        await document.l10n.formatValue("expiry-too-long")
      );
      return;
    }
    if (expiryTime <= 0) {
      EnigmailDialog.info(
        window,
        await document.l10n.formatValue("expiry-too-short")
      );
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
    EnigmailDialog.info(
      window,
      await document.l10n.formatValue("keygen-missing-user-name")
    );
    return;
  }

  var idString = userName;

  idString += " <" + userEmail + ">";

  let [confirmMsg, confirmBtn] = await document.l10n.formatValues([
    { id: "key-confirm", args: { id: idString } },
    { id: "key-man-button-generate-key" },
  ]);

  if (!EnigConfirm(confirmMsg, confirmBtn)) {
    return;
  }

  var cApi;
  try {
    let newId = null;
    cApi = EnigmailCryptoAPI();
    let pass = await OpenPGPMasterpass.retrieveOpenPGPPassword();
    newId = cApi.sync(
      cApi.genKey(idString, keyType, keySize, expiryTime, pass)
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
    throw new Error("key generation failed");
  } else {
    console.debug("saving new key id " + gGeneratedKey);
    curId.setUnicharAttribute("openpgp_key_id", gGeneratedKey);
    EnigSavePrefs();
  }

  closeAndReset();

  let rev = cApi.sync(cApi.getNewRevocation("0x" + gGeneratedKey));
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

  let revFile = Services.dirsvc.get("ProfD", Ci.nsIFile);
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
      l10n.formatValueSync("key-abort"),
      l10n.formatValueSync("key-man-button-generate-key-abort"),
      l10n.formatValueSync("key-man-button-generate-key-continue")
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

  var identity = MailServices.accounts.getIdentity(identityKey);

  return identity;
}

function fillIdentityListPopup() {
  EnigmailLog.DEBUG("enigmailKeygen.js: fillIdentityListPopup\n");

  try {
    var identities = MailServices.accounts.allIdentities;

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
    for (let identity of identities) {
      EnigmailLog.DEBUG("id.valid=" + identity.valid + "\n");
      if (!identity.valid || !identity.email) {
        continue;
      }

      let servers = MailServices.accounts.getServersForIdentity(identity);
      if (servers.length == 0) {
        continue;
      }
      let accountName = " - " + servers[0].prettyName;

      EnigmailLog.DEBUG("enigmailKeygen.js: accountName=" + accountName + "\n");
      EnigmailLog.DEBUG("enigmailKeygen.js: email=" + identity.email + "\n");

      let item = document.createXULElement("menuitem");
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
  } catch (ex) {
    EnigmailLog.writeException(
      "enigmailKeygen.js: fillIdentityListPopup: exception\n",
      ex
    );
  }
}
