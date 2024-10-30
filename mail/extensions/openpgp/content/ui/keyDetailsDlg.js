/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

var { CommonUtils } = ChromeUtils.importESModule(
  "resource://services-common/utils.sys.mjs"
);
var { EnigmailFuncs } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/funcs.sys.mjs"
);
var { EnigmailKey } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/key.sys.mjs"
);
var { EnigmailKeyRing } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/keyRing.sys.mjs"
);
var { PgpSqliteDb2 } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/sqliteDb.sys.mjs"
);
var { KeyLookupHelper } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/keyLookupHelper.sys.mjs"
);
var { RNP, RnpPrivateKeyUnlockTracker } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/RNP.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  LoginHelper: "resource://gre/modules/LoginHelper.sys.mjs",
});

var l10n = new Localization(["messenger/openpgp/openpgp.ftl"], true);

var gModePersonal = false;

// This is the ID that was given to us as a parameter.
// Note that it might be the ID of a subkey.
var gKeyId = null;

var gUserId = null;
var gKeyList = null;
var gSigTree = null;

var gAllEmails = [];
var gOriginalAcceptedEmails = null;
var gAcceptedEmails = null;

var gHaveUnacceptedEmails = false;
var gFingerprint = "";
var gHasMissingSecret = false;

var gAcceptanceRadio = null;
var gPersonalRadio = null;

var gOriginalAcceptance;
var gOriginalPersonal;
var gUpdateAllowed = false;

const gAllEmailCheckboxes = [];
let gOkButton;

let gPrivateKeyTrackers = [];

window.addEventListener("DOMContentLoaded", onLoad);
window.addEventListener("unload", onUnload);

function onUnload() {
  releasePrivateKeys();
}

function releasePrivateKeys() {
  for (const tracker of gPrivateKeyTrackers) {
    tracker.release();
  }
  gPrivateKeyTrackers = [];
}

async function onLoad() {
  if (window.arguments[1]) {
    window.arguments[1].refresh = false;
  }

  gAcceptanceRadio = document.getElementById("acceptanceRadio");
  gPersonalRadio = document.getElementById("personalRadio");

  gKeyId = window.arguments[0].keyId;

  gOkButton = document.querySelector("dialog").getButton("accept");
  gOkButton.focus();

  await reloadData(true);

  const sepPassphraseEnabled =
    gModePersonal &&
    Services.prefs.getBoolPref("mail.openpgp.passphrases.enabled");
  document.getElementById("passphraseTab").hidden = !sepPassphraseEnabled;
  document.getElementById("passphrasePanel").hidden = !sepPassphraseEnabled;
  if (sepPassphraseEnabled) {
    await loadPassphraseProtection();
  }

  onAcceptanceChanged();
}

/***
 * Set the label text of a HTML element
 */
function setLabel(elementId, label) {
  const node = document.getElementById(elementId);
  node.setAttribute("value", label);
}

async function changeExpiry() {
  const keyObj = EnigmailKeyRing.getKeyById(gKeyId);
  if (!keyObj || !keyObj.secretAvailable) {
    return;
  }

  const args = {
    keyId: keyObj.keyId,
    modified: onDataModified,
  };

  // The keyDetailsDlg can be opened from different locations, some of which
  // don't belong to the Account Settings, therefore they won't have access to
  // the gSubDialog object.
  if (parent.gSubDialog) {
    parent.gSubDialog.open(
      "chrome://openpgp/content/ui/changeExpiryDlg.xhtml",
      undefined,
      args
    );
    return;
  }

  window.openDialog(
    "chrome://openpgp/content/ui/changeExpiryDlg.xhtml",
    "",
    "dialog,modal,centerscreen,resizable",
    args
  );
}

async function refreshOnline() {
  const keyObj = EnigmailKeyRing.getKeyById(gKeyId);
  if (!keyObj) {
    return;
  }

  const imported = await KeyLookupHelper.lookupAndImportByKeyID(
    "interactive-import",
    window,
    keyObj.fpr,
    true
  );
  if (imported) {
    onDataModified();
  }
}

