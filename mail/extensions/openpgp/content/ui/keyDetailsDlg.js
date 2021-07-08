/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// from enigmailCommon.js:
/* global GetEnigmailSvc */

// from enigmailKeyManager.js:
/* global l10n */

"use strict";

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { EnigmailFuncs } = ChromeUtils.import(
  "chrome://openpgp/content/modules/funcs.jsm"
);
var { EnigmailLog } = ChromeUtils.import(
  "chrome://openpgp/content/modules/log.jsm"
);
var { EnigmailKey } = ChromeUtils.import(
  "chrome://openpgp/content/modules/key.jsm"
);
var { EnigmailKeyRing } = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyRing.jsm"
);
var { PgpSqliteDb2 } = ChromeUtils.import(
  "chrome://openpgp/content/modules/sqliteDb.jsm"
);
var { EnigmailDialog } = ChromeUtils.import(
  "chrome://openpgp/content/modules/dialog.jsm"
);

var gModePersonal = false;

var gKeyId = null;
var gUserId = null;
var gKeyList = null;
var gSigTree = null;

var gAllEmails = [];
var gFingerprint = "";

var gAcceptanceRadio = null;
var gPersonalRadio = null;

var gOriginalAcceptance;
var gOriginalPersonal;
var gUpdateAllowed = false;

async function onLoad() {
  if (window.arguments[1]) {
    window.arguments[1].refresh = false;
  }

  gAcceptanceRadio = document.getElementById("acceptanceRadio");
  gPersonalRadio = document.getElementById("personalRadio");

  gKeyId = window.arguments[0].keyId;

  let accept = document.querySelector("dialog").getButton("accept");
  accept.focus();

  await reloadData(true);

  resizeDialog();
}

/***
 * Set the label text of a HTML element
 */
function setLabel(elementId, label) {
  let node = document.getElementById(elementId);
  node.setAttribute("value", label);
}