async function loadPassphraseProtection() {
  const keyObj = EnigmailKeyRing.getKeyById(gKeyId);
  if (!keyObj || !keyObj.secretAvailable) {
    return;
  }

  const primaryKey = RnpPrivateKeyUnlockTracker.constructFromFingerprint(
    keyObj.fpr
  );
  primaryKey.setAllowPromptingUserForPassword(false);
  primaryKey.setAllowAutoUnlockWithCachedPasswords(false);
  const isSecretForPrimaryAvailable = primaryKey.available();
  let canUnlockSecretForPrimary = false;
  if (isSecretForPrimaryAvailable) {
    await primaryKey.unlock();
    canUnlockSecretForPrimary = primaryKey.isUnlocked();
    gPrivateKeyTrackers.push(primaryKey);
  }

  let countSubkeysWithSecretAvailable = 0;
  let countSubkeysCanAutoUnlock = 0;

  for (let i = 0; i < keyObj.subKeys.length; i++) {
    const subKey = RnpPrivateKeyUnlockTracker.constructFromFingerprint(
      keyObj.subKeys[i].fpr
    );
    subKey.setAllowPromptingUserForPassword(false);
    subKey.setAllowAutoUnlockWithCachedPasswords(false);
    if (subKey.available()) {
      ++countSubkeysWithSecretAvailable;
      await subKey.unlock();
      if (subKey.isUnlocked()) {
        countSubkeysCanAutoUnlock++;
      }
      gPrivateKeyTrackers.push(subKey);
    }
  }

  const userPassphraseMode = "user-passphrase";
  const usingPP = LoginHelper.isPrimaryPasswordSet();
  let protectionMode;

  // Could we use the automatic passphrase to unlock all secret keys for
  // which the key material is available?

  if (
    (!isSecretForPrimaryAvailable || canUnlockSecretForPrimary) &&
    countSubkeysWithSecretAvailable == countSubkeysCanAutoUnlock
  ) {
    protectionMode = usingPP ? "primary-password" : "unprotected";
  } else {
    protectionMode = userPassphraseMode;
  }

  // Strings used here:
  //   openpgp-passphrase-status-unprotected
  //   openpgp-passphrase-status-primary-password
  //   openpgp-passphrase-status-user-passphrase
  document.l10n.setAttributes(
    document.getElementById("passphraseStatus"),
    `openpgp-passphrase-status-${protectionMode}`
  );

  // Strings used here:
  //   openpgp-passphrase-instruction-unprotected
  //   openpgp-passphrase-instruction-primary-password
  //   openpgp-passphrase-instruction-user-passphrase
  document.l10n.setAttributes(
    document.getElementById("passphraseInstruction"),
    `openpgp-passphrase-instruction-${protectionMode}`
  );

  document.getElementById("unlockBox").hidden =
    protectionMode != userPassphraseMode;
  document.getElementById("lockBox").hidden =
    protectionMode == userPassphraseMode;
  document.getElementById("usePrimaryPassword").hidden = true;
  document.getElementById("removeProtection").hidden = true;

  document.l10n.setAttributes(
    document.getElementById("setPassphrase"),
    protectionMode == userPassphraseMode
      ? "openpgp-passphrase-change"
      : "openpgp-passphrase-set"
  );

  document.getElementById("passwordInput").value = "";
  document.getElementById("passwordConfirm").value = "";
}

async function unlock() {
  const pwCache = {
    passwords: [],
  };

  for (const tracker of gPrivateKeyTrackers) {
    tracker.setAllowPromptingUserForPassword(true);
    tracker.setAllowAutoUnlockWithCachedPasswords(true);
    tracker.setPasswordCache(pwCache);
    await tracker.unlock();
    if (!tracker.isUnlocked()) {
      return;
    }
  }

  document.l10n.setAttributes(
    document.getElementById("passphraseInstruction"),
    "openpgp-passphrase-unlocked"
  );
  document.getElementById("unlockBox").hidden = true;
  document.getElementById("lockBox").hidden = false;
  document.getElementById("passwordInput").value = "";
  document.getElementById("passwordConfirm").value = "";

  document.getElementById(
    LoginHelper.isPrimaryPasswordSet()
      ? "usePrimaryPassword"
      : "removeProtection"
  ).hidden = false;

  // Necessary to set the disabled status of the button
  onPasswordInput();
}

function onPasswordInput() {
  const pw1 = document.getElementById("passwordInput").value;
  const pw2 = document.getElementById("passwordConfirm").value;

  // Disable the button if the two passwords don't match, and enable it
  // if the passwords do match.
  const disabled = pw1 != pw2 || !pw1.length;

  document.getElementById("setPassphrase").disabled = disabled;
}

async function setPassphrase() {
  const pw = document.getElementById("passwordInput").value;

  for (const tracker of gPrivateKeyTrackers) {
    tracker.setPassphrase(pw);
  }
  await RNP.saveKeyRings();

  releasePrivateKeys();
  loadPassphraseProtection();
}

async function useAutoPassphrase() {
  for (const tracker of gPrivateKeyTrackers) {
    await tracker.setAutoPassphrase();
  }
  await RNP.saveKeyRings();

  releasePrivateKeys();
  loadPassphraseProtection();
}

function onAcceptanceChanged() {
  // The check for gAcceptedEmails.size is to handle an edge case.
  // If a key was previously accepted, for an email address that is
  // now revoked, and another email address has been added,
  // then the key can be marked as accepted without any accepted
  // email address.
  // In this scenario, we must allow the user to edit the accepted
  // email addresses, even if there's just one email address available.
  // Another scenario is a data inconsistency, with accepted key,
  // but no accepted email.

  const originalAccepted = isAccepted(gOriginalAcceptance);
  const wantAccepted = isAccepted(gAcceptanceRadio.value);

  const disableEmailsTab =
    (wantAccepted &&
      gAllEmails.length < 2 &&
      gAcceptedEmails.size != 0 &&
      (!originalAccepted || !gHaveUnacceptedEmails)) ||
    !wantAccepted;

  document.getElementById("emailAddressesTab").disabled = disableEmailsTab;
  document.getElementById("emailAddressesPanel").disabled = disableEmailsTab;

  setOkButtonState();
}

function onDataModified() {
  EnigmailKeyRing.clearCache();
  enableRefresh();
  reloadData(false);
}

function isAccepted(value) {
  return value == "unverified" || value == "verified";
}