async function changeExpiry() {
  let keyObj = EnigmailKeyRing.getKeyById(gKeyId);
  if (!keyObj || !keyObj.secretAvailable) {
    return;
  }

  if (!keyObj.iSimpleOneSubkeySameExpiry()) {
    Services.prompt.alert(
      null,
      document.title,
      await document.l10n.formatValue("openpgp-cannot-change-expiry")
    );
    return;
  }

  let args = {
    keyId: gKeyId,
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

function onDataModified() {
  EnigmailKeyRing.clearCache();
  enableRefresh();
  reloadData(false);
}

async function reloadData(firstLoad) {
  var enigmailSvc = GetEnigmailSvc();
  if (!enigmailSvc) {
    throw new Error("GetEnigmailSvc failed");
  }

  gUserId = null;

  var treeChildren = document.getElementById("keyListChildren");
  var uidList = document.getElementById("additionalUid");

  // clean lists
  while (treeChildren.firstChild) {
    treeChildren.firstChild.remove();
  }
  while (uidList.firstChild) {
    uidList.firstChild.remove();
  }

  let keyObj = EnigmailKeyRing.getKeyById(gKeyId);
  if (!keyObj) {
    return;
  }

  let acceptanceIntro1Text = "";
  let acceptanceIntro2Text = "";

  if (keyObj.fpr) {
    gFingerprint = keyObj.fpr;
    setLabel("fingerprint", EnigmailKey.formatFpr(keyObj.fpr));
  }

  if (keyObj.hasSubUserIds()) {
    document.getElementById("alsoknown").removeAttribute("collapsed");
    createUidData(uidList, keyObj);
  } else {
    document.getElementById("alsoknown").setAttribute("collapsed", "true");
  }

  if (keyObj.signatures) {
    let sigListViewObj = new SigListView(keyObj);
    gSigTree = document.getElementById("signatures_tree");
    gSigTree.view = sigListViewObj;
  }

  let subkeyListViewObj = new SubkeyListView(keyObj);
  document.getElementById("subkeyList").view = subkeyListViewObj;

  gUserId = keyObj.userId;

  let userEmail = EnigmailFuncs.getEmailFromUserID(keyObj.userId);
  if (userEmail) {
    gAllEmails.push(userEmail);
  }

  setLabel("userId", gUserId);
  setLabel("keyCreated", keyObj.created);

  let keyIsExpired =
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
    acceptanceIntro1Text = "key-accept-personal";
    acceptanceIntro2Text = "key-personal-warning";
    let value = l10n.formatValueSync("key-type-pair");
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
    let value = l10n.formatValueSync("key-type-public");
    setLabel("keyType", value);

    let isStillValid = !(
      keyObj.keyTrust == "r" ||
      keyObj.keyTrust == "e" ||
      keyIsExpired
    );
    if (!isStillValid) {
      gAcceptanceRadio.setAttribute("hidden", "true");
      if (keyObj.keyTrust == "r") {
        acceptanceIntro1Text = "key-revoked-simple";
      } else if (keyObj.keyTrust == "e" || keyIsExpired) {
        acceptanceIntro1Text = "key-expired-simple";
      }
    } else {
      gAcceptanceRadio.removeAttribute("hidden");
      acceptanceIntro1Text = "key-do-you-accept";
      acceptanceIntro2Text = "key-accept-warning";
      gUpdateAllowed = true;

      //await RNP.calculateAcceptance(keyObj.keyId, null);

      let acceptanceResult = {};
      await PgpSqliteDb2.getFingerprintAcceptance(
        null,
        keyObj.fpr,
        acceptanceResult
      );

      if (firstLoad) {
        if (
          "fingerprintAcceptance" in acceptanceResult &&
          acceptanceResult.fingerprintAcceptance.length &&
          acceptanceResult.fingerprintAcceptance != "undecided"
        ) {
          gOriginalAcceptance = acceptanceResult.fingerprintAcceptance;
        } else {
          gOriginalAcceptance = "undecided";
        }
        gAcceptanceRadio.value = gOriginalAcceptance;
      }
    }
  }
  if (acceptanceIntro1Text) {
    let acceptanceIntro1 = document.getElementById("acceptanceIntro1");
    document.l10n.setAttributes(acceptanceIntro1, acceptanceIntro1Text);
  }

  if (acceptanceIntro2Text) {
    let acceptanceIntro2 = document.getElementById("acceptanceIntro2");
    document.l10n.setAttributes(acceptanceIntro2, acceptanceIntro2Text);
  }

  // Resize the dialog only if the data was changed since the first load.
  if (!firstLoad) {
    resizeDialog();
  }
}

function createUidData(listNode, keyDetails) {
  for (let i = 1; i < keyDetails.userIds.length; i++) {
    if (keyDetails.userIds[i].type === "uid") {
      let item = listNode.appendItem(keyDetails.userIds[i].userId);
      item.setAttribute("label", keyDetails.userIds[i].userId);
      if ("dre".search(keyDetails.userIds[i].keyTrust) >= 0) {
        item.setAttribute("class", "enigmailDisabled");
      }

      let uidEmail = EnigmailFuncs.getEmailFromUserID(
        keyDetails.userIds[i].userId
      );
      if (uidEmail) {
        gAllEmails.push(uidEmail);
      }
    }
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
function signKey() {
  if (EnigmailWindows.signKey(window, gUserId, gKeyId)) {
    enableRefresh();
    reloadData(false);
  }
}
*/

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

  var enigmailSvc = GetEnigmailSvc();
  if (!enigmailSvc)
    return -1;

  return 0;
  */
}

function SigListView(keyObj) {
  this.keyObj = [];

  let sigObj = keyObj.signatures;
  for (let i in sigObj) {
    let k = {
      uid: sigObj[i].userId,
      keyId: sigObj[i].keyId,
      created: sigObj[i].created,
      expanded: true,
      sigList: [],
    };

    for (let j in sigObj[i].sigList) {
      let s = sigObj[i].sigList[j];
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

// implements nsITreeView
SigListView.prototype = {
  updateRowCount() {
    let rc = 0;

    for (let i in this.keyObj) {
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

    for (let i in this.keyObj) {
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
    let s = this.getSigAtIndex(row);

    if (s) {
      switch (column.id) {
        case "sig_uid_col":
          return s.uid;
        case "sig_keyid_col":
          return s.keyId;
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
    let s = this.getSigAtIndex(row);
    return "sigList" in s;
  },

  isSeparator(row) {
    return false;
  },

  isSorted() {
    return false;
  },

  getLevel(row) {
    let s = this.getSigAtIndex(row);
    return "sigList" in s ? 0 : 1;
  },

  cycleHeader(col, elem) {},

  getImageSrc(row, col) {
    return null;
  },

  getRowProperties(row, props) {},

  getCellProperties(row, col) {
    if (col.id === "sig_keyid_col") {
      return "fixedWidthFont";
    }

    return "";
  },

  canDrop(row, orientation, data) {
    return false;
  },

  getColumnProperties(colid, col, props) {},

  isContainerEmpty(row) {
    return false;
  },

  getParentIndex(idx) {
    return -1;
  },

  getProgressMode(row, col) {},

  isContainerOpen(row) {
    let s = this.getSigAtIndex(row);
    return s.expanded;
  },

  isSelectable(row, col) {
    return true;
  },

  toggleOpenState(row) {
    let s = this.getSigAtIndex(row);
    s.expanded = !s.expanded;
    let r = this.rowCount;
    this.updateRowCount();
    gSigTree.rowCountChanged(row, this.rowCount - r);
  },
};

function createSubkeyItem(subkey) {
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
  if (subkey.secretAvailable && !subkey.secretMaterial) {
    subkeyType = "(!) ";
  }
  if (subkey.type === "pub") {
    subkeyType += l10n.formatValueSync("key-type-primary");
  } else {
    subkeyType += l10n.formatValueSync("key-type-subkey");
  }

  let usagetext = "";
  let i;
  //  e = encrypt
  //  s = sign
  //  c = certify
  //  a = authentication
  //  Capital Letters are ignored, as these reflect summary properties of a key

  var singlecode = "";
  for (i = 0; i < subkey.keyUseFor.length; i++) {
    singlecode = subkey.keyUseFor.substr(i, 1);
    switch (singlecode) {
      case "e":
        if (usagetext.length > 0) {
          usagetext = usagetext + ", ";
        }
        usagetext = usagetext + l10n.formatValueSync("key-usage-encrypt");
        break;
      case "s":
        if (usagetext.length > 0) {
          usagetext = usagetext + ", ";
        }
        usagetext = usagetext + l10n.formatValueSync("key-usage-sign");
        break;
      case "c":
        if (usagetext.length > 0) {
          usagetext = usagetext + ", ";
        }
        usagetext = usagetext + l10n.formatValueSync("key-usage-certify");
        break;
      case "a":
        if (usagetext.length > 0) {
          usagetext = usagetext + ", ";
        }
        usagetext =
          usagetext + l10n.formatValueSync("key-usage-authentication");
        break;
    } // * case *
  } // * for *

  let keyObj = {
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
  this.subkeys = [];
  this.rowCount = keyObj.subKeys.length + 1;
  this.subkeys.push(createSubkeyItem(keyObj));

  for (let i = 0; i < keyObj.subKeys.length; i++) {
    this.subkeys.push(createSubkeyItem(keyObj.subKeys[i]));
  }
}

// implements nsITreeView
SubkeyListView.prototype = {
  getCellText(row, column) {
    let s = this.subkeys[row];

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

  isContainer(row) {
    return false;
  },

  isSeparator(row) {
    return false;
  },

  isSorted() {
    return false;
  },

  getLevel(row) {
    return 0;
  },

  cycleHeader(col, elem) {},

  getImageSrc(row, col) {
    return null;
  },

  getRowProperties(row, props) {},

  getCellProperties(row, col) {
    return "";
  },

  canDrop(row, orientation, data) {
    return false;
  },

  getColumnProperties(colid, col, props) {},

  isContainerEmpty(row) {
    return false;
  },

  getParentIndex(idx) {
    return -1;
  },

  getProgressMode(row, col) {},

  isContainerOpen(row) {
    return false;
  },

  isSelectable(row, col) {
    return true;
  },

  toggleOpenState(row) {},
};

function sigHandleDblClick(event) {}

document.addEventListener("dialogaccept", async function(event) {
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
  if (gUpdateAllowed && gAcceptanceRadio.value != gOriginalAcceptance) {
    await PgpSqliteDb2.updateAcceptance(
      gFingerprint,
      gAllEmails,
      gAcceptanceRadio.value
    );

    enableRefresh();
  }

  window.close();
});

/**
 * Resize the dialog to account for the newly visible sections.
 */
function resizeDialog() {
  // Timeout to trigger the dialog resize after all the data have been loaded on
  // first run.
  setTimeout(() => {
    // Check if the dialog was opened as a SubDialog.
    if (parent.gSubDialog) {
      parent.gSubDialog._topDialog.resizeVertically();
    } else {
      sizeToContent();
    }
  }, 230);
}