async function reloadData(firstLoad) {
  gUserId = null;

  var treeChildren = document.getElementById("keyListChildren");

  // clean lists
  while (treeChildren.firstChild) {
    treeChildren.firstChild.remove();
  }

  const keyObj = EnigmailKeyRing.getKeyById(gKeyId);
  if (!keyObj) {
    return;
  }

  let acceptanceIntroText = "";
  let acceptanceVerificationText = "";

  if (keyObj.fpr) {
    gFingerprint = keyObj.fpr;
    setLabel("fingerprint", EnigmailKey.formatFpr(keyObj.fpr));
  }

  gSigTree = document.getElementById("signatures_tree");
  const signatures = await RNP.getKeyObjSignatures(keyObj, false);
  gSigTree.view = new SigListView(signatures);

  document.getElementById("subkeyList").view = new SubkeyListView(keyObj);

  gUserId = keyObj.userId;

  setLabel("keyId", "0x" + keyObj.keyId);
  setLabel("keyCreated", keyObj.created);

  const keyIsExpired =
    keyObj.effectiveExpiryTime &&
    keyObj.effectiveExpiryTime < Math.floor(Date.now() / 1000);

  let expiryInfo;
  let expireArgument = null;
  let expiryInfoKey = "";
  if (keyObj.keyTrust == "r") {
    expiryInfoKey = "key-revoked-simple";
  } else if (keyObj.keyTrust == "e" || keyIsExpired) {
    expiryInfoKey = "key-expired-date";
    expireArgument = keyObj.effectiveExpiry;
  } else if (keyObj.effectiveExpiry.length === 0) {
    expiryInfoKey = "key-does-not-expire";
  } else {
    expiryInfo = keyObj.effectiveExpiry;
  }
  if (expiryInfoKey) {
    expiryInfo = l10n.formatValueSync(expiryInfoKey, {
      keyExpiry: expireArgument,
    });
  }
  setLabel("keyExpiry", expiryInfo);

  gModePersonal = keyObj.secretAvailable;

  if (gModePersonal) {
    gPersonalRadio.removeAttribute("hidden");
    gAcceptanceRadio.setAttribute("hidden", "true");
    acceptanceIntroText = "key-accept-personal";
    const value = l10n.formatValueSync("key-type-pair");
    setLabel("keyType", value);

    gUpdateAllowed = true;
    if (firstLoad) {
      gOriginalPersonal = await PgpSqliteDb2.isAcceptedAsPersonalKey(
        keyObj.fpr
      );
      gPersonalRadio.value = gOriginalPersonal ? "personal" : "not_personal";
    }

    if (keyObj.keyTrust != "r") {
      document.getElementById("changeExpiryButton").removeAttribute("hidden");
    }
  } else {
    gPersonalRadio.setAttribute("hidden", "true");
    const value = l10n.formatValueSync("key-type-public");
    setLabel("keyType", value);

    const isStillValid = !(
      keyObj.keyTrust == "r" ||
      keyObj.keyTrust == "e" ||
      keyIsExpired
    );
    if (!isStillValid) {
      gAcceptanceRadio.setAttribute("hidden", "true");
      if (keyObj.keyTrust == "r") {
        acceptanceIntroText = "key-revoked-simple";
      } else if (keyObj.keyTrust == "e" || keyIsExpired) {
        acceptanceIntroText = "key-expired-simple";
      }
    } else {
      gAcceptanceRadio.removeAttribute("hidden");
      acceptanceIntroText = "key-do-you-accept";
      acceptanceVerificationText = "key-verification";
      gUpdateAllowed = true;

      //await RNP.calculateAcceptance(keyObj.keyId, null);

      const acceptanceResult = await PgpSqliteDb2.getFingerprintAcceptance(
        null,
        keyObj.fpr
      );

      if (firstLoad) {
        if (!acceptanceResult) {
          gOriginalAcceptance = "undecided";
        } else {
          gOriginalAcceptance = acceptanceResult;
        }
        gAcceptanceRadio.value = gOriginalAcceptance;
      }
    }

    if (firstLoad) {
      gAcceptedEmails = new Set();

      for (let i = 0; i < keyObj.userIds.length; i++) {
        if (keyObj.userIds[i].type === "uid") {
          const uidEmail = EnigmailFuncs.getEmailFromUserID(
            keyObj.userIds[i].userId
          );
          if (uidEmail) {
            gAllEmails.push(uidEmail);

            if (isAccepted(gOriginalAcceptance)) {
              const rv = {};
              await PgpSqliteDb2.getAcceptance(keyObj.fpr, uidEmail, rv);
              if (rv.emailDecided) {
                gAcceptedEmails.add(uidEmail);
              } else {
                gHaveUnacceptedEmails = true;
              }
            } else {
              // For not-yet-accepted keys, our default is to accept
              // all shown email addresses.
              gAcceptedEmails.add(uidEmail);
            }
          }
        }
      }

      // clone
      gOriginalAcceptedEmails = new Set(gAcceptedEmails);
    }
  }

  await createUidData(keyObj);

  if (acceptanceIntroText) {
    const acceptanceIntro = document.getElementById("acceptanceIntro");
    document.l10n.setAttributes(acceptanceIntro, acceptanceIntroText);
  }

  if (acceptanceVerificationText) {
    const acceptanceVerification = document.getElementById(
      "acceptanceVerification"
    );
    document.l10n.setAttributes(
      acceptanceVerification,
      acceptanceVerificationText,
      {
        addr: EnigmailFuncs.getEmailFromUserID(gUserId).toLowerCase(),
      }
    );
  }

  document.getElementById("key-detail-has-insecure").hidden =
    !keyObj.hasIgnoredAttributes;
}

function setOkButtonState() {
  const atLeastOneChecked = gAllEmailCheckboxes.some(c => c.checked);
  gOkButton.disabled = !atLeastOneChecked && isAccepted(gAcceptanceRadio.value);
}

async function createUidData(keyDetails) {
  var uidList = document.getElementById("userIds");
  while (uidList.firstChild) {
    uidList.firstChild.remove();
  }

  let primaryIdIndex = 0;

  for (let i = 0; i < keyDetails.userIds.length; i++) {
    if (keyDetails.userIds[i].type === "uid") {
      if (keyDetails.userIds[i].userId == keyDetails.userId) {
        primaryIdIndex = i;
        break;
      }
    }
  }

  for (let i = -1; i < keyDetails.userIds.length; i++) {
    // Handle entry primaryIdIndex first.

    let indexToUse;
    if (i == -1) {
      indexToUse = primaryIdIndex;
    } else if (i == primaryIdIndex) {
      // already handled when i was -1
      continue;
    } else {
      indexToUse = i;
    }

    if (keyDetails.userIds[indexToUse].type === "uid") {
      const uidStr = keyDetails.userIds[indexToUse].userId;

      /* - attempted code with <ul id="userIds">, doesn't work yet
      let item = document.createElement("li");

      let text = document.createElement("div");
      text.textContent = uidStr;
      item.append(text);

      let lf = document.createElement("br");
      item.append(lf);
      uidList.appendChild(item);
      */

      uidList.appendItem(uidStr);
    }
  }

  if (gModePersonal) {
    document.getElementById("emailAddressesTab").hidden = true;
  } else {
    const emailList = document.getElementById("addressesList");

    let atLeastOneChecked = false;
    const gUniqueEmails = new Set();

    for (let i = 0; i < gAllEmails.length; i++) {
      const email = gAllEmails[i];
      if (gUniqueEmails.has(email)) {
        continue;
      }
      gUniqueEmails.add(email);

      const checkbox = document.createXULElement("checkbox");

      checkbox.value = email;
      checkbox.setAttribute("label", email);

      checkbox.checked = gAcceptedEmails.has(email);
      if (checkbox.checked) {
        atLeastOneChecked = true;
      }

      checkbox.disabled = !gUpdateAllowed;
      checkbox.addEventListener("command", () => {
        setOkButtonState();
      });

      emailList.appendChild(checkbox);
      gAllEmailCheckboxes.push(checkbox);
    }

    // Usually, if we have only one email address available,
    // we want to hide the tab.
    // There are edge cases - if we have a data inconsistency
    // (key accepted, but no email accepted), then we must show,
    // to allow the user to repair.

    document.getElementById("emailAddressesTab").hidden =
      gUniqueEmails.size < 2 && atLeastOneChecked;
  }
}

function setAttr(attribute, value) {
  var elem = document.getElementById(attribute);
  if (elem) {
    elem.value = value;
  }
}

function enableRefresh() {
  if (window.arguments[1]) {
    window.arguments[1].refresh = true;
  }

  window.arguments[0].modified();
}

// ------------------ onCommand Functions  -----------------

/*
function manageUids() {
  let keyObj = EnigmailKeyRing.getKeyById(gKeyId);

  var inputObj = {
    keyId: keyObj.keyId,
    ownKey: keyObj.secretAvailable,
  };

  var resultObj = {
    refresh: false,
  };
  window.openDialog(
    "chrome://openpgp/content/ui/enigmailManageUidDlg.xhtml",
    "",
    "dialog,modal,centerscreen,resizable=yes",
    inputObj,
    resultObj
  );
  if (resultObj.refresh) {
    enableRefresh();
    reloadData(false);
  }
}
*/

function genRevocationCert() {
  throw new Error("Not implemented");

  /*
  var defaultFileName = userId.replace(/[<>]/g, "");
  defaultFileName += " (0x" + keyId + ") rev.asc";
  var outFile = EnigFilePicker("XXXsaveRevokeCertAs",
    "", true, "*.asc",
    defaultFileName, ["XXXasciiArmorFile", "*.asc"];
  if (!outFile) return -1;

  return 0;
  */
}

/**
 * @param {object[]} signatures - list of signature objects
 *   signatures.userId {string} - User ID.
 *   signatures.uidLabel {string} - UID label.
 *   signatures.created {string} - Creation date as printable string.
 *   signatures.fpr {string} - Fingerprint.
 *   signatures.sigList {Object[]} - Objects
 *   signatures.sigList.userId
 *   signatures.sigList.created
 *   signatures.sigList.signerKeyId
 *   signatures.sigList.sigType
 *   signatures.sigList.sigKnown
 */
function SigListView(signatures) {
  this.keyObj = [];

  for (const sig of signatures) {
    const k = {
      uid: sig.userId,
      keyId: sig.keyId,
      created: sig.created,
      expanded: true,
      sigList: [],
    };

    for (const s of sig.sigList) {
      k.sigList.push({
        uid: s.userId,
        created: s.created,
        keyId: s.signerKeyId,
        sigType: s.sigType,
      });
    }
    this.keyObj.push(k);
  }

  this.prevKeyObj = null;
  this.prevRow = -1;

  this.updateRowCount();
}

/**
 * @implements {nsITreeView}
 */
SigListView.prototype = {
  updateRowCount() {
    let rc = 0;

    for (const i in this.keyObj) {
      rc += this.keyObj[i].expanded ? this.keyObj[i].sigList.length + 1 : 1;
    }

    this.rowCount = rc;
  },

  setLastKeyObj(keyObj, row) {
    this.prevKeyObj = keyObj;
    this.prevRow = row;
    return keyObj;
  },

  getSigAtIndex(row) {
    if (this.lastIndex == row) {
      return this.lastKeyObj;
    }

    let j = 0,
      l = 0;

    for (const i in this.keyObj) {
      if (j === row) {
        return this.setLastKeyObj(this.keyObj[i], row);
      }
      j++;

      if (this.keyObj[i].expanded) {
        l = this.keyObj[i].sigList.length;

        if (j + l >= row && row - j < l) {
          return this.setLastKeyObj(this.keyObj[i].sigList[row - j], row);
        }
        j += l;
      }
    }

    return null;
  },

  getCellText(row, column) {
    const s = this.getSigAtIndex(row);

    if (s) {
      switch (column.id) {
        case "sig_uid_col":
          return s.uid;
        case "sig_keyid_col":
          return "0x" + s.keyId;
        case "sig_created_col":
          return s.created;
      }
    }

    return "";
  },

  setTree(treebox) {
    this.treebox = treebox;
  },

  isContainer(row) {
    const s = this.getSigAtIndex(row);
    return "sigList" in s;
  },

  isSeparator() {
    return false;
  },

  isSorted() {
    return false;
  },

  getLevel(row) {
    const s = this.getSigAtIndex(row);
    return "sigList" in s ? 0 : 1;
  },

  cycleHeader() {},

  getImageSrc() {
    return null;
  },

  getRowProperties() {},

  getCellProperties() {
    return "";
  },

  canDrop() {
    return false;
  },

  getColumnProperties() {},

  isContainerEmpty() {
    return false;
  },

  getParentIndex() {
    return -1;
  },

  getProgressMode() {},

  isContainerOpen(row) {
    const s = this.getSigAtIndex(row);
    return s.expanded;
  },

  isSelectable() {
    return true;
  },

  toggleOpenState(row) {
    const s = this.getSigAtIndex(row);
    s.expanded = !s.expanded;
    const r = this.rowCount;
    this.updateRowCount();
    gSigTree.rowCountChanged(row, this.rowCount - r);
  },
};

function createSubkeyItem(mainKeyIsSecret, subkey, usagetext) {
  // Get expiry state of this subkey
  let expire;
  if (subkey.keyTrust === "r") {
    expire = l10n.formatValueSync("key-valid-revoked");
  } else if (subkey.expiryTime === 0) {
    expire = l10n.formatValueSync("key-expiry-never");
  } else {
    expire = subkey.expiry;
  }

  let subkeyType = "";

  if (mainKeyIsSecret && (!subkey.secretAvailable || !subkey.secretMaterial)) {
    subkeyType = "(!) ";
    gHasMissingSecret = true;
  }
  if (subkey.type === "pub") {
    subkeyType += l10n.formatValueSync("key-type-primary");
  } else {
    subkeyType += l10n.formatValueSync("key-type-subkey");
  }

  const keyObj = {
    keyType: subkeyType,
    keyId: "0x" + subkey.keyId,
    algo: subkey.algoSym,
    size: subkey.keySize,
    creationDate: subkey.created,
    expiry: expire,
    usage: usagetext,
  };

  return keyObj;
}

function SubkeyListView(keyObj) {
  gHasMissingSecret = false;

  this.subkeys = [];
  this.rowCount = keyObj.subKeys.length + 1;
  this.subkeys.push(
    createSubkeyItem(
      keyObj.secretAvailable,
      keyObj,
      keyObj.getUsageText(keyObj.keyUseFor)
    )
  );

  for (let i = 0; i < keyObj.subKeys.length; i++) {
    this.subkeys.push(
      createSubkeyItem(
        keyObj.secretAvailable,
        keyObj.subKeys[i],
        keyObj.getUsageText(keyObj.subKeys[i].keyUseFor)
      )
    );
  }

  document.getElementById("legendMissingSecret").hidden = !gHasMissingSecret;
}

// implements nsITreeView
SubkeyListView.prototype = {
  getCellText(row, column) {
    const s = this.subkeys[row];

    if (s) {
      switch (column.id) {
        case "keyTypeCol":
          return s.keyType;
        case "keyIdCol":
          return s.keyId;
        case "algoCol":
          return s.algo;
        case "sizeCol":
          return s.size;
        case "createdCol":
          return s.creationDate;
        case "expiryCol":
          return s.expiry;
        case "keyUsageCol":
          return s.usage;
      }
    }

    return "";
  },

  setTree(treebox) {
    this.treebox = treebox;
  },

  isContainer() {
    return false;
  },

  isSeparator() {
    return false;
  },

  isSorted() {
    return false;
  },

  getLevel() {
    return 0;
  },

  cycleHeader() {},

  getImageSrc() {
    return null;
  },

  getRowProperties() {},

  getCellProperties() {
    return "";
  },

  canDrop() {
    return false;
  },

  getColumnProperties() {},

  isContainerEmpty() {
    return false;
  },

  getParentIndex() {
    return -1;
  },

  getProgressMode() {},

  isContainerOpen() {
    return false;
  },

  isSelectable() {
    return true;
  },

  toggleOpenState() {},
};

function sigHandleDblClick() {}

document.addEventListener("dialogaccept", async function (event) {
  // Prevent the closing of the dialog to wait until all the SQLite operations
  // have properly been executed.
  event.preventDefault();

  // The user's personal OpenPGP key acceptance was edited.
  if (gModePersonal) {
    if (gUpdateAllowed && gPersonalRadio.value != gOriginalPersonal) {
      if (gPersonalRadio.value == "personal") {
        await PgpSqliteDb2.acceptAsPersonalKey(gFingerprint);
      } else {
        await PgpSqliteDb2.deletePersonalKeyAcceptance(gFingerprint);
      }

      enableRefresh();
    }
    window.close();
    return;
  }

  // If the recipient's key hasn't been revoked or invalidated, and the
  // signature acceptance was edited.
  if (gUpdateAllowed) {
    const selectedEmails = new Set();
    for (const checkbox of gAllEmailCheckboxes) {
      if (checkbox.checked) {
        selectedEmails.add(checkbox.value);
      }
    }

    if (
      gAcceptanceRadio.value != gOriginalAcceptance ||
      !CommonUtils.setEqual(gAcceptedEmails, selectedEmails)
    ) {
      await PgpSqliteDb2.updateAcceptance(
        gFingerprint,
        [...selectedEmails],
        gAcceptanceRadio.value
      );

      enableRefresh();
    }
  }

  window.close();
});
